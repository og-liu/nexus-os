/**
 * Markdown 文档的服务端校验（《功能/Markdown编辑器》§三、§六 验收 20–21）。
 *
 * **为什么校验放在这里而不是只放客户端**：Server Action 是公开的 HTTP 端点，
 * 谁都能直接调。输入框上的 `maxLength` 只是让输入舒服，不是防线。
 *
 * 上限都按**字符数**算（`Array.from`）：一个汉字算 1、一个 emoji 也算 1——
 * `length` 会把 emoji 数成 2，用户会莫名其妙被挡住。
 *
 * 两个上限只活在这一层（表里是 TEXT，不给长度约束）：SQLite 的长度约束在改表时
 * 很难受，而这两个数字以后可能调（《数据库/Markdown文档表》§四）。
 */

/** 标题上限。左栏只有 240px 宽，再长也只能截断。 */
export const TITLE_MAX = 60;

/**
 * 正文上限。10 万字足够一篇长文，同时挡住「一次写入几 MB 文本」这种事故。
 *
 * 正文**不 trim**：Markdown 里行首的缩进是有意义的（代码块、嵌入列表），
 * 两头空白也是用户敲出来的内容，改了就不是「原文」了。
 */
export const BODY_MAX = 100_000;

/** 标题为空时的占位名（新建 / 清空标题时用；撞名补序号，见 `nextUntitledTitle`）。 */
export const UNTITLED = "未命名文档";

export type Validated<T> = { ok: true; value: T } | { ok: false; error: string };

/** 按「字符」数长度：一个汉字算 1，一个 emoji 算 1。状态栏的字数也用它。 */
export function charCount(value: string): number {
  return Array.from(value).length;
}

/**
 * 标题：`trim()` 后为空一律变成「未命名文档」——**不报错**。
 *
 * 理由是产品判断：用户新建一篇然后直接开始写正文，是正常用法；标题框的占位
 * 本来就写着「未命名文档」。为这点事拦住保存，反而逼人先想名字才能动笔。
 * 重名不在这里处理：补序号要知道库里已有哪些标题，属于数据层（`nextUntitledTitle`）。
 */
export function validateTitle(raw: unknown): Validated<string> {
  if (typeof raw !== "string") return { ok: false, error: "标题格式不正确" };
  const title = raw.trim();
  if (title === "") return { ok: true, value: UNTITLED };
  if (charCount(title) > TITLE_MAX) {
    return { ok: false, error: `标题最多 ${TITLE_MAX} 个字` };
  }
  return { ok: true, value: title };
}

/** 正文：允许为空（新建出来就是空文档）；只挡上限与类型。 */
export function validateBody(raw: unknown): Validated<string> {
  if (typeof raw !== "string") return { ok: false, error: "正文格式不正确" };
  if (charCount(raw) > BODY_MAX) {
    return { ok: false, error: `正文最多 ${BODY_MAX} 个字` };
  }
  return { ok: true, value: raw };
}

/** 文档 id：只收正整数（跨用户传入别人的 id 由数据层的 `user_id = ?` 兜住）。 */
export function validateId(raw: unknown): Validated<number> {
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw <= 0) {
    return { ok: false, error: "文档不存在" };
  }
  return { ok: true, value: raw };
}
