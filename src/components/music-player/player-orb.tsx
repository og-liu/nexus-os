"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ListMusic, Pause, Play, SkipBack, SkipForward, X } from "lucide-react";
import { formatLabel } from "@/lib/music-player/formats";
import { formatTime } from "@/lib/music-player/format";
import { OrbMark } from "./orb-mark";
import { usePlayer } from "./player-provider";
import { Slider } from "./slider";

/**
 * 右下角悬浮球（《功能/音乐播放器》§2.4）。
 *
 * 跟首页卡、工具页播放条并列的**第三个遥控器**，也是最方便的那个：它挂在
 * `AppShell` 上、`fixed` 定位，所以切到哪一页都在。真正的 `<audio>` 仍然只有
 * `PlayerProvider` 里那一个——这里同样只读写 Context。
 *
 * 两件事跟普通浮层不一样：
 *
 * 1. **「点外面关掉」不用遮罩。** 铺一层透明遮罩会连球本身一起盖住（第二次点球
 *    变成点遮罩），还会吞掉页面上其它元素的 hover。这里改为监听 `pointerdown`
 *    判断目标在不在容器里（§七第 12 条）。
 * 2. **切页面自动收起，但不靠 effect 去 setState。** 面板记的是「在哪个路径下打开的」，
 *    渲染时与当前路径一比就知道该不该开——路由一变它自然失效，不用额外同步。
 */
