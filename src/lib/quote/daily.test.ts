import { describe, expect, it } from "vitest";
import { getTodaySnapshot } from "@/lib/datetime/today";
import {
  dayOfYear,
  nextQuoteIndex,
  quoteAt,
  quoteForDateKey,
  quoteIndexForDateKey,
} from "./daily";
import { QUOTES } from "./quotes";

/**
 * 每日一句的取句规则与句子库体检（《功能/每日一句》§六、§七）。
 *
 * 取句只吃日期键、不看系统时区，所以这里可以随便挑年份和日子来测：
 * 2026 是平年（365 天），2028 是闰年（366 天）。
 */

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function dateKeyOf(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** 一整年的日期键（用 UTC 推算，与测试机时区无关）。 */
function dateKeysOfYear(year: number): string[] {
  const total = isLeapYear(year) ? 366 : 365;
  return Array.from({ length: total }, (_, offset) => {
    const date = new Date(Date.UTC(year, 0, 1 + offset));
    return dateKeyOf(
      date.getUTCFullYear(),
      date.getUTCMonth() + 1,
      date.getUTCDate(),
    );
  });
}

describe("日期键 → 今年第几天", () => {
  it("平年：1 月 1 日是第 1 天，12 月 31 日是第 365 天", () => {
    expect(dayOfYear("2026-01-01")).toBe(1);
    expect(dayOfYear("2026-10-22")).toBe(295);
    expect(dayOfYear("2026-12-31")).toBe(365);
  });

  it("闰年：2 月 29 日是第 60 天，12 月 31 日是第 366 天", () => {
    expect(dayOfYear("2028-02-28")).toBe(59);
    expect(dayOfYear("2028-02-29")).toBe(60);
    expect(dayOfYear("2028-03-01")).toBe(61);
    expect(dayOfYear("2028-12-31")).toBe(366);
  });

  it("格式不对时返回 NaN，不抛异常", () => {
    expect(Number.isNaN(dayOfYear("2026/10/22"))).toBe(true);
    expect(Number.isNaN(dayOfYear("2026-10"))).toBe(true);
    expect(Number.isNaN(dayOfYear(""))).toBe(true);
  });
});

describe("每天取哪条：`(今年第几天 - 1) % 365`", () => {
  it("平年 365 天正好把 365 条各走一次，顺序不跳", () => {
    const indexes = dateKeysOfYear(2026).map(quoteIndexForDateKey);
    expect(indexes).toEqual(Array.from({ length: 365 }, (_, i) => i));
  });

  it("闰年第 366 天回到第 1 条", () => {
    const keys = dateKeysOfYear(2028);
    expect(keys).toHaveLength(366);
    expect(quoteIndexForDateKey(keys[365])).toBe(0);
    expect(quoteIndexForDateKey("2028-12-31")).toBe(0);
  });

  it("同一天重复调用结果相同（不是随机取句）", () => {
    const first = quoteForDateKey("2026-10-22");
    for (let i = 0; i < 10; i += 1) {
      expect(quoteForDateKey("2026-10-22")).toEqual(first);
    }
  });

  it("换一天就是下一条", () => {
    const before = quoteIndexForDateKey("2026-10-22");
    expect(quoteIndexForDateKey("2026-10-23")).toBe((before + 1) % 365);
  });

  it("取到的下标与正文一致", () => {
    const quote = quoteForDateKey("2026-10-22");
    expect(QUOTES[quote.index]).toEqual({
      body: quote.body,
      author: quote.author,
    });
  });

  it("日期键来自上海日界：UTC 15:59 与 16:00 分属两天，句子跟着换", () => {
    const before = getTodaySnapshot(new Date("2026-10-21T15:59:00Z"));
    const after = getTodaySnapshot(new Date("2026-10-21T16:00:00Z"));

    expect(before.dateKey).toBe("2026-10-21");
    expect(after.dateKey).toBe("2026-10-22");
    expect(quoteIndexForDateKey(after.dateKey)).toBe(
      (quoteIndexForDateKey(before.dateKey) + 1) % 365,
    );
  });
});

describe("换一句", () => {
  it("按 +1 取下一条，走到末尾回到第 1 条", () => {
    expect(nextQuoteIndex(0)).toBe(1);
    expect(nextQuoteIndex(363)).toBe(364);
    expect(nextQuoteIndex(364)).toBe(0);
  });

  it("连点一整轮：不会重复当前这条，365 条各出现一次", () => {
    const seen = new Set<number>();
    let index = 0;
    for (let i = 0; i < 365; i += 1) {
      const next = nextQuoteIndex(index);
      expect(next).not.toBe(index);
      seen.add(next);
      index = next;
    }
    expect(seen.size).toBe(365);
  });

  it("非法下标折回合法区间（Server Action 是公开端点）", () => {
    expect(quoteAt(-1)).toEqual(QUOTES[364]);
    expect(quoteAt(365)).toEqual(QUOTES[0]);
    expect(quoteAt(730)).toEqual(QUOTES[0]);
    expect(quoteAt(Number.NaN)).toEqual(QUOTES[0]);
    expect(quoteAt(1.5)).toEqual(QUOTES[0]);
  });
});

describe("句子库体检", () => {
  it("正好 365 条", () => {
    expect(QUOTES).toHaveLength(365);
  });

  it("每条正文非空，且不超过 40 字", () => {
    for (const quote of QUOTES) {
      const length = Array.from(quote.body).length;
      expect(quote.body.trim()).not.toBe("");
      expect(length).toBeLessThanOrEqual(40);
    }
  });

  it("正文不重复", () => {
    const bodies = QUOTES.map((quote) => quote.body);
    expect(new Set(bodies).size).toBe(bodies.length);
  });

  it("作者都填了（说不清出处的写「佚名」）", () => {
    for (const quote of QUOTES) {
      expect(quote.author.trim()).not.toBe("");
    }
  });

  it("含尼采那句", () => {
    expect(QUOTES).toContainEqual({
      body: "每一个不曾起舞的日子，都是对生命的辜负。",
      author: "尼采",
    });
  });
});
