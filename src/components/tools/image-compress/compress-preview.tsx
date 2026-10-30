"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { formatBytes } from "@/lib/image-compress/format-bytes";
import { CompressCompare } from "./compress-compare";

/**
 * 已载入的预览区（《功能/图片压缩》§2.1）。
 *
 * 顶部状态条：文件名 + `4000 × 3000 · 原图 3.0 MB → 压缩后 1.4 MB` + 右侧「换一张」。
 * 两版数字并排写，是因为出结果后画面上**同时**摆着原图与压缩后（左边/右边），
 * 只写一个数反而会让人以为另一侧也是那个体积。
 *
 * 出结果后画面上出现**对比滑块**（`CompressCompare`）：左原图、右压缩后，
 * 中间竖线可拖。原来的「看原图 / 看压缩后」按钮已经删掉——滑块拖到两端
 * 就是「整张看某一版」，留两个入口是做同一件事。
 */
interface CompressPreviewProps {
  name: string;
  /** 原图字节数。 */
  size: number;
  /** 压缩结果的字节数；还没出结果时为 `null`。 */
  compressedSize: number | null;
  width: number;
  height: number;
  originalUrl: string;
  /** 压缩结果的 object URL；还没编码完时为 `null`。 */
  compressedUrl: string | null;
  /** 是否正在编码（盖一层半透明遮罩，不锁参数面板）。 */
  encoding: boolean;
  /** 编码开始时刻（毫秒），用来显示「已用 N 秒」与进度条。 */
  encodingStartedAt: number | null;
  onReplace: () => void;
}

export function CompressPreview({
  name,
  size,
  compressedSize,
  width,
  height,
  originalUrl,
  compressedUrl,
  encoding,
  encodingStartedAt,
  onReplace,
}: CompressPreviewProps) {
  const meta = `${width} × ${height}${
    compressedSize !== null
      ? ` · 原图 ${formatBytes(size)} → 压缩后 ${formatBytes(compressedSize)}`
      : ` · ${formatBytes(size)}`
  }`;

  return (
    <section className="overflow-hidden rounded-[2px] bg-white">
      <div className="border-b border-[#F0F0F0] px-3 py-2 md:px-4">
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-xs font-medium text-[#000000]">
            {name}
          </p>
          {/* 手机上尺寸体积单独一行，否则文件名会被挤成「p…」 */}
          <p className="hidden shrink-0 text-[11px] tabular-nums text-[#999999] md:block">
            {meta}
          </p>
          <button
            type="button"
            onClick={onReplace}
            className="flex h-7 shrink-0 cursor-pointer items-center rounded-[2px] px-2.5 text-xs text-[#8A8A8A] transition-colors hover:text-[#000000]"
          >
            换一张
          </button>
        </div>
        <p className="mt-0.5 text-[11px] tabular-nums text-[#999999] md:hidden">
          {meta}
        </p>
      </div>

      <div className="relative flex min-h-[220px] items-center justify-center bg-[#F5F5F5] p-4 md:min-h-[300px] lg:min-h-[420px] xl:h-[calc(100vh-22rem)] xl:min-h-[360px]">
        {/* 原图：撑出容器高度，也是对比滑块底下那一层 */}
        {/* eslint-disable-next-line @next/next/no-img-element -- 本地 object URL，不走 next/image */}
        <img
          key={originalUrl}
          src={originalUrl}
          alt={`${name}（原图）`}
          draggable={false}
          className="max-h-full max-w-full object-contain"
        />

        {compressedUrl !== null ? (
          <CompressCompare
            compressedUrl={compressedUrl}
            width={width}
            height={height}
            name={name}
          />
        ) : null}

        {encoding && encodingStartedAt !== null ? (
          <EncodingOverlay
            startedAt={encodingStartedAt}
            estimatedMs={Math.max(1200, 900 + (width * height * 600) / 1e6)}
          />
        ) : null}
      </div>
    </section>
  );
}

/**
 * 编码遮罩：旋转图标 + 已用秒数 + 进度条。
 *
 * oxipng 是同步 WASM（跑在 Worker 里），拿不到真实进度，所以条是按「已用时间 /
 * 预计时间」推的，封顶 95%——它只回答「还在动、大概要多久」，不假装精确。
 * 秒数是实打实的，用户能确认页面没死。
 */
function EncodingOverlay({
  startedAt,
  estimatedMs,
}: {
  startedAt: number;
  estimatedMs: number;
}) {
  const [elapsedMs, setElapsedMs] = useState(() => Date.now() - startedAt);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setElapsedMs(Date.now() - startedAt);
    }, 250);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  const seconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const percent = Math.min(95, Math.max(3, Math.round((elapsedMs / estimatedMs) * 95)));

  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-white/80 backdrop-blur-[1px]">
      <Loader2
        aria-label="压缩中"
        className="h-5 w-5 animate-spin text-[#000000]"
      />
      <p className="text-xs font-medium text-[#000000]">
        正在压缩…{seconds > 0 ? ` 已用 ${seconds} 秒` : ""}
      </p>
      <div
        role="progressbar"
        aria-label="压缩进度"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-1 w-40 overflow-hidden rounded-full bg-[#E5E5E5]"
      >
        <div
          className="h-full rounded-full bg-[#000000] transition-[width] duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="text-[11px] text-[#8A8A8A]">
        大图可能要几秒到十几秒，请不要关闭页面
      </p>
    </div>
  );
}
