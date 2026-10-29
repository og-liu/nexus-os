import type { VaultField } from "./vault";

/**
 * 保险库的服务端校验（《功能/保险库》§六 验收 20–22）。
 *
 * **为什么校验要放在这里而不是只放客户端**：Server Action 是公开的 HTTP 端点，
 * 谁都能直接调。弹窗里的 `maxLength` 只是让输入舒服，不是防线。
 *
 * 上限都按**字符数**算（`Array.from`），一个汉字算 1、一个 emoji 也算 1——
 * `length` 会把 emoji 数成 2，用户会莫名其妙被挡住。
 */

/** 标题上限。够长，但不至于让一个标题占满整行。 */
export const TITLE_MAX = 100;
/** 群组名上限。左栏只有 208px 宽，再长也只能截断，不如在这里挡住。 */
export const GROUP_NAME_MAX = 30;
/** 一个条目最多多少个自定义字段。 */
export const FIELDS_MAX = 50;
/** 字段名上限。 */
export const FIELD_KEY_MAX = 50;
/** 字段值上限。密码 / 卡片号 / 备注都在这个量级以内。 */
export const FIELD_VALUE_MAX = 5000;

/** 标题为空时的占位名（新建时若撞名会自动补序号，见 `nextUntitledTitle`）。 */
export const UNTITLED = "未命名";

export type Validated<T> = { ok: true; value: T } | { ok: false; error: string };

function charCount(text: string): number {
  return Array.from(text).length;
}

/**
 * 标题：`trim()` 后为空一律变成「未命名」——**不报错**。
 *
 * 理由是产品判断：用户新建一条然后只填了字段没填标题，这是正常用法，
 * 弹窗里预填的「未命名」就是为了让人可以不管它。为这点事拦住保存，
 * 反而逼人先想名字才能记录。
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

/**
 * 自定义字段数组。
 *
 * 两条**静默规则**（不报错，直接处理）：
 * - 字段名为空的行整行丢弃：用户点「添加字段」加了一行又没填名字，说明他不要这行
 * - 字段名两头的空格修掉，值不动（值可能是密码，尾随空格是内容的一部分）
 */
export function validateFields(raw: unknown): Validated<VaultField[]> {
  if (!Array.isArray(raw)) return { ok: false, error: "字段格式不正确" };
  if (raw.length > FIELDS_MAX) {
    return { ok: false, error: `最多只能有 ${FIELDS_MAX} 个自定义字段` };
  }

  const fields: VaultField[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) {
      return { ok: false, error: "字段格式不正确" };
    }
    const { key, value, hidden } = entry as {
      key?: unknown;
      value?: unknown;
      hidden?: unknown;
    };
    if (typeof key !== "string" || typeof value !== "string") {
      return { ok: false, error: "字段格式不正确" };
    }

    const trimmedKey = key.trim();
    if (trimmedKey === "") continue; // 没名字的行不要
    if (charCount(trimmedKey) > FIELD_KEY_MAX) {
      return { ok: false, error: `字段名最多 ${FIELD_KEY_MAX} 个字` };
    }
    if (charCount(value) > FIELD_VALUE_MAX) {
      return { ok: false, error: `字段值最多 ${FIELD_VALUE_MAX} 个字` };
    }

    fields.push({ key: trimmedKey, value, hidden: hidden === true });
  }

  return { ok: true, value: fields };
}

/** 群组名：**不能为空**（空名字在左栏上就是一行看不见的东西）。 */
export function validateGroupName(raw: unknown): Validated<string> {
  if (typeof raw !== "string") return { ok: false, error: "群组名格式不正确" };
  const name = raw.trim();
  if (name === "") return { ok: false, error: "群组名不能为空" };
  if (charCount(name) > GROUP_NAME_MAX) {
    return { ok: false, error: `群组名最多 ${GROUP_NAME_MAX} 个字` };
  }
  return { ok: true, value: name };
}
