import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("密码哈希（scrypt）", () => {
  it("同一密码两次哈希结果不同——每次都换一根随机盐", async () => {
    const first = await hashPassword("12345678");
    const second = await hashPassword("12345678");
    expect(first).not.toBe(second);
  });

  it("哈希是自描述的：算法与参数写在字符串里", async () => {
    const [algorithm, n, r, p, salt, key] = (await hashPassword("12345678")).split(
      "$",
    );
    expect(algorithm).toBe("scrypt");
    expect(Number(n)).toBe(16384);
    expect(Number(r)).toBe(8);
    expect(Number(p)).toBe(1);
    expect(Buffer.from(salt, "base64")).toHaveLength(16);
    expect(Buffer.from(key, "base64")).toHaveLength(64);
  });

  it("正确密码通过校验", async () => {
    const hash = await hashPassword("correct horse battery staple");
    await expect(
      verifyPassword("correct horse battery staple", hash),
    ).resolves.toBe(true);
  });

  it("错误密码不通过", async () => {
    const hash = await hashPassword("12345678");
    await expect(verifyPassword("12345679", hash)).resolves.toBe(false);
  });

  it("中文密码可哈希、可校验", async () => {
    const password = "中文密码也要能用";
    const hash = await hashPassword(password);
    await expect(verifyPassword(password, hash)).resolves.toBe(true);
    await expect(verifyPassword("中文密码也要能用呀", hash)).resolves.toBe(false);
  });

  it("畸形哈希返回 false，而不是抛出未捕获异常", async () => {
    const broken = [
      "",
      "not-a-hash",
      "scrypt$16384$8$1$少了最后一段",
      "md5$1$1$1$AAAA$BBBB", // 算法不认识
      "scrypt$0$0$0$AAAA$BBBB", // 参数超出合法范围
      "scrypt$16384$8$1$$", // 盐与密钥都为空
    ];
    for (const stored of broken) {
      await expect(verifyPassword("12345678", stored)).resolves.toBe(false);
    }
  });
});
