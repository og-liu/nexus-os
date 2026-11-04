"use client";

import { useDeferredValue } from "react";
import { cn } from "@/lib/utils";

/**
 * 右栏：实时预览（《功能/HTML编辑器》§2.5）。
 *
 * HTML 版的预览**必须真的渲染用户写的 HTML**，所以不能走 Markdown 版那套
 * 「React 元素树」——这里用 `<iframe srcdoc>`：
 *
 * - iframe 是独立文档：用户的 `<style>` 只作用于预览，不会污染全站；
 * - `sandbox="allow-scripts"`、**不给 `allow-same-origin`**：脚本能跑（自己写的页面
 *   要能交互），但 iframe 是 opaque origin，`parent.document` 访问会报错，
 *   拿不到本站 DOM / cookie（见《功能/HTML编辑器》§四、§七）；
 * - **绝对不要同时给 `allow-scripts` 与 `allow-same-origin`**：那等于没有沙箱。
 *
 * 预览吃 `useDeferredValue` 快照，不是每个按键：10 万字的文档每敲一个字都重载
 * 整篇 iframe，打字会卡（同 Markdown 版 §七「长文档预览卡顿」）。
 */
interface PreviewPaneProps {
  body: string;
  className?: string;
}

export function PreviewPane({ body, className }: PreviewPaneProps) {
  const deferredBody = useDeferredValue(body);
  const isEmpty = deferredBody.trim() === "";

  return (
    <div className={cn("h-full overflow-hidden bg-white", className)}>
      {isEmpty ? (
        <p className="px-5 py-4 text-[13px] italic text-[#C4C4C4]">预览会显示在这里</p>
      ) : (
        <iframe
          title="HTML 预览"
          sandbox="allow-scripts"
          srcDoc={deferredBody}
          className="h-full w-full border-0 bg-white"
        />
      )}
    </div>
  );
}
