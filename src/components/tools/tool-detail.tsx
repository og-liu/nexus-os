import { PageHeader } from "@/components/layout/page-header";
import type { Tool } from "./tool-catalog";

/**
 * 工具详情页（《功能/工具详情页》）。
 *
 * 本单只铺地基：工具信息条 + 开发中占位，不实现任何工具功能。
 * 图标在黑底上反色，作为进入详情页后的「定妆照」；
 * 移动端信息条纵向、lg 起横向，xl 放大图标块与段间距。
 */
export function ToolDetail({ tool }: { tool: Tool }) {
  return (
    <>
      <PageHeader title="工具" backHref="/tools" />

      <div className="space-y-4 px-4 py-4 md:px-6 md:py-6 xl:space-y-6">
        <section className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[2px] bg-[#000000] xl:h-14 xl:w-14">
            <tool.icon
              aria-hidden="true"
              className="h-5 w-5 text-white xl:h-6 xl:w-6"
            />
          </div>

          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-[#000000]">
              {tool.name}
            </h2>
            <p className="mt-0.5 text-sm text-[#8A8A8A]">
              {tool.description}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="rounded-[2px] bg-[#F5F5F5] px-1.5 py-0.5 text-[10px] text-[#666666]">
                {tool.category}
              </span>
              <span className="flex items-center gap-1.5 text-xs text-[#8A8A8A]">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    tool.status === "可用" ? "bg-[#22C55E]" : "bg-[#A0A8B4]"
                  }`}
                />
                {tool.status}
              </span>
            </div>
          </div>
        </section>

        <div className="rounded-[2px] border border-dashed border-[#D9D9D9] bg-white p-8 text-center">
          <p className="text-sm text-[#A0A8B4]">该工具开发中...</p>
        </div>
      </div>
    </>
  );
}
