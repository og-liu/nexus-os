import Link from "next/link";
import type { Tool } from "./tool-catalog";

/**
 * 工具卡（《界面设计规范》§5.3 / §7.4）。
 *
 * - 图标块：`h-10 w-10` 浅灰底（`#ECECEC`，比卡面暗一档）+ `#1F1F1F` 图标，hover
 *   反色为黑底白图标；不用纯白——比卡面更亮的块会抢视线、显突兀；
 * - 卡片默认**实灰卡**（`bg-[#F5F5F5]`），文字保持全对比——不用整体透明度
 *   表达默认态（文字被冲淡会被读成「禁用」）；hover 转白卡 + 图标块反色。
 * - **不带任何状态角标**（2026-10-30 定稿）：目录里现在只剩真能用的工具，状态标记
 *   已经没有区分对象。之前试过两版——图标块上的 16px 黑圆白对勾、卡片右上角的
 *   「可用」文字标签——都被主人否掉（「还是太丑，算了取消这个计划」）。
 *   结论：**只在有区别可表达时才加标识**；目录里全是能用的工具时，任何角标都只是噪音。
 * - 整卡是链接，指向 `/tools/[slug]`。
 */
export function ToolCard({ tool }: { tool: Tool }) {
  return (
    <Link
      href={`/tools/${tool.slug}`}
      className="group flex cursor-pointer items-center gap-3 rounded-[2px] bg-[#F5F5F5] p-4 no-underline transition-all hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)]"
    >
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
    </Link>
  );
}
