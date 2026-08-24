"use client";

import { useState } from "react";
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
  id: number;
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
  id: number;
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
type DetailRef = { type: "feed" | "note"; id: number } | null;

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

const initialFeed: FeedItem[] = [
  {
    id: 1,
    title: "RAG 是什么：先查库再回答",
    summary:
      "先把你的问题在知识库里检索一遍，命中了就直接用库里的内容回答，省 token 还不容易跑偏；没命中才去联网。",
    content:
      "RAG 的全称是 Retrieval-Augmented Generation，检索增强生成。它解决的是大模型的两个老毛病：一是模型不知道你本地的私货，二是让它硬记太贵也容易过时。\n\n核心思路很朴素：回答之前，先拿你的问题去知识库里检索一遍。命中的内容作为上下文一起塞给模型，让它照着你的料回答。这样答案有出处、可追溯，也省 token——不用把整个库都塞进 prompt。\n\n流程可以拆成三步：问题向量化 → 在库里找最相关的几段 → 把这几段和问题一起交给模型生成答案。检索质量决定了回答质量，所以切片粒度、向量模型、重排这三件事比换大模型更值得花时间。\n\n对个人知识库来说，RAG 是最实用的第一步：先把「我存的东西」变成「AI 能查的东西」，问答、写作辅助才有地基。",
    tags: ["RAG", "核心概念"],
    time: "今天 09:20",
    source: "公众号采集",
  },
  {
    id: 2,
    title: "智能体的四件套：模型 · 工具 · 记忆 · 规划",
    summary:
      "拆开讲 Agent 的组成：模型出脑力、工具出手脚、记忆管存取、规划管分步，四件配齐才算完整智能体。",
    content:
      "一个完整的 Agent 可以拆成四件套。\n\n模型是脑力，负责理解意图、生成判断，但不给它工具它就只能动嘴。工具是手脚：搜索、读写文件、调 API，Agent 的实际执行全靠工具调用。记忆管存取：短期记忆是这次对话的上下文，长期记忆是跨会话沉淀的状态和偏好，没有记忆的 Agent 每次都是失忆重来。\n\n规划管分步：把「帮我整理这周的文章」拆成筛选、归类、提炼、落盘四步，自己决定先做什么后做什么。规划能力是 Agent 和普通对话机器人的分水岭。\n\n四件套凑齐，才从「能聊」进化到「能干活」。缺哪件，补哪件。",
    tags: ["Agent", "架构"],
    time: "今天 08:45",
    source: "公众号采集",
  },
  {
    id: 3,
    title: "技术晨报 · 08-23",
    summary: "前端 + AI 圈要闻速览，AI 自动聚合生成，3 分钟读完今天值得知道的事。",
    content:
      "【前端】React 19 稳定特性盘点：Server Actions、useOptimistic 已可生产使用；Vite 7 发布，Rolldown 全面接管打包。\n\n【AI】Claude 新版本工具调用准确率提升；OpenAI 开放实时语音 API；国内开源模型在代码基准上追平闭源第一梯队。\n\n【观点】「Agent 是范式不是产品」——把 Agent 当能力长在业务里，比做一个独立 Agent 应用更有生命力。\n\n【一句话】本周值得动手：给项目加个 AI 辅助 code review 流程。",
    tags: ["晨报", "前端", "AI"],
    time: "今天 07:00",
    source: "技术晨报",
  },
  {
    id: 4,
    title: "Skill 与工具调用怎么分工",
    summary:
      "Skill 是沉淀下来的流程封装，工具调用是运行时的能力组合，前者管复用、后者管灵活，两层配合而不是互相替代。",
    content:
      "Skill 和工具调用经常被混着说，其实分工很清楚。\n\n工具调用是运行时的事：模型每一步决定调什么工具、传什么参数，灵活但每次都要现场想。Skill 是沉淀下来的流程：把「怎么做某类事」的步骤和经验封装成可复用的能力，遇到同类任务直接套用。\n\n打个前端比方：工具调用像你在控制台里手敲 DOM 操作，Skill 像你封装好的组件库。组件库不能覆盖所有场景，但常用场景它快得多、稳得多。\n\n好的 Agent 系统是两层配合：常规任务走 Skill 拿稳定性，新问题退回工具调用拿灵活性，做的过程里再沉淀新 Skill。",
    tags: ["Skill", "工具调用"],
    time: "昨天 21:10",
    source: "手动采集",
  },
  {
    id: 5,
    title: "Vibe Coding 靠不靠谱",
    summary: "结论是提效但别放手——描述清楚意图、盯住生成代码，人还是最后一道关。",
    content:
      "Vibe Coding 指的是用自然语言描述意图、让 AI 生成代码的开发方式。实测结论：提效明显，但放手不行。\n\n靠谱的部分：脚手架、样板代码、一次性脚本，AI 几分钟出的活儿顶手写半小时，改起来也快。\n\n不靠谱的部分：核心业务逻辑、边界条件、并发安全，AI 会自信地写出错的东西。你不 review，债务就悄悄欠下了。\n\n实践建议：意图描述要具体（「写一个带分页和搜索的用户列表」好过「写个列表页」）；生成代码必须过眼；复杂逻辑拆小步生成。人还是最后一道关。",
    tags: ["Vibe Coding"],
    time: "昨天 18:30",
    source: "手动采集",
  },
  {
    id: 6,
    title: "React Server Components 实践备忘",
    summary:
      "RSC 的心智模型：组件默认跑在服务端，加 'use client' 才下放到浏览器，边界划清楚就不绕。",
    content:
      "RSC 的心智模型一句话：组件默认跑在服务端，标了 'use client' 的才下放到浏览器跑。\n\n服务端组件可以直接访问数据库和文件系统、不打包进 bundle、渲染结果序列化后发给浏览器。客户端组件才能用 state、effect、事件监听。\n\n实践要点：边界尽量下推——能不改交互的组件都留在服务端；把交互集中在叶子节点（按钮、输入框），容器保持服务端渲染。props 跨边界传数据时注意可序列化，函数传不过去。\n\n一句话：'use client' 是一道边界声明，不是性能优化指令。",
    tags: ["React", "RSC"],
    time: "2 天前",
    source: "手动采集",
  },
];

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

  const [feed, setFeed] = useState<FeedItem[]>(initialFeed);
  const [notes, setNotes] = useState<Note[]>(initialNotes);
  const [inbox, setInbox] = useState<InboxItem[]>(initialInbox);
  const [trash, setTrash] = useState<TrashItem[]>(initialTrash);
  const [sources, setSources] = useState<Source[]>(initialSources);
  const [allTags, setAllTags] = useState<string[]>(initialAllTags);

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

  const keepItem = (item: InboxItem) => {
    setInbox((prev) => prev.filter((i) => i.id !== item.id));
    setFeed((prev) => [
      {
        id: Date.now(),
        title: item.title,
        summary: item.summary.replace(/^AI 摘要：/, ""),
        content: `「${item.title}」的正文内容。\n\nAgent 接入后，这里会展示采集到的原文（或抓取失败时的摘要全文）。当前为布局演示段落，用于确认详情页的阅读排版：字号、行高、段距、标签行和底部操作的摆放。\n\n保留动作会把条目插入知识流顶部，并带上「刚刚入库」标记，方便确认拍板链路是通的。`,
        tags: [],
        time: "刚刚入库",
        source: item.source.split(" · ")[0],
        fresh: true,
      },
      ...prev,
    ]);
  };

  const dropItem = (item: InboxItem) => {
    setInbox((prev) => prev.filter((i) => i.id !== item.id));
    setTrash((prev) => [
      {
        id: Date.now(),
        title: item.title,
        source: item.source,
        summary: item.summary,
        origin: "采集",
        daysLeft: 7,
      },
      ...prev,
    ]);
  };

  const handleCapture = () => {
    const text = captureInput.trim();
    if (!text) return;
    setCaptureInput("");
    setInbox((prev) => [
      {
        id: Date.now(),
        title: text.length > 30 ? `${text.slice(0, 30)}…` : text,
        source: "手动采集 · 刚刚",
        summary: "Agent 接入后将自动生成这条内容的摘要与标签建议。",
      },
      ...prev,
    ]);
  };

  // ----- 回收站 -----

  const restoreTrash = (item: TrashItem) => {
    setTrash((prev) => prev.filter((t) => t.id !== item.id));
    if (item.origin === "采集") {
      setInbox((prev) => [
        {
          id: Date.now(),
          title: item.title,
          source: item.source,
          summary: item.summary,
        },
        ...prev,
      ]);
    } else {
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
    }
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
        setFeed((prev) => prev.filter((f) => f.title !== note.title));
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
      setNotes((prev) =>
        prev.map((n) => (n.id === note.id ? { ...n, inFeed: false } : n)),
      );
      setFeed((prev) => prev.filter((f) => f.title !== note.title));
      return;
    }
    setNotes((prev) =>
      prev.map((n) => (n.id === note.id ? { ...n, inFeed: true } : n)),
    );
    setFeed((prev) => [
      {
        id: Date.now(),
        title: note.title,
        summary: note.content.split("\n")[0].slice(0, 80) || "（正文为空）",
        content: note.content,
        tags: note.tags,
        time: "刚刚入库",
        source: "我的文章",
        fresh: true,
      },
      ...prev,
    ]);
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
            {filteredFeed.length === 0 ? (
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
                disabled={!captureInput.trim()}
                className="h-10 shrink-0 rounded-[2px] bg-[#000000] px-4 text-sm font-medium text-white transition-opacity hover:opacity-85 disabled:opacity-30"
              >
                丢进来
              </button>
            </div>
            <p className="flex items-center gap-1.5 px-1 text-xs text-[#A0A8B4]">
              <Sparkles className="h-3.5 w-3.5" />
              AI 已按你的口味初筛；保留进知识流，放弃进回收站（7 天后彻底删除）
            </p>
            {inbox.length === 0 ? (
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
                      className="flex h-8 items-center gap-1.5 rounded-[2px] border border-[#D9D9D9] bg-white px-3 text-xs font-medium text-[#4A4A4A] transition-colors hover:border-[#000000] hover:text-black"
                    >
                      <X className="h-3.5 w-3.5" />
                      放弃
                    </button>
                    <button
                      onClick={() => keepItem(item)}
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
            <div>
              <h2 className="text-lg font-semibold text-black">自测</h2>
              <p className="mt-1 text-xs text-[#A0A8B4]">
                拿库内内容出题考你，配遗忘曲线，是学习闭环的关键一环
              </p>
            </div>

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
            <div>
              <h2 className="text-lg font-semibold text-black">回顾</h2>
              <p className="mt-1 text-xs text-[#A0A8B4]">
                AI 主动喂给你：今天干了啥，哪些该复习，一周沉淀了什么
              </p>
            </div>

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
