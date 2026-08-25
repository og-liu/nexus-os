"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Plus,
  Send,
  ArrowLeft,
  Bot,
  Zap,
  Loader2,
  Clock3,
  ImageIcon,
  Mic,
  Trash2,
  X,
  Pencil,
  Brain,
  ChevronDown,
  Check,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { MODELS, DEFAULT_MODEL_ID, getModelMeta } from "@/lib/models";
import { PageHeader } from "@/components/page-header";
import { Toast, type ToastData, type ToastType } from "@/components/toast";

// ---------- Web Speech API 类型（lib.dom 未收录，局部声明） ----------

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  length: number;
  0: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionResultListLike {
  length: number;
  [index: number]: SpeechRecognitionResultLike;
}

interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultListLike;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: Event) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

// ---------- 类型 ----------

// 工具调用状态
interface ToolCallEvent {
  callId: string;
  toolName: string;
  args: Record<string, unknown>;
  status: "running" | "success" | "error";
  result?: unknown;
  error?: string;
}

// 单条消息的 token 用量（与后端 loop.ts 的 TokenUsage 对齐）
interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  images?: string[];
  reasoning?: string;
  toolCalls?: ToolCallEvent[];
  usage?: TokenUsage;
  created_at?: number;
}

interface SessionMeta {
  id: string;
  title: string;
  updated_at: number;
}

interface AgentTask {
  id: number;
  name: string;
  schedule: string;
  status: "running" | "queued";
  progress: number;
}

const tasks: AgentTask[] = [
  {
    id: 1,
    name: "每周文章精选",
    schedule: "每周五 18:00",
    status: "running",
    progress: 68,
  },
  {
    id: 2,
    name: "知识库增量索引",
    schedule: "每小时",
    status: "running",
    progress: 32,
  },
  {
    id: 3,
    name: "下载目录自动清理",
    schedule: "每天 09:00",
    status: "queued",
    progress: 0,
  },
];

const LAST_SESSION_KEY = "nexus-os:agent:last-session";
const THINKING_PREFIX = "nexus-os:agent:thinking:";
const MODEL_PREFIX = "nexus-os:agent:model:";
const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 单张 5MB
// 会话消息分页：一次加载 50 条，往上滚才加载更早的（与后端 PAGE_SIZE 保持一致）
const PAGE_SIZE = 50;

function loadModel(id: string): string {
  try {
    const raw = window.localStorage.getItem(MODEL_PREFIX + id);
    if (raw && MODELS.some((m) => m.id === raw)) {
      return raw;
    }
  } catch {
    // 忽略，回落默认
  }
  return DEFAULT_MODEL_ID;
}

function saveModel(id: string, model: string) {
  try {
    window.localStorage.setItem(MODEL_PREFIX + id, model);
  } catch {
    // 忽略存储失败
  }
}

type ThinkingEffort = "low" | "high" | "max";

function loadThinking(modelId: string): {
  enabled: boolean;
  effort: ThinkingEffort;
} {
  try {
    const raw = window.localStorage.getItem(THINKING_PREFIX + modelId);
    if (raw) {
      const parsed = JSON.parse(raw) as { enabled?: boolean; effort?: string };
      return {
        enabled: parsed.enabled === true,
        effort:
          parsed.effort === "high" || parsed.effort === "max"
            ? parsed.effort
            : "low",
      };
    }
  } catch {
    // 忽略解析失败，回落默认
  }
  return { enabled: false, effort: "low" };
}

function saveThinking(
  modelId: string,
  enabled: boolean,
  effort: ThinkingEffort,
) {
  try {
    window.localStorage.setItem(
      THINKING_PREFIX + modelId,
      JSON.stringify({ enabled, effort }),
    );
  } catch {
    // 忽略存储失败
  }
}

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const min = 60 * 1000;
  const hour = 60 * min;
  const day = 24 * hour;
  if (diff < min) return "刚刚";
  if (diff < hour) return `${Math.floor(diff / min)} 分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`;
  if (diff < 2 * day) return "昨天";
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// 把 token 数格式化成可读短格式：1200 → 1.2k；小于 1000 直接显示
function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

// 把后端返回的消息行转成前端 Message（解析 images / tool_calls / usage；保留 created_at 用作分页游标）
function rowToMessage(m: {
  id: string;
  role: "user" | "assistant";
  content: string;
  images?: string | null;
  tool_calls?: string | null;
  reasoning?: string | null;
  usage?: string | null;
  created_at?: number;
}): Message {
  let images: string[] | undefined;
  if (m.images) {
    try {
      images = JSON.parse(m.images) as string[];
    } catch {
      images = undefined;
    }
  }
  let toolCalls: ToolCallEvent[] | undefined;
  if (m.tool_calls) {
    try {
      toolCalls = JSON.parse(m.tool_calls) as ToolCallEvent[];
    } catch {
      toolCalls = undefined;
    }
  }
  let usage: TokenUsage | undefined;
  if (m.usage) {
    try {
      usage = JSON.parse(m.usage) as TokenUsage;
    } catch {
      usage = undefined;
    }
  }
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    images,
    toolCalls,
    reasoning: m.reasoning ?? undefined,
    usage,
    created_at: m.created_at,
  };
}

// ---------- 工具调用展示组件（紧凑折叠式） ----------

