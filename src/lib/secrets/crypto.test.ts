import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SecretDecryptError,
  decryptSecret,
  encryptSecret,
  generateMasterKey,
  readMasterKey,
} from "./crypto";

/** 32 字节主密钥（hex 形式）。 */
const KEY_HEX = "a".repeat(64);
const KEY = Buffer.from(KEY_HEX, "hex");

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("readMasterKey", () => {
  it("认 64 位 hex", () => {
    vi.stubEnv("ENCRYPTION_KEY", KEY_HEX);
    expect(readMasterKey()?.equals(KEY)).toBe(true);
  });

  it("认 base64（解出来正好 32 字节）", () => {
    const generated = generateMasterKey();
    vi.stubEnv("ENCRYPTION_KEY", generated);
    expect(readMasterKey()).toHaveLength(32);
  });

  it("空串 / 纯空白当作没设置（.env 里留空就是空字符串）", () => {
    vi.stubEnv("ENCRYPTION_KEY", "");
    expect(readMasterKey()).toBeNull();
    vi.stubEnv("ENCRYPTION_KEY", "   ");
    expect(readMasterKey()).toBeNull();
  });

  it("长度不对返回 null，而不是给一个短密钥", () => {
    vi.stubEnv("ENCRYPTION_KEY", "abc");
    expect(readMasterKey()).toBeNull();
  });
});

describe("encryptSecret / decryptSecret", () => {
  it("往返一致", () => {
    const cipher = encryptSecret("sk-1234567890", KEY);
    expect(decryptSecret(cipher, KEY)).toBe("sk-1234567890");
  });

  it("密文带版本前缀、四段、不含明文", () => {
    const cipher = encryptSecret("sk-secret", KEY);
    expect(cipher.startsWith("v1.")).toBe(true);
    expect(cipher.split(".")).toHaveLength(4);
    expect(cipher).not.toContain("sk-secret");
  });

  it("同一个明文加密两次得到不同密文（每次新 IV）", () => {
    expect(encryptSecret("same", KEY)).not.toBe(encryptSecret("same", KEY));
  });

  it("密文被改一个字符就解不开", () => {
    const cipher = encryptSecret("sk-secret", KEY);
    const parts = cipher.split(".");
    // 改数据段最后一个字符
    parts[3] = parts[3].slice(0, -2) + (parts[3].endsWith("A") ? "B" : "A") + parts[3].slice(-1);
    expect(() => decryptSecret(parts.join("."), KEY)).toThrow(SecretDecryptError);
  });

  it("换一把密钥解不开", () => {
    const cipher = encryptSecret("sk-secret", KEY);
    const other = Buffer.from("b".repeat(64), "hex");
    expect(() => decryptSecret(cipher, other)).toThrow(SecretDecryptError);
  });

  it("不认识的版本 / 段数不对都收敛成同一个错误", () => {
    expect(() => decryptSecret("v2.a.b.c", KEY)).toThrow(SecretDecryptError);
    expect(() => decryptSecret("v1.only-one", KEY)).toThrow(SecretDecryptError);
  });
});
