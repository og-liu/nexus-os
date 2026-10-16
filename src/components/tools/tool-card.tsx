import type { Tool } from "./tool-catalog";

/**
 * 工具卡（《界面设计规范》§5.3 / §7.4）。
 *
 * - 图标块：`h-10 w-10` 浅灰底（`#ECECEC`，比卡面暗一档）+ `#1F1F1F` 图标，hover
 *   反色为黑底白图标；不用纯白——比卡面更亮的块会抢视线、显突兀；
 * - 卡片默认**实灰卡**（`bg-[#F5F5F5]`），文字保持全对比——不用整体透明度
 *   表达默认态（文字被冲淡会被读成「禁用」）；hover 转白卡 + 图标块反色。不按
 *   「可用 / 开发中」区分；状态字段仍保留在数据里，等工具真正上线时再定表达方式。
 * - 本阶段所有工具都没有执行动作——**点击无行为**，与旧界面一致
 *   （hover 抬起与光标沿用旧界面，卡片看起来「能点」但点下去没有事）。
 */
export function ToolCard({ tool }: { tool: Tool }) {
  return (
    <div className="group flex cursor-pointer items-center gap-3 rounded-[2px] bg-[#F5F5F5] p-4 transition-all hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)]">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[2px] bg-[#ECECEC] transition-colors group-hover:bg-[#000000]">
        <tool.icon className="h-[18px] w-[18px] text-[#1F1F1F] transition-colors group-hover:text-white" />
      </div>
      <div className="min-w-0">
        <h3 className="truncate text-sm font-medium text-[#000000]">
          {tool.name}
        </h3>
        <p className="mt-0.5 truncate text-xs text-[#8A8A8A]">
          {tool.description}
        </p>
      </div>
    </div>
  );
}
