import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { findToolBySlug } from "@/components/tools/tool-catalog";

/**
 * 总览的「常用工具」卡（《界面设计规范》§7.17）。
 *
 * 形态照旧项目总览那张：一条标题行（左「常用工具」、右「查看全部 →」）+ 工具按钮网格。
 * 按钮是**浅灰小方块 + 图标 + 名字**，跟工具中心的大卡片（`ToolCard`）不是一回事——
 * 这里是「点一下就跳走」的快捷入口，不需要描述文字。
 *
 * **为什么只列这几个**：
 * - 便签 / 待办 / 工作日历**不列**——它们在总览上已经有了自己的卡，再列一遍是同一个入口说两遍；
 * - 保险库列在第一个（真能用）；
 * - 其余是**临时占位**：先把这套骨架跑起来，等总览整体拼图（主区 2/3 + 常驻栏 1/3）
 *   的时候再回头调重量与顺序。到时候把这里换掉就行，卡片形态不用动。
 *
 * 宽度跟着其它五块走（外层 `max-w-[430px]`），所以是 **2 列**；
 * 排版用 `grid-cols-2` 而不是媒体查询——这张卡将来变宽时列数由外面的 max-w 决定，
 * 430px 下一行两个刚好放得下四个字的名字。
 */

/** 常用工具的 slug 顺序。第一个是保险库，其余按分类错开摆（图片 / 文本 / 开发 / 媒体）。 */
const QUICK_TOOL_SLUGS = [
  "vault",
  "image-compress",
  "screenshot-ocr",
  "json-tool",
  "password-generator",
  "markdown-editor",
  "video-to-gif",
  "qr-code-tool",
];

export function QuickToolsCard() {
  // 从工具目录取名字与图标：改工具名时这里跟着变，不重抄一份
  const tools = QUICK_TOOL_SLUGS.map(findToolBySlug).flatMap((tool) => (tool ? [tool] : []));

  return (
    <section aria-label="常用工具" className="rounded-[2px] bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-[#000000]">
          <span className="h-3.5 w-[3px] bg-[#000000]" />
          常用工具
        </h2>
        <Link
          href="/tools"
          className="flex cursor-pointer items-center gap-0.5 text-xs text-[#8A8A8A] transition-colors hover:text-[#000000]"
        >
          查看全部
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {tools.map(({ slug, name, icon: Icon }) => (
          <Link
            key={slug}
            href={`/tools/${slug}`}
            className="flex h-9 cursor-pointer items-center gap-2 rounded-[2px] bg-[#F5F5F5] px-2.5 text-[13px] text-[#1F1F1F] transition-colors hover:bg-[#ECECEC]"
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{name}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
