"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/current-user";
import { getDb } from "@/lib/auth/db";
import { MasterKeyMissingError } from "@/lib/secrets/crypto";
import { findSecretProvider } from "@/lib/secrets/providers";
import { deleteSecret, saveSecret } from "@/lib/secrets/store";
import { verifySecret } from "@/lib/secrets/verify";

/**
 * 用户密钥的 Server Actions（《功能/用户密钥》§四）。
 *
 * 两条必须记住的前提（与其它 action 一致）：
 * 1. **Server Action 是公开 HTTP 端点**：`provider` 与 `value` 都可能在浏览器外被改造，
 *    所以这里要自己校验 provider 在注册表里、value 非空且不长到离谱；
 * 2. **`user_id` 只从 `requireUser()` 取**，客户端传什么都不看——否则任何人都能往别人账号下写 Key。
 */

export type SecretActionResult = { ok: true } | { ok: false; error: string };

/** Key 的合理长度上限。真实 Key 都在 200 字符内，留足余量但不给「塞一个文件进来」的机会。 */
const MAX_SECRET_LENGTH = 4096;

export async function saveSecretAction(
  providerId: string,
  value: string,
): Promise<SecretActionResult> {
  const user = await requireUser();

  const provider = findSecretProvider(providerId);
  if (!provider) return { ok: false, error: "不认识的密钥类型" };

  const trimmed = value.trim();
  if (!trimmed) return { ok: false, error: "Key 不能为空" };
  if (trimmed.length > MAX_SECRET_LENGTH) return { ok: false, error: "这个 Key 太长了" };

  // 验活：保存的这一刻就问上游「这 Key 能用吗」，错的当场拒。
  // 不验的话，乱码也能存进去——抖音下载的缓存全站共享，于是「乱码 Key + 别人的缓存」
  // 照样能下成功，用户以为校验形同虚设（2026-11-02 踩过）。
  // `unknown`（网络/超时/上游 5xx）放行：那是「我们没法判断」，不是「这 Key 是坏的」。
  const check = await verifySecret(provider.id, trimmed);
  if (check.status === "invalid") return { ok: false, error: check.message };

  try {
    saveSecret(getDb(), user.id, provider.id, trimmed);
  } catch (error) {
    if (error instanceof MasterKeyMissingError) {
      return { ok: false, error: error.message };
    }
    return { ok: false, error: "保存失败了，稍后再试" };
  }

  // 保存后页面要切成「已配置」，否则数据库里有了、界面上还是「未配置」
  revalidatePath("/settings");
  return { ok: true };
}

export async function clearSecretAction(providerId: string): Promise<SecretActionResult> {
  const user = await requireUser();

  const provider = findSecretProvider(providerId);
  if (!provider) return { ok: false, error: "不认识的密钥类型" };

  deleteSecret(getDb(), user.id, provider.id);
  revalidatePath("/settings");
  return { ok: true };
}
