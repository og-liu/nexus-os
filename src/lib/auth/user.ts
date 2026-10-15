import type { Db } from "./db";

/** 对外的用户表示。**刻意不含 `passwordHash`**：哈希只在登录校验那一步被取出，不随用户对象流转。 */
export interface User {
  id: number;
  username: string;
  createdAt: number;
}

/** 数据库里的行。列名是 snake_case，转换只在下面这几个函数里发生。 */
interface UserRow {
  id: number;
  username: string;
  username_key: string;
  password_hash: string;
  created_at: number;
}

const SELECT_COLUMNS = "id, username, username_key, password_hash, created_at";

function toUser(row: UserRow): User {
  return { id: row.id, username: row.username, createdAt: row.created_at };
}

export function findUserById(db: Db, id: number): User | null {
  const row = db
    .prepare(`SELECT ${SELECT_COLUMNS} FROM users WHERE id = ?`)
    .get(id) as UserRow | undefined;
  return row ? toUser(row) : null;
}

/**
 * 按归一化用户名取「用户 + 密码哈希」。仅登录校验使用。
 */
export function findCredentialsByUsernameKey(
  db: Db,
  usernameKey: string,
): { user: User; passwordHash: string } | null {
  const row = db
    .prepare(`SELECT ${SELECT_COLUMNS} FROM users WHERE username_key = ?`)
    .get(usernameKey) as UserRow | undefined;
  if (!row) return null;
  return { user: toUser(row), passwordHash: row.password_hash };
}

export interface NewUser {
  username: string;
  usernameKey: string;
  passwordHash: string;
  now?: number;
}

/**
 * 建用户。**用户名已被占用时返回 null**，不抛异常。
 *
 * 唯一性判断交给数据库的 UNIQUE 约束，而不是「先查一次再插入」：
 * 两次请求同时注册同一个用户名时，先查后插会双双通过检查，然后一个插入失败变成 500。
 * 直接插入、捕获约束冲突，才是原子的。
 */
export function createUser(db: Db, input: NewUser): User | null {
  const now = input.now ?? Date.now();
  try {
    const result = db
      .prepare(
        "INSERT INTO users (username, username_key, password_hash, created_at) VALUES (?, ?, ?, ?)",
      )
      .run(input.username, input.usernameKey, input.passwordHash, now);
    return {
      id: Number(result.lastInsertRowid),
      username: input.username,
      createdAt: now,
    };
  } catch (error) {
    if (isUniqueViolation(error)) return null;
    throw error;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string" &&
    (error as { code: string }).code.startsWith("SQLITE_CONSTRAINT")
  );
}
