"use client";

// Agent 对话视图：界面的骨相取自旧项目（同样的双栏节奏、同样的气泡形态），
// 但数据只走内存——**第一版不落库**，刷新页面就是一张白纸。
//
// 这是刻意的：先用最少的零件把「浏览器 → API → 模型 → 流式回显」这条线打通，
// 再谈存哪儿、怎么恢复。先接存储会让这一版同时背两个还没定好的问题。

import { Bot, ChevronDown, Send, Square, Zap } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { TokenUsage } from "@/lib/agent/providers";
import { cn } from "@/lib/utils";

/** 界面上的一条消息 */
interface ChatBubble {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** 模型的思考过程。用户看到的是「思考过程」折叠块 */
  reasoning: string;
  usage: TokenUsage | null;
  /** 这一条失败了就写在这儿，气泡里显示成红字 */
  error?: string;
}

/** 服务端推回来的事件（与 app/api/chat/route.ts 里的 send 一一对应） */
type ServerEvent =
  | { type: "delta"; kind: "content" | "reasoning"; text: string }
  | { type: "done"; usage: TokenUsage | null }
  | { type: "error"; message: string };

export function AgentChat() {
  const [messages, setMessages] = useState<ChatBubble[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [openReasoning, setOpenReasoning] = useState<Set<string>>(new Set());

  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  // 中文输入法在组词时会连续触发 Enter，此时**不能**当成「发送」。
  // 不拦这个，用户打「你好」选字时按回车就会误发一条半截消息（踩过的坑）。
  const composingRef = useRef(false);

  // 新内容到达时，只有本来就贴着底部才自动跟随；用户翻上去了就别抢他的滚动位置
  useEffect(() => {
    if (!stickToBottomRef.current) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  function patch(id: string, fn: (m: ChatBubble) => ChatBubble) {
    setMessages((prev) => prev.map((m) => (m.id === id ? fn(m) : m)));
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || isStreaming) return;

    const userId = crypto.randomUUID();
    const assistantId = crypto.randomUUID();
    const history = [...messages, { role: "user" as const, content: text }];

    setMessages((prev) => [
      ...prev,
      { id: userId, role: "user", content: text, reasoning: "", usage: null },
      { id: assistantId, role: "assistant", content: "", reasoning: "", usage: null },
    ]);
    setInput("");
    setIsStreaming(true);
    stickToBottomRef.current = true;

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // 只发 role + content：reasoning / usage 是我们的展示信息，不该回灌给模型
        body: JSON.stringify({ messages: history }),
        signal: ctrl.signal,
      });

      if (!res.ok || !res.body) {
        // 服务端拒绝时带的是 JSON { error }，尽量把真实原因显示出来，
        // 不要一律说「请求失败」——那样用户只能瞎猜（踩过的坑）
        const detail = await res
          .json()
          .then((j: { error?: string }) => j.error)
          .catch(() => null);
        patch(assistantId, (m) => ({
          ...m,
          error: detail ?? `请求失败（${res.status}）`,
        }));
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE 以「空行」为一条消息的边界。最后一段可能是不完整的半条，留着下一轮拼。
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data:")) continue;
          let event: ServerEvent;
          try {
            event = JSON.parse(line.slice(5).trim()) as ServerEvent;
          } catch {
            continue;
          }

          if (event.type === "delta") {
            if (event.kind === "content") {
              patch(assistantId, (m) => ({ ...m, content: m.content + event.text }));
            } else {
              patch(assistantId, (m) => ({ ...m, reasoning: m.reasoning + event.text }));
            }
          } else if (event.type === "done") {
            patch(assistantId, (m) => ({ ...m, usage: event.usage }));
          } else if (event.type === "error") {
            patch(assistantId, (m) => ({ ...m, error: event.message }));
          }
        }
      }
    } catch (e) {
      // 用户自己点停止会走这里，不当成错误
      if (!(e instanceof Error && e.name === "AbortError")) {
        patch(assistantId, (m) => ({
          ...m,
          error: e instanceof Error ? e.message : "网络异常",
        }));
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }

  function stop() {
    abortRef.current?.abort();
    setIsStreaming(false);
  }

  function newChat() {
    abortRef.current?.abort();
    setMessages([]);
    setInput("");
    setIsStreaming(false);
  }

  function toggleReasoning(id: string) {
    setOpenReasoning((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const canSend = input.trim().length > 0 && !isStreaming;

  return (
    <>
      {/* 会话标题条。右侧那句是给这一版的功能边界说明，接入存储后删掉 */}
      <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-[#E5E5E5] bg-white px-4">
        <span className="truncate text-sm font-medium text-black">新对话</span>
        <button
          onClick={newChat}
          disabled={messages.length === 0}
          className="shrink-0 rounded-[2px] border border-[#E5E5E5] px-2.5 py-1 text-xs text-[#555555] transition-colors hover:border-[#000000] hover:text-[#000000] disabled:opacity-30"
        >
          清空
        </button>
      </div>

      {/* 消息流 */}
      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="flex-1 overflow-y-auto px-4 py-4 md:px-6 md:py-6"
      >
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-[2px] bg-[#000000]">
              <Bot className="h-6 w-6 text-white" />
            </div>
            <p className="text-sm font-medium text-[#000000]">开始和 Agent 对话吧</p>
            <p className="max-w-xs text-xs leading-relaxed text-[#A0A8B4]">
              问它任何问题。它现在还不能操作便签、待办这些工具——那要等工具层接上。
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {messages.map((msg) =>
              msg.role === "assistant" ? (
                <div key={msg.id} className="flex items-start gap-2.5">
                  <div className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-[2px] bg-[#000000] sm:flex">
                    <Bot className="h-4 w-4 text-white" />
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
                          <div className="mt-1.5 max-h-52 overflow-y-auto whitespace-pre-wrap break-words rounded-[2px] bg-[#F5F5F5] px-3 py-2 text-xs leading-relaxed text-[#8A8A8A]">
                            {msg.reasoning}
                          </div>
                        )}
                      </div>
                    ) : null}

                    {msg.content ? (
                      <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                    ) : msg.error ? null : (
                      // 还没有任何正文、也没报错 → 正在生成
                      <span className="inline-flex items-center gap-1.5 text-xs text-[#A0A8B4]">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#A0A8B4]" />
                        正在生成
                      </span>
                    )}

                    {msg.error ? (
                      <div className="mt-1 text-xs leading-relaxed text-[#B91C1C]">{msg.error}</div>
                    ) : null}

                    {msg.usage ? (
                      <div className="mt-2 flex items-center gap-1.5 border-t border-[#F0F0F0] pt-1.5 text-[11px] text-[#A0A8B4]">
                        <Zap className="h-3 w-3 shrink-0" />
                        <span>
                          本轮 {msg.usage.totalTokens} tokens · 输入 {msg.usage.promptTokens} /
                          输出 {msg.usage.completionTokens}
                        </span>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div key={msg.id} className="flex flex-col items-end gap-1.5">
                  <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-[2px] bg-[#000000] px-4 py-3 text-sm leading-relaxed text-white md:max-w-[70%]">
                    {msg.content}
                  </div>
                </div>
              ),
            )}
          </div>
        )}
      </div>

      {/* 输入区 */}
      <div className="shrink-0 border-t border-[#E5E5E5] bg-white p-3 md:p-4">
        <div className="flex items-end gap-2">
          <textarea
            rows={1}
            value={input}
            placeholder={isStreaming ? "正在回复…" : "给 Agent 发消息…"}
            onChange={(e) => setInput(e.target.value)}
            onCompositionStart={() => {
              composingRef.current = true;
            }}
            onCompositionEnd={() => {
              composingRef.current = false;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !composingRef.current) {
                e.preventDefault();
                void handleSend();
              }
            }}
            className="max-h-32 min-h-11 flex-1 resize-none rounded-[2px] border border-[#E5E5E5] bg-white px-3.5 py-2.5 text-sm text-[#000000] placeholder:text-[#999999] outline-none focus:border-[#000000]"
          />

          <button
            aria-label={isStreaming ? "停止" : "发送"}
            onClick={isStreaming ? stop : () => void handleSend()}
            disabled={isStreaming ? false : !canSend}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[2px] bg-[#000000] text-white transition-opacity hover:opacity-85 disabled:opacity-30"
          >
            {isStreaming ? <Square className="h-4 w-4" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
        <p className="mt-2 hidden text-[11px] text-[#A0A8B4] lg:block">
          Enter 发送，Shift + Enter 换行
        </p>
      </div>
    </>
  );
}