export function PlayerOrb() {
  const pathname = usePathname();
  const {
    current,
    playing,
    position,
    duration,
    library,
    loading,
    error,
    queuePlaylistName,
    toggle,
    next,
    prev,
    seek,
    mode,
    cycleMode,
  } = usePlayer();

  /** 面板是在哪个路径下打开的；与当前路径不一致 = 已经切页了，自动收起 */
  const [openFor, setOpenFor] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const open = openFor === pathname;

  const close = useCallback(() => setOpenFor(null), []);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  const empty = library.length === 0;

  return (
    <div
      ref={rootRef}
      className="fixed bottom-[max(20px,env(safe-area-inset-bottom))] right-5 z-40"
    >
      {open ? (
        <section
          aria-label="快捷播放"
          className="absolute bottom-12 right-0 w-[300px] rounded-[2px] border border-[#E5E5E5] bg-white p-4 shadow-xl"
        >
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-xs font-semibold text-[#000000]">
              <span className="h-3 w-[3px] bg-[#000000]" />
              正在播放
            </h2>
            <button
              type="button"
              onClick={close}
              aria-label="收起"
              className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-[2px] text-[#A0A8B4] transition-colors hover:bg-[#F5F5F5] hover:text-[#000000]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {empty ? (
            <div className="mt-3 pb-1">
              <p className="text-sm text-[#000000]">
                {loading ? "正在读取曲库…" : "曲库还没有歌"}
              </p>
              <Link
                href="/tools/music-player"
                prefetch={false}
                onClick={close}
                className="mt-1 inline-block text-xs text-[#8A8A8A] underline-offset-2 transition-colors hover:text-[#000000] hover:underline"
              >
                去音乐播放器添加 →
              </Link>
            </div>
          ) : (
            <>
              <div className="mt-3 min-w-0">
                <p
                  className="truncate text-sm font-medium text-[#000000]"
                  title={current?.title}
                >
                  {current ? current.title : "选一首开始播放"}
                </p>
                <p className="mt-0.5 truncate text-[10px] text-[#8A8A8A]">
                  {current
                    ? [current.artist, formatLabel(current.codec)].filter(Boolean).join(" · ")
                    : "点下面的播放键从第一首开始"}
                </p>
                {/* 正在放哪一摊：全库时写「全部歌曲」，没在播时不显示 */}
                {current ? (
                  <span
                    title={`正在播放：${queuePlaylistName}`}
                    className="mt-1 inline-flex max-w-full items-center gap-1 rounded-[2px] bg-[#F5F5F5] px-1.5 py-0.5 text-[10px] text-[#1F1F1F]"
                  >
                    <ListMusic className="h-2.5 w-2.5 shrink-0 text-[#8A8A8A]" />
                    <span className="truncate">{queuePlaylistName}</span>
                  </span>
                ) : null}
              </div>

              {error ? <p className="mt-1 text-[10px] text-[#B42318]">{error}</p> : null}

              <div className="mt-3 flex items-center gap-2">
                <span className="w-9 shrink-0 text-right text-[10px] tabular-nums text-[#999999]">
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
                <span className="w-9 shrink-0 text-[10px] tabular-nums text-[#999999]">
                  {formatTime(duration)}
                </span>
              </div>

              <div className="mt-3 flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={prev}
                    aria-label="上一首"
                    className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-[2px] text-[#666666] transition-colors hover:bg-[#F5F5F5] hover:text-[#000000]"
                  >
                    <SkipBack className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={toggle}
                    aria-label={playing ? "暂停" : "播放"}
                    className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-[#000000] text-white transition-colors hover:bg-[#333333]"
                  >
                    {playing ? (
                      <Pause className="h-4 w-4" />
                    ) : (
                      <Play className="ml-0.5 h-4 w-4" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={next}
                    aria-label="下一首"
                    className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-[2px] text-[#666666] transition-colors hover:bg-[#F5F5F5] hover:text-[#000000]"
                  >
                    <SkipForward className="h-4 w-4" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={cycleMode}
                  title={mode === "order" ? "顺序播放，点一下换成随机" : "随机播放，点一下换成顺序"}
                  className="cursor-pointer text-[10px] text-[#8A8A8A] transition-colors hover:text-[#000000]"
                >
                  {mode === "order" ? "顺序" : "随机"}
                </button>
              </div>

              <Link
                href="/tools/music-player"
                prefetch={false}
                onClick={close}
                className="mt-2 block border-t border-[#F0F0F0] pt-2 text-[10px] text-[#A0A8B4] transition-colors hover:text-[#000000]"
              >
                打开曲库 →
              </Link>
            </>
          )}
        </section>
      ) : null}

      {/*
        球本体：尺寸、底色、模糊、三层阴影全部照 Next 开发指示器实测值来
        （《功能/音乐播放器》§2.4）。`overflow-hidden` 是必需的——里面的 SVG 是
        40×40、比球大，图标靠它裁成圆形内的样子。

        阴影用内联 style 而不是 Tailwind 任意值：三层 shadow 里夹着 `rgba(...)` 的逗号，
        写在 `shadow-[...]` 里会被 Tailwind 拆坏（实测生成出来的全是空 shadow，球变成一张
        没有描边的扁圆）。
      */}
      <button
        type="button"
        onClick={() => setOpenFor(open ? null : pathname)}
        aria-label={open ? "收起播放面板" : "打开播放面板"}
        aria-expanded={open}
        title={current ? `正在播放：${current.title}` : "音乐播放器"}
        style={{
          boxShadow:
            "0 0 0 1px rgb(23,23,23), inset 0 0 0 1px rgba(255,255,255,0.14), 0 16px 32px -8px rgba(0,0,0,0.24)",
        }}
        className="group relative flex h-9 w-9 cursor-pointer items-center justify-center overflow-hidden rounded-full bg-black/80 backdrop-blur-[48px] transition-transform duration-150 ease-out active:scale-95"
      >
        <span className="relative flex h-8 w-8 items-center">
          {/*
            悬停的高光在**内层这个 32×32 的圆**上，不是整个 36 的球：
            原版的 `:hover` 写在 `[data-next-mark]` 上（宽高 = mark-size = 32，`margin: 0 2px`），
            所以球最外那 2px 的一圈保持深色。
            而且它是**叠在黑底之上的白色 13%**（`hsla(0,0%,100%,.13)`），混合出来才是中灰；
            直接 `hover:bg-white/[0.13]` 会把黑底整个换掉，球就"消失"在浅灰页面里了。
          */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-full bg-white/0 transition-colors duration-150 ease-out group-hover:bg-white/[0.13]"
          />
          <OrbMark playing={playing} />
        </span>
      </button>
    </div>
  );
}
