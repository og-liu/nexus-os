import { describe, expect, it } from "vitest";
import { yearProgressPercent } from "./year-progress";

/** 北京时间某一时刻（带偏移的 ISO 字符串，不依赖测试机时区）。 */
function at(iso: string): Date {
  return new Date(iso);
}

describe("年度进度（北京时间年界，保留一位小数）", () => {
  it("1 月 1 日 00:00 → 0.0", () => {
    expect(yearProgressPercent(at("2026-01-01T00:00:00+08:00"))).toBe(0);
  });

  it("平年 12 月 31 日 00:00 → 99.7（364 / 365）", () => {
    const percent = yearProgressPercent(at("2026-12-31T00:00:00+08:00"));
    expect(percent).toBeCloseTo(99.7, 1);
  });

  it("年中：7 月 2 日 12:00 → 50.0（182.5 / 365）", () => {
    const percent = yearProgressPercent(at("2026-07-02T12:00:00+08:00"));
    expect(percent).toBeCloseTo(50, 1);
  });

  it("闰年按 366 天算：2028 年 12 月 31 日 00:00 → 99.7（365 / 366）", () => {
    const percent = yearProgressPercent(at("2028-12-31T00:00:00+08:00"));
    expect(percent).toBeCloseTo(99.7, 1);
  });

  it("跨年重新归零：次年 1 月 1 日 00:00 → 0.0", () => {
    expect(yearProgressPercent(at("2027-01-01T00:00:00+08:00"))).toBe(0);
  });

  it("日界按北京时间：北京 1 月 1 日 00:30（UTC 还是 12 月 31 日）算新的一年", () => {
    // 机器在 UTC 时此刻是 2025-12-31T16:30Z；按机器时区会算成 99.9，按北京时间是 0.0
    expect(yearProgressPercent(at("2026-01-01T00:30:00+08:00"))).toBe(0);
  });

  it("最后半分钟四舍五入到 100.0（公式本身如此，不是 bug）", () => {
    expect(yearProgressPercent(at("2026-12-31T23:59:30+08:00"))).toBe(100);
  });
});
