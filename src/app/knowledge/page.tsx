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
  id: number;
  title: string;
  content: string;
  tags: string[];
  updatedAt: string;
  inFeed: boolean;
}

interface InboxItem {
  id: string; // 真数据 UUID，与后端 store 的 id 对齐
  title: string;
  source: string;
  summary: string;
}

interface TrashItem {
  id: number;
  title: string;
  source: string;
  summary: string;
  origin: "采集" | "文章";
  daysLeft: number;
}

interface Source {
  id: number;
  name: string;
  freq: string;
  on: boolean;
}

type Section = "feed" | "notes" | "inbox" | "trash" | "sources" | "quiz" | "review";
// feed 条目的 id 是 UUID（string），note 仍是本地数字 id——两种视图模型并存，
// 等 notes 接真库后统一成 string
type DetailRef = { type: "feed"; id: string } | { type: "note"; id: number } | null;

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


const initialNotes: Note[] = [
  {
    id: 101,
    title: "从切图仔到造 Agent：我的转型路线图",
    content:
      "转型不是换工种，是换个站位。\n\n前端的优势：懂交互、懂状态、懂工程化，这些在 Agent 产品里全是硬通货。缺的是三块：模型能力的边界认知、后端和数据的补课、把「需求」翻译成「任务编排」的思维。\n\n路线图分三步：\n\n第一步，用起来。把 AI 塞进日常工作流，code review、写周报、查文档，先建立体感。\n\n第二步，造小工具。不追求产品级，追求闭环：一个能跑的 Agent，工具调用、记忆、规划都亲手摸一遍。\n\n第三步，做真项目。拿自己的知识库练手，痛点真实、需求熟悉，是最好的第一战。",
    tags: ["转型", "Agent"],
    updatedAt: "昨天 22:40",
    inFeed: true,
  },
  {
    id: 102,
    title: "笔记：RAG 检索质量排查清单（草稿）",
    content:
      "检索不准，先查这三样：\n\n1. 切片粒度：太大噪声多，太小上下文丢，先试 300-500 字符带重叠。\n\n2. 向量模型：通用向量模型在你的领域不一定好，领域词多的话考虑微调或换模型。\n\n3. 重排：召回 20 条，用重排模型筛 top 3，准确率普遍能涨一截。\n\n（待补充：混合检索 BM25 + 向量的实测数据）",
    tags: ["RAG"],
    updatedAt: "今天 10:05",
    inFeed: false,
  },
];


const initialTrash: TrashItem[] = [
  {
    id: 1,
    title: "某大厂又发布了新模型（营销稿）",
    source: "订阅源 · 昨天采集",
    summary: "通稿式内容，信息密度低，已放弃。",
    origin: "采集",
    daysLeft: 6,
  },
];

const initialSources: Source[] = [
  { id: 1, name: "技术晨报", freq: "每天 07:00", on: true },
  { id: 2, name: "前端周报", freq: "每周一 08:00", on: true },
  { id: 3, name: "AI 日报", freq: "每天 09:00", on: true },
  { id: 4, name: "个人博客圈", freq: "每天 12:00", on: false },
];

