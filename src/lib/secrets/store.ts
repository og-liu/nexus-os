import type { Db } from "@/lib/auth/db";
import { MasterKeyMissingError, SecretDecryptError, decryptSecret, encryptSecret, readMasterKey } from "./crypto";

/**
 * 用户密钥的读写（《功能/用户密钥》§三）。
 *
 * 分工：这里只碰数据库 + 调用加解密，请求上下文与鉴权在 Server Action 里。
 * **所有函数都带 `userId`**：一个用户读不到另一个用户的 Key，这一层就是边界。
 */

interface SecretRow {
  ciphertext: string;
}

/** 这个用户已经配了哪些 provider（只给名字，不碰密文）。 */
export function listConfiguredProviders(db: Db, userId: number): Set<string> {
  const rows = db
    .prepare("SELECT provider FROM user_secrets WHERE user_id = ?")
    .all(userId) as { provider: string }[];
  return new Set(rows.map((row) => row.provider));
}

/** 这个用户配了没有——**只查行，不解密**。用作「没配就压根不让用」的门槛。 */
export function hasSecret(db: Db, userId: number, provider: string): boolean {
  const row = db
    .prepare("SELECT 1 AS found FROM user_secrets WHERE user_id = ? AND provider = ?")
    .get(userId, provider) as { found: number } | undefined;
  return row !== undefined;
}

/**
 * 读一个 Key 的明文。
 *
 * - 没配 → `null`（调用方据此提示「去设置里填」，**不是错误**）
 * - 配了但主密钥缺失 → `MasterKeyMissingError`（配置问题）
 * - 配了但解不开 → `SecretDecryptError`（密文被改过 / 换过主密钥）
 *
 * 先查行、再解密：没配 Key 的用户不该因为服务器没配 `ENCRYPTION_KEY` 而看到
 * 一句和 Key 无关的报错。
 */
export function readSecret(db: Db, userId: number, provider: string): string | null {
  const row = db
    .prepare("SELECT ciphertext FROM user_secrets WHERE user_id = ? AND provider = ?")
    .get(userId, provider) as SecretRow | undefined;
  if (!row) return null;

  const key = readMasterKey();
  if (!key) throw new MasterKeyMissingError();

  return decryptSecret(row.ciphertext, key).trim();
}

/** 写入或覆盖一个 Key（同一个 provider 只留一条）。 */
export function saveSecret(
  db: Db,
  userId: number,
  provider: string,
  plaintext: string,
  now = Date.now(),
): void {
  const key = readMasterKey();
  if (!key) throw new MasterKeyMissingError();

  db.prepare(
    `INSERT INTO user_secrets (user_id, provider, ciphertext, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, provider) DO UPDATE SET
       ciphertext = excluded.ciphertext,
       updated_at = excluded.updated_at`,
  ).run(userId, provider, encryptSecret(plaintext.trim(), key), now, now);
}

/** 删掉一个 Key。没配过时什么也不做（幂等）。 */
export function deleteSecret(db: Db, userId: number, provider: string): void {
  db.prepare("DELETE FROM user_secrets WHERE user_id = ? AND provider = ?").run(userId, provider);
}

export { MasterKeyMissingError, SecretDecryptError };
