"use client";

import { Pause, Play, Shuffle, SkipBack, SkipForward, Volume2, VolumeX } from "lucide-react";
import { formatLabel } from "@/features/music-player/shared/formats";
import { formatTime } from "@/features/music-player/shared/format";
import { cn } from "@/lib/utils";
import { usePlayer } from "./player-provider";
import { Slider } from "./slider";

/**
 * 工具页顶部的播放条（features/music-player/README.md §2.1）。
 *
 * 它只是遥控器：真正的 `<audio>` 在 `PlayerProvider` 里。这里没有任何播放状态，
 * 全部读写 Context——首页卡改了什么，这里立刻看到；反过来也一样。
 */
export function PlayerStrip() {
  const {
    current,
    playing,
    position,
    duration,
    volume,
    setVolume,
    mode,
    cycleMode,
    toggle,
    next,
    prev,
    seek,
    loading,
    library,
    error,
  } = usePlayer();

  const empty = library.length === 0;

  return (
    <section aria-label="正在播放" className="rounded-[2px] bg-white p-4 md:p-5">
      <div className="flex flex-wrap items-center gap-3 lg:flex-nowrap lg:gap-4">
        {/* 曲目信息：移动端整行，宽屏占左侧弹性宽度 */}
        <div className="min-w-0 basis-full lg:basis-auto lg:flex-1">
          <p className="truncate text-sm font-medium text-[#000000]">
            {current ? current.title : loading ? "正在读取曲库…" : "还没有选中歌曲"}
          </p>
          <p className="mt-0.5 truncate text-xs text-[#8A8A8A]">
            {current
              ? [current.artist, formatLabel(current.codec)].filter(Boolean).join(" · ")
              : empty
                ? "从下面的曲库里点一首，或者先传一首上来"
                : "点下面列表里的任意一首开始播放"}
          </p>
          {error ? <p className="mt-0.5 text-xs text-[#B42318]">{error}</p> : null}
        </div>

        {/* 进度：移动端整行，宽屏居中 */}
        <div className="flex basis-full items-center gap-2 lg:basis-auto lg:flex-[2]">
          <span className="w-10 shrink-0 text-right text-[10px] tabular-nums text-[#999999]">
            {formatTime(position)}
          </span>
          <Slider
            value={position}
            max={duration}
            step={0.1}
            onCommit={seek}
            label="播放进度"
            disabled={!current || duration <= 0}
          />
          <span className="w-10 shrink-0 text-[10px] tabular-nums text-[#999999]">
            {formatTime(duration)}
          </span>
        </div>

        {/* 三个主控按钮 */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={prev}
            disabled={empty}
            aria-label="上一首"
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-[2px] text-[#666666] transition-colors hover:bg-[#F5F5F5] hover:text-[#000000] disabled:cursor-not-allowed disabled:text-[#C8C8C8]"
          >
            <SkipBack className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={toggle}
            disabled={empty}
            aria-label={playing ? "暂停" : "播放"}
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-[#000000] text-white transition-colors hover:bg-[#333333] disabled:cursor-not-allowed disabled:bg-[#C8C8C8]"
          >
            {playing ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={next}
            disabled={empty}
            aria-label="下一首"
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-[2px] text-[#666666] transition-colors hover:bg-[#F5F5F5] hover:text-[#000000] disabled:cursor-not-allowed disabled:text-[#C8C8C8]"
          >
            <SkipForward className="h-4 w-4" />
          </button>
        </div>

        {/* 播放模式 + 音量 */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={cycleMode}
            disabled={empty}
            title={mode === "order" ? "顺序播放，点一下换成随机" : "随机播放，点一下换成顺序"}
            className="flex h-8 cursor-pointer items-center gap-1.5 rounded-[2px] px-2 text-xs text-[#666666] transition-colors hover:bg-[#F5F5F5] hover:text-[#000000] disabled:cursor-not-allowed disabled:text-[#C8C8C8]"
          >
            {mode === "order" ? (
              <SkipForward className="h-3.5 w-3.5" />
            ) : (
              <Shuffle className="h-3.5 w-3.5" />
            )}
            {mode === "order" ? "顺序" : "随机"}
          </button>

          <div className="hidden items-center gap-2 pl-1 lg:flex">
            <button
              type="button"
              onClick={() => setVolume(volume > 0 ? 0 : 1)}
              aria-label={volume > 0 ? "静音" : "取消静音"}
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-[2px] text-[#666666] transition-colors hover:bg-[#F5F5F5] hover:text-[#000000]"
            >
              {volume > 0 ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>
            <Slider
              value={volume}
              max={1}
              step={0.01}
              onCommit={setVolume}
              onInput={setVolume}
              label="音量"
              className="w-20"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * 正在播那一行左侧的等化器（三根跳动的竖条）。
 *
 * 只有 `playing` 时才动：暂停的行里条子还在跳，看起来像两个东西同时在放。
 */
export function Equalizer({ playing }: { playing: boolean }) {
  return (
    <span aria-hidden="true" className="flex h-3.5 w-3.5 items-center justify-center gap-[2px]">
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className={cn(
            "w-[2px] origin-center rounded-full bg-[#000000]",
            playing ? "animate-eq" : "scale-y-50",
          )}
          style={{
            height: "100%",
            animationDelay: playing ? `${index * 0.15}s` : undefined,
          }}
        />
      ))}
    </span>
  );
}
