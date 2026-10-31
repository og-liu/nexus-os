"use client";

import type { RefObject } from "react";
import { FolderTree, Menu, Plus } from "lucide-react";
import { useAppShell } from "@/components/layout/app-shell";
import { ViewModeSwitch, type ViewMode } from "./view-mode-switch";

/**
 * 贯穿整页的标题行（《功能/Markdown编辑器》§2.3）。
 *
 * **为什么它横跨整页，而不是住在编辑区里**：三档版式里有一档是「只看预览」，
 * 那一档编辑区整块让位——标题、版式开关要是跟着编辑区一起消失，用户就没法切回编辑，
 * 也看不到自己在编辑哪一篇。所以这一行提到最外层，任何模式下都在。
 *
 * 从左到右：汉堡（< lg，开全局侧栏）/ 文档列表图标（< xl，开抽屉或全屏列表）/
 * 标题输入框（弹性）/ 版式开关（三枚，手机上两枚）/ 黑底「新建」（< xl）。
 */

interface EditorTopBarProps {
  title: string;
  onTitleChange: (value: string) => void;
  /** 没有打开任何一篇时标题框不可编辑（改了没处存）。 */
  hasDocument: boolean;
  titleInputRef: RefObject<HTMLInputElement | null>;
  onCreate: () => void;
  /** 切换左栏：≥ xl 是「收起 / 展开布局里的那一列」，< xl 是「打开 / 关闭浮层」。 */
  onToggleList: () => void;
  /** 左栏任一形态开着吗（只用来决定图标的提示文案）。 */
  listOpen: boolean;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  busy?: boolean;
}

export function EditorTopBar({
  title,
  onTitleChange,
  hasDocument,
  titleInputRef,
  onCreate,
  onToggleList,
  listOpen,
  viewMode,
  onViewModeChange,
  busy = false,
}: EditorTopBarProps) {
  const { openNav } = useAppShell();

  return (
    <div className="flex h-11 shrink-0 items-center gap-1 border-b border-[#F0F0F0] bg-white px-2">
      <button
        type="button"
        onClick={openNav}
        aria-label="打开菜单"
        // 与外壳的抽屉同档：外壳在 < lg 收成抽屉，汉堡就必须在 < lg 出现
        className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-[2px] text-[#1F1F1F] transition-colors hover:bg-[#F5F5F5] lg:hidden"
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
      </button>

      {/*
        左栏（文档列表）的开关，**所有宽度都显示**：≥ xl 收起 / 展开布局里的那一列，
        < xl 打开 / 关闭浮层（抽屉或全屏列表）。
        图标与保险库中栏的「群组」按钮**同一枚、同一套尺寸**（`FolderTree` + `h-8 w-8`）——
        「打开左侧列表」在项目里只有这一枚图标，图标跟着项目走，不跟着名词走。
      */}
      <button
        type="button"
        onClick={onToggleList}
        aria-label="文档列表"
        title={listOpen ? "收起文档列表" : "展开文档列表"}
        className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-[2px] text-[#1F1F1F] transition-colors hover:bg-[#F5F5F5]"
      >
        <FolderTree className="h-4 w-4" aria-hidden="true" />
      </button>

      <input
        ref={titleInputRef}
        type="text"
        value={title}
        onChange={(event) => onTitleChange(event.target.value)}
        placeholder="未命名文档"
        aria-label="文档标题"
        disabled={!hasDocument}
        className="min-w-0 flex-1 border-0 bg-transparent px-1 text-[16px] font-semibold text-[#000000] outline-none placeholder:text-[#C4C4C4] disabled:cursor-not-allowed sm:text-[18px]"
      />

      <ViewModeSwitch value={viewMode} onChange={onViewModeChange} />

      {/*
        「新建」的窄屏入口（< xl，左栏收起时）：与保险库中栏顶行的「新建」同款
        （黑底 + Plus + 文字，`h-8 px-3 text-[12px] font-medium`），位置也在最右。
        ≥ xl 左栏常驻时它藏起来——那一档的新建在左栏顶部。
        删除不在这一行：它跟着「哪一篇」走，住在左栏列表行尾。
      */}
      <button
        type="button"
        onClick={onCreate}
        disabled={busy}
        aria-label="新建文档"
        className="flex h-8 shrink-0 cursor-pointer items-center gap-1 rounded-[2px] bg-[#000000] px-3 text-[12px] font-medium text-white transition-colors hover:bg-[#1F1F1F] disabled:cursor-not-allowed disabled:opacity-60 xl:hidden"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
        新建
      </button>
    </div>
  );
}
