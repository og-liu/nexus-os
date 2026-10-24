import { Solar } from "lunar-javascript";
import { mergeFestivals } from "@/lib/datetime/festivals";
import { formatLunarDate } from "@/lib/datetime/format";
import { parseDayKey, type DayLabels } from "./month-grid";

/**
 * 每格的农历 / 节日标注（《功能/出勤日历》§三「每格节日放几个」）。
 *
 * **整个 attendance 功能里只有这个文件 import lunar-javascript**，而它只被服务端
 * （`month-view.ts` ← 两个页面的 Server Component）引用，客户端组件碰不到
 * （§七「农历库进浏览器包」：436KB 单文件 CJS，进 bundle 是纯浪费）。
 *
 * 一格只有一行高度，所以只取**一个**标签，优先级：
 * 公历节日（国庆节）> 农历节日（重阳节）> 节气（寒露）> 农历日（十五）。
 * 前三个共用《日期时间面板》的 `mergeFestivals`（同一条「公历 → 农历 → 节气」口径，
 * 两个功能对「今天什么节日」不会给出两个答案），空的时候兜底成农历日。
 *
 * 不碰 `getOtherFestivals()`：那里一天几十条国际日，进月历就是噪音（§一「不做」）。
 */
export function dayLabels(dayKey: string): DayLabels | null {
  const parts = parseDayKey(dayKey);
  if (!parts) return null;

  const solar = Solar.fromYmd(parts.year, parts.month, parts.day);
  const lunar = solar.getLunar();
  const [festival = null] = mergeFestivals({
    solar: solar.getFestivals(),
    lunar: lunar.getFestivals(),
    jieQi: lunar.getJieQi(),
  });

  return {
    lunarDay: lunar.getDayInChinese(),
    lunarFull: formatLunarDate(
      lunar.getMonthInChinese(),
      lunar.getDayInChinese(),
    ),
    festival,
  };
}
