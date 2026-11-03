"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Music2 } from "lucide-react";
import { ToolHeader } from "@/components/tools/tool-header";
import { ToolMobileBar } from "@/components/tools/tool-mobile-bar";
import { findToolBySlug } from "@/components/tools/tool-catalog";
import { useToast } from "@/components/ui/toast";
import { AUDIO_EXTENSIONS } from "@/lib/music-player/formats";
import type { Track } from "@/lib/music-player/tracks";
import { PlaylistSidebar } from "./playlist-sidebar";
import { PlayerStrip } from "./player-strip";
import { usePlayer } from "./player-provider";
import { TrackEditDialog } from "./track-edit-dialog";
import { TrackList } from "./track-list";
import { UploadZone } from "./upload-zone";
import { useUploadQueue } from "./use-upload-queue";

/**
 * 音乐播放器工具页（《功能/音乐播放器》§2.1、§2.3）。
 *
 * 版式：
 * - 手机（< md）：顶部栏「添加音乐」→ 播放条 → 歌单横滑条 → 曲目列表，**没有上传区**
 *   （手机上不存在拖拽这回事）
 * - 平板（md ~ lg）：上传区在上方通栏，下面「歌单 | 曲目」两栏——先把歌放进来，才谈得上分类
 * - 窄屏 PC / 宽屏（≥ lg）：三栏「歌单 | 曲目 | 上传与配额」（与音频提取同构）
 *
 * 同一个 `UploadZone` 用 grid 的行列起点换位置，不渲染两份——两份会把同一批上传
 * 记录显示成两遍，也各自持有一份拖拽状态。
 *
 * **播放范围跟着视图走**（§四第 13 条）：选中某个歌单时，点歌走 `playPlaylist`，
 * 「下一首」只在这个歌单内走；选中「全部歌曲」时走全库。
 */
async function readError(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? fallback;
}

