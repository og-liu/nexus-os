/**
 * 便签时间的展示格式化（纯函数，手写，不引 dayjs / date-fns）。
 *
 * 规则见《功能/便签》§四「时间怎么显示」：
 * - `今天 09:42` / `昨天 21:15` / `8月11日`（同年）/ `2025年12月31日`（跨年）；
 * - **按 UTC+8 计算日界**——线上容器多为 UTC，用服务端本地时区会让「今天」错开 8 小时。
 *
 * 实现：先把时间戳加 8 小时，再用 `getUTC*` 读取，得到的就是 +8 的墙上时间。
 */

const UTC8_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

interface CalendarParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

function partsOf(ts: number): CalendarParts {
  const date = new Date(ts + UTC8_OFFSET_MS);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
  };
}

/** UTC+8 下的「日历日序号」（自 1970-01-01 起第几天），用于比较「今天 / 昨天」。 */
function dayIndex(ts: number): number {
  return Math.floor((ts + UTC8_OFFSET_MS) / DAY_MS);
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** 把毫秒时间戳格式化成界面文案。`now` 可注入，便于单测。 */
export function formatNoteTime(ts: number, now = Date.now()): string {
  const target = partsOf(ts);
  const today = partsOf(now);
  const clock = `${pad(target.hour)}:${pad(target.minute)}`;

  const dayDiff = dayIndex(now) - dayIndex(ts);
  if (dayDiff === 0) return `今天 ${clock}`;
  if (dayDiff === 1) return `昨天 ${clock}`;

  if (target.year === today.year) {
    return `${target.month}月${target.day}日`;
  }
  return `${target.year}年${target.month}月${target.day}日`;
}
