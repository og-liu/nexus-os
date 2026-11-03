"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import type { PlaylistWithTracks } from "@/lib/music-player/playlists";
import type { Track } from "@/lib/music-player/tracks";
import { cn } from "@/lib/utils";

/**
 * 编辑一首歌（《功能/音乐播放器》§2.1.1）。
 *
 * 三样东西一次提交：歌名、歌手、所属歌单。做成一个「保存」而不是「逐项自动保存」，
 * 是因为这里有三种改动意图，自动保存会让「改了一半关掉」产生难以解释的结果。
 *
 * **歌名不能为空**：它是列表里唯一的识别信息，空掉那一行就变成一道不可点的横线。
 * **歌手可以空**：留空就是不显示那一段，很多文件本来也没有歌手标签。
 *
 * 歌单是一次都没建过的状态时，这里写「还没有歌单」而不是给一个空框——
 * 空框会让人以为「勾不了」是坏了。
 */
interface TrackEditDialogProps {
  track: Track;
  playlists: PlaylistWithTracks[];
  onSave: (patch: { title: string; artist: string; playlistIds: number[] }) => Promise<void>;
  onClose: () => void;
}

export function TrackEditDialog({ track, playlists, onSave, onClose }: TrackEditDialogProps) {
  const [title, setTitle] = useState(track.title);
  const [artist, setArtist] = useState(track.artist ?? "");
  const [picked, setPicked] = useState<Set<number>>(() => new Set(track.playlistIds));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: number) {
    setPicked((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit() {
    const cleanTitle = title.replace(/\s+/g, " ").trim();
    if (!cleanTitle) {
      setError("歌名不能为空");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({
        title: cleanTitle,
        artist: artist.trim(),
        playlistIds: [...picked],
      });
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open title="编辑歌曲" onClose={onClose}>
      <div className="flex flex-col">
        {error ? (
          <p
            role="alert"
            className="mb-3 rounded-[2px] bg-[#FEF2F2] px-2.5 py-2 text-[12px] text-[#B91C1C]"
          >
            {error}
          </p>
        ) : null}

        <label className="mb-1 block text-[11px] font-medium text-[#8A8A8A]" htmlFor="track-title">
          歌名
        </label>
        <input
          id="track-title"
          autoFocus
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void submit();
          }}
          className="mb-3 w-full rounded-[2px] border border-[#D0D0D0] px-2.5 py-2 text-[13px] text-[#1F1F1F] outline-none transition-colors focus:border-[#000000]"
        />

        <label className="mb-1 block text-[11px] font-medium text-[#8A8A8A]" htmlFor="track-artist">
          歌手
        </label>
        <input
          id="track-artist"
          value={artist}
          onChange={(event) => setArtist(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void submit();
          }}
          placeholder="留空就不显示"
          className="mb-4 w-full rounded-[2px] border border-[#D0D0D0] px-2.5 py-2 text-[13px] text-[#1F1F1F] outline-none transition-colors placeholder:text-[#B0B0B0] focus:border-[#000000]"
        />

        <p className="mb-1.5 text-[11px] font-medium text-[#8A8A8A]">所属歌单</p>
        {playlists.length === 0 ? (
          <p className="mb-1 rounded-[2px] bg-[#FAFAFA] px-2.5 py-2 text-[12px] text-[#8A8A8A]">
            还没有歌单，先在左边建一个
          </p>
        ) : (
          <ul className="mb-1 max-h-44 space-y-0.5 overflow-y-auto">
            {playlists.map((playlist) => {
              const checked = picked.has(playlist.id);
              return (
                <li key={playlist.id}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={checked}
                    onClick={() => toggle(playlist.id)}
                    className="flex w-full cursor-pointer items-center gap-2 rounded-[2px] px-2 py-1.5 text-left text-[13px] text-[#1F1F1F] transition-colors hover:bg-[#F5F5F5]"
                  >
                    <span
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded-[2px] border transition-colors",
                        checked ? "border-[#000000] bg-[#000000]" : "border-[#D0D0D0] bg-white",
                      )}
                    >
                      {checked ? <Check className="h-3 w-3 text-white" /> : null}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{playlist.name}</span>
                    <span className="shrink-0 text-[11px] tabular-nums text-[#A0A8B4]">
                      {playlist.trackCount}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 items-center rounded-[2px] bg-[#F5F5F5] px-4 text-[13px] text-[#1F1F1F] transition-colors hover:bg-[#ECECEC]"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={saving}
            className={cn(
              "flex h-9 items-center rounded-[2px] bg-[#000000] px-4 text-[13px] font-medium text-white transition-colors hover:bg-[#1F1F1F]",
              saving && "opacity-60",
            )}
          >
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
