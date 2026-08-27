"use client";

import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  PenLine,
  Inbox,
  Trash2,
  Search,
  Plus,
  Check,
  CheckSquare,
  X,
  Link2,
  Sparkles,
  ArrowLeft,
  Pencil,
  RotateCcw,
  Database,
  ClipboardCheck,
  History,
  CheckCircle2,
  XCircle,
  RotateCw,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";

// ---------- 类型 ----------

interface FeedItem {
  id: string; // K1 起接真库，id 是 store 生成的 UUID（不再是 Date.now() 假 id）
  title: string;
  summary: string;
  content: string;
  tags: string[];
  time: string;
  source: string;
  kind: "captured" | "note"; // 出身：决定「移除」时进回收站还是退回草稿
  fresh?: boolean; // 刚刚入库
  /** 原文链接（阶段2 P0）：详情「查看原文」的入口；手写文章没有 */
  sourceUrl: string | null;
}

interface Note {
  id: string; // K3 前置起接真库，与 feed 同一张表同一个 UUID 体系
  title: string;
  content: string;
  tags: string[];
  updatedAt: string; // 渲染时由 formatRelTime 现算的相对时间文案
  inLibrary: boolean; // 方案 B：是否已加入知识流（status=kept），驱动「加入/移出」按钮
}

interface InboxItem {
  id: string; // 真数据 UUID，与后端 store 的 id 对齐
  title: string;
  source: string;
  summary: string;
  /** 阶段2 P0·失败兜底：当初没抓到正文、只按链接落库（可重试） */
  degraded: boolean;
  /** 阶段2 P0·永久快照：详情「查看原文」的入口。列表不拖正文与快照 */
  sourceUrl: string | null;
  /** 阶段4 P2·过期清理：进库时间（毫秒），驱动「超过 30 天」提示与批量处理 */
  createdAt: number;
}

interface TrashItem {
  id: string;
  title: string;
  source: string;
  summary: string;
  origin: "采集" | "文章"; // 由 kind 映射的出身标签
  daysLeft: number; // 由 deleted_at 现算：距彻底删除还剩几天
}

type Section = "feed" | "notes" | "inbox" | "trash" | "quiz" | "review";
// K3 前置起 feed 与 note 都是真库 UUID，详情引用统一 string。
// inbox 详情（阶段2 P0）：点开待处理卡片看全文 + 顺手标已读
type DetailRef =
  | { type: "feed"; id: string }
  | { type: "note"; id: string }
  | { type: "inbox"; id: string }
  | null;

// ---------- 自测 / 回顾 Mock ----------

interface FlashCard {
  id: number;
  q: string;
  a: string;
}

const flashCards: FlashCard[] = [
  {
    id: 1,
    q: "RAG 的两个核心步骤是什么？",
    a: "先检索、再生成：先在知识流里搜一遍，命中了用库里的内容回答，没命中才联网。",
  },
  {
    id: 2,
    q: "一个 Agent 由哪四块组成？",
    a: "模型 · 工具 · 记忆 · 规划，其中记忆是私有的、跟单个 Agent 走。",
  },
  {
    id: 3,
    q: "Skill 和工具调用的分工是什么？",
    a: "Skill 是沉淀下来的流程封装，管复用；工具调用是运行时的能力组合，管灵活，两层配合。",
  },
];

interface ChoiceQuestion {
  id: number;
  q: string;
  options: { key: string; text: string; correct?: boolean }[];
}

const choiceQuestions: ChoiceQuestion[] = [
  {
    id: 1,
    q: "RAG 相比「直接联网 Search」的核心优势是？",
    options: [
      { key: "A", text: "基于私有库回答，更相关且省 token", correct: true },
      { key: "B", text: "总能给出最新新闻" },
      { key: "C", text: "不需要任何检索" },
    ],
  },
  {
    id: 2,
    q: "知识流「保鲜扫描」主要解决什么？",
    options: [
      { key: "A", text: "让笔记更好看" },
      { key: "B", text: "标记过时/失效内容并提示归档", correct: true },
      { key: "C", text: "自动关注更多网站" },
    ],
  },
];

// ---------- Mock 数据 ----------

// ---------- 真数据视图模型（K1：feed 与 inbox 接库，其余 section 仍是 mock） ----------

// 后端 store 返回的条目形状（GET /api/knowledge 响应里的 items 元素）
interface KnowledgeRow {
  id: string;
  title: string;
  content: string;
  source: string | null;
  source_url: string | null;
  status: "inbox" | "kept" | "draft" | "discarded" | "trashed";
  kind: "captured" | "note";
  deleted_at: number | null;
  tags: string[];
  created_at: number;
  updated_at: number;
  /** 1 = 只按链接降级落库（可重试抓取） */
  degraded: number;
  /** 剥净的正文 HTML 快照：只有详情接口（GET /api/knowledge/[id]）返回，列表行没有 */
  snapshot_html?: string | null;
  /** AI 一页纸导读（阶段3 P1）：同样只有详情接口返回 */
  ai_summary?: string | null;
  /** 关键问题（后端存 JSON 数组字符串，渲染前用 parseAiList 解） */
  ai_questions?: string | null;
  /** 候选标签（JSON 数组字符串，详情页勾选） */
  ai_tags?: string | null;
  /** 解读生成时间：NULL = 还没生成过 */
  ai_interpreted_at?: number | null;
}

/** 毫秒时间戳 → 「刚刚 / n 分钟前 / n 小时前 / n 天前 / 具体日期」。
 *  为什么渲染时现算而不入库存文案：时间是相对的，「3 分钟前」存进库一转眼就过期；
 *  视图层的职责就是每次渲染拿当前时刻换算，永远新鲜。 */
function formatRelTime(ms: number): string {
  const diff = Date.now() - ms;
  const MIN = 60_000;
  const HOUR = 3_600_000;
  const DAY = 86_400_000;
  if (diff < MIN) return "刚刚";
  if (diff < HOUR) return `${Math.floor(diff / MIN)} 分钟前`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)} 小时前`;
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)} 天前`;
  const d = new Date(ms);
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}

/** 列表摘要：取正文第一段截前 80 字。真数据没有独立摘要字段，列表页从 content 现截；
 *  K3 之后 Agent 可以补 AI 摘要字段，届时这里优先读摘要、回落到截断 */
function makeSummary(content: string): string {
  const first = content.split("\n")[0].trim();
  return first.length > 80 ? `${first.slice(0, 80)}…` : first || "（无正文）";
}

// store 行 → 知识流卡片（kept 列表）
function toFeedItem(row: KnowledgeRow): FeedItem {
  return {
    id: row.id,
    title: row.title,
    summary: makeSummary(row.content),
    content: row.content,
    tags: row.tags,
    time: formatRelTime(row.created_at),
    source: row.source ?? "手动采集",
    kind: row.kind,
    fresh: false, // 只有拍板「留下」瞬间插入的条目才标 fresh，从库加载的不算
    sourceUrl: row.source_url ?? null,
  };
}

/** ai_questions / ai_tags 在库里是 JSON 数组字符串，渲染前解一下。
 *  解析失败按空处理：坏数据不该让详情页崩，最多这一区块不显示 */
function parseAiList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr)
      ? arr.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

// store 行 → 待处理拍板卡
function toInboxItem(row: KnowledgeRow): InboxItem {
  return {
    id: row.id,
    title: row.title,
    source: row.source ?? "手动采集",
    summary: makeSummary(row.content),
    degraded: row.degraded === 1,
    sourceUrl: row.source_url ?? null,
    // 阶段4 P2·过期清理：前端判断「超过 30 天」要用（展示、批量丢弃），
    // 毫秒时间戳原样带过来，展示层的相对时间统一用 formatRelTime 现算
    createdAt: row.created_at,
  };
}

// store 行 → 我的文章卡片。笔记与采集同表后只是 kind 不同，
// 视图模型各自转换，让渲染层继续拿到自己顺手用的形状
function toNoteItem(row: KnowledgeRow): Note {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    tags: row.tags,
    updatedAt: formatRelTime(row.updated_at),
    inLibrary: row.status === "kept",
  };
}

/** 回收站条目的剩余天数：deleted_at + 7 天减去当前时刻，向上取整。
 *  过期条目已被服务端懒清理物理删除，正常不会看到 ≤0 的情况，max(1) 兜底显示 */
const TRASH_RETENTION_MS = 7 * 24 * 3_600_000;

function daysLeftOf(deletedAt: number): number {
  const left = deletedAt + TRASH_RETENTION_MS - Date.now();
  return Math.max(1, Math.ceil(left / (24 * 3_600_000)));
}

// store 行 → 回收站卡片
function toTrashItem(row: KnowledgeRow): TrashItem {
  return {
    id: row.id,
    title: row.title || "无标题文章",
    source: row.kind === "note" ? "我的文章" : (row.source ?? "手动采集"),
    summary: makeSummary(row.content),
    origin: row.kind === "note" ? "文章" : "采集",
    daysLeft: row.deleted_at ? daysLeftOf(row.deleted_at) : 7,
  };
}

// ---------- Markdown 渲染（K2：详情页正文） ----------
// 黑白灰极简排版：标题靠字重与字号分层，代码块深灰底，引用左侧细边框。
// 用 components 显式映射而不是全局 CSS 类（如 typography 插件）——
// 样式即代码一眼可见，也不用为几个元素引一个插件。
const markdownComponents = {
  h1: (p: React.ComponentProps<"h1">) => (
    <h1 className="mb-3 mt-6 text-xl font-semibold text-black first:mt-0" {...p} />
  ),
  h2: (p: React.ComponentProps<"h2">) => (
    <h2 className="mb-2.5 mt-6 text-lg font-semibold text-black first:mt-0" {...p} />
  ),
  h3: (p: React.ComponentProps<"h3">) => (
    <h3 className="mb-2 mt-5 text-base font-semibold text-black first:mt-0" {...p} />
  ),
  p: (p: React.ComponentProps<"p">) => (
    <p className="my-3 leading-7 text-[#2A2A2A] first:mt-0 last:mb-0" {...p} />
  ),
  a: (p: React.ComponentProps<"a">) => (
    <a className="text-black underline underline-offset-2" target="_blank" rel="noreferrer" {...p} />
  ),
  ul: (p: React.ComponentProps<"ul">) => (
    <ul className="my-3 list-disc space-y-1 pl-5 text-[#2A2A2A]" {...p} />
  ),
  ol: (p: React.ComponentProps<"ol">) => (
    <ol className="my-3 list-decimal space-y-1 pl-5 text-[#2A2A2A]" {...p} />
  ),
  li: (p: React.ComponentProps<"li">) => <li className="leading-7" {...p} />,
  blockquote: (p: React.ComponentProps<"blockquote">) => (
    <blockquote className="my-3 border-l-2 border-[#D9D9D9] pl-3 text-[#8A8A8A]" {...p} />
  ),
  // 行内代码浅灰底；代码块里的 code 由 pre 包着，交给 pre 统一样式
  code: ({ className, children, ...rest }: React.ComponentProps<"code">) =>
    className ? (
      <code className={className} {...rest}>
        {children}
      </code>
    ) : (
      <code className="rounded bg-[#F0F0F0] px-1 py-0.5 text-[13px] text-[#000000]" {...rest}>
        {children}
      </code>
    ),
  pre: (p: React.ComponentProps<"pre">) => (
    <pre
      className="my-3 overflow-x-auto rounded-[2px] bg-[#1A1A1A] p-4 text-[13px] leading-6 text-[#ECECEC]"
      {...p}
    />
  ),
  hr: () => <hr className="my-5 border-[#E5E5E5]" />,
  table: (p: React.ComponentProps<"table">) => (
    <table className="my-3 w-full border-collapse text-sm" {...p} />
  ),
  th: (p: React.ComponentProps<"th">) => (
    <th className="border border-[#E5E5E5] px-2 py-1 text-left font-medium" {...p} />
  ),
  td: (p: React.ComponentProps<"td">) => (
    <td className="border border-[#E5E5E5] px-2 py-1 align-top" {...p} />
  ),
};





// ---------- 小组件 ----------

function TagPill({
  children,
  onRemove,
}: {
  children: React.ReactNode;
  onRemove?: () => void;
}) {
  return (
    <span className="group/tag inline-flex items-center gap-1 whitespace-nowrap rounded-[2px] bg-[#ECECEC] px-2.5 py-0.5 text-xs text-[#4A4A4A]">
      {children}
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="hidden rounded-full p-0.5 hover:bg-[#D9D9D9] group-hover/tag:block"
          aria-label="移除标签"
        >
          <X className="h-2.5 w-2.5" />
        </button>
      )}
    </span>
  );
}

function AddTagButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-dashed border-[#C4C4C4] text-[#A0A8B4] transition-colors hover:border-[#000000] hover:text-black"
      aria-label="添加标签"
    >
      <Plus className="h-3 w-3" />
    </button>
  );
}

// ---------- 页面 ----------

