"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/current-user";
import { getDb } from "@/lib/auth/db";
import {
  clearOverride,
  clearSetting,
  getOverride,
  getSetting,
  saveOverride,
  saveSetting,
} from "./data";
import { isDayKey, isSaturday } from "./month-grid";
import {
  isOverrideStatus,
  isSaturdayMode,
  resolveDayStatus,
  type DaySource,
  type DayStatus,
  type AttendanceSetting,
  type OverrideStatus,
  type SaturdayMode,
} from "./schedule";

/**
 * 工作日历的 Server Actions（《功能/工作日历》§2.4、§2.5）。
 *
 * 两个前提与便签一致：
 * 1. Server Action 是**公开 HTTP 端点**——状态、日期、制度全部在服务端再校验一遍，
 *    浏览器里的按钮不是防线；
 * 2. 每个 action 第一件事是 `requireUser()`，后续 SQL 的 `user_id` 都来自它。
 *
 * 写完统一返回**这一天的最新推算结果**：客户端拿它立刻把格子改掉（点完不用等整页刷新），
 * 同时 `revalidatePath` 让首页卡与工具页在下一次渲染拿到新数据——
 * 「今天 · 休息」这一行、顶部提示条、所有周六都是服务端算的，只有刷新才会变。
 */
export interface AttendanceDayResult {
  dayKey: string;
  /** 实际状态（覆盖 > 周六制度 > 星期兜底）。 */
  status: DayStatus;
  source: DaySource;
  /** 这一天有没有覆盖行。 */
  overridden: boolean;
}

export type AttendanceActionResult =
  | { ok: true; day: AttendanceDayResult | null }
  | { ok: false; error: string };

function fail(error: string): AttendanceActionResult {
  return { ok: false, error };
}

/** 首页工作日历卡与工具页读同一份数据，写完一起失效。 */
function revalidateAttendance(): void {
  revalidatePath("/");
  revalidatePath("/tools/attendance-calendar");
}

/** 写完之后重新解一次这一天——状态的真相只有 `resolveDayStatus` 一份。 */
function readDay(userId: number, dayKey: string): AttendanceDayResult {
  const db = getDb();
  const override = getOverride(db, userId, dayKey);
  const resolved = resolveDayStatus(dayKey, getSetting(db, userId), override);
  return {
    dayKey,
    status: resolved.status,
    source: resolved.source,
    overridden: override !== null,
  };
}

/**
 * 改某一天：写 `attendance_overrides`。
 *
 * 任何一天都一样——周六没有「点一下改全年」的特殊语义了（全年由「设置」里的周六制度决定）。
 * 覆盖的优先级最高：改了就是它，换制度也不会动它（2026-10-23 联调口径）。
 *
 * **点回推算值 = 跟随自动**：如果选的状态跟按制度算出来的一样，就不写覆盖、把已有的覆盖删掉。
 * 否则「改成班 → 再改回休」之后库里还留着一条等于推算值的覆盖，界面上那根「已手动调整」
 * 小横条一直挂着，主人会以为没改回去（2026-10-23 联调指出）。
 */
export async function setDayStatusAction(
  dayKey: string,
  status: OverrideStatus,
): Promise<AttendanceActionResult> {
  const user = await requireUser();
  if (!isDayKey(dayKey)) return fail("日期不合法");
  if (!isOverrideStatus(status)) return fail("状态不合法");

  const db = getDb();
  // 先算「不看覆盖」时的推算值：选的就是它 → 等于「跟随自动」
  const auto = resolveDayStatus(dayKey, getSetting(db, user.id), null).status;
  if (auto === status) {
    clearOverride(db, user.id, dayKey);
  } else {
    saveOverride(db, user.id, dayKey, status);
  }

  revalidateAttendance();
  return { ok: true, day: readDay(user.id, dayKey) };
}

/**
 * 「跟随自动」：删掉这一天的覆盖行，回到推算值（周六按制度、其余按星期）。
 *
 * **不碰制度设置**——想清制度要走「设置」里的「清除」，
 * 否则「我只想把这一天改回去」会顺手把全年重排（§七「覆盖与基准互相覆盖」）。
 */
export async function followAutoAction(
  dayKey: string,
): Promise<AttendanceActionResult> {
  const user = await requireUser();
  if (!isDayKey(dayKey)) return fail("日期不合法");

  clearOverride(getDb(), user.id, dayKey);
  revalidateAttendance();
  return { ok: true, day: readDay(user.id, dayKey) };
}

/**
 * 设置里的「保存」：写周六制度（单休 / 双休 / 单双休）。
 *
 * 只接受三个字面量：从网络来的 `"single"`、`1`、`null` 一律拒绝。
 * 单双休必须带锚点，而且锚点**必须是周六**——它决定「哪一周是单休」，
 * 存错一天整年的单双周就整体错位，界面上还看不出来。
 */
export async function saveSaturdayModeAction(
  saturdayMode: SaturdayMode,
  anchorSaturday: string | null,
  anchorIsWork: boolean | null,
): Promise<AttendanceActionResult> {
  const user = await requireUser();
  if (!isSaturdayMode(saturdayMode)) return fail("周六制度不合法");

  let setting: AttendanceSetting = { saturdayMode, anchor: null };
  if (saturdayMode === "alternate") {
    if (!anchorSaturday || !isDayKey(anchorSaturday)) return fail("基准周六不合法");
    if (!isSaturday(anchorSaturday)) return fail("基准必须是周六");
    if (typeof anchorIsWork !== "boolean") return fail("基准周类型不合法");
    setting = {
      saturdayMode,
      anchor: { saturday: anchorSaturday, isWork: anchorIsWork },
    };
  }

  saveSetting(getDb(), user.id, setting);
  revalidateAttendance();
  return { ok: true, day: null };
}

/** 设置里的「清除」：只删制度设置，手动覆盖保留。 */
export async function clearSettingAction(): Promise<AttendanceActionResult> {
  const user = await requireUser();
  clearSetting(getDb(), user.id);
  revalidateAttendance();
  return { ok: true, day: null };
}
