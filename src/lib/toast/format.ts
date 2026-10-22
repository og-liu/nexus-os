/**
 * 通知文案（纯函数，可单测）。
 *
 * 删除成功的提示要带上「删的是哪条」，否则连删两条时根本分不清哪条成功了。
 * 但便签正文可能很长、还可能带换行——直接塞进一行提示会把卡片撑变形：
 * 所以压成一行、超长截断（按**字符数**算，一个汉字算 1，与便签字数统计同一口径）。
 */
export const TOAST_TEXT_MAX_CHARS = 24;

/**
 * `便签「服务器 8/20 到期」已删除`。
 *
 * - 正文为空（理论上不会发生，数据库有非空约束）时退化成 `便签已删除`；
 * - 多行正文压成一行（连续空白折成一个空格）；
 * - 超过 {@link TOAST_TEXT_MAX_CHARS} 个字符截断并加省略号。
 */
export function formatDeletedMessage(kind: string, text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat === "") return `${kind}已删除`;
  const chars = Array.from(flat);
  const summary =
    chars.length > TOAST_TEXT_MAX_CHARS
      ? `${chars.slice(0, TOAST_TEXT_MAX_CHARS).join("")}…`
      : flat;
  return `${kind}「${summary}」已删除`;
}
