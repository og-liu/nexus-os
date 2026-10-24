import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTING,
  isOverrideStatus,
  isSaturdayMode,
  resolveDayStatus,
  statusLabel,
  type AttendanceSetting,
} from "./schedule";

/**
 * 推算规则的用例（《功能/出勤日历》§三「推算函数」、§六 验收）。
 *
 * 固定日期都用 2026 年 10 月：10-23 周五、10-24 周六、10-25 周日、10-26 周一、10-31 周六。
 *
 * 三层优先级是本功能唯一不能搞错的东西：**手动覆盖 > 周六制度 > 星期兜底**。
 */
const single: AttendanceSetting = { saturdayMode: "work", anchor: null }; // 单休：每周六上班
const double: AttendanceSetting = { saturdayMode: "off", anchor: null }; // 双休：每周六休息

/** 单双休（大小周）：以 2026-10-24 那周为基准，那周单休。 */
const alternateFromWork: AttendanceSetting = {
  saturdayMode: "alternate",
  anchor: { saturday: "2026-10-24", isWork: true },
};

/** 同一个基准，但那周是双休。 */
const alternateFromOff: AttendanceSetting = {
  saturdayMode: "alternate",
  anchor: { saturday: "2026-10-24", isWork: false },
};

describe("resolveDayStatus · 没设过制度（走默认制度）", () => {
  it("默认制度 = 单双休，从 2026-10-24 那周起双休周", () => {
    expect(DEFAULT_SETTING.saturdayMode).toBe("alternate");
    expect(DEFAULT_SETTING.anchor).toEqual({
      saturday: "2026-10-24",
      isWork: false,
    });
  });

  it("周一到周五上班、周日休息", () => {
    expect(resolveDayStatus("2026-10-26", null)).toEqual({
      status: "work",
      source: "weekday",
    });
    expect(resolveDayStatus("2026-10-23", null)).toEqual({
      status: "work",
      source: "weekday",
    });
    expect(resolveDayStatus("2026-10-25", null)).toEqual({
      status: "off",
      source: "weekday",
    });
  });

  it("周六按默认制度交替：10-24 双休、10-31 单休、11-07 双休", () => {
    expect(resolveDayStatus("2026-10-24", null)).toEqual({
      status: "off",
      source: "saturday-mode",
    });
    expect(resolveDayStatus("2026-10-31", null).status).toBe("work");
    expect(resolveDayStatus("2026-11-07", null).status).toBe("off");
    expect(resolveDayStatus("2026-10-17", null).status).toBe("work");
  });
});

describe("resolveDayStatus · 周六制度", () => {
  it("单休：每个周六都上班（不是隔周）", () => {
    for (const dayKey of ["2026-10-03", "2026-10-24", "2026-10-31", "2026-11-07"]) {
      expect(resolveDayStatus(dayKey, single)).toEqual({
        status: "work",
        source: "saturday-mode",
      });
    }
  });

  it("双休：每个周六都休息", () => {
    for (const dayKey of ["2026-10-24", "2026-10-31", "2026-11-07"]) {
      expect(resolveDayStatus(dayKey, double)).toEqual({
        status: "off",
        source: "saturday-mode",
      });
    }
  });

  it("制度不影响周日与工作日", () => {
    expect(resolveDayStatus("2026-10-25", single)).toEqual({
      status: "off",
      source: "weekday",
    });
    expect(resolveDayStatus("2026-10-26", double)).toEqual({
      status: "work",
      source: "weekday",
    });
  });
});

