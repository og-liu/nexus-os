"use client";

import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  PenLine,
  Inbox,
  Trash2,
  Rss,
  Search,
  Plus,
  Check,
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
  fresh?: boolean; // 刚刚入库
}

interface Note {
  id: string; // K3 前置起接真库，与 feed 同一张表同一个 UUID 体系
  title: string;
  content: string;
  tags: string[];
  updatedAt: string; // 渲染时由 formatRelTime 现算的相对时间文案
}

interface InboxItem {
  id: string; // 真数据 UUID，与后端 store 的 id 对齐
  title: string;
  source: string;
  summary: string;
}

interface TrashItem {
  id: string;
  title: string;
  source: string;
  summary: string;
  origin: "采集" | "文章"; // 由 kind 映射的出身标签
  daysLeft: number; // 由 deleted_at 现算：距彻底删除还剩几天
}

interface Source {
  id: number;
  name: string;
  freq: string;
  on: boolean;
}

type Section = "feed" | "notes" | "inbox" | "trash" | "sources" | "quiz" | "review";
// K3 前置起 feed 与 note 都是真库 UUID，详情引用统一 string
type DetailRef = { type: "feed"; id: string } | { type: "note"; id: string } | null;

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
    a: "先检索、再生成：先在知识库里搜一遍，命中了用库里的内容回答，没命中才联网。",
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
    q: "知识库「保鲜扫描」主要解决什么？",
    options: [
      { key: "A", text: "让笔记更好看" },
      { key: "B", text: "标记过时/失效内容并提示归档", correct: true },
      { key: "C", text: "自动增加新订阅源" },
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
  status: "inbox" | "kept" | "discarded" | "trashed";
  kind: "captured" | "note";
  deleted_at: number | null;
  tags: string[];
  created_at: number;
  updated_at: number;
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
    fresh: false, // 只有拍板保留瞬间插入的条目才标 fresh，从库加载的不算
  };
}

