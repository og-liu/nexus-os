import { describe, expect, it } from "vitest";
import { PASSWORD_LENGTH, generatePassword } from "./password";

/** 生成器用到的全部合法字符（与实现里的四个字符集一致）。 */
const ALLOWED = /^[A-Za-z0-9!@#$%^&*]+$/;

describe("随机密码生成", () => {
  it(`默认 ${PASSWORD_LENGTH} 位`, () => {
    expect(generatePassword().length).toBe(PASSWORD_LENGTH);
  });

  it("四类字符都有（硬保证，不是靠运气）", () => {
    for (let round = 0; round < 50; round += 1) {
      const password = generatePassword();
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/[0-9]/);
      expect(password).toMatch(/[!@#$%^&*]/);
    }
  });

  it("不含易混字符 0 O o 1 l I", () => {
    for (let round = 0; round < 200; round += 1) {
      expect(generatePassword()).not.toMatch(/[0Oo1lI]/);
    }
  });

  it("只用约定字符集里的字符", () => {
    const password = generatePassword();
    expect(password).toMatch(ALLOWED);
  });

  it("两次生成不同（不是固定串）", () => {
    const set = new Set(Array.from({ length: 20 }, () => generatePassword()));
    expect(set.size).toBe(20);
  });

  it("长度可调；低于 4 位时补到 4 位（四类各一个才叫混合）", () => {
    expect(generatePassword(32).length).toBe(32);
    expect(generatePassword(8).length).toBe(8);
    expect(generatePassword(1).length).toBe(4);
    expect(generatePassword(0).length).toBe(4);
  });

  it("不是「前四位固定类别」：洗牌后首字符的类别会变", () => {
    const firstChars = Array.from({ length: 80 }, () => generatePassword()[0]);
    const categories = new Set(
      firstChars.map((char) =>
        /[A-Z]/.test(char) ? "upper" : /[a-z]/.test(char) ? "lower" : /[0-9]/.test(char) ? "digit" : "symbol",
      ),
    );
    // 80 次里至少出现两类，说明没有「第一位永远是大写」这种规律
    expect(categories.size).toBeGreaterThan(1);
  });
});
