/**
 * 导出 `.md` 的文件名（《功能/Markdown编辑器》§七「导出文件名带非法字符」）。
 *
 * 标题是用户随便敲的，可能带 `/`、`:`、`?`——在 macOS / Windows 上这些字符会让
 * 浏览器把文件名截断或直接拒绝保存，所以一律替换成 `-`。
 * 标题为空时退回「未命名文档」，与库里的占位名保持一致。
 *
 * 纯函数：不碰 DOM，能单测。真正的下载动作在视图里（`Blob` + `<a download>`）。
 */

/** 合法文本之外的一切（`\ / : * ? " < > |` 与控制字符）都换成 `-`。 */
const ILLEGAL = /[\\/:*?"<>|\u0000-\u001f]/g;

/** 标题 → 文件名（不含 `.md`）。 */
export function exportFileName(title: string, fallback = "未命名文档"): string {
  const name = title.replace(ILLEGAL, "-").replace(/\s+/g, " ").trim();
  // 全是非法字符时（比如标题就是 "/"）也要有名字，否则下载下来叫 "-.md"
  return name === "" || /^-+$/.test(name) ? fallback : name;
}