const initialAllTags = [
  "RAG",
  "核心概念",
  "Agent",
  "架构",
  "晨报",
  "前端",
  "AI",
  "Skill",
  "工具调用",
  "Vibe Coding",
  "React",
  "RSC",
  "转型",
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

  // K1 起 feed / inbox 从真库加载（初值空数组，useEffect 里拉取）；
  // notes / trash / sources 仍是 mock，等 K2+ 逐步替换
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [notes, setNotes] = useState<Note[]>(initialNotes);
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [trash, setTrash] = useState<TrashItem[]>(initialTrash);
  const [sources, setSources] = useState<Source[]>(initialSources);
  const [allTags, setAllTags] = useState<string[]>(initialAllTags);

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

  // 首屏并行拉收件箱（inbox）和知识流（kept）。
  // 用 allSettled 而不是 all：一个接口挂了另一个照常显示，不至于整页报废
  useEffect(() => {
    let alive = true; // 组件卸载后不再 setState
    (async () => {
      const [inboxRes, feedRes] = await Promise.allSettled([
        fetch("/api/knowledge?status=inbox&limit=100"),
        fetch("/api/knowledge?status=kept&limit=100"),
      ]);
      if (!alive) return;
      let failed = false;
      if (inboxRes.status === "fulfilled" && inboxRes.value.ok) {
        const data = await inboxRes.value.json();
        setInbox((data.items as KnowledgeRow[]).map(toInboxItem));
      } else {
        failed = true;
      }
      if (feedRes.status === "fulfilled" && feedRes.value.ok) {
        const data = await feedRes.value.json();
        setFeed((data.items as KnowledgeRow[]).map(toFeedItem));
      } else {
        failed = true;
      }
      if (failed) showToast("知识库加载失败，请稍后刷新重试");
      setLoadingKnowledge(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  // 文章编辑
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
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

  const restoreTrash = (item: TrashItem) => {
    if (item.origin === "采集") {
      // K1 起「放弃的采集」走 discarded 状态、不再进回收站；回收站里残留的
      // 采集条目是历史演示数据，没有真实库记录，捞回动作无从落地——
      // 明确告知，而不是造一条假数据混进已接真库的收件箱
      showToast("该条为界面演示数据，不支持捞回");
      return;
    }
    setTrash((prev) => prev.filter((t) => t.id !== item.id));
    setNotes((prev) => [
      {
        id: Date.now(),
        title: item.title,
        content: item.summary,
        tags: [],
        updatedAt: "刚刚",
        inFeed: false,
      },
      ...prev,
    ]);
  };

  const askDeleteTrash = (item: TrashItem) => {
    setConfirmState({
      title: "彻底删除？",
      desc: "删除后不可恢复。",
      okText: "彻底删除",
      onOk: () => setTrash((prev) => prev.filter((t) => t.id !== item.id)),
    });
  };

  // ----- 我的文章 -----

  const createNote = () => {
    const id = Date.now();
    setNotes((prev) => [
      { id, title: "", content: "", tags: [], updatedAt: "刚刚", inFeed: false },
      ...prev,
    ]);
    setNoteDraft({ title: "", content: "" });
    setEditingNoteId(id);
    setDetail({ type: "note", id });
  };

  const startEditNote = (note: Note) => {
    setNoteDraft({ title: note.title, content: note.content });
    setEditingNoteId(note.id);
  };

  const saveNote = (id: number) => {
    setNotes((prev) =>
      prev.map((n) =>
        n.id === id
          ? {
              ...n,
              title: noteDraft.title.trim() || "无标题文章",
              content: noteDraft.content,
              updatedAt: "刚刚",
            }
          : n,
      ),
    );
    setEditingNoteId(null);
  };

  const askDeleteNote = (note: Note) => {
    setConfirmState({
      title: "删除这篇文章？",
      desc: "文章会进回收站，7 天内可以捞回，之后彻底删除。",
      okText: "删除",
      onOk: () => {
        setNotes((prev) => prev.filter((n) => n.id !== note.id));
        // 原 mock 会按标题从知识流里删同名条目——feed 已接真库，按 title 匹配
        // 可能误删同名的真实条目；笔记与库的联动等 K2 notes 接库后统一处理
        setTrash((prev) => [
          {
            id: Date.now(),
            title: note.title,
            source: "我的文章",
            summary: note.content.slice(0, 50) || "（空文章）",
            origin: "文章",
            daysLeft: 7,
          },
          ...prev,
        ]);
        goList();
      },
    });
  };

  const toggleNoteInFeed = (note: Note) => {
    if (note.inFeed) {
      // 只翻本地演示状态：按标题从真知识流删条目会误伤同名真实数据
      setNotes((prev) =>
        prev.map((n) => (n.id === note.id ? { ...n, inFeed: false } : n)),
      );
      return;
    }
    // 「笔记加入知识流」需要把笔记写进库才有意义——K2 notes 接库后开放，
    // 现在往已接真库的 feed 塞 mock 卡片，刷新即消失还会污染列表
    showToast("笔记入库将在后续版本开放，敬请期待");
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
    if (ref.type === "feed") {
      setFeed((prev) =>
        prev.map((f) => (f.id === ref.id ? { ...f, tags } : f)),
      );
    } else {
      setNotes((prev) =>
        prev.map((n) => (n.id === ref.id ? { ...n, tags } : n)),
      );
    }
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

  const filteredFeed = searchQuery.trim()
    ? feed.filter(
        (item) =>
          item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase())),
      )
    : feed;

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
            <div className="mt-5 space-y-4">
              {currentFeed.content.split("\n\n").map((para, i) => (
                <p key={i} className="text-[15px] leading-7 text-[#2A2A2A]">
                  {para}
                </p>
              ))}
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
                  onClick={() => setEditingNoteId(null)}
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
                {currentNote.inFeed && " · 已加入知识流"}
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
              <div className="mt-5 space-y-4">
                {currentNote.content.split("\n\n").map((para, i) => (
                  <p key={i} className="text-[15px] leading-7 text-[#2A2A2A]">
                    {para}
                  </p>
                ))}
              </div>
              {/* 底部操作 */}
              <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-[#F0F0F0] pt-4">
                <button
                  onClick={() => toggleNoteInFeed(currentNote)}
                  className={cn(
                    "flex h-9 items-center gap-1.5 rounded-[2px] px-4 text-xs font-medium transition-all",
                    currentNote.inFeed
                      ? "border border-[#D9D9D9] bg-white text-[#4A4A4A] hover:border-[#000000] hover:text-black"
                      : "bg-[#000000] text-white hover:opacity-85",
                  )}
                >
                  {currentNote.inFeed ? "已在知识流 · 点击移出" : "加入知识流"}
                </button>
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
                placeholder="搜索知识流（标题 / 摘要 / 标签）"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-10 w-full rounded-[2px] border border-[#E5E5E5] bg-white pl-9 pr-3 text-sm text-[#000000] placeholder:text-[#999999] outline-none focus:border-[#000000]"
              />
            </div>
            {loadingKnowledge ? (
              <div className="rounded-[2px] border border-dashed border-[#D9D9D9] bg-white p-12 text-center">
                <p className="text-sm text-[#A0A8B4]">知识流加载中…</p>
              </div>
            ) : filteredFeed.length === 0 ? (
              <div className="rounded-[2px] border border-dashed border-[#D9D9D9] bg-white p-12 text-center">
                <p className="text-sm text-[#A0A8B4]">没有匹配的知识条目</p>
              </div>
            ) : (
              filteredFeed.map((item) => (
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
                    {item.tags.map((tag) => (
                      <span
                        key={tag}
                        className="whitespace-nowrap rounded-full bg-[#ECECEC] px-2.5 py-0.5 text-xs text-[#4A4A4A]"
                      >
                        {tag}
                      </span>
                    ))}
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
              <p className="text-xs text-[#A0A8B4]">自己写的文章，可编辑、删除、加入知识流</p>
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
                    {note.inFeed && (
                      <span className="shrink-0 rounded-full bg-[#ECECEC] px-1.5 py-0.5 text-[10px] font-medium text-[#4A4A4A]">
                        已在知识流
                      </span>
                    )}
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
              AI 已按你的口味初筛；保留进知识流，放弃进回收站（7 天后彻底删除）
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
              放弃的采集和删除的文章先进这，7 天后彻底删除，过期前都能捞回
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
