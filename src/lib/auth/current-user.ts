import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "./db";
import {
  SESSION_COOKIE_NAME,
  SESSION_TTL_MS,
  createSessionRecord,
  deleteSessionRecord,
  findSessionUser,
} from "./session";
import type { User } from "./user";

/**
 * 请求级封装：读写 cookie，把「会话」变成「当前用户」。
 *
 * 这里所有函数都依赖 `next/headers`，只能在服务端请求上下文里调用
 * （Server Component / Server Action / Route Handler）。
 * 纯数据库逻辑在 `session.ts`，那里才是单元测试的落点。
 */

/**
 * `secure` 由环境变量控制，**不能写死 true**——两边的取值是相反的：
 * - 本地是 HTTP：必须 false（或不设）。cookie 一旦带 Secure，浏览器会直接丢弃它，
 *   表现为「登录成功，一刷新就掉线」，而且没有任何报错。
 * - 线上 HTTPS 已上线：`shared/.env.production` 里设为 true（2026-10-29 实测核对）。
 *
 * 判定写成 `=== "true"` 而不是 truthy 判断：环境变量永远是字符串，
 * `"false"` 在布尔语境里是 **true**，`Boolean(process.env.X)` 会把「关」判成「开」。
 */
function sessionCookieOptions() {
  return {
    httpOnly: true, // 浏览器 JS 读不到，XSS 也偷不走
    sameSite: "lax" as const, // 跨站请求不携带，挡掉大部分 CSRF
    secure: process.env.SESSION_COOKIE_SECURE === "true",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000), // 与库中 expires_at 保持一致
  };
}

/** 建会话：写库 + 写 cookie。只能在 Server Action / Route Handler 里调用（Server Component 不能写 cookie）。 */
export async function issueSession(userId: number): Promise<void> {
  const { token } = createSessionRecord(getDb(), userId);
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, token, sessionCookieOptions());
}

/**
 * 取当前用户，没有则 null。
 *
 * 用 `cache()` 包一层：同一次请求里可能有好几处要问「你是谁」，
 * 缓存后这次请求只查一次库（缓存的生命周期就是这一次请求，不会串到别人身上）。
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return findSessionUser(getDb(), token);
});

/**
 * 受保护页面调用它：没有会话就跳登录页。
 *
 * **这就是真正的门**。不靠 `proxy.ts`（Next 16 里原名 middleware）：它跑在 Edge 运行时，
 * 读不了本地 SQLite；官方文档也明确说它只适合做「乐观检查」，不是授权方案。
 * 检查写在这里、贴着要保护的数据，才是拦得住的。
 */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** 登录页 / 注册页调用它：已经有会话就别再看表单了。 */
export async function requireGuest(): Promise<void> {
  const user = await getCurrentUser();
  if (user) redirect("/");
}

/** 登出：删库里的行 + 删 cookie。只删 cookie 的话，被复制走的 token 仍然有效。 */
export async function endSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    deleteSessionRecord(getDb(), token);
    store.delete(SESSION_COOKIE_NAME);
  }
}
