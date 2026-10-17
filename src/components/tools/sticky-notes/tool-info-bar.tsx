import type { Tool } from "@/components/tools/tool-catalog";

/**
 * 工具信息条（与《功能/工具详情页》同构）：黑底白图标 + 名称 / 描述 / 分类 chip / 状态点。
 *
 * 便签页从工具列表点进来时，先用它确认「我在哪」；58 个工具页保持同一形态。
 */
export function ToolInfoBar({ tool }: { tool: Tool }) {
  return (
    <section className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[2px] bg-[#000000] xl:h-14 xl:w-14">
        <tool.icon
          aria-hidden="true"
          className="h-5 w-5 text-white xl:h-6 xl:w-6"
        />
      </div>

      <div className="min-w-0">
        <h2 className="text-lg font-semibold text-[#000000]">{tool.name}</h2>
        <p className="mt-0.5 text-sm text-[#8A8A8A]">{tool.description}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="rounded-[2px] bg-[#F5F5F5] px-1.5 py-0.5 text-[10px] text-[#666666]">
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
    </section>
  );
}
