"use client";

// 自动化页 · 自动关注管理（原「RSS 订阅」，2026-08-27 通俗化命名落地）。
//
// 职责单一原则：本页只管「自动关注」（从哪抓、开关、退订、手动刷新），
// 抓回来的文章去哪看？在「知识」页的待处理里——那是内容的主场，
// 这里不重复展示文章列表，避免两处维护同一份状态。

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import type { FeedRow } from "@/lib/feeds/store";

function fmtTime(ts: number | null): string {
  if (!ts) return "从未抓取";
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function AutomationPage() {
  const [feeds, setFeeds] = useState<FeedRow[] | null>(null);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/feeds");
    const data = await res.json();
    setFeeds(data.feeds ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleAdd() {
    if (!url.trim() || adding) return;
    setAdding(true);
    setNotice(null);
    try {
      const res = await fetch("/api/feeds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), title: title.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNotice(data.error ?? "添加失败");
        return;
      }
      const ff = data.firstFetch as { added: number } | null;
      setNotice(
        ff && ff.added > 0
          ? `已添加并完成首次抓取：${ff.added} 篇新文章进入待处理`
          : "已添加。首次抓取没有拿到新文章，可稍后点「刷新」重试",
      );
      setUrl("");
      setTitle("");
      await load();
    } finally {
      setAdding(false);
    }
  }

  async function handleToggle(feed: FeedRow) {
    setBusyId(feed.id);
    try {
      await fetch(`/api/feeds/${feed.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: feed.enabled !== 1 }),
      });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function handleRefresh(feed: FeedRow) {
    setBusyId(feed.id);
    setNotice(null);
    try {
      const res = await fetch(`/api/feeds/${feed.id}/refresh`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        // 失败时服务端已把错误写进该源的 last_error，列表里能看到
        setNotice(data.error ?? "刷新失败");
      } else {
        setNotice(
          data.added > 0
            ? `「${feed.title || feed.url}」新增 ${data.added} 篇（跳过 ${data.skipped} 篇旧文）`
            : `「${feed.title || feed.url}」暂无更新`,
        );
      }
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function handleRemove(feed: FeedRow) {
    // 破坏性操作二次确认（退订不删已采集的文章，但要明确告知）
    const name = feed.title || feed.url;
    if (
      !window.confirm(
        `确定退订「${name}」吗？\n\n已抓取的文章会保留，只是以后不再自动抓取。`,
      )
    )
      return;
    setBusyId(feed.id);
    try {
      await fetch(`/api/feeds/${feed.id}`, { method: "DELETE" });
      setNotice(`已退订「${name}」`);
      await load();
    } finally {
      setBusyId(null);
    }
  }

  const btnBase =
    "rounded-md border border-border px-2.5 py-1 text-xs transition-colors disabled:opacity-40";

  return (
    <>
      <PageHeader title="自动" description="自动关注与定时任务，让机器替你跑腿" />
      <div className="space-y-6 px-6 py-4">
        {/* ── 全局提示条 ── */}
        {notice && (
          <div className="flex items-start justify-between gap-3 rounded-lg border border-border bg-white px-4 py-3 text-sm">
            <span className="text-foreground">{notice}</span>
            <button
              onClick={() => setNotice(null)}
              className="shrink-0 text-muted-foreground hover:text-foreground"
              aria-label="关闭提示"
            >
              ✕
            </button>
          </div>
        )}

        <section className="rounded-lg border border-border bg-white p-5">
          <header className="mb-4">
            <h2 className="text-sm font-semibold">自动关注</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              每小时整点自动抓取一次；抓到的新文章进入「知识」页的待处理，由你决定留不留。
            </p>
          </header>

          {/* ── 添加表单 ── */}
          <div className="flex flex-col gap-2 lg:flex-row">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void handleAdd()}
              placeholder="网站或订阅地址，如 https://example.com/rss.xml"
              className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-foreground"
            />
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void handleAdd()}
              placeholder="备注名（选填）"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-foreground lg:w-44"
            />
            <button
              onClick={() => void handleAdd()}
              disabled={adding || !url.trim()}
              className="shrink-0 rounded-md bg-foreground px-4 py-2 text-sm text-background transition-opacity hover:opacity-80 disabled:opacity-40 lg:w-auto"
            >
              {adding ? "添加中…" : "添加"}
            </button>
          </div>

          {/* ── 自动关注列表 ── */}
          <div className="mt-4">
            {feeds === null ? (
              <p className="py-8 text-center text-sm text-muted-foreground">加载中…</p>
            ) : feeds.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
                还没有自动关注的网站。粘贴一个地址试试，比如你常看的博客。
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {feeds.map((feed) => (
                  <li
                    key={feed.id}
                    className={`flex flex-wrap items-center gap-x-4 gap-y-2 py-3 ${
                      feed.enabled !== 1 ? "opacity-50" : ""
                    }`}
                  >
                    {/* 名称与地址 */}
                    <div className="min-w-0 flex-1 basis-full sm:basis-auto">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-block size-1.5 shrink-0 rounded-full ${
                            feed.last_error ? "bg-red-500" : "bg-foreground"
                          }`}
                          title={feed.last_error ? "上次抓取出错" : "正常"}
                        />
                        <span className="truncate text-sm font-medium">
                          {feed.title || feed.url}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate pl-3.5 text-xs text-muted-foreground">
                        {feed.url} · 上次抓取 {fmtTime(feed.last_fetched_at)}
                      </p>
                      {feed.last_error && (
                        <p className="mt-0.5 truncate pl-3.5 text-xs text-red-500">
                          错误：{feed.last_error}
                        </p>
                      )}
                    </div>

                    {/* 操作区 */}
                    <div className="ml-auto flex shrink-0 items-center gap-2">
                      <button
                        onClick={() => void handleRefresh(feed)}
                        disabled={busyId === feed.id}
                        className={`${btnBase} hover:bg-accent`}
                      >
                        {busyId === feed.id ? "…" : "刷新"}
                      </button>
                      <button
                        onClick={() => void handleToggle(feed)}
                        disabled={busyId === feed.id}
                        className={`${btnBase} hover:bg-accent`}
                      >
                        {feed.enabled === 1 ? "停用" : "启用"}
                      </button>
                      <button
                        onClick={() => void handleRemove(feed)}
                        disabled={busyId === feed.id}
                        className={`${btnBase} text-muted-foreground hover:bg-accent hover:text-foreground`}
                      >
                        退订
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
