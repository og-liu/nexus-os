import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { createConnection, initSchema, type Db } from "@/lib/auth/db";
import { createUser } from "@/lib/auth/user";
import {
  clearOverride,
  clearSetting,
  getOverride,
  getSetting,
  listOverrides,
  overridesToMap,
  saveOverride,
  saveSetting,
} from "./data";
import { buildMonthView } from "./month-view";

/** 内存库 + 两个用户：归属隔离的用例需要「另外一个人」。 */
function setup() {
  const db = createConnection(":memory:");
  return {
    db,
    alice: createTestUser(db, "alice"),
    bob: createTestUser(db, "bob"),
  };
}

function createTestUser(db: Db, username: string) {
  const user = createUser(db, {
    username,
    usernameKey: username,
    passwordHash: "hash",
  });
  if (!user) throw new Error("测试用户创建失败");
  return user;
}

function countRows(db: Db, table: string, userId: number): number {
  const row = db
    .prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE user_id = ?`)
    .get(userId) as { count: number };
  return row.count;
}

describe("周六制度", () => {
  it("没设过返回 null，设完能读回，换制度只留一行", () => {
    const { db, alice } = setup();
    expect(getSetting(db, alice.id)).toBeNull();

    saveSetting(db, alice.id, { saturdayMode: "work", anchor: null }, 1000);
    expect(getSetting(db, alice.id)).toEqual({ saturdayMode: "work", anchor: null });

    saveSetting(db, alice.id, { saturdayMode: "off", anchor: null }, 2000);
    expect(getSetting(db, alice.id)).toEqual({ saturdayMode: "off", anchor: null });
    // user_id 是主键：换制度是 UPDATE 不是插第二行
    expect(countRows(db, "attendance_settings", alice.id)).toBe(1);
  });

  it("单双休把锚点一起存下来；切回单休时锚点两列写回 NULL", () => {
    const { db, alice } = setup();
    saveSetting(db, alice.id, {
      saturdayMode: "alternate",
      anchor: { saturday: "2026-10-24", isWork: true },
    });
    expect(getSetting(db, alice.id)).toEqual({
      saturdayMode: "alternate",
      anchor: { saturday: "2026-10-24", isWork: true },
    });

    // 换相位
    saveSetting(db, alice.id, {
      saturdayMode: "alternate",
      anchor: { saturday: "2026-10-24", isWork: false },
    });
    expect(getSetting(db, alice.id)?.anchor).toEqual({
      saturday: "2026-10-24",
      isWork: false,
    });

    // 切回双休：锚点没有意义了，不该留在库里
    saveSetting(db, alice.id, { saturdayMode: "off", anchor: null });
    expect(getSetting(db, alice.id)).toEqual({
      saturdayMode: "off",
      anchor: null,
    });
    const row = db
      .prepare(
        "SELECT anchor_saturday, anchor_is_work FROM attendance_settings WHERE user_id = ?",
      )
      .get(alice.id) as {
      anchor_saturday: string | null;
      anchor_is_work: number | null;
    };
    expect(row).toEqual({ anchor_saturday: null, anchor_is_work: null });
  });

  it("清除制度只删设置，手动覆盖保留", () => {
    const { db, alice } = setup();
    saveSetting(db, alice.id, { saturdayMode: "work", anchor: null });
    saveOverride(db, alice.id, "2026-10-24", "off");

    expect(clearSetting(db, alice.id)).toBe(1);
    expect(getSetting(db, alice.id)).toBeNull();
    expect(getOverride(db, alice.id, "2026-10-24")).toBe("off");
  });
});

describe("手动覆盖", () => {
  it("同一天改两次是覆盖旧值（一行），不是插两行", () => {
    const { db, alice } = setup();
    saveOverride(db, alice.id, "2026-10-26", "off", 1000);
    saveOverride(db, alice.id, "2026-10-26", "work", 2000);

    expect(getOverride(db, alice.id, "2026-10-26")).toBe("work");
    expect(countRows(db, "attendance_overrides", alice.id)).toBe(1);
  });

  it("按日期区间捞整月，边界闭区间", () => {
    const { db, alice } = setup();
    saveOverride(db, alice.id, "2026-09-27", "work");
    saveOverride(db, alice.id, "2026-09-28", "off");
    saveOverride(db, alice.id, "2026-10-26", "off");
    saveOverride(db, alice.id, "2026-11-08", "work");
    saveOverride(db, alice.id, "2026-11-09", "off");

    const rows = listOverrides(db, alice.id, "2026-09-28", "2026-11-08");
    expect(rows.map((row) => row.dayKey)).toEqual([
      "2026-09-28",
      "2026-10-26",
      "2026-11-08",
    ]);
  });

  it("删覆盖返回命中行数，「跟随自动」后查库为 0", () => {
    const { db, alice } = setup();
    saveOverride(db, alice.id, "2026-10-24", "off");

    expect(clearOverride(db, alice.id, "2026-10-24")).toBe(1);
    expect(clearOverride(db, alice.id, "2026-10-24")).toBe(0);
    expect(
      (
        db
          .prepare(
            "SELECT COUNT(*) AS count FROM attendance_overrides WHERE user_id = ? AND day_key = ?",
          )
          .get(alice.id, "2026-10-24") as { count: number }
      ).count,
    ).toBe(0);
  });
});

describe("账号隔离", () => {
  it("A 设的制度与覆盖，B 读不到", () => {
    const { db, alice, bob } = setup();
    saveSetting(db, alice.id, { saturdayMode: "work", anchor: null });
    saveOverride(db, alice.id, "2026-10-26", "off");

    expect(getSetting(db, bob.id)).toBeNull();
    expect(getOverride(db, bob.id, "2026-10-26")).toBeNull();
    expect(listOverrides(db, bob.id, "2026-01-01", "2026-12-31")).toEqual([]);
  });

  it("B 改同一天不会盖掉 A 的行", () => {
    const { db, alice, bob } = setup();
    saveOverride(db, alice.id, "2026-10-26", "off");
    saveOverride(db, bob.id, "2026-10-26", "work");

    expect(getOverride(db, alice.id, "2026-10-26")).toBe("off");
    expect(getOverride(db, bob.id, "2026-10-26")).toBe("work");
  });
});

describe("老表迁移（attendance_cycles → attendance_settings）", () => {
  it("旧结构里的「那周上班」搬成全局单休，旧表被删掉", () => {
    // 手工造一个「老库」：表还是 attendance_cycles，行里是基准周六 + 那周类型
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    db.exec(`
      CREATE TABLE users (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        username      TEXT    NOT NULL,
        username_key  TEXT    NOT NULL UNIQUE,
        password_hash TEXT    NOT NULL,
        created_at    INTEGER NOT NULL
      );
      CREATE TABLE attendance_cycles (
        user_id         INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        anchor_saturday TEXT    NOT NULL,
        anchor_is_work  INTEGER NOT NULL CHECK (anchor_is_work IN (0, 1)),
        created_at      INTEGER NOT NULL,
        updated_at      INTEGER NOT NULL
      );
      INSERT INTO users (username, username_key, password_hash, created_at)
        VALUES ('old', 'old', 'hash', 1);
      INSERT INTO attendance_cycles (user_id, anchor_saturday, anchor_is_work, created_at, updated_at)
        VALUES (1, '2026-10-24', 1, 111, 222);
    `);

    initSchema(db);

    expect(getSetting(db, 1)).toEqual({ saturdayMode: "work", anchor: null });
    expect(
      (
        db
          .prepare(
            "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'attendance_cycles'",
          )
          .get() as { count: number }
      ).count,
    ).toBe(0);

    // 幂等：再跑一次不会重复插入、也不报错
    initSchema(db);
    expect(getSetting(db, 1)).toEqual({ saturdayMode: "work", anchor: null });
    expect(countRows(db, "attendance_settings", 1)).toBe(1);
  });
});

describe("补列迁移（四列 attendance_settings → 加锚点两列）", () => {
  it("老库补上 anchor 两列后照常读取，锚点为 NULL；重复执行不报错", () => {
    // 手工造一个「上一版」的库：attendance_settings 只有四列
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    db.exec(`
      CREATE TABLE users (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        username      TEXT    NOT NULL,
        username_key  TEXT    NOT NULL UNIQUE,
        password_hash TEXT    NOT NULL,
        created_at    INTEGER NOT NULL
      );
      CREATE TABLE attendance_settings (
        user_id       INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        saturday_mode TEXT    NOT NULL CHECK (saturday_mode IN ('work', 'off')),
        created_at    INTEGER NOT NULL,
        updated_at    INTEGER NOT NULL
      );
      INSERT INTO users (username, username_key, password_hash, created_at)
        VALUES ('old', 'old', 'hash', 1);
      INSERT INTO attendance_settings (user_id, saturday_mode, created_at, updated_at)
        VALUES (1, 'off', 111, 222);
    `);

    initSchema(db);

    expect(getSetting(db, 1)).toEqual({ saturdayMode: "off", anchor: null });
    expect(
      (
        db
          .prepare("PRAGMA table_info(attendance_settings)")
          .all() as { name: string }[]
      ).map((column) => column.name),
    ).toEqual([
      "user_id",
      "saturday_mode",
      "anchor_saturday",
      "anchor_is_work",
      "created_at",
      "updated_at",
    ]);

    // 幂等：再跑一次不重复补列
    initSchema(db);
    expect(getSetting(db, 1)).toEqual({ saturdayMode: "off", anchor: null });
  });
});

describe("重建迁移（老 CHECK 只允许 work/off）", () => {
  it("重建后能存单双休；原来的行原样保留；重复执行不报错", () => {
    // 造一个「加了锚点列、但 CHECK 还是两档」的库——正是上一版留下的状态
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    db.exec(`
      CREATE TABLE users (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        username      TEXT    NOT NULL,
        username_key  TEXT    NOT NULL UNIQUE,
        password_hash TEXT    NOT NULL,
        created_at    INTEGER NOT NULL
      );
      CREATE TABLE attendance_settings (
        user_id         INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        saturday_mode   TEXT    NOT NULL CHECK (saturday_mode IN ('work', 'off')),
        anchor_saturday TEXT,
        anchor_is_work  INTEGER,
        created_at      INTEGER NOT NULL,
        updated_at      INTEGER NOT NULL
      );
      INSERT INTO users (username, username_key, password_hash, created_at)
        VALUES ('old', 'old', 'hash', 1);
      INSERT INTO attendance_settings (user_id, saturday_mode, created_at, updated_at)
        VALUES (1, 'off', 111, 222);
    `);

    initSchema(db);

    // 老行还在
    expect(getSetting(db, 1)).toEqual({ saturdayMode: "off", anchor: null });
    // CHECK 已经放开：这一次写入在老库里会报 CHECK constraint failed
    const setting = {
      saturdayMode: "alternate" as const,
      anchor: { saturday: "2026-10-24", isWork: true },
    };
    saveSetting(db, 1, setting);
    expect(getSetting(db, 1)).toEqual(setting);

    // 幂等
    initSchema(db);
    expect(getSetting(db, 1)).toEqual(setting);
  });
});

describe("删列迁移（attendance_overrides 带 note → 删掉）", () => {
  it("老库的 note 列消失、覆盖行原样保留；重复执行不报错", () => {
    // 手工造一个「带 note 列」的老库：这列建出来却从来没有写入路径（2026-10-24 删掉）
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    db.exec(`
      CREATE TABLE users (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        username      TEXT    NOT NULL,
        username_key  TEXT    NOT NULL UNIQUE,
        password_hash TEXT    NOT NULL,
        created_at    INTEGER NOT NULL
      );
      CREATE TABLE attendance_overrides (
        user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        day_key    TEXT    NOT NULL,
        status     TEXT    NOT NULL CHECK (status IN ('work', 'off')),
        note       TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, day_key)
      ) WITHOUT ROWID;
      INSERT INTO users (username, username_key, password_hash, created_at)
        VALUES ('old', 'old', 'hash', 1);
      INSERT INTO attendance_overrides (user_id, day_key, status, note, created_at, updated_at)
        VALUES (1, '2026-10-26', 'off', '国庆调休', 111, 222);
    `);

    initSchema(db);

    const columns = () =>
      (
        db.prepare("PRAGMA table_info(attendance_overrides)").all() as {
          name: string;
        }[]
      ).map((column) => column.name);

    expect(columns()).not.toContain("note");

    // 原有的覆盖行一条不少、状态没变（删的只是一列没人用的备注）
    expect(listOverrides(db, 1, "2026-10-01", "2026-10-31")).toEqual([
      { dayKey: "2026-10-26", status: "off" },
    ]);

    // 幂等：再跑一次不报错、不重复删
    initSchema(db);
    expect(columns()).not.toContain("note");
    expect(countRows(db, "attendance_overrides", 1)).toBe(1);
  });
});

describe("buildMonthView", () => {
  it("42 格全部带状态；覆盖标 manual，制度管所有周六", () => {
    const { db, alice } = setup();
    saveSetting(db, alice.id, { saturdayMode: "work", anchor: null });
    saveOverride(db, alice.id, "2026-10-26", "off");
    const overrides = overridesToMap(
      listOverrides(db, alice.id, "2026-09-28", "2026-11-08"),
    );

    const days = buildMonthView({
      year: 2026,
      month: 10,
      todayKey: "2026-10-26",
      setting: getSetting(db, alice.id),
      overrides,
    });

    expect(days).toHaveLength(42);
    const byKey = new Map(days.map((day) => [day.dayKey, day]));
    expect(byKey.get("2026-10-26")).toMatchObject({
      status: "off",
      source: "manual",
      overridden: true,
      isToday: true,
      labels: null,
    });
    // 单休：连着的两个周六都是「班」
    expect(byKey.get("2026-10-24")).toMatchObject({
      status: "work",
      source: "saturday-mode",
      overridden: false,
    });
    expect(byKey.get("2026-10-31")).toMatchObject({ status: "work" });
    expect(byKey.get("2026-11-07")).toMatchObject({ status: "work" });
    expect(byKey.get("2026-10-25")).toMatchObject({ status: "off" });
  });

  it("工具页的 withLabels：42 格（含跨月补齐）都带农历/节日", () => {
    const days = buildMonthView({
      year: 2026,
      month: 10,
      todayKey: "2026-10-01",
      setting: null,
      overrides: new Map(),
      withLabels: true,
    });
    expect(days).toHaveLength(42);
    expect(days.every((day) => day.labels !== null)).toBe(true);

    const octFirst = days.find((day) => day.dayKey === "2026-10-01");
    expect(octFirst?.labels?.festival).toBe("国庆节");
    // 跨月的格子：照样有标注，只是 inMonth 为 false（界面上日期灰掉）
    const previousMonth = days.find((day) => day.dayKey === "2026-09-28");
    expect(previousMonth).toMatchObject({ inMonth: false });
    expect(previousMonth?.labels?.lunarDay).toBe("十八");
  });

  it("跨月补齐的格子也按制度算状态（不是空白占位）", () => {
    const days = buildMonthView({
      year: 2026,
      month: 10,
      todayKey: "2026-10-01",
      setting: { saturdayMode: "work", anchor: null },
      overrides: new Map(),
    });
    const byKey = new Map(days.map((day) => [day.dayKey, day]));
    // 9-28 周一：上班；11-07 周六（跨月、单休制度）：上班；11-08 周日：休息
    expect(byKey.get("2026-09-28")).toMatchObject({
      inMonth: false,
      status: "work",
    });
    expect(byKey.get("2026-11-07")).toMatchObject({
      inMonth: false,
      status: "work",
    });
    expect(byKey.get("2026-11-08")).toMatchObject({
      inMonth: false,
      status: "off",
    });
  });
});
