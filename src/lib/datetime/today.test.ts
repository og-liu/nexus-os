import { describe, expect, it } from "vitest";
import { getTodaySnapshot } from "./today";

/** 北京时间某一时刻的日期对象（带偏移的 ISO 字符串，不依赖测试机时区）。 */
function at(iso: string): Date {
  return new Date(iso);
}

describe("今日快照（北京时间 + lunar-javascript）", () => {
  it("日期行与时钟：2026-10-22 13:37:26 → 星期四 / 农历九月十三 / 中午好", () => {
    const today = getTodaySnapshot(at("2026-10-22T13:37:26+08:00"));
    expect(today.solarDate).toBe("10月22日星期四");
    expect(today.lunarDate).toBe("农历九月十三");
    expect(today.clock).toBe("13:37:26");
    expect(today.dateKey).toBe("2026-10-22");
    expect(today.greeting).toBe("中午好");
    expect(today.year).toBe(2026);
  });

  it("公历节日：2026-10-01 含「国庆节」", () => {
    expect(getTodaySnapshot(at("2026-10-01T09:00:00+08:00")).festivals).toContain(
      "国庆节",
    );
  });

  it("农历节日：2026-09-25 含「中秋节」", () => {
    expect(getTodaySnapshot(at("2026-09-25T09:00:00+08:00")).festivals).toContain(
      "中秋节",
    );
  });

  it("农历节日：2026-02-17 含「春节」", () => {
    expect(getTodaySnapshot(at("2026-02-17T09:00:00+08:00")).festivals).toContain(
      "春节",
    );
  });

  it("节气：2026-02-04 含「立春」", () => {
    expect(getTodaySnapshot(at("2026-02-04T09:00:00+08:00")).festivals).toContain(
      "立春",
    );
  });

  it("同一天有两个来源时按「公历 → 节气」排序（2026-06-21：父亲节 + 夏至）", () => {
    expect(
      getTodaySnapshot(at("2026-06-21T09:00:00+08:00")).festivals,
    ).toEqual(["父亲节", "夏至"]);
  });

  it("同一天有两个来源时按「农历 → 节气」排序（2026-03-20：龙头节 + 春分）", () => {
    expect(
      getTodaySnapshot(at("2026-03-20T09:00:00+08:00")).festivals,
    ).toEqual(["龙头节", "春分"]);
  });

  it("普通一天没有任何节日与节气 → 空数组（面板整组不渲染）", () => {
    expect(getTodaySnapshot(at("2026-10-22T13:37:26+08:00")).festivals).toEqual(
      [],
    );
  });

  it("日界按北京时间：UTC 15:59 与 16:00 分属两天", () => {
    expect(getTodaySnapshot(at("2026-10-21T15:59:00Z")).dateKey).toBe(
      "2026-10-21",
    );
    expect(getTodaySnapshot(at("2026-10-21T16:00:00Z")).dateKey).toBe(
      "2026-10-22",
    );
  });

  it("不碰 getOtherFestivals()：国庆节当天不会混进「国际老年人日」", () => {
    const today = getTodaySnapshot(at("2026-10-01T09:00:00+08:00"));
    expect(today.festivals).not.toContain("国际老年人日");
  });
});
