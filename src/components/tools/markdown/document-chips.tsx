"use client";

import { cn } from "@/lib/utils";
import type { MdDocumentSummary } from "@/lib/markdown/documents";

/**
 * 手机档（< md）的文档切换条：横滑 chips（《功能/Markdown编辑器》§2.5）。
 *
 * 照保险库的做法（《功能/保险库》§2.6 的群组 chip 条）：手机上「换一篇」是高频动作，
 * 抽屉要点两下（开、选），chip 点一下就切，而且**当前这篇一直看得见**——不会出现
 * 「我在编辑哪一篇」这种疑惑。
 *
 * 这一条**只放文档**：不重复放「新建」或「打开全部」——那两个入口在顶行已经有同款按钮
 * （图标按钮 + 黑底「新建」），同一行里再放一遍就是两个意思相同的按钮。
 *
 * 只在 < md 出现（`md:hidden`）；≥ md 有左栏或抽屉，不需要这条。
 */

interface DocumentChipsProps {
  documents: MdDocumentSummary[];
  activeId: number | null;
  onSelect: (document: MdDocumentSummary) => void;
  className?: string;
}

export function DocumentChips({
  documents,
  activeId,
  onSelect,
  className,
}: DocumentChipsProps) {
  // 一篇都没有时不占一行：空态（「还没有文档」+「写第一篇」）在顶行图标按钮打开的全屏列表里
  if (documents.length === 0) return null;

  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-[#F0F0F0] bg-white px-3 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      {documents.map((document) => {
        const active = document.id === activeId;
        return (
          <button
            key={document.id}
            type="button"
            onClick={() => onSelect(document)}
            aria-current={active ? "true" : undefined}
            title={document.title}
            className={cn(
              "max-w-[9rem] shrink-0 cursor-pointer truncate rounded-full px-3 py-1 text-[12px] transition-colors",
              active
                ? "bg-[#000000] text-white"
                : "bg-[#F5F5F5] text-[#1F1F1F] hover:bg-[#ECECEC]",
            )}
          >
            {document.title}
          </button>
        );
      })}
    </div>
  );
}
