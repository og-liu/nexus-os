"use client";

import { useState } from "react";
import { Check, ListMusic, Pencil, Plus, Trash2, X } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import type { PlaylistWithTracks } from "@/lib/music-player/playlists";
import { cn } from "@/lib/utils";

/**
 * 左栏歌单（《功能/音乐播放器》§2.1.2）。
 *
 * 两套版式共用一个 DOM：
 * - `≥ lg`：竖列表，每行「名字 · 曲目数」，hover 出「改名 / 删除」
 * - `< lg`：横向滚动的 chip 条，「全部歌曲 / 各歌单 / +」
 *
 * 「全部歌曲」永远第一条，`null` 表示它——**不用 0 当哨兵**，
 * 因为 0 是个合法的 id 值域边界，混进来分不清是「全部」还是「id 为 0 的歌单」。
 */
interface PlaylistSidebarProps {
  playlists: PlaylistWithTracks[];
  /** null = 全部歌曲 */
  selected: number | null;
  totalTracks: number;
  onSelect: (id: number | null) => void;
  onCreate: (name: string) => Promise<void>;
  onRename: (id: number, name: string) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}

export function PlaylistSidebar({
  playlists,
  selected,
  totalTracks,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: PlaylistSidebarProps) {
  const toast = useToast();

  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<PlaylistWithTracks | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function submitCreate() {
    const name = draft.trim();
    if (!name) {
      setCreating(false);
      setDraft("");
      return;
    }
    try {
      await onCreate(name);
      setCreating(false);
      setDraft("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "新建歌单失败");
    }
  }

  async function submitRename(id: number) {
    const name = renameDraft.trim();
    if (!name) {
      setRenamingId(null);
      return;
    }
    try {
      await onRename(id, name);
      setRenamingId(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "改名失败");
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await onDelete(deleteTarget.id);
      setDeleteTarget(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除歌单失败");
    } finally {
      setDeleting(false);
    }
  }

  const itemBase =
    "flex w-full cursor-pointer items-center gap-2 rounded-[2px] px-2.5 py-2 text-left text-sm transition-colors";

  return (
    <nav aria-label="歌单" className="rounded-[2px] bg-white p-2">
      <ul
        className="flex gap-1 overflow-x-auto lg:flex-col lg:gap-0.5 lg:overflow-visible"
        // 移动端横滑：隐藏滚动条，免得 chip 条下面挂一条灰杠
        style={{ scrollbarWidth: "none" }}
      >
        <li className="shrink-0 lg:w-full">
          <button
            type="button"
            onClick={() => onSelect(null)}
            aria-current={selected === null ? "true" : undefined}
            className={cn(
              itemBase,
              "whitespace-nowrap",
              selected === null
                ? "bg-[#000000] font-medium text-white"
                : "text-[#1F1F1F] hover:bg-[#F5F5F5]",
            )}
          >
            <ListMusic className="h-3.5 w-3.5 shrink-0" />
            <span className="lg:flex-1">全部歌曲</span>
            <span
              className={cn(
                "shrink-0 text-xs tabular-nums",
                selected === null ? "text-white/60" : "text-[#A0A8B4]",
              )}
            >
              {totalTracks}
            </span>
          </button>
        </li>

        {playlists.map((playlist) => {
          const isSelected = selected === playlist.id;
          const isRenaming = renamingId === playlist.id;

          if (isRenaming) {
            return (
              <li key={playlist.id} className="shrink-0 lg:w-full">
                <div className="flex items-center gap-1 px-1 py-1">
                  <input
                    autoFocus
                    value={renameDraft}
                    onChange={(event) => setRenameDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void submitRename(playlist.id);
                      if (event.key === "Escape") setRenamingId(null);
                    }}
                    aria-label="歌单新名字"
                    className="min-w-0 flex-1 rounded-[2px] border border-[#D0D0D0] px-2 py-1 text-sm outline-none focus:border-[#000000]"
                  />
                  <button
                    type="button"
                    onClick={() => void submitRename(playlist.id)}
                    aria-label="保存改名"
                    className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-[2px] text-[#1F1F1F] hover:bg-[#F0F0F0]"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setRenamingId(null)}
                    aria-label="取消改名"
                    className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-[2px] text-[#8A8A8A] hover:bg-[#F0F0F0]"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            );
          }

          return (
            <li key={playlist.id} className="group shrink-0 lg:w-full">
              <div className="flex items-center">
                <button
                  type="button"
                  onClick={() => onSelect(playlist.id)}
                  aria-current={isSelected ? "true" : undefined}
                  className={cn(
                    itemBase,
                    "min-w-0 whitespace-nowrap",
                    isSelected
                      ? "bg-[#000000] font-medium text-white"
                      : "text-[#1F1F1F] hover:bg-[#F5F5F5]",
                  )}
                >
                  <span className="max-w-[10rem] truncate lg:flex-1">{playlist.name}</span>
                  <span
                    className={cn(
                      "shrink-0 text-xs tabular-nums",
                      isSelected ? "text-white/60" : "text-[#A0A8B4]",
                    )}
                  >
                    {playlist.trackCount}
                  </span>
                </button>

                {/* hover 才显形的两个图标：改名、删歌单 */}
                <div
                  className={cn(
                    "flex shrink-0 items-center gap-0.5 pr-1 opacity-0 transition-opacity group-hover:opacity-100 max-lg:opacity-100",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setRenamingId(playlist.id);
                      setRenameDraft(playlist.name);
                    }}
                    aria-label={`给「${playlist.name}」改名`}
                    title="改名"
                    className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-[2px] text-[#A0A8B4] hover:bg-[#F0F0F0] hover:text-[#000000]"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(playlist)}
                    aria-label={`删除歌单「${playlist.name}」`}
                    title="删除歌单（歌不会跟着删）"
                    className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-[2px] text-[#A0A8B4] hover:bg-[#F0F0F0] hover:text-[#B42318]"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            </li>
          );
        })}

        <li className="shrink-0 lg:w-full">
          {creating ? (
            <div className="flex items-center gap-1 px-1 py-1">
              <input
                autoFocus
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void submitCreate();
                  if (event.key === "Escape") {
                    setCreating(false);
                    setDraft("");
                  }
                }}
                placeholder="歌单名"
                aria-label="新歌单名字"
                className="min-w-0 flex-1 rounded-[2px] border border-[#D0D0D0] px-2 py-1 text-sm outline-none focus:border-[#000000]"
              />
              <button
                type="button"
                onClick={() => void submitCreate()}
                aria-label="建歌单"
                className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-[2px] text-[#1F1F1F] hover:bg-[#F0F0F0]"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setCreating(false);
                  setDraft("");
                }}
                aria-label="取消新建"
                className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-[2px] text-[#8A8A8A] hover:bg-[#F0F0F0]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className={cn(itemBase, "whitespace-nowrap text-[#8A8A8A] hover:bg-[#F5F5F5] hover:text-[#000000]")}
            >
              <Plus className="h-3.5 w-3.5 shrink-0" />
              <span>新建歌单</span>
            </button>
          )}
        </li>
      </ul>

      {deleteTarget ? (
        <ConfirmDialog
          title="删除歌单"
          description={`确定删掉歌单「${deleteTarget.name}」吗？里面的 ${deleteTarget.trackCount} 首歌不会被删除，它们还在曲库里。`}
          confirmLabel="删除歌单"
          busy={deleting}
          onConfirm={() => void confirmDelete()}
          onClose={() => {
            if (deleting) return;
            setDeleteTarget(null);
          }}
        />
      ) : null}
    </nav>
  );
}
