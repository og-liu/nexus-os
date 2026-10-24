import { daysBetween, isSaturday, weekdayOf } from "./month-grid";

/**
 * 出勤状态的推算（《功能/出勤日历》§三「推算函数」）。
 *
 * 三层，优先级从高到低，**顺序固定写在一处**：
 *
 * 1. 手动覆盖（`attendance_overrides` 里有这一天）→ 它的 `status`。
 *    这一层最高：调休、请假、临时改班，改了就一直是它，**换制度也冲不掉**
 *    （2026-10-23 联调时 ogliu 定下的口径）；
 * 2. 周六制度（`attendance_settings`）：
 *    - 单休 → 每个周六都上班；
 *    - 双休 → 每个周六都休息；
 *    - 单双休（大小周）→ 以 `anchor_saturday` 那周为基准，**每隔一周翻转一次**；
 * 3. 星期兜底：周一到周五「上班」、周日「休息」。
 *
 * 什么都没设过的周六是「未设定」而不是「休息」——「还没选制度」和「选了双休」
 * 在界面上必须长得不一样（未设时所有周六无角标、日期灰掉）。
 *
 * 本文件是纯函数，不 import 数据库、农历库与 React——客户端弹层与单测都能直接用它。
 */

/** 一天的状态。`unset` = 周六且还没有选制度（既不是上班也不是休息）。 */
export type DayStatus = "work" | "off" | "unset";

/** 这个状态是谁定的（界面上「已手动调整」小黑点靠它区分推出来的和我改过的）。 */
export type DaySource = "manual" | "saturday-mode" | "weekday" | "none";

/** 覆盖表里允许存的两个值——`unset` 不进库（「跟随自动」= 这行不存在）。 */
export type OverrideStatus = "work" | "off";

/**
 * 周六制度：
 * - `work` = 单休（每周六上班）
 * - `off` = 双休（每周六休息）
 * - `alternate` = 单双休 / 大小周（单休周与双休周交替）
 *
 * 名字故意不叫 `single` / `double`：前两个说的是「周六这一天算不算上班」，不是制度名。
 */
export type SaturdayMode = "work" | "off" | "alternate";

/** 交替模式的锚点：从哪个周六起算、那一周算哪种。 */
export interface AlternateAnchor {
  /** 基准周六（`YYYY-MM-DD`，必须真的是周六，写入前校验）。 */
  saturday: string;
  /** 基准那周的周六上不上班：`true` = 那周单休。 */
  isWork: boolean;
}

/**
 * 默认制度（2026-10-23 联调）：**单双休（大小周）**，从 `2026-10-24` 那一周起是双休周。
 *
 * 为什么要有默认：没设过制度时，周六既不是班也不是休，界面只能显示「未定」——
 * 主人打开一看就是一片空白（「星期六的标识呢？」）。给一个默认，新账号打开就有答案，
 * 想改再去设置里改；库里没有行 ≠ 界面上没有制度。
 *
 * 锚点写死成固定某一天，而不是「今天所在那周」：写「今天」的话，日子往前走相位就漂，
 * 单双周会越走越乱。写死之后它就是一个正常的单双休循环，从 2026-10-24 起两周一轮。
 */
export const DEFAULT_SETTING: AttendanceSetting = {
  saturdayMode: "alternate",
  anchor: { saturday: "2026-10-24", isWork: false },
};

/** 一个人的出勤设置。 */
export interface AttendanceSetting {
  saturdayMode: SaturdayMode;
  /** 只有 `saturdayMode === "alternate"` 时有值；单休 / 双休为 null。 */
  anchor: AlternateAnchor | null;
}

export interface DayResolution {
  status: DayStatus;
  source: DaySource;
}

/** 是不是可以落库的状态（服务端校验用，不信任客户端传值）。 */
export function isOverrideStatus(value: unknown): value is OverrideStatus {
  return value === "work" || value === "off";
}

/** 是不是合法的周六制度（服务端校验用）。 */
export function isSaturdayMode(value: unknown): value is SaturdayMode {
  return value === "work" || value === "off" || value === "alternate";
}

/**
 * 算某一天的状态。
 *
 * `override` 传 `undefined` / `null` 表示这一天没有覆盖行；
 * `setting` 传 `null` 表示库里还没存过制度 → 按 `DEFAULT_SETTING` 算。
 */
export function resolveDayStatus(
  dayKey: string,
  setting: AttendanceSetting | null,
  override?: OverrideStatus | null,
): DayResolution {
  if (override === "work" || override === "off") {
    return { status: override, source: "manual" };
  }

  // 没设过就用默认制度：界面永远有答案，不会出现「未定」
  const active = setting ?? DEFAULT_SETTING;
  const weekday = weekdayOf(dayKey);

  // 周六：唯一跟制度走的一天
  if (weekday === 6) {
    // 单休 / 双休：制度本身就是答案
    if (active.saturdayMode !== "alternate") {
      return { status: active.saturdayMode, source: "saturday-mode" };
    }
    // 单双休：锚点缺失是数据异常，退回默认的锚点（不返回「未定」，
    // 那个状态在界面上已经不存在了）
    const anchor =
      active.anchor && isSaturday(active.anchor.saturday)
        ? active.anchor
        : (DEFAULT_SETTING.anchor as NonNullable<AttendanceSetting["anchor"]>);
    return {
      status: alternateStatus(dayKey, anchor),
      source: "saturday-mode",
    };
  }

  // 周一到周五上班，周日休息
  return { status: weekday === 0 ? "off" : "work", source: "weekday" };
}

/**
 * 单双休：与基准周六差**偶数周**的那一周跟基准同类型，奇数周相反。
 *
 * 周差用「两个周六相差几天 ÷ 7」，负数（基准在后面的周）同样成立：
 * 取模后必须先归一化成正数再判奇偶——`-1 % 2 === -1`，直接拿去比会漏掉「相反类型」。
 */
function alternateStatus(dayKey: string, anchor: AlternateAnchor): OverrideStatus {
  const weeks = Math.round(daysBetween(dayKey, anchor.saturday) / 7);
  const sameType = ((weeks % 2) + 2) % 2 === 0;
  const isWork = sameType ? anchor.isWork : !anchor.isWork;
  return isWork ? "work" : "off";
}

/** 界面文案：上班 / 休息 / 未设定。 */
export function statusLabel(status: DayStatus): string {
  if (status === "work") return "上班";
  if (status === "off") return "休息";
  return "未设定";
}
