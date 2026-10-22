import type { ReactNode } from "react";
import type { Tool } from "./tool-catalog";

/**
 * 工具页通用头部（《界面设计规范》§5.3 / §7.2）。
 *
 * 便签页与工具详情页共用：左侧黑底图标（进入工具后的「定妆照」）、
 * 中间名称 / 描述 / 分类 / 状态、右侧操作区（仅桌面——移动端的主操作
 * 放在页面顶部那行导航里，避免卡片内三层堆叠）。
 *
 * 工具名只在这里出现一次——页头不再重复。
 */
interface ToolHeaderProps {
  tool: Tool;
  /** 页面级主操作；桌面显示在信息右侧。 */
  actions?: ReactNode;
}

export function ToolHeader({ tool, actions }: ToolHeaderProps) {
  return (
    <section className="rounded-[2px] bg-white p-5 md:p-6">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[2px] bg-[#000000] md:h-14 md:w-14">
          <tool.icon
            aria-hidden="true"
            className="h-5 w-5 text-white md:h-6 md:w-6"
          />
        </div>

        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold leading-tight text-[#000000] md:text-xl">
            {tool.name}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-[#8A8A8A]">
            {tool.description}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded-[2px] bg-[#F5F5F5] px-2 py-0.5 text-[10px] text-[#666666]">
              {tool.category}
            </span>
            <span className="flex items-center gap-1.5 text-xs text-[#8A8A8A]">
              <span
                className={
                  tool.status === "可用"
                    ? "h-1.5 w-1.5 rounded-full bg-[#22C55E]"
                    : "h-1.5 w-1.5 rounded-full bg-[#A0A8B4]"
                }
              />
              {tool.status}
            </span>
          </div>
        </div>

        {actions ? (
          <div className="hidden shrink-0 items-center gap-2 lg:flex">
            {actions}
          </div>
        ) : null}
      </div>
    </section>
  );
}
