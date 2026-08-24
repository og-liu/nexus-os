"use client";

import { useState } from "react";
import {
  Plus,
  Send,
  ArrowLeft,
  Bot,
  Zap,
  Loader2,
  Clock3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";

// ---------- Mock 数据 ----------

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Chat {
  id: string;
  title: string;
  updatedAt: string;
  preview: string;
  messages: Message[];
}

const initialChats: Chat[] = [
  {
    id: "chat-1",
    title: "整理本周技术文章",
    updatedAt: "刚刚",
    preview: "已存入知识库「AI Agent」分类",
    messages: [
      {
        role: "user",
        content: "帮我把这周收藏的技术文章整理一下，筛选出值得精读的。",
      },
      {
        role: "assistant",
        content:
          "好，我扫描了你本周收藏的 23 篇文章，按主题相关度和信息密度筛出 6 篇：\n\n1. Agent 记忆系统的三种设计模式\n2. RAG 检索优化的实战清单\n3. 工具调用（Tool Use）的失败兜底策略\n4. 多 Agent 协作的通信成本分析\n5. 本地知识库的增量索引方案\n6. 从 Chatbot 到 Agent：交互范式迁移\n\n建议优先读 1 和 4，和你当前的学习路线最贴。",
      },
      {
        role: "user",
        content: "第 1 篇和第 4 篇最相关，帮我存进知识库。",
      },
      {
        role: "assistant",
        content:
          "已存入知识库「AI Agent」分类，并生成摘要卡片。稍后可以在知识页查看和复习。",
      },
    ],
  },
  {
    id: "chat-2",
    title: "生成项目周报草稿",
    updatedAt: "2 小时前",
    preview: "周报草稿已生成，共 3 个板块",
    messages: [
      {
        role: "user",
        content: "根据我本周的提交记录和任务看板，生成周报草稿。",
      },
      {
        role: "assistant",
        content:
          "周报草稿已生成，共 3 个板块：本周进展（5 项）、风险与阻塞（1 项）、下周计划（4 项）。已同步到你的草稿箱，确认后可直接发送。",
      },
    ],
  },
  {
    id: "chat-3",
    title: "翻译 API 文档片段",
    updatedAt: "昨天",
    preview: "术语表已同步更新",
    messages: [
      {
        role: "user",
        content: "把这段 API 文档翻译成中文，注意保留代码示例。",
      },
      {
        role: "assistant",
        content:
          "翻译完成。代码示例原样保留，接口术语按你的术语表统一（如 stream → 流式响应）。术语表已同步更新 2 个新词条。",
      },
    ],
  },
  {
    id: "chat-4",
    title: "分析下载文件夹占用",
    updatedAt: "3 天前",
    preview: "已生成清理建议清单",
    messages: [
      {
        role: "user",
        content: "分析一下我的下载文件夹，哪些文件可以清理？",
      },
      {
        role: "assistant",
        content:
          "扫描完成：共 4.2 GB，其中 2.8 GB（67%）可安全清理——重复安装包 21 个、超过 90 天未访问的压缩包 14 个、临时截图 36 张。已生成清理建议清单，确认后可自动执行。",
      },
    ],
  },
];

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

// ---------- 页面 ----------

export default function AgentPage() {
  const [chats, setChats] = useState<Chat[]>(initialChats);
  const [activeChatId, setActiveChatId] = useState("chat-1");
  // 手机端视图切换：list=会话列表，chat=对话。md 及以上双栏常驻，不受此影响
  const [mobileView, setMobileView] = useState<"list" | "chat">("list");
  const [inputValue, setInputValue] = useState("");

  const activeChat = chats.find((c) => c.id === activeChatId);

  const handleSend = () => {
    const text = inputValue.trim();
    if (!text || !activeChat) return;
    setInputValue("");
    setChats((prev) =>
      prev.map((c) =>
        c.id === activeChatId
          ? {
              ...c,
              updatedAt: "刚刚",
              preview: text,
              messages: [
                ...c.messages,
                { role: "user", content: text },
                {
                  role: "assistant",
                  content: "（演示模式）Agent 接入后，这里会返回真实响应。",
                },
              ],
            }
          : c,
      ),
    );
  };

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
            "w-full shrink-0 flex-col overflow-y-auto border-r border-[#E5E5E5] bg-[#F5F5F5] md:flex md:w-[260px]",
            mobileView === "list" ? "flex" : "hidden",
          )}
        >
          {/* 新对话 */}
          <div className="p-3">
            <button className="flex w-full items-center justify-center gap-2 rounded-[2px] bg-[#000000] px-3 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-85">
              <Plus className="h-4 w-4" />
              新对话
            </button>
          </div>

          {/* 会话列表 */}
          <nav className="flex-1 space-y-0.5 px-3">
            {chats.map((chat) => (
              <button
                key={chat.id}
                onClick={() => {
                  setActiveChatId(chat.id);
                  setMobileView("chat");
                }}
                className={cn(
                  "flex w-full flex-col gap-0.5 rounded-[2px] px-3 py-2.5 text-left transition-colors",
                  activeChatId === chat.id
                    ? "bg-[#d5e3f6]"
                    : "hover:bg-[#ededed]",
                )}
              >
                <span className="truncate text-sm font-medium text-black">
                  {chat.title}
                </span>
                <span className="flex items-center gap-1.5 text-xs text-[#8A8A8A]">
                  <span className="truncate">{chat.preview}</span>
                  <span className="shrink-0 text-[#A0A8B4]">
                    {chat.updatedAt}
                  </span>
                </span>
              </button>
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
            "min-w-0 flex-1 flex-col bg-[#ECECEC] md:flex",
            mobileView === "chat" ? "flex" : "hidden",
          )}
        >
          {/* 对话标题条：手机端带返回按钮 */}
          <div className="flex h-12 shrink-0 items-center gap-2 border-b border-[#E5E5E5] bg-white px-3 md:px-4">
            <button
              aria-label="返回会话列表"
              onClick={() => setMobileView("list")}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[2px] text-[#666666] transition-colors hover:bg-[#ECECEC] hover:text-[#000000] md:hidden"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <span className="truncate text-sm font-medium text-black">
              {activeChat?.title}
            </span>
          </div>

          {/* 消息流 */}
          <div className="flex-1 overflow-y-auto px-4 py-4 md:px-6 md:py-6">
            <div className="mx-auto flex max-w-3xl flex-col gap-5">
              {activeChat?.messages.map((msg, i) =>
                msg.role === "assistant" ? (
                  <div key={i} className="flex items-start gap-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[2px] bg-[#000000]">
                      <Bot className="h-4.5 w-4.5 text-white" />
                    </div>
                    <div className="rounded-[2px] bg-white px-4 py-3 text-sm leading-relaxed text-[#1F1F1F]">
                      {msg.content}
                    </div>
                  </div>
                ) : (
                  <div key={i} className="flex justify-end">
                    <div className="max-w-[85%] rounded-[2px] bg-[#000000] px-4 py-3 text-sm leading-relaxed text-white md:max-w-[70%]">
                      {msg.content}
                    </div>
                  </div>
                ),
              )}
            </div>
          </div>

          {/* 输入区 */}
          <div className="shrink-0 border-t border-[#E5E5E5] bg-white p-3 md:p-4">
            <div className="mx-auto flex max-w-3xl items-end gap-2">
              <textarea
                rows={1}
                value={inputValue}
                placeholder="给 Agent 发消息…"
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
                disabled={!inputValue.trim()}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[2px] bg-[#000000] text-white transition-opacity hover:opacity-85 disabled:opacity-30"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            <p className="mx-auto mt-2 hidden max-w-3xl text-[11px] text-[#A0A8B4] md:block">
              Enter 发送，Shift + Enter 换行
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