describe("resolveDayStatus · 单双休（大小周）", () => {
  it("基准那周单休 → 本周六班、下周休、再下周班", () => {
    expect(resolveDayStatus("2026-10-24", alternateFromWork)).toEqual({
      status: "work",
      source: "saturday-mode",
    });
    expect(resolveDayStatus("2026-10-31", alternateFromWork).status).toBe("off");
    expect(resolveDayStatus("2026-11-07", alternateFromWork).status).toBe("work");
    expect(resolveDayStatus("2026-11-14", alternateFromWork).status).toBe("off");
  });

  it("基准那周双休 → 相位相反", () => {
    expect(resolveDayStatus("2026-10-24", alternateFromOff).status).toBe("off");
    expect(resolveDayStatus("2026-10-31", alternateFromOff).status).toBe("work");
    expect(resolveDayStatus("2026-11-07", alternateFromOff).status).toBe("off");
  });

  it("基准之前的日子同样按周差推算（负周数的奇偶要归一化）", () => {
    // 基准 10-24（单休）：往前 1 周（10-17）相反 = 休，往前 2 周（10-10）同类型 = 班
    expect(resolveDayStatus("2026-10-17", alternateFromWork).status).toBe("off");
    expect(resolveDayStatus("2026-10-10", alternateFromWork).status).toBe("work");
    expect(resolveDayStatus("2026-09-26", alternateFromWork).status).toBe("work");
    expect(resolveDayStatus("2026-09-19", alternateFromWork).status).toBe("off");
  });

  it("交替只作用在周六：周日与工作日不受影响", () => {
    expect(resolveDayStatus("2026-10-25", alternateFromWork)).toEqual({
      status: "off",
      source: "weekday",
    });
    expect(resolveDayStatus("2026-10-26", alternateFromWork)).toEqual({
      status: "work",
      source: "weekday",
    });
  });

  it("交替模式缺锚点时退回默认锚点，不会给出「未定」", () => {
    expect(
      resolveDayStatus("2026-10-24", { saturdayMode: "alternate", anchor: null }),
    ).toEqual({ status: "off", source: "saturday-mode" });
  });
});

describe("resolveDayStatus · 手动覆盖最优先", () => {
  it("把工作日改成休息", () => {
    expect(resolveDayStatus("2026-10-26", single, "off")).toEqual({
      status: "off",
      source: "manual",
    });
  });

  it("把周日改成上班", () => {
    expect(resolveDayStatus("2026-10-25", double, "work")).toEqual({
      status: "work",
      source: "manual",
    });
  });

  it("单休制度下手动把某个周六改成休：这一天是休，其余周六仍是班", () => {
    expect(resolveDayStatus("2026-10-24", single, "off")).toEqual({
      status: "off",
      source: "manual",
    });
    expect(resolveDayStatus("2026-10-31", single)).toEqual({
      status: "work",
      source: "saturday-mode",
    });
  });

  it("换了制度也冲不掉手动改过的那一天（联调口径：手动改的最优先）", () => {
    // 单休制度下把 10-31 手动改成休，然后切双休：那天仍然是手动的「休」
    expect(resolveDayStatus("2026-10-31", double, "off")).toEqual({
      status: "off",
      source: "manual",
    });
    // 反过来也一样：双休制度下手动改成的「班」不会被单休制度抢走署名
    expect(resolveDayStatus("2026-10-31", single, "work")).toEqual({
      status: "work",
      source: "manual",
    });
  });

  it("没选制度时的手动覆盖同样生效", () => {
    expect(resolveDayStatus("2026-10-24", null, "work")).toEqual({
      status: "work",
      source: "manual",
    });
  });
});

describe("状态文案与校验", () => {
  it("三种状态各有文案", () => {
    expect(statusLabel("work")).toBe("上班");
    expect(statusLabel("off")).toBe("休息");
    expect(statusLabel("unset")).toBe("未设定");
  });

  it("只接受 work / off 落库（unset 不进库）", () => {
    expect(isOverrideStatus("work")).toBe(true);
    expect(isOverrideStatus("off")).toBe(true);
    expect(isOverrideStatus("unset")).toBe(false);
    expect(isOverrideStatus("AUTO")).toBe(false);
    expect(isOverrideStatus(null)).toBe(false);
  });

  it("周六制度只认 work / off / alternate 三个字面量", () => {
    expect(isSaturdayMode("work")).toBe(true);
    expect(isSaturdayMode("off")).toBe(true);
    expect(isSaturdayMode("alternate")).toBe(true);
    expect(isSaturdayMode("single")).toBe(false);
    expect(isSaturdayMode(1)).toBe(false);
    expect(isSaturdayMode(undefined)).toBe(false);
  });
});
