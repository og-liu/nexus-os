"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MdDocumentTag, MdTag } from "@/lib/markdown/tags";

/**
 * 编辑区里的标签条（《功能/Markdown编辑器》§2.4）：
 * `[标签] [工作/周报 ×] [重要 ×] [+ 标签]`。
 *
 * 三条交互上的决定：
 * 1. **打完立刻生效**，没有「保存标签」这一步——它和正文的自动保存是两回事，
 *    存的是「这篇属于哪几类」，不该让人多按一次；
 * 2. **点「+ 标签」就列出这个人已有的全部标签**（按使用次数排、可滚动、也能边打边筛）：
 *    老标签点一下选中，新词直接回车建，免得「工作」和「工作周报」并存；
 *    下拉挂在标签条**外面**的定位容器上——根节点带 `overflow-x-auto`，下拉在里面会被裁掉；
 * 3. 手机上同样保留这一条（`h-8`、字号小一档）：手机上打标签的机会不比桌面少。
 */

interface TagBarProps {
  /** 这篇文档现在的标签。 */
  tags: MdDocumentTag[];
  /** 这个人用过的全部标签（输入建议 + 判断哪些已经挂上了）。 */
  allTags: MdTag[];
  /** 没有打开文档时不可编辑。 */
  disabled?: boolean;
  /** 提交整批名字（增删都走这个）。 */
  onChange: (names: string[]) => void;
  className?: string;
}

/** 下拉里一次最多列多少条（多出来靠滚动看，不是靠猜）。 */
const SUGGESTION_LIMIT = 50;

export function TagBar({ tags, allTags, disabled = false, onChange, className }: TagBarProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const attachedKeys = useMemo(
    () => new Set(tags.map((tag) => tag.name.toLowerCase())),
    [tags],
  );

  const suggestions = useMemo(() => {
    const keyword = draft.trim().toLowerCase();
    return allTags
      .filter((tag) => !attachedKeys.has(tag.name.toLowerCase()))
      .filter((tag) => (keyword ? tag.name.toLowerCase().includes(keyword) : true))
      .slice(0, SUGGESTION_LIMIT);
  }, [allTags, attachedKeys, draft]);

  const commit = (name: string) => {
    const next = name.trim();
    setDraft("");
    setEditing(false);
    if (next === "") return;
    // 已经挂着的就不重复加（大小写不敏感）
    if (tags.some((tag) => tag.name.toLowerCase() === next.toLowerCase())) return;
    onChange([...tags.map((tag) => tag.name), next]);
  };

  const remove = (tag: MdDocumentTag) => {
    onChange(tags.filter((row) => row.id !== tag.id).map((row) => row.name));
  };

  return (
    <div
      className={cn(
        "flex h-8 shrink-0 items-center gap-1.5 border-b border-[#F0F0F0] bg-white px-3 md:h-9",
        className,
      )}
    >
      <span className="shrink-0 text-[11px] text-[#999999]">标签</span>

      {/* 只有这一层滚动：根节点一旦 overflow，下面那个绝对定位的下拉就会被裁掉 */}
      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">

      {tags.map((tag) => (
        <span
          key={tag.id}
          className="flex shrink-0 items-center gap-1 rounded-full bg-[#F5F5F5] py-0.5 pl-2.5 pr-1 text-[11px] text-[#1F1F1F]"
        >
          {tag.name}
          <button
            type="button"
            onClick={() => remove(tag)}
            disabled={disabled}
            aria-label={`移除标签「${tag.name}」`}
            className="flex h-4 w-4 cursor-pointer items-center justify-center rounded-full text-[#8A8A8A] transition-colors hover:bg-[#E5E5E5] hover:text-[#000000] disabled:cursor-not-allowed"
          >
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
        </span>
      ))}

      </div>

      {editing ? (
        <div className="relative shrink-0">
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commit(draft);
              }
              if (event.key === "Escape") {
                setDraft("");
                setEditing(false);
              }
            }}
            onBlur={() => {
              // 点到外面一律「取消」，不把半截输入当标签建出来（输入「工」点别处不该多一个「工」）
              setDraft("");
              setEditing(false);
            }}
            placeholder="标签名，回车添加"
            aria-label="新标签名"
            className="h-6 w-32 rounded-[2px] border border-[#E5E5E5] bg-white px-2 text-[11px] text-[#1F1F1F] outline-none placeholder:text-[#A0A8B4] focus:border-[#000000]"
          />
          {/* 下拉：点开就列全部已有标签（可滚动、带使用次数），点一条直接挂上 */}
          <div className="absolute right-0 top-7 z-30 w-56 overflow-hidden rounded-[2px] border border-[#E5E5E5] bg-white shadow-md">
            <p className="border-b border-[#F5F5F5] px-2 py-1.5 text-[10px] text-[#A0A8B4]">
              {draft.trim() === "" ? "选一个已有的，或直接输入新标签" : "回车创建新标签"}
            </p>
            {suggestions.length > 0 ? (
              <ul className="max-h-56 overflow-y-auto py-1">
                {suggestions.map((tag) => (
                  <li key={tag.id}>
                    <button
                      type="button"
                      // onMouseDown 而不是 onClick：先于输入框的 blur 触发，否则一点就被 blur 关掉
                      onMouseDown={(event) => {
                        event.preventDefault();
                        commit(tag.name);
                      }}
                      className="flex w-full cursor-pointer items-center justify-between gap-2 px-2 py-1 text-left text-[11px] text-[#1F1F1F] transition-colors hover:bg-[#F5F5F5]"
                    >
                      <span className="truncate">{tag.name}</span>
                      <span className="shrink-0 text-[10px] text-[#999999]">{tag.count} 篇</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-2 py-3 text-[11px] leading-relaxed text-[#A0A8B4]">
                {allTags.length === 0
                  ? "还没有别的标签，直接输入名字回车就建出来了"
                  : "没有匹配的标签，回车就新建一个"}
              </p>
            )}
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          disabled={disabled}
          className="flex shrink-0 cursor-pointer items-center gap-0.5 rounded-full border border-dashed border-[#D9D9D9] px-2 py-0.5 text-[11px] text-[#666666] transition-colors hover:border-[#000000] hover:text-[#000000] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[#D9D9D9] disabled:hover:text-[#666666]"
        >
          <Plus className="h-3 w-3" aria-hidden="true" />
          标签
        </button>
      )}
    </div>
  );
}
