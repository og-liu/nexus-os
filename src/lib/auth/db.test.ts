import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { createConnection, initSchema, type Db } from "./db";

/** 造一个「老版本」的库：登录会话表还叫 `sessions`，里面已经有行。 */
function openLegacyDatabase(): Db {
  const conn = new Database(":memory:");
  conn.pragma("foreign_keys = ON");
  conn.exec(`
    CREATE TABLE users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT    NOT NULL,
      username_key  TEXT    NOT NULL UNIQUE,
      password_hash TEXT    NOT NULL,
      created_at    INTEGER NOT NULL
    );

    CREATE TABLE sessions (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      token_hash TEXT    NOT NULL UNIQUE,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );

    CREATE INDEX idx_sessions_user_id ON sessions(user_id);
  `);
  return conn;
}

function tableNames(conn: Db): string[] {
  return (
    conn
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all() as { name: string }[]
  ).map((row) => row.name);
}

function indexNames(conn: Db): string[] {
  return (
    conn
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index'")
      .all() as { name: string }[]
  ).map((row) => row.name);
}

function seedLegacyRows(conn: Db): void {
  conn
    .prepare(
      "INSERT INTO users (username, username_key, password_hash, created_at) VALUES (?, ?, ?, ?)",
    )
    .run("alice", "alice", "hash", 1);
  conn
    .prepare(
      "INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
    )
    .run("token-hash", 1, 1, 2);
}

describe("表名迁移：sessions → auth_sessions", () => {
  it("老库会被改名，行一行不丢", () => {
    const conn = openLegacyDatabase();
    seedLegacyRows(conn);

    initSchema(conn);

    expect(tableNames(conn)).toContain("auth_sessions");
    expect(tableNames(conn)).not.toContain("sessions");
    expect(
      conn.prepare("SELECT COUNT(*) AS count FROM auth_sessions").get(),
    ).toEqual({ count: 1 });
  });

  it("索引按新名字重建，旧索引名不残留", () => {
    const conn = openLegacyDatabase();
    initSchema(conn);

    expect(indexNames(conn)).toContain("idx_auth_sessions_user_id");
    expect(indexNames(conn)).not.toContain("idx_sessions_user_id");
  });

  it("改名不会弄坏外键：删用户仍然级联删会话", () => {
    const conn = openLegacyDatabase();
    seedLegacyRows(conn);
    initSchema(conn);

    conn.prepare("DELETE FROM users WHERE id = 1").run();
    expect(
      conn.prepare("SELECT COUNT(*) AS count FROM auth_sessions").get(),
    ).toEqual({ count: 0 });
  });

  it("重复执行不出错，也不会重复改名或丢行", () => {
    const conn = openLegacyDatabase();
    seedLegacyRows(conn);

    initSchema(conn);
    initSchema(conn);
    initSchema(conn);

    expect(tableNames(conn)).toContain("auth_sessions");
    expect(
      conn.prepare("SELECT COUNT(*) AS count FROM auth_sessions").get(),
    ).toEqual({ count: 1 });
  });

  it("全新的库直接就是新表名，不需要迁移", () => {
    const conn = createConnection(":memory:");
    expect(tableNames(conn)).toContain("auth_sessions");
    expect(tableNames(conn)).not.toContain("sessions");
  });
});
