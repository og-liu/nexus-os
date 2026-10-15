"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { endSession, issueSession } from "./current-user";
import { getDb } from "./db";
import { hashPassword, verifyPassword } from "./password";
import {
  checkLock,
  clearFailures,
  describeWait,
  recordFailure,
} from "./rate-limit";
import { createUser, findCredentialsByUsernameKey } from "./user";
import {
  normalizeUsername,
  validateLoginInput,
  validateRegistration,
  type FieldErrors,
} from "./validate";

/**
 * Server Actions：表单能做的三件事——注册、登录、登出。
 *
 * 两个必须记住的前提：
 * 1. **Server Action 是一个公开的 HTTP 端点**。不经过页面、直接构造请求也能调。
 *    所以校验必须在服务端再做一遍，浏览器里的提示只是体验，不是防线。
 * 2. `'use server'` 文件里**只能导出 async 函数**（导出常量、对象会在构建期报错）。
 */

export interface AuthFormState {
  /** 整个表单的失败原因（如「用户名或密码不正确」）。 */
  formError?: string;
  /** 单个字段的失败原因。 */
  fieldErrors?: FieldErrors;
  /** 回填的用户名。**密码不回填**——这是有意的。 */
  username?: string;
}

function readText(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value : "";
}

/**
 * 一个「陪跑」哈希：用户名不存在时拿它走一遍校验。
 *
 * 如果用户名不存在就提前返回，失败响应会明显更快，攻击者仅凭响应时间就能判断
 * 某个账号是否存在——统一提示文案挡不住这种泄漏，把耗时补齐才挡得住。
 */
let dummyHash: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword("nexus-os-dummy-password");
  return dummyHash;
}

/** 取客户端 IP，用于按 IP 限流。Nginx 反代会写入 X-Forwarded-For。 */
async function clientIp(): Promise<string> {
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? "unknown";
  return headerList.get("x-real-ip") ?? "unknown";
}

export async function registerAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const usernameRaw = readText(formData, "username");
  const password = readText(formData, "password");
  const confirmPassword = readText(formData, "confirmPassword");

  const parsed = validateRegistration({
    username: usernameRaw,
    password,
    confirmPassword,
  });
  if (!parsed.ok) {
    return { fieldErrors: parsed.fieldErrors, username: usernameRaw };
  }

  const db = getDb();
  const passwordHash = await hashPassword(parsed.password);
  const user = createUser(db, {
    username: parsed.username,
    usernameKey: normalizeUsername(parsed.username),
    passwordHash,
  });

  if (!user) {
    // 唯一键冲突 —— 大概率是「用户名已被使用」，也可能是自己连点两次提交
    return {
      formError: "该用户名已被占用",
      fieldErrors: { username: "换一个用户名试试" },
      username: usernameRaw,
    };
  }

  await issueSession(user.id);
  // redirect() 靠抛出一个特殊错误实现跳转，**必须放在 try/catch 之外**，
  // 否则会被 catch 吞掉，表现为「点了没反应」。
  redirect("/");
}

export async function loginAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const usernameRaw = readText(formData, "username");
  const password = readText(formData, "password");

  const fieldErrors = validateLoginInput({ username: usernameRaw, password });
  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors, username: usernameRaw };
  }

  const usernameKey = normalizeUsername(usernameRaw);
  const ip = await clientIp();
  const userKey = `user:${usernameKey}`;
  const ipKey = `ip:${ip}`;
  const now = Date.now();

  // 限流在验密码之前查：被锁时连哈希计算都不做，否则限流只是「慢速暴力破解」
  for (const key of [userKey, ipKey]) {
    const status = checkLock(key, now);
    if (status.locked) {
      return {
        formError: `尝试次数过多，请 ${describeWait(status.retryAfterMs)}后再试`,
        username: usernameRaw,
      };
    }
  }

  const db = getDb();
  const record = findCredentialsByUsernameKey(db, usernameKey);
  const passwordHash = record?.passwordHash ?? (await getDummyHash());
  const passwordOk = await verifyPassword(password, passwordHash);

  if (!record || !passwordOk) {
    recordFailure(userKey, now);
    recordFailure(ipKey, now);
    // 「用户不存在」与「密码错误」给**完全一样**的提示：
    // 分开提示等于免费送出一个用户名探测器。
    return { formError: "用户名或密码不正确", username: usernameRaw };
  }

  clearFailures(userKey);
  clearFailures(ipKey);
  await issueSession(record.user.id);
  redirect("/");
}

/** 登出。绑在 `<form action={logoutAction}>` 上，一个按钮就够，不需要客户端 JS。 */
export async function logoutAction(): Promise<void> {
  await endSession();
  redirect("/login");
}
