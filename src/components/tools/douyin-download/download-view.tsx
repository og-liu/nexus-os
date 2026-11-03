"use client";

import { useState } from "react";
import { Loader2, Menu } from "lucide-react";
import { useAppShell } from "@/components/layout/app-shell";
import { findToolBySlug } from "@/components/tools/tool-catalog";
import { ToolHeader } from "@/components/tools/tool-header";
import type { DouyinVideo } from "@/lib/douyin/client";
import { ResultCard, type ResultPhase } from "./result-card";

/**
 * 抖音下载工具页的视图层（《功能/抖音下载》§2）。
 *
 * 版式是**一张表单 + 一张结果卡**，不是音频提取那种「左文件右操作」的两栏工作区——
 * 这里没有文件区，照搬两栏会空掉一栏。宽屏只在结果卡内部横向分栏（封面左、信息右）。
 *
 * 移动端顶部只放汉堡：本页的主操作「解析」依赖输入框的内容，把它挪到顶部会和输入框分家。
 */

interface ParseResponse {
  code: string;
  error?: string;
  cached?: boolean;
  video?: DouyinVideo;
}

/** 下载按钮恢复原状的延时。浏览器不告诉我们下载何时开始，只能给个够短又不闪烁的时间。 */
const DOWNLOAD_FEEDBACK_MS = 1200;

export function DouyinDownloadView() {
  const tool = findToolBySlug("douyin-download");
  const { openNav } = useAppShell();

  const [text, setText] = useState("");
  const [phase, setPhase] = useState<ResultPhase>("idle");
  const [video, setVideo] = useState<DouyinVideo | null>(null);
  const [error, setError] = useState("");
  /** 服务端的错误码：只有 `no-key` 会多给一个「去设置」的入口 */
  const [errorCode, setErrorCode] = useState("");
  const [downloading, setDownloading] = useState(false);

  const loading = phase === "loading";

  async function parse() {
    const value = text.trim();
    if (!value || loading) return;

    setPhase("loading");
    setError("");
    setErrorCode("");

    try {
      const response = await fetch("/api/tools/douyin-download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: value }),
      });
      const data = (await response.json()) as ParseResponse;

      if (!response.ok || data.code !== "ok" || !data.video) {
        setPhase("error");
        setError(data.error ?? "解析失败了，稍后再试");
        setErrorCode(data.code ?? "");
        return;
      }

      setVideo(data.video);
      setPhase("done");
    } catch {
      setPhase("error");
      setError("网络不太顺，再试一次");
      setErrorCode("");
    }
  }

  function download() {
    if (!video || downloading) return;
    setDownloading(true);

    // 交给浏览器原生下载：它有进度条、有「正在下载」提示，大文件也不会先整块读进内存。
    // 文件名由服务端的 Content-Disposition 决定。
    //
    // 之前试过「先 fetch 成 blob 再存」，好处是失败能在页面上报错，代价是几十 MB 的视频
    // 要整块读完才开始写盘——实测一次下载 14–16 秒，期间按钮一直转圈、没有任何进度，
    // 看起来就是卡死了（《功能/抖音下载》§四）。
    const link = document.createElement("a");
    link.href = `/api/tools/douyin-download/file?id=${encodeURIComponent(video.awemeId)}`;
    link.download = "";
    document.body.appendChild(link);
    link.click();
    link.remove();

    window.setTimeout(() => setDownloading(false), DOWNLOAD_FEEDBACK_MS);
  }

  return (
    <>
      {/* 移动端导航行：工具页没有页头，没有汉堡就断了侧栏入口（与 ToolMobileBar 同断点） */}
      <div className="flex items-center px-4 pt-3 lg:hidden">
        <button
          type="button"
          onClick={openNav}
          aria-label="打开菜单"
          className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-[2px] text-[#1F1F1F] transition-colors hover:bg-[#E5E5E5]"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      <div className="px-4 py-4 md:px-6 md:py-6">
        <div className="space-y-4 xl:space-y-6">
          {tool ? <ToolHeader tool={tool} /> : null}

          <section className="rounded-[2px] bg-white p-5 md:p-6">
            <label
              htmlFor="douyin-link"
              className="flex items-center gap-2 text-sm font-semibold text-[#000000]"
            >
              <span className="h-3.5 w-[3px] bg-[#000000]" />
              抖音链接
            </label>

            <textarea
              id="douyin-link"
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                // 回车直接解析，Shift+回车换行——一行的输入不需要专门去点按钮
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void parse();
                }
              }}
              rows={2}
              placeholder="把抖音的分享链接贴进来，整段文案也行"
              className="mt-3 w-full resize-none rounded-[2px] border border-[#E5E5E5] bg-white px-3 py-2.5 text-base leading-relaxed text-[#1F1F1F] outline-none transition-colors placeholder:text-[#A0A8B4] focus:border-[#000000] md:text-sm"
            />

            <button
              type="button"
              onClick={() => void parse()}
              disabled={!text.trim() || loading}
              className="mt-3 flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-[2px] bg-[#000000] text-sm font-medium text-white transition-colors hover:bg-[#333333] disabled:cursor-not-allowed disabled:bg-[#A0A8B4]"
            >
              {loading ? (
                <>
                  <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                  解析中…
                </>
              ) : (
                "解析"
              )}
            </button>
          </section>

          <ResultCard
            phase={phase}
            video={video}
            error={error}
            errorCode={errorCode}
            downloading={downloading}
            onDownload={download}
          />
        </div>
      </div>
    </>
  );
}
