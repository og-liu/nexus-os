import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { findToolBySlug } from "@/components/tools/tool-catalog";

/**
 * 总览的「常用工具」卡（《界面设计规范》§7.17）。
 *
 * 形态：一条标题行（左「常用工具」、右「查看全部 →」）+ 工具按钮网格。
 * 每个按钮 = **白色图标块 + 名字**，鼠标滑上去**图标块翻成黑底白图标**
 * （旧界面那张快捷工具卡的悬停反馈，翻旧代码确认过：块 `bg-white → bg-[#000000]`、
 * 图标 `text-[#1F1F1F] → text-white`、按钮底色 `#F5F5F5 → #ECECEC`）。
 *
 * **为什么只列这两个**（2026-10-30 起）：
 * - 便签 / 待办 / 工作日历**不列**——它们在总览上已经有了自己的卡，再列一遍是同一个入口说两遍；
 * - 剩下的两个真工具（保险库 / 图片压缩）没有自己的卡，这里是它们唯一的入口；
 * - 以前这里还塞了 6 个占位工具（截图 OCR、JSON、密码生成…），目录清掉占位条目之后
 *   它们一起消失了——点进去只有「开发中」的入口本来就不该出现。
 *
 * **卡片从 900px 宽卡收回 430px**：宽卡存在的唯一理由是「4 列才排得下 8 个工具」，
 * 现在只有 2 个，再用宽卡就是一半留白。收回 430px 后它与便签 / 待办卡同宽，
 * 逐块一行的总览反而更齐。工具再多到 5 个以上时再谈要不要变宽。
 */

/** 常用工具的 slug 顺序（只在总览没有自己卡的真工具里挑）。 */
const QUICK_TOOL_SLUGS = ["vault", "image-compress"];

export function QuickToolsCard() {
  // 从工具目录取名字与图标：改工具名时这里跟着变，不重抄一份
  const tools = QUICK_TOOL_SLUGS.map(findToolBySlug).flatMap((tool) =>
    tool ? [tool] : [],
  );

  return (
    <section aria-label="常用工具" className="rounded-[2px] bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-[#000000]">
          <span className="h-3.5 w-[3px] bg-[#000000]" />
          常用工具
        </h2>
        <Link
          href="/tools"
          className="flex cursor-pointer items-center gap-1 text-xs text-[#8A8A8A] transition-colors hover:text-[#000000]"
        >
          查看全部
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        {tools.map(({ slug, name, icon: Icon }) => (
          <Link
            key={slug}
            href={`/tools/${slug}`}
            className="group flex items-center gap-2 rounded-[2px] bg-[#F5F5F5] p-2 transition-colors hover:bg-[#ECECEC]"
          >
            {/* 图标块：白底 → hover 黑底，图标跟着翻白 */}
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[2px] bg-white transition-colors group-hover:bg-[#000000]">
              <Icon className="h-4 w-4 text-[#1F1F1F] transition-colors group-hover:text-white" />
            </span>
            <span className="truncate text-[13px] text-[#000000]">{name}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