export function MusicView() {
  const tool = findToolBySlug("music-player");
  const toast = useToast();
  const {
    refresh,
    library,
    totalBytes,
    playlists,
    queueSource,
    current,
    playing,
    loading,
    toggle,
    playPlaylist,
    playLibrary,
    switchQueue,
    removeTrack,
    removeTracks,
    reorderTracks,
    reorderPlaylistTracks,
    updateTrack,
    addToPlaylist,
  } = usePlayer();
  const inputRef = useRef<HTMLInputElement>(null);

  /**
   * 左栏选中的是**当前播放队列的来源**，不是这个页面的局部状态。
   *
   * 正在放「DJ」里的歌时，从首页卡、悬浮球还是页签栏进来，DJ 都是选中的——
   * 局部 state 会随页面卸载，回来就变成「全部歌曲」，用户看到的状态跟耳朵听到的对不上。
   */
  const selectedPlaylistId = queueSource.type === "playlist" ? queueSource.id : null;
  const [editing, setEditing] = useState<Track | null>(null);

  const selectedPlaylist = useMemo(
    () => playlists.find((item) => item.id === selectedPlaylistId) ?? null,
    [playlists, selectedPlaylistId],
  );

  /**
   * 列表显示什么。
   *
   * 歌单被删掉时 `selectedPlaylist` 变成 null，这里自然退回全库——
   * 不要另写一段「删除后清理 state」的逻辑，两处状态容易走岔。
   */
  const visibleTracks = useMemo(() => {
    if (!selectedPlaylist) return library;
    const byId = new Map(library.map((track) => [track.id, track]));
    return selectedPlaylist.trackIds
      .map((id) => byId.get(id))
      .filter((track): track is Track => track !== undefined);
  }, [library, selectedPlaylist]);

  const handleUploaded = useCallback(() => {
    void refresh();
    toast.success("已添加到曲库");
  }, [refresh, toast]);

  const { items, busy, addFiles, clearFinished } = useUploadQueue(handleUploaded);

  const openPicker = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handlePlay = useCallback(
    (id: number) => {
      // 点正在播的那一首 = 暂停 / 继续。
      // 少了这一句：`setCurrentId` 传入相同值 React 不会重渲染，`<audio>` 的 src 也不变，
      // 于是「点了没反应」——用户想暂停，界面一动不动。
      if (id === current?.id) {
        toggle();
        return;
      }
      if (selectedPlaylist) playPlaylist(selectedPlaylist.id, id);
      else playLibrary(id);
    },
    [current?.id, toggle, selectedPlaylist, playPlaylist, playLibrary],
  );

  /**
   * 点左栏换视图：**同时把播放队列换成这个歌单**。
   *
   * 只换列表不换队列的话，用户切到「DJ」再点「下一首」会走到全库的下一首——
   * 他看到的列表是 DJ，播的却是别处的歌，等于歌单只是个过滤器。
   * 用 `switchQueue` 而不是 `playPlaylist`：正在播的那首不打断，只是后续顺序变了。
   */
  const handleSelectPlaylist = useCallback(
    (id: number | null) => {
      switchQueue(id === null ? { type: "library" } : { type: "playlist", id });
    },
    [switchQueue],
  );

  const handleDelete = useCallback((id: number) => removeTrack(id), [removeTrack]);

  /** 拖拽松手：歌单视图只动这个歌单的顺序，曲库视图动全库 */
  const handleReorder = useCallback(
    async (ids: number[]) => {
      if (selectedPlaylist) await reorderPlaylistTracks(selectedPlaylist.id, ids);
      else await reorderTracks(ids);
    },
    [selectedPlaylist, reorderPlaylistTracks, reorderTracks],
  );

  /** 歌单视图的「添加歌曲」：把挑中的几首加进当前歌单 */
  const handleAddSongs = useCallback(
    async (ids: number[]) => {
      if (!selectedPlaylist) return;
      const { added } = await addToPlaylist(selectedPlaylist.id, ids);
      toast.success(added > 0 ? `已添加 ${added} 首` : "这些歌本来就在里面");
    },
    [selectedPlaylist, addToPlaylist, toast],
  );

  /** 能加进当前歌单的曲目（不在里面的那些）。曲库视图用不到，给空数组 */
  const addableTracks = useMemo(() => {
    if (!selectedPlaylist) return [];
    const inPlaylist = new Set(selectedPlaylist.trackIds);
    return library.filter((track) => !inPlaylist.has(track.id));
  }, [library, selectedPlaylist]);

  /** 歌单的增删改：都走一次请求 + `refresh()`，不在本地拼一份副本（省得两份状态走岔）。 */
  const createPlaylist = useCallback(
    async (name: string) => {
      const response = await fetch("/api/tools/music-player/playlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!response.ok) throw new Error(await readError(response, "新建歌单失败"));

      const { playlist } = (await response.json()) as {
        playlist: { id: number; name: string };
      };
      await refresh();
      // 建完直接跳进去：用户建歌单的下一步永远是「往里放歌」，
      // 停在全库视图会让他以为「建了但没生效」
      handleSelectPlaylist(playlist.id);
    },
    [refresh, handleSelectPlaylist],
  );

  const renamePlaylist = useCallback(
    async (id: number, name: string) => {
      const response = await fetch("/api/tools/music-player/playlists", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, name }),
      });
      if (!response.ok) throw new Error(await readError(response, "改名失败"));
      await refresh();
    },
    [refresh],
  );

  const deletePlaylist = useCallback(
    async (id: number) => {
      const response = await fetch(`/api/tools/music-player/playlists?id=${id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error(await readError(response, "删除歌单失败"));
      if (selectedPlaylistId === id) handleSelectPlaylist(null);
      await refresh();
    },
    [refresh, selectedPlaylistId, handleSelectPlaylist],
  );

  return (
    <>
      <ToolMobileBar newLabel="添加音乐" onNew={openPicker} icon={Music2} disabled={busy} />

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={AUDIO_EXTENSIONS.map((ext) => `.${ext}`).join(",")}
        className="hidden"
        onChange={(event) => {
          const picked = Array.from(event.target.files ?? []);
          // 清空 value：不然再选同一批文件不会触发 change
          event.target.value = "";
          if (picked.length > 0) void addFiles(picked);
        }}
      />

      <div className="px-4 py-4 md:px-6 md:py-6">
        <div className="space-y-4 xl:space-y-6">
          {tool ? <ToolHeader tool={tool} /> : null}

          <PlayerStrip />

          <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-[180px_minmax(0,1fr)] md:gap-6 lg:grid-cols-[180px_minmax(0,1fr)_300px] xl:grid-cols-[200px_minmax(0,1fr)_340px]">
            {/* 上传区：手机不渲染；平板在上方通栏；≥ lg 回到右栏 */}
            <div className="hidden md:col-span-2 md:col-start-1 md:row-start-1 md:block lg:col-span-1 lg:col-start-3 lg:row-start-1">
              <UploadZone
                items={items}
                busy={busy}
                usedBytes={totalBytes}
                onPick={openPicker}
                onFiles={(files) => void addFiles(files)}
                onClear={clearFinished}
              />
            </div>

            {/* 歌单栏：手机在最上（横滑），平板第二行左，≥ lg 第一行左 */}
            <div className="md:col-start-1 md:row-start-2 lg:row-start-1">
              <PlaylistSidebar
                playlists={playlists}
                selected={selectedPlaylistId}
                totalTracks={library.length}
                onSelect={handleSelectPlaylist}
                onCreate={createPlaylist}
                onRename={renamePlaylist}
                onDelete={deletePlaylist}
              />
            </div>

            {/* 曲目列表：手机最后，平板第二行右，≥ lg 第一行中 */}
            <div className="min-w-0 md:col-start-2 md:row-start-2 lg:col-start-2 lg:row-start-1">
              <TrackList
                title={selectedPlaylist ? selectedPlaylist.name : "全部歌曲"}
                scoped={selectedPlaylist !== null}
                tracks={visibleTracks}
                currentId={current?.id ?? null}
                playing={playing}
                loading={loading}
                playlists={playlists}
                usedBytes={totalBytes}
                addableTracks={addableTracks}
                onPlay={handlePlay}
                onEdit={setEditing}
                onDelete={handleDelete}
                onDeleteMany={removeTracks}
                onReorder={handleReorder}
                onAddSongs={handleAddSongs}
                onAddToPlaylist={async (playlistId, trackIds) => {
                  const { added } = await addToPlaylist(playlistId, trackIds);
                  toast.success(added > 0 ? `已加入 ${added} 首` : "这些歌本来就在里面");
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {editing ? (
        <TrackEditDialog
          track={editing}
          playlists={playlists}
          onSave={async (patch) => {
            await updateTrack(editing.id, patch);
          }}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </>
  );
}
