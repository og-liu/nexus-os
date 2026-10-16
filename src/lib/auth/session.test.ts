import { describe, expect, it } from "vitest";
import type { Db } from "./db";
import { createConnection } from "./db";
import {
  SESSION_TTL_MS,
  createSessionRecord,
  deleteSessionRecord,
  deleteSessionsForUser,
  findSessionUser,
  hashToken,
} from "./session";
import { createUser } from "./user";

/** 内存库：测试绝不碰磁盘上的真实数据文件。 */
function openTestDb(): Db {
  return createConnection(":memory:");
}

function insertUser(db: Db, username = "alice") {
  const user = createUser(db, {
    username,
    usernameKey: username.toLowerCase(),
    passwordHash: "scrypt$16384$8$1$c2FsdA==$aGFzaA==",
  });
  if (!user) throw new Error("测试用户创建失败");
  return user;
}

function countSessions(db: Db): number {
  const row = db.prepare("SELECT COUNT(*) AS count FROM auth_sessions").get() as {
    count: number;
  };
  return row.count;
}

describe("会话生命周期", () => {
  it("新建会话后能用 cookie 里的 token 换到用户", () => {
    const db = openTestDb();
    const user = insertUser(db);
    const { token } = createSessionRecord(db, user.id);

    const current = findSessionUser(db, token);
    expect(current?.id).toBe(user.id);
    expect(current?.username).toBe("alice");
  });

  it("数据库里存的是哈希，不是 token 原文", () => {
    const db = openTestDb();
    const user = insertUser(db);
    const { token } = createSessionRecord(db, user.id);

    const row = db.prepare("SELECT token_hash FROM auth_sessions").get() as {
      token_hash: string;
    };
    expect(row.token_hash).toBe(hashToken(token));
    expect(row.token_hash).not.toBe(token);
  });

  it("token 被改动一个字符即失效", () => {
    const db = openTestDb();
    const user = insertUser(db);
    const { token } = createSessionRecord(db, user.id);

    const tampered = `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`;
    expect(findSessionUser(db, tampered)).toBeNull();
  });

  it("不存在的 token 返回 null", () => {
    const db = openTestDb();
    expect(findSessionUser(db, "完全没有这个 token")).toBeNull();
  });

  it("过期会话查不到，并且那一行会被顺手删掉", () => {
    const db = openTestDb();
    const user = insertUser(db);
    const now = Date.now();
    const { token } = createSessionRecord(db, user.id, now);

    expect(findSessionUser(db, token, now + SESSION_TTL_MS - 1)?.id).toBe(user.id);
    expect(findSessionUser(db, token, now + SESSION_TTL_MS + 1)).toBeNull();
    expect(countSessions(db)).toBe(0);
  });

  it("登出删除对应行，其它会话不受影响", () => {
    const db = openTestDb();
    const user = insertUser(db);
    const first = createSessionRecord(db, user.id);
    const second = createSessionRecord(db, user.id);

    expect(deleteSessionRecord(db, first.token)).toBe(true);
    expect(deleteSessionRecord(db, first.token)).toBe(false); // 重复登出不再报错
    expect(countSessions(db)).toBe(1);
    expect(findSessionUser(db, second.token)?.id).toBe(user.id);
  });

  it("删用户时会话跟着删（外键 CASCADE 真的生效）", () => {
    const db = openTestDb();
    const user = insertUser(db);
    createSessionRecord(db, user.id);
    createSessionRecord(db, user.id);

    db.prepare("DELETE FROM users WHERE id = ?").run(user.id);
    expect(countSessions(db)).toBe(0);
  });

  it("按用户批量清理会话", () => {
    const db = openTestDb();
    const alice = insertUser(db, "alice");
    const bob = insertUser(db, "bob");
    createSessionRecord(db, alice.id);
    createSessionRecord(db, alice.id);
    createSessionRecord(db, bob.id);

    expect(deleteSessionsForUser(db, alice.id)).toBe(2);
    expect(countSessions(db)).toBe(1);
  });

  it("建会话时会顺手清掉已过期的行", () => {
    const db = openTestDb();
    const user = insertUser(db);
    const now = Date.now();
    createSessionRecord(db, user.id, now - SESSION_TTL_MS - 1000); // 已经过期
    expect(countSessions(db)).toBe(1);

    createSessionRecord(db, user.id, now); // 新会话触发清理
    expect(countSessions(db)).toBe(1);
  });
});