// store 行 → 收件箱拍板卡
function toInboxItem(row: KnowledgeRow): InboxItem {
  return {
    id: row.id,
    title: row.title,
    source: row.source ?? "手动采集",
    summary: makeSummary(row.content),
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





const initialSources: Source[] = [
  { id: 1, name: "技术晨报", freq: "每天 07:00", on: true },
  { id: 2, name: "前端周报", freq: "每周一 08:00", on: true },
  { id: 3, name: "AI 日报", freq: "每天 09:00", on: true },
  { id: 4, name: "个人博客圈", freq: "每天 12:00", on: false },
];

// ---------- 小组件 ----------

function TagPill({
  children,
  onRemove,
}: {
  children: React.ReactNode;
  onRemove?: () => void;
}) {
  return (
    <span className="group/tag inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-[#ECECEC] px-2.5 py-0.5 text-xs text-[#4A4A4A]">
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
  // sources 仍是 mock，等自动化采集（K5 RSS）时一并设计
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [trash, setTrash] = useState<TrashItem[]>([]);
  const [sources, setSources] = useState<Source[]>(initialSources);
  const [allTags, setAllTags] = useState<string[]>([]); // 全部标签，从 /api/knowledge/tags 拉取
  // K2 标签筛选：点知识流里的标签 pill 即按该标签过滤（服务端 tag 参数）
  const [activeTag, setActiveTag] = useState<string | null>(null);
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

  /** 拉知识流（kept 列表）：关键词 q 与标签 tag 传给服务端组合过滤——
   *  LIKE 检索和标签匹配在 store 层拼 WHERE 条件，前端只负责拼参数。
   *  这取代了 K1 之前「整页拉回来前端 filter」的做法：数据库是唯一真相，
   *  分页/大数据量时也不会把全表拖到浏览器 */
  const loadFeed = async (q: string, tag: string | null) => {
    const params = new URLSearchParams({ status: "kept", limit: "100" });
    if (q) params.set("q", q);
    if (tag) params.set("tag", tag);
    const res = await fetch(`/api/knowledge?${params.toString()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    setFeed((data.items as KnowledgeRow[]).map(toFeedItem));
  };

  /** 拉全部标签及计数，驱动标签选择器候选列表（新打标签后也要刷新它） */
  const loadAllTags = async () => {
    const res = await fetch("/api/knowledge/tags");
    if (!res.ok) return;
    const data = await res.json();
    setAllTags((data.tags as Array<{ tag: string; count: number }>).map((t) => t.tag));
  };

  /** 拉我的文章（kind=note 且 kept）。笔记不走搜索/筛选，固定全量拉取 */
  const loadNotes = async () => {
    const res = await fetch("/api/knowledge?status=kept&kind=note&limit=200");
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

  // 首屏并行拉五路数据：收件箱、知识流、标签、我的文章、回收站。
  // 用 allSettled 而不是 all：一个接口挂了其他照常显示，不至于整页报废
  useEffect(() => {
    let alive = true; // 组件卸载后不再 setState
    (async () => {
      const results = await Promise.allSettled([
        fetch("/api/knowledge?status=inbox&limit=100"),
        loadFeed("", null),
        loadAllTags(),
        loadNotes(),
        loadTrash(),
      ]);
      if (!alive) return;
      // 收件箱那路要单独解析 body；其余四路内部已各自 setState
      let failed = results[0].status === "rejected";
      if (results[0].status === "fulfilled") {
        if (!results[0].value.ok) failed = true;
        else {
          const data = await results[0].value.json();
          setInbox((data.items as KnowledgeRow[]).map(toInboxItem));
        }
      }
      if (results.slice(1).some((r) => r.status === "rejected")) failed = true;
      if (failed) showToast("部分数据加载失败，请刷新重试");
      setLoadingKnowledge(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

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
        await loadFeed(searchQuery.trim(), activeTag);
      } catch {
        showToast("检索失败，请重试");
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [searchQuery, activeTag]);

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

  // 自测
  const [quizMode, setQuizMode] = useState<"flash" | "choice">("flash");
  const [flipped, setFlipped] = useState<Record<number, boolean>>({});
  const [answered, setAnswered] = useState<Record<number, string>>({});

  const toggleFlip = (id: number) =>
    setFlipped((prev) => ({ ...prev, [id]: !prev[id] }));

  const pickOption = (qid: number, key: string) => {
    setAnswered((prev) => (prev[qid] ? prev : { ...prev, [qid]: key }));
  };

  const goList = () => {
    setDetail(null);
    setEditingNoteId(null);
  };

  // ----- 收件箱拍板 -----

  // 拍板「保留」：PATCH status=kept，接口确认后才动本地列表——
  // 流转失败时收件箱保持原样，用户不会误以为拍板成功。
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
      showToast("已保留进知识流");
    } catch {
      showToast("操作失败，请重试");
    } finally {
      setSavingId(null);
    }
  };

  // 拍板「放弃」：PATCH status=discarded。
  // 注意语义区分：discarded 是「从未保留过」，trashed 才是回收站的「先进站再删」；
  // 原 mock 把放弃塞进回收站是演示期的混淆行为，K1 按数据层正确状态机走
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
      showToast("已放弃");
    } catch {
      showToast("操作失败，请重试");
    } finally {
      setSavingId(null);
    }
  };

  // 手动采集：POST 落库进 inbox。必须先等接口返回真实 id 再插入本地列表——
  // 不能乐观插入（本地造假 id），否则后续拍板的 PATCH 会拿着假 id 打空炮
  const handleCapture = async () => {
    const text = captureInput.trim();
    if (!text || savingId === "capturing") return;
    setSavingId("capturing"); // "capturing" 是采集动作的占位标记（此刻还没有真实条目 id）
    try {
      const res = await fetch("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const row = (await res.json()) as KnowledgeRow;
      setCaptureInput("");
      setInbox((prev) => [toInboxItem(row), ...prev]);
      showToast("已丢进收件箱，等你拍板");
    } catch {
      showToast("采集失败，请重试");
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
        loadFeed(searchQuery.trim(), activeTag),
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
      { id: draftId, title: "", content: "", tags: [], updatedAt: "刚刚" },
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
    if (!allTags.includes(name)) setAllTags((prev) => [...prev, name]);
    const current = getTagsOf(tagPicker);
    if (!current.includes(name)) setTagsOf(tagPicker, [...current, name]);
    setNewTagInput("");
  };

  const renameTag = (oldName: string, newName: string) => {
    const name = newName.trim();
    if (!name || name === oldName) return;
    setAllTags((prev) => prev.map((t) => (t === oldName ? name : t)));
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
    if (activeTag === oldName) setActiveTag(name);
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
        setAllTags((prev) => prev.filter((t) => t !== tag));
        setFeed((prev) =>
          prev.map((f) => ({ ...f, tags: f.tags.filter((t) => t !== tag) })),
        );
        setNotes((prev) =>
          prev.map((n) => ({ ...n, tags: n.tags.filter((t) => t !== tag) })),
        );
        // 删掉的正是当前筛选标签时，退出筛选（不然列表还挂在已消失的条件上）
        if (activeTag === tag) setActiveTag(null);
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
        { key: "inbox", label: "收件箱", icon: Inbox, desc: "AI 初筛等你拍板", count: inbox.length },
        { key: "trash", label: "回收站", icon: Trash2, desc: "7 天内可捞回", count: trash.length },
        {
          key: "sources",
          label: "订阅源",
          icon: Rss,
          desc: `${sources.filter((s) => s.on).length} 个在运行`,
        },
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
  const isEditing = currentNote && editingNoteId === currentNote.id;

  // K2 起搜索走服务端（loadFeed 的 q 参数），不再需要前端 filter 一层——
  // feed 本身就是「当前检索条件下」的结果集

  // ----- 详情视图 -----

  const detailBack = () => goList();

  const renderDetail = () => {
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
          <article className="rounded-[2px] bg-white px-5 py-6 md:px-8 md:py-8">
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
            {/* K2 Markdown 渲染：存储始终是纯文本单一事实源，只在展示层解析 */}
            <div className="mt-5">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={markdownComponents}
              >
                {currentFeed.content}
              </ReactMarkdown>
            </div>
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
              {/* 底部操作。「加入知识流」按钮已移除：笔记入库后天然可被
                  检索/AI 看到（同表 kind=note），原按钮建立在「笔记不在库」的旧前提上 */}
              <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-[#F0F0F0] pt-4">
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
            {/* K2 标签筛选横幅：点列表里的标签 pill 进入筛选，这里给出退出入口 */}
            {activeTag && (
              <div className="flex items-center gap-2 rounded-[2px] border border-[#E5E5E5] bg-white px-3 py-2 text-xs text-[#4A4A4A]">
                <span>按标签「{activeTag}」筛选</span>
                <button
                  onClick={() => setActiveTag(null)}
                  className="ml-auto flex items-center gap-1 text-[#8A8A8A] transition-colors hover:text-black"
                >
                  <X className="h-3 w-3" />
                  清除筛选
                </button>
              </div>
            )}
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
                    {/* 标签即筛选入口：点 pill 直接按该标签过滤知识流。
                        stopPropagation 防止触发卡片的进详情点击 */}
                    {item.tags.map((tag) => {
                      const active = activeTag === tag;
                      return (
                        <button
                          key={tag}
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveTag(active ? null : tag);
                          }}
                          className={cn(
                            "whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs transition-colors",
                            active
                              ? "bg-[#000000] text-white"
                              : "bg-[#ECECEC] text-[#4A4A4A] hover:bg-[#D9D9D9]",
                          )}
                        >
                          {tag}
                        </button>
                      );
                    })}
                    <AddTagButton onClick={() => setTagPicker({ type: "feed", id: item.id })} />
                    <span className="ml-auto text-xs text-[#A0A8B4]">
                      {item.source} · {item.time}
                    </span>
                  </div>
                </article>
              ))
            )}
          </div>
        );

      case "notes":
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between px-1">
              <p className="text-xs text-[#A0A8B4]">自己写的文章，自动保存到知识库，可编辑、打标签、删除</p>
              <button
                onClick={createNote}
                className="flex h-9 items-center gap-1.5 rounded-[2px] bg-[#000000] px-4 text-xs font-medium text-white transition-opacity hover:opacity-85"
              >
                <Plus className="h-3.5 w-3.5" />
                写文章
              </button>
            </div>
            {notes.length === 0 ? (
              <div className="rounded-[2px] border border-dashed border-[#D9D9D9] bg-white p-12 text-center">
                <p className="text-sm text-[#A0A8B4]">还没有文章，点「写文章」开始第一篇</p>
              </div>
            ) : (
              notes.map((note) => (
                <article
                  key={note.id}
                  onClick={() => setDetail({ type: "note", id: note.id })}
                  className="cursor-pointer rounded-[2px] bg-white px-4 py-3.5 transition-shadow hover:shadow-[0_1px_4px_rgba(0,0,0,0.06)] md:px-5"
                >
                  <h3 className="flex items-center gap-2 text-[15px] font-semibold text-black">
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
                        className="whitespace-nowrap rounded-full bg-[#ECECEC] px-2.5 py-0.5 text-xs text-[#4A4A4A]"
                      >
                        {tag}
                      </span>
                    ))}
                    <AddTagButton onClick={() => setTagPicker({ type: "note", id: note.id })} />
                    <span className="ml-auto text-xs text-[#A0A8B4]">
                      最后编辑 {note.updatedAt}
                    </span>
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
                  placeholder="粘贴链接或文本，丢给 AI 采集"
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
            <p className="flex items-center gap-1.5 px-1 text-xs text-[#A0A8B4]">
              <Sparkles className="h-3.5 w-3.5" />
              AI 已按你的口味初筛；保留进知识流，放弃则不再出现（放弃与删除是两件事）
            </p>
            {loadingKnowledge ? (
              <div className="rounded-[2px] border border-dashed border-[#D9D9D9] bg-white p-12 text-center">
                <p className="text-sm text-[#A0A8B4]">收件箱加载中…</p>
              </div>
            ) : inbox.length === 0 ? (
              <div className="rounded-[2px] border border-dashed border-[#D9D9D9] bg-white p-12 text-center">
                <p className="text-sm text-[#A0A8B4]">收件箱空空如也，去采集吧</p>
              </div>
            ) : (
              inbox.map((item) => (
                <div key={item.id} className="rounded-[2px] bg-white px-4 py-3.5 md:px-5">
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
                      onClick={() => dropItem(item)}
                      disabled={savingId != null}
                      className="flex h-8 items-center gap-1.5 rounded-[2px] border border-[#D9D9D9] bg-white px-3 text-xs font-medium text-[#4A4A4A] transition-colors hover:border-[#000000] hover:text-black disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <X className="h-3.5 w-3.5" />
                      {savingId === item.id ? "处理中…" : "放弃"}
                    </button>
                    <button
                      onClick={() => keepItem(item)}
                      disabled={savingId != null}
                      className="flex h-8 items-center gap-1.5 rounded-[2px] bg-[#000000] px-3 text-xs font-medium text-white transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Check className="h-3.5 w-3.5" />
                      保留
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
                  垃圾桶是空的，放弃的东西会暂时躺在这等过期。
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

      case "sources":
        return (
          <div className="space-y-4">
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
                    <p className="mt-0.5 text-xs text-[#A0A8B4]">{source.freq}</p>
                  </div>
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
                { num: 8, label: "今日采集" },
                { num: 5, label: "今日留存" },
                {
                  num: trash.length,
                  label: "今日放弃 →",
                  jump: () => {
                    goList();
                    setSection("trash");
                  },
                },
                {
                  num: inbox.length,
                  label: "待你拍板 →",
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

            <div className="rounded-[2px] bg-white px-5 py-4">
              <h3 className="text-[15px] font-semibold text-black">今日回顾</h3>
              <ul className="mt-2">
                {[
                  { t: "技术晨报 · 08-23 已生成", n: "08:00" },
                  { t: "建议复习「RAG 是什么」", n: "快到遗忘点" },
                  { t: "建议复习「智能体四件套」", n: "快到遗忘点" },
                ].map((li) => (
                  <li
                    key={li.t}
                    className="flex items-center gap-3 border-b border-[#F0F0F0] py-2.5 last:border-0"
                  >
                    <span className="min-w-0 flex-1 truncate text-[13.5px] text-[#2A2A2A]">
                      {li.t}
                    </span>
                    <span className="shrink-0 text-xs text-[#A0A8B4]">{li.n}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-[2px] bg-white px-5 py-4">
              <h3 className="text-[15px] font-semibold text-black">本周小结</h3>
              <p className="mt-1 text-xs text-[#A0A8B4]">
                本周入库 32 条 · 活跃主题分布
              </p>
              <div className="mt-3 space-y-2.5">
                {[
                  { name: "Agent 开发", count: 14, pct: 44 },
                  { name: "RAG", count: 7, pct: 22 },
                  { name: "前端", count: 6, pct: 19 },
                  { name: "晨报", count: 5, pct: 16 },
                ].map((topic) => (
                  <div
                    key={topic.name}
                    className="flex items-center gap-3 text-[13px]"
                  >
                    <span className="w-20 shrink-0 text-[#4A4A4A]">
                      {topic.name}
                    </span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-[#ECECEC]">
                      <span
                        className="block h-full rounded-full bg-[#000000]"
                        style={{ width: `${topic.pct}%` }}
                      />
                    </span>
                    <span className="w-10 shrink-0 text-right text-xs text-[#8A8A8A]">
                      {topic.count} 条
                    </span>
                  </div>
                ))}
              </div>
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

          {/* 知识库统计（对齐 Agent 任务区） */}
          <div className="border-t border-[#E5E5E5] p-3">
            <div className="mb-2 flex items-center gap-1.5 px-1 text-xs font-medium text-[#A0A8B4]">
              <Database className="h-3 w-3" />
              知识库
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
                  <span>待拍板 {inbox.length}</span>
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
                  {allTags.map((tag) => {
                    const selected = getTagsOf(tagPicker).includes(tag);
                    return (
                      <button
                        key={tag}
                        onClick={() => toggleTagOnTarget(tag)}
                        className={cn(
                          "flex items-center gap-1 rounded-full px-2.5 py-1 text-xs transition-all",
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
                  {allTags.map((tag) => (
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
