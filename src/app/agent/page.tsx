"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Plus,
  Send,
  Square,
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
import {
  MODELS,
  DEFAULT_MODEL_ID,
  getModelMeta,
  getThinkingEfforts,
  getDefaultThinkingEffort,
} from "@/lib/models";
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

// 计划进度里的单个步骤（前端展示态；与后端 PlanStep 对齐，但只保留前端渲染所需信息）
interface PlanStepUi {
  id: string;
  description: string;
  status: "pending" | "running" | "done" | "failed" | "paused";
  /** 步骤完成后的文本结果（step_done 事件带回，暂不展示，留给后续扩展） */
  result?: string;
  /** 步骤失败原因（step_failed 事件带回） */
  error?: string;
  /** 补问步骤抛给用户的问题（plan_paused 事件带回） */
  question?: string;
}

// 计划进度：一次任务规划（Plan-and-Execute）的执行进度，挂在这轮的 assistant 消息上做展示
interface PlanProgress {
  goal: string;
  steps: PlanStepUi[];
  /** 是否停在「补问步骤、等用户输入」的暂停态 */
  paused: boolean;
  /** 计划是否已收尾（plan_done） */
  done: boolean;
  /** 已完成的步骤数 */
  completed: number;
  /** 步骤总数 */
  total: number;
  /** 是否「已中断、可恢复」：停止/刷新后读回的 stopped 计划，渲染「继续/放弃」入口 */
  stopped?: boolean;
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
  /** 这轮任务规划的执行进度（收到 plan_created 后挂上，随 step_*、plan_* 事件逐步刷新） */
  plan?: PlanProgress;
  /** 是否已被用户主动停止：停止后保留已产出的半截内容，渲染「已停止」角标并收敛转圈 */
  stopped?: boolean;
  /** 是否已被归档（任务被后续新消息取代）：渲染「已放弃」角标，不提供「继续/放弃」入口 */
  cancelled?: boolean;
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

/**
 * 解析「此刻该用哪个模型」：
 *   1. 记住的模型合法且其供应商已配 Key → 尊重用户的选择，沿用；
 *   2. 否则取第一个配了 Key 的模型（不再硬编码回落到 DeepSeek）；
 *   3. 可用性未知（接口还没返回）或一个 Key 都没配 → 回落 DEFAULT_MODEL_ID，
 *      就算真选到没 Key 的模型，后端还有同款兜底闸门，消息不会发出去才炸。
 *
 * configured 表来自 /api/providers，形如 { deepseek: true, openrouter: false }。
 */
function resolveModel(
  saved: string | null | undefined,
  configured: Record<string, boolean> | null,
): string {
  const meta = saved ? getModelMeta(saved) : undefined;
  if (meta && configured?.[meta.provider] !== false) return saved as string;
  const hit = configured
    ? MODELS.find((m) => configured[m.provider])
    : undefined;
  return hit?.id ?? DEFAULT_MODEL_ID;
}

type ThinkingEffort = "low" | "high" | "max";

/** 思考档位 → 按钮文案 */
const EFFORT_LABELS: Record<ThinkingEffort, string> = {
  low: "低",
  high: "高",
  max: "最高",
};

function loadThinking(modelId: string): {
  enabled: boolean;
  effort: ThinkingEffort;
} {
  // 不同供应商合法档位不同：按模型档位表校验，非法/缺失值回落该模型默认档
  const efforts = getThinkingEfforts(modelId);
  const fallback = getDefaultThinkingEffort(modelId);
  try {
    const raw = window.localStorage.getItem(THINKING_PREFIX + modelId);
    if (raw) {
      const parsed = JSON.parse(raw) as { enabled?: boolean; effort?: string };
      const effort = efforts.includes(parsed.effort as ThinkingEffort)
        ? (parsed.effort as ThinkingEffort)
        : fallback;
      return {
        enabled: parsed.enabled === true,
        effort,
      };
    }
  } catch {
    // 忽略解析失败，回落默认
  }
  return { enabled: false, effort: fallback };
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
  status?: string | null;
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
    // 后端 status（running/done/stopped/failed/cancelled）：只有 stopped / cancelled 需要前端标记。
    //   - stopped   → 渲染「已停止」角标（可恢复，带「继续/放弃」按钮）
    //   - cancelled → 渲染「已放弃」角标（被新消息取代后归档，不再可恢复）
    // 这样「停止/归档后刷新」从历史读回的半截消息，也能正确显示对应状态而不是被当成普通消息。
    stopped: m.status === "stopped",
    cancelled: m.status === "cancelled",
    created_at: m.created_at,
  };
}

