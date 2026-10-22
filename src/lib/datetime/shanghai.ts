/**
 * 东八区（`Asia/Shanghai`）时间口径——日期时间面板所有「今天」都从这里取。
 *
 * 为什么单独一个模块：线上容器跑在 UTC，「今天」会比北京时间晚 8 小时翻篇；
 * 日期行、问候词、农历、节日、年度进度必须是同一个口径，否则 23:00 之后面板会自相矛盾
 * （日期还是今天、农历已经换成明天）。见《功能/日期时间面板》§七「UTC 机器提前跨天」。
 *
 * 两个口子分工明确：
 * - **墙上时间**（年月日时分秒）走 `Intl.DateTimeFormat` + 显式 `timeZone`，不碰系统默认时区；
 * - **日界换算成时间戳**（1 月 1 日 00:00 这类）用固定偏移：Asia/Shanghai 自 1991 年起
 *   全年 UTC+8、没有夏令时，一个常量就够，不需要再引入时区库。
 */

export const SHANGHAI_TIME_ZONE = "Asia/Shanghai";

/** 北京时间的墙上时间，全部是整数数字（月 1~12、小时 0~23）。 */
export interface ShanghaiParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

const partsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: SHANGHAI_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  // h23：午夜是 0 点。默认的 h24 会把 00:30 读成 24:30，时钟会写出 `24:30:00`。
  hourCycle: "h23",
});

/** 取某个时刻在北京时间下的年月日时分秒。 */
export function shanghaiParts(now: Date): ShanghaiParts {
  const fields: Record<string, number> = {};
  for (const part of partsFormatter.formatToParts(now)) {
    if (part.type !== "literal") fields[part.type] = Number(part.value);
  }
  return {
    year: fields.year,
    month: fields.month,
    day: fields.day,
    hour: fields.hour,
    minute: fields.minute,
    second: fields.second,
  };
}

/** 北京时间某天 00:00 对应的时间戳（毫秒）——年度进度的年界要用它。 */
export function shanghaiMidnightMs(
  year: number,
  month: number,
  day: number,
): number {
  return Date.UTC(year, month - 1, day) - SHANGHAI_OFFSET_MS;
}
