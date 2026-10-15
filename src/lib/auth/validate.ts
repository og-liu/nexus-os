/**
 * 输入校验规则（纯函数）。
 *
 * 规则见《功能/登录注册》第四节「输入校验规则」：
 *   用户名 3–20 位，只允许汉字、字母、数字、下划线、连字符
 *   密码   8–128 位，确认密码必须一致
 *
 * 这里是**唯一一份规则**：注册页的提示文案与 Server Action 的拒绝理由都取自它，
 * 两边各写一套迟早会出现「浏览器放过了、服务端却拒绝」的鬼故事。
 */

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 20;
export const USERNAME_PATTERN = /^[\p{Script=Han}A-Za-z0-9_-]+$/u;

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/** 用户名归一化：去首尾空白 + 转小写。唯一键建在归一化结果上，`Alice` 与 `alice` 是同一个账号。 */
export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

/** 按「字符」数长度，而不是 UTF-16 码元数——否则一个汉字算 1、一个 emoji 算 2。 */
function charLength(value: string): number {
  return Array.from(value).length;
}

/** 返回错误文案；通过校验则返回 null。 */
export function validateUsername(value: string): string | null {
  const username = value.trim();
  if (username.length === 0) return "请输入用户名";
  const length = charLength(username);
  if (length < USERNAME_MIN_LENGTH || length > USERNAME_MAX_LENGTH) {
    return `用户名长度需为 ${USERNAME_MIN_LENGTH}–${USERNAME_MAX_LENGTH} 位`;
  }
  if (!USERNAME_PATTERN.test(username)) {
    return "用户名只能包含汉字、字母、数字、下划线或连字符";
  }
  return null;
}

/** 返回错误文案；通过校验则返回 null。 */
export function validatePassword(value: string): string | null {
  if (value.length === 0) return "请输入密码";
  const length = charLength(value);
  if (length < PASSWORD_MIN_LENGTH) {
    return `密码至少 ${PASSWORD_MIN_LENGTH} 位`;
  }
  if (length > PASSWORD_MAX_LENGTH) {
    return `密码最多 ${PASSWORD_MAX_LENGTH} 位`;
  }
  return null;
}

export interface LoginInput {
  username: string;
  password: string;
}

/**
 * 登录只校验「非空」。
 *
 * 刻意不在这里重复「长度 / 字符集」规则：那类拒绝信息对登录毫无用处，
 * 而登录失败一律给同一句提示（见 actions.ts），才不会被拿来探测账号是否存在。
 */
export function validateLoginInput(input: LoginInput): FieldErrors {
  const fieldErrors: FieldErrors = {};
  if (input.username.trim().length === 0) fieldErrors.username = "请输入用户名";
  if (input.password.length === 0) fieldErrors.password = "请输入密码";
  return fieldErrors;
}

export interface RegistrationInput {
  username: string;
  password: string;
  confirmPassword: string;
}

export interface FieldErrors {
  username?: string;
  password?: string;
  confirmPassword?: string;
}

export type RegistrationResult =
  | { ok: true; username: string; password: string }
  | { ok: false; fieldErrors: FieldErrors };

export function validateRegistration(
  input: RegistrationInput,
): RegistrationResult {
  const fieldErrors: FieldErrors = {};

  const usernameError = validateUsername(input.username);
  if (usernameError) fieldErrors.username = usernameError;

  const passwordError = validatePassword(input.password);
  if (passwordError) fieldErrors.password = passwordError;

  if (input.confirmPassword.length === 0) {
    fieldErrors.confirmPassword = "请再次输入密码";
  } else if (input.confirmPassword !== input.password) {
    fieldErrors.confirmPassword = "两次输入的密码不一致";
  }

  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };

  return {
    ok: true,
    username: input.username.trim(),
    password: input.password,
  };
}
