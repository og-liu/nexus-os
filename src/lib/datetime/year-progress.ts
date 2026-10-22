import { shanghaiMidnightMs, shanghaiParts } from "./shanghai";

/**
 * 年度进度（《功能/日期时间面板》§2.4）：`今年已过毫秒 / 今年总毫秒 × 100`，保留 1 位小数。
 *
 * 年界按**北京时间**算，不是机器本地时区：
 * 1 月 1 日 00:00 → `0.0`；平年 12 月 31 日 00:00 → `99.7`（364/365）。
 * 闰年自动是 366 天，不需要单独分支。
 *
 * 返回值是已经留好一位小数的数字（面板再 `toFixed(1)` 出字符串，两处不会给出不同的精度）。
 */
export function yearProgressPercent(now: Date): number {
  const { year } = shanghaiParts(now);
  const yearStart = shanghaiMidnightMs(year, 1, 1);
  const nextYearStart = shanghaiMidnightMs(year + 1, 1, 1);
  const elapsed = now.getTime() - yearStart;
  const percent = (elapsed / (nextYearStart - yearStart)) * 100;
  return Number(percent.toFixed(1));
}
