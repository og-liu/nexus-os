import { describe, expect, it } from "vitest";
import { formatBytes, percentSaved } from "./format-bytes";

describe("formatBytes（1024 进制体积）", () => {
  it("0 字节显示「0 B」，负数与非数字也落到「0 B」", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(-1)).toBe("0 B");
    expect(formatBytes(Number.NaN)).toBe("0 B");
    expect(formatBytes(Number.POSITIVE_INFINITY)).toBe("0 B");
  });

  it("B ↔ KB 边界：1023 还是 B，1024 变 1.0 KB", () => {
    expect(formatBytes(1)).toBe("1 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1023)).toBe("1023 B");
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
  });

  it("KB 段：小于 10 保留一位小数，大于等于 10 取整", () => {
    expect(formatBytes(10 * 1024)).toBe("10 KB");
    expect(formatBytes(620 * 1024)).toBe("620 KB");
    // 1000 进制下这是 1.0 MB，1024 进制下才 977 KB——正是「和 ls -l 对得上」的那条规则
    expect(formatBytes(1_000_000)).toBe("977 KB");
  });

  it("KB ↔ MB 边界：1024 KB 起才算 MB", () => {
    expect(formatBytes(1024 * 1024 - 1)).toBe("1024 KB");
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
    expect(formatBytes(3 * 1024 * 1024)).toBe("3.0 MB");
    expect(formatBytes(12 * 1024 * 1024)).toBe("12 MB");
  });

  it("MB ↔ GB 边界，以及 GB 封顶", () => {
    expect(formatBytes(1024 * 1024 * 1024)).toBe("1.0 GB");
    expect(formatBytes(2.5 * 1024 * 1024 * 1024)).toBe("2.5 GB");
    expect(formatBytes(2048 * 1024 * 1024 * 1024)).toBe("2048 GB");
  });
});

describe("percentSaved（省下的百分比）", () => {
  it("压缩到四分之一，省下 75%", () => {
    expect(percentSaved(1000, 250)).toBe(75);
  });

  it("结果反而更大时返回负数（界面显示 +N%）", () => {
    expect(percentSaved(1000, 1200)).toBe(-20);
  });

  it("原体积为 0 或非法时返回 0，不产生 Infinity / NaN", () => {
    expect(percentSaved(0, 100)).toBe(0);
    expect(percentSaved(Number.NaN, 100)).toBe(0);
    expect(percentSaved(1000, Number.NaN)).toBe(0);
  });
});
