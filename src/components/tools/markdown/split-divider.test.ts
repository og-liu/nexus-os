import { describe, expect, it } from "vitest";
import { clampRatio } from "./split-divider";

/**
 * 分割条边界（《功能/Markdown编辑器》§2.6）：编辑区 ≥ 360px、预览 ≥ 320px，
 * 算预览宽度时要把 6px 的分割条扣掉。容器太窄时两个下限各自缩到一半的一半。
 */
describe("分割条比例夹取", () => {
  it("1440 宽：50% 原样返回", () => {
    expect(clampRatio(0.5, 1440)).toBe(0.5);
  });

  it("往左拖过头：编辑区不小于 360px", () => {
    const ratio = clampRatio(0.05, 1440);
    expect(Math.round(ratio * 1440)).toBe(360);
  });

  it("往右拖过头：预览不小于 320px（扣掉 6px 分割条）", () => {
    const ratio = clampRatio(0.99, 1440);
    const editorPx = ratio * 1440;
    const previewPx = 1440 - 6 - editorPx;
    expect(Math.round(previewPx)).toBe(320);
  });

  it("窗口缩窄后同一比例会被夹回来（900 宽）", () => {
    // 在宽屏拖到 70%，缩到 900 后预览只剩 900-6-630=264px，必须被夹住
    const ratio = clampRatio(0.7, 900);
    const previewPx = 900 - 6 - ratio * 900;
    expect(previewPx).toBeGreaterThanOrEqual(319.5);
  });

  it("容器极窄（700 以下）时退化成各占一半的一半左右，仍然能拖", () => {
    const ratio = clampRatio(0.95, 600);
    expect(ratio).toBeLessThan(0.6);
    expect(ratio).toBeGreaterThan(0.4);
  });

  it("宽度无效时回落到 1:1，不返回 NaN", () => {
    expect(clampRatio(0.7, 0)).toBe(0.5);
    expect(clampRatio(Number.NaN, 1440)).toBe(0.5);
  });
});
