import { describe, expect, it } from "vitest";
import { mergeFestivals } from "./festivals";

describe("节日三源合并（公历 → 农历 → 节气，同名只留一条）", () => {
  it("顺序固定：公历节日在前、农历节日居中、节气在最后", () => {
    expect(
      mergeFestivals({ solar: ["国庆节"], lunar: ["中秋节"], jieQi: "寒露" }),
    ).toEqual(["国庆节", "中秋节", "寒露"]);
  });

  it("跨源同名只出现一次（保留第一次出现的位置）", () => {
    expect(
      mergeFestivals({ solar: ["元旦节"], lunar: ["元旦节"], jieQi: "元旦节" }),
    ).toEqual(["元旦节"]);
  });

  it("同一来源内部的重复也去掉", () => {
    expect(
      mergeFestivals({ solar: ["国庆节", "国庆节"], lunar: ["国庆节"] }),
    ).toEqual(["国庆节"]);
  });

  it("节气是空串（非节气日）时不产生空标签", () => {
    expect(
      mergeFestivals({ solar: ["国庆节"], lunar: [], jieQi: "" }),
    ).toEqual(["国庆节"]);
  });

  it("三源都空 → 空数组（面板据此让整个标签组不渲染）", () => {
    expect(mergeFestivals()).toEqual([]);
    expect(mergeFestivals({ solar: [], lunar: [], jieQi: "" })).toEqual([]);
  });

  it("多个节日全部保留，不截断、不折叠", () => {
    expect(
      mergeFestivals({
        solar: ["元旦节", "父亲节"],
        lunar: ["春节"],
        jieQi: "夏至",
      }),
    ).toEqual(["元旦节", "父亲节", "春节", "夏至"]);
  });

  it("不碰 getOtherFestivals()：只渲染传进来的三个来源", () => {
    // 国际日之类的噪音由调用方（today.ts）不传入来挡掉，这里不该凭空多出任何东西
    const labels = mergeFestivals({ solar: ["父亲节"], jieQi: "夏至" });
    expect(labels).toEqual(["父亲节", "夏至"]);
  });
});