// ---------- 计划进度展示组件（任务规划：Plan-and-Execute） ----------
//
// 什么时候会有这个面板：模型把「一句话需求」拆成一串步骤、逐步骤执行时，
// 后端会推 plan_created → step_* → plan_paused / plan_done 这一串事件。
// 前端把这些事件翻译成一张「进度清单」挂在 assistant 消息上：
//   - 灰色空心圆 = 还没轮到（pending）
//   - 转圈        = 正在做（running）
//   - 绿色对勾    = 做完了（done）
//   - 橙色叉      = 做失败了，跳过（failed）
//   - 蓝色小时钟  = 补问步骤，停下来等你回复（paused）
// 最关键的「暂停态」：补问那一步会额外展开「等待你回复 + 问题内容」，底部还有一条
// 黑底提示「已暂停等你补充信息」，让用户一眼看出「现在轮到我了，不是卡死」。

function PlanBlock({
  plan,
  onResume,
  onAbandon,
}: {
  plan: PlanProgress;
  /** 点「继续执行」：从断点恢复上次中断的计划 */
  onResume?: () => void;
  /** 点「放弃」：丢弃这份半截计划 */
  onAbandon?: () => void;
}) {
  if (!plan.steps || plan.steps.length === 0) return null;

  // 各状态对应的图标（纯黑白灰 + 少量语义色，对齐全局视觉风格）
  const statusIcon = (s: PlanStepUi["status"]) => {
    switch (s) {
      case "running":
        return <Loader2 className="h-3 w-3 shrink-0 animate-spin text-[#000000]" />;
      case "done":
        return <CheckCircle2 className="h-3 w-3 shrink-0 text-[#34C759]" />;
      case "failed":
        return <XCircle className="h-3 w-3 shrink-0 text-[#FF9500]" />;
      case "paused":
        return <Clock3 className="h-3 w-3 shrink-0 text-[#007AFF]" />;
      default:
        return (
          <span className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full border border-[#C9C9C9]" />
        );
    }
  };

  return (
    <div className="mb-2 rounded-[2px] bg-[#F5F5F5] px-3 py-2">
      {/* 计划目标 + 进度计数 */}
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-xs font-medium text-[#1F1F1F]">
          {plan.goal || "任务计划"}
        </span>
        <span className="shrink-0 text-[11px] tabular-nums text-[#A0A8B4]">
          {plan.done ? "已完成" : `${plan.completed}/${plan.total}`}
        </span>
      </div>

      {/* 步骤清单 */}
      <div className="mt-1.5 flex flex-col gap-1">
        {plan.steps.map((s) => (
          <div key={s.id}>
            <div className="flex items-start gap-1.5">
              <span className="mt-0.5">{statusIcon(s.status)}</span>
              <span
                className={cn(
                  "min-w-0 break-words text-xs leading-relaxed",
                  s.status === "pending"
                    ? "text-[#A0A8B4]"
                    : s.status === "failed"
                      ? "text-[#FF9500]"
                      : "text-[#1F1F1F]",
                )}
              >
                {s.description}
              </span>
            </div>
            {/* 补问步骤：突出展示「等待你回复」+ 问题内容 */}
            {s.status === "paused" && s.question ? (
              <div className="mt-1 ml-4 rounded-[2px] border border-[#E5E5E5] bg-white px-2 py-1.5">
                <span className="text-[11px] font-medium text-[#007AFF]">等待你回复</span>
                <p className="mt-0.5 whitespace-pre-wrap break-words text-xs leading-relaxed text-[#1F1F1F]">
                  {s.question}
                </p>
              </div>
            ) : null}
            {/* 失败步骤：附失败原因 */}
            {s.status === "failed" && s.error ? (
              <div className="mt-0.5 ml-4 text-[11px] text-[#FF9500]">{s.error}</div>
            ) : null}
          </div>
        ))}
      </div>

      {/* 暂停态总提示：黑底醒目，明确「现在轮到你，不是卡死」 */}
      {plan.paused && !plan.done ? (
        <div className="mt-2 rounded-[2px] bg-[#000000] px-2 py-1.5 text-[11px] text-white">
          已暂停等你补充信息，回复后我会从断点继续执行
        </div>
      ) : null}

      {/* 已中断（stopped）：展示「继续 / 放弃」入口，让用户决定接着跑还是丢弃这半截任务 */}
      {plan.stopped && !plan.done ? (
        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={onResume}
            className="flex items-center gap-1 rounded-[2px] bg-[#000000] px-2.5 py-1 text-xs font-medium text-white transition-opacity hover:opacity-85"
          >
            继续执行
          </button>
          <button
            onClick={onAbandon}
            className="rounded-[2px] border border-[#E5E5E5] bg-white px-2.5 py-1 text-xs text-[#1F1F1F] transition-colors hover:bg-[#F5F5F5]"
          >
            放弃
          </button>
        </div>
      ) : null}
    </div>
  );
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
  const [thinkingEffort, setThinkingEffort] = useState<ThinkingEffort>(
    () => getDefaultThinkingEffort(DEFAULT_MODEL_ID),
  );
  const [openReasoning, setOpenReasoning] = useState<Set<string>>(new Set());
  const [modelId, setModelId] = useState<string>(DEFAULT_MODEL_ID);
  // 各供应商「是否已配置 Key」的布尔表（/api/providers 返回）。
  // null 表示还没拉到：此时一切照旧，拉到后再对当前选中的模型做一次校正。
  const [providerConfigured, setProviderConfigured] =
    useState<Record<string, boolean> | null>(null);
  // 同一份状态的 ref 镜像：selectChat 等 useCallback([]) 回调里读它取最新值，
  // 不必把它塞进依赖数组导致回调身份变化、挂载时的会话恢复逻辑重跑
  const providerConfiguredRef = useRef<Record<string, boolean> | null>(null);
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
  // 请求取消控制器：用户点停止按钮时 abort，后端据此中断正在跑的 agent 循环
  const abortRef = useRef<AbortController | null>(null);
  // 是否用户主动停止（区分「主动停止保留半截」与「空闲超时报错」两种不同处理）
  const userStoppedRef = useRef(false);
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
  // 输入法组合态标记：候选词未敲定（compositionstart→end 之间）按回车不应触发发送
  const composingRef = useRef(false);

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
    // 会话记住的模型先过一道 Key 可用性闸门：那个模型当时能用、现在未必
    // （Key 可能已从 .env.local 移除），不可用就自动换到第一个可用的，
    // 避免一进旧会话就撞上「未配置 DEEPSEEK_API_KEY」
    const mid = pickAvailableModel(loadModel(id));
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
        status?: string | null;
        created_at?: number;
      }>;
      hasMore?: boolean;
      plan?: {
        goal: string;
        steps: Array<{
          id: string;
          description: string;
          status?: "pending" | "running" | "done" | "failed" | "skipped" | "paused";
        }>;
        status: "running" | "stopped";
      } | null;
    };
    const msgs = (data.messages ?? []).map(rowToMessage);
    // 断点恢复：把后端返回的「可恢复计划」（仅 stopped）挂到最后一次被停止的消息上，
    // 重画进度面板并渲染「继续 / 放弃」入口。running 是 stopped 落库前的短暂中间态，
    // 这里不特殊处理（刷新后很快会由批次2的 abort 机制转成 stopped）。
    if (data.plan && data.plan.status === "stopped") {
      const recovered: PlanProgress = {
        goal: data.plan.goal,
        steps: data.plan.steps.map((s) => ({
          id: s.id,
          description: s.description,
          // running 是「被打断时正在跑」的残留，恢复后会重新执行，显示为 pending 更准确
          status:
            s.status === "done"
              ? ("done" as const)
              : s.status === "failed"
                ? ("failed" as const)
                : s.status === "paused"
                  ? ("paused" as const)
                  : ("pending" as const),
        })),
        paused: false,
        done: false,
        stopped: true,
        completed: data.plan.steps.filter((s) => s.status === "done").length,
        total: data.plan.steps.length,
      };
      // 从最后往前找，挂到「最后一条被停止（stopped）的 assistant 消息」上
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === "assistant" && msgs[i].stopped) {
          msgs[i].plan = recovered;
          break;
        }
      }
    }
    setMessages(msgs);
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
    // 不再硬编码切回 DeepSeek：沿用你正在用的模型（若其供应商的 Key 已失效
    // 则自动换到第一个可用的），并恢复该模型自己的深度思考偏好。
    // 以前每次新建会话都被拽回默认模型——只配了 OpenRouter 的用户每开一个
    // 新会话就得重新手选一次 Ox Alpha，非常反直觉。
    const mid = pickAvailableModel(modelId);
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

  // 启动时拉一次各供应商 Key 配置状态：
  //   1. 存进 state（驱动选择器置灰标注）+ ref（供回调读最新值）；
  //   2. 对「当前选中的模型」做一次校正——如果正停在一个没配 Key 的模型上
  //      （包括初始默认的 DeepSeek），当场切到第一个可用的，不等用户踩坑。
  useEffect(() => {
    let cancelled = false;
    fetch("/api/providers")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const table = (data ?? {}) as Record<string, boolean>;
        providerConfiguredRef.current = table;
        setProviderConfigured(table);
        setModelId((cur) => resolveModel(cur, table));
      })
      .catch(() => {
        // 拉失败不影响使用：置空表走旧行为，发消息时后端仍有兜底闸门
        if (!cancelled) setProviderConfigured({});
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 给「按记忆恢复模型」的场景过一道可用性闸门（切会话 / 新建会话时用）。
  // 读 ref 而非 state，保证 useCallback([]) 里的旧闭包也能拿到最新可用性。
  const pickAvailableModel = (saved: string): string =>
    resolveModel(saved, providerConfiguredRef.current);

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

  // 停止当前这轮生成：标记为用户主动停止并 abort 当前请求。
  // abort 后 fetch 的 reader 会 reject AbortError，handleSend 的 catch 里据 userStoppedRef
  // 把消息标为 stopped（保留半截内容），而不是误报成「请求超时」。
  const stopGenerating = () => {
    userStoppedRef.current = true;
    abortRef.current?.abort();
  };

  // 发一轮对话的核心流程：本地占位 + 流式请求 + 事件处理 + 收尾。
  // handleSend（正常聊天）与 handleResume（断点恢复「继续」）都走这里，差异只在：
  //   - content / images 是否为空；
  //   - 是否带 resume 标记，让后端从「最后完成的步骤之后」续跑。
  const sendMessage = async (
    content: string,
    images: string[] | undefined,
    resume: boolean,
  ) => {
    sendingRef.current = true;
    // 新一轮：清掉上一轮可能残留的「主动停止」标记，避免影响这轮正常的异常判断
    userStoppedRef.current = false;

    // 会话身份先行：新会话的第一条消息，先显式创建会话拿到 id，再发消息。
    // 之前 sessionId 靠 SSE 的 done 事件回传——用户一旦中途停止、连接被 abort，
    // done 永远收不到 → 前端不知道自己处在哪个会话 → 下一条消息又以「无会话」身份
    // 发出，后端只能再建一个新会话（表现为「新会话停止两次，刷新后侧边栏冒出两个
    // 新会话」）。现在发起前就定下身份：停止、刷新都不丢，侧边栏也当场出现新条目。
    let sessionForThisTurn = activeChatId;
    if (!sessionForThisTurn && !resume) {
      try {
        const res = await fetch("/api/sessions", { method: "POST" });
        const data = (await res.json()) as { session?: { id?: string } };
        if (data.session?.id) {
          sessionForThisTurn = data.session.id;
          setActiveChatId(sessionForThisTurn);
          window.localStorage.setItem(LAST_SESSION_KEY, sessionForThisTurn);
          void loadSessions();
        }
      } catch {
        // 创建失败不阻塞发送：后端仍有「无会话则懒创建」的兜底路径
      }
    }

    // 本地先 push 消息：正常聊天是「用户消息 + 助手占位」；断点恢复没有用户消息，只 push 助手占位
    const assistantMsgId = `tmp-a-${Date.now()}`;
    stickToBottomRef.current = true; // 发新消息时强制跟随到最底
    if (resume) {
      // 断点恢复接管旧面板：把旧消息上挂着「继续/放弃」按钮的进度快照摘掉。
      // 计划已被这一轮续跑接管，旧快照若保留，界面上会同时出现两份进度面板，
      // 用户还能对着已过时的旧面板误点第二次「继续」、或误点「放弃」把正在跑的
      // 计划状态翻掉。摘掉后与刷新页面的表现一致（续跑中的计划不恢复任何面板），
      // 保证一个计划永远只有一个活跃面板；旧气泡仅保留「已停止」角标作为痕迹。
      setMessages((prev) => {
        const next = [...prev];
        for (let i = next.length - 1; i >= 0; i--) {
          if (next[i].role === "assistant" && next[i].stopped && next[i].plan) {
            next[i] = { ...next[i], plan: undefined };
            break;
          }
        }
        next.push({ id: assistantMsgId, role: "assistant" as const, content: "" });
        return next;
      });
    } else {
      // 发新消息 = 上一轮任务被取代：把仍在「已停止」态的任务即时归档成「已放弃」，
      // 并摘掉它的进度面板（「继续/放弃」按钮随之消失）。与后端在收到新消息时把旧
      // stopped 计划翻 cancelled 的逻辑对齐，避免刷新前 UI 残留两个「可恢复」任务。
      setMessages((prev) => [
        ...prev.map((m) =>
          m.role === "assistant" && m.stopped
            ? { ...m, stopped: false, cancelled: true, plan: undefined }
            : m,
        ),
        { id: `tmp-u-${Date.now()}`, role: "user" as const, content, images },
        { id: assistantMsgId, role: "assistant" as const, content: "" },
      ]);
    }
    // 思考过程默认收起：不自动加入展开集合，用户点击「思考过程」时才展开，避免占篇幅
    setIsLoading(true);

    // 本轮的会话身份：新会话已在上文「身份先行」处创建好；旧会话沿用当前 id。
    // 后续停止/异常收尾都基于这个变量，不再依赖流的 done 事件回传。
    let finalSessionId = sessionForThisTurn;
    let finalTitle = activeChat?.title ?? "新会话";

    // 空闲超时：60 秒没有新数据就中止，避免卡死锁着发送键
    const controller = new AbortController();
    // 存到组件级 ref，停止按钮才能拿到这个 controller 并 abort 掉这轮请求
    abortRef.current = controller;
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
          content,
          sessionId: sessionForThisTurn,
          model: modelId,
          thinking: { enabled: thinkingEnabled, effort: thinkingEffort },
          images,
          ...(resume ? { resume: true } : {}),
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
              type:
                | "delta"
                | "reasoning"
                | "error"
                | "done"
                | "tool_call"
                | "tool_result"
                | "tool_error"
                | "plan_created"
                | "step_start"
                | "step_done"
                | "step_failed"
                | "plan_paused"
                | "plan_done"
                | "stopped";
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
              // ── 计划进度事件字段（与后端 loop.ts 的 LoopEvent 对齐） ──
              goal?: string;
              steps?: Array<{
                id: string;
                description: string;
                status?: "pending" | "running" | "done" | "failed" | "skipped" | "paused";
              }>;
              stepId?: string;
              index?: number;
              total?: number;
              description?: string;
              question?: string;
              completed?: number;
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
            // ── 任务规划（Plan-and-Execute）事件：刷新这轮消息上的计划进度面板 ──
            } else if (obj.type === "plan_created" && obj.goal && obj.steps) {
              // 收到计划：初始化进度面板。
              // 关键：继承后端 steps 已带的 status（不要一律重置成 pending）——
              // 断点续跑时，后端 resumeLoop 发的 plan_created 快照里「已完成步骤」已是 done，
              // 只有继承它，续跑这一轮的面板才不会把前面做完的步骤又退回灰色。
              const createdSteps = obj.steps ?? [];
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? {
                        ...m,
                        plan: {
                          goal: obj.goal!,
                          steps: createdSteps.map((s) => ({
                            id: s.id,
                            description: s.description,
                            status:
                              s.status === "done"
                                ? ("done" as const)
                                : s.status === "failed"
                                  ? ("failed" as const)
                                  : s.status === "paused"
                                    ? ("paused" as const)
                                    : ("pending" as const),
                          })),
                          paused: false,
                          done: false,
                          completed: createdSteps.filter((s) => s.status === "done")
                            .length,
                          total: createdSteps.length,
                        },
                      }
                    : m,
                ),
              );
            } else if (obj.type === "step_start" && obj.stepId) {
              // 开始执行某一步：把这一步浮起为 running
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId && m.plan
                    ? {
                        ...m,
                        plan: {
                          ...m.plan,
                          steps: m.plan.steps.map((s) =>
                            s.id === obj.stepId ? { ...s, status: "running" as const } : s,
                          ),
                        },
                      }
                    : m,
                ),
              );
            } else if (obj.type === "step_done" && obj.stepId) {
              // 某一步完成：标 done，完成计数 +1
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId && m.plan
                    ? {
                        ...m,
                        plan: {
                          ...m.plan,
                          completed: m.plan.completed + 1,
                          steps: m.plan.steps.map((s) =>
                            s.id === obj.stepId
                              ? {
                                  ...s,
                                  status: "done" as const,
                                  result:
                                    typeof obj.result === "string" ? obj.result : undefined,
                                }
                              : s,
                          ),
                        },
                      }
                    : m,
                ),
              );
            } else if (obj.type === "step_failed" && obj.stepId) {
              // 某一步失败（重试耗尽被跳过）：标 failed，附失败原因
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId && m.plan
                    ? {
                        ...m,
                        plan: {
                          ...m.plan,
                          steps: m.plan.steps.map((s) =>
                            s.id === obj.stepId
                              ? { ...s, status: "failed" as const, error: obj.error }
                              : s,
                          ),
                        },
                      }
                    : m,
                ),
              );
            } else if (obj.type === "plan_paused" && obj.stepId) {
              // 补问步骤触发暂停：把这一步标 paused + 挂上问题，整条计划进入「等你输入」态
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId && m.plan
                    ? {
                        ...m,
                        plan: {
                          ...m.plan,
                          paused: true,
                          steps: m.plan.steps.map((s) =>
                            s.id === obj.stepId
                              ? { ...s, status: "paused" as const, question: obj.question }
                              : s,
                          ),
                        },
                      }
                    : m,
                ),
              );
            } else if (obj.type === "plan_done") {
              // 计划收尾：标记完成、解除暂停、用最终计数覆盖
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId && m.plan
                    ? {
                        ...m,
                        plan: {
                          ...m.plan,
                          done: true,
                          paused: false,
                          completed: obj.completed ?? m.plan.total,
                          total: obj.total ?? m.plan.total,
                        },
                      }
                    : m,
                ),
              );
            } else if (obj.type === "stopped") {
              // 后端确认这轮已被停止（数据已定格为 stopped）。主动停止时前端 abort 已断连、
              // 通常收不到这条事件；保留此分支是为了兼容「后端侧主动停止」等场景，统一标 stopped。
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId ? { ...m, stopped: true } : m,
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
        if (userStoppedRef.current) {
          // 用户主动停止：保留已产出的半截内容，标记 stopped，并收敛正在转圈的工具调用/步骤。
          // 不覆盖正文、不提示「超时」——停止是用户预期行为，只需把界面安定下来。
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? {
                    ...m,
                    stopped: true,
                    // 正在转圈的工具调用收敛为 error（附「已停止」），图标从转圈变叉
                    toolCalls: m.toolCalls?.map((tc) =>
                      tc.status === "running"
                        ? { ...tc, status: "error" as const, error: "已停止" }
                        : tc,
                    ),
                    // 计划里正在执行的步骤退回 pending，进度面板不再有转圈；
                    // 同时把计划面板标成 stopped，让「继续/放弃」按钮在停止当下就出现，
                    // 而不是等刷新后从后端读回 stopped 计划才补上。
                    plan: m.plan
                      ? {
                          ...m.plan,
                          paused: false,
                          stopped: true,
                          steps: m.plan.steps.map((s) =>
                            s.status === "running"
                              ? { ...s, status: "pending" as const }
                              : s,
                          ),
                        }
                      : m.plan,
                  }
                : m,
            ),
          );
        } else {
          // 空闲超时（60s 无新数据）：属于异常，按原逻辑提示重试
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? { ...m, content: "请求超时，可能网络或服务端卡住了，请重试" }
                : m,
            ),
          );
          showToast("请求超时，请重试", "error");
        }
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
      abortRef.current = null;
      sendingRef.current = false;
      setIsLoading(false);
    }
  };

  // 正常发送一条消息：取输入 → 交给 sendMessage 走流式聊天
  const handleSend = async () => {
    const text = inputValue.trim();
    if (!text && pendingImages.length === 0) return;
    if (sendingRef.current) return;

    const images = pendingImages.length > 0 ? [...pendingImages] : undefined;
    setInputValue("");
    setPendingImages([]);

    await sendMessage(text, images, false);
  };

  // 断点恢复「继续」：以 resume 标记请求后端从最后完成的步骤之后续跑。
  // 没有新输入（content 为空、无图片），后端据此走 resumeStoppedLoop 而非 agentLoop。
  const handleResume = async () => {
    if (sendingRef.current) return;
    await sendMessage("", undefined, true);
  };

  // 断点恢复「放弃」：调 /api/plan 把 stopped 计划翻 cancelled，再重载当前会话，
  // 让 getRecoverablePlan 读不到计划，从而隐藏「继续 / 放弃」入口。
  const handleAbandon = async () => {
    if (!activeChatId) return;
    await fetch("/api/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: activeChatId }),
    });
    await selectChat(activeChatId);
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
                        {msg.plan ? (
                          <PlanBlock
                            plan={msg.plan}
                            onResume={handleResume}
                            onAbandon={handleAbandon}
                          />
                        ) : null}
                        {msg.toolCalls && msg.toolCalls.length > 0 ? (
                          <ToolCallsBlock toolCalls={msg.toolCalls} />
                        ) : null}
                        {/* 兜底转圈只在「内容为空且未停止/未归档」时显示；stopped/cancelled 已是终态必须收敛转圈，否则半截空消息永久空转 */}
                        {msg.content ? (
                          <div className="markdown-body">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {msg.content}
                            </ReactMarkdown>
                          </div>
                        ) : msg.stopped || msg.cancelled ? null : msg.toolCalls?.some(
                            (tc) => tc.status === "running",
                          ) ? null : (
                          <Loader2 className="h-4 w-4 animate-spin text-[#A0A8B4]" />
                        )}
                        {msg.stopped ? (
                          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-[#A0A8B4]">
                            <Square className="h-3 w-3 shrink-0" />
                            <span>已停止</span>
                          </div>
                        ) : msg.cancelled ? (
                          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-[#A0A8B4]">
                            <Square className="h-3 w-3 shrink-0" />
                            <span>已放弃</span>
                          </div>
                        ) : null}
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
                          // 该模型的供应商还没配 Key：置灰禁选并标明原因，
                          // 免得选中之后、消息发出去才收到报错
                          const unavailable =
                            providerConfigured?.[m.provider] === false;
                          return (
                            <button
                              key={m.id}
                              onClick={() => !unavailable && selectModel(m.id)}
                              disabled={unavailable}
                              className={cn(
                                "flex w-full items-start justify-between gap-2 rounded-[3px] px-2 py-2 text-left transition-colors",
                                active ? "bg-[#F2F2F2]" : "hover:bg-[#F7F7F7]",
                                unavailable &&
                                  "cursor-not-allowed opacity-45 hover:bg-transparent",
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
                                  {unavailable && (
                                    <span className="rounded-[2px] bg-[#F5F5F5] px-1 text-[10px] leading-4 text-[#AAAAAA]">
                                      未配置 Key
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
                        {getThinkingEfforts(modelId).map((value) => (
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
                            {EFFORT_LABELS[value]}
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
                  onCompositionStart={() => {
                    composingRef.current = true;
                  }}
                  onCompositionEnd={() => {
                    composingRef.current = false;
                  }}
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      !e.shiftKey &&
                      !composingRef.current
                    ) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  className="max-h-32 min-h-11 flex-1 resize-none rounded-[2px] border border-[#E5E5E5] bg-white px-3.5 py-2.5 text-sm text-[#000000] placeholder:text-[#999999] outline-none focus:border-[#000000]"
                />

                <button
                  aria-label={isLoading ? "停止" : "发送"}
                  onClick={isLoading ? stopGenerating : handleSend}
                  disabled={isLoading ? false : !canSend}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[2px] bg-[#000000] text-white transition-opacity hover:opacity-85 disabled:opacity-30"
                >
                  {isLoading ? (
                    <Square className="h-4 w-4" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
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