import { QUOTE_COUNT, QUOTES, type Quote } from "./quotes";

/**
 * 每日一句的取句规则（纯函数，《功能/每日一句》§2.4、§四）。
 *
 * 只认一个输入：**上海日界的日期键**（`2026-10-22`，来自 `getTodaySnapshot().dateKey`）。
 * 不读 `Date.now()`、不读系统时区——线上机器是 UTC，用它算「今天」会让句子在早上
 * 八点才换。日期键是从 `Asia/Shanghai` 折算好的，这里只做「第几天 → 第几条」的算术。
 *
 * 换算全走 `Date.UTC`：UTC 没有夏令时，两天之间恒为 86400000 毫秒，
 * 不会出现「某天地面时间 23 小时」把天数算歪的情况。
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** 卡片上要显示的一条：下标 + 正文 + 作者（下标留给「换一句」接着往下数）。 */
export interface DailyQuote extends Quote {
  /** 在 `QUOTES` 里的下标，0 起。 */
  index: number;
}

/**
 * 日期键 → 今年第几天（1 起算）。
 *
 * 格式不对时返回 `NaN`（调用方会退回第 1 条），不抛异常：
 * 这个函数在服务端渲染路径上，宁可显示一句普通的话，也不要整页 500。
 */
export function dayOfYear(dateKey: string): number {
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!matched) return Number.NaN;

  const year = Number(matched[1]);
  const month = Number(matched[2]);
  const day = Number(matched[3]);

  const startOfYear = Date.UTC(year, 0, 1);
  const current = Date.UTC(year, month - 1, day);
  if (!Number.isFinite(current)) return Number.NaN;

  // 用 round 而不是 floor：UTC 下的整天差值就是整数，round 顺带吃掉浮点误差
  return Math.round((current - startOfYear) / MS_PER_DAY) + 1;
}

/**
 * 日期键 → 当天该显示第几条：`(今年第几天 - 1) % 365`。
 *
 * 平年第 365 天正好走到最后一条；闰年第 366 天 `% 365` 回到 0，
 * 也就是回到第 1 条，一年内不会重复、也不会越界。
 */
export function quoteIndexForDateKey(dateKey: string): number {
  const day = dayOfYear(dateKey);
  if (!Number.isFinite(day)) return 0;
  return (day - 1) % QUOTE_COUNT;
}

/** 按日期键取当天那一句（首页服务端渲染时调它）。 */
export function quoteForDateKey(dateKey: string): DailyQuote {
  const index = quoteIndexForDateKey(dateKey);
  return { index, ...quoteAt(index) };
}

/** 换一句：当前下标 +1（到末尾回到第 1 条；库长 > 1，所以永远不会等于当前这条）。 */
export function nextQuoteIndex(index: number): number {
  return (normalizeIndex(index) + 1) % QUOTE_COUNT;
}

/** 按下标取句子；非法 / 越界下标先折回合法区间（Server Action 是公开端点）。 */
export function quoteAt(index: number): Quote {
  return QUOTES[normalizeIndex(index)];
}

/** 把任意数字折进 `[0, QUOTE_COUNT)`；非整数当 0（公开端点收到 `null` / `"3"` 都不该炸）。 */
function normalizeIndex(index: number): number {
  if (!Number.isInteger(index)) return 0;
  return ((index % QUOTE_COUNT) + QUOTE_COUNT) % QUOTE_COUNT;
}
