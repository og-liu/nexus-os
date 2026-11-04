"use client";

import Link from "next/link";
import { ArrowRight, ListMusic, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { LogoIcon } from "@/components/layout/logo-icon";
import { formatLabel } from "@/lib/music-player/formats";
import { formatTime } from "@/lib/music-player/format";
import { usePlayer } from "@/components/music-player/player-provider";
import { Slider } from "@/components/music-player/slider";

/**
 * 总览的「正在播放」卡（《功能/音乐播放器》§2.2）。
 *
 * 形态照旧项目的原型：黑胶（黑圆 + 白色 Logo，播放时转）+ 歌名 + 进度条 + 三个按钮。
 * **但它只是遥控器**——真正的 `<audio>` 在 `PlayerProvider` 里，挂在应用外壳上，
 * 这样从总览点进任何一个页面，歌都不会断（§七第 1 条）。
 *
 * 空曲库时整张卡是一个链接（去工具页加歌）：那时没有可交互的东西，
 * 包在 `Link` 里不涉及按钮嵌套。
 */
export function MusicCard() {
  const {
    current,
    playing,
    position,
    duration,
    loading,
    library,
    queuePlaylistName,
    toggle,
    next,
    prev,
    seek,
    mode,
    cycleMode,
    error,
  } = usePlayer();

  const empty = library.length === 0;

  if (empty) {
    return (
      <Link
        href="/tools/music-player"
        prefetch={false}
        className="block rounded-[2px] bg-white p-5 transition-colors hover:bg-[#FAFAFA]"
      >
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-[#000000]">
            <span className="h-3.5 w-[3px] bg-[#000000]" />
            正在播放
          </h2>
          <ArrowRight className="h-3 w-3 text-[#8A8A8A]" />
        </div>
        <div className="mt-4 flex flex-col items-center">
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-[#000000]">
            <LogoIcon className="h-10 w-10 text-white" />
          </div>
          <p className="mt-4 text-sm font-medium text-[#000000]">
            {loading ? "正在读取曲库…" : "曲库还没有歌"}
          </p>
          <p className="mt-0.5 text-xs text-[#8A8A8A]">
            {loading ? "稍等一下" : "去音乐播放器添加 →"}
          </p>
        </div>
      </Link>
    );
  }

  return (
    <section aria-label="正在播放" className="rounded-[2px] bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-[#000000]">
          <span className="h-3.5 w-[3px] bg-[#000000]" />
          正在播放
        </h2>
        <div className="flex items-center gap-2.5">
          {/* 正在放哪一摊：全库时写「全部歌曲」，没在播时不显示 */}
          {current ? (
            <span
              title={`正在播放：${queuePlaylistName}`}
              className="flex max-w-[7.5rem] items-center gap-1 rounded-[2px] bg-[#F5F5F5] px-1.5 py-0.5 text-[10px] text-[#1F1F1F]"
            >
              <ListMusic className="h-2.5 w-2.5 shrink-0 text-[#8A8A8A]" />
              <span className="truncate">{queuePlaylistName}</span>
            </span>
          ) : null}
          <button
            type="button"
            onClick={cycleMode}
            title={mode === "order" ? "顺序播放，点一下换成随机" : "随机播放，点一下换成顺序"}
            className="cursor-pointer text-xs text-[#8A8A8A] transition-colors hover:text-[#000000]"
          >
            {mode === "order" ? "顺序" : "随机"}
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-col items-center">
        {/* 黑胶：黑圆 + 白色 Logo，播放时旋转（旧原型同款） */}
        <div
          className={`flex h-24 w-24 items-center justify-center rounded-full bg-[#000000] ${
            playing ? "animate-[spin_8s_linear_infinite]" : ""
          }`}
        >
          <LogoIcon className="h-10 w-10 text-white" />
        </div>

        <p className="mt-4 max-w-full truncate text-sm font-medium text-[#000000]" title={current?.title}>
          {current ? current.title : "选一首开始播放"}
        </p>
        <p className="mt-0.5 max-w-full truncate text-xs text-[#8A8A8A]">
          {current
            ? [current.artist, formatLabel(current.codec)].filter(Boolean).join(" · ")
            : "从下面的曲库里挑"}
        </p>
        {error ? <p className="mt-1 text-xs text-[#B42318]">{error}</p> : null}

        <div className="mt-4 w-full">
          <Slider
            value={position}
            max={duration}
            step={0.1}
            onCommit={seek}
            label="播放进度"
            disabled={!current || duration <= 0}
          />
          <div className="mt-1.5 flex justify-between text-[10px] tabular-nums text-[#999999]">
            <span>{formatTime(position)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        <div className="mt-2 flex items-center gap-5">
          <button
            type="button"
            onClick={prev}
            aria-label="上一首"
            className="cursor-pointer text-[#666666] transition-colors hover:text-[#000000]"
          >
            <SkipBack className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={toggle}
            aria-label={playing ? "暂停" : "播放"}
            className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-[#000000] text-white transition-colors hover:bg-[#333333]"
          >
            {playing ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={next}
            aria-label="下一首"
            className="cursor-pointer text-[#666666] transition-colors hover:text-[#000000]"
          >
            <SkipForward className="h-4 w-4" />
          </button>
        </div>

        <Link
          href="/tools/music-player"
          prefetch={false}
          className="mt-3 text-[10px] text-[#A0A8B4] transition-colors hover:text-[#000000]"
        >
          管理曲库 →
        </Link>
      </div>
    </section>
  );
}
