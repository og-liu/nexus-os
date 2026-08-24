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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";

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

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  images?: string[];
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

// ---------- 页面 ----------

export default function AgentPage() {
  const [chats, setChats] = useState<SessionMeta[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  // 手机端视图切换：list=会话列表，chat=对话。md 及以上双栏常驻，不受此影响
  const [mobileView, setMobileView] = useState<"list" | "chat">("list");
  const [inputValue, setInputValue] = useState("");
  // 待发送图片（objectURL 列表）
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [hint, setHint] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const baseTextRef = useRef("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeChat = chats.find((c) => c.id === activeChatId);

  const showHint = (text: string) => {
    setHint(text);
    window.setTimeout(() => setHint(""), 3000);
  };

  // ---------- 会话加载 ----------

  const loadSessions = useCallback(async () => {
    const res = await fetch("/api/sessions");
    const data = (await res.json()) as { sessions?: SessionMeta[] };
    setChats(data.sessions ?? []);
  }, []);

  const selectChat = async (id: string) => {
    setActiveChatId(id);
    setMobileView("chat");
    const res = await fetch(`/api/sessions/${id}`);
    const data = (await res.json()) as {
      messages?: Array<{
        id: string;
        role: "user" | "assistant";
        content: string;
      }>;
    };
    setMessages(
      (data.messages ?? []).map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
      })),
    );
  };

  const newChat = () => {
    setActiveChatId(null);
    setMessages([]);
    setMobileView("chat");
  };

  const deleteChat = async (id: string) => {
    if (!window.confirm("确定删除这个会话吗？删除后无法恢复。")) return;
    await fetch(`/api/sessions/${id}`, { method: "DELETE" });
    if (activeChatId === id) {
      setActiveChatId(null);
      setMessages([]);
    }
    await loadSessions();
  };

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // 消息变化时滚到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
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
    const urls = Array.from(files)
      .filter((f) => f.type.startsWith("image/"))
      .map((f) => URL.createObjectURL(f));
    setPendingImages((prev) => [...prev, ...urls]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removePendingImage = (url: string) => {
    URL.revokeObjectURL(url);
    setPendingImages((prev) => prev.filter((u) => u !== url));
  };

  // ---------- 发送 ----------

  const handleSend = async () => {
    const text = inputValue.trim();
    if (!text) {
      if (pendingImages.length > 0) {
        showHint("目前仅支持文字消息，图片识别能力后续开放");
      }
      return;
    }

    const images = pendingImages.length > 0 ? pendingImages : undefined;
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
    setMessages((prev) => [
      ...prev,
      userMsg,
      { id: assistantMsgId, role: "assistant", content: "" },
    ]);
    setIsLoading(true);

    let finalSessionId = activeChatId;
    let finalTitle = activeChat?.title ?? "新会话";

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text, sessionId: activeChatId }),
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
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const payload = trimmed.slice(5).trim();
          try {
            const obj = JSON.parse(payload) as {
              type: "delta" | "error" | "done";
              content?: string;
              message?: string;
              sessionId?: string;
              title?: string;
            };
            if (obj.type === "delta" && obj.content) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? { ...m, content: m.content + obj.content }
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
            }
          } catch {
            // 忽略无法解析的行
          }
        }
      }

      if (finalSessionId) setActiveChatId(finalSessionId);
      await loadSessions();
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? { ...m, content: "网络错误，请稍后重试" }
            : m,
        ),
      );
      showHint(`发送失败，请检查服务是否启动并已填写 DEEPSEEK_API_KEY`);
    } finally {
      setIsLoading(false);
    }
  };

  const canSend = inputValue.trim().length > 0;

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
                  <button
                    aria-label="删除会话"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteChat(chat.id);
                    }}
                    className="hidden h-5 w-5 shrink-0 items-center justify-center rounded-[2px] text-[#A0A8B4] transition-colors hover:text-[#000000] group-hover:flex"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
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
          <div className="flex-1 overflow-y-auto px-4 py-4 md:px-6 md:py-6">
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
                {messages.map((msg, i) =>
                  msg.role === "assistant" ? (
                    <div key={i} className="flex items-start gap-2.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[2px] bg-[#000000]">
                        <Bot className="h-4.5 w-4.5 text-white" />
                      </div>
                      <div className="min-w-0 whitespace-pre-wrap break-words rounded-[2px] bg-white px-4 py-3 text-sm leading-relaxed text-[#1F1F1F]">
                        {msg.content ? (
                          msg.content
                        ) : (
                          <Loader2 className="h-4 w-4 animate-spin text-[#A0A8B4]" />
                        )}
                      </div>
                    </div>
                  ) : (
                    <div key={i} className="flex flex-col items-end gap-1.5">
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
              {/* 提示 */}
              {hint && <p className="mb-2 text-xs text-[#8A8A8A]">{hint}</p>}

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
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[2px] text-[#666666] transition-colors hover:bg-[#ECECEC] hover:text-[#000000]"
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
                  onClick={toggleVoice}
                  className={cn(
                    "flex h-11 w-11 shrink-0 items-center justify-center rounded-[2px] transition-colors",
                    isListening
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
    </>
  );
}