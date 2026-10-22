import type { ShanghaiParts } from "./shanghai";

/**
 * 面板上几段文字的拼装（纯函数，可单测）。
 *
 * 都是「拿到已经算好的数字/中文」再拼字符串：
 * 时区判断在 `shanghai.ts`，农历数字来自 lunar-javascript（服务端 `today.ts`），
 * 这样「拼成什么样」可以一条条测，不受当天日期和运行机器影响。
 */

const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"] as const;

/** 星期几：`星期四`。日期→星期与时区无关，用年月日在 UTC 下算即可。 */
export function weekdayLabel(year: number, month: number, day: number): string {
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return `星期${WEEKDAY_LABELS[weekday]}`;
}

/** 公历日期：`10月22日星期四`（不带年份——年份在年度进度那一行）。 */
export function formatSolarDate(
  parts: Pick<ShanghaiParts, "year" | "month" | "day">,
): string {
  return `${parts.month}月${parts.day}日${weekdayLabel(parts.year, parts.month, parts.day)}`;
}

/** 农历日期：`农历九月十三`。月/日的中文数字由 lunar-javascript 给，这里只补「农历」和「月」。 */
export function formatLunarDate(
  monthInChinese: string,
  dayInChinese: string,
): string {
  return `农历${monthInChinese}月${dayInChinese}`;
}

/** 时钟：`13:37:26`（24 小时制，逐位补零）。 */
export function formatClock(
  parts: Pick<ShanghaiParts, "hour" | "minute" | "second">,
): string {
  return [parts.hour, parts.minute, parts.second].map(pad).join(":");
}

/** 日期键：`2026-10-22`。客户端拿它比对「服务端给的这天」还是不是今天。 */
export function formatDateKey(
  parts: Pick<ShanghaiParts, "year" | "month" | "day">,
): string {
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