function ToolCallsBlock({ toolCalls }: { toolCalls: ToolCallEvent[] }) {
  const [open, setOpen] = useState(false);
  const running = toolCalls.some((tc) => tc.status === "running");
  const hasError = toolCalls.some(
    (tc) => tc.status === "error" || (tc.result as Record<string, unknown> | undefined)?.error,
  );

  // 按工具类型分组
  const weatherCalls = toolCalls.filter((tc) => tc.toolName === "get_weather");
  const searchCalls = toolCalls.filter((tc) => tc.toolName === "web_search");

  const icon = running ? (
    <Loader2 className="h-3 w-3 animate-spin" />
  ) : hasError ? (
    <XCircle className="h-3 w-3 text-[#FF9500]" />
  ) : (
    <CheckCircle2 className="h-3 w-3 text-[#34C759]" />
  );

  // 生成摘要文字
  let summary = "";
  if (weatherCalls.length > 0) {
    const cities = weatherCalls.map((tc) => String(tc.args.city ?? "")).filter(Boolean);
    const label =
      cities.length > 3
        ? `${cities.slice(0, 3).join("、")}等${cities.length}个城市`
        : cities.join("、");
    summary += `🌤 查询天气 ${running && weatherCalls.some((tc) => tc.status === "running") ? `「${cities[cities.length - 1] ?? ""}」…` : label ? `· ${label}` : ""}`;
  }
  if (searchCalls.length > 0) {
    if (summary) summary += "  ";
    const queries = searchCalls.map((tc) => String(tc.args.query ?? "")).filter(Boolean);
    const lastQuery = queries[queries.length - 1] ?? "";
    const searchRunning = searchCalls.some((tc) => tc.status === "running");
    if (searchRunning) {
      summary += `🔍 正在搜索「${lastQuery}」…`;
    } else {
      const totalResults = searchCalls.reduce((sum, tc) => {
        const r = tc.result as Record<string, unknown> | undefined;
        return sum + (typeof r?.total === "number" ? r.total : 0);
      }, 0);
      summary += `🔍 搜索${searchCalls.length > 1 ? ` ${searchCalls.length} 次` : ""}${totalResults > 0 ? ` · ${totalResults} 条结果` : ""}`;
    }
  }

  return (
    <div className="mb-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs text-[#8A8A8A] transition-colors hover:text-[#1F1F1F]"
      >
        {icon}
        <span>{summary}</span>
        <ChevronDown className={cn("h-3 w-3 transition-transform", !open && "-rotate-90")} />
      </button>
      {open ? (
        <div className="mt-1 flex flex-col gap-1 pl-4">
          {/* 天气详情 */}
          {weatherCalls.map((tc) => {
            const r = tc.result as Record<string, unknown> | undefined;
            const isFailed = tc.status === "error" || r?.error;
            return (
              <div key={tc.callId} className="flex items-center gap-1.5 text-xs leading-relaxed text-[#6B6B6B]">
                {tc.status === "running" ? (
                  <Loader2 className="h-2.5 w-2.5 shrink-0 animate-spin text-[#A0A8B4]" />
                ) : isFailed ? (
                  <XCircle className="h-2.5 w-2.5 shrink-0 text-[#FF9500]" />
                ) : (
                  <CheckCircle2 className="h-2.5 w-2.5 shrink-0 text-[#34C759]" />
                )}
                <span className="shrink-0 text-[#1F1F1F]">{String(tc.args.city ?? "")}</span>
                <span className="text-[#A0A8B4]">·</span>
                <span className="truncate">
                  {isFailed
                    ? tc.error ?? String(r?.error ?? "查询失败")
                    : `${r?.condition ?? ""} ${r?.temp ?? "?"}°C`}
                </span>
              </div>
            );
          })}
          {/* 搜索详情 */}
          {searchCalls.map((tc) => {
            const r = tc.result as Record<string, unknown> | undefined;
            const isFailed = tc.status === "error" || r?.error;
            const results = (r?.results as Array<Record<string, unknown>> | undefined) ?? [];
            return (
              <div key={tc.callId} className="py-0.5">
                <div className="flex items-center gap-1.5 text-xs text-[#6B6B6B]">
                  {tc.status === "running" ? (
                    <Loader2 className="h-2.5 w-2.5 shrink-0 animate-spin text-[#A0A8B4]" />
                  ) : isFailed ? (
                    <XCircle className="h-2.5 w-2.5 shrink-0 text-[#FF9500]" />
                  ) : (
                    <CheckCircle2 className="h-2.5 w-2.5 shrink-0 text-[#34C759]" />
                  )}
                  <span className="text-[#1F1F1F]">{String(tc.args.query ?? "")}</span>
                  {!tc.status || isFailed ? null : (
                    <span className="text-[#A0A8B4]">· {results.length} 条</span>
                  )}
                </div>
                {results.length > 0 && (
                  <div className="mt-0.5 flex flex-col gap-0.5 pl-4">
                    {results.slice(0, 4).map((item, i) => (
                      <a
                        key={i}
                        href={String(item.url ?? "#")}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-start gap-1 text-[11px] leading-relaxed text-[#6B6B6B] hover:text-[#007AFF]"
                      >
                        <span className="shrink-0 text-[#A0A8B4]">{i + 1}.</span>
                        <span className="truncate">{String(item.title ?? "")}</span>
                      </a>
                    ))}
                    {results.length > 4 && (
                      <span className="pl-4 text-[11px] text-[#A0A8B4]">
                        等 {results.length} 条结果
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

// ---------- 页面 ----------

export default function AgentPage() {
  const [chats, setChats] = useState<SessionMeta[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  // 手机端视图切换：list=会话列表，chat=对话。md 及以上双栏常驻，不受此影响
  const [mobileView, setMobileView] = useState<"list" | "chat">("list");
  const [inputValue, setInputValue] = useState("");
  // 待发送图片（base64 data URL 列表：既做预览，发送时原样带上）
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [toast, setToast] = useState<ToastData | null>(null);
  const [thinkingEnabled, setThinkingEnabled] = useState(false);
  const [thinkingEffort, setThinkingEffort] = useState<ThinkingEffort>("low");
  const [openReasoning, setOpenReasoning] = useState<Set<string>>(new Set());
  const [modelId, setModelId] = useState<string>(DEFAULT_MODEL_ID);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const supportsThinking = getModelMeta(modelId)?.supportsThinking ?? false;
  const supportsVision = getModelMeta(modelId)?.supportsVision ?? false;
  const [deleteTarget, setDeleteTarget] = useState<SessionMeta | null>(null);
  const [renameTarget, setRenameTarget] = useState<SessionMeta | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  // 分页：当前已加载的消息之上是否还有更早的
  const [hasMore, setHasMore] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const baseTextRef = useRef("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const sendingRef = useRef(false);
  // 消息滚动容器（分页加载、贴底跟随都基于它）
  const scrollRef = useRef<HTMLDivElement>(null);
  // 是否正在加载更早的消息（防止滚动时重复触发）
  const loadingOlderRef = useRef(false);
  // 当前是否贴在底部：贴底时新消息自动跟随滚动，往上翻看时不打扰
  const stickToBottomRef = useRef(true);
  // 即将在顶部插入更早的消息（用于保持视口位置不跳动）
  const prependingRef = useRef(false);
  // 插入前记录的滚动总高度（插入后用它把视口“顶”回原位）
  const prevScrollHeightRef = useRef(0);

  const activeChat = chats.find((c) => c.id === activeChatId);

  const showToast = (text: string, type: ToastType = "info") => {
    setToast({ id: Date.now(), text, type });
  };

  // 兼容旧调用：默认信息提示
  const showHint = (text: string) => showToast(text);

  const toggleThinking = () => {
    const next = !thinkingEnabled;
    setThinkingEnabled(next);
    saveThinking(modelId, next, thinkingEffort);
  };

  const setEffort = (effort: ThinkingEffort) => {
    setThinkingEffort(effort);
    saveThinking(modelId, thinkingEnabled, effort);
  };

  const selectModel = (m: string) => {
    if (isLoading) return;
    setModelId(m);
    setModelMenuOpen(false);
    if (activeChatId) saveModel(activeChatId, m);
    // 恢复该模型自己的深度思考偏好（各模型互不影响，新旧对话一致）
    const saved = loadThinking(m);
    setThinkingEnabled(saved.enabled);
    setThinkingEffort(saved.effort);
    // 切到不支持看图的模型时，清空待发送图片
    if (getModelMeta(m)?.supportsVision === false && pendingImages.length > 0) {
      setPendingImages([]);
      showToast("当前模型不支持看图，已移除待发送图片", "warn");
    }
  };

  const toggleReasoning = (id: string) => {
    setOpenReasoning((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ---------- 会话加载 ----------

  const loadSessions = useCallback(async () => {
    const res = await fetch("/api/sessions");
    const data = (await res.json()) as { sessions?: SessionMeta[] };
    const list = data.sessions ?? [];
    setChats(list);
    return list;
  }, []);

  const selectChat = useCallback(async (id: string) => {
    setActiveChatId(id);
    window.localStorage.setItem(LAST_SESSION_KEY, id);
    setMobileView("chat");
    const mid = loadModel(id);
    const saved = loadThinking(mid);
    setThinkingEnabled(saved.enabled);
    setThinkingEffort(saved.effort);
    setModelId(mid);
    const res = await fetch(`/api/sessions/${id}?limit=${PAGE_SIZE}`);
    const data = (await res.json()) as {
      messages?: Array<{
        id: string;
        role: "user" | "assistant";
        content: string;
        images?: string | null;
        tool_calls?: string | null;
        reasoning?: string | null;
        usage?: string | null;
        created_at?: number;
      }>;
      hasMore?: boolean;
    };
    setMessages((data.messages ?? []).map(rowToMessage));
    setHasMore(!!data.hasMore);
    loadingOlderRef.current = false;
    stickToBottomRef.current = true; // 打开会话默认贴底
  }, []);

  // 往上滚加载更早的消息（分页）
  const loadOlder = async () => {
    if (!activeChatId || !hasMore || loadingOlderRef.current) return;
    const oldest = messages[0];
    if (!oldest?.created_at) return;
    loadingOlderRef.current = true;
    try {
      const res = await fetch(
        `/api/sessions/${activeChatId}?limit=${PAGE_SIZE}&before=${oldest.created_at}`,
      );
      const data = (await res.json()) as {
        messages?: Array<{
          id: string;
          role: "user" | "assistant";
          content: string;
          images?: string | null;
          tool_calls?: string | null;
          reasoning?: string | null;
          usage?: string | null;
          created_at?: number;
        }>;
        hasMore?: boolean;
      };
      const older = (data.messages ?? []).map(rowToMessage);
      setHasMore(!!data.hasMore);
      if (older.length > 0) {
        const el = scrollRef.current;
        if (el) prevScrollHeightRef.current = el.scrollHeight;
        prependingRef.current = true;
        setMessages((prev) => [...older, ...prev]);
      }
    } finally {
      loadingOlderRef.current = false;
    }
  };

  const newChat = () => {
    setActiveChatId(null);
    setMessages([]);
    setHasMore(false);
    window.localStorage.removeItem(LAST_SESSION_KEY);
    setOpenReasoning(new Set());
    // 切回默认模型，并恢复它自己的深度思考偏好
    const mid = DEFAULT_MODEL_ID;
    const saved = loadThinking(mid);
    setThinkingEnabled(saved.enabled);
    setThinkingEffort(saved.effort);
    setModelId(mid);
    setMobileView("chat");
  };

  const deleteChat = async () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setIsDeleting(true);
    try {
      await fetch(`/api/sessions/${id}`, { method: "DELETE" });
      if (activeChatId === id) {
        setActiveChatId(null);
        setMessages([]);
        window.localStorage.removeItem(LAST_SESSION_KEY);
      }
      setDeleteTarget(null);
      await loadSessions();
    } finally {
      setIsDeleting(false);
    }
  };

  const submitRename = async () => {
    if (!renameTarget) return;
    const title = renameValue.trim();
    if (!title) {
      showHint("标题不能为空");
      return;
    }
    setIsRenaming(true);
    try {
      await fetch(`/api/sessions/${renameTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      setRenameTarget(null);
      await loadSessions();
    } finally {
      setIsRenaming(false);
    }
  };

  useEffect(() => {
    loadSessions().then((list) => {
      const last = window.localStorage.getItem(LAST_SESSION_KEY);
      if (last && list.some((c) => c.id === last)) {
        selectChat(last);
      }
    });
  }, [loadSessions, selectChat]);

  // 消息变化时的滚动处理：
  // - 刚在顶部插入了更早的消息（预加载）→ 保持视口位置不跳动
  // - 否则若当前贴着底部 → 跟随到最底（发新消息 / 流式输出时）
  // - 用户往上翻看时（不贴底）→ 不打扰
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (prependingRef.current) {
      el.scrollTop += el.scrollHeight - prevScrollHeightRef.current;
      prependingRef.current = false;
      return;
    }
    if (stickToBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  // 组件卸载时停止录音
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
    };
  }, []);

  // ---------- 语音输入（Web Speech API） ----------

  const toggleVoice = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }
    const Ctor =
      (window as unknown as Record<string, unknown>)
        .SpeechRecognition ??
      (window as unknown as Record<string, unknown>)
        .webkitSpeechRecognition;
    if (!Ctor) {
      showHint("当前浏览器不支持语音输入，建议使用 Chrome 或 Edge");
      return;
    }
    const recognition = new (Ctor as new () => SpeechRecognitionLike)();
    recognition.lang = "zh-CN";
    recognition.continuous = true;
    recognition.interimResults = true;
    baseTextRef.current = inputValue;

    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalText += result[0].transcript;
        } else {
          interimText += result[0].transcript;
        }
      }
      const base = baseTextRef.current;
      if (finalText) baseTextRef.current = base + finalText;
      setInputValue(baseTextRef.current + interimText);
    };
    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };
    recognition.onerror = () => {
      showHint("语音识别失败，请检查麦克风权限后重试");
      setIsListening(false);
      recognitionRef.current = null;
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
      setIsListening(true);
    } catch {
      showHint("语音识别启动失败，请重试");
    }
  };

  // ---------- 图片选择 ----------

  const handleImageSelect = (files: FileList | null) => {
    if (!files) return;
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (list.length === 0) return;

    const room = MAX_IMAGES - pendingImages.length;
    if (room <= 0) {
      showHint(`最多上传 ${MAX_IMAGES} 张图片`);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    const picked = list.slice(0, room);
    if (picked.length < list.length) {
      showHint(`超出限制，本次仅保留前 ${picked.length} 张`);
    }

    for (const file of picked) {
      if (file.size > MAX_IMAGE_BYTES) {
        showHint("单张图片不能超过 5MB");
        continue;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = typeof reader.result === "string" ? reader.result : "";
        if (dataUrl) setPendingImages((prev) => [...prev, dataUrl]);
      };
      reader.readAsDataURL(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removePendingImage = (url: string) => {
    setPendingImages((prev) => prev.filter((u) => u !== url));
  };

  // ---------- 发送 ----------

  const handleSend = async () => {
    const text = inputValue.trim();
    if (!text && pendingImages.length === 0) return;
    if (sendingRef.current) return;
    sendingRef.current = true;

    const images = pendingImages.length > 0 ? [...pendingImages] : undefined;
    setInputValue("");
    setPendingImages([]);

    // 本地先 push 用户消息 + 空白的助手占位消息
    const userMsg: Message = {
      id: `tmp-u-${Date.now()}`,
      role: "user",
      content: text,
      images,
    };
    const assistantMsgId = `tmp-a-${Date.now()}`;
    stickToBottomRef.current = true; // 发新消息时强制跟随到最底
    setMessages((prev) => [
      ...prev,
      userMsg,
      { id: assistantMsgId, role: "assistant", content: "" },
    ]);
    // 思考过程默认展开：新消息一开始就处于展开态，思考流式增长时用户直接可见
    setOpenReasoning((prev) => {
      const next = new Set(prev);
      next.add(assistantMsgId);
      return next;
    });
    setIsLoading(true);

    let finalSessionId = activeChatId;
    let finalTitle = activeChat?.title ?? "新会话";

    // 空闲超时：60 秒没有新数据就中止，避免卡死锁着发送键
    const controller = new AbortController();
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    const resetIdle = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => controller.abort(), 60_000);
    };
    resetIdle();

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: text,
          sessionId: activeChatId,
          model: modelId,
          thinking: { enabled: thinkingEnabled, effort: thinkingEffort },
          images,
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`请求失败：${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        resetIdle();
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const payload = trimmed.slice(5).trim();
          try {
            const obj = JSON.parse(payload) as {
              type: "delta" | "reasoning" | "error" | "done" | "tool_call" | "tool_result" | "tool_error";
              content?: string;
              message?: string;
              sessionId?: string;
              title?: string;
              toolName?: string;
              args?: Record<string, unknown>;
              callId?: string;
              result?: unknown;
              error?: string;
              usage?: TokenUsage;
            };
            if (obj.type === "reasoning" && obj.content) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? { ...m, reasoning: (m.reasoning ?? "") + obj.content }
                    : m,
                ),
              );
            } else if (obj.type === "delta" && obj.content) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? { ...m, content: m.content + obj.content }
                    : m,
                ),
              );
            } else if (obj.type === "tool_call" && obj.callId && obj.toolName) {
              // 模型决定调用工具
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? {
                        ...m,
                        toolCalls: [
                          ...(m.toolCalls ?? []),
                          {
                            callId: obj.callId!,
                            toolName: obj.toolName!,
                            args: obj.args ?? {},
                            status: "running" as const,
                          },
                        ],
                      }
                    : m,
                ),
              );
            } else if (obj.type === "tool_result" && obj.callId) {
              // 工具执行成功
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? {
                        ...m,
                        toolCalls: (m.toolCalls ?? []).map((tc) =>
                          tc.callId === obj.callId
                            ? { ...tc, status: "success" as const, result: obj.result }
                            : tc,
                        ),
                      }
                    : m,
                ),
              );
            } else if (obj.type === "tool_error" && obj.callId) {
              // 工具执行失败
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? {
                        ...m,
                        toolCalls: (m.toolCalls ?? []).map((tc) =>
                          tc.callId === obj.callId
                            ? { ...tc, status: "error" as const, error: obj.error }
                            : tc,
                        ),
                      }
                    : m,
                ),
              );
            } else if (obj.type === "error") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? { ...m, content: obj.message ?? "出错了，请重试" }
                    : m,
                ),
              );
            } else if (obj.type === "done") {
              if (obj.sessionId) finalSessionId = obj.sessionId;
              if (obj.title) finalTitle = obj.title;
              if (obj.usage) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsgId ? { ...m, usage: obj.usage } : m,
                  ),
                );
              }
            }
          } catch {
            // 忽略无法解析的行
          }
        }
      }

      if (finalSessionId) {
        setActiveChatId(finalSessionId);
        window.localStorage.setItem(LAST_SESSION_KEY, finalSessionId);
        saveThinking(modelId, thinkingEnabled, thinkingEffort);
        saveModel(finalSessionId, modelId);
      }
      await loadSessions();
    } catch (err) {
      if ((err as Error)?.name === "AbortError") {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? { ...m, content: "请求超时，可能网络或服务端卡住了，请重试" }
              : m,
          ),
        );
        showToast("请求超时，请重试", "error");
      } else {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? { ...m, content: "网络错误，请稍后重试" }
              : m,
          ),
        );
        showToast("发送失败，请检查服务是否启动并已填写 DEEPSEEK_API_KEY", "error");
      }
    } finally {
      if (idleTimer) clearTimeout(idleTimer);
      sendingRef.current = false;
      setIsLoading(false);
    }
  };

  const canSend =
    (inputValue.trim().length > 0 || pendingImages.length > 0) && !isLoading;

  return (
    <>
      <PageHeader
        title="Agent"
        description="智能助手，理解需求、调用工具、执行复杂任务"
      />

      {/* 双栏骨架：PC 左栏+对话区常驻；手机按 mobileView 二选一 */}
      <div className="flex h-[calc(100%-4rem)]">
        {/* 左栏：会话列表 + Agent 任务 */}
        <div
          className={cn(
            "w-full shrink-0 flex-col overflow-y-auto border-r border-[#E5E5E5] bg-[#F5F5F5] lg:flex lg:w-[260px]",
            mobileView === "list" ? "flex" : "hidden",
          )}
        >
          {/* 新对话 */}
          <div className="p-3">
            <button
              onClick={newChat}
              className="flex w-full items-center justify-center gap-2 rounded-[2px] bg-[#000000] px-3 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-85"
            >
              <Plus className="h-4 w-4" />
              新对话
            </button>
          </div>

          {/* 会话列表 */}
          <nav className="flex-1 space-y-0.5 px-3">
            {chats.length === 0 && (
              <p className="px-3 py-4 text-center text-xs text-[#A0A8B4]">
                还没有会话，点击上方「新对话」开始
              </p>
            )}
            {chats.map((chat) => (
              <div
                key={chat.id}
                onClick={() => selectChat(chat.id)}
                className={cn(
                  "group flex w-full cursor-pointer flex-col gap-0.5 rounded-[2px] px-3 py-2.5 text-left transition-colors",
                  activeChatId === chat.id
                    ? "bg-[#d5e3f6]"
                    : "hover:bg-[#ededed]",
                )}
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-black">
                    {chat.title}
                  </span>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      aria-label="重命名会话"
                      onClick={(e) => {
                        e.stopPropagation();
                        setRenameTarget(chat);
                        setRenameValue(chat.title);
                      }}
                      className="hidden h-5 w-5 items-center justify-center rounded-[2px] text-[#A0A8B4] transition-colors hover:text-[#000000] group-hover:flex"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      aria-label="删除会话"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget(chat);
                      }}
                      className="hidden h-5 w-5 shrink-0 items-center justify-center rounded-[2px] text-[#A0A8B4] transition-colors hover:text-[#000000] group-hover:flex"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <span className="text-xs text-[#8A8A8A]">
                  {formatRelativeTime(chat.updated_at)}
                </span>
              </div>
            ))}
          </nav>

          {/* Agent 任务（辅助区） */}
          <div className="border-t border-[#E5E5E5] p-3">
            <div className="mb-2 flex items-center gap-1.5 px-1 text-xs font-medium text-[#A0A8B4]">
              <Zap className="h-3 w-3" />
              Agent 任务
            </div>
            <div className="space-y-2">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className="rounded-[2px] bg-white px-3 py-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[13px] font-medium text-black">
                      {task.name}
                    </span>
                    <span
                      className={cn(
                        "flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                        task.status === "running"
                          ? "bg-[#000000] text-white"
                          : "bg-[#ECECEC] text-[#8A8A8A]",
                      )}
                    >
                      {task.status === "running" ? (
                        <Loader2 className="h-2.5 w-2.5 animate-spin" />
                      ) : (
                        <Clock3 className="h-2.5 w-2.5" />
                      )}
                      {task.status === "running" ? "运行中" : "已排队"}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2 text-[11px] text-[#A0A8B4]">
                    <span className="shrink-0">{task.schedule}</span>
                    {task.status === "running" && (
                      <div className="h-1 flex-1 overflow-hidden rounded-full bg-[#ECECEC]">
                        <div
                          className="h-full rounded-full bg-[#000000]"
                          style={{ width: `${task.progress}%` }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 右侧：对话区 */}
        <div
          className={cn(
            "min-w-0 flex-1 flex-col bg-[#ECECEC] lg:flex",
            mobileView === "chat" ? "flex" : "hidden",
          )}
        >
          {/* 对话标题条：手机端带返回按钮 */}
          <div className="flex h-12 shrink-0 items-center gap-2 border-b border-[#E5E5E5] bg-white px-3 md:px-4">
            <button
              aria-label="返回会话列表"
              onClick={() => setMobileView("list")}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[2px] text-[#666666] transition-colors hover:bg-[#ECECEC] hover:text-[#000000] lg:hidden"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <span className="truncate text-sm font-medium text-black">
              {activeChat?.title ?? "新会话"}
            </span>
          </div>

          {/* 消息流 */}
          <div
            ref={scrollRef}
            onScroll={(e) => {
              const el = e.currentTarget;
              // 是否贴底（距底部 80px 内算贴底）：决定新消息要不要自动跟随
              stickToBottomRef.current =
                el.scrollHeight - el.scrollTop - el.clientHeight < 80;
              // 快到顶部且还有更早的消息 → 预加载上一页
              if (el.scrollTop < 80) loadOlder();
            }}
            className="flex-1 overflow-y-auto px-4 py-4 md:px-6 md:py-6"
          >
            {messages.length === 0 ? (
              // 默认新会话空界面
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-[2px] bg-[#000000]">
                  <Bot className="h-6 w-6 text-white" />
                </div>
                <p className="text-sm font-medium text-[#1F1F1F]">
                  开始和 Agent 对话吧
                </p>
                <p className="max-w-xs text-xs leading-relaxed text-[#A0A8B4]">
                  问它任何问题，它会记住当前对话的上下文，并随着对话推进持续回答。
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-5">
                {messages.map((msg) =>
                  msg.role === "assistant" ? (
                    <div key={msg.id} className="flex items-start gap-2.5">
                      <div className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-[2px] bg-[#000000] sm:flex">
                        <Bot className="h-4.5 w-4.5 text-white" />
                      </div>
                      <div className="min-w-0 break-words rounded-[2px] bg-white px-4 py-3 text-sm leading-relaxed text-[#1F1F1F]">
                        {msg.reasoning ? (
                          <div className="mb-2">
                            <button
                              onClick={() => toggleReasoning(msg.id)}
                              className="flex items-center gap-1 rounded-[2px] text-xs text-[#8A8A8A] transition-colors hover:text-[#000000]"
                            >
                              <ChevronDown
                                className={cn(
                                  "h-3.5 w-3.5 transition-transform",
                                  !openReasoning.has(msg.id) && "-rotate-90",
                                )}
                              />
                              思考过程
                            </button>
                            {openReasoning.has(msg.id) && (
                              <div className="mt-1.5 whitespace-pre-wrap break-words rounded-[2px] bg-[#F5F5F5] px-3 py-2 text-xs leading-relaxed text-[#8A8A8A]">
                                {msg.reasoning}
                              </div>
                            )}
                          </div>
                        ) : null}
                        {msg.toolCalls && msg.toolCalls.length > 0 ? (
                          <ToolCallsBlock toolCalls={msg.toolCalls} />
                        ) : null}
                        {msg.content ? (
                          <div className="markdown-body">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {msg.content}
                            </ReactMarkdown>
                          </div>
                        ) : msg.toolCalls?.some((tc) => tc.status === "running") ? null : (
                          <Loader2 className="h-4 w-4 animate-spin text-[#A0A8B4]" />
                        )}
                        {msg.usage ? (
                          <div className="mt-2 flex items-center gap-1.5 border-t border-[#F0F0F0] pt-1.5 text-[11px] text-[#A0A8B4]">
                            <Zap className="h-3 w-3 shrink-0" />
                            <span>
                              本轮 {formatTokens(msg.usage.totalTokens)} tokens · 输入 {formatTokens(msg.usage.promptTokens)} / 输出 {formatTokens(msg.usage.completionTokens)}
                            </span>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <div key={msg.id} className="flex flex-col items-end gap-1.5">
                      {msg.images && msg.images.length > 0 && (
                        <div className="flex max-w-[85%] flex-wrap justify-end gap-1.5 md:max-w-[70%]">
                          {msg.images.map((src, j) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              key={j}
                              src={src}
                              alt="用户上传的图片"
                              className="h-28 w-28 rounded-[2px] object-cover"
                            />
                          ))}
                        </div>
                      )}
                      {msg.content && (
                        <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-[2px] bg-[#000000] px-4 py-3 text-sm leading-relaxed text-white md:max-w-[70%]">
                          {msg.content}
                        </div>
                      )}
                    </div>
                  ),
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* 输入区 */}
          <div className="shrink-0 border-t border-[#E5E5E5] bg-white p-3 md:p-4">
            <div>
              {/* 全局提示（右下角浮层） */}
              <Toast toast={toast} onDismiss={() => setToast(null)} />

              {/* 模型选择 + 深度思考控制 */}
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <div className="relative">
                  <button
                    onClick={() => !isLoading && setModelMenuOpen((v) => !v)}
                    disabled={isLoading}
                    aria-label="选择模型"
                    className={cn(
                      "flex items-center gap-1.5 rounded-[2px] border px-2.5 py-1 text-xs font-medium transition-colors",
                      isLoading && "cursor-not-allowed opacity-40",
                      !isLoading && modelMenuOpen
                        ? "border-[#000000] bg-white text-[#000000]"
                        : "border-[#E5E5E5] bg-white text-[#555555] hover:border-[#000000] hover:text-[#000000]",
                    )}
                  >
                    {getModelMeta(modelId)?.name ?? "选择模型"}
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>

                  {modelMenuOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setModelMenuOpen(false)}
                        aria-hidden
                      />
                      <div className="absolute bottom-full left-0 z-50 mb-1 w-64 rounded-[3px] border border-[#E5E5E5] bg-white p-1 shadow-lg">
                        <p className="px-2 py-1.5 text-[11px] font-medium text-[#8A8A8A]">
                          选择模型
                        </p>
                        {MODELS.map((m) => {
                          const active = m.id === modelId;
                          return (
                            <button
                              key={m.id}
                              onClick={() => selectModel(m.id)}
                              className={cn(
                                "flex w-full items-start justify-between gap-2 rounded-[3px] px-2 py-2 text-left transition-colors",
                                active ? "bg-[#F2F2F2]" : "hover:bg-[#F7F7F7]",
                              )}
                            >
                              <span className="flex min-w-0 flex-col gap-0.5">
                                <span className="flex items-center gap-1.5">
                                  <span
                                    className={cn(
                                      "text-xs font-medium",
                                      active ? "text-[#000000]" : "text-[#333333]",
                                    )}
                                  >
                                    {m.name}
                                  </span>
                                  {m.tag && (
                                    <span className="rounded-[2px] bg-[#EFEFEF] px-1 text-[10px] leading-4 text-[#888888]">
                                      {m.tag}
                                    </span>
                                  )}
                                </span>
                                <span className="text-[11px] text-[#999999]">
                                  {m.desc}
                                </span>
                              </span>
                              {active && (
                                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#000000]" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
                {supportsThinking && (
                  <>
                    <button
                      onClick={() => !isLoading && toggleThinking()}
                      disabled={isLoading}
                      aria-label="深度思考"
                      className={cn(
                        "flex items-center gap-1.5 rounded-[2px] border px-2.5 py-1 text-xs font-medium transition-colors",
                        isLoading && "cursor-not-allowed opacity-40",
                        !isLoading && thinkingEnabled
                          ? "border-[#000000] bg-[#000000] text-white"
                          : "border-[#E5E5E5] bg-white text-[#666666] hover:border-[#000000] hover:text-[#000000]",
                      )}
                    >
                      <Brain className="h-3.5 w-3.5" />
                      深度思考
                    </button>
                    {thinkingEnabled && (
                      <div className={cn(
                        "flex items-center gap-0.5 rounded-[2px] border border-[#E5E5E5] bg-white p-0.5",
                        isLoading && "opacity-40",
                      )}>
                        {(
                          [
                            ["low", "低"],
                            ["high", "高"],
                            ["max", "最高"],
                          ] as [ThinkingEffort, string][]
                        ).map(([value, label]) => (
                          <button
                            key={value}
                            onClick={() => !isLoading && setEffort(value)}
                            disabled={isLoading}
                            className={cn(
                              "rounded-[2px] px-2 py-0.5 text-xs transition-colors",
                              isLoading && "cursor-not-allowed",
                              thinkingEffort === value
                                ? "bg-[#000000] text-white"
                                : "text-[#666666] hover:text-[#000000]",
                            )}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* 待发送图片预览 */}
              {pendingImages.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {pendingImages.map((url) => (
                    <div key={url} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt="待发送图片"
                        className="h-20 w-20 rounded-[2px] object-cover"
                      />
                      <button
                        aria-label="移除图片"
                        onClick={() => removePendingImage(url)}
                        className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#000000] text-white shadow-sm transition-opacity hover:opacity-85"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-end gap-1.5 md:gap-2">
                {/* 图片上传 */}
                <button
                  aria-label="上传图片"
                  disabled={isLoading}
                  onClick={() => {
                    if (isLoading) return;
                    if (!supportsVision) {
                      showToast("当前模型不支持看图，请切换到视觉版", "warn");
                      return;
                    }
                    fileInputRef.current?.click();
                  }}
                  className={cn(
                    "flex h-11 w-11 shrink-0 items-center justify-center rounded-[2px] transition-colors",
                    isLoading
                      ? "cursor-not-allowed text-[#CCCCCC]"
                      : "text-[#666666] hover:bg-[#ECECEC] hover:text-[#000000]",
                  )}
                >
                  <ImageIcon className="h-5 w-5" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => handleImageSelect(e.target.files)}
                />

                {/* 语音输入 */}
                <button
                  aria-label={isListening ? "停止语音输入" : "语音输入"}
                  onClick={() => !isLoading && toggleVoice()}
                  disabled={isLoading}
                  className={cn(
                    "flex h-11 w-11 shrink-0 items-center justify-center rounded-[2px] transition-colors",
                    isLoading
                      ? "cursor-not-allowed text-[#CCCCCC]"
                      : isListening
                        ? "animate-pulse bg-[#000000] text-white"
                        : "text-[#666666] hover:bg-[#ECECEC] hover:text-[#000000]",
                  )}
                >
                  <Mic className="h-5 w-5" />
                </button>

                <textarea
                  rows={1}
                  value={inputValue}
                  placeholder={
                    isListening ? "正在听你说…" : "给 Agent 发消息…"
                  }
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  className="max-h-32 min-h-11 flex-1 resize-none rounded-[2px] border border-[#E5E5E5] bg-white px-3.5 py-2.5 text-sm text-[#000000] placeholder:text-[#999999] outline-none focus:border-[#000000]"
                />

                <button
                  aria-label="发送"
                  onClick={handleSend}
                  disabled={!canSend}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[2px] bg-[#000000] text-white transition-opacity hover:opacity-85 disabled:opacity-30"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-2 hidden text-[11px] text-[#A0A8B4] lg:block">
                Enter 发送，Shift + Enter 换行
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 删除确认弹窗 */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4"
          onClick={() => !isDeleting && setDeleteTarget(null)}
        >
          <div
            className="w-full max-w-sm rounded-[2px] bg-white p-5 shadow-[0_16px_48px_rgba(0,0,0,0.12)]"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-medium text-black">删除会话</h3>
            <p className="mt-2 text-sm leading-relaxed text-[#666666]">
              确定删除「{deleteTarget.title}」吗？删除后聊天记录无法恢复。
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={isDeleting}
                className="rounded-[2px] border border-[#E5E5E5] bg-white px-4 py-2 text-sm text-[#1F1F1F] transition-colors hover:bg-[#F5F5F5] disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={deleteChat}
                disabled={isDeleting}
                className="flex items-center gap-1.5 rounded-[2px] bg-[#000000] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-85 disabled:opacity-50"
              >
                {isDeleting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 重命名弹窗 */}
      {renameTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4"
          onClick={() => !isRenaming && setRenameTarget(null)}
        >
          <div
            className="w-full max-w-sm rounded-[2px] bg-white p-5 shadow-[0_16px_48px_rgba(0,0,0,0.12)]"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-medium text-black">重命名会话</h3>
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submitRename();
                }
              }}
              placeholder="输入新标题"
              className="mt-3 w-full rounded-[2px] border border-[#E5E5E5] bg-white px-3 py-2.5 text-sm text-black placeholder:text-[#999999] outline-none focus:border-[#000000]"
            />
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setRenameTarget(null)}
                disabled={isRenaming}
                className="rounded-[2px] border border-[#E5E5E5] bg-white px-4 py-2 text-sm text-[#1F1F1F] transition-colors hover:bg-[#F5F5F5] disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={submitRename}
                disabled={isRenaming || !renameValue.trim()}
                className="flex items-center gap-1.5 rounded-[2px] bg-[#000000] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-85 disabled:opacity-50"
              >
                {isRenaming && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}