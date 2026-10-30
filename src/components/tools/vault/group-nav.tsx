"use client";

import { useState } from "react";
import { Folder, MoreHorizontal, Plus, Trash2, PencilLine } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { VaultGroup } from "@/lib/vault/vault";

/**
 * 保险库左栏：所有条目 + 群组（《功能/保险库》§2.2）。
 *
 * 纯展示 + 回调，状态都在 `VaultView` 里——左栏自己不留「哪一行在改」这种状态，
 * 重命名 / 删除弹窗由父组件统一管（同一个时刻只该有一个弹窗）。
 */

/** 左栏的视图：聚合视图（所有条目）或某个群组。 */
export type VaultView = "all" | number;

interface GroupNavProps {
  groups: VaultGroup[];
  /** 「所有条目」右侧那个数字：全部条目数（不是未分组数）。 */
  totalCount: number;
  activeView: VaultView;
  onSelect: (view: VaultView) => void;
  onCreate: () => void;
  onRename: (group: VaultGroup) => void;
  onDelete: (group: VaultGroup) => void;
}

export function GroupNav({
  groups,
  totalCount,
  activeView,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: GroupNavProps) {
  return (
    <div className="flex h-full w-full flex-col bg-white">
      {/* 「所有条目」：聚合视图，点它列出这个人的全部条目（含未分组的） */}
      <div className="p-2">
        <button
          type="button"
          onClick={() => onSelect("all")}
          aria-current={activeView === "all" ? "true" : undefined}
          className={cn(
            "flex h-9 w-full items-center gap-2 rounded-[2px] px-2.5 text-left text-[13px] transition-colors",
            activeView === "all"
              ? "bg-[#000000] text-white"
              : "text-[#1F1F1F] hover:bg-[#F5F5F5]",
          )}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
          </svg>
          <span className="min-w-0 flex-1 truncate">所有条目</span>
          <span
            className={cn(
              "shrink-0 text-[11px] tabular-nums",
              activeView === "all" ? "text-white/70" : "text-[#999999]",
            )}
          >
            {totalCount}
          </span>
        </button>
      </div>

      {/* 群组区的标题行：右边那个 + 是「新建群组」 */}
      <div className="flex items-center justify-between py-1 pl-3 pr-2">
        <span className="text-[11px] text-[#999999]">
          群组{groups.length > 0 ? `（${groups.length}）` : ""}
        </span>
        <button
          type="button"
          onClick={onCreate}
          aria-label="新建群组"
          title="新建群组"
          className="flex h-6 w-6 items-center justify-center rounded-[2px] text-[#8A8A8A] transition-colors hover:bg-[#F5F5F5] hover:text-[#000000]"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {groups.map((group) => {
          const active = activeView === group.id;
          return (
            <li key={group.id} className="group relative">
              <button
                type="button"
                onClick={() => onSelect(group.id)}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "flex h-9 w-full items-center gap-2 rounded-[2px] px-2.5 pr-9 text-left text-[13px] transition-colors",
                  active
                    ? "bg-[#000000] text-white"
                    : "text-[#1F1F1F] hover:bg-[#F5F5F5]",
                )}
              >
                <Folder className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{group.name}</span>
                <span
                  className={cn(
                    "shrink-0 text-[11px] tabular-nums",
                    active ? "text-white/70" : "text-[#999999]",
                  )}
                >
                  {group.itemCount}
                </span>
              </button>

              {/* 群组操作：重命名 / 删除。桌面 hover 才显，触屏常显（没有 hover 就永远按不到） */}
              <div className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100">
                <GroupMenu
                  group={group}
                  onRename={() => onRename(group)}
                  onDelete={() => onDelete(group)}
                  inverted={active}
                />
              </div>
            </li>
          );
        })}
      </ul>

      {groups.length === 0 ? (
        <p className="px-3 pb-3 text-[11px] leading-relaxed text-[#A0A8B4]">
          还没有群组，点上面的 + 建第一个
        </p>
      ) : null}
    </div>
  );
}

function GroupMenu({
  group,
  onRename,
  onDelete,
  inverted,
}: {
  group: VaultGroup;
  onRename: () => void;
  onDelete: () => void;
  inverted: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        aria-label={`群组「${group.name}」的操作`}
        className={cn(
          "flex h-6 w-6 items-center justify-center rounded-[2px] outline-none transition-colors",
          inverted
            ? "text-white/80 hover:bg-white/15 hover:text-white"
            : "text-[#8A8A8A] hover:bg-[#ECECEC] hover:text-[#000000]",
          open && (inverted ? "bg-white/15" : "bg-[#ECECEC]"),
        )}
      >
        <MoreHorizontal className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-28 rounded-[2px]">
        <DropdownMenuItem
          onClick={onRename}
          className="gap-2 rounded-[2px] text-[13px] cursor-pointer"
        >
          <PencilLine className="h-3.5 w-3.5" />
          重命名
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={onDelete}
          className="gap-2 rounded-[2px] text-[13px] cursor-pointer text-[#B91C1C] focus:text-[#B91C1C]"
        >
          <Trash2 className="h-3.5 w-3.5" />
          删除
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
