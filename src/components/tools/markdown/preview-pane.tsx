"use client";

import { useDeferredValue, useMemo } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

/**
 * 右栏：实时预览（《功能/Markdown编辑器》§二 2.4、《界面设计规范》§7.25.5）。
 *
 * 选 `react-markdown` 的理由写在《功能/Markdown编辑器》§四：它输出的是 **React 元素树**，
 * 不经过 `dangerouslySetInnerHTML`，所以原始 HTML 天然不会被渲染（`skipHtml` 默认 false
 * 时按**原文字面**显示），没有 XSS 面，也就不需要一层 HTML 消毒。
 *
 * **不做代码高亮**（《功能/Markdown编辑器》§一「主动放弃」）：多一个高亮包 + 一套主题色，
 * 只服务「把代码贴给外人看」这一个场景；代码块等宽 + 灰底就够读。
 */

/**
 * 元素样式表（§2.4 那张表）。Tailwind 的 preflight 已经把 `h1` 字号、`ul` 的
 * `list-style` 清零了，不在这里补一组，渲染出来标题和正文一样大、列表没有点。
 *
 * 写成组件映射而不是 `.markdown-body` 的 CSS 文件：本仓库只有一份 `globals.css`，
 * 没有 CSS module 先例，把样式留在 JSX 里也更贴近「只作用在预览区」这个要求。
 */
const COMPONENTS: Components = {
  h1: ({ children }) => (
    <h1 className="mt-6 text-[22px] font-semibold leading-snug text-[#000000] first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-5 text-[18px] font-semibold leading-snug text-[#000000]">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-4 text-[15px] font-semibold leading-snug text-[#000000]">
      {children}
    </h3>
  ),
  h4: ({ children }) => (
    <h4 className="mt-3 text-[14px] font-semibold leading-snug text-[#000000]">
      {children}
    </h4>
  ),
  h5: ({ children }) => (
    <h5 className="mt-3 text-[14px] font-semibold leading-snug text-[#1F1F1F]">
      {children}
    </h5>
  ),
  h6: ({ children }) => (
    <h6 className="mt-3 text-[13px] font-semibold leading-snug text-[#666666]">
      {children}
    </h6>
  ),
  p: ({ children }) => (
    <p className="mt-3 text-[14px] leading-[1.7] text-[#1F1F1F] max-md:text-[15px] first:mt-0">
      {children}
    </p>
  ),
  ul: ({ children }) => (
    <ul className="mt-3 list-disc pl-5 text-[14px] leading-[1.7] text-[#1F1F1F] max-md:text-[15px]">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="mt-3 list-decimal pl-5 text-[14px] leading-[1.7] text-[#1F1F1F] max-md:text-[15px]">
      {children}
    </ol>
  ),
  // 任务列表的复选框所在行不要项目符号（GFM 给这一行加 `task-list-item`）
  li: ({ children, className }) => (
    <li className={cn("mt-1", className?.includes("task-list-item") && "list-none")}>
      {children}
    </li>
  ),
  input: ({ ...props }) => (
    <input {...props} className="mr-1.5 accent-[#000000]" />
  ),
  blockquote: ({ children }) => (
    <blockquote className="mt-3 border-l-2 border-[#DDDDDD] pl-3 text-[14px] leading-[1.7] text-[#666666]">
      {children}
    </blockquote>
  ),
  code: ({ children }) => (
    <code className="rounded-[2px] bg-[#F5F5F5] px-1 py-0.5 font-mono text-[12px] text-[#1F1F1F]">
      {children}
    </code>
  ),
  // 代码块里的 `code` 不再套一层灰底和内边距（背景由 pre 出）；用后代选择器提高优先级，
  // 盖住上面那条行内样式（单类选择器的优先级更低，不靠顺序取胜）
  pre: ({ children }) => (
    <pre className="mt-3 overflow-x-auto rounded-[2px] bg-[#F5F5F5] p-3 font-mono text-[12px] leading-[1.6] [&_code]:bg-transparent [&_code]:p-0">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-[#ECECEC] bg-[#FAFAFA] px-2 py-1 text-left font-semibold text-[#1F1F1F]">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-[#ECECEC] px-2 py-1 text-[#1F1F1F]">{children}</td>
  ),
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="text-[#000000] underline underline-offset-2"
    >
      {children}
    </a>
  ),
  hr: () => <hr className="my-4 border-[#F0F0F0]" />,
  img: ({ src, alt }) => (
    // eslint-disable-next-line @next/next/no-img-element -- 预览里的图片来自正文 URL，尺寸未知
    <img src={typeof src === "string" ? src : undefined} alt={alt ?? ""} className="mt-3 max-w-full" />
  ),
};

interface PreviewPaneProps {
  body: string;
  className?: string;
}

export function PreviewPane({ body, className }: PreviewPaneProps) {
  /**
   * 预览吃的是**延迟快照**，不是每个按键：10 万字的文档每敲一个字都重新解析整篇，
   * 打字会卡（§七「长文档预览卡顿」）。`useDeferredValue` 把「解析」放到不阻塞输入的
   * 低优先级渲染里，效果与「防抖后取值」一致，但不用自己管定时器。
   */
  const deferredBody = useDeferredValue(body);

  const plugins = useMemo(() => [remarkGfm], []);
  const isEmpty = deferredBody.trim() === "";

  return (
    <div className={cn("h-full overflow-y-auto bg-white", className)}>
      <div className="px-5 py-4">
        {isEmpty ? (
          <p className="text-[13px] italic text-[#C4C4C4]">预览会显示在这里</p>
        ) : (
          <div className="text-[#1F1F1F]">
            <Markdown remarkPlugins={plugins} components={COMPONENTS}>
              {deferredBody}
            </Markdown>
          </div>
        )}
      </div>
    </div>
  );
}
