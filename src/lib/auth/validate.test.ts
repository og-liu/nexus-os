import { describe, expect, it } from "vitest";
import {
  normalizeUsername,
  validateLoginInput,
  validatePassword,
  validateRegistration,
  validateUsername,
} from "./validate";

describe("用户名校验", () => {
  it("合法用户名通过", () => {
    for (const value of ["alice", "abc", "刘德华", "user_01", "user-01", "a".repeat(20)]) {
      expect(validateUsername(value)).toBeNull();
    }
  });

  it("空、过短、过长都被拒绝", () => {
    expect(validateUsername("")).not.toBeNull();
    expect(validateUsername("  ")).not.toBeNull(); // 只有空白
    expect(validateUsername("ab")).not.toBeNull();
    expect(validateUsername("a".repeat(21))).not.toBeNull();
  });

  it("中间的空格与符号被拒绝（避免出现看不见的账号）", () => {
    for (const value of ["a b", "a\tb", "alice@example.com", "alice!", "alice/"]) {
      expect(validateUsername(value)).not.toBeNull();
    }
  });

  it("首尾空白直接裁掉就算合法——复制粘贴经常带空格", () => {
    expect(validateUsername(" alice ")).toBeNull();
  });

  it("长度按字符数算：20 个汉字合法，21 个不合法", () => {
    expect(validateUsername("字".repeat(20))).toBeNull();
    expect(validateUsername("字".repeat(21))).not.toBeNull();
  });
});

describe("密码校验", () => {
  it("8–128 位通过，7 位与 129 位被拒绝", () => {
    expect(validatePassword("12345678")).toBeNull();
    expect(validatePassword("1".repeat(128))).toBeNull();
    expect(validatePassword("1234567")).not.toBeNull();
    expect(validatePassword("1".repeat(129))).not.toBeNull();
  });

  it("空密码被拒绝", () => {
    expect(validatePassword("")).not.toBeNull();
  });
});

describe("用户名归一化", () => {
  it("去空白 + 转小写，汉字不受影响", () => {
    expect(normalizeUsername("  Alice ")).toBe("alice");
    expect(normalizeUsername("刘德华")).toBe("刘德华");
  });
});

describe("注册校验", () => {
  it("全部合法时通过，并去掉用户名首尾空白", () => {
    const result = validateRegistration({
      username: " alice ",
      password: "12345678",
      confirmPassword: "12345678",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.username).toBe("alice");
  });

  it("两次密码不一致时给出确认密码的错误", () => {
    const result = validateRegistration({
      username: "alice",
      password: "12345678",
      confirmPassword: "12345679",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors.confirmPassword).toBe("两次输入的密码不一致");
      expect(result.fieldErrors.username).toBeUndefined();
    }
  });

  it("多个字段同时出错时逐个报出", () => {
    const result = validateRegistration({
      username: "a",
      password: "123",
      confirmPassword: "",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors.username).toBeDefined();
      expect(result.fieldErrors.password).toBeDefined();
      expect(result.fieldErrors.confirmPassword).toBeDefined();
    }
  });
});

describe("登录校验", () => {
  it("只检查非空——长度与字符集规则不在登录时报（否则等于告诉攻击者规则）", () => {
    expect(validateLoginInput({ username: "a", password: "1" })).toEqual({});
    expect(validateLoginInput({ username: "", password: "" })).toEqual({
      username: "请输入用户名",
      password: "请输入密码",
    });
  });
});