export default function KnowledgePage() {
  const [section, setSection] = useState<Section>("feed");
  const [detail, setDetail] = useState<DetailRef>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [captureInput, setCaptureInput] = useState("");

  // K1 起 feed / inbox 接真库；K3 前置起 notes / trash 也接库（与 feed 同表，kind 区分）。
  // 订阅源管理已整体迁往「自动」页（automation，现叫「自动关注」），这里不再持有 sources 状态
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [trash, setTrash] = useState<TrashItem[]>([]);
  // 全部标签及其使用计数，从 /api/knowledge/tags 拉取；计数驱动顶部筛选按频次排序
  const [allTags, setAllTags] = useState<Array<{ tag: string; count: number }>>([]);
  // 顶部筛选栏专用：只数「知识流里留下（kept）」的标签，跟列表一条不差
  const [feedTags, setFeedTags] = useState<Array<{ tag: string; count: number }>>([]);
  // 标签多选筛选：顶部标签 chips 点选/再点取消，服务端多 tag AND 交集；空数组 = 全部
  const [activeTags, setActiveTags] = useState<string[]>([]);
  // 标签太多时默认折叠，点「展开」看全量
  const [tagsExpanded, setTagsExpanded] = useState(false);

  // 顶部标签 chips 的点选/取消：在集合里则移除（取消），不在则加入（多选）
  const toggleTag = (tag: string) => {
    setActiveTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };
  // 一键清空所有选中标签，回到「全部」
  const clearTagFilter = () => setActiveTags([]);
  // 服务端检索进行中提示（搜索框防抖请求发出后到返回前）
  const [searching, setSearching] = useState(false);

  // ----- 真数据接线状态 -----
  // 首屏加载中：列表区显示骨架提示，避免闪「空空如也」误导用户
  const [loadingKnowledge, setLoadingKnowledge] = useState(true);
  // 正在提交拍板/采集的条目 id：按钮置灰防重复点击，避免同一条目 PATCH 两次
  const [savingId, setSavingId] = useState<string | null>(null);
  // 轻量提示条：采集/流转成功或失败时的反馈。不用 alert——打断感太强，
  // 一个底部浮出、几秒自动消失的小黑条足够
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);

  /** 弹一条自动消失的提示；连续弹时先清掉上一个定时器，防止新提示被旧定时器提前关掉 */
  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current != null) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2400);
  };

  // ----- 数据加载（K2：搜索与标签筛选都走服务端） -----

  /** 拉知识流（kept 列表）：关键词 q 与多标签交集 tags 传给服务端组合过滤——
   *  LIKE 检索和标签匹配在 store 层拼 WHERE 条件，前端只负责拼参数。
   *  这取代了 K1 之前「整页拉回来前端 filter」的做法：数据库是唯一真相，
   *  分页/大数据量时也不会把全表拖到浏览器。
   *  多标签 AND 交集：每个选中标签 append 一次 tag 参数，服务端全满足才命中 */
  const loadFeed = async (q: string, tags: string[] = []) => {
    const params = new URLSearchParams({ status: "kept", limit: "100" });
    if (q) params.set("q", q);
    for (const t of tags) params.append("tag", t);
    const res = await fetch(`/api/knowledge?${params.toString()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    setFeed((data.items as KnowledgeRow[]).map(toFeedItem));
  };

  /** 阶段4 P2·每日回顾：统计 + 重温候选。进 review 视图才拉，
   *  不占首屏——回顾是低频动作，数据随进随取保持新鲜（「今日」才准） */
  const loadReview = async () => {
    try {
      const res = await fetch("/api/knowledge/review");
      if (!res.ok) return;
      setReviewData(await res.json());
    } catch {
      /* 回顾拉失败保持原状（可能还是 null），视图有空态兜底 */
    }
  };

  /** 拉全部标签及计数，驱动标签选择器候选与顶部筛选 chips。
   *  按使用频次降序：常用标签靠前、长尾标签收进折叠（新打标签后也要刷新） */
  const loadAllTags = async () => {
    const res = await fetch("/api/knowledge/tags");
    if (!res.ok) return;
    const data = await res.json();
    setAllTags(
      (data.tags as Array<{ tag: string; count: number }>).sort(
        (a, b) => b.count - a.count,
      ),
    );
    setFeedTags(
      (data.feedTags as Array<{ tag: string; count: number }>).sort(
        (a, b) => b.count - a.count,
      ),
    );
  };

  /** 拉我的文章（kind=note，draft 和 kept 都拉）。方案 B 下草稿和已入库的
   *  文章都住「我的文章」；不走搜索/筛选，固定全量拉取 */
  const loadNotes = async () => {
    const res = await fetch("/api/knowledge?status=draft,kept&kind=note&limit=200");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    setNotes((data.items as KnowledgeRow[]).map(toNoteItem));
  };

  /** 拉回收站（status=trashed）。服务端在列表请求里顺手做过期清理，
   *  所以每次进回收站视图看到的数据都是刚清过账的 */
  const loadTrash = async () => {
    const res = await fetch("/api/knowledge?status=trashed&limit=200");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    setTrash((data.items as KnowledgeRow[]).map(toTrashItem));
  };

  /** 拉待处理列表（status=inbox，即「还没拍板」的条目——与读没读无关）。
   *  顺手存 counts：agedInbox（阶段4 P2·过期清理）驱动待处理顶部的堆积提示条 */
  const loadInbox = async () => {
    const params = new URLSearchParams({ status: "inbox", limit: "100" });
    const res = await fetch(`/api/knowledge?${params.toString()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    setInbox((data.items as KnowledgeRow[]).map(toInboxItem));
    if (typeof data.counts?.agedInbox === "number") {
      setAgedInbox(data.counts.agedInbox as number);
    }
  };

  // 首屏并行拉五路数据：待处理、知识流、标签、我的文章、回收站。
  // 用 allSettled 而不是 all：一个接口挂了其他照常显示，不至于整页报废
  useEffect(() => {
    let alive = true; // 组件卸载后不再 setState
    (async () => {
      const results = await Promise.allSettled([
        loadInbox(),
        loadFeed(""),
        loadAllTags(),
        loadNotes(),
        loadTrash(),
      ]);
      if (!alive) return;
      if (results.some((r) => r.status === "rejected")) {
        showToast("部分数据加载失败，请刷新重试");
      }
      setLoadingKnowledge(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  // 详情全量行（阶段2 P0·永久快照）：列表行刻意不拖 snapshot_html 大字段，
  // 打开详情时才单拉一次全行。加载失败回落列表数据渲染，只是没有快照排版。
  // note 详情没有快照概念（正文就是自己写的），不浪费这次请求
  const [detailFull, setDetailFull] = useState<KnowledgeRow | null>(null);
  useEffect(() => {
    setDetailFull(null);
    if (!detail || detail.type === "note") return;
    let alive = true;
    fetch(`/api/knowledge/${detail.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((row) => {
        if (!alive) return;
        setDetailFull(row as KnowledgeRow | null);
        // 阶段3 P1：采集条目还没解读时，5 秒后静默重拉一次——自动解读
        // 正在后台跑（LLM 几秒出结果），等它一下，详情页不用手动刷新
        // 也能看到导读自己长出来。只补拉这一次，不轮询
        const r = row as KnowledgeRow | null;
        if (r && detail.type === "inbox" && !r.ai_interpreted_at && !r.degraded) {
          setTimeout(() => {
            if (!alive) return;
            fetch(`/api/knowledge/${detail.id}`)
              .then((r2) => (r2.ok ? r2.json() : null))
              .then((row2) => {
                if (alive) setDetailFull(row2 as KnowledgeRow | null);
              })
              .catch(() => {
                /* 补拉失败就维持现状，用户还有手动按钮 */
              });
          }, 5000);
        }
      })
      .catch(() => {
        /* 详情回退到列表数据渲染，快照排版缺位但不阻塞阅读 */
      });
    return () => {
      alive = false;
    };
  }, [detail]);

  // 离开待处理分区时收摊：批量圈选/键盘焦点都是「待处理内」的临时状态，
  // 切走再回来不该看到上次的残局
  useEffect(() => {
    if (section !== "inbox") {
      if (inboxSelectMode) exitInboxSelect();
      setFocusIdx(-1);
    }
  }, [section]);

  // 搜索 + 标签筛选联动：任一变化后停手 350ms 才发一次请求——连续按键只打
  // 最后一枪，避免每个字符一趟往返。首帧跳过：初值就是空搜索，主加载已拉过
  const skipNextSearch = useRef(true);
  useEffect(() => {
    if (skipNextSearch.current) {
      skipNextSearch.current = false;
      return;
    }
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        await loadFeed(searchQuery.trim(), activeTags);
      } catch {
        showToast("检索失败，请重试");
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => window.clearTimeout(timer);
    // activeTags 在依赖里：切标签与改搜索词走同一套防抖，
    // 一处节流逻辑管全部触发源，不另开一条即时通道
  }, [searchQuery, activeTags]);

  // 文章编辑（id 是真库 UUID；「draft-」前缀表示尚未落库的新建草稿）
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState({ title: "", content: "" });

  // 标签选择器
  const [tagPicker, setTagPicker] = useState<DetailRef>(null);
  const [pickerManage, setPickerManage] = useState(false);
  const [newTagInput, setNewTagInput] = useState("");

  // 二次确认
  const [confirmState, setConfirmState] = useState<{
    title: string;
    desc: string;
    okText: string;
    onOk: () => void;
  } | null>(null);

  // ----- 「我的文章」批量操作 + md 导入（阶段 1 范围：入库 / 删除 / 导入） -----
  const [selectMode, setSelectMode] = useState(false); // 批量选择模式开关
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set()); // 选中的文章 id
  const [batchBusy, setBatchBusy] = useState(false); // 批量请求进行中：按钮置灰防连击
  const [importing, setImporting] = useState(false); // md 文件导入进行中
  const importInputRef = useRef<HTMLInputElement | null>(null); // 隐藏的 file input，按钮点它触发选择

  // ----- 待处理：批量拍板 + 快捷键（阶段2 P0） -----
  // （只读/未读机制已整体移除，待处理 = 纯「没操作过」的 inbox 条目）
  const [inboxSelectMode, setInboxSelectMode] = useState(false); // 待处理批量选择模式
  const [inboxSelected, setInboxSelected] = useState<Set<string>>(new Set());
  const [inboxBatchBusy, setInboxBatchBusy] = useState(false);
  // Shift 连选锚点：上次点选的卡片下标，Shift 点击时从锚点到当前全选中
  const lastInboxClick = useRef<number>(-1);
  // 快捷键焦点：j/k 移动的高亮卡片下标，-1 = 没有焦点（还没开始键盘操作）
  const [focusIdx, setFocusIdx] = useState(-1);

  // ── 阶段4 P2·每日回顾：真实数据替换原型期的硬编码占位 ──
  interface RevisitCard {
    id: string;
    title: string;
    summary: string;
    tags: string[];
    created_at: number;
  }
  const [reviewData, setReviewData] = useState<{
    todayCaptured: number;
    todayKept: number;
    revisit: RevisitCard[];
    poolSize: number;
  } | null>(null);

  // ── 阶段4 P2·过期清理提示：待处理里超过 30 天没拍板的条数 ──
  const [agedInbox, setAgedInbox] = useState(0);

  // ── 阶段4 P2·批量去重：重复报告视图 ──
  interface DupGroup {
    reason: "url" | "simhash";
    items: Array<{ id: string; title: string; status: string; created_at: number }>;
  }
  const [dupGroups, setDupGroups] = useState<DupGroup[] | null>(null);
  const [dedupBusy, setDedupBusy] = useState(false);

  // ── 阶段4 P2·摘录：详情页选中文字存「读书划线」──
  const [selectedText, setSelectedText] = useState("");
  const [excerpts, setExcerpts] = useState<
    Array<{ id: string; text: string; note: string | null; created_at: number }>
  >([]);
  const [excerptBusy, setExcerptBusy] = useState(false);
  // 重试抓取进行中的条目（按钮转圈防连击）
  const [refetchingId, setRefetchingId] = useState<string | null>(null);
  // 解读生成进行中的条目（同款防连击）
  const [interpretingId, setInterpretingId] = useState<string | null>(null);

  // 自测
  const [quizMode, setQuizMode] = useState<"flash" | "choice">("flash");
  const [flipped, setFlipped] = useState<Record<number, boolean>>({});
  const [answered, setAnswered] = useState<Record<number, string>>({});

  const toggleFlip = (id: number) =>
    setFlipped((prev) => ({ ...prev, [id]: !prev[id] }));

  const pickOption = (qid: number, key: string) => {
    setAnswered((prev) => (prev[qid] ? prev : { ...prev, [qid]: key }));
  };

  // ── 阶段4 P2·批量去重 ──
  // 拉 / 查重报告；null = 未打开查重视图，[] = 打开了但没有重复
  const openDuplicates = async () => {
    if (dupGroups !== null) return; // 已打开
    setDupGroups([]); // 先置空挡住重复点击，请求回来再填真数据
    try {
      const res = await fetch("/api/knowledge/duplicates");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setDupGroups(data.groups ?? []);
    } catch {
      setDupGroups(null);
      showToast("查重失败，请重试");
    }
  };

  const closeDuplicates = () => {
    setDupGroups(null);
    // 去重动过库（discarded 的条目离开 kept），回列表前按当前过滤条件重拉
    void loadFeed(searchQuery.trim(), activeTags).catch(() => {});
  };

  /** 一组重复里「保留最新、丢弃其余」：最新的信息最全（重抓/改过标签），
   *  旧的进「不要了」（discarded 而非物理删——批量操作误判空间大，留反悔路） */
  const dedupeGroup = async (group: DupGroup) => {
    if (dedupBusy) return;
    setDedupBusy(true);
    try {
      const newest = [...group.items].sort((a, b) => b.created_at - a.created_at)[0];
      const discardIds = group.items.filter((i) => i.id !== newest.id).map((i) => i.id);
      const res = await fetch("/api/knowledge/duplicates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discardIds }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.missing > 0) {
        showToast(`已处理 ${data.ok} 条，${data.missing} 条已不在库里`);
      } else {
        showToast(`已保留最新 1 条，丢弃其余 ${data.ok} 条`);
      }
      // 重新拉报告：处理过的组消失，剩余组继续展示
      const r2 = await fetch("/api/knowledge/duplicates");
      if (r2.ok) {
        const d2 = await r2.json();
        setDupGroups(d2.groups ?? []);
      }
    } catch {
      showToast("去重失败，请重试");
    } finally {
      setDedupBusy(false);
    }
  };

  // ── 阶段4 P2·摘录（读书划线）──
  // 详情打开时拉这条的摘录；关详情清掉。摘录和 detailFull 分开请求：
  // detailFull 有 5 秒补拉逻辑（等 AI 解读），摘录是静态数据不用跟着重拉
  useEffect(() => {
    setExcerpts([]);
    setSelectedText("");
    if (!detail) return;
    let alive = true;
    fetch(`/api/knowledge/${detail.id}/excerpts`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (alive && data) setExcerpts(data.excerpts ?? []);
      })
      .catch(() => {
        /* 摘录加载失败不阻塞阅读 */
      });
    return () => {
      alive = false;
    };
  }, [detail]);

  // 正文区松开鼠标时读选区：有选中文字就亮出「存为摘录」入口。
  // selectionchange 太吵（拖动过程中每个像素都触发），mouseup 一次读值足够
  const handleBodyMouseUp = () => {
    // 等 0ms 让浏览器先结算选区再读（同一事件循环里读有时拿到上一次的）
    window.setTimeout(() => {
      const text = window.getSelection()?.toString() ?? "";
      setSelectedText(text.trim());
    }, 0);
  };

  const saveExcerpt = async () => {
    if (!detail || !selectedText || excerptBusy) return;
    setExcerptBusy(true);
    try {
      const res = await fetch(`/api/knowledge/${detail.id}/excerpts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: selectedText }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data.duplicate) {
        // 后端返回新摘录行，直接追加本地列表（不再整页重拉）
        setExcerpts((prev) => [...prev, data.excerpt]);
        showToast("已存为摘录");
      } else {
        showToast("这段已经摘过了");
      }
      setSelectedText("");
      window.getSelection()?.removeAllRanges();
    } catch {
      showToast("存摘录失败，请重试");
    } finally {
      setExcerptBusy(false);
    }
  };

  const deleteExcerpt = async (excerptId: string) => {
    if (!detail) return;
    setExcerpts((prev) => prev.filter((e) => e.id !== excerptId)); // 乐观删，失败再说
    try {
      const res = await fetch(
        `/api/knowledge/${detail.id}/excerpts?excerptId=${excerptId}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch {
      // 删失败把数据拉回来对账
      const r2 = await fetch(`/api/knowledge/${detail.id}/excerpts`);
      if (r2.ok) {
        const d2 = await r2.json();
        setExcerpts(d2.excerpts ?? []);
      }
      showToast("删除失败，请重试");
    }
  };

  // ── 阶段4 P2·过期清理（提示版）：一键处理堆积的老条目 ──
  // 丢弃不删除：先进「不要了」，反悔期内随时反悔——批量操作的保守默认
  const discardAgedInbox = async () => {
    const aged = inbox.filter(
      (i) => Date.now() - i.createdAt > 30 * 24 * 60 * 60 * 1000,
    );
    if (aged.length === 0 || inboxBatchBusy) return;
    if (
      !window.confirm(
        `${aged.length} 条超过 30 天没拍板的老条目，全部移到「不要了」吗？\n\n之后可以反悔：在回收站外的「不要了」里还能找回。`,
      )
    )
      return;
    setInboxBatchBusy(true);
    try {
      const results = await Promise.allSettled(
        aged.map((i) =>
          fetch(`/api/knowledge/${i.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "discarded" }),
          }),
        ),
      );
      const ok = results.filter((r) => r.status === "fulfilled").length;
      const fail = results.length - ok;
      await loadInbox().catch(() => {});
      showToast(
        fail === 0 ? `已清走 ${ok} 条老条目` : `成功 ${ok} 条，失败 ${fail} 条`,
      );
    } finally {
      setInboxBatchBusy(false);
    }
  };

  // 进回顾视图才拉数据：回顾的「今日」统计依赖当下时刻，进视图时取数才准
  useEffect(() => {
    if (section === "review") void loadReview();
  }, [section]);

  const goList = () => {
    setDetail(null);
    setEditingNoteId(null);
  };

  // ----- 待处理拍板 -----

  // 拍板「留下」：PATCH status=kept，接口确认后才动本地列表——
  // 流转失败时待处理保持原样，用户不会误以为拍板成功。
  // 成功后把后端返回的完整行转成卡片插到知识流顶部，带「刚刚入库」标记，
  // 让「存进去」这件事肉眼可见
  const keepItem = async (item: InboxItem) => {
    if (savingId) return; // 已有拍板在途，忽略新点击（防连击重复提交）
    setSavingId(item.id);
    try {
      const res = await fetch(`/api/knowledge/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "kept" }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const row = (await res.json()) as KnowledgeRow;
      setInbox((prev) => prev.filter((i) => i.id !== item.id));
      setFeed((prev) => [{ ...toFeedItem(row), fresh: true }, ...prev]);
      showToast("已留下，进知识流");
      // 详情里拍的板：办完事回列表，别停在一条已不存在的详情上
      if (detail?.type === "inbox" && detail.id === item.id) goList();
    } catch {
      showToast("操作失败，请重试");
    } finally {
      setSavingId(null);
    }
  };

  // 拍板「不要了」：PATCH status=discarded。
  // 注意语义区分：discarded 是「从未留下过」，不再出现在任何列表、也不进回收站；
  // trashed 才是回收站的「先进站再删」。想反悔的用户走「留下」，而不是删
  const dropItem = async (item: InboxItem) => {
    if (savingId) return;
    setSavingId(item.id);
    try {
      const res = await fetch(`/api/knowledge/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "discarded" }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setInbox((prev) => prev.filter((i) => i.id !== item.id));
      showToast("已不要了");
      // 详情里拍的板：办完事回列表
      if (detail?.type === "inbox" && detail.id === item.id) goList();
    } catch {
      showToast("操作失败，请重试");
    } finally {
      setSavingId(null);
    }
  };

  // ----- 待处理：详情 / 已读 / 重试 / 批量 / 快捷键（阶段2 P0） -----

  // 打开待处理详情：只看全文帮拍板，不掺「已读」状态——读没读与拍不拍板无关
  const openInboxDetail = (item: InboxItem) => {
    setDetail({ type: "inbox", id: item.id });
  };

  // 重试抓取：degraded 条目（当初只存了链接）重新抓正文。
  // 成功就地把卡片换成交互后的新行（标题不再是占位、degraded 清零）
  const refetchInboxItem = async (item: InboxItem) => {
    if (refetchingId) return;
    setRefetchingId(item.id);
    try {
      const res = await fetch(`/api/knowledge/${item.id}/refetch`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      const row = data.item as KnowledgeRow;
      setInbox((prev) => prev.map((i) => (i.id === item.id ? toInboxItem(row) : i)));
      // 在详情里点的重试：顺手把详情数据也换成新行，正文立刻从链接占位变全文
      if (detail?.type === "inbox" && detail.id === item.id) {
        setDetailFull(row);
      }
      showToast("正文抓回来了");
    } catch (e) {
      showToast(e instanceof Error ? `还是没抓到：${e.message}` : "重试失败");
    } finally {
      setRefetchingId(null);
    }
  };

  // AI 解读：没赶上自动触发（RSS 条目 / 自动失败 / 关了开关）在这里手动补，
  // 对旧解读不满意也可以重跑。响应就是更新后的全行，直接换掉详情数据
  const interpretInboxItem = async (item: InboxItem) => {
    if (interpretingId) return;
    setInterpretingId(item.id);
    try {
      const res = await fetch(`/api/knowledge/${item.id}/interpret`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }
      const row = (await res.json()) as KnowledgeRow;
      setDetailFull(row);
      showToast("AI 看完了");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "解读生成失败");
    } finally {
      setInterpretingId(null);
    }
  };

  // 勾选 AI 候选标签：与手动打标签同一套 PATCH 全量替换语义。乐观更新
  // detailFull（待处理列表不显示标签，状态留在详情里最直观），失败回滚。
  // 标签挂上后拍板「留下」，它自然跟着进知识流
  const toggleAiTag = (tag: string) => {
    if (!detailFull) return;
    const current = detailFull.tags ?? [];
    const next = current.includes(tag)
      ? current.filter((t) => t !== tag)
      : [...current, tag];
    setDetailFull({ ...detailFull, tags: next });
    fetch(`/api/knowledge/${detailFull.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tags: next }),
    }).catch(() => {
      setDetailFull((prev) => (prev ? { ...prev, tags: current } : prev));
      showToast("标签保存失败，已还原");
    });
  };

  // 待处理勾选（带 Shift 连选）：按住 Shift 点第 N 张卡，从上次点的到这次的全选中。
  // 邮件客户端的肌肉记忆，几十条积压一口气圈走
  const toggleInboxSelect = (idx: number, shiftKey: boolean) => {
    setInboxSelected((prev) => {
      const next = new Set(prev);
      const id = inbox[idx].id;
      if (shiftKey && lastInboxClick.current >= 0) {
        const from = Math.min(lastInboxClick.current, idx);
        const to = Math.max(lastInboxClick.current, idx);
        for (let i = from; i <= to; i++) next.add(inbox[i].id);
      } else if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    lastInboxClick.current = idx;
  };

  const exitInboxSelect = () => {
    setInboxSelectMode(false);
    setInboxSelected(new Set());
    lastInboxClick.current = -1;
  };

  const setInboxSelectAll = () => {
    // 已全选 → 反选清空；否则全选（当前过滤视图里的全部，不含被「只看未读」滤掉的）
    const allIds = inbox.map((i) => i.id);
    setInboxSelected((prev) =>
      prev.size === allIds.length ? new Set() : new Set(allIds),
    );
  };

  // 批量拍板：allSettled 逐条 PATCH，按成败数量如实汇报——
  // 中途失败不清空选择，让用户知道还有几条没办成、可以再按一次
  const batchDecide = async (decision: "kept" | "discarded") => {
    if (inboxSelected.size === 0 || inboxBatchBusy) return;
    setInboxBatchBusy(true);
    const verb = decision === "kept" ? "留下" : "不要了";
    try {
      const results = await Promise.allSettled(
        [...inboxSelected].map(async (id) => {
          const res = await fetch(`/api/knowledge/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: decision }),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return (await res.json()) as KnowledgeRow;
        }),
      );
      const ok = results.filter((r) => r.status === "fulfilled");
      const failed = results.length - ok.length;
      const doneIds = new Set(ok.map((r) => (r as PromiseFulfilledResult<KnowledgeRow>).value.id));
      // 留下的条目插进知识流顶部（同单条拍板的体验）；不要了的只从待处理移除
      setInbox((prev) => prev.filter((i) => !doneIds.has(i.id)));
      if (decision === "kept") {
        setFeed((prev) => [
          ...ok.map(
            (r) => ({ ...toFeedItem((r as PromiseFulfilledResult<KnowledgeRow>).value), fresh: true }),
          ),
          ...prev,
        ]);
      }
      showToast(
        failed > 0
          ? `${verb} ${ok.length} 条，失败 ${failed} 条，可再按一次`
          : `已批量${verb} ${ok.length} 条`,
      );
      if (failed === 0) exitInboxSelect();
    } finally {
      setInboxBatchBusy(false);
    }
  };

  // 键盘快捷键（仅桌面物理键盘有意义，但 keydown 本身就来自物理键盘，无需再判断宽度）：
  // j/k 上下移动焦点，← 留下 / → 不要了（与原型 v2「左滑留、右滑弃」的手势方向一致，
  // 移动端和桌面端共用同一套空间心智）。
  // 输入框聚焦 / 详情打开 / 批量选择模式时停用——打字不该触发拍板
  useEffect(() => {
    if (section !== "inbox" || detail || inboxSelectMode) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) {
        return;
      }
      if (e.key === "j" || e.key === "k") {
        e.preventDefault();
        setFocusIdx((prev) => {
          if (inbox.length === 0) return -1;
          if (prev === -1) return e.key === "j" ? 0 : inbox.length - 1;
          return e.key === "j"
            ? Math.min(prev + 1, inbox.length - 1)
            : Math.max(prev - 1, 0);
        });
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        // ← / → 是浏览器默认滚动键，被征用当拍板键要先 preventDefault
        e.preventDefault();
        const item = focusIdx >= 0 ? inbox[focusIdx] : null;
        if (!item) return;
        if (e.key === "ArrowLeft") keepItem(item);
        else dropItem(item);
        // 拍完一张，焦点自动落到下一张（列表短了，原下标正好补位），
        // 连续 j 已经多余——按住方向键就能一路清下去
        setFocusIdx((prev) =>
          prev >= inbox.length - 1 ? Math.max(prev - 1, 0) : prev,
        );
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // keepItem/dropItem 是组件内闭包，依赖里带上它们防止拿到旧 state
  }, [section, detail, inboxSelectMode, inbox, focusIdx, keepItem, dropItem]);

  // 手动采集：POST 落库进待处理。必须先等接口返回真实 id 再插入本地列表——
  // 不能乐观插入（本地造假 id），否则后续拍板的 PATCH 会拿着假 id 打空炮。
  // 贴链接走服务端智能分流（抓正文 / 认出订阅地址 / 抓不到降级存链接），
  // 贴文本照旧直接落库；两种输入共用一个入口，用户不用关心区别
  const handleCapture = async () => {
    const text = captureInput.trim();
    if (!text || savingId === "capturing") return;
    setSavingId("capturing"); // "capturing" 是采集动作的占位标记（此刻还没有真实条目 id）
    try {
      // www. 开头的裸域名补全协议再交给后端识别——少打「https://」也是体验
      const urlLike = /^(https?:\/\/\S+)$/i.test(text)
        ? text
        : /^(www\.\S+)$/i.test(text)
          ? `https://${text}`
          : null;
      const res = await fetch("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(urlLike ? { url: urlLike } : { content: text }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      // 订阅地址：后端不落库，引导去「自动」页添加关注（那里才有定时抓取）
      if (data.rss) {
        setCaptureInput("");
        showToast("这是订阅地址，去「自动」页添加关注后会自动抓取更新");
        return;
      }
      // 重复拦截（阶段2 P0）：库里已有同一链接 / 同一篇内容，不再存第二份。
      // 后端 message 已带「在哪」的上下文，直接透传给 toast
      if (data.duplicate) {
        setCaptureInput("");
        showToast(data.message ?? "这篇已经在库里了，不再重复保存");
        return;
      }
      // URL 分流返回 { item }（可能带 degraded），文本路径直接返回行本身
      const row = (data.item ?? data) as KnowledgeRow;
      setCaptureInput("");
      setInbox((prev) => [toInboxItem(row), ...prev]);
      // 降级（抓不到正文）时如实相告：这条只有链接，想要正文得自己点开看
      showToast(
        data.degraded
          ? `没抓到正文（${data.degraded}），已先按链接收进来`
          : urlLike
            ? "正文已抓回，丢进待处理等你拍板"
            : "已丢进待处理，等你拍板",
      );
    } catch {
      showToast("采集失败，请重试");
    } finally {
      setSavingId(null);
    }
  };

  // 从知识流移除（≠删除）：按出身分流——采集来的移进回收站留 7 天反悔期；
  // 自己写的退回草稿，文章本体永远在「我的文章」。两条路都可逆，不做二次确认
  const removeFromFeed = async (item: FeedItem) => {
    if (savingId) return;
    setSavingId(item.id);
    try {
      if (item.kind === "note") {
        const res = await fetch(`/api/knowledge/${item.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "draft" }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setFeed((prev) => prev.filter((f) => f.id !== item.id));
        await loadNotes(); // 草稿状态变了，重拉「我的文章」的 inLibrary 标记
        showToast("已移出知识流，文章还在「我的文章」里");
      } else {
        const res = await fetch(`/api/knowledge/${item.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "trash" }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const row = (await res.json()) as KnowledgeRow;
        setFeed((prev) => prev.filter((f) => f.id !== item.id));
        setTrash((prev) => [toTrashItem(row), ...prev]);
        showToast("已移进回收站，7 天内可捞回");
      }
    } catch {
      showToast("操作失败，请重试");
    } finally {
      setSavingId(null);
    }
  };

  // ----- 回收站 -----

  // 捞回：PATCH action=restore，条目回 kept。成功后按出身刷新对应列表——
  // 恢复的可能是采集文章也可能是笔记，两路都重拉最省心（数据量小，代价可忽略）
  const restoreTrash = async (item: TrashItem) => {
    try {
      const res = await fetch(`/api/knowledge/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restore" }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setTrash((prev) => prev.filter((t) => t.id !== item.id));
      await Promise.allSettled([
        loadFeed(searchQuery.trim(), activeTags),
        loadNotes(),
      ]);
      showToast("已捞回");
    } catch {
      showToast("捞回失败，请重试");
    }
  };

  const askDeleteTrash = (item: TrashItem) => {
    setConfirmState({
      title: "彻底删除？",
      desc: "删除后不可恢复。",
      okText: "彻底删除",
      onOk: () => {
        // ?purge=true 走硬删除：标签随外键级联清理，物理消失
        fetch(`/api/knowledge/${item.id}?purge=true`, { method: "DELETE" })
          .then(async (res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            setTrash((prev) => prev.filter((t) => t.id !== item.id));
          })
          .catch(() => showToast("删除失败，请重试"));
      },
    });
  };

  // ----- 我的文章 -----
  // 笔记与采集同表（kind=note），创建/编辑/删除全部落库。
  // 新建走「草稿」模式：点「写文章」先造一条本地临时卡片（id 前缀 draft-），
  // 点保存才 POST 落库换真 id——直接落库会让取消编辑留下空记录垃圾

  const createNote = () => {
    const draftId = `draft-${Date.now()}`;
    setNotes((prev) => [
      { id: draftId, title: "", content: "", tags: [], updatedAt: "刚刚", inLibrary: false },
      ...prev,
    ]);
    setNoteDraft({ title: "", content: "" });
    setEditingNoteId(draftId);
    setDetail({ type: "note", id: draftId });
  };

  const startEditNote = (note: Note) => {
    setNoteDraft({ title: note.title, content: note.content });
    setEditingNoteId(note.id);
  };

  const saveNote = async (id: string) => {
    const isDraft = id.startsWith("draft-");
    const title = noteDraft.title.trim() || "无标题文章";
    try {
      if (isDraft) {
        // 草稿首次保存：POST 创建拿真 UUID，替换掉本地临时卡片
        const res = await fetch("/api/knowledge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: "note",
            title,
            content: noteDraft.content,
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const row = (await res.json()) as KnowledgeRow;
        setNotes((prev) =>
          prev.map((n) => (n.id === id ? toNoteItem(row) : n)),
        );
        // 详情页还停在草稿引用上，切到真 id 才能继续阅读/打标签
        setDetail({ type: "note", id: row.id });
        await loadAllTags();
      } else {
        const res = await fetch(`/api/knowledge/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, content: noteDraft.content }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setNotes((prev) =>
          prev.map((n) =>
            n.id === id ? { ...n, title, content: noteDraft.content, updatedAt: "刚刚" } : n,
          ),
        );
      }
      setEditingNoteId(null);
      showToast("已保存");
    } catch {
      showToast("保存失败，请重试");
    }
  };

  // 取消编辑：纯草稿（无标题无正文）直接从列表移除，别留一张空白卡片；
  // 有内容的草稿保留在列表里，但提示未落库、刷新会丢
  const cancelEditNote = () => {
    if (editingNoteId?.startsWith("draft-")) {
      const empty = !noteDraft.title.trim() && !noteDraft.content.trim();
      if (empty) {
        setNotes((prev) => prev.filter((n) => n.id !== editingNoteId));
        goList();
        return;
      }
      showToast("尚未保存，刷新页面后草稿会丢失");
    }
    setEditingNoteId(null);
  };

  const askDeleteNote = (note: Note) => {
    if (note.id.startsWith("draft-")) {
      // 纯本地草稿没有库记录，「删除」就是把它从列表上拿掉
      setConfirmState({
        title: "丢弃这篇草稿？",
        desc: "草稿尚未保存，丢弃后不可恢复。",
        okText: "丢弃",
        onOk: () => {
          setNotes((prev) => prev.filter((n) => n.id !== note.id));
          goList();
        },
      });
      return;
    }
    setConfirmState({
      title: "删除这篇文章？",
      desc: "文章会进回收站，7 天内可以捞回，之后彻底删除。",
      okText: "删除",
      onOk: () => {
        // PATCH action=trash：软删进回收站，deleted_at 由后端记录
        fetch(`/api/knowledge/${note.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "trash" }),
        })
          .then(async (res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const row = (await res.json()) as KnowledgeRow;
            setNotes((prev) => prev.filter((n) => n.id !== note.id));
            setTrash((prev) => [toTrashItem(row), ...prev]);
            goList();
          })
          .catch(() => showToast("删除失败，请重试"));
      },
    });
  };

  // ----- 文章入/出知识流（方案 B 的核心开关） -----

  // 加入知识流：PATCH status=kept，后端会同步生成语义指纹——从这一刻起
  // AI 检索才能命中这篇文章。notes 乐观更新标记；feed 必须重拉——它只在
  // 首屏加载一次，不重拉的话切到知识流看到的还是旧列表（修过的坑）
  const addNoteToLibrary = async (note: Note) => {
    if (savingId) return;
    setSavingId(note.id);
    try {
      const res = await fetch(`/api/knowledge/${note.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "kept" }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setNotes((prev) =>
        prev.map((n) => (n.id === note.id ? { ...n, inLibrary: true } : n)),
      );
      // 带当前搜索词/标签/筛选器重拉，保持用户正在看的视图口径一致
      await loadFeed(searchQuery.trim(), activeTags);
      showToast("已加入知识流，AI 也能检索到它了");
    } catch {
      showToast("操作失败，请重试");
    } finally {
      setSavingId(null);
    }
  };

  // 移出知识流：PATCH status=draft。文章本体不动，只是退出 AI 检索范围
  const removeNoteFromLibrary = async (note: Note) => {
    if (savingId) return;
    setSavingId(note.id);
    try {
      const res = await fetch(`/api/knowledge/${note.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "draft" }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setNotes((prev) =>
        prev.map((n) => (n.id === note.id ? { ...n, inLibrary: false } : n)),
      );
      // 移出后条目应立刻从知识流消失，重拉保持一致（与加入对称）
      await loadFeed(searchQuery.trim(), activeTags);
      showToast("已移出知识流，文章还在「我的文章」里");
    } catch {
      showToast("操作失败，请重试");
    } finally {
      setSavingId(null);
    }
  };

  // ----- 批量操作 -----

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  // 全选只圈已落库的文章；本地草稿（draft- 前缀）没有库记录，圈了也发不出请求
  const setSelectAll = () => {
    const real = notes.filter((n) => !n.id.startsWith("draft-"));
    setSelectedIds((prev) =>
      prev.size === real.length ? new Set() : new Set(real.map((n) => n.id)),
    );
  };

  // 批量加入知识流：allSettled 逐条 PATCH——部分失败不影响其余，
  // 结束按成败数量如实汇报
  const batchAddToLibrary = async () => {
    if (selectedIds.size === 0 || batchBusy) return;
    setBatchBusy(true);
    const results = await Promise.allSettled(
      [...selectedIds].map(async (id) => {
        const res = await fetch(`/api/knowledge/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "kept" }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      }),
    );
    setBatchBusy(false);
    const ok = results.filter((r) => r.status === "fulfilled").length;
    const fail = results.length - ok;
    // 两路都重拉：文章列表刷新 inLibrary 标记，知识流列表接住新加入的条目
    await Promise.allSettled([
      loadNotes(),
      loadFeed(searchQuery.trim(), activeTags),
    ]);
    exitSelectMode();
    showToast(
      fail === 0
        ? `已加入知识流 ${ok} 篇，AI 也能检索到它们了`
        : `成功 ${ok} 篇、失败 ${fail} 篇，失败的可以再试一次`,
    );
  };

  const askBatchDelete = () => {
    if (selectedIds.size === 0 || batchBusy) return;
    setConfirmState({
      title: `删除选中的 ${selectedIds.size} 篇文章？`,
      desc: "文章会进回收站，7 天内可以捞回，之后彻底删除。",
      okText: "删除",
      onOk: async () => {
        setBatchBusy(true);
        const results = await Promise.allSettled(
          [...selectedIds].map(async (id) => {
            const res = await fetch(`/api/knowledge/${id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "trash" }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const row = (await res.json()) as KnowledgeRow;
            setTrash((prev) => [toTrashItem(row), ...prev]);
          }),
        );
        setBatchBusy(false);
        const ok = results.filter((r) => r.status === "fulfilled").length;
        const fail = results.length - ok;
        await loadNotes();
        exitSelectMode();
        showToast(fail === 0 ? `已删除 ${ok} 篇` : `成功 ${ok} 篇、失败 ${fail} 篇`);
      },
    });
  };

  // ----- md 批量导入 -----

  /** 从 md 文本头部解析 frontmatter 的 title / tags。
   *  兼容 Obsidian / Typora 常见的两种 tags 写法（行内式 / 列表式），
   *  没写 frontmatter 或对应字段时按空值处理，由调用方兜底 */
  function parseFrontmatter(text: string): { title?: string; tags: string[] } {
    const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
    if (!m) return { tags: [] };
    const fm = m[1];
    const titleLine = fm.match(/^title:\s*(.+)$/m);
    const title = titleLine?.[1].trim().replace(/^["']|["']$/g, "");
    const tags: string[] = [];
    const inline = fm.match(/^tags:\s*\[(.*)\]$/m);
    if (inline) {
      for (const t of inline[1].split(",")) {
        const v = t.trim().replace(/^["']|["']$/g, "");
        if (v) tags.push(v);
      }
    } else {
      const list = fm.match(/^tags:\s*\n((?:[ \t]*-[ \t]*.+\n?)+)/m);
      if (list) {
        for (const line of list[1].split("\n")) {
          const v = line.replace(/^[ \t]*-[ \t]*/, "").trim().replace(/^["']|["']$/g, "");
          if (v) tags.push(v);
        }
      }
    }
    return { title, tags };
  }

  // 批量导入 md 文件：读文本 → 解析 frontmatter → POST /api/knowledge/import。
  // 重名文章由后端拦截跳过，这里只负责如实回报 created / skipped
  const handleImportFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setImporting(true);
    try {
      const payload: Array<{ name: string; title: string; content: string; tags: string[] }> = [];
      for (const file of Array.from(files)) {
        const text = await file.text();
        const { title, tags } = parseFrontmatter(text);
        payload.push({
          name: file.name,
          // frontmatter 没写标题就退回文件名（去掉扩展名）
          title: title || file.name.replace(/\.(md|markdown)$/i, ""),
          content: text,
          tags,
        });
      }
      const res = await fetch("/api/knowledge/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files: payload }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { created: number; skipped: string[] };
      await loadNotes();
      showToast(
        data.skipped.length > 0
          ? `导入 ${data.created} 篇，${data.skipped.length} 篇重名被跳过`
          : `导入成功 ${data.created} 篇，点「加入知识流」让 AI 检索到它们`,
      );
    } catch {
      showToast("导入失败，请重试");
    } finally {
      setImporting(false);
    }
  };

  // ----- 标签闭环 -----

  const getTagsOf = (ref: DetailRef): string[] => {
    if (!ref) return [];
    return ref.type === "feed"
      ? (feed.find((f) => f.id === ref.id)?.tags ?? [])
      : (notes.find((n) => n.id === ref.id)?.tags ?? []);
  };

  const setTagsOf = (ref: DetailRef, tags: string[]) => {
    if (!ref) return;
    // K3 前置起 feed 与 note 都是真库行，标签编辑统一走「乐观更新本地 +
    // PATCH 确认 + 失败回滚快照」。两个分支只差操作的 state 列表
    const isFeed = ref.type === "feed";
    const prevTags = isFeed
      ? (feed.find((f) => f.id === ref.id)?.tags ?? [])
      : (notes.find((n) => n.id === ref.id)?.tags ?? []);
    const applyLocal = (next: string[]) => {
      if (isFeed) {
        setFeed((prev) =>
          prev.map((f) => (f.id === ref.id ? { ...f, tags: next } : f)),
        );
      } else {
        setNotes((prev) =>
          prev.map((n) => (n.id === ref.id ? { ...n, tags: next } : n)),
        );
      }
    };
    applyLocal(tags);
    fetch(`/api/knowledge/${ref.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tags }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await loadAllTags(); // 新打的标签可能刚诞生，刷新全局候选列表
      })
      .catch(() => {
        applyLocal(prevTags); // 失败回滚到改前快照，不让假状态留在屏幕上
        showToast("标签保存失败，已还原");
      });
  };

  const toggleTagOnTarget = (tag: string) => {
    if (!tagPicker) return;
    const current = getTagsOf(tagPicker);
    setTagsOf(
      tagPicker,
      current.includes(tag)
        ? current.filter((t) => t !== tag)
        : [...current, tag],
    );
  };

  const createTagAndSelect = () => {
    const name = newTagInput.trim();
    if (!name || !tagPicker) return;
    if (!allTags.some((t) => t.tag === name)) setAllTags((prev) => [...prev, { tag: name, count: 0 }]);
    const current = getTagsOf(tagPicker);
    if (!current.includes(name)) setTagsOf(tagPicker, [...current, name]);
    setNewTagInput("");
  };

  const renameTag = (oldName: string, newName: string) => {
    const name = newName.trim();
    if (!name || name === oldName) return;
    setAllTags((prev) => prev.map((t) => (t.tag === oldName ? { ...t, tag: name } : t)));
    setFeedTags((prev) => prev.map((t) => (t.tag === oldName ? { ...t, tag: name } : t)));
    setFeed((prev) =>
      prev.map((f) => ({
        ...f,
        tags: f.tags.map((t) => (t === oldName ? name : t)),
      })),
    );
    setNotes((prev) =>
      prev.map((n) => ({
        ...n,
        tags: n.tags.map((t) => (t === oldName ? name : t)),
      })),
    );
    // 正在按这个标签筛选时同步更新筛选条件，否则横幅显示旧名
    if (activeTags.includes(oldName)) setActiveTags((prev) => prev.map((t) => (t === oldName ? name : t)));
    // 全局重命名落库：新名已存在时后端自动合并（store 的两步走策略）
    fetch("/api/knowledge/tags", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: oldName, to: name }),
    }).catch(() => showToast("重命名保存失败，请刷新页面核对"));
  };

  const askRemoveTagGlobal = (tag: string) => {
    setConfirmState({
      title: `删除标签「${tag}」？`,
      desc: "会从所有条目上移除这个标签。",
      okText: "删除标签",
      onOk: () => {
        setAllTags((prev) => prev.filter((t) => t.tag !== tag));
        setFeedTags((prev) => prev.filter((t) => t.tag !== tag));
        setFeed((prev) =>
          prev.map((f) => ({ ...f, tags: f.tags.filter((t) => t !== tag) })),
        );
        setNotes((prev) =>
          prev.map((n) => ({ ...n, tags: n.tags.filter((t) => t !== tag) })),
        );
        // 删掉的正是当前筛选标签时，退掉这个筛选（不然列表还挂在已消失的条件上）
        setActiveTags((prev) => prev.filter((t) => t !== tag));
        fetch(
          `/api/knowledge/tags?tag=${encodeURIComponent(tag)}`,
          { method: "DELETE" },
        ).catch(() => showToast("删除保存失败，请刷新页面核对"));
      },
    });
  };

  // ----- 导航 -----

  const navGroups: {
    label?: string;
    items: {
      key: Section;
      label: string;
      icon: typeof BookOpen;
      desc: string;
      count?: number;
    }[];
  }[] = [
    {
      items: [
        { key: "feed", label: "知识流", icon: BookOpen, desc: `${feed.length} 条已沉淀` },
        { key: "notes", label: "我的文章", icon: PenLine, desc: `${notes.length} 篇内容` },
        { key: "inbox", label: "待处理", icon: Inbox, desc: "新到的等你拍板", count: inbox.length },
        { key: "trash", label: "回收站", icon: Trash2, desc: "7 天内可捞回", count: trash.length },
      ],
    },
    {
      label: "学习 & 回顾",
      items: [
        { key: "quiz", label: "自测", icon: ClipboardCheck, desc: "闪卡 / 选择题" },
        { key: "review", label: "回顾", icon: History, desc: "今日与本周沉淀" },
      ],
    },
  ];

  const navItems = navGroups.flatMap((g) => g.items);

  const currentFeed = detail?.type === "feed" ? feed.find((f) => f.id === detail.id) : null;
  const currentNote =
    detail?.type === "note" ? notes.find((n) => n.id === detail.id) : null;
  const currentInbox =
    detail?.type === "inbox" ? inbox.find((i) => i.id === detail.id) : null;
  const isEditing = currentNote && editingNoteId === currentNote.id;

  // K2 起搜索走服务端（loadFeed 的 q 参数），不再需要前端 filter 一层——
  // feed 本身就是「当前检索条件下」的结果集

  // ----- 详情视图 -----

  const detailBack = () => goList();

  const renderDetail = () => {
    // 待处理详情（阶段2 P0）：点开看全文帮拍板，打开即标已读（openInboxDetail 已处理）。
    // 底部拍板按钮与卡片上同一套 keepItem/dropItem——详情只是「放大看」的载体
    if (currentInbox) {
      return (
        <div className="">
          <button
            onClick={detailBack}
            className="mb-4 flex items-center gap-1.5 text-xs text-[#8A8A8A] transition-colors hover:text-black"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            返回待处理
          </button>
          {/* 摘录（阶段4 P2）：鼠标在正文里松开时读选区，有选中文字就亮出
              「存为摘录」。监听挂在整个 article 而不只是正文 div——快照、
              Markdown 区域都要能划线 */}
          <article
            className="rounded-[2px] bg-white px-5 py-6 md:px-8 md:py-8"
            onMouseUp={handleBodyMouseUp}
          >
            <h1 className="text-xl font-semibold leading-snug text-black md:text-2xl">
              {currentInbox.title}
            </h1>
            <p className="mt-2 text-xs text-[#A0A8B4]">
              {currentInbox.source}
            </p>
            {/* 降级条目提示 + 重试入口：只在「没抓到正文」的条目上出现 */}
            {currentInbox.degraded && (
              <div className="mt-4 flex flex-wrap items-center gap-3 rounded-[2px] bg-[#FCF1E4] px-3 py-2.5 text-xs text-[#8A5A1B]">
                <span>这条当初只存了链接，没抓到正文</span>
                <button
                  onClick={() => refetchInboxItem(currentInbox)}
                  disabled={refetchingId != null}
                  className="flex h-7 items-center gap-1.5 rounded-[2px] border border-[#E8923A] bg-white px-2.5 font-medium text-[#8A5A1B] transition-opacity hover:opacity-80 disabled:opacity-40"
                >
                  <RotateCw className="h-3.5 w-3.5" />
                  {refetchingId === currentInbox.id ? "抓取中…" : "重新抓取正文"}
                </button>
              </div>
            )}
            {/* AI 一页纸导读（阶段3 P1）：先看 AI 怎么说，再决定要不要细读。
                降级条目不显示——没正文可解读，等重试成功后自动补 */}
            {!currentInbox.degraded && (
              <div className="mt-4 rounded-[2px] border border-[#E8E8E8] bg-[#FAFAFA] px-4 py-3.5">
                {detailFull?.ai_summary ? (
                  <>
                    <div className="flex items-center gap-1.5 text-xs font-medium text-[#4A4A4A]">
                      <Sparkles className="h-3.5 w-3.5" />
                      AI 帮你先看了一眼
                    </div>
                    <p className="mt-2 text-[13px] leading-relaxed text-[#4A4A4A]">
                      {detailFull.ai_summary}
                    </p>
                    {parseAiList(detailFull.ai_questions).length > 0 && (
                      <div className="mt-3">
                        <p className="text-xs text-[#8A8A8A]">读完这条，你能回答：</p>
                        <ul className="mt-1.5 space-y-1">
                          {parseAiList(detailFull.ai_questions).map((q) => (
                            <li
                              key={q}
                              className="flex items-start gap-1.5 text-[13px] leading-relaxed text-[#4A4A4A]"
                            >
                              <span className="mt-0.5 text-[#A0A8B4]">·</span>
                              {q}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {parseAiList(detailFull.ai_tags).length > 0 && (
                      <div className="mt-3 flex flex-wrap items-center gap-1.5">
                        <span className="text-xs text-[#8A8A8A]">建议标签：</span>
                        {parseAiList(detailFull.ai_tags).map((tag) => {
                          const on = (detailFull.tags ?? []).includes(tag);
                          return (
                            <button
                              key={tag}
                              onClick={() => toggleAiTag(tag)}
                              className={`h-6 rounded-[2px] border px-2 text-xs transition-colors ${
                                on
                                  ? "border-black bg-black text-white"
                                  : "border-[#D9D9D9] bg-white text-[#4A4A4A] hover:border-black"
                              }`}
                            >
                              {tag}
                            </button>
                          );
                        })}
                        <span className="text-[11px] text-[#A0A8B4]">点一下就贴上</span>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-xs text-[#8A8A8A]">
                      还没有 AI 导读
                    </span>
                    <button
                      onClick={() => interpretInboxItem(currentInbox)}
                      disabled={interpretingId != null}
                      className="flex h-7 items-center gap-1.5 rounded-[2px] bg-black px-2.5 text-xs font-medium text-white transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      {interpretingId === currentInbox.id ? "AI 正在看…" : "AI 先帮我看看"}
                    </button>
                  </div>
                )}
              </div>
            )}
            {/* 快照优先渲染（同知识流详情），降级条目自然回落 Markdown 显示链接 */}
            <div className="mt-5">
              {detailFull?.snapshot_html ? (
                <>
                  <div
                    className="snapshot-body"
                    dangerouslySetInnerHTML={{ __html: detailFull.snapshot_html }}
                  />
                  {currentInbox.sourceUrl && (
                    <p className="mt-6 border-t border-[#F0F0F0] pt-3 text-xs text-[#A0A8B4]">
                      已存本地快照
                      <a
                        href={currentInbox.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-1 text-[#2F6BFF] hover:underline"
                      >
                        查看原文
                      </a>
                    </p>
                  )}
                </>
              ) : (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={markdownComponents}
                >
                  {detailFull?.content ?? ""}
                </ReactMarkdown>
              )}
            </div>
            {/* 摘录（阶段4 P2·读书划线）：在正文里选中一段文字，这里就会
                亮出「存为摘录」；已存的摘录列在下方，先摘的在前 */}
            {selectedText && (
              <div className="mt-4 flex items-start gap-3 rounded-[2px] border border-[#E5E5E5] bg-[#FAFAFA] px-4 py-3">
                <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-[#4A4A4A]">
                  <span className="mr-1 text-xs text-[#A0A8B4]">选中：</span>
                  {selectedText.slice(0, 80)}
                  {selectedText.length > 80 && "…"}
                </p>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    onClick={() => setSelectedText("")}
                    className="text-xs text-[#8A8A8A] transition-colors hover:text-black"
                  >
                    取消
                  </button>
                  <button
                    onClick={() => void saveExcerpt()}
                    disabled={excerptBusy}
                    className="rounded-[2px] bg-[#000000] px-2.5 py-1 text-xs text-white transition-opacity hover:opacity-80 disabled:opacity-40"
                  >
                    {excerptBusy ? "存中…" : "存为摘录"}
                  </button>
                </div>
              </div>
            )}
            {excerpts.length > 0 && (
              <div className="mt-4 border-t border-[#F0F0F0] pt-4">
                <h3 className="text-xs font-medium text-[#8A8A8A]">
                  摘录（{excerpts.length}）
                </h3>
                <ul className="mt-2 space-y-2">
                  {excerpts.map((e) => (
                    <li
                      key={e.id}
                      className="group relative border-l-2 border-[#000000] bg-[#F7F7F7] px-4 py-3"
                    >
                      <p className="text-[13.5px] leading-relaxed text-[#2A2A2A]">
                        {e.text}
                      </p>
                      <p className="mt-1.5 text-xs text-[#A0A8B4]">
                        {formatRelTime(e.created_at)}
                      </p>
                      <button
                        onClick={() => void deleteExcerpt(e.id)}
                        className="absolute right-2 top-2 text-xs text-[#C4C4C4] opacity-0 transition-all hover:text-[#8A8A8A] group-hover:opacity-100"
                        aria-label="删除这条摘录"
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {/* 拍板按钮：看完做决定，这是待处理详情存在的全部意义 */}
            <div className="mt-6 flex items-center justify-end gap-2 border-t border-[#F0F0F0] pt-4">
              <button
                onClick={() => dropItem(currentInbox)}
                disabled={savingId != null}
                className="flex h-9 items-center gap-1.5 rounded-[2px] border border-[#D9D9D9] bg-white px-4 text-xs font-medium text-[#4A4A4A] transition-colors hover:border-[#000000] hover:text-black disabled:cursor-not-allowed disabled:opacity-40"
              >
                <X className="h-3.5 w-3.5" />
                不要了
              </button>
              <button
                onClick={() => keepItem(currentInbox)}
                disabled={savingId != null}
                className="flex h-9 items-center gap-1.5 rounded-[2px] bg-[#000000] px-4 text-xs font-medium text-white transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Check className="h-3.5 w-3.5" />
                留下
              </button>
            </div>
          </article>
        </div>
      );
    }

    if (currentFeed) {
      return (
        <div className="">
          <button
            onClick={detailBack}
            className="mb-4 flex items-center gap-1.5 text-xs text-[#8A8A8A] transition-colors hover:text-black"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            返回知识流
          </button>
          {/* 摘录（阶段4 P2）：同待处理详情，划线监听挂整个 article */}
          <article
            className="rounded-[2px] bg-white px-5 py-6 md:px-8 md:py-8"
            onMouseUp={handleBodyMouseUp}
          >
            <h1 className="text-xl font-semibold leading-snug text-black md:text-2xl">
              {currentFeed.title}
            </h1>
            <p className="mt-2 text-xs text-[#A0A8B4]">
              {currentFeed.source} · {currentFeed.time}
            </p>
            {/* 标签行：闭环入口 */}
            <div className="mt-4 flex flex-wrap items-center gap-1.5 border-b border-[#F0F0F0] pb-4">
              {currentFeed.tags.map((tag) => (
                <TagPill
                  key={tag}
                  onRemove={() =>
                    setTagsOf(detail, currentFeed.tags.filter((t) => t !== tag))
                  }
                >
                  {tag}
                </TagPill>
              ))}
              <AddTagButton onClick={() => setTagPicker(detail)} />
            </div>
            {/* 阶段2 P0·永久快照：抓取成功时存的正文 HTML 在此渲染（结构/链接/图片都在），
                快照加载失败或手写文章回落 Markdown。原始 HTML 已在抓取时剥净
                （script/事件属性/javascript: 全清），渲染侧只信这份产出 */}
            <div className="mt-5">
              {detailFull?.snapshot_html ? (
                <>
                  <div
                    className="snapshot-body"
                    dangerouslySetInnerHTML={{ __html: detailFull.snapshot_html }}
                  />
                  <p className="mt-6 border-t border-[#F0F0F0] pt-3 text-xs text-[#A0A8B4]">
                    已存本地快照，原文可能已更新
                    {currentFeed.sourceUrl && (
                      <>
                        {" · "}
                        <a
                          href={currentFeed.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#2F6BFF] hover:underline"
                        >
                          查看原文
                        </a>
                      </>
                    )}
                  </p>
                </>
              ) : (
                <>
                  {/* K2 Markdown 渲染：存储始终是纯文本单一事实源，只在展示层解析 */}
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={markdownComponents}
                  >
                    {currentFeed.content}
                  </ReactMarkdown>
                  {currentFeed.sourceUrl && (
                    <p className="mt-6 border-t border-[#F0F0F0] pt-3 text-xs text-[#A0A8B4]">
                      <a
                        href={currentFeed.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#2F6BFF] hover:underline"
                      >
                        查看原文
                      </a>
                    </p>
                  )}
                </>
              )}
            </div>
            {/* 摘录（阶段4 P2·读书划线）：与待处理详情同一套交互——选中
                正文文字存摘录，已存的列在下方 */}
            {selectedText && (
              <div className="mt-4 flex items-start gap-3 rounded-[2px] border border-[#E5E5E5] bg-[#FAFAFA] px-4 py-3">
                <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-[#4A4A4A]">
                  <span className="mr-1 text-xs text-[#A0A8B4]">选中：</span>
                  {selectedText.slice(0, 80)}
                  {selectedText.length > 80 && "…"}
                </p>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    onClick={() => setSelectedText("")}
                    className="text-xs text-[#8A8A8A] transition-colors hover:text-black"
                  >
                    取消
                  </button>
                  <button
                    onClick={() => void saveExcerpt()}
                    disabled={excerptBusy}
                    className="rounded-[2px] bg-[#000000] px-2.5 py-1 text-xs text-white transition-opacity hover:opacity-80 disabled:opacity-40"
                  >
                    {excerptBusy ? "存中…" : "存为摘录"}
                  </button>
                </div>
              </div>
            )}
            {excerpts.length > 0 && (
              <div className="mt-4 border-t border-[#F0F0F0] pt-4">
                <h3 className="text-xs font-medium text-[#8A8A8A]">
                  摘录（{excerpts.length}）
                </h3>
                <ul className="mt-2 space-y-2">
                  {excerpts.map((e) => (
                    <li
                      key={e.id}
                      className="group relative border-l-2 border-[#000000] bg-[#F7F7F7] px-4 py-3"
                    >
                      <p className="text-[13.5px] leading-relaxed text-[#2A2A2A]">
                        {e.text}
                      </p>
                      <p className="mt-1.5 text-xs text-[#A0A8B4]">
                        {formatRelTime(e.created_at)}
                      </p>
                      <button
                        onClick={() => void deleteExcerpt(e.id)}
                        className="absolute right-2 top-2 text-xs text-[#C4C4C4] opacity-0 transition-all hover:text-[#8A8A8A] group-hover:opacity-100"
                        aria-label="删除这条摘录"
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </article>
        </div>
      );
    }

    if (currentNote) {
      return (
        <div className="">
          <button
            onClick={detailBack}
            className="mb-4 flex items-center gap-1.5 text-xs text-[#8A8A8A] transition-colors hover:text-black"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            返回我的文章
          </button>

          {isEditing ? (
            /* 编辑模式 */
            <div className="rounded-[2px] bg-white px-5 py-6 md:px-8">
              <input
                type="text"
                placeholder="文章标题"
                value={noteDraft.title}
                onChange={(e) =>
                  setNoteDraft((d) => ({ ...d, title: e.target.value }))
                }
                className="w-full border-none bg-transparent text-xl font-semibold text-black outline-none placeholder:text-[#C4C4C4] md:text-2xl"
              />
              <div className="mt-4 flex flex-wrap items-center gap-1.5 border-b border-[#F0F0F0] pb-4">
                {currentNote.tags.map((tag) => (
                  <TagPill
                    key={tag}
                    onRemove={() =>
                      setTagsOf(detail, currentNote.tags.filter((t) => t !== tag))
                    }
                  >
                    {tag}
                  </TagPill>
                ))}
                <AddTagButton onClick={() => setTagPicker(detail)} />
              </div>
              <textarea
                placeholder="开始写作…"
                value={noteDraft.content}
                onChange={(e) =>
                  setNoteDraft((d) => ({ ...d, content: e.target.value }))
                }
                className="mt-4 min-h-80 w-full resize-none border-none bg-transparent text-[15px] leading-7 text-[#2A2A2A] outline-none placeholder:text-[#C4C4C4]"
              />
              <div className="mt-4 flex items-center justify-end gap-2 border-t border-[#F0F0F0] pt-4">
                <button
                  onClick={cancelEditNote}
                  className="h-9 rounded-[2px] border border-[#D9D9D9] bg-white px-4 text-xs font-medium text-[#4A4A4A] transition-colors hover:border-[#000000] hover:text-black"
                >
                  取消
                </button>
                <button
                  onClick={() => saveNote(currentNote.id)}
                  className="h-9 rounded-[2px] bg-[#000000] px-4 text-xs font-medium text-white transition-opacity hover:opacity-85"
                >
                  保存
                </button>
              </div>
            </div>
          ) : (
            /* 阅读模式 */
            <div className="rounded-[2px] bg-white px-5 py-6 md:px-8 md:py-8">
              <h1 className="text-xl font-semibold leading-snug text-black md:text-2xl">
                {currentNote.title}
              </h1>
              <p className="mt-2 text-xs text-[#A0A8B4]">
                最后编辑 {currentNote.updatedAt}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-1.5 border-b border-[#F0F0F0] pb-4">
                {currentNote.tags.map((tag) => (
                  <TagPill
                    key={tag}
                    onRemove={() =>
                      setTagsOf(detail, currentNote.tags.filter((t) => t !== tag))
                    }
                  >
                    {tag}
                  </TagPill>
                ))}
                <AddTagButton onClick={() => setTagPicker(detail)} />
              </div>
              {/* 笔记正文同样接 Markdown 渲染：存储是纯文本单一事实源，
                  展示层与知识流共用同一套 components 映射 */}
              <div className="mt-5">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={markdownComponents}
                >
                  {currentNote.content}
                </ReactMarkdown>
              </div>
              {/* 底部操作：方案 B 的「加入知识流」主入口放这——写完顺手一点，
                  文章就从「只有我能看」变成「AI 能检索」 */}
              <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-[#F0F0F0] pt-4">
                {!currentNote.id.startsWith("draft-") &&
                  (currentNote.inLibrary ? (
                    <button
                      onClick={() => removeNoteFromLibrary(currentNote)}
                      className="flex h-9 items-center gap-1.5 rounded-[2px] border border-[#D9D9D9] bg-white px-4 text-xs font-medium text-[#4A4A4A] transition-colors hover:border-[#000000] hover:text-black"
                    >
                      <Database className="h-3.5 w-3.5" />
                      移出知识流
                    </button>
                  ) : (
                    <button
                      onClick={() => addNoteToLibrary(currentNote)}
                      className="flex h-9 items-center gap-1.5 rounded-[2px] bg-[#000000] px-4 text-xs font-medium text-white transition-opacity hover:opacity-85"
                    >
                      <Database className="h-3.5 w-3.5" />
                      加入知识流
                    </button>
                  ))}
                <button
                  onClick={() => startEditNote(currentNote)}
                  className="flex h-9 items-center gap-1.5 rounded-[2px] border border-[#D9D9D9] bg-white px-4 text-xs font-medium text-[#4A4A4A] transition-colors hover:border-[#000000] hover:text-black"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  编辑
                </button>
                <button
                  onClick={() => askDeleteNote(currentNote)}
                  className="flex h-9 items-center gap-1.5 rounded-[2px] border border-[#D9D9D9] bg-white px-4 text-xs font-medium text-[#4A4A4A] transition-colors hover:border-[#000000] hover:text-black"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  删除
                </button>
                {currentNote.inLibrary && (
                  <span className="ml-auto text-xs text-[#A0A8B4]">
                    已在知识流，AI 可检索
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      );
    }

    return null;
  };

  // ----- 列表视图 -----

  const renderList = () => {
    switch (section) {
      case "feed":
        return (
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#999999]" />
              <input
                type="text"
                placeholder="搜索知识流（标题 / 正文 / 标签）"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-10 w-full rounded-[2px] border border-[#E5E5E5] bg-white pl-9 pr-3 text-sm text-[#000000] placeholder:text-[#999999] outline-none focus:border-[#000000]"
              />
            </div>
            {/* 标签筛选（减法改造）：顶部平铺所有标签，多选 AND 交集、再点取消、
                空选 = 全部。频次降序排放；超过 12 个默认折叠，点「展开」看全量。
                全设备 wrap 换行，手机端不横滑，过滤切换与搜索共用同一套防抖重拉 */}
            <div className="flex flex-wrap items-center gap-1.5">
              {feedTags
                .slice(0, tagsExpanded ? feedTags.length : 12)
                .map(({ tag, count }) => {
                  const active = activeTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      onClick={() => toggleTag(tag)}
                      className={cn(
                        "rounded-[2px] px-2.5 py-1 text-xs transition-colors",
                        active
                          ? "bg-[#000000] text-white"
                          : "bg-white text-[#4A4A4A] hover:bg-[#F5F5F5]",
                      )}
                    >
                      {tag}
                      <span
                        className={cn(
                          "ml-1",
                          active ? "text-white/60" : "text-[#A0A8B4]",
                        )}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              {feedTags.length > 12 && (
                <button
                  onClick={() => setTagsExpanded((v) => !v)}
                  className="rounded-[2px] px-2 py-1 text-xs text-[#8A8A8A] transition-colors hover:text-black"
                >
                  {tagsExpanded ? "收起" : `展开 +${feedTags.length - 12}`}
                </button>
              )}
              {activeTags.length > 0 && (
                <button
                  onClick={clearTagFilter}
                  className="ml-auto flex items-center gap-1 rounded-[2px] px-2 py-1 text-xs text-[#8A8A8A] transition-colors hover:text-black"
                >
                  <X className="h-3 w-3" />
                  清除筛选
                </button>
              )}
              <button
                onClick={() =>
                  dupGroups === null ? void openDuplicates() : closeDuplicates()
                }
                className={cn(
                  "rounded-[2px] bg-white px-3 py-1 text-xs text-[#4A4A4A] transition-colors hover:bg-[#F5F5F5]",
                  activeTags.length === 0 && "ml-auto",
                )}
              >
                {dupGroups === null ? "查重" : "退出查重"}
              </button>
            </div>

            {/* 查重报告（阶段4 P2·批量去重）：打开后替代常规列表展示。
                每组给出「保留最新」的一键处理；去重 = 旧条目进「不要了」，
                可反悔 */}
            {dupGroups !== null ? (
              <div className="space-y-3">
                {dupGroups.length === 0 ? (
                  <div className="rounded-[2px] border border-dashed border-[#D9D9D9] bg-white p-12 text-center">
                    <p className="text-sm text-[#A0A8B4]">
                      没有发现重复内容，库里很干净
                    </p>
                  </div>
                ) : (
                  dupGroups.map((g, gi) => (
                    <div
                      key={gi}
                      className="rounded-[2px] bg-white px-4 py-3.5"
                    >
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-[#ECECEC] px-2 py-0.5 text-xs text-[#4A4A4A]">
                          {g.reason === "url" ? "同一链接存了多次" : "内容几乎一样"}
                        </span>
                        <span className="text-xs text-[#A0A8B4]">
                          {g.items.length} 条重复
                        </span>
                        <button
                          onClick={() => void dedupeGroup(g)}
                          disabled={dedupBusy}
                          className="ml-auto rounded-[2px] bg-[#000000] px-2.5 py-1 text-xs text-white transition-opacity hover:opacity-80 disabled:opacity-40"
                        >
                          {dedupBusy ? "处理中…" : "保留最新，丢弃其余"}
                        </button>
                      </div>
                      <ul className="mt-2 divide-y divide-[#F0F0F0]">
                        {[...g.items]
                          .sort((a, b) => b.created_at - a.created_at)
                          .map((it, idx) => (
                            <li
                              key={it.id}
                              className="flex items-center gap-2 py-2 text-[13.5px]"
                            >
                              <span className="shrink-0 text-xs text-[#A0A8B4]">
                                {idx === 0 ? "将保留" : "将丢弃"}
                              </span>
                              <span className="min-w-0 flex-1 truncate text-[#2A2A2A]">
                                {it.title || "(无标题)"}
                              </span>
                              <span className="shrink-0 text-xs text-[#A0A8B4]">
                                {formatRelTime(it.created_at)}
                              </span>
                            </li>
                          ))}
                      </ul>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <>
            {/* 服务端检索进行中的轻提示 */}
            {searching && (
              <p className="px-1 text-xs text-[#A0A8B4]">检索中…</p>
            )}
            {loadingKnowledge ? (
              <div className="rounded-[2px] border border-dashed border-[#D9D9D9] bg-white p-12 text-center">
                <p className="text-sm text-[#A0A8B4]">知识流加载中…</p>
              </div>
            ) : feed.length === 0 ? (
              <div className="rounded-[2px] border border-dashed border-[#D9D9D9] bg-white p-12 text-center">
                <p className="text-sm text-[#A0A8B4]">没有匹配的知识条目</p>
              </div>
            ) : (
              feed.map((item) => (
                <article
                  key={item.id}
                  onClick={() => setDetail({ type: "feed", id: item.id })}
                  className="cursor-pointer rounded-[2px] bg-white px-4 py-3.5 transition-shadow hover:shadow-[0_1px_4px_rgba(0,0,0,0.06)] md:px-5"
                >
                  <h3 className="flex items-center gap-2 text-[15px] font-semibold text-black">
                    <span className="min-w-0 truncate">{item.title}</span>
                    {item.fresh && (
                      <span className="shrink-0 rounded-full bg-[#000000] px-1.5 py-0.5 text-[10px] font-medium text-white">
                        刚刚入库
                      </span>
                    )}
                  </h3>
                  <p className="mt-1 text-[13.5px] leading-relaxed text-[#8A8A8A]">
                    {item.summary}
                  </p>
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    {/* 标签即样式标识（减法改造）：筛选统一收口到顶部，
                        卡片上的 pill 不再可点，只用于视觉上区分内容归属 */}
                    {item.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-[2px] bg-[#ECECEC] px-2.5 py-0.5 text-xs text-[#4A4A4A]"
                      >
                        {tag}
                      </span>
                    ))}
                    <AddTagButton onClick={() => setTagPicker({ type: "feed", id: item.id })} />
                    <span className="ml-auto text-xs text-[#A0A8B4]">
                      {item.source} · {item.time}
                    </span>
                    {/* 移除 ≠ 删除：采集的进回收站（7 天可捞），自己写的退回
                        「我的文章」草稿；不用进详情就能做 */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFromFeed(item);
                      }}
                      className="text-xs text-[#A0A8B4] underline-offset-2 transition-colors hover:text-black hover:underline"
                    >
                      移除
                    </button>
                  </div>
                </article>
              ))
            )}
              </>
            )}
          </div>
        );

      case "notes":
        return (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 px-1">
              <p className="text-xs text-[#A0A8B4]">
                自己写的文章都在这；点「加入知识流」，AI 才能检索到它
              </p>
              <div className="flex items-center gap-2">
                {notes.length > 0 && (
                  <button
                    onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
                    className="flex h-9 items-center gap-1.5 rounded-[2px] border border-[#D9D9D9] bg-white px-3 text-xs font-medium text-[#4A4A4A] transition-colors hover:border-[#000000] hover:text-black"
                  >
                    <ClipboardCheck className="h-3.5 w-3.5" />
                    {selectMode ? "退出批量" : "批量操作"}
                  </button>
                )}
                {/* md 导入：把别处的旧文章搬进来。frontmatter 里的 title / tags
                    会被读出来，没写的按文件名兜底 */}
                <input
                  ref={importInputRef}
                  type="file"
                  multiple
                  accept=".md,.markdown"
                  className="hidden"
                  onChange={(e) => {
                    void handleImportFiles(e.target.files);
                    e.target.value = ""; // 清掉选择，同一批文件能再次触发 change
                  }}
                />
                <button
                  onClick={() => importInputRef.current?.click()}
                  disabled={importing}
                  className="flex h-9 items-center gap-1.5 rounded-[2px] border border-[#D9D9D9] bg-white px-3 text-xs font-medium text-[#4A4A4A] transition-colors hover:border-[#000000] hover:text-black disabled:opacity-40"
                >
                  <Link2 className="h-3.5 w-3.5" />
                  {importing ? "导入中…" : "导入文章"}
                </button>
                <button
                  onClick={createNote}
                  className="flex h-9 items-center gap-1.5 rounded-[2px] bg-[#000000] px-4 text-xs font-medium text-white transition-opacity hover:opacity-85"
                >
                  <Plus className="h-3.5 w-3.5" />
                  写文章
                </button>
              </div>
            </div>
            {/* 批量操作条：本阶段只放「加入知识流 / 删除」两个高频动作 */}
            {selectMode && (
              <div className="flex flex-wrap items-center gap-2 rounded-[2px] border border-[#E5E5E5] bg-white px-3 py-2 text-xs text-[#4A4A4A]">
                <span>已选 {selectedIds.size} 篇</span>
                <button
                  onClick={setSelectAll}
                  className="text-[#8A8A8A] underline-offset-2 transition-colors hover:text-black hover:underline"
                >
                  {selectedIds.size === notes.filter((n) => !n.id.startsWith("draft-")).length
                    ? "取消全选"
                    : "全选"}
                </button>
                <button
                  onClick={batchAddToLibrary}
                  disabled={selectedIds.size === 0 || batchBusy}
                  className="ml-auto h-8 rounded-[2px] bg-[#000000] px-3 text-xs font-medium text-white transition-opacity hover:opacity-85 disabled:opacity-30"
                >
                  {batchBusy ? "处理中…" : "加入知识流"}
                </button>
                <button
                  onClick={askBatchDelete}
                  disabled={selectedIds.size === 0 || batchBusy}
                  className="h-8 rounded-[2px] border border-[#D9D9D9] bg-white px-3 text-xs font-medium text-[#4A4A4A] transition-colors hover:border-[#000000] hover:text-black disabled:opacity-30"
                >
                  删除
                </button>
              </div>
            )}
            {notes.length === 0 ? (
              <div className="rounded-[2px] border border-dashed border-[#D9D9D9] bg-white p-12 text-center">
                <p className="text-sm text-[#A0A8B4]">还没有文章，点「写文章」开始第一篇</p>
              </div>
            ) : (
              notes.map((note) => (
                <article
                  key={note.id}
                  onClick={() =>
                    selectMode
                      ? toggleSelect(note.id)
                      : setDetail({ type: "note", id: note.id })
                  }
                  className={cn(
                    "cursor-pointer rounded-[2px] bg-white px-4 py-3.5 md:px-5",
                    !selectMode &&
                      "transition-shadow hover:shadow-[0_1px_4px_rgba(0,0,0,0.06)]",
                  )}
                >
                  <h3 className="flex items-center gap-2 text-[15px] font-semibold text-black">
                    {selectMode && (
                      <span
                        className={cn(
                          "flex h-4 w-4 shrink-0 items-center justify-center rounded-[2px] border",
                          selectedIds.has(note.id)
                            ? "border-[#000000] bg-[#000000] text-white"
                            : "border-[#D9D9D9]",
                        )}
                      >
                        {selectedIds.has(note.id) && <Check className="h-3 w-3" />}
                      </span>
                    )}
                    <span className="min-w-0 truncate">
                      {note.title || "无标题文章"}
                    </span>
                  </h3>
                  <p className="mt-1 line-clamp-2 text-[13.5px] leading-relaxed text-[#8A8A8A]">
                    {note.content.split("\n")[0] || "（正文为空）"}
                  </p>
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    {note.tags.map((tag) => (
                      <span
                        key={tag}
                        className="whitespace-nowrap rounded-[2px] bg-[#ECECEC] px-2.5 py-0.5 text-xs text-[#4A4A4A]"
                      >
                        {tag}
                      </span>
                    ))}
                    <AddTagButton onClick={() => setTagPicker({ type: "note", id: note.id })} />
                    <span className="ml-auto text-xs text-[#A0A8B4]">
                      最后编辑 {note.updatedAt}
                    </span>
                    {/* 方案 B：入库开关放列表卡上，写完顺手就能点，不用进详情找 */}
                    {!selectMode && !note.id.startsWith("draft-") && (
                      note.inLibrary ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeNoteFromLibrary(note);
                          }}
                          className="text-xs text-[#A0A8B4] underline-offset-2 transition-colors hover:text-black hover:underline"
                        >
                          移出知识流
                        </button>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            addNoteToLibrary(note);
                          }}
                          className="text-xs font-medium text-[#000000] underline underline-offset-2 transition-opacity hover:opacity-70"
                        >
                          加入知识流
                        </button>
                      )
                    )}
                  </div>
                </article>
              ))
            )}
          </div>
        );

      case "inbox":
        return (
          <div className="space-y-4">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Link2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#999999]" />
                <input
                  type="text"
                  placeholder="粘贴链接或文本，正文自动抓回来"
                  value={captureInput}
                  onChange={(e) => setCaptureInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCapture()}
                  className="h-10 w-full rounded-[2px] border border-[#E5E5E5] bg-white pl-9 pr-3 text-sm text-[#000000] placeholder:text-[#999999] outline-none focus:border-[#000000]"
                />
              </div>
              <button
                onClick={handleCapture}
                disabled={!captureInput.trim() || savingId === "capturing"}
                className="h-10 shrink-0 rounded-[2px] bg-[#000000] px-4 text-sm font-medium text-white transition-opacity hover:opacity-85 disabled:opacity-30"
              >
                丢进来
              </button>
            </div>
            {/* 过期清理提示（阶段4 P2）：待处理里超过 30 天没拍板的堆积。
                只提示 + 一键丢弃，不自动删——堆积可见、清不清你说了算；
                丢弃进「不要了」而非物理删除，留反悔路 */}
            {agedInbox > 0 && !inboxSelectMode && (
              <div className="flex flex-wrap items-center gap-2 rounded-[2px] border border-[#E5E5E5] bg-white px-3 py-2.5 text-xs text-[#4A4A4A]">
                <span>
                  有 <span className="font-semibold text-black">{agedInbox}</span>{" "}
                  条在待处理里躺了超过 30 天，要处理一下吗？
                </span>
                <button
                  onClick={() => void discardAgedInbox()}
                  disabled={inboxBatchBusy}
                  className="ml-auto rounded-[2px] bg-[#000000] px-2.5 py-1 text-xs text-white transition-opacity hover:opacity-80 disabled:opacity-40"
                >
                  {inboxBatchBusy ? "处理中…" : "都不要了"}
                </button>
              </div>
            )}
            {/* 工具行：批量操作入口（右）。批量模式切换会关掉其余跳转——
                批量圈选需要稳定的列表上下文 */}
            <div className="flex flex-wrap items-center gap-3 px-1">
              <button
                onClick={() =>
                  inboxSelectMode ? exitInboxSelect() : setInboxSelectMode(true)
                }
                disabled={inbox.length === 0}
                className="ml-auto flex h-7 items-center gap-1.5 rounded-[2px] border border-[#D9D9D9] bg-white px-3 text-xs font-medium text-[#4A4A4A] transition-colors hover:border-[#000000] hover:text-black disabled:cursor-not-allowed disabled:opacity-40"
              >
                <CheckSquare className="h-3.5 w-3.5" />
                {inboxSelectMode ? "退出批量" : "批量拍板"}
              </button>
            </div>
            <p className="hidden items-center gap-1.5 px-1 text-xs text-[#A0A8B4] md:flex">
              <Sparkles className="h-3.5 w-3.5" />
              新抓来的先堆这，等你拍板：留下进知识流，不要了不再出现（不要了与删除是两件事）
              <span className="ml-2 text-[#C4C4C4]">键盘 j/k 选中 · ← 留下 · → 不要了</span>
            </p>
            {/* 批量操作条：进入选择模式后顶替采集提示行，圈几条批量办几条 */}
            {inboxSelectMode && (
              <div className="flex flex-wrap items-center gap-2 rounded-[2px] border border-[#E5E5E5] bg-white px-4 py-2.5 text-xs">
                <span className="font-medium text-black">
                  已选 {inboxSelected.size} 条
                </span>
                <button
                  onClick={setInboxSelectAll}
                  className="h-7 rounded-[2px] border border-[#D9D9D9] bg-white px-2.5 font-medium text-[#4A4A4A] transition-colors hover:border-[#000000] hover:text-black"
                >
                  {inboxSelected.size === inbox.length ? "取消全选" : "全选"}
                </button>
                <span className="text-[#C4C4C4]">按住 Shift 可连选</span>
                <div className="ml-auto flex items-center gap-2">
                  <button
                    onClick={() => batchDecide("discarded")}
                    disabled={inboxSelected.size === 0 || inboxBatchBusy}
                    className="h-7 rounded-[2px] border border-[#D9D9D9] bg-white px-2.5 font-medium text-[#4A4A4A] transition-colors hover:border-[#000000] hover:text-black disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    批量不要了
                  </button>
                  <button
                    onClick={() => batchDecide("kept")}
                    disabled={inboxSelected.size === 0 || inboxBatchBusy}
                    className="h-7 rounded-[2px] bg-[#000000] px-2.5 font-medium text-white transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {inboxBatchBusy ? "处理中…" : "批量留下"}
                  </button>
                </div>
              </div>
            )}
            {loadingKnowledge ? (
              <div className="rounded-[2px] border border-dashed border-[#D9D9D9] bg-white p-12 text-center">
                <p className="text-sm text-[#A0A8B4]">待处理加载中…</p>
              </div>
            ) : inbox.length === 0 ? (
              <div className="rounded-[2px] border border-dashed border-[#D9D9D9] bg-white p-12 text-center">
                <p className="text-sm text-[#A0A8B4]">待处理空空如也，去采集吧</p>
              </div>
            ) : (
              inbox.map((item, idx) => (
                <div
                  key={item.id}
                  className={cn(
                    "rounded-[2px] bg-white px-4 py-3.5 transition-shadow md:px-5",
                    // 快捷键焦点卡：细描边高亮，j/k 移动时肉眼可辨
                    focusIdx === idx && "outline outline-1 -outline-offset-1 outline-[#000000]",
                    inboxSelectMode && "cursor-pointer",
                  )}
                  onClick={
                    inboxSelectMode
                      ? (e) => toggleInboxSelect(idx, e.shiftKey)
                      : undefined
                  }
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      {/* 选择模式的勾选框 */}
                      {inboxSelectMode && (
                        <span
                          className={cn(
                            "flex h-4 w-4 shrink-0 items-center justify-center rounded-[2px] border transition-colors",
                            inboxSelected.has(item.id)
                              ? "border-[#000000] bg-[#000000] text-white"
                              : "border-[#C4C4C4] bg-white",
                          )}
                        >
                          {inboxSelected.has(item.id) && (
                            <Check className="h-3 w-3" />
                          )}
                        </span>
                      )}
                      <h3
                        className={cn(
                          "truncate text-[15px] font-semibold text-black",
                          !inboxSelectMode &&
                            "cursor-pointer hover:underline decoration-[#C4C4C4] underline-offset-4",
                        )}
                        onClick={
                          inboxSelectMode ? undefined : () => openInboxDetail(item)
                        }
                      >
                        {item.title}
                      </h3>
                    </div>
                    <span className="shrink-0 pt-0.5 text-xs text-[#A0A8B4]">
                      {item.source}
                    </span>
                  </div>
                  <p className="mt-1 text-[13.5px] leading-relaxed text-[#8A8A8A]">
                    <span className="text-[#4A4A4A]">摘要：</span>
                    {item.summary}
                  </p>
                  {/* 降级条目：给个重试入口，抓到正文这条就完整了 */}
                  {item.degraded && (
                    <div className="mt-2 flex items-center gap-2 text-xs text-[#8A5A1B]">
                      <span>没抓到正文，只有链接</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          refetchInboxItem(item);
                        }}
                        disabled={refetchingId != null}
                        className="flex h-6 items-center gap-1 rounded-[2px] border border-[#E8923A] bg-white px-2 font-medium text-[#8A5A1B] transition-opacity hover:opacity-80 disabled:opacity-40"
                      >
                        <RotateCw className="h-3 w-3" />
                        {refetchingId === item.id ? "抓取中…" : "重新抓取"}
                      </button>
                    </div>
                  )}
                  <div className="mt-3 flex items-center justify-end gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        dropItem(item);
                      }}
                      disabled={savingId != null || inboxSelectMode}
                      className="flex h-8 items-center gap-1.5 rounded-[2px] border border-[#D9D9D9] bg-white px-3 text-xs font-medium text-[#4A4A4A] transition-colors hover:border-[#000000] hover:text-black disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <X className="h-3.5 w-3.5" />
                      {savingId === item.id ? "处理中…" : "不要了"}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        keepItem(item);
                      }}
                      disabled={savingId != null || inboxSelectMode}
                      className="flex h-8 items-center gap-1.5 rounded-[2px] bg-[#000000] px-3 text-xs font-medium text-white transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Check className="h-3.5 w-3.5" />
                      留下
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        );

      case "trash":
        return (
          <div className="space-y-4">
            <p className="px-1 text-xs text-[#A0A8B4]">
              删除的文章和采集条目先进这，7 天后彻底删除，过期前都能捞回
            </p>
            {trash.length === 0 ? (
              <div className="rounded-[2px] border border-dashed border-[#D9D9D9] bg-white p-12 text-center">
                <p className="text-sm text-[#A0A8B4]">
                  垃圾桶是空的，删除的东西会暂时躺在这等过期。
                </p>
              </div>
            ) : (
              trash.map((item) => (
                <div key={item.id} className="rounded-[2px] bg-white px-4 py-3.5 md:px-5">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-[15px] font-semibold text-black">
                      {item.title}
                    </h3>
                    <span className="shrink-0 rounded-full bg-[#ECECEC] px-2 py-0.5 text-[10px] font-medium text-[#8A8A8A]">
                      来自{item.origin}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-[#A0A8B4]">{item.source}</p>
                  <p className="mt-1 text-[13.5px] leading-relaxed text-[#8A8A8A]">
                    {item.summary}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="mr-auto text-xs text-[#8A8A8A]">
                      还剩 {item.daysLeft} 天彻底删除
                    </span>
                    <button
                      onClick={() => askDeleteTrash(item)}
                      className="flex h-8 items-center gap-1.5 rounded-[2px] border border-[#D9D9D9] bg-white px-3 text-xs font-medium text-[#4A4A4A] transition-colors hover:border-[#000000] hover:text-black"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      彻底删除
                    </button>
                    <button
                      onClick={() => restoreTrash(item)}
                      className="flex h-8 items-center gap-1.5 rounded-[2px] bg-[#000000] px-3 text-xs font-medium text-white transition-opacity hover:opacity-85"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      捞回
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        );

      case "quiz":
        return (
          <div className="space-y-5">
            <div className="flex gap-2">
              {(
                [
                  { k: "flash", label: "闪卡" },
                  { k: "choice", label: "选择题" },
                ] as const
              ).map((m) => (
                <button
                  key={m.k}
                  onClick={() => setQuizMode(m.k)}
                  className={cn(
                    "flex-1 rounded-[2px] py-2.5 text-sm font-medium transition-all",
                    quizMode === m.k
                      ? "bg-[#000000] text-white"
                      : "border border-[#D9D9D9] bg-white text-[#4A4A4A] hover:border-[#000000]",
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {quizMode === "flash" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {flashCards.map((card) => {
                  const isFlipped = flipped[card.id];
                  return (
                    <div
                      key={card.id}
                      onClick={() => toggleFlip(card.id)}
                      className="relative min-h-[180px] cursor-pointer rounded-[2px] bg-white p-5 transition-shadow hover:shadow-[0_1px_6px_rgba(0,0,0,0.08)]"
                    >
                      <p className="text-[11px] tracking-widest text-[#A0A8B4]">
                        {isFlipped ? "答案" : "闪卡"}
                      </p>
                      {isFlipped ? (
                        <p className="mt-3 text-[15px] leading-7 text-[#2A2A2A]">
                          <strong className="text-black">
                            {card.a.split("：")[0]}
                          </strong>
                          {card.a.includes("：")
                            ? `：${card.a.split("：").slice(1).join("：")}`
                            : ""}
                        </p>
                      ) : (
                        <p className="mt-3 text-[17px] font-semibold leading-relaxed text-black">
                          {card.q}
                        </p>
                      )}
                      <span className="absolute bottom-3 right-4 flex items-center gap-1 text-xs text-[#A0A8B4]">
                        <RotateCw className="h-3 w-3" />
                        {isFlipped ? "点回正面" : "点我翻面"}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-4">
                {choiceQuestions.map((q) => {
                  const picked = answered[q.id];
                  return (
                    <div key={q.id} className="rounded-[2px] bg-white p-5">
                      <p className="text-[15px] font-semibold leading-relaxed text-black">
                        {q.q}
                      </p>
                      <div className="mt-3 space-y-2">
                        {q.options.map((opt) => {
                          const isCorrect = opt.correct;
                          const isPicked = picked === opt.key;
                          const showResult = !!picked;
                          return (
                            <button
                              key={opt.key}
                              disabled={showResult}
                              onClick={() => pickOption(q.id, opt.key)}
                              className={cn(
                                "flex w-full items-center gap-3 rounded-[2px] border px-4 py-3 text-left text-sm transition-all",
                                !showResult &&
                                  "border-[#E5E5E5] hover:border-[#000000]",
                                showResult &&
                                  isCorrect &&
                                  "border-[#16a34a] bg-[#f0fdf4] text-[#15803d]",
                                showResult &&
                                  isPicked &&
                                  !isCorrect &&
                                  "border-[#dc2626] bg-[#fef2f2] text-[#b91c1c]",
                                showResult &&
                                  !isPicked &&
                                  !isCorrect &&
                                  "border-[#EEEEEE] text-[#B0B0B0]",
                              )}
                            >
                              <span
                                className={cn(
                                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-[2px] border text-[13px] font-semibold",
                                  showResult && isCorrect
                                    ? "border-[#16a34a] bg-[#16a34a] text-white"
                                    : showResult && isPicked && !isCorrect
                                      ? "border-[#dc2626] bg-[#dc2626] text-white"
                                      : "border-[#D9D9D9] text-[#8A8A8A]",
                                )}
                              >
                                {showResult && isCorrect ? (
                                  <CheckCircle2 className="h-4 w-4" />
                                ) : showResult && isPicked && !isCorrect ? (
                                  <XCircle className="h-4 w-4" />
                                ) : (
                                  opt.key
                                )}
                              </span>
                              <span className="min-w-0">{opt.text}</span>
                            </button>
                          );
                        })}
                      </div>
                      {picked && (
                        <p
                          className={cn(
                            "mt-3 flex items-center gap-1.5 text-xs",
                            q.options.find((o) => o.key === picked)?.correct
                              ? "text-[#15803d]"
                              : "text-[#b91c1c]",
                          )}
                        >
                          {q.options.find((o) => o.key === picked)?.correct ? (
                            <>
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              答对了
                            </>
                          ) : (
                            <>
                              <XCircle className="h-3.5 w-3.5" />
                              答错了，正确答案是{" "}
                              {q.options.find((o) => o.correct)?.key}
                            </>
                          )}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );

      case "review":
        return (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                {
                  num: reviewData?.todayCaptured ?? "…",
                  label: "今日采集",
                },
                {
                  num: reviewData?.todayKept ?? "…",
                  label: "今日留存",
                },
                {
                  num: trash.length,
                  label: "回收站 →",
                  jump: () => {
                    goList();
                    setSection("trash");
                  },
                },
                {
                  num: inbox.length,
                  label: "待处理 →",
                  jump: () => {
                    goList();
                    setSection("inbox");
                  },
                },
              ].map((s) => (
                <button
                  key={s.label}
                  onClick={s.jump}
                  disabled={!s.jump}
                  className={cn(
                    "rounded-[2px] bg-white px-4 py-5 text-center transition-shadow",
                    s.jump &&
                      "cursor-pointer hover:shadow-[0_1px_6px_rgba(0,0,0,0.08)]",
                  )}
                >
                  <p className="text-2xl font-semibold text-black">{s.num}</p>
                  <p className="mt-1 text-xs text-[#8A8A8A]">{s.label}</p>
                </button>
              ))}
            </div>

            {/* 重温旧藏（阶段4 P2·每日回顾）：对抗「存了不读」。
                从没打开过的排最前，读过的按最久远的挑——刻意不看最新的，
                新存的还有新鲜感，老存货才需要被想起来 */}
            <div className="rounded-[2px] bg-white px-5 py-4">
              <div className="flex items-center justify-between">
                <h3 className="text-[15px] font-semibold text-black">
                  重温旧藏
                </h3>
                <button
                  onClick={() => void loadReview()}
                  className="text-xs text-[#8A8A8A] transition-colors hover:text-black"
                >
                  换一批
                </button>
              </div>
              {reviewData === null ? (
                <p className="py-6 text-center text-sm text-[#A0A8B4]">
                  加载中…
                </p>
              ) : reviewData.revisit.length === 0 ? (
                <p className="py-6 text-center text-sm text-[#A0A8B4]">
                  知识流里还没有沉淀，先去存几条吧
                </p>
              ) : (
                <div className="mt-2 space-y-2">
                  {reviewData.revisit.map((card) => (
                    <button
                      key={card.id}
                      onClick={() => {
                        goList();
                        setDetail({ type: "feed", id: card.id });
                      }}
                      className="block w-full rounded-[2px] border border-[#F0F0F0] px-4 py-3 text-left transition-colors hover:border-[#D9D9D9]"
                    >
                      <h4 className="flex items-center gap-2 text-[14px] font-medium text-black">
                        <span className="min-w-0 truncate">{card.title}</span>
                      </h4>
                      <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-[#8A8A8A]">
                        {card.summary}
                      </p>
                      <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-[#A0A8B4]">
                        {card.tags.slice(0, 4).map((t) => (
                          <span
                            key={t}
                            className="rounded-[2px] bg-[#ECECEC] px-2 py-0.5 text-[#4A4A4A]"
                          >
                            {t}
                          </span>
                        ))}
                        <span className="ml-auto">
                          存于 {formatRelTime(card.created_at)}
                        </span>
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
    }
  };

  // ----- 渲染 -----

  return (
    <>
      <PageHeader
        title="知识"
        description="个人知识管理中心，让知识可被 AI 理解和调用"
      >
        {/* 手机端采集入口（PC 用左栏黑按钮） */}
        <button
          onClick={() => {
            goList();
            setSection("inbox");
          }}
          className="relative flex h-9 items-center gap-1.5 rounded-[2px] bg-[#000000] px-3 text-xs font-medium text-white transition-opacity hover:opacity-85 lg:hidden"
        >
          <Plus className="h-3.5 w-3.5" />
          采集
          {inbox.length > 0 && (
            <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500" />
          )}
        </button>
      </PageHeader>

      {/* 与 Agent 页同款：满高布局，左栏与内容区各自内部滚动 */}
      <div className="flex h-[calc(100%-4rem)]">
        {/* 手机 tab（<md）：横向滑动 */}
        <div className="fixed inset-x-0 top-16 z-10 flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-[#E5E5E5] bg-[#F5F5F5] px-4 py-2.5 lg:hidden [&::-webkit-scrollbar]:hidden">
          {navItems.map((item) => (
            <button
              key={item.key}
              onClick={() => {
                goList();
                setSection(item.key);
              }}
              className={cn(
                "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-medium transition-all",
                section === item.key
                  ? "bg-[#000000] text-white"
                  : "bg-white text-[#8A8A8A]",
              )}
            >
              <item.icon className="h-3 w-3" />
              {item.label}
              {item.count !== undefined && item.count > 0 && (
                <span
                  className={cn(
                    "rounded-full px-1.5 text-[10px] font-semibold",
                    section === item.key
                      ? "bg-white text-black"
                      : "bg-[#000000] text-white",
                  )}
                >
                  {item.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* PC 左栏（md+）：与 Agent 页同款结构 */}
        <aside className="hidden w-[260px] shrink-0 flex-col overflow-y-auto border-r border-[#E5E5E5] bg-[#F5F5F5] lg:flex">
          {/* 采集 */}
          <div className="p-3">
            <button
              onClick={() => {
                goList();
                setSection("inbox");
              }}
              className="relative flex w-full items-center justify-center gap-2 rounded-[2px] bg-[#000000] px-3 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-85"
            >
              <Plus className="h-4 w-4" />
              采集内容
              {inbox.length > 0 && (
                <span className="absolute right-2.5 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-red-500" />
              )}
            </button>
          </div>

          {/* 区块导航（双行结构，对齐 Agent 会话项） */}
          <nav className="flex-1 space-y-3 px-3 py-1">
            {navGroups.map((group, gi) => (
              <div key={gi} className="space-y-0.5">
                {group.label && (
                  <p className="px-3 pb-0.5 pt-1 text-[11px] font-medium text-[#A0A8B4]">
                    {group.label}
                  </p>
                )}
                {group.items.map((item) => (
                  <button
                    key={item.key}
                    onClick={() => {
                      goList();
                      setSection(item.key);
                    }}
                    className={cn(
                      "flex w-full flex-col gap-0.5 rounded-[2px] px-3 py-2.5 text-left transition-colors",
                      section === item.key
                        ? "bg-[#d5e3f6]"
                        : "hover:bg-[#ededed]",
                    )}
                  >
                    <span className="flex items-center gap-2 text-sm font-medium text-black">
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                      {item.count !== undefined && item.count > 0 && (
                        <span className="ml-auto rounded-full bg-[#000000] px-1.5 py-0.5 text-[10px] font-semibold text-white">
                          {item.count}
                        </span>
                      )}
                    </span>
                    <span className="truncate pl-6 text-xs text-[#8A8A8A]">
                      {item.desc}
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </nav>

          {/* 知识流统计（对齐 Agent 任务区） */}
          <div className="border-t border-[#E5E5E5] p-3">
            <div className="mb-2 flex items-center gap-1.5 px-1 text-xs font-medium text-[#A0A8B4]">
              <Database className="h-3 w-3" />
              知识流
            </div>
            <div className="space-y-2">
              <div className="rounded-[2px] bg-white px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-medium text-black">
                    累计条目
                  </span>
                  <span className="text-[13px] font-semibold text-black">
                    {feed.length}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center gap-2 text-[11px] text-[#A0A8B4]">
                  <span>本周 +12</span>
                  <span>待处理 {inbox.length}</span>
                  <span>回收站 {trash.length}</span>
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* 主内容区 */}
        <main className="relative min-w-0 flex-1 overflow-y-auto bg-[#ECECEC] px-4 pb-6 pt-[3.5rem] md:px-6 md:pt-6">
          {detail ? renderDetail() : renderList()}
        </main>
      </div>

      {/* ===== 标签选择器（闭环：新增 / 勾选 / 重命名 / 全局删除） ===== */}
      {tagPicker && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onClick={() => {
            setTagPicker(null);
            setPickerManage(false);
          }}
        >
          <div
            className="w-[min(420px,92vw)] rounded-[2px] bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-black">
                标签{pickerManage ? "管理" : ""}
              </p>
              <button
                onClick={() => {
                  setTagPicker(null);
                  setPickerManage(false);
                }}
                className="rounded-[2px] p-1 text-[#8A8A8A] transition-colors hover:bg-[#F0F0F0] hover:text-black"
                aria-label="关闭"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {!pickerManage ? (
              <>
                <div className="mt-3 flex max-h-52 flex-wrap gap-1.5 overflow-y-auto">
                  {allTags.map(({ tag }) => {
                    const selected = getTagsOf(tagPicker).includes(tag);
                    return (
                      <button
                        key={tag}
                        onClick={() => toggleTagOnTarget(tag)}
                        className={cn(
                          "flex items-center gap-1 rounded-[2px] px-2.5 py-1 text-xs transition-all",
                          selected
                            ? "bg-[#000000] font-medium text-white"
                            : "bg-[#ECECEC] text-[#4A4A4A] hover:bg-[#E0E0E0]",
                        )}
                      >
                        {selected && <Check className="h-3 w-3" />}
                        {tag}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-3 flex gap-2">
                  <input
                    type="text"
                    placeholder="新建标签，回车添加"
                    value={newTagInput}
                    onChange={(e) => setNewTagInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && createTagAndSelect()}
                    className="h-9 flex-1 rounded-[2px] border border-[#E5E5E5] px-3 text-sm text-[#000000] placeholder:text-[#999999] outline-none focus:border-[#000000]"
                  />
                </div>
                <button
                  onClick={() => setPickerManage(true)}
                  className="mt-3 text-xs text-[#8A8A8A] underline-offset-2 transition-colors hover:text-black hover:underline"
                >
                  管理标签（重命名 / 删除）
                </button>
              </>
            ) : (
              <>
                <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
                  {allTags.map(({ tag }) => (
                    <div key={tag} className="flex items-center gap-2">
                      <input
                        type="text"
                        defaultValue={tag}
                        onBlur={(e) => renameTag(tag, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            renameTag(tag, e.currentTarget.value);
                            e.currentTarget.blur();
                          }
                        }}
                        className="h-9 flex-1 rounded-[2px] border border-[#E5E5E5] px-3 text-sm text-[#000000] outline-none focus:border-[#000000]"
                      />
                      <button
                        onClick={() => askRemoveTagGlobal(tag)}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[2px] border border-[#D9D9D9] text-[#8A8A8A] transition-colors hover:border-[#000000] hover:text-black"
                        aria-label={`删除标签 ${tag}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex justify-end">
                  <button
                    onClick={() => setPickerManage(false)}
                    className="h-9 rounded-[2px] bg-[#000000] px-4 text-xs font-medium text-white transition-opacity hover:opacity-85"
                  >
                    完成
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ===== 轻量提示条（toast）：底部居中浮出，几秒自动消失 ===== */}
      {toast && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
          <div className="rounded-[2px] bg-[#000000] px-4 py-2 text-xs font-medium text-white shadow-[0_2px_8px_rgba(0,0,0,0.18)]">
            {toast}
          </div>
        </div>
      )}

      {/* ===== 二次确认弹层 ===== */}
      {confirmState && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onClick={() => setConfirmState(null)}
        >
          <div
            className="w-[min(360px,92vw)] rounded-[2px] bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-semibold text-black">
              {confirmState.title}
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-[#8A8A8A]">
              {confirmState.desc}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setConfirmState(null)}
                className="h-9 rounded-[2px] border border-[#D9D9D9] bg-white px-4 text-xs font-medium text-[#4A4A4A] transition-colors hover:border-[#000000] hover:text-black"
              >
                取消
              </button>
              <button
                onClick={() => {
                  confirmState.onOk();
                  setConfirmState(null);
                }}
                className="h-9 rounded-[2px] bg-[#000000] px-4 text-xs font-medium text-white transition-opacity hover:opacity-85"
              >
                {confirmState.okText}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
