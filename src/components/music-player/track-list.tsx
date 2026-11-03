"use client";

import { useState } from "react";
import {
  Check,
  GripVertical,
  ListPlus,
  Music2,
  Pencil,
  Play,
  Plus,
  Trash2,
} from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { formatBytes } from "@/lib/format-bytes";
import { formatLabel, USER_QUOTA_BYTES } from "@/lib/music-player/formats";
import { formatDay, formatTime } from "@/lib/music-player/format";
import type { PlaylistWithTracks } from "@/lib/music-player/playlists";
import type { Track } from "@/lib/music-player/tracks";
import { cn } from "@/lib/utils";
import { Equalizer } from "./player-strip";

/**
 * 曲目列表（《功能/音乐播放器》§2.1）。
 *
 * 顺序就是播放顺序，点一行立刻播；**按住行拖动能改顺序**（§2.1.5）。
 *
 * 行的结构是**两个兄弟按钮**，不是一个按钮套一个：整行是「播放」，最右是「编辑 / 删除」。
 * 按钮不能嵌套（HTML 无效、点击会冒泡成两次动作），所以外层是 `li`、内部并排，
 * Tab 顺序与视觉顺序一致。
 *
 * **拖拽用原生 HTML5 DnD**：不引第三方库（§八），代价是**触摸设备上不可用**——
 * 手机上 `draggable` 不触发。所以手柄 `hidden md:flex`，手机上干脆不显示这个入口，
 * 免得用户按了半天没反应。
 *
 * **批量模式**（表头「批量」进入）：
 * - 每行左侧换成复选框，**点整行 = 勾选**，不再是播放——同一个手势两种结果，
 *   所以整行换成 `role="checkbox"` 的按钮，且不再渲染行尾图标与拖拽；
 * - 选择状态住在本组件里：切页面、刷新都会自动回到普通模式（临时态，不落库、不进 URL）。
 */
interface TrackListProps {
  /** 表头标题：「全部歌曲」或歌单名 */
  title: string;
  /** 当前视图是不是某个歌单 */
  scoped: boolean;
  tracks: Track[];
  currentId: number | null;
  playing: boolean;
  loading: boolean;
  playlists: PlaylistWithTracks[];
  /**
   * **全库**已用字节（不是当前视图的合计）。
   *
   * 表头要显示「已用 X / 5 GB」，分母是全库配额，分子也必须是全库——
   * 拿歌单的合计去比 5 GB 会让人以为「这个歌单只占这么点，还早着呢」。
   */
  usedBytes: number;
  /** 能加进当前歌单的曲目（不在这个歌单里的）；只有在歌单视图才有意义 */
  addableTracks: Track[];
  onPlay: (id: number) => void;
  onEdit: (track: Track) => void;
  onDelete: (id: number) => Promise<void> | void;
  onDeleteMany: (ids: number[]) => Promise<void>;
  onAddToPlaylist: (playlistId: number, trackIds: number[]) => Promise<void>;
  /** 拖拽松手：交回完整的新顺序 */
  onReorder: (ids: number[]) => Promise<void>;
  /** 歌单视图里「添加歌曲」确认后：把这些歌加进当前歌单 */
  onAddSongs: (ids: number[]) => Promise<void>;
}

