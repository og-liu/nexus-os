"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { nextQuote } from "@/lib/quote/actions";

/**
 * 总览页第四块「每日一句」（《功能/每日一句》§2.2）。
 *
 * 当天那句由首页（Server Component）算好传进来；这里只负责「换一句」：
 * 点一下调 Server Action 取下一条，本地换显示，**不写库**——刷新页面就回到当天那句。
 * 客户端只 import action，不 import 句子库（365 条常量留在服务端）。
 *
 * 跨天怎么办：整夜开着页面时，日期面板的时钟在零点 `router.refresh()`，首页会用新的
 * `dateKey` 重算并把新句子传进来。本组件的显示状态是本地 `useState`，靠首页给它的
 * `key={dateKey}` 在跨天时重挂载来复位（见 `src/app/(app)/page.tsx`）——不这么做，
 * props 换了而 state 还停在昨天，卡片就永远不跟着天亮。
 *
 * 读屏：正文与署名包在 `aria-live="polite"` 里，换句后新句子被朗读一次；
 * 卡片本身有 `aria-label`，在页面的区域列表里读得出来。
 */

interface QuoteCardProps {
  /** 当天那句在句子库里的下标，换一句从它往下数。 */
  index: number;
  /** 正文。 */
  body: string;
  /** 作者。 */
  author: string;
}

export function QuoteCard({ index, body, author }: QuoteCardProps) {
  const [shown, setShown] = useState<QuoteCardProps>({ index, body, author });
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function change() {
    if (pending) return;
    startTransition(async () => {
      try {
        const next = await nextQuote(shown.index);
        setShown(next);
        setError(null);
      } catch {
        // 动作本身不碰网络和数据库，失败只可能是会话 / 部署层面的意外；
        // 这时保持原句不动，给一行提示，别让卡片变空。
        setError("暂时换不了，请稍后再试");
      }
    });
  }

  return (
    <section aria-label="每日一句" className="rounded-[2px] bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="h-3.5 w-[3px] bg-[#000000]" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-[#000000]">每日一句</h2>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-xs text-[#8A8A8A]">每天更新</span>
          <button
            type="button"
            aria-label="换一句"
            aria-busy={pending}
            disabled={pending}
            onClick={change}
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-[2px] text-[#8A8A8A] transition-colors hover:bg-[#ECECEC] hover:text-[#000000] disabled:cursor-default disabled:opacity-50"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div aria-live="polite" aria-atomic="true" className="mt-4">
        {/* 正文块至少两行高：一句一行、另一句两行时卡片高度不跳 */}
        <p className="min-h-[3.5rem] text-[15px] leading-7 text-[#000000]">
          {shown.body}
        </p>
        <p className="mt-2 text-xs text-[#8A8A8A]">—— {shown.author}</p>
      </div>

      {error ? (
        <p role="alert" className="mt-2 text-xs text-[#B91C1C]">
          {error}
        </p>
      ) : null}
    </section>
  );
}
