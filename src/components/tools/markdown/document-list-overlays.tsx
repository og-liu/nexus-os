"use client";

import { cn } from "@/lib/utils";
import type { MdDocumentSummary } from "@/lib/markdown/documents";
import type { MdTag } from "@/lib/markdown/tags";
import { DocumentList } from "./document-list";

/**
 * 左栏（文档列表）的两种浮层形态：< 1280 时左栏不在布局里，靠它们出现
 * （《功能/Markdown编辑器》§二 2.7）。
 *
 * - **md – xl（768–1279）**：抽屉，从左滑出、点遮罩关掉（与保险库同一套观感）；
 * - **< md（手机）**：**整页替换**编辑区，不是抽屉叠在下面——手机上 240px 的抽屉会盖住
 *   大半个屏幕，整页替换才看得清列表。
 *
 * **起点与左栏对齐**：两套都是 `absolute`（相对页面根）而不是 `fixed`——`fixed` 会从
 * 浏览器窗口最顶上开始，把页签栏也一起盖住；左栏实际是从内容区顶部开始的，浮层跟它对齐
 * 才不会「弹出来位置跳一下」（2026-10-31 联调）。
 *
 * 关闭时容器挂 `pointer-events-none`，否则透明的它会把下方的点击全吃掉。
 */

interface DocumentListOverlaysProps {
  open: boolean;
  onClose: () => void;
  documents: MdDocumentSummary[];
  activeId: number | null;
  query: string;
  onQueryChange: (value: string) => void;
  onSelect: (document: MdDocumentSummary) => void;
  onDelete: (document: MdDocumentSummary) => void;
  onCreate: () => void;
  /** 父组件算好的「全部篇数」（区分空态用）。 */
  totalCount: number;
  tags: MdTag[];
  activeTagKey: string | null;
  untaggedCount: number;
  onSelectTagFilter: (key: string | null) => void;
  onOpenTagManager: () => void;
  emptyTitle?: string;
  emptyHint?: string;
  /** 批量选择（与左栏常驻那份共用同一套状态）。 */
  selectionMode: boolean;
  checkedIds: Set<number>;
  onEnterSelection: () => void;
  onExitSelection: () => void;
  onToggleCheck: (id: number) => void;
  onToggleAll: () => void;
  onDeleteChecked: () => void;
  busy: boolean;
}

export function DocumentListOverlays({
  open,
  onClose,
  documents,
  activeId,
  query,
  onQueryChange,
  onSelect,
  onDelete,
  onCreate,
  totalCount,
  tags,
  activeTagKey,
  untaggedCount,
  onSelectTagFilter,
  onOpenTagManager,
  emptyTitle,
  emptyHint,
  selectionMode,
  checkedIds,
  onEnterSelection,
  onExitSelection,
  onToggleCheck,
  onToggleAll,
  onDeleteChecked,
  busy,
}: DocumentListOverlaysProps) {
  // 浮层里「选一篇 / 新建一篇」之后要把自己收起来；≥ xl 的左栏是常驻列，走的是同一套回调，
  // 但它不该被收起——所以这层包装只放在浮层里
  const listProps = {
    documents,
    activeId,
    query,
    onQueryChange,
    onSelect: (document: MdDocumentSummary) => {
      onClose();
      onSelect(document);
    },
    onDelete,
    onCreate: () => {
      onClose();
      onCreate();
    },
    // 批量模式下不自动关闭：勾选 / 全选都发生在浮层里，全删完才退出
    selectionMode,
    checkedIds,
    onEnterSelection,
    onExitSelection,
    onToggleCheck,
    onToggleAll,
    onDeleteChecked: () => {
      onDeleteChecked();
    },
    totalCount,
    tags,
    activeTagKey,
    untaggedCount,
    onSelectTagFilter,
    onOpenTagManager,
    emptyTitle,
    emptyHint,
    busy,
  } as const;

  return (
    <>
      {/* 抽屉（md – xl） */}
      <div
        className={cn(
          "absolute inset-0 z-40 hidden md:block xl:hidden",
          open ? "" : "pointer-events-none",
        )}
      >
        <div
          onClick={onClose}
          aria-hidden="true"
          className={cn(
            "absolute inset-0 bg-black/25 backdrop-blur-sm transition-opacity duration-300",
            open ? "opacity-100" : "opacity-0",
          )}
        />
        <div
          className={cn(
            "absolute left-0 top-0 h-full w-60 bg-white shadow-xl transition-transform duration-300",
            open ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <DocumentList {...listProps} />
        </div>
      </div>

      {/* 全屏列表（< md）：整页替换，顶部「← 返回」 */}
      {open ? (
        <div className="absolute inset-0 z-50 flex flex-col bg-white md:hidden">
          <DocumentList {...listProps} onBack={onClose} />
        </div>
      ) : null}
    </>
  );
}
