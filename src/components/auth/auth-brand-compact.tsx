import { LogoIcon } from "@/components/layout/logo-icon";

/**
 * 手机 / 平板的品牌块（《界面设计规范》§7.16）。
 *
 * 白底黑字、全部左对齐：一条品牌标 + 一句 34px 的口号 + 一条 1px 线 + 一行等宽脚注。
 * 上半屏那句大字不只是"放个 logo"——它是整页的配重：没有它，
 * 只剩半屏高的表单会让页面头重脚轻。
 *
 * lg 起这块整个让位给左侧黑栏（`AuthBrandPanel`），两者互斥显示。
 */
export function AuthBrandCompact() {
  return (
    <div className="mx-auto w-full max-w-[420px] px-5 pt-6 md:px-8 md:pt-10 lg:hidden">
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-[2px] bg-[#000000]">
          <LogoIcon className="h-4 w-4 text-white" />
        </div>
        <span
          className="text-xs tracking-[0.1em] text-[#000000]"
          style={{ fontFamily: "var(--font-sekuya)" }}
        >
          NEXUS OS
        </span>
      </div>

      <h2
        className="mt-8 max-w-[13em] animate-rise text-[34px] font-semibold leading-[1.22] tracking-[-0.02em] text-[#000000] md:mt-10 md:text-[40px]"
        style={{ animationDelay: "60ms" }}
      >
        让工具成为能力，
        <br />
        让 AI 成为助手。
      </h2>

      <div
        className="mt-10 h-[1px] w-full origin-left animate-grow-x bg-[#000000]/12 md:mt-12"
        style={{ animationDelay: "220ms" }}
      />

      <p
        className="mt-4 animate-fade font-mono text-[11px] tracking-wider text-[#A0A8B4]"
        style={{ animationDelay: "300ms" }}
      >
        NEXUS OS · 个人智能工作空间
      </p>
    </div>
  );
}
