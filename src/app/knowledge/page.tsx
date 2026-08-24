"use client";

import { useState } from "react";
import {
  BookOpen,
  Inbox,
  Rss,
  Search,
  Plus,
  Check,
  X,
  Link2,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";

// ---------- Mock 数据 ----------

interface FeedItem {
  id: number;
  title: string;
  summary: string;
  tags: string[];
  time: string;
}

const feedItems: FeedItem[] = [
  {
    id: 1,
    title: "RAG 是什么：先查库再回答",
    summary:
      "先把你的问题在知识库里检索一遍，命中了就直接用库里的内容回答，省 token 还不容易跑偏；没命中才去联网。",
    tags: ["RAG", "核心概念"],
    time: "今天 09:20",
  },
  {
    id: 2,
    title: "智能体的四件套：模型 · 工具 · 记忆 · 规划",
    summary:
      "拆开讲 Agent 的组成：模型出脑力、工具出手脚、记忆管存取、规划管分步，四件配齐才算完整智能体。",
    tags: ["Agent", "架构"],
    time: "今天 08:45",
  },
  {
    id: 3,
    title: "技术晨报 · 08-23",
    summary: "前端 + AI 圈要闻速览，AI 自动聚合生成，3 分钟读完今天值得知道的事。",
    tags: ["晨报", "前端", "AI"],
    time: "今天 07:00",
  },
  {
    id: 4,
    title: "Skill 与工具调用怎么分工",
    summary:
      "Skill 是沉淀下来的流程封装，工具调用是运行时的能力组合，前者管复用、后者管灵活，两层配合而不是互相替代。",
    tags: ["Skill", "工具调用"],
    time: "昨天 21:10",
  },
  {
    id: 5,
    title: "Vibe Coding 靠不靠谱",
    summary:
      "结论是提效但别放手——描述清楚意图、盯住生成代码，人还是最后一道关。",
    tags: ["Vibe Coding"],
    time: "昨天 18:30",
  },
  {
    id: 6,
    title: "React Server Components 实践备忘",
    summary:
      "RSC 的心智模型：组件默认跑在服务端，加 'use client' 才下放到浏览器，边界划清楚就不绕。",
    tags: ["React", "RSC"],
    time: "2 天前",
  },
];

interface InboxItem {
  id: number;
  title: string;
  source: string;
  summary: string;
}

const initialInbox: InboxItem[] = [
  {
    id: 1,
    title: "LLM 上下文窗口到底能吃多少",
    source: "某公众号 · 今日采集",
    summary: "讲 context window 与 token 预算，长上下文不等于随便塞。",
  },
  {
    id: 2,
    title: "为什么你的 RAG 检索不准",
    source: "技术博客 · 今日采集",
    summary: "切片粒度、向量模型、重排三件套，排查检索质量的清单。",
  },
  {
    id: 3,
    title: "前端工程师转型 AI 的三条路径",
    source: "公众号 · 昨天采集",
    summary: "应用层调 API、工程层做基础设施、产品层做交互创新，各要补什么。",
  },
];

interface Source {
  id: number;
  name: string;
  freq: string;
  on: boolean;
}

const initialSources: Source[] = [
  { id: 1, name: "技术晨报", freq: "每天 07:00", on: true },
  { id: 2, name: "前端周报", freq: "每周一 08:00", on: true },
  { id: 3, name: "AI 日报", freq: "每天 09:00", on: true },
  { id: 4, name: "个人博客圈", freq: "每天 12:00", on: false },
];

type Section = "feed" | "inbox" | "sources";

// ---------- 页面 ----------

export default function KnowledgePage() {
  const [section, setSection] = useState<Section>("feed");
  const [searchQuery, setSearchQuery] = useState("");
  const [inbox, setInbox] = useState<InboxItem[]>(initialInbox);
  const [sources, setSources] = useState<Source[]>(initialSources);
  const [captureInput, setCaptureInput] = useState("");

  const filteredFeed = searchQuery.trim()
    ? feedItems.filter(
        (item) =>
          item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.summary.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : feedItems;

  const handleCapture = () => {
    const text = captureInput.trim();
    if (!text) return;
    setCaptureInput("");
    setInbox((prev) => [
      {
        id: Date.now(),
        title: text.length > 30 ? `${text.slice(0, 30)}…` : text,
        source: "手动采集 · 刚刚",
        summary: "AI 摘要：Agent 接入后将自动生成这条内容的摘要与标签建议。",
      },
      ...prev,
    ]);
    setSection("inbox");
  };

  const navItems: { key: Section; label: string; icon: typeof BookOpen }[] = [
    { key: "feed", label: "知识流", icon: BookOpen },
    { key: "inbox", label: "收件箱", icon: Inbox },
    { key: "sources", label: "订阅源", icon: Rss },
  ];

  return (
    <>
      <PageHeader
        title="知识"
        description="个人知识管理中心，让知识可被 AI 理解和调用"
      >
        {/* 采集入口：红点 = 收件箱待拍板数 */}
        <button
          onClick={() => setSection("inbox")}
          className="relative flex h-9 items-center gap-1.5 rounded-[2px] bg-[#000000] px-3 text-xs font-medium text-white transition-opacity hover:opacity-85"
        >
          <Plus className="h-3.5 w-3.5" />
          采集
          {inbox.length > 0 && (
            <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500" />
          )}
        </button>
      </PageHeader>

      {/* 手机端 tab（<md）：知识流 / 收件箱 / 订阅源 */}
      <div className="border-b border-[#E5E5E5] bg-[#F5F5F5] px-4 py-2.5 md:hidden">
        <div className="flex items-center gap-1.5">
          {navItems.map((item) => (
            <button
              key={item.key}
              onClick={() => setSection(item.key)}
              className={cn(
                "flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-medium transition-all",
                section === item.key
                  ? "bg-[#000000] text-white"
                  : "bg-white text-[#8A8A8A]",
              )}
            >
              <item.icon className="h-3 w-3" />
              {item.label}
              {item.key === "inbox" && inbox.length > 0 && (
                <span
                  className={cn(
                    "rounded-full px-1.5 text-[10px] font-semibold",
                    section === item.key
                      ? "bg-white text-black"
                      : "bg-[#000000] text-white",
                  )}
                >
                  {inbox.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex">
        {/* PC 左栏（md+）：区块导航 + 统计 */}
        <aside className="hidden w-[240px] shrink-0 flex-col border-r border-[#E5E5E5] bg-[#F5F5F5] md:flex">
          <nav className="space-y-0.5 p-3">
            {navItems.map((item) => (
              <button
                key={item.key}
                onClick={() => setSection(item.key)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-[2px] px-3 py-2.5 text-sm transition-colors",
                  section === item.key
                    ? "bg-[#d5e3f6] font-medium text-black"
                    : "text-[#4A4A4A] hover:bg-[#ededed]",
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
                {item.key === "inbox" && inbox.length > 0 && (
                  <span className="ml-auto rounded-full bg-[#000000] px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    {inbox.length}
                  </span>
                )}
              </button>
            ))}
          </nav>

          {/* 底部统计 */}
          <div className="mt-auto p-3">
            <div className="rounded-[2px] bg-white px-3.5 py-3">
              <p className="text-xs font-medium text-[#A0A8B4]">知识库</p>
              <div className="mt-2 space-y-1.5 text-[13px] text-[#4A4A4A]">
                <p className="flex justify-between">
                  <span>累计条目</span>
                  <span className="font-medium text-black">128</span>
                </p>
                <p className="flex justify-between">
                  <span>本周新增</span>
                  <span className="font-medium text-black">+12</span>
                </p>
                <p className="flex justify-between">
                  <span>待拍板</span>
                  <span className="font-medium text-black">{inbox.length}</span>
                </p>
              </div>
            </div>
          </div>
        </aside>

        {/* 主内容区 */}
        <main className="min-w-0 flex-1 px-4 py-4 md:px-6">
          {/* ===== 知识流 ===== */}
          {section === "feed" && (
            <div className="mx-auto max-w-3xl space-y-4">
              {/* 搜索条 */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#999999]" />
                <input
                  type="text"
                  placeholder="搜索知识流（标题 / 摘要）"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-10 w-full rounded-[2px] border border-[#E5E5E5] bg-white pl-9 pr-3 text-sm text-[#000000] placeholder:text-[#999999] outline-none focus:border-[#000000]"
                />
              </div>

              {/* 内容卡片流 */}
              {filteredFeed.length === 0 ? (
                <div className="rounded-[2px] border border-dashed border-[#D9D9D9] bg-white p-12 text-center">
                  <p className="text-sm text-[#A0A8B4]">没有匹配的知识条目</p>
                </div>
              ) : (
                filteredFeed.map((item) => (
                  <article
                    key={item.id}
                    className="rounded-[2px] bg-white px-4 py-3.5 transition-shadow hover:shadow-[0_1px_4px_rgba(0,0,0,0.06)] md:px-5"
                  >
                    <h3 className="text-[15px] font-semibold text-black">
                      {item.title}
                    </h3>
                    <p className="mt-1 text-[13.5px] leading-relaxed text-[#8A8A8A]">
                      {item.summary}
                    </p>
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                      {item.tags.map((tag) => (
                        <span
                          key={tag}
                          className="whitespace-nowrap rounded-full bg-[#ECECEC] px-2.5 py-0.5 text-xs text-[#4A4A4A]"
                        >
                          {tag}
                        </span>
                      ))}
                      <span className="ml-auto text-xs text-[#A0A8B4]">
                        {item.time}
                      </span>
                    </div>
                  </article>
                ))
              )}
            </div>
          )}

          {/* ===== 收件箱（待拍板） ===== */}
          {section === "inbox" && (
            <div className="mx-auto max-w-3xl space-y-4">
              {/* 手动采集 */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Link2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#999999]" />
                  <input
                    type="text"
                    placeholder="粘贴链接或文本，丢给 AI 采集"
                    value={captureInput}
                    onChange={(e) => setCaptureInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleCapture()}
                    className="h-10 w-full rounded-[2px] border border-[#E5E5E5] bg-white pl-9 pr-3 text-sm text-[#000000] placeholder:text-[#999999] outline-none focus:border-[#000000]"
                  />
                </div>
                <button
                  onClick={handleCapture}
                  disabled={!captureInput.trim()}
                  className="h-10 shrink-0 rounded-[2px] bg-[#000000] px-4 text-sm font-medium text-white transition-opacity hover:opacity-85 disabled:opacity-30"
                >
                  丢进来
                </button>
              </div>

              {/* 拍板提示 */}
              <p className="flex items-center gap-1.5 px-1 text-xs text-[#A0A8B4]">
                <Sparkles className="h-3.5 w-3.5" />
                AI 已按你的口味初筛，点「保留」进知识流，「放弃」进回收站（7 天后删除）
              </p>

              {/* 待拍板卡片 */}
              {inbox.length === 0 ? (
                <div className="rounded-[2px] border border-dashed border-[#D9D9D9] bg-white p-12 text-center">
                  <p className="text-sm text-[#A0A8B4]">收件箱空空如也，去采集吧</p>
                </div>
              ) : (
                inbox.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-[2px] bg-white px-4 py-3.5 md:px-5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-[15px] font-semibold text-black">
                        {item.title}
                      </h3>
                      <span className="shrink-0 pt-0.5 text-xs text-[#A0A8B4]">
                        {item.source}
                      </span>
                    </div>
                    <p className="mt-1 text-[13.5px] leading-relaxed text-[#8A8A8A]">
                      <span className="text-[#4A4A4A]">AI 摘要：</span>
                      {item.summary}
                    </p>
                    <div className="mt-3 flex items-center justify-end gap-2">
                      <button
                        onClick={() =>
                          setInbox((prev) =>
                            prev.filter((i) => i.id !== item.id),
                          )
                        }
                        className="flex h-8 items-center gap-1.5 rounded-[2px] border border-[#D9D9D9] bg-white px-3 text-xs font-medium text-[#4A4A4A] transition-colors hover:border-[#000000] hover:text-black"
                      >
                        <X className="h-3.5 w-3.5" />
                        放弃
                      </button>
                      <button
                        onClick={() =>
                          setInbox((prev) =>
                            prev.filter((i) => i.id !== item.id),
                          )
                        }
                        className="flex h-8 items-center gap-1.5 rounded-[2px] bg-[#000000] px-3 text-xs font-medium text-white transition-opacity hover:opacity-85"
                      >
                        <Check className="h-3.5 w-3.5" />
                        保留
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ===== 订阅源 ===== */}
          {section === "sources" && (
            <div className="mx-auto max-w-3xl space-y-4">
              <p className="px-1 text-xs text-[#A0A8B4]">
                开启后，AI 按频率自动抓取并送进收件箱等你拍板
              </p>
              <div className="rounded-[2px] bg-white">
                {sources.map((source, i) => (
                  <div
                    key={source.id}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3.5 md:px-5",
                      i > 0 && "border-t border-[#F0F0F0]",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-black">
                        {source.name}
                      </p>
                      <p className="mt-0.5 text-xs text-[#A0A8B4]">
                        {source.freq}
                      </p>
                    </div>
                    {/* 开关 */}
                    <button
                      role="switch"
                      aria-checked={source.on}
                      aria-label={`切换订阅源 ${source.name}`}
                      onClick={() =>
                        setSources((prev) =>
                          prev.map((s) =>
                            s.id === source.id ? { ...s, on: !s.on } : s,
                          ),
                        )
                      }
                      className={cn(
                        "relative h-6 w-11 shrink-0 rounded-full transition-colors",
                        source.on ? "bg-[#000000]" : "bg-[#D9D9D9]",
                      )}
                    >
                      <span
                        className={cn(
                          "absolute top-1 h-4 w-4 rounded-full bg-white transition-all",
                          source.on ? "left-6" : "left-1",
                        )}
                      />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>
    </>
  );
}
