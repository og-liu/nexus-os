"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, PencilLine, Plus, Search, Trash2, X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";
import { type MdTag } from "@/lib/markdown/tags";

/**
 * 标签管理面板（左栏筛选器里的「管理标签…」打开，《功能/Markdown编辑器》§2.2）。
 *
 * **结构是固定头 / 滚动体 / 固定尾**（2026-10-31 重做）：
 * 标签一多，原来的平铺列表会把弹窗撑破、底部按钮被顶到窗外——那时列表待在一个
 * 按内容撑高的块级容器里，`flex-1 overflow-y-auto` 拿不到高度。现在 Modal 走
 * `bodyLayout="fill"`（弹窗有固定高度），只有中间那一段滚动，头和尾永远在。
 *
 * 三段之外的三条决定：
 * 1. **新建放在工具行**（搜索右边），点开才在列表顶部插一行输入——底部不再挤两个输入框；
 * 2. **按「在用 / 还没用上」分组并带计数**：十几个标签平铺看不清哪些是活的；
 * 3. 改名 / 删除都在行内完成，删除时整行变红底 + 下面一行说明。
 */

interface TagManagerProps {
  open: boolean;
  tags: MdTag[];
  busy?: boolean;
  onClose: () => void;
  onRename: (tag: MdTag, name: string) => void;
  onDelete: (tag: MdTag) => void;
  /** 新建一个标签（只建词，不挂文档）。 */
  onCreate: (name: string) => void;
  /** 批量删标签。 */
  onDeleteMany: (ids: number[]) => void;
}

/** 名字里的 `/` 拆成「父路径 / 叶子」两段显示，层级一眼看得出。 */
function TagName({ name }: { name: string }) {
  const parts = name.split("/");
  if (parts.length === 1) {
    return <span className="truncate text-[13px] text-[#1F1F1F]">{name}</span>;
  }
  const leaf = parts[parts.length - 1];
  const parents = parts.slice(0, -1).join("/");
  return (
    <span className="flex min-w-0 items-baseline gap-1">
      <span className="truncate text-[12px] text-[#8A8A8A]">{parents} /</span>
      <span className="truncate text-[13px] text-[#1F1F1F]">{leaf}</span>
    </span>
  );
}

