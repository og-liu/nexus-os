import { describe, expect, it } from "vitest";
import {
  FIELD_KEY_MAX,
  FIELD_VALUE_MAX,
  FIELDS_MAX,
  GROUP_NAME_MAX,
  TITLE_MAX,
  validateFields,
  validateGroupName,
  validateTitle,
} from "./validate";

describe("标题校验", () => {
  it("空、纯空格、纯换行都变成「未命名」，不报错", () => {
    expect(validateTitle("")).toEqual({ ok: true, value: "未命名" });
    expect(validateTitle("   ")).toEqual({ ok: true, value: "未命名" });
    expect(validateTitle("\n\t")).toEqual({ ok: true, value: "未命名" });
  });

  it("两头空格修掉，中间不动", () => {
    expect(validateTitle("  招商银行信用卡 ")).toEqual({
      ok: true,
      value: "招商银行信用卡",
    });
  });

  it(`边界 ${TITLE_MAX} 字可以，${TITLE_MAX + 1} 字拒绝（按字符数，不按 UTF-16 长度）`, () => {
    expect(validateTitle("あ".repeat(TITLE_MAX)).ok).toBe(true);
    expect(validateTitle("あ".repeat(TITLE_MAX + 1)).ok).toBe(false);
    // emoji 在 JS 里 length 是 2，按字符数算 50 个 emoji 才对
    const emoji = "🔐";
    expect(Array.from(emoji.repeat(50)).length).toBe(50);
    expect(validateTitle(emoji.repeat(TITLE_MAX)).ok).toBe(true);
    expect(validateTitle(emoji.repeat(TITLE_MAX + 1)).ok).toBe(false);
  });

  it("非字符串直接拒绝", () => {
    expect(validateTitle(123).ok).toBe(false);
    expect(validateTitle(null).ok).toBe(false);
    expect(validateTitle(undefined).ok).toBe(false);
  });
});

describe("字段校验", () => {
  it("非数组拒绝", () => {
    expect(validateFields("[]").ok).toBe(false);
    expect(validateFields({}).ok).toBe(false);
    expect(validateFields(null).ok).toBe(false);
  });

  it("字段名为空的行静默丢弃，其余保留顺序", () => {
    const result = validateFields([
      { key: "卡号", value: "1" },
      { key: "   ", value: "会被丢掉" },
      { key: "密码", value: "" },
    ]);
    expect(result).toEqual({
      ok: true,
      value: [
        { key: "卡号", value: "1" },
        { key: "密码", value: "" },
      ],
    });
  });

  it("字段名修掉两头空格，值不动（尾随空格可能是密码的一部分）", () => {
    const result = validateFields([{ key: "  卡号  ", value: " 12 " }]);
    expect(result).toEqual({ ok: true, value: [{ key: "卡号", value: " 12 " }] });
  });

  it("元素形状不对 / 类型不是字符串 → 拒绝", () => {
    expect(validateFields([{ key: 1, value: "x" }]).ok).toBe(false);
    expect(validateFields([{ key: "a" }]).ok).toBe(false);
    expect(validateFields(["a"]).ok).toBe(false);
    expect(validateFields([null]).ok).toBe(false);
  });

  it(`字段数量上限 ${FIELDS_MAX}`, () => {
    const make = (count: number) =>
      Array.from({ length: count }, (_, index) => ({ key: `k${index}`, value: "v" }));
    expect(validateFields(make(FIELDS_MAX)).ok).toBe(true);
    expect(validateFields(make(FIELDS_MAX + 1)).ok).toBe(false);
  });

  it(`字段名 / 字段值上限 ${FIELD_KEY_MAX} / ${FIELD_VALUE_MAX}`, () => {
    expect(validateFields([{ key: "k".repeat(FIELD_KEY_MAX), value: "" }]).ok).toBe(true);
    expect(validateFields([{ key: "k".repeat(FIELD_KEY_MAX + 1), value: "" }]).ok).toBe(false);
    expect(validateFields([{ key: "k", value: "v".repeat(FIELD_VALUE_MAX) }]).ok).toBe(true);
    expect(validateFields([{ key: "k", value: "v".repeat(FIELD_VALUE_MAX + 1) }]).ok).toBe(false);
  });

  it("全空行 → 空数组（不报错）", () => {
    expect(validateFields([{ key: "", value: "" }])).toEqual({ ok: true, value: [] });
    expect(validateFields([])).toEqual({ ok: true, value: [] });
  });
});

describe("群组名校验", () => {
  it("空名拒绝（左栏上就是一行看不见的东西）", () => {
    expect(validateGroupName("").ok).toBe(false);
    expect(validateGroupName("   ").ok).toBe(false);
  });

  it(`边界 ${GROUP_NAME_MAX} 字`, () => {
    expect(validateGroupName("银".repeat(GROUP_NAME_MAX)).ok).toBe(true);
    expect(validateGroupName("银".repeat(GROUP_NAME_MAX + 1)).ok).toBe(false);
  });

  it("两头空格修掉", () => {
    expect(validateGroupName("  银行 ")).toEqual({ ok: true, value: "银行" });
  });
});
