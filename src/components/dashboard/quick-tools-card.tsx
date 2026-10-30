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
 * **为什么只列这几个**：
 * - 便签 / 待办 / 工作日历**不列**——它们在总览上已经有了自己的卡，再列一遍是同一个入口说两遍；
 * - 保险库列在第一个（真能用）；
 * - 其余是**临时占位**：先把这套骨架跑起来，等总览整体拼图（主区 2/3 + 常驻栏 1/3）
 *   的时候再回头调重量与顺序。到时候把这里换掉就行，卡片形态不用动。
 *
 * **这张卡比其他块宽**（外层 `max-w-[900px]`，别的都是 430）：4 列才排得下 8 个工具。
 * 逐块一行里夹一张长条卡是有意的——等总览拼回栅格，它会自然落进主区。
 * 列数随宽度退档：手机 2 列、平板 3 列、宽屏 4 列；窄屏少显示的那两个**藏起来**，
 * 而不是挤成 3+3+2 的残行。
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

/** 窄屏只显示前 6 个（2 列 3 行 / 3 列 2 行），宽屏最后两个才补上。 */
const NARROW_VISIBLE = 6;

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
          className="flex cursor-pointer items-center gap-1 text-xs text-[#8A8A8A] transition-colors hover:text-[#000000]"
        >
          查看全部
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {tools.map(({ slug, name, icon: Icon }, index) => (
          <Link
            key={slug}
            href={`/tools/${slug}`}
            className={`group items-center gap-2 rounded-[2px] bg-[#F5F5F5] p-2 transition-colors hover:bg-[#ECECEC] ${
              index >= NARROW_VISIBLE ? "hidden xl:flex" : "flex"
            }`}
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
