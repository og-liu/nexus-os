import { PageHeader } from "@/components/layout/page-header";
import { ToolHeader } from "./tool-header";
import type { Tool } from "./tool-catalog";

/**
 * 工具详情页（《功能/工具详情页》）。
 *
 * 头部与便签页共用 `ToolHeader`（工具名只在头部出现一次，页头只留面包屑），
 * 内容区是「开发中」占位——工具功能本身逐个另开需求。
 */
export function ToolDetail({ tool }: { tool: Tool }) {
  return (
    <>
      <PageHeader title="工具" backHref="/tools" />

      <div className="space-y-4 px-4 py-4 md:px-6 md:py-6 xl:space-y-6">
        <ToolHeader tool={tool} />

        <div className="rounded-[2px] border border-dashed border-[#D9D9D9] bg-white p-8 text-center">
          <p className="text-sm text-[#A0A8B4]">该工具开发中...</p>
        </div>
      </div>
    </>
  );
}
