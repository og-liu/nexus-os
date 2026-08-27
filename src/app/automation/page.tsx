"use client";

// 自动化页 · 自动关注管理（原「RSS 订阅」，2026-08-27 通俗化命名落地）。
//
// 职责单一原则：本页只管「自动关注」（从哪抓、开关、退订、手动刷新），
// 抓回来的文章去哪看？在「知识」页的待处理里——那是内容的主场，
// 这里不重复展示文章列表，避免两处维护同一份状态。

import { useCallback, useEffect, useRef, useState } from "react";
import { PageHeader } from "@/components/page-header";
import type { FeedRow } from "@/lib/feeds/store";

/** 自动归档规则的形状（后端 knowledge_rules 表一行） */
interface RuleRow {
  id: number;
  type: "domain" | "keyword";
  pattern: string;
  tag: string;
  enabled: number;
  created_at: number;
}

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

  // OPML 导入（阶段4 P2）：file input 的受控引用，导入完清空 value
  // 让同一个文件可以重复选（input 的 value 不清，选同名文件不触发 onChange）
  const opmlInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  // 自动归档规则（阶段4 P2）
  const [rules, setRules] = useState<RuleRow[] | null>(null);
  const [ruleType, setRuleType] = useState<"domain" | "keyword">("domain");
  const [rulePattern, setRulePattern] = useState("");
  const [ruleTag, setRuleTag] = useState("");
  const [ruleBusy, setRuleBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/feeds");
    const data = await res.json();
    setFeeds(data.feeds ?? []);
  }, []);

  const loadRules = useCallback(async () => {
    const res = await fetch("/api/knowledge/rules");
    const data = await res.json();
    setRules(data.rules ?? []);
  }, []);

  useEffect(() => {
    void load();
    void loadRules();
  }, [load, loadRules]);

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

  // ── OPML 导入导出（阶段4 P2）：订阅一键迁移 ──
  // 导出零状态：<a href> 直接指向 GET 接口，浏览器下载，不需要 JS 参与
  async function handleImportOpml(file: File) {
    if (importing) return;
    setImporting(true);
    setNotice(null);
    try {
      // 前端读文件文本传 JSON：OPML 是文本格式，走 FormData 反而多一道
      // 服务端解析；读出来传字符串最直接
      const xml = await file.text();
      const res = await fetch("/api/feeds/opml", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ xml }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNotice(data.error ?? "导入失败");
        return;
      }
      setNotice(
        `导入完成：新增 ${data.added} 个订阅，跳过 ${data.skipped} 个（已订阅过）。新订阅还没抓过文章，等整点自动抓取，或到列表里逐个点「刷新」。`,
      );
      await load();
    } finally {
      setImporting(false);
      if (opmlInputRef.current) opmlInputRef.current.value = "";
    }
  }

  // ── 自动归档规则（阶段4 P2）──
  async function handleAddRule() {
    if (!rulePattern.trim() || !ruleTag.trim() || ruleBusy) return;
    setRuleBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/knowledge/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: ruleType,
          pattern: rulePattern.trim(),
          tag: ruleTag.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNotice(data.error ?? "添加失败");
        return;
      }
      setRulePattern("");
      setRuleTag("");
      await loadRules();
    } finally {
      setRuleBusy(false);
    }
  }

  async function handleToggleRule(rule: RuleRow) {
    await fetch(`/api/knowledge/rules?id=${rule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: rule.enabled !== 1 }),
    });
    await loadRules();
  }

  async function handleRemoveRule(rule: RuleRow) {
    // 停用是软的（可再开），删除是硬的——规则体量小，删了重写不心疼，
    // 但动作语义要说清楚
    if (!window.confirm(`删除规则「${rule.pattern} → ${rule.tag}」吗？`)) return;
    await fetch(`/api/knowledge/rules?id=${rule.id}`, { method: "DELETE" });
    await loadRules();
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
          <header className="mb-4 flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold">自动关注</h2>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                每小时整点自动抓取一次；抓到的新文章进入「知识」页的待处理，由你决定留不留。
              </p>
            </div>
            {/* OPML 迁移（阶段4 P2）：从别的阅读器搬家过来 / 备份到别的阅读器。
                导出走原生链接（浏览器下载），导入读文件文本上传 */}
            <div className="flex shrink-0 items-center gap-2">
              <button
                onClick={() => opmlInputRef.current?.click()}
                disabled={importing}
                className={`${btnBase} hover:bg-accent`}
              >
                {importing ? "导入中…" : "导入 .opml"}
              </button>
              <a
                href="/api/feeds/opml"
                className={`${btnBase} hover:bg-accent`}
              >
                导出 .opml
              </a>
              <input
                ref={opmlInputRef}
                type="file"
                accept=".opml,.xml,text/xml,text/x-opml"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleImportOpml(f);
                }}
              />
            </div>
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

        {/* ── 自动归档规则（阶段4 P2）：满足条件自动打标签 ── */}
        <section className="rounded-lg border border-border bg-white p-5">
          <header className="mb-4">
            <h2 className="text-sm font-semibold">自动归档</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              新文章满足条件时自动打上指定标签。只打标签、不替你决定留弃——
              归档的事系统做，拍板的事你做。
            </p>
          </header>

          {/* 添加表单：类型 + 匹配内容 + 标签 */}
          <div className="flex flex-col gap-2 lg:flex-row">
            <select
              value={ruleType}
              onChange={(e) => setRuleType(e.target.value as "domain" | "keyword")}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-foreground lg:w-32"
            >
              <option value="domain">链接域名</option>
              <option value="keyword">标题/正文含</option>
            </select>
            <input
              value={rulePattern}
              onChange={(e) => setRulePattern(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void handleAddRule()}
              placeholder={ruleType === "domain" ? "如 github.com" : "如 RAG、智能体"}
              className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-foreground"
            />
            <input
              value={ruleTag}
              onChange={(e) => setRuleTag(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void handleAddRule()}
              placeholder="打的标签，如 开源"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-foreground lg:w-44"
            />
            <button
              onClick={() => void handleAddRule()}
              disabled={ruleBusy || !rulePattern.trim() || !ruleTag.trim()}
              className="shrink-0 rounded-md bg-foreground px-4 py-2 text-sm text-background transition-opacity hover:opacity-80 disabled:opacity-40 lg:w-auto"
            >
              {ruleBusy ? "添加中…" : "添加规则"}
            </button>
          </div>

          {/* 规则列表 */}
          <div className="mt-4">
            {rules === null ? (
              <p className="py-8 text-center text-sm text-muted-foreground">加载中…</p>
            ) : rules.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
                还没有规则。比如：github.com 来的都打「开源」标签。
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {rules.map((rule) => (
                  <li
                    key={rule.id}
                    className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5 ${
                      rule.enabled !== 1 ? "opacity-50" : ""
                    }`}
                  >
                    <span className="rounded bg-accent px-1.5 py-0.5 text-xs text-muted-foreground">
                      {rule.type === "domain" ? "域名" : "关键词"}
                    </span>
                    <span className="min-w-0 truncate text-sm">
                      {rule.pattern} <span className="text-muted-foreground">→</span>{" "}
                      <span className="rounded-full bg-[#000000] px-2 py-0.5 text-xs text-white">
                        {rule.tag}
                      </span>
                    </span>
                    <div className="ml-auto flex shrink-0 items-center gap-2">
                      <button
                        onClick={() => void handleToggleRule(rule)}
                        className={`${btnBase} hover:bg-accent`}
                      >
                        {rule.enabled === 1 ? "停用" : "启用"}
                      </button>
                      <button
                        onClick={() => void handleRemoveRule(rule)}
                        className={`${btnBase} text-muted-foreground hover:bg-accent hover:text-foreground`}
                      >
                        删除
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              规则在文章进库的那一刻生效；已有文章不会被追溯打标。
            </p>
          </div>
        </section>
      </div>
    </>
  );
}
