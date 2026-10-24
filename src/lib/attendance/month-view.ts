import { dayLabels } from "./day-label";
import { buildMonthGrid, type MonthDayView } from "./month-grid";
import {
  resolveDayStatus,
  type AttendanceSetting,
  type OverrideStatus,
} from "./schedule";

/**
 * 把「42 格几何 + 周六制度 + 覆盖」拼成月历要渲染的数据（《功能/出勤日历》§二、§三）。
 *
 * 两个入口（首页紧凑卡 / 工具页完整月历）共用这一个函数，差别只在 `withLabels`：
 * 紧凑卡每格约 49px，放不下农历小字，所以不算标注、也不把农历库的活干一遍。
 *
 * **42 格全都算**（含补齐的上月末 / 下月初）：跨月的日子也是真日子，主人要看到它们
 * 同样挂「休 / 班」（2026-10-23 联调补的）。这些格子的差别只剩「日期灰掉」这一条。
 *
 * **只在服务端调用**：它 import 了 `day-label.ts`（→ lunar-javascript）。
 * 客户端组件只拿它的返回值（`MonthDayView[]`），不 import 这个模块。
 */
export interface BuildMonthViewParams {
  year: number;
  /** 1~12。 */
  month: number;
  /** 北京时间的今天（算「今天」黑框）。 */
  todayKey: string;
  setting: AttendanceSetting | null;
  /** 可见 42 格内的覆盖行。 */
  overrides: Map<string, OverrideStatus>;
  /** 是否算农历/节日标注（工具页 true、首页卡 false）。 */
  withLabels?: boolean;
}

export function buildMonthView({
  year,
  month,
  todayKey,
  setting,
  overrides,
  withLabels = false,
}: BuildMonthViewParams): MonthDayView[] {
  return buildMonthGrid(year, month).map((cell) => {
    const override = overrides.get(cell.dayKey) ?? null;
    const resolved = resolveDayStatus(cell.dayKey, setting, override);

    return {
      ...cell,
      status: resolved.status,
      source: resolved.source,
      overridden: override !== null,
      isToday: cell.dayKey === todayKey,
      labels: withLabels ? dayLabels(cell.dayKey) : null,
    };
  });
}
