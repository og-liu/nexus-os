/**
 * 便签正文的校验规则（纯函数）。
 *
 * 规则见《功能/便签》§三与§七：
 * - `trim()` 后为空一律拒绝（全角空格 / 换行骗得过 `=== ""`，骗不过 `trim()`）；
 * - 上限 1000 字，按**字符**数计（`Array.from`）——中文一个字算 1，而不是 UTF-16 码元。
 *
 * 这里是唯一一份规则：客户端字数提示与服务端拒绝都取自它。
 * 但**服务端必须再校验一遍**——Server Action 是公开端点，客户端的 `maxLength` 不是防线。
 */

export const NOTE_BODY_MAX_LENGTH = 1000;

export type NoteBodyResult =
  | { ok: true; body: string }
  | { ok: false; error: string };

/** 校验并归一化（trim）正文。通过时返回要落库的文本。 */
export function validateNoteBody(raw: string): NoteBodyResult {
  const body = raw.trim();

  if (body.length === 0) {
    return { ok: false, error: "便签内容不能为空" };
  }

  if (charLength(body) > NOTE_BODY_MAX_LENGTH) {
    return { ok: false, error: `便签最多 ${NOTE_BODY_MAX_LENGTH} 字` };
  }

  return { ok: true, body };
}

/** 按「字符」数长度：一个汉字算 1，一个 emoji 算 1。 */
export function charLength(value: string): number {
  return Array.from(value).length;
}
