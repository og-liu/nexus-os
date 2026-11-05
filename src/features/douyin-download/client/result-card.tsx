"use client";

import Link from "next/link";
import { Download, Loader2, Link2 } from "lucide-react";
import type { DouyinVideo } from "@/features/douyin-download/server/client";

/**
 * 抖音下载的结果卡（features/douyin-download/README.md §2.3）。
 *
 * 四态：空占位 / 解析中 / 成功 / 失败。解析中**保留上一次的结果**——
 * 换一条链接时把已有内容闪成白屏，比多等两秒更难受。
 */

export type ResultPhase = "idle" | "loading" | "done" | "error";

interface ResultCardProps {
  phase: ResultPhase;
  video: DouyinVideo | null;
  error: string;
  /** 服务端返回的错误码：`no-key` 时多给一个「去设置」的入口 */
  errorCode?: string;
  downloading: boolean;
  onDownload: () => void;
}

/** 毫秒 → `m:ss`。抖音视频短，`0:06` 这种形式比 `6 秒` 更适合和时长并排看。 */
function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** 空态与失败态共用的虚线框（《界面设计规范》的空态写法）。 */
function EmptyBlock({
  icon: Icon,
  title,
  hint,
  extra,
}: {
  icon: typeof Link2;
  title: string;
  hint: string;
  extra?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-[2px] border border-dashed border-[#D9D9D9] bg-white px-6 py-14 text-center">
      <Icon aria-hidden="true" className="h-6 w-6 text-[#A0A8B4]" />
      <p className="text-sm text-[#1F1F1F]">{title}</p>
      <p className="text-xs text-[#A0A8B4]">{hint}</p>
      {extra}
    </div>
  );
}

export function ResultCard({
  phase,
  video,
  error,
  errorCode,
  downloading,
  onDownload,
}: ResultCardProps) {
  // 失败且没有可展示的内容：一句人话 + 指回输入框
  if (phase === "error" && !video) {
    const missingKey = errorCode === "no-key";
    return (
      <EmptyBlock
        icon={Link2}
        title={error}
        hint={missingKey ? "填好之后回来再解析一次" : "换一条链接再试，或者检查一下这条是不是抖音的"}
        extra={
          missingKey ? (
            <Link
              href="/settings"
              prefetch={false}
              className="mt-1 cursor-pointer text-xs text-[#000000] underline underline-offset-4"
            >
              去设置里填 Key
            </Link>
          ) : null
        }
      />
    );
  }

  // 空态 / 首次解析中（还没有结果可留）
  if (!video) {
    return phase === "loading" ? (
      <div className="flex flex-col items-center justify-center gap-2 rounded-[2px] border border-dashed border-[#D9D9D9] bg-white px-6 py-14 text-center">
        <Loader2 aria-hidden="true" className="h-6 w-6 animate-spin text-[#A0A8B4]" />
        <p className="text-sm text-[#1F1F1F]">正在解析…</p>
        <p className="text-xs text-[#A0A8B4]">一般两三秒，慢的时候要七八秒</p>
      </div>
    ) : (
      <EmptyBlock
        icon={Link2}
        title="还没有解析过链接"
        hint="把抖音的分享链接贴到上面，点「解析」"
      />
    );
  }

  return (
    <section className="rounded-[2px] bg-white p-5 md:p-6">
      <div className="flex gap-4">
        {/* 抖音视频绝大多数是竖屏，缩略图按 3:4 裁切比 16:9 更能看清画面。
            尺寸固定、不随栏宽放大：封面放大到 280×350 会把右侧信息压成一条，
            卡片剩一大片空白（第一版就是这么废掉的）。 */}
        {/* eslint-disable-next-line @next/next/no-img-element -- 远图不带尺寸，next/image 要配域名白名单 */}
        <img
          src={video.coverUrl}
          alt=""
          loading="lazy"
          className="h-[120px] w-[90px] shrink-0 rounded-[2px] bg-[#F5F5F5] object-cover"
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <p className="line-clamp-2 text-sm leading-relaxed text-[#000000]">
            {video.title || "（这条视频没有文案）"}
          </p>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#8A8A8A]">
            <span className="truncate">{video.author || "未知作者"}</span>
            <span aria-hidden="true">·</span>
            <span>{formatDuration(video.durationMs)}</span>
          </div>

          {phase === "error" ? (
            <p className="mt-2 text-xs text-[#B91C1C]">{error}</p>
          ) : null}

          <button
            type="button"
            onClick={onDownload}
            disabled={downloading}
            className="mt-auto flex h-9 w-full cursor-pointer items-center justify-center gap-2 rounded-[2px] bg-[#000000] text-sm font-medium text-white transition-colors hover:bg-[#333333] disabled:cursor-not-allowed disabled:bg-[#A0A8B4] md:w-auto md:self-start md:px-6"
          >
            {downloading ? (
              <>
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                下载中…
              </>
            ) : (
              <>
                <Download aria-hidden="true" className="h-4 w-4" />
                下载视频
              </>
            )}
          </button>
        </div>
      </div>
    </section>
  );
}
