import { describe, expect, it } from "vitest";
import { exportFileName } from "./export-name";

/** 导出文件名的用例（《功能/HTML编辑器》§六 验收 43（沿用 Markdown 版清洗规则））。 */
describe("导出文件名", () => {
  it("普通标题原样用，空格保留", () => {
    expect(exportFileName("周报 10-30")).toBe("周报 10-30");
  });

  it("非法字符一律换成 `-`", () => {
    expect(exportFileName('a/b:c*d?e"f<g>h|i\\j')).toBe("a-b-c-d-e-f-g-h-i-j");
  });

  it("空标题 / 纯空白退回「未命名文档」", () => {
    expect(exportFileName("")).toBe("未命名文档");
    expect(exportFileName("   ")).toBe("未命名文档");
  });

  it("全是非法字符时也退回「未命名文档」（不会下载出 `-.html`）", () => {
    expect(exportFileName("///")).toBe("未命名文档");
  });
});
