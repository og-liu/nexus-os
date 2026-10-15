import { describe, expect, it } from "vitest";
import { createConnection } from "./db";
import { createUser, findCredentialsByUsernameKey, findUserById } from "./user";

describe("用户创建与查询", () => {
  it("创建后能按 id 与规范化用户名查到", () => {
    const db = createConnection(":memory:");
    const user = createUser(db, {
      username: "Alice",
      usernameKey: "alice",
      passwordHash: "scrypt$16384$8$1$c2FsdA==$aGFzaA==",
      now: 1000,
    });

    expect(user).not.toBeNull();
    expect(user?.username).toBe("Alice"); // 展示用保留原始大小写
    expect(user?.createdAt).toBe(1000);
    expect(findUserById(db, user!.id)?.username).toBe("Alice");
  });

  it("用户名重复返回 null，而不是抛异常", () => {
    const db = createConnection(":memory:");
    const input = {
      username: "alice",
      usernameKey: "alice",
      passwordHash: "scrypt$16384$8$1$c2FsdA==$aGFzaA==",
    };
    expect(createUser(db, input)).not.toBeNull();
    expect(createUser(db, input)).toBeNull();
  });

  it("大小写不同但归一化后相同，也算重复（Alice 与 alice 是同一个账号）", () => {
    const db = createConnection(":memory:");
    createUser(db, {
      username: "Alice",
      usernameKey: "alice",
      passwordHash: "scrypt$16384$8$1$c2FsdA==$aGFzaA==",
    });
    expect(
      createUser(db, {
        username: "ALICE",
        usernameKey: "alice",
        passwordHash: "scrypt$16384$8$1$c2FsdA==$aGFzaA==",
      }),
    ).toBeNull();
  });

  it("登录用的查询会带上密码哈希，用户对象本身不带", () => {
    const db = createConnection(":memory:");
    const user = createUser(db, {
      username: "alice",
      usernameKey: "alice",
      passwordHash: "scrypt$16384$8$1$c2FsdA==$aGFzaA==",
    });

    const record = findCredentialsByUsernameKey(db, "alice");
    expect(record?.passwordHash).toBe("scrypt$16384$8$1$c2FsdA==$aGFzaA==");
    expect(record?.user).not.toHaveProperty("passwordHash");
    expect(user).not.toHaveProperty("passwordHash");
  });

  it("查不到的用户返回 null", () => {
    const db = createConnection(":memory:");
    expect(findCredentialsByUsernameKey(db, "nobody")).toBeNull();
    expect(findUserById(db, 999)).toBeNull();
  });
});
