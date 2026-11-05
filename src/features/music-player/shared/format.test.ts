import { describe, expect, it } from "vitest";
import { formatDay, formatTime, progressRatio } from "./format";

describe("music-player/format（features/music-player/README.md §2.1）", () => {
  it("不足一小时是 分:秒，秒补零", () => {
    expect(formatTime(0)).toBe("0:00");
    expect(formatTime(9)).toBe("0:09");
    expect(formatTime(84)).toBe("1:24");
    expect(formatTime(269.9)).toBe("4:29");
  });

  it("超过一小时补上小时段", () => {
    expect(formatTime(3600)).toBe("1:00:00");
    expect(formatTime(3753)).toBe("1:02:33");
  });

  it("读不出时长时显示 --:--，不显示 NaN", () => {
    expect(formatTime(null)).toBe("--:--");
    expect(formatTime(undefined)).toBe("--:--");
    expect(formatTime(Number.NaN)).toBe("--:--");
    expect(formatTime(Number.POSITIVE_INFINITY)).toBe("--:--");
    expect(formatTime(-5)).toBe("--:--");
  });

  it("进度比例夹在 0..1 之间，时长未知时为 0", () => {
    expect(progressRatio(0, 100)).toBe(0);
    expect(progressRatio(25, 100)).toBe(0.25);
    expect(progressRatio(100, 100)).toBe(1);
    expect(progressRatio(150, 100)).toBe(1);
    expect(progressRatio(10, 0)).toBe(0);
    expect(progressRatio(10, Number.NaN)).toBe(0);
  });

  it("日期固定按北京时间算，两端渲染结果一致", () => {
    // 2026-11-03T00:30:00+08:00 = 2026-11-02T16:30:00Z
    expect(formatDay(Date.UTC(2026, 10, 2, 16, 30))).toBe("2026/11/3");
    // 2026-11-02T23:30:00+08:00 = 2026-11-02T15:30:00Z
    expect(formatDay(Date.UTC(2026, 10, 2, 15, 30))).toBe("2026/11/2");
    expect(formatDay(Number.NaN)).toBe("");
  });
});
