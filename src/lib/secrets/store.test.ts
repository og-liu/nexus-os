import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createConnection } from "@/lib/auth/db";
import { MasterKeyMissingError, SecretDecryptError } from "./crypto";
import { deleteSecret, hasSecret, listConfiguredProviders, readSecret, saveSecret } from "./store";

const KEY_HEX = "c".repeat(64);

function makeDb() {
  const db = createConnection(":memory:");
  db.prepare("INSERT INTO users (username, username_key, password_hash, created_at) VALUES (?,?,?,?)").run(
    "u1",
    "u1",
    "hash",
    1,
  );
  db.prepare("INSERT INTO users (username, username_key, password_hash, created_at) VALUES (?,?,?,?)").run(
    "u2",
    "u2",
    "hash",
    1,
  );
  return db;
}

beforeEach(() => {
  vi.stubEnv("ENCRYPTION_KEY", KEY_HEX);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("user_secrets store", () => {
  it("存进去能读回来，库里不是明文", () => {
    const db = makeDb();
    saveSecret(db, 1, "deepseek", "sk-abc");

    expect(readSecret(db, 1, "deepseek")).toBe("sk-abc");
    const row = db.prepare("SELECT ciphertext FROM user_secrets WHERE user_id = 1").get() as {
      ciphertext: string;
    };
    expect(row.ciphertext).not.toContain("sk-abc");
    expect(row.ciphertext.startsWith("v1.")).toBe(true);
  });

  it("没配过的返回 null（不是错误）", () => {
    const db = makeDb();
    expect(readSecret(db, 1, "deepseek")).toBeNull();
  });

  it("同一个 provider 再存一次是覆盖，不是两条", () => {
    const db = makeDb();
    saveSecret(db, 1, "deepseek", "sk-old", 1000);
    saveSecret(db, 1, "deepseek", "sk-new", 2000);

    const count = db.prepare("SELECT COUNT(*) AS n FROM user_secrets").get() as { n: number };
    expect(count.n).toBe(1);
    expect(readSecret(db, 1, "deepseek")).toBe("sk-new");
  });

  it("用户之间互相看不到", () => {
    const db = makeDb();
    saveSecret(db, 1, "deepseek", "sk-user1");
    saveSecret(db, 2, "deepseek", "sk-user2");

    expect(readSecret(db, 1, "deepseek")).toBe("sk-user1");
    expect(readSecret(db, 2, "deepseek")).toBe("sk-user2");
  });

  it("存的 Key 会 trim（粘贴常带首尾空格）", () => {
    const db = makeDb();
    saveSecret(db, 1, "tikhub", "  key-with-space \n");
    expect(readSecret(db, 1, "tikhub")).toBe("key-with-space");
  });

  it("listConfiguredProviders 只返回配过的那几家", () => {
    const db = makeDb();
    saveSecret(db, 1, "deepseek", "a");
    saveSecret(db, 2, "tikhub", "b");

    expect([...listConfiguredProviders(db, 1)]).toEqual(["deepseek"]);
    expect([...listConfiguredProviders(db, 2)]).toEqual(["tikhub"]);
  });

  it("删除之后回到未配置（幂等）", () => {
    const db = makeDb();
    saveSecret(db, 1, "deepseek", "a");
    deleteSecret(db, 1, "deepseek");
    expect(readSecret(db, 1, "deepseek")).toBeNull();
    expect(() => deleteSecret(db, 1, "deepseek")).not.toThrow();
  });

  it("主密钥没配时写不进去，抛的是配置错误", () => {
    const db = makeDb();
    vi.stubEnv("ENCRYPTION_KEY", "");
    expect(() => saveSecret(db, 1, "deepseek", "a")).toThrow(MasterKeyMissingError);
  });

  it("主密钥没配时，读一个没配过的 Key 仍然是 null（不报配置错误）", () => {
    const db = makeDb();
    vi.stubEnv("ENCRYPTION_KEY", "");
    expect(readSecret(db, 1, "deepseek")).toBeNull();
  });

  it("密文被手改之后解不开，抛的是可读错误", () => {
    const db = makeDb();
    saveSecret(db, 1, "deepseek", "sk-abc");
    db.prepare("UPDATE user_secrets SET ciphertext = 'v1.aaaa.bbbb.cccc' WHERE user_id = 1").run();

    expect(() => readSecret(db, 1, "deepseek")).toThrow(SecretDecryptError);
  });

  it("hasSecret 只看有没有配，不看能不能解开", () => {
    const db = makeDb();
    expect(hasSecret(db, 1, "deepseek")).toBe(false);

    saveSecret(db, 1, "deepseek", "a");
    expect(hasSecret(db, 1, "deepseek")).toBe(true);
    // 别人仍然没有
    expect(hasSecret(db, 2, "deepseek")).toBe(false);
  });

  it("主密钥坏掉时 hasSecret 照样能判断（它不解密）", () => {
    const db = makeDb();
    saveSecret(db, 1, "tikhub", "a");
    vi.stubEnv("ENCRYPTION_KEY", "");

    expect(hasSecret(db, 1, "tikhub")).toBe(true);
    // 但真要取明文就会失败——两者是两件事
    expect(() => readSecret(db, 1, "tikhub")).toThrow(MasterKeyMissingError);
  });
});
