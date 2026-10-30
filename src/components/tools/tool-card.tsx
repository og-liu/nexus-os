import Link from "next/link";
import { Check } from "lucide-react";
import type { Tool } from "./tool-catalog";

/**
 * 工具卡（《界面设计规范》§5.3 / §7.4）。
 *
 * - 图标块：`h-10 w-10` 浅灰底（`#ECECEC`，比卡面暗一档）+ `#1F1F1F` 图标，hover
 *   反色为黑底白图标；不用纯白——比卡面更亮的块会抢视线、显突兀；
 * - 卡片默认**实灰卡**（`bg-[#F5F5F5]`），文字保持全对比——不用整体透明度
 *   表达默认态（文字被冲淡会被读成「禁用」）；hover 转白卡 + 图标块反色。
 * - **已完成开发的工具，在图标块右上角钉一枚 14px 黑圆 + 白对勾**（2026-10-30 起）：
 *   60 个工具里只有 5 个真能用，其余点进去是「开发中」占位——不给标记的话，
 *   用户得逐个点开才知道哪个能用。标记只加在「可用」上，**不给「开发中」加任何
 *   反向标记**（61 个灰暗卡会比现在更乱，而且占位工具只是「还没轮到」，不是缺陷）。
 * - 圆点带一圈与卡面同色的 ring（灰卡上 `ring-[#F5F5F5]`、hover 转白卡时
 *   `ring-white`）：不加这一圈，黑圆会贴在图标块的浅灰边上糊成一团。
 * - 整卡是链接，指向 `/tools/[slug]`；外观保持旧界面原样，只是地址变得可分享。
 */
export function ToolCard({ tool }: { tool: Tool }) {
  const available = tool.status === "可用";

  return (
    <Link
      href={`/tools/${tool.slug}`}
      className="group flex cursor-pointer items-center gap-3 rounded-[2px] bg-[#F5F5F5] p-4 no-underline transition-all hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)]"
    >
      <div className="relative shrink-0">
        <div className="flex h-10 w-10 items-center justify-center rounded-[2px] bg-[#ECECEC] transition-colors group-hover:bg-[#000000]">
          <tool.icon className="h-[18px] w-[18px] text-[#1F1F1F] transition-colors group-hover:text-white" />
        </div>
        {available ? (
          <span
            title="已完成"
            className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#000000] ring-2 ring-[#F5F5F5] transition-colors group-hover:ring-white"
          >
            <Check
              aria-hidden="true"
              strokeWidth={3.5}
              className="h-2.5 w-2.5 text-white"
            />
            <span className="sr-only">已完成</span>
          </span>
        ) : null}
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
