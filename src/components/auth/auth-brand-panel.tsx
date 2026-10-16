import { LogoIcon } from "@/components/layout/logo-icon";

/**
 * 宽屏（lg 起）的左侧品牌栏（《界面设计规范》§7.16）。
 *
 * 全站最大的一块黑色面，只许出现在入口页：黑底上铺一层极细网格与一块左上柔光，
 * 品牌块 / 口号 / 分隔线 / 版本字按 ~140ms 的间隔依次入场。
 * 黑底上必须反白——Logo 用白底方块包着（黑底上再放黑方块等于看不见）。
 *
 * 手机 / 平板看到的是 `AuthBrandCompact`，与本组件互斥显示。
 */
export function AuthBrandPanel() {
  return (
    <div className="relative hidden overflow-hidden bg-[#000000] lg:flex lg:w-[44%] lg:flex-col lg:items-start lg:justify-between lg:px-14 lg:py-12 xl:w-[46%] xl:px-16">
      <div className="pointer-events-none absolute inset-0 bg-grid-fine" />
      <div className="pointer-events-none absolute inset-0 bg-glow-dark" />

      <div
        className="relative flex animate-rise flex-col items-start gap-5"
        style={{ animationDelay: "40ms" }}
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-[2px] bg-white">
          <LogoIcon className="h-8 w-8 text-[#000000]" />
        </div>
        <span
          className="text-sm tracking-[0.1em] text-white"
          style={{ fontFamily: "var(--font-sekuya)" }}
        >
          NEXUS OS
        </span>
      </div>

      <div className="relative">
        <p
          className="animate-rise text-xl font-semibold leading-relaxed text-white"
          style={{ animationDelay: "140ms" }}
        >
          <span className="block">让工具成为能力，</span>
          <span className="block">让 AI 成为助手。</span>
        </p>

        <div
          className="mt-6 h-[1px] w-full origin-left animate-grow-x bg-white/15"
          style={{ animationDelay: "280ms" }}
        />

        <p
          className="mt-6 animate-fade font-mono text-[11px] tracking-wider text-white/40"
          style={{ animationDelay: "400ms" }}
        >
          PERSONAL WORKSPACE · V0.1.0
        </p>
      </div>
    </div>
  );
}