export function TrackList({
  title,
  scoped,
  tracks,
  currentId,
  playing,
  loading,
  playlists,
  usedBytes,
  addableTracks,
  onPlay,
  onEdit,
  onDelete,
  onDeleteMany,
  onAddToPlaylist,
  onReorder,
  onAddSongs,
}: TrackListProps) {
  const toast = useToast();

  const quotaRatio = USER_QUOTA_BYTES > 0 ? Math.min(1, usedBytes / USER_QUOTA_BYTES) : 0;
  // 用到八成开始提醒：等真满了才变红，用户已经传不进去了
  const nearFull = quotaRatio >= 0.8;

  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [confirmingBatch, setConfirmingBatch] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  /** 单首删除的确认对象（点垃圾桶后先问一句） */
  const [deletingTrack, setDeletingTrack] = useState<Track | null>(null);
  const [deletingOne, setDeletingOne] = useState(false);

  const [addingTo, setAddingTo] = useState(false);
  const [adding, setAdding] = useState<number | null>(null);
  const [addError, setAddError] = useState<string | null>(null);

  /** 「添加歌曲」弹框：给歌单挑歌 */
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [savingPicked, setSavingPicked] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);

  /** 拖拽：被拖动的行、当前悬停的行 */
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const allSelected = tracks.length > 0 && selected.size === tracks.length;

  // 这些都是直接挂在按钮上的事件处理，组件没有做 memo 化，用不着 useCallback——
  // 反而会因为「setState 不在依赖里」被 React Compiler 的 lint 拦下。
  function startSelecting() {
    setSelecting(true);
    setSelected(new Set());
    setDeleteError(null);
  }

  function exitSelecting() {
    setSelecting(false);
    setSelected(new Set());
    setDeleteError(null);
    setAddError(null);
  }

  function toggleOne(id: number) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((previous) =>
      previous.size === tracks.length ? new Set() : new Set(tracks.map((track) => track.id)),
    );
  }

  async function confirmDeleteMany() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await onDeleteMany([...selected]);
      setConfirmingBatch(false);
      exitSelecting();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "删除失败");
    } finally {
      setDeleting(false);
    }
  }

  async function confirmDeleteOne() {
    if (!deletingTrack) return;
    setDeletingOne(true);
    try {
      await onDelete(deletingTrack.id);
      setDeletingTrack(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除失败");
    } finally {
      setDeletingOne(false);
    }
  }

  async function addTo(playlistId: number) {
    setAdding(playlistId);
    setAddError(null);
    try {
      await onAddToPlaylist(playlistId, [...selected]);
      setAddingTo(false);
      exitSelecting();
    } catch (error) {
      setAddError(error instanceof Error ? error.message : "加入歌单失败");
    } finally {
      setAdding(null);
    }
  }

  function togglePicked(id: number) {
    setPicked((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function confirmPicked() {
    if (picked.size === 0) {
      setPicking(false);
      return;
    }
    setSavingPicked(true);
    setPickError(null);
    try {
      await onAddSongs([...picked]);
      setPicking(false);
      setPicked(new Set());
    } catch (error) {
      setPickError(error instanceof Error ? error.message : "添加失败");
    } finally {
      setSavingPicked(false);
    }
  }

  /** 拖到第 target 行：把被拖的行取出来插到那个位置，然后把整份新顺序交上去 */
  function dropOn(target: number) {
    const from = dragIndex;
    setDragIndex(null);
    setOverIndex(null);
    if (from === null || from === target) return;

    const next = [...tracks];
    const [moved] = next.splice(from, 1);
    next.splice(target, 0, moved);
    void onReorder(next.map((track) => track.id)).catch((error: unknown) => {
      toast.error(error instanceof Error ? error.message : "调整顺序失败");
    });
  }

  return (
    <section aria-label="曲目" className="rounded-[2px] bg-white">
      {/* 表头：普通模式 / 批量模式两套 */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#F0F0F0] px-4 py-3 md:px-5">
        {selecting ? (
          <>
            <div className="flex items-center gap-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-[#000000]">
                <span className="h-3.5 w-[3px] bg-[#000000]" />
                已选 {selected.size} 首
              </h2>
              <button
                type="button"
                onClick={toggleAll}
                className="cursor-pointer text-xs text-[#8A8A8A] underline-offset-2 transition-colors hover:text-[#000000] hover:underline"
              >
                {allSelected ? "取消全选" : "全选"}
              </button>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setAddError(null);
                  setAddingTo(true);
                }}
                disabled={selected.size === 0}
                className="cursor-pointer text-xs font-medium text-[#1F1F1F] transition-colors hover:text-[#000000] disabled:cursor-not-allowed disabled:text-[#C8C8C8]"
              >
                加入歌单
              </button>
              <button
                type="button"
                onClick={() => {
                  setDeleteError(null);
                  setConfirmingBatch(true);
                }}
                disabled={selected.size === 0}
                className="cursor-pointer text-xs font-medium text-[#B42318] transition-colors hover:text-[#8F1D13] disabled:cursor-not-allowed disabled:text-[#C8C8C8]"
              >
                删除{selected.size > 0 ? `（${selected.size}）` : ""}
              </button>
              <button
                type="button"
                onClick={exitSelecting}
                className="cursor-pointer text-xs text-[#8A8A8A] transition-colors hover:text-[#000000]"
              >
                取消
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-[#000000]">
              <span className="h-3.5 w-[3px] shrink-0 bg-[#000000]" />
              <span className="truncate">{title}</span>
            </h2>
            <div className="flex shrink-0 items-center gap-3">
              <span
                className={cn(
                  "text-xs tabular-nums",
                  nearFull ? "font-medium text-[#B42318]" : "text-[#8A8A8A]",
                )}
                title={
                  nearFull
                    ? "空间快用完了，删掉一些再传"
                    : `剩余 ${formatBytes(Math.max(0, USER_QUOTA_BYTES - usedBytes))}`
                }
              >
                {loading
                  ? "读取中…"
                  : `${tracks.length} 首 · 已用 ${formatBytes(usedBytes)} / ${formatBytes(USER_QUOTA_BYTES)}`}
              </span>
              {/* 歌单视图才能「添加歌曲」：曲库视图的「添加」是上传，右边那栏 */}
              {scoped ? (
                <button
                  type="button"
                  onClick={() => {
                    setPicked(new Set());
                    setPickError(null);
                    setPicking(true);
                  }}
                  className="flex cursor-pointer items-center gap-1 text-xs text-[#8A8A8A] transition-colors hover:text-[#000000]"
                >
                  <Plus className="h-3 w-3" />
                  添加歌曲
                </button>
              ) : null}
              {tracks.length > 0 ? (
                <button
                  type="button"
                  onClick={startSelecting}
                  className="cursor-pointer text-xs text-[#8A8A8A] underline-offset-2 transition-colors hover:text-[#000000] hover:underline"
                >
                  批量
                </button>
              ) : null}
            </div>
          </>
        )}
      </div>

      {loading ? (
        <ul className="divide-y divide-[#F0F0F0]">
          {[0, 1, 2].map((index) => (
            <li key={index} className="flex items-center gap-3 px-4 py-3 md:px-5">
              <span className="h-3.5 w-3.5 rounded-[2px] bg-[#F0F0F0]" />
              <span className="h-3 flex-1 rounded-[2px] bg-[#F0F0F0]" />
            </li>
          ))}
        </ul>
      ) : tracks.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
          <Music2 className="h-6 w-6 text-[#C8C8C8]" />
          {scoped ? (
            <>
              <p className="text-sm text-[#8A8A8A]">这个歌单里还没有歌</p>
              <p className="text-xs text-[#A0A8B4]">
                点上面的「添加歌曲」，从曲库里挑几首放进来
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-[#8A8A8A]">曲库还是空的</p>
              <p className="text-xs text-[#A0A8B4]">把 mp3 之类的音频传上来，就能在这里点开听</p>
            </>
          )}
        </div>
      ) : (
        <ul className="divide-y divide-[#F0F0F0]">
          {tracks.map((track, index) => {
            const isCurrent = track.id === currentId;
            const isSelected = selected.has(track.id);
            const isDragging = dragIndex === index;
            const isOver = overIndex === index && dragIndex !== null && dragIndex !== index;

            return (
              <li
                key={track.id}
                // 批量模式下不许拖：那时「拖动」会被理解成「再勾选一行」
                draggable={!selecting}
                onDragStart={(event) => {
                  setDragIndex(index);
                  event.dataTransfer.effectAllowed = "move";
                  // Firefox 不设 data 就不会开始拖
                  event.dataTransfer.setData("text/plain", String(track.id));
                }}
                onDragOver={(event) => {
                  if (dragIndex === null) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setOverIndex(index);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  dropOn(index);
                }}
                onDragEnd={() => {
                  setDragIndex(null);
                  setOverIndex(null);
                }}
                className={cn(
                  "group relative flex items-center transition-colors",
                  isDragging && "opacity-40",
                  isOver && "shadow-[inset_0_2px_0_0_#000000]",
                  (selecting ? isSelected : isCurrent) ? "bg-[#F5F5F5]" : "hover:bg-[#FAFAFA]",
                )}
              >
                <button
                  type="button"
                  role={selecting ? "checkbox" : undefined}
                  aria-checked={selecting ? isSelected : undefined}
                  onClick={() => (selecting ? toggleOne(track.id) : onPlay(track.id))}
                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 px-4 py-2.5 text-left md:px-5"
                >
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                    {selecting ? (
                      <span
                        className={cn(
                          "flex h-4 w-4 items-center justify-center rounded-[2px] border transition-colors",
                          isSelected ? "border-[#000000] bg-[#000000]" : "border-[#D0D0D0] bg-white",
                        )}
                      >
                        {isSelected ? <Check className="h-3 w-3 text-white" /> : null}
                      </span>
                    ) : isCurrent ? (
                      <Equalizer playing={playing} />
                    ) : (
                      <>
                        <Music2 className="h-3.5 w-3.5 text-[#A0A8B4] group-hover:hidden" />
                        <Play className="hidden h-3.5 w-3.5 text-[#000000] group-hover:block" />
                      </>
                    )}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block truncate text-sm",
                        isCurrent ? "font-medium text-[#000000]" : "text-[#1F1F1F]",
                      )}
                      title={track.title}
                    >
                      {track.title}
                    </span>
                    <span className="mt-0.5 block truncate text-[10px] text-[#8A8A8A]">
                      {[track.artist, formatLabel(track.codec)].filter(Boolean).join(" · ")}
                    </span>
                  </span>

                  <span className="shrink-0 text-right text-xs tabular-nums text-[#8A8A8A]">
                    {formatTime(track.durationMs === null ? null : track.durationMs / 1000)}
                  </span>

                  <span className="hidden w-16 shrink-0 text-right text-xs tabular-nums text-[#A0A8B4] md:block">
                    {formatBytes(track.sizeBytes)}
                  </span>
                  <span className="hidden w-24 shrink-0 text-right text-xs tabular-nums text-[#A0A8B4] lg:block">
                    {formatDay(track.createdAt)}
                  </span>
                </button>

                {/* 批量模式下不给单行操作：编辑 / 删除只在表头各有一个入口 */}
                {selecting ? null : (
                  <div className="mr-2 flex shrink-0 items-center gap-0.5">
                    {/* 拖拽手柄：桌面才有（触摸设备上 HTML5 DnD 不工作） */}
                    <span
                      aria-hidden
                      title="拖动调整顺序"
                      className="hidden h-8 w-6 cursor-grab items-center justify-center text-[#C8C8C8] transition-colors group-hover:text-[#8A8A8A] active:cursor-grabbing md:flex"
                    >
                      <GripVertical className="h-3.5 w-3.5" />
                    </span>
                    <button
                      type="button"
                      onClick={() => onEdit(track)}
                      aria-label={`编辑 ${track.title}`}
                      title="编辑歌名 / 歌手 / 歌单"
                      className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-[2px] text-[#A0A8B4] opacity-0 transition-all hover:bg-[#F0F0F0] hover:text-[#000000] focus-visible:opacity-100 group-hover:opacity-100 max-md:opacity-100"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeletingTrack(track)}
                      aria-label={`删除 ${track.title}`}
                      title="删除这首歌"
                      className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-[2px] text-[#A0A8B4] opacity-0 transition-all hover:bg-[#F0F0F0] hover:text-[#B42318] focus-visible:opacity-100 group-hover:opacity-100 max-md:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* 单首删除：也要确认。文案里说清「文件会删」和「它在几个歌单里」 */}
      {deletingTrack ? (
        <ConfirmDialog
          title="删除歌曲"
          description={[
            `确定删掉「${deletingTrack.title}」吗？音频文件也会一起删掉，不能恢复。`,
            deletingTrack.playlistIds.length > 0
              ? `它还在 ${deletingTrack.playlistIds.length} 个歌单里，那些歌单里的这一首也会一起消失（歌单本身不会删）。`
              : "",
          ]
            .filter(Boolean)
            .join("")}
          confirmLabel="删除"
          busy={deletingOne}
          onConfirm={() => void confirmDeleteOne()}
          onClose={() => {
            if (deletingOne) return;
            setDeletingTrack(null);
          }}
        />
      ) : null}

      {confirmingBatch ? (
        <ConfirmDialog
          title="批量删除歌曲"
          description={`确定删掉选中的 ${selected.size} 首歌吗？音频文件也会一起删掉，不能恢复；它们所在的所有歌单里也会一起消失。`}
          confirmLabel={`删除 ${selected.size} 首`}
          busy={deleting}
          error={deleteError}
          onConfirm={() => void confirmDeleteMany()}
          onClose={() => {
            if (deleting) return;
            setConfirmingBatch(false);
            setDeleteError(null);
          }}
        />
      ) : null}

      {addingTo ? (
        <Modal open title="加入歌单" onClose={() => setAddingTo(false)}>
          <div className="flex flex-col">
            {addError ? (
              <p
                role="alert"
                className="mb-3 rounded-[2px] bg-[#FEF2F2] px-2.5 py-2 text-[12px] text-[#B91C1C]"
              >
                {addError}
              </p>
            ) : null}

            <p className="mb-3 text-[13px] text-[#1F1F1F]">
              把选中的 {selected.size} 首歌加进哪个歌单？
            </p>

            {playlists.length === 0 ? (
              <p className="rounded-[2px] bg-[#FAFAFA] px-2.5 py-2 text-[12px] text-[#8A8A8A]">
                还没有歌单，先在左边建一个
              </p>
            ) : (
              <ul className="max-h-64 space-y-0.5 overflow-y-auto">
                {playlists.map((playlist) => (
                  <li key={playlist.id}>
                    <button
                      type="button"
                      onClick={() => void addTo(playlist.id)}
                      disabled={adding !== null}
                      className="flex w-full cursor-pointer items-center gap-2 rounded-[2px] px-2 py-2 text-left text-[13px] text-[#1F1F1F] transition-colors hover:bg-[#F5F5F5] disabled:cursor-wait disabled:opacity-60"
                    >
                      <ListPlus className="h-3.5 w-3.5 shrink-0 text-[#8A8A8A]" />
                      <span className="min-w-0 flex-1 truncate">{playlist.name}</span>
                      <span className="shrink-0 text-[11px] tabular-nums text-[#A0A8B4]">
                        {adding === playlist.id ? "加入中…" : playlist.trackCount}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-5 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setAddingTo(false)}
                className="flex h-9 items-center rounded-[2px] bg-[#F5F5F5] px-4 text-[13px] text-[#1F1F1F] transition-colors hover:bg-[#ECECEC]"
              >
                取消
              </button>
            </div>
          </div>
        </Modal>
      ) : null}

      {/* 歌单视图的「添加歌曲」：从曲库里挑几首塞进当前歌单 */}
      {picking ? (
        <Modal open title={`添加歌曲到「${title}」`} onClose={() => setPicking(false)}>
          <div className="flex flex-col">
            {pickError ? (
              <p
                role="alert"
                className="mb-3 rounded-[2px] bg-[#FEF2F2] px-2.5 py-2 text-[12px] text-[#B91C1C]"
              >
                {pickError}
              </p>
            ) : null}

            {addableTracks.length === 0 ? (
              <p className="rounded-[2px] bg-[#FAFAFA] px-2.5 py-2 text-[12px] text-[#8A8A8A]">
                曲库里的歌都已经在这个歌单里了
              </p>
            ) : (
              <>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[11px] text-[#8A8A8A]">
                    已选 {picked.size} 首 · 可加 {addableTracks.length} 首
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setPicked(
                        picked.size === addableTracks.length
                          ? new Set()
                          : new Set(addableTracks.map((track) => track.id)),
                      )
                    }
                    className="cursor-pointer text-[11px] text-[#8A8A8A] underline-offset-2 transition-colors hover:text-[#000000] hover:underline"
                  >
                    {picked.size === addableTracks.length ? "取消全选" : "全选"}
                  </button>
                </div>

                <ul className="max-h-72 space-y-0.5 overflow-y-auto">
                  {addableTracks.map((track) => {
                    const checked = picked.has(track.id);
                    return (
                      <li key={track.id}>
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={checked}
                          onClick={() => togglePicked(track.id)}
                          className="flex w-full cursor-pointer items-center gap-2 rounded-[2px] px-2 py-1.5 text-left text-[13px] text-[#1F1F1F] transition-colors hover:bg-[#F5F5F5]"
                        >
                          <span
                            className={cn(
                              "flex h-4 w-4 shrink-0 items-center justify-center rounded-[2px] border transition-colors",
                              checked
                                ? "border-[#000000] bg-[#000000]"
                                : "border-[#D0D0D0] bg-white",
                            )}
                          >
                            {checked ? <Check className="h-3 w-3 text-white" /> : null}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate">{track.title}</span>
                            <span className="block truncate text-[10px] text-[#8A8A8A]">
                              {[track.artist, formatTime(track.durationMs === null ? null : track.durationMs / 1000)]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPicking(false)}
                className="flex h-9 items-center rounded-[2px] bg-[#F5F5F5] px-4 text-[13px] text-[#1F1F1F] transition-colors hover:bg-[#ECECEC]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void confirmPicked()}
                disabled={savingPicked || picked.size === 0}
                className={cn(
                  "flex h-9 items-center rounded-[2px] bg-[#000000] px-4 text-[13px] font-medium text-white transition-colors hover:bg-[#1F1F1F]",
                  (savingPicked || picked.size === 0) && "cursor-not-allowed opacity-50",
                )}
              >
                {savingPicked ? "添加中…" : `添加${picked.size > 0 ? `（${picked.size}）` : ""}`}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </section>
  );
}
