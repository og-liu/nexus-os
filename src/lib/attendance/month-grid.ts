import type { DaySource, DayStatus } from "./schedule";

/**
 * 月历几何与日期算术（《功能/出勤日历》§四「月历几何」、§七「42 格里本月日期算错」）。
 *
 * **周一起始 / 7 列 / 固定 42 格**：不管这个月是 4 行还是 6 行，一律用上月尾、下月头补满，
 * 切月时页面高度才不会跳（§七「月历高度跳」）。
 *
 * 为什么日期算术全在 UTC 下算：`new Date(2026, 9, 1)` 取的是**本机时区**的 10 月 1 日，
 * 线上容器跑 UTC、开发机跑 +8，同一个「1 号星期几」会在 23:00 之后分成两天。
 * 「哪一天」与「星期几」本身与时区无关，用 `Date.UTC` 做口径，一次也不碰系统默认时区
 * （文档里的 `new Date(y, m-1, 1)` 只在「机器时区恰好等于业务时区」时成立）。
 *
 * 本文件保持纯函数、不 import 任何农历库：客户端组件（月历、工具栏）直接引用它。
 */

const DAY_MS = 86_400_000;
const DAY_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_KEY_PATTERN = /^(\d{4})-(\d{2})$/;

/** 表格头：周一起始的单字星期。 */
export const WEEKDAY_HEADER = ["一", "二", "三", "四", "五", "六", "日"] as const;

/** 一格的几何信息（不含状态）。 */
export interface MonthCell {
  /** `YYYY-MM-DD`。 */
  dayKey: string;
  year: number;
  /** 1~12。 */
  month: number;
  /** 1~31。 */
  day: number;
  /** 是否属于被渲染的那个月（补齐的上下月日期为 false，不可点）。 */
  inMonth: boolean;
}

/** 一格的农历/节日标注；只有本月的格子才有。 */
export interface DayLabels {
  /** 农历日，如 `十五`——格子里的兜底文案。 */
  lunarDay: string;
  /** 农历全写，如 `农历九月十五`——弹层里用。 */
  lunarFull: string;
  /** 优先级最高的节日/节气（公历 > 农历 > 节气）；没有则 null。 */
  festival: string | null;
}

/** 月历渲染一格的完整数据：几何 + 状态 + 标注。由服务端算好传下来。 */
export interface MonthDayView extends MonthCell {
  /** 实际显示的状态（覆盖 > 基准推算 > 星期兜底）。 */
  status: DayStatus;
  /** 这个状态是谁定的。 */
  source: DaySource;
  /** 有手动覆盖行（格子上的小黑点）。 */
  overridden: boolean;
  isToday: boolean;
  labels: DayLabels | null;
}

/** 两位数补零。 */
function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** 由年月日拼 `YYYY-MM-DD`（不做合法性校验，调用方给的必须是真日期）。 */
export function dayKeyOf(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** 解析 `YYYY-MM-DD`；格式不对或日期不存在（如 `2026-02-31`）返回 null。 */
export function parseDayKey(
  dayKey: string,
): { year: number; month: number; day: number } | null {
  const match = DAY_KEY_PATTERN.exec(dayKey);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

/** 是否是合法的 `YYYY-MM-DD`。 */
export function isDayKey(dayKey: string): boolean {
  return parseDayKey(dayKey) !== null;
}

/** 自己生成的日期键切成数字（不校验，用于网格与算术内部）。 */
function partsOfDayKey(dayKey: string): {
  year: number;
  month: number;
  day: number;
} {
  const [year, month, day] = dayKey.split("-").map(Number);
  return { year, month, day };
}

/** 该日是星期几：0 = 周日、1 = 周一 … 6 = 周六。 */
export function weekdayOf(dayKey: string): number {
  const { year, month, day } = partsOfDayKey(dayKey);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** 前后挪天数（`days` 可为负）。 */
export function addDays(dayKey: string, days: number): string {
  const { year, month, day } = partsOfDayKey(dayKey);
  return msToDayKey(Date.UTC(year, month - 1, day) + days * DAY_MS);
}

/** 是否周六——周六制度只作用在这一天。 */
export function isSaturday(dayKey: string): boolean {
  return weekdayOf(dayKey) === 6;
}

/**
 * `later - earlier` 相差几天。
 *
 * 用**取整**而不是直接除：整数天之间不会有小数，但除法的浮点结果偶尔是 6.999999，
 * 直接截断会少一天，单双休算差一周就会翻错类型。
 */
export function daysBetween(later: string, earlier: string): number {
  const a = partsOfDayKey(later);
  const b = partsOfDayKey(earlier);
  return Math.round(
    (Date.UTC(a.year, a.month - 1, a.day) -
      Date.UTC(b.year, b.month - 1, b.day)) /
      DAY_MS,
  );
}

/**
 * 同一周（周一起始）的周六：周六本身返回自己，周日返回前一天。
 *
 * `mondayIndex` 是这一格在周一开头的行里的位置（周一 0 … 周六 5、周日 6），
 * 所以离周六的天数是 `5 - mondayIndex`（周日是 -1，指向前一天）。
 * 设置面板给单双休取默认锚点时要它：锚点永远是某个周六。
 */
export function saturdayOfWeek(dayKey: string): string {
  const mondayIndex = (weekdayOf(dayKey) + 6) % 7;
  return addDays(dayKey, 5 - mondayIndex);
}

/** 星期几的中文短写：`周五`。 */
export function weekdayShortLabel(dayKey: string): string {
  return `周${WEEKDAY_HEADER[(weekdayOf(dayKey) + 6) % 7]}`;
}

/** 由 UTC 毫秒时间戳还原 `YYYY-MM-DD`（只取整日，不涉及时区）。 */
function msToDayKey(ms: number): string {
  const date = new Date(ms);
  return dayKeyOf(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
  );
}

/**
 * 生成固定 42 格（6 行 × 7 列）的月份网格。
 *
 * 前补上月末、后补下月初：`offset` 是这个月 1 号前面还有几个格子（0~6）。
 * 补出来的格子 `inMonth: false`——界面上置灰、不可点、不参与任何状态样式。
 */
export function buildMonthGrid(year: number, month: number): MonthCell[] {
  const firstKey = dayKeyOf(year, month, 1);
  const offset = (weekdayOf(firstKey) + 6) % 7;
  const gridStart = addDays(firstKey, -offset);

  return Array.from({ length: 42 }, (_, index) => {
    const dayKey = addDays(gridStart, index);
    const parts = partsOfDayKey(dayKey);
    return {
      dayKey,
      year: parts.year,
      month: parts.month,
      day: parts.day,
      inMonth: parts.year === year && parts.month === month,
    };
  });
}

/** `2026-10`：URL 参数与页面标题共用这一种写法。 */
export function monthKey(year: number, month: number): string {
  return `${year}-${pad(month)}`;
}

/** 解析 `YYYY-MM`；格式不对或月份越界返回 null（非法值一律当没传处理）。 */
export function parseMonthKey(
  raw: string | null | undefined,
): { year: number; month: number } | null {
  if (!raw) return null;
  const match = MONTH_KEY_PATTERN.exec(raw);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

/** 月份加减（跨年自动进位 / 借位）。 */
export function addMonths(
  { year, month }: { year: number; month: number },
  delta: number,
): { year: number; month: number } {
  const total = year * 12 + (month - 1) + delta;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}
