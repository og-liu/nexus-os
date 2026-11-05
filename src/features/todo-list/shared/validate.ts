/**
 * 待办标题的校验规则（纯函数）。
 *
 * 规则：
 * - `trim()` 后为空一律拒绝（全角空格 / 换行骗得过 `=== ""`，骗不过 `trim()`）；
 * - 上限 1000 字，按**字符**数计（`Array.from`）——中文一个字算 1，而不是 UTF-16 码元。
 *
 * 1000 与便签正文同档：两个工具的输入体验保持一致，超限的文案就该写成便签。
 *
 * 这里是唯一一份规则，且**服务端必须用它再校验一遍**：Server Action 是公开 HTTP 端点，
 * 浏览器里的提示与禁用态都不是防线。
 */

export const TODO_TITLE_MAX_LENGTH = 1000;

export type TodoTitleResult =
  | { ok: true; title: string }
  | { ok: false; error: string };

/** 校验并归一化（trim）标题。通过时返回要落库的文本。 */
export function validateTodoTitle(raw: string): TodoTitleResult {
  const title = raw.trim();

  if (title.length === 0) {
    return { ok: false, error: "待办内容不能为空" };
  }

  if (charLength(title) > TODO_TITLE_MAX_LENGTH) {
    return { ok: false, error: `待办最多 ${TODO_TITLE_MAX_LENGTH} 字` };
  }

  return { ok: true, title };
}

/** 按「字符」数长度：一个汉字算 1，一个 emoji 算 1。 */
export function charLength(value: string): number {
  return Array.from(value).length;
}
