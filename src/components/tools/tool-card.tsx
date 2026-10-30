import Link from "next/link";
import type { Tool } from "./tool-catalog";

/**
 * 工具卡（《界面设计规范》§5.3 / §7.4）。
 *
 * - 图标块：`h-10 w-10` 浅灰底（`#ECECEC`，比卡面暗一档）+ `#1F1F1F` 图标，hover
 *   反色为黑底白图标；不用纯白——比卡面更亮的块会抢视线、显突兀；
 * - 卡片默认**实灰卡**（`bg-[#F5F5F5]`），文字保持全对比——不用整体透明度
 *   表达默认态（文字被冲淡会被读成「禁用」）；hover 转白卡 + 图标块反色。
 * - **已完成开发的工具，在卡片右上角挂一枚「可用」小标签**（2026-10-30 第二次调整）：
 *   60 个工具里只有 5 个真能用，其余点进去是「开发中」占位——不给标记的话，
 *   用户得逐个点开才知道哪个能用。
 *   - **为什么是文字而不是图标**：第一版在图标块右上角钉了一枚 16px 黑圆 + 白对勾，
 *     实测「不明显，也看不出是什么意思」——一个没有图例的小图形，读者得先猜再验证。
 *     两个字直接写在卡上，一眼就懂，代价只是多占 30px 宽。
 *   - **位置从图标块挪到卡片右上角**：图标块本身就在卡片左侧，标记挂在它身上会和图标
 *     抢视线；卡片右上角是「整张卡的属性」该在的位置，也不会被 hover 反色吞掉。
 *   - 标签文字直接取自 `tool.status`（目录数据里就是「可用」），状态含义只有一处定义。
 *   - **不给「开发中」加反向标记**：55 张灰暗卡比现在更乱，而且占位工具只是「还没轮到」，
 *     不是缺陷。
 * - 整卡是链接，指向 `/tools/[slug]`；外观保持旧界面原样，只是地址变得可分享。
 */
export function ToolCard({ tool }: { tool: Tool }) {
  const available = tool.status === "可用";

  return (
    <Link
      href={`/tools/${tool.slug}`}
      className="group relative flex cursor-pointer items-center gap-3 rounded-[2px] bg-[#F5F5F5] p-4 no-underline transition-all hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)]"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[2px] bg-[#ECECEC] transition-colors group-hover:bg-[#000000]">
        <tool.icon className="h-[18px] w-[18px] text-[#1F1F1F] transition-colors group-hover:text-white" />
      </div>
      {/* pr-11 给右上角的标签让位：不留这截，标题会被标签压住（truncate 正好截在最右边） */}
      <div className="min-w-0 pr-11">
        <h3 className="truncate text-sm font-medium text-[#000000]">
          {tool.name}
        </h3>
        <p className="mt-0.5 truncate text-xs text-[#8A8A8A]">
          {tool.description}
        </p>
      </div>
      {available ? (
        <span className="absolute right-2.5 top-2.5 rounded-[2px] bg-[#000000] px-1.5 py-0.5 text-[10px] leading-none text-white">
          可用
        </span>
      ) : null}
    </Link>
  );
}
