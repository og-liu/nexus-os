"use client";

import type { ReactNode } from "react";
import {
  FolderTree,
  Menu,
  Plus,
  Search,
  Trash2,
  X,
  ChevronDown,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import { useAppShell } from "@/components/layout/app-shell";
import type { VaultGroup, VaultItem } from "@/lib/vault/vault";

/**
 * 保险库中栏：条目列表（《功能/保险库》§2.3）。
 *
 * 三点是这个文件的核心：
 * 1. **列头是数据决定的**：`fieldKeys` 由父组件按「当前视图内的字段并集」算好传进来，
 *    这里只负责渲染，不知道也不该知道有哪些字段；
 * 2. **列数随中栏自身宽度退档**（`@container` 容器查询，不是视口断点）——
 *    三栏并排时中栏只有一半屏宽，用 `md:` / `lg:` 会算错；
 * 3. **复选框常驻**（不藏 hover）：手机没有 hover，藏起来就永远勾不上。
 */

interface ItemListProps {
  /** 已经按视图过滤好的条目（父组件负责过滤，这里只管显示）。 */
  items: VaultItem[];
  /** 列头的来源：字段名并集（最多 4 个）。 */
  fieldKeys: string[];
  groups: VaultGroup[];
  query: string;
  onQueryChange: (query: string) => void;
  selectedId: number | null;
  onSelect: (item: VaultItem) => void;
  checkedIds: Set<number>;
  onToggleCheck: (id: number) => void;
  onToggleAll: () => void;
  onClearChecks: () => void;
  onCreate: () => void;
  onMoveChecked: (groupId: number | null) => void;
  onDeleteChecked: () => void;
  /** 窄屏（md ~ xl）打开群组抽屉；手机上不用它——那一档有横滑 chip 条。 */
  onOpenGroups: () => void;
  /** 手机上的群组 chip 条：当前视图。 */
  activeView: "all" | number;
  onSelectView: (view: "all" | number) => void;
  /** 双击某一行直接打开编辑弹窗（比「先选中 → 再点右栏铅笔」少两步）。 */
  onEditItem: (item: VaultItem) => void;
  /** 当前视图的说明，用在空态文案里。 */
  emptyText: string;
  busy: boolean;
  className?: string;
}

export function ItemList({
  items,
  fieldKeys,
  groups,
  query,
  onQueryChange,
  selectedId,
  onSelect,
  checkedIds,
  onToggleCheck,
  onToggleAll,
  onClearChecks,
  onCreate,
  onMoveChecked,
  onDeleteChecked,
  onOpenGroups,
  activeView,
  onSelectView,
  onEditItem,
  emptyText,
  busy,
  className,
}: ItemListProps) {
  const checkedCount = checkedIds.size;
  const allChecked = items.length > 0 && items.every((item) => checkedIds.has(item.id));
  // 这一页没有 PageHeader（三栏直接从页签栏下面开始），手机的全局侧边栏入口挪到这里
  const { openNav } = useAppShell();

  return (
    <div className={cn("flex h-full min-w-0 flex-col bg-white @container", className)}>
      {/* 顶部一行的三种东西：群组（窄屏才出现）/ 搜索 / 新建 */}
      <div className="flex items-center gap-2 border-b border-[#E8E8E8] px-3 py-2">
        <button
          type="button"
          onClick={openNav}
          aria-label="打开菜单"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[2px] text-[#1F1F1F] transition-colors hover:bg-[#F5F5F5] lg:hidden"
        >
          <Menu className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={onOpenGroups}
          aria-label="打开群组"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[2px] text-[#1F1F1F] transition-colors hover:bg-[#F5F5F5] xl:hidden"
        >
          <FolderTree className="h-4 w-4" />
        </button>

        <div className="relative min-w-0 flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#A0A8B4]"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="搜索标题"
            aria-label="搜索标题"
            className="h-8 w-full rounded-[2px] border border-[#E5E5E5] bg-white pl-7 pr-7 text-[13px] text-[#1F1F1F] outline-none placeholder:text-[#A0A8B4] focus:border-[#000000] [&::-webkit-search-cancel-button]:hidden"
          />
          {query ? (
            <button
              type="button"
              onClick={() => onQueryChange("")}
              aria-label="清除搜索"
              className="absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-[2px] text-[#8A8A8A] hover:bg-[#F5F5F5] hover:text-[#000000]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>

        <button
          type="button"
          onClick={onCreate}
          className="flex h-8 shrink-0 items-center gap-1 rounded-[2px] bg-[#000000] px-3 text-[12px] font-medium text-white transition-colors hover:bg-[#1F1F1F]"
        >
          <Plus className="h-3.5 w-3.5" />
          新建
        </button>
      </div>

      {/* 手机上的群组切换：横滑 chip 条。
          为什么不用抽屉：手机上「换群组」是高频动作，抽屉要点两下（开、选），
          chip 点一下就切，而且当前群组一直看得见（《功能/保险库》§2.6）。 */}
      <div className="flex gap-1.5 overflow-x-auto border-b border-[#E8E8E8] px-3 py-2 [scrollbar-width:none] md:hidden">
        <ViewChip active={activeView === "all"} onClick={() => onSelectView("all")}>
          所有条目
        </ViewChip>
        {groups.map((group) => (
          <ViewChip
            key={group.id}
            active={activeView === group.id}
            onClick={() => onSelectView(group.id)}
          >
            {group.name}
          </ViewChip>
        ))}
      </div>

      {/* 批量操作条：勾了至少一条才出现（没有选中就没有入口，不可能误点） */}
      {checkedCount > 0 ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-[#E8E8E8] bg-[#F5F5F5] px-3 py-2">
          <span className="text-[12px] font-medium text-[#000000]">
            已选 {checkedCount} 条
          </span>

          <DropdownMenu>
            <DropdownMenuTrigger
              disabled={busy}
              className="flex h-7 items-center gap-1 rounded-[2px] border border-[#D9D9D9] bg-white px-2 text-[12px] text-[#1F1F1F] outline-none transition-colors hover:border-[#000000] disabled:opacity-50"
            >
              移动到
              <ChevronDown className="h-3 w-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-40 rounded-[2px]">
              <DropdownMenuItem
                onClick={() => onMoveChecked(null)}
                className="rounded-[2px] text-[13px] cursor-pointer"
              >
                未分组
              </DropdownMenuItem>
              {groups.length > 0 ? <DropdownMenuSeparator /> : null}
              {groups.map((group) => (
                <DropdownMenuItem
                  key={group.id}
                  onClick={() => onMoveChecked(group.id)}
                  className="rounded-[2px] text-[13px] cursor-pointer"
                >
                  <span className="truncate">{group.name}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <button
            type="button"
            onClick={onDeleteChecked}
            disabled={busy}
            className="flex h-7 items-center gap-1 rounded-[2px] border border-[#D9D9D9] bg-white px-2 text-[12px] text-[#B91C1C] transition-colors hover:border-[#B91C1C] disabled:opacity-50"
          >
            <Trash2 className="h-3 w-3" />
            删除
          </button>

          <button
            type="button"
            onClick={onClearChecks}
            className="ml-auto text-[12px] text-[#8A8A8A] underline-offset-2 hover:text-[#000000] hover:underline"
          >
            取消选择
          </button>
        </div>
      ) : null}

      {/* 列头：标题 + 动态字段列 + 修改时间 */}
      <div className="flex items-center gap-2 border-b border-[#E8E8E8] bg-[#FAFAFA] px-3 py-1.5 text-[11px] text-[#8A8A8A]">
        <span className="flex h-4 w-4 shrink-0 items-center justify-center">
          <input
            type="checkbox"
            aria-label={allChecked ? "取消全选" : "全选"}
            checked={allChecked}
            onChange={onToggleAll}
            className="h-3.5 w-3.5 accent-[#000000]"
          />
        </span>
        <span className="min-w-0 flex-1">标题</span>
        {fieldKeys.map((key, index) => (
          <span
            key={key}
            className={cn(
              "w-[110px] shrink-0 truncate",
              index < 2 ? "hidden @[560px]:block" : "hidden @[760px]:block",
            )}
          >
            {key}
          </span>
        ))}
        <span className="w-[92px] shrink-0 text-right">修改时间</span>
      </div>

      {/* 列表本体 */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <EmptyState
            query={query}
            emptyText={emptyText}
            onCreate={onCreate}
          />
        ) : (
          <ul role="list">
            {items.map((item) => {
              const selected = selectedId === item.id;
              const checked = checkedIds.has(item.id);
              return (
                <li key={item.id}>
                  <div
                    className={cn(
                      "flex cursor-pointer select-none items-center gap-2 border-b border-[#F0F0F0] px-3 py-0 text-[13px] transition-colors",
                      selected ? "bg-[#F5F5F5]" : "bg-white hover:bg-[#FAFAFA]",
                    )}
                  >
                    <span className="flex h-9 w-4 shrink-0 items-center justify-center">
                      <input
                        type="checkbox"
                        aria-label={`选择「${item.title}」`}
                        checked={checked}
                        onChange={() => onToggleCheck(item.id)}
                        className="h-3.5 w-3.5 cursor-pointer accent-[#000000]"
                      />
                    </span>

                    {/* 整行可点：点标题、字段、时间都算选中（复选框自己拦掉冒泡）；
                        双击直接进编辑——比「先选中、再点右栏铅笔」少两步（主人要求） */}
                    <button
                      type="button"
                      onClick={() => onSelect(item)}
                      onDoubleClick={() => onEditItem(item)}
                      aria-current={selected ? "true" : undefined}
                      title="双击编辑"
                      className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 py-2 text-left outline-none focus-visible:underline"
                    >
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate",
                          selected ? "font-medium text-[#000000]" : "text-[#1F1F1F]",
                        )}
                      >
                        {item.title}
                      </span>
                      {fieldKeys.map((key, index) => {
                        const value = item.fields.find((field) => field.key === key)?.value;
                        return (
                          <span
                            key={key}
                            className={cn(
                              "w-[110px] shrink-0 truncate text-[12px]",
                              value ? "text-[#5C5C5C]" : "text-[#C4C4C4]",
                              index < 2 ? "hidden @[560px]:block" : "hidden @[760px]:block",
                            )}
                          >
                            {value ? value : "—"}
                          </span>
                        );
                      })}
                      <span className="w-[92px] shrink-0 text-right text-[11px] tabular-nums text-[#999999]">
                        {formatDateTime(item.updatedAt)}
                      </span>
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

/** 手机群组 chip 条里的一颗（黑色 = 当前视图）。 */
function ViewChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      className={cn(
        "shrink-0 rounded-full px-3 py-1 text-[12px] transition-colors",
        active
          ? "bg-[#000000] text-white"
          : "bg-[#F5F5F5] text-[#1F1F1F] hover:bg-[#ECECEC]",
      )}
    >
      {children}
    </button>
  );
}

function EmptyState({
  query,
  emptyText,
  onCreate,
}: {
  query: string;
  emptyText: string;
  onCreate: () => void;
}) {
  if (query) {
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
        <p className="text-[13px] text-[#1F1F1F]">没有标题包含「{query}」的记录</p>
        <p className="text-[12px] text-[#A0A8B4]">换个词试试，或者清掉搜索看全部</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <p className="text-[13px] text-[#1F1F1F]">{emptyText}</p>
      <button
        type="button"
        onClick={onCreate}
        className="flex h-8 items-center gap-1 rounded-[2px] bg-[#000000] px-3 text-[12px] font-medium text-white transition-colors hover:bg-[#1F1F1F]"
      >
        <Plus className="h-3.5 w-3.5" />
        新建一条
      </button>
    </div>
  );
}

