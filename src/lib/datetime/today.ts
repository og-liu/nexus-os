import { Solar } from "lunar-javascript";
import { mergeFestivals } from "./festivals";
import {
  formatClock,
  formatDateKey,
  formatLunarDate,
  formatSolarDate,
} from "./format";
import { greetingForHour } from "./greeting";
import { shanghaiParts } from "./shanghai";
import { yearProgressPercent } from "./year-progress";

/**
 * 总览页「日期时间面板」的一次性快照（《功能/日期时间面板》§四、§七）。
 *
 * **整个项目只有这里（和 `page.tsx`）import lunar-javascript**：它是 436KB 的单文件 CJS，
 * 进客户端 bundle 是纯浪费；而且农历、节日、节气、年度进度一天只变一次，
 * 没有理由让浏览器每秒算一遍（§七「每秒重算农历」）。
 *
 * 用法：页面（Server Component）调一次，把结果的每个字段当 props 传给面板；
 * 客户端只跑时钟（`datetime-clock.tsx`），跨天时 `router.refresh()` 让这里重算。
 */
export interface TodaySnapshot {
  /** 北京时间 `YYYY-MM-DD`：客户端拿它判断「跨天没有」。 */
  dateKey: string;
  /** 北京时间 `HH:MM:SS`：时钟首帧的初值（水合前后必须逐字一致）。 */
  clock: string;
  /** 问候词，如 `中午好`（用户名由页面拼在前面）。 */
  greeting: string;
  /** 公历日期行，如 `10月22日星期四`。 */
  solarDate: string;
  /** 农历日期行，如 `农历九月十三`。 */
  lunarDate: string;
  /** 当天全部节日与节气，已去重，顺序 公历 → 农历 → 节气。 */
  festivals: string[];
  /** 当前年份（进度行左边那句「2026 年度进度」）。 */
  year: number;
  /** 年度进度百分比，已保留一位小数。 */
  yearProgress: number;
}

/** 算出「此刻」在北京时间下的整份面板数据。 */
export function getTodaySnapshot(now: Date): TodaySnapshot {
  const parts = shanghaiParts(now);
  // 时区已经落在年月日上：这里只做「这一天」的农历换算，不涉及时刻。
  const solar = Solar.fromYmd(parts.year, parts.month, parts.day);
  const lunar = solar.getLunar();
  return {
    dateKey: formatDateKey(parts),
    clock: formatClock(parts),
    greeting: greetingForHour(parts.hour),
    solarDate: formatSolarDate(parts),
    lunarDate: formatLunarDate(
      lunar.getMonthInChinese(),
      lunar.getDayInChinese(),
    ),
    festivals: mergeFestivals({
      solar: solar.getFestivals(),
      lunar: lunar.getFestivals(),
      jieQi: lunar.getJieQi(),
    }),
    year: parts.year,
    yearProgress: yearProgressPercent(now),
  };
}