export function TagManager({
  open,
  tags,
  busy = false,
  onClose,
  onRename,
  onDelete,
  onCreate,
  onDeleteMany,
}: TagManagerProps) {
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  /** 批量勾选的标签 id；非空时底部出现「删除选中」。 */
  const [checkedIds, setCheckedIds] = useState<Set<number>>(() => new Set());
  /** 批量删除的行内确认（不叠第二层弹窗）。 */
  const [confirmingMany, setConfirmingMany] = useState(false);
  const newInputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  /** 刚建出来的标签：等它进了列表就滚到它（否则列表长时看不见，以为没建成）。 */
  const [justCreated, setJustCreated] = useState<string | null>(null);

  /** 关窗时顺手把本地状态清干净，下次打开是新的（写在关闭动作里，不在 effect 里 setState）。 */
  const close = () => {
    setQuery("");
    setCreating(false);
    setNewName("");
    setRenamingId(null);
    setDeletingId(null);
    setCheckedIds(new Set());
    setConfirmingMany(false);
    onClose();
  };

  const toggleCheck = (id: number) => {
    setCheckedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setConfirmingMany(false);
  };

  /** 「全选本组」：组内全选就取消，否则补全。 */
  const toggleGroup = (group: MdTag[]) => {
    setCheckedIds((current) => {
      const allChecked = group.length > 0 && group.every((tag) => current.has(tag.id));
      const next = new Set(current);
      for (const tag of group) {
        if (allChecked) next.delete(tag.id);
        else next.add(tag.id);
      }
      return next;
    });
    setConfirmingMany(false);
  };

  /** 选中的标签里，有多少篇文档正在用它们（确认文案要说清）。 */
  const checkedInUse = tags.filter((tag) => checkedIds.has(tag.id) && tag.count > 0).length;

  useEffect(() => {
    if (justCreated === null) return;
    const row = listRef.current?.querySelector(`[data-tag="${CSS.escape(justCreated)}"]`);
    if (!row) return;
    row.scrollIntoView({ block: "nearest" });
    setJustCreated(null);
  }, [tags, justCreated]);

  const visible = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return tags;
    return tags.filter((tag) => tag.name.toLowerCase().includes(keyword));
  }, [tags, query]);

  const inUse = visible.filter((tag) => tag.count > 0);
  const unused = visible.filter((tag) => tag.count === 0);
  const usedCount = tags.filter((tag) => tag.count > 0).length;

  const startCreating = () => {
    setCreating(true);
    setNewName("");
    setRenamingId(null);
    setDeletingId(null);
    requestAnimationFrame(() => newInputRef.current?.focus());
  };

  const submitCreate = () => {
    const name = newName.trim();
    if (name === "") {
      setCreating(false);
      return;
    }
    // 先清搜索：否则新名字不含搜索词时会被过滤掉，看起来像「建了但没出现」
    setQuery("");
    setJustCreated(name);
    onCreate(name);
    setNewName("");
    setCreating(false);
  };

  const renderRow = (tag: MdTag) => {
    const renaming = renamingId === tag.id;
    const confirming = deletingId === tag.id;
    const nested = tag.name.includes("/");

    return (
      <li key={tag.id} data-tag={tag.name} className="border-b border-[#F5F5F5] last:border-b-0">
        <div
          className={cn(
            "flex min-h-10 items-center gap-2 px-2 py-1.5 transition-colors",
            nested && "pl-5",
            confirming ? "bg-[#FEF2F2]" : "hover:bg-[#FAFAFA]",
          )}
        >
          {renaming ? null : (
            <button
              type="button"
              onClick={() => toggleCheck(tag.id)}
              role="checkbox"
              aria-checked={checkedIds.has(tag.id)}
              aria-label={`选择标签「${tag.name}」`}
              className={cn(
                "flex h-3.5 w-3.5 shrink-0 cursor-pointer items-center justify-center rounded-[2px] border transition-colors",
                checkedIds.has(tag.id)
                  ? "border-[#000000] bg-[#000000] text-white"
                  : "border-[#D9D9D9] bg-white hover:border-[#8A8A8A]",
              )}
            >
              {checkedIds.has(tag.id) ? <Check className="h-3 w-3" aria-hidden="true" /> : null}
            </button>
          )}
          {renaming ? (
            <input
              autoFocus
              type="text"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  if (draft.trim() !== "") onRename(tag, draft);
                  setRenamingId(null);
                }
                if (event.key === "Escape") setRenamingId(null);
              }}
              aria-label={`重命名标签「${tag.name}」`}
              className="h-8 min-w-0 flex-1 rounded-[2px] border border-[#000000] bg-white px-2 text-[13px] text-[#1F1F1F] outline-none"
            />
          ) : (
            <>
              <span className="min-w-0 flex-1">
                <TagName name={tag.name} />
              </span>
              <span
                className={cn(
                  "shrink-0 text-[11px] tabular-nums",
                  tag.count > 0 ? "text-[#999999]" : "text-[#C4C4C4]",
                )}
              >
                {tag.count > 0 ? `${tag.count} 篇` : "未使用"}
              </span>
            </>
          )}

          {renaming ? (
            <button
              type="button"
              onClick={() => setRenamingId(null)}
              className="h-7 shrink-0 cursor-pointer rounded-[2px] px-2 text-[11px] text-[#666666] transition-colors hover:bg-[#F5F5F5]"
            >
              取消
            </button>
          ) : confirming ? (
            <span className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  onDelete(tag);
                  setDeletingId(null);
                }}
                disabled={busy}
                className="h-7 cursor-pointer rounded-[2px] bg-[#B91C1C] px-2 text-[11px] text-white transition-colors hover:bg-[#991B1B] disabled:opacity-60"
              >
                确认删除
              </button>
              <button
                type="button"
                onClick={() => setDeletingId(null)}
                className="h-7 cursor-pointer rounded-[2px] bg-white px-2 text-[11px] text-[#1F1F1F] ring-1 ring-[#E5E5E5] transition-colors hover:bg-[#F5F5F5]"
              >
                取消
              </button>
            </span>
          ) : (
            <span className="flex shrink-0 items-center gap-0.5">
              <button
                type="button"
                onClick={() => {
                  setRenamingId(tag.id);
                  setDeletingId(null);
                  setDraft(tag.name);
                }}
                aria-label={`重命名「${tag.name}」`}
                title="重命名"
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-[2px] text-[#8A8A8A] transition-colors hover:bg-[#F0F0F0] hover:text-[#000000]"
              >
                <PencilLine className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setDeletingId(tag.id);
                  setRenamingId(null);
                }}
                aria-label={`删除标签「${tag.name}」`}
                title="删除标签"
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-[2px] text-[#8A8A8A] transition-colors hover:bg-[#FEE2E2] hover:text-[#B91C1C]"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </span>
          )}
        </div>

        {confirming ? (
          <p className="px-2 pb-2 text-[11px] leading-relaxed text-[#B91C1C]">
            删除标签「{tag.name}」？有 {tag.count} 篇文档在用它——删掉只是把这个标签去掉，文档不会删。
          </p>
        ) : null}
      </li>
    );
  };

  return (
    <Modal open={open} title="标签管理" onClose={close} showCloseButton bodyLayout="fill">
      <div className="flex min-h-0 flex-1 flex-col">
        {/* ── 固定头：总览 + 工具行 ── */}
        <div className="shrink-0">
          <p className="text-[11px] text-[#A0A8B4]">
            共 {tags.length} 个 · {usedCount} 个在用
            {tags.length > usedCount ? ` · ${tags.length - usedCount} 个还没用上` : ""}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-[#A0A8B4]">
            标签用来交叉归类，名字里带 <span className="text-[#666666]">/</span> 就是分层（例如 工作/周报）
          </p>

          <div className="mt-3 flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#A0A8B4]"
              />
              <input
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索标签"
                aria-label="搜索标签"
                className="h-9 w-full rounded-[2px] border border-[#E5E5E5] bg-white pl-7 pr-7 text-[13px] text-[#1F1F1F] outline-none placeholder:text-[#A0A8B4] focus:border-[#000000]"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="清除搜索"
                  className="absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-[2px] text-[#999999] transition-colors hover:bg-[#F5F5F5] hover:text-[#000000]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
            <button
              type="button"
              onClick={startCreating}
              className="flex h-9 shrink-0 cursor-pointer items-center gap-1 rounded-[2px] bg-[#000000] px-3 text-[12px] font-medium text-white transition-colors hover:bg-[#1F1F1F]"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              新建标签
            </button>
          </div>
        </div>

        {/* ── 滚动体：列表 ── */}
        <div ref={listRef} className="mt-3 min-h-0 flex-1 overflow-y-auto border-t border-[#F0F0F0]">
          {creating ? (
            <div className="flex items-center gap-2 border-b border-[#F5F5F5] bg-[#FAFAFA] px-2 py-2">
              <input
                ref={newInputRef}
                type="text"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    submitCreate();
                  }
                  if (event.key === "Escape") setCreating(false);
                }}
                placeholder="新标签名，回车创建"
                aria-label="新标签名"
                className="h-8 min-w-0 flex-1 rounded-[2px] border border-[#000000] bg-white px-2 text-[13px] text-[#1F1F1F] outline-none placeholder:text-[#A0A8B4]"
              />
              <button
                type="button"
                onClick={submitCreate}
                disabled={busy || newName.trim() === ""}
                className="h-8 shrink-0 cursor-pointer rounded-[2px] bg-[#000000] px-3 text-[12px] text-white transition-colors hover:bg-[#1F1F1F] disabled:cursor-not-allowed disabled:opacity-40"
              >
                创建
              </button>
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="h-8 shrink-0 cursor-pointer rounded-[2px] px-2 text-[12px] text-[#666666] transition-colors hover:bg-[#F0F0F0]"
              >
                取消
              </button>
            </div>
          ) : null}

          {tags.length === 0 ? (
            <div className="mt-6 rounded-[2px] border border-dashed border-[#D9D9D9] px-4 py-8 text-center">
              <p className="text-[12px] text-[#666666]">还没有标签</p>
              <p className="mt-1 text-[11px] leading-relaxed text-[#A0A8B4]">
                点右上角「新建标签」，或到正文上方的标签条里随手打一个
              </p>
            </div>
          ) : visible.length === 0 ? (
            <div className="mt-6 rounded-[2px] border border-dashed border-[#D9D9D9] px-4 py-8 text-center">
              <p className="text-[12px] text-[#666666]">没有名字包含「{query.trim()}」的标签</p>
              <p className="mt-1 text-[11px] text-[#A0A8B4]">换个词试试</p>
            </div>
          ) : (
            <>
              <GroupHeader
                label="在用"
                tags={inUse}
                checkedIds={checkedIds}
                onToggleGroup={toggleGroup}
              />
              {inUse.length > 0 ? <ul>{inUse.map(renderRow)}</ul> : null}
              <GroupHeader
                label="还没用上"
                tags={unused}
                checkedIds={checkedIds}
                onToggleGroup={toggleGroup}
                className="mt-2"
              />
              {unused.length > 0 ? <ul>{unused.map(renderRow)}</ul> : null}
            </>
          )}
        </div>

        {/* ── 固定尾：左批量删除，右确定 ── */}
        <div className="mt-3 flex shrink-0 items-center gap-2 border-t border-[#F0F0F0] pt-3">
          {checkedIds.size > 0 ? (
            confirmingMany ? (
              <>
                <span className="min-w-0 flex-1 text-[11px] leading-relaxed text-[#B91C1C]">
                  删除选中的 {checkedIds.size} 个标签？
                  {checkedInUse > 0 ? `其中 ${checkedInUse} 个正被文档使用——只是去掉标签，文档不会删。` : ""}
                </span>
                <button
                  type="button"
                  onClick={() => setConfirmingMany(false)}
                  className="h-9 shrink-0 cursor-pointer rounded-[2px] bg-[#F5F5F5] px-3 text-[12px] text-[#1F1F1F] transition-colors hover:bg-[#ECECEC]"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onDeleteMany([...checkedIds]);
                    setCheckedIds(new Set());
                    setConfirmingMany(false);
                  }}
                  disabled={busy}
                  className="h-9 shrink-0 cursor-pointer rounded-[2px] bg-[#B91C1C] px-3 text-[12px] font-medium text-white transition-colors hover:bg-[#991B1B] disabled:opacity-60"
                >
                  确认删除
                </button>
              </>
            ) : (
              <>
                <span className="min-w-0 flex-1 text-[11px] tabular-nums text-[#666666]">
                  已选 {checkedIds.size} 个
                  <button
                    type="button"
                    onClick={() => setCheckedIds(new Set())}
                    className="ml-2 cursor-pointer text-[#8A8A8A] underline-offset-2 hover:text-[#000000] hover:underline"
                  >
                    取消选择
                  </button>
                </span>
                <button
                  type="button"
                  onClick={() => setConfirmingMany(true)}
                  className="flex h-9 shrink-0 cursor-pointer items-center gap-1 rounded-[2px] px-3 text-[12px] text-[#B91C1C] ring-1 ring-[#FECACA] transition-colors hover:bg-[#FEF2F2]"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  删除选中
                </button>
              </>
            )
          ) : (
            <span className="min-w-0 flex-1 text-[11px] text-[#A0A8B4]">
              勾选左侧方框可批量删除
            </span>
          )}
          {confirmingMany ? null : (
            <button
              type="button"
              onClick={close}
              className="h-9 shrink-0 cursor-pointer rounded-[2px] bg-[#000000] px-4 text-[13px] font-medium text-white transition-colors hover:bg-[#1F1F1F]"
            >
              确定
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

/** 分组标题：右侧「全选 / 取消」——清一批未使用的标签是最常见的批量操作。 */
function GroupHeader({
  label,
  tags,
  checkedIds,
  onToggleGroup,
  className,
}: {
  label: string;
  tags: MdTag[];
  checkedIds: Set<number>;
  onToggleGroup: (group: MdTag[]) => void;
  className?: string;
}) {
  if (tags.length === 0) return null;
  const allChecked = tags.every((tag) => checkedIds.has(tag.id));
  return (
    <div className={cn("flex items-center gap-2 px-2 pb-1 pt-2", className)}>
      <h3 className="text-[11px] text-[#999999]">
        {label}（{tags.length}）
      </h3>
      <button
        type="button"
        onClick={() => onToggleGroup(tags)}
        className="cursor-pointer text-[11px] text-[#8A8A8A] underline-offset-2 transition-colors hover:text-[#000000] hover:underline"
      >
        {allChecked ? "取消" : "全选"}
      </button>
    </div>
  );
}
