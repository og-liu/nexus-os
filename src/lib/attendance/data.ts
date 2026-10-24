import type { Db } from "@/lib/auth/db";
import type { AttendanceSetting, OverrideStatus, SaturdayMode } from "./schedule";

/**
 * 工作日历的两张表（《功能/工作日历》§三 数据模型）。
 *
 * 分工与便签一致：这里只碰数据库，不碰 cookie 与请求上下文；服务端操作在 `actions.ts`。
 * 每条 SQL 都带 `user_id = ?`——数据按账号隔离，「只有一个用户」不是理由。
 *
 * 两张表各管一件事：
 * - `attendance_settings`：**一个人一行**（`user_id` 是主键），装周六制度（单休 / 双休 / 单双休）
 *   与单双休的锚点。改制度就 UPSERT，不会堆出第二行；
 * - `attendance_overrides`：装用户真正改过的日子，`(user_id, day_key)` 是主键。
 *   「跟随自动」= 删掉这一行，而不是写一个 `'auto'` 值——用字符串表达「没有这条记录」，
 *   会让每处查询都多一层判断（§三「不给 status 存 auto」）。
 */

/** 库里的一行覆盖（2026-10-24 起没有 `note`：那一列是空壳，已删）。 */
export interface AttendanceOverride {
  dayKey: string;
  status: OverrideStatus;
}

interface SettingRow {
  saturday_mode: SaturdayMode;
  anchor_saturday: string | null;
  anchor_is_work: number | null;
}

interface OverrideRow {
  day_key: string;
  status: OverrideStatus;
}

/**
 * 取某人的出勤设置；没设过返回 null（界面上就是「未设定」的初始态）。
 *
 * 锚点只有单双休（`alternate`）才有：老行是单休 / 双休时两列都是 NULL，
 * 这里按 null 读出来，推算函数不会去碰它。
 */
export function getSetting(db: Db, userId: number): AttendanceSetting | null {
  const row = db
    .prepare(
      "SELECT saturday_mode, anchor_saturday, anchor_is_work FROM attendance_settings WHERE user_id = ?",
    )
    .get(userId) as SettingRow | undefined;
  if (!row) return null;

  const anchor =
    row.saturday_mode === "alternate" &&
    row.anchor_saturday !== null &&
    row.anchor_is_work !== null
      ? { saturday: row.anchor_saturday, isWork: row.anchor_is_work === 1 }
      : null;

  return { saturdayMode: row.saturday_mode, anchor };
}

/**
 * 写周六制度（UPSERT）。
 *
 * `user_id` 同时是主键，所以「换制度」天然只有一行；冲突时改制度与锚点
 * 并刷新 `updated_at`，`created_at` 保持第一次设定时的时刻。
 * 单休 / 双休时锚点两列写 NULL——不给「没在用的数据」留位置。
 */
export function saveSetting(
  db: Db,
  userId: number,
  setting: AttendanceSetting,
  now = Date.now(),
): void {
  const anchor = setting.saturdayMode === "alternate" ? setting.anchor : null;
  db.prepare(
    `INSERT INTO attendance_settings
       (user_id, saturday_mode, anchor_saturday, anchor_is_work, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       saturday_mode   = excluded.saturday_mode,
       anchor_saturday = excluded.anchor_saturday,
       anchor_is_work  = excluded.anchor_is_work,
       updated_at      = excluded.updated_at`,
  ).run(
    userId,
    setting.saturdayMode,
    anchor?.saturday ?? null,
    anchor ? (anchor.isWork ? 1 : 0) : null,
    now,
    now,
  );
}

/**
 * 清掉制度设置：只删 `attendance_settings` 这一行，所有周六回到「未设定」。
 *
 * **手动覆盖照旧保留**（它们优先级更高、跟制度无关），这是「清除」而不是「全部清除」
 * （§七「清基准后覆盖还活着」）。返回删掉的行数，调用方据此判断有没有东西可删。
 */
export function clearSetting(db: Db, userId: number): number {
  return db
    .prepare("DELETE FROM attendance_settings WHERE user_id = ?")
    .run(userId).changes;
}

/**
 * 取 `[fromDayKey, toDayKey]` 之间的覆盖行。
 *
 * 一次捞整月（月历其实要 42 格，跨月部分一起带上），按主键区间扫，不做 N 次日查询。
 * `day_key` 是 `YYYY-MM-DD`，字典序与时间序一致，`BETWEEN` 直接可用。
 */
export function listOverrides(
  db: Db,
  userId: number,
  fromDayKey: string,
  toDayKey: string,
): AttendanceOverride[] {
  const rows = db
    .prepare(
      `SELECT day_key, status FROM attendance_overrides
       WHERE user_id = ? AND day_key BETWEEN ? AND ?
       ORDER BY day_key`,
    )
    .all(userId, fromDayKey, toDayKey) as OverrideRow[];

  return rows.map((row) => ({
    dayKey: row.day_key,
    status: row.status,
  }));
}

/** 覆盖行摊成 Map，供推算函数按天取用。 */
export function overridesToMap(
  overrides: readonly AttendanceOverride[],
): Map<string, OverrideStatus> {
  return new Map(overrides.map((item) => [item.dayKey, item.status]));
}

/** 取某一天的覆盖状态；没有返回 null。 */
export function getOverride(
  db: Db,
  userId: number,
  dayKey: string,
): OverrideStatus | null {
  const row = db
    .prepare(
      "SELECT status FROM attendance_overrides WHERE user_id = ? AND day_key = ?",
    )
    .get(userId, dayKey) as { status: OverrideStatus } | undefined;
  return row?.status ?? null;
}

/**
 * 写某一天的覆盖（UPSERT）。
 *
 * 同一天再改一次就是覆盖旧值，不会堆行。
 */
export function saveOverride(
  db: Db,
  userId: number,
  dayKey: string,
  status: OverrideStatus,
  now = Date.now(),
): void {
  db.prepare(
    `INSERT INTO attendance_overrides (user_id, day_key, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, day_key) DO UPDATE SET
       status     = excluded.status,
       updated_at = excluded.updated_at`,
  ).run(userId, dayKey, status, now, now);
}

/** 删掉某一天的覆盖（「跟随自动」）；返回删掉的行数。 */
export function clearOverride(
  db: Db,
  userId: number,
  dayKey: string,
): number {
  return db
    .prepare("DELETE FROM attendance_overrides WHERE user_id = ? AND day_key = ?")
    .run(userId, dayKey).changes;
}
