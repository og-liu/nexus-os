import { describe, expect, it } from "vitest";
import { dayLabels } from "./day-label";

/**
 * 每格标注的用例（《功能/工作日历》§三「每格节日放几个」、§六 验收 9）。
 *
 * 三个日期直接取自验收清单：10-01 国庆节（公历节日）、10-08 寒露（节气）、
 * 10-18 重阳节（农历节日）；再补一个什么都没有的日子，兜底应给农历日。
 */
describe("dayLabels", () => {
  it("公历节日优先：2026-10-01 是国庆节", () => {
    const labels = dayLabels("2026-10-01");
    expect(labels?.festival).toBe("国庆节");
    expect(labels?.lunarFull).toBe("农历八月廿一");
  });

  it("节气能显示：2026-10-08 是寒露", () => {
    const labels = dayLabels("2026-10-08");
    expect(labels?.festival).toBe("寒露");
  });

  it("农历节日能显示：2026-10-18 是重阳节", () => {
    const labels = dayLabels("2026-10-18");
    expect(labels?.festival).toBe("重阳节");
  });

  it("没有节日时兜底成农历日：2026-10-24 是农历九月十五", () => {
    const labels = dayLabels("2026-10-24");
    expect(labels?.festival).toBeNull();
    expect(labels?.lunarDay).toBe("十五");
    expect(labels?.lunarFull).toBe("农历九月十五");
  });

  it("非法日期返回 null（不抛错）", () => {
    expect(dayLabels("2026-02-31")).toBeNull();
    expect(dayLabels("not-a-date")).toBeNull();
  });
});
