import type { InputHTMLAttributes } from "react";

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  /** 字段名，始终显示在输入框上方 */
  label: string;
  /** 常态说明：规则、格式要求 */
  hint?: string;
  /** 校验失败时的说明，出现时替换 hint 并让描边转为错误色 */
  error?: string;
}

/**
 * 表单字段（《界面设计规范》§7.14 / §7.16）。
 * 只负责样式与提示位的呈现，不关心校验逻辑——校验结果由调用方以 hint / error 传入。
 */
export function TextField({
  label,
  hint,
  error,
  id,
  ...props
}: TextFieldProps) {
  const message = error ?? hint;
  const messageId = message && id ? `${id}-message` : undefined;

  return (
    <div>
      <label htmlFor={id} className="block text-xs text-[#8A8A8A]">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={messageId}
        className={`mt-1.5 h-10 w-full rounded-[2px] border bg-white px-3 text-sm text-[#000000] outline-none transition-colors placeholder:text-[#999999] disabled:cursor-not-allowed disabled:opacity-50 ${
          error
            ? "border-[#B91C1C]"
            : "border-[#E5E5E5] focus:border-[#000000]"
        }`}
        {...props}
      />
      {message ? (
        <p
          id={messageId}
          className={`mt-1.5 text-xs ${
            error ? "text-[#B91C1C]" : "text-[#999999]"
          }`}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
