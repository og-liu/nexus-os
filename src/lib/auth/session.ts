import { createHash, randomBytes } from "node:crypto";
import type { Db } from "./db";
import type { User } from "./user";

/**
 * 会话记录（数据库会话）。
 *
 * 分工要点：**这个文件只碰数据库，不碰 cookie**。
 * 读写 cookie 需要请求上下文（`next/headers`），一旦混进来，单元测试就必须伪造请求环境。
 * 请求级的封装在 `current-user.ts`，这里全部是可以拿内存库直接驱动的纯函数。
 */

export const SESSION_COOKIE_NAME = "nexus_session";

/** 30 天。cookie 的 maxAge 必须与它同源，否则会出现「莫名其妙掉线」。 */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * cookie 里放的是 token 原文，数据库里放的是它的 sha256。
 *
 * 这样即使数据库泄露，攻击者也拿不到可以直接使用的凭证；而校验只需把 cookie 原文
 * 再算一次 sha256 去查，等价性完全没有损失。sha256 不需要加盐——原文是 32 字节随机数，
 * 没有字典可查。
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface IssuedSession {
  /** 只应交出去写进 cookie，不要落库、不要打日志。 */
  token: string;
  expiresAt: number;
}

export function createSessionRecord(
  db: Db,
  userId: number,
  now = Date.now(),
): IssuedSession {
  // 32 字节随机 = 256 位，穷举不现实
  const token = randomBytes(32).toString("base64url");
  const expiresAt = now + SESSION_TTL_MS;

  db.prepare(
    "INSERT INTO auth_sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
  ).run(hashToken(token), userId, now, expiresAt);

  // 顺手清理：过期会话没有任何用处，留着只会让表越长越大
  deleteExpiredSessions(db, now);

  return { token, expiresAt };
}

/**
 * 用 cookie 里的 token 换当前用户。无效、过期、被篡改（哈希对不上）一律返回 null。
 *
 * 注意这里**没有**「先查哈希、再单独查用户」的两步：token 哈希是唯一键，
 * 一次 join 就能拿到用户，省一次查询也少一处出错的地方。
 */
export function findSessionUser(
  db: Db,
  token: string,
  now = Date.now(),
): User | null {
  const row = db
    .prepare(
      `SELECT u.id AS id, u.username AS username, u.created_at AS created_at, s.expires_at AS expires_at
       FROM auth_sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`,
    )
    .get(hashToken(token)) as
    | { id: number; username: string; created_at: number; expires_at: number }
    | undefined;

  if (!row) return null;

  if (row.expires_at <= now) {
    deleteSessionRecord(db, token);
    return null;
  }

  return { id: row.id, username: row.username, createdAt: row.created_at };
}

/** 删除一条会话（登出）。返回是否真的删掉了行。 */
export function deleteSessionRecord(db: Db, token: string): boolean {
  const result = db
    .prepare("DELETE FROM auth_sessions WHERE token_hash = ?")
    .run(hashToken(token));
  return result.changes > 0;
}

export function deleteSessionsForUser(db: Db, userId: number): number {
  return db.prepare("DELETE FROM auth_sessions WHERE user_id = ?").run(userId).changes;
}

export function deleteExpiredSessions(db: Db, now = Date.now()): number {
  return db.prepare("DELETE FROM auth_sessions WHERE expires_at <= ?").run(now).changes;
}
