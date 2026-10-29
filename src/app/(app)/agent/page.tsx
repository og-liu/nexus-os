import type { Metadata } from "next";
import { AgentChat } from "@/components/agent/agent-chat";
import { PageHeader } from "@/components/layout/page-header";
import { requireUser } from "@/lib/auth/current-user";

export const metadata: Metadata = {
  title: "Agent",
};

/**
 * Agent 页（第一版）：能真的跟模型对话，仅此而已。
 *
 * 这一版刻意**不做**的事，以及为什么：
 * - 会话列表 / 多会话切换：没有落库，做出来是个永远空的抽屉
 * - 工具调用、任务规划、计划进度面板：那是后面几期的活，先让这条线跑通
 * - Markdown 渲染：先用纯文本，样式留到体验层统一做
 *
 * `h-[calc(100%-4rem)]` 里的 4rem 就是 PageHeader 的高度（h-16）——
 * 对话区要占满剩下的全部高度，输入框钉在底部，消息区自己滚。
 */
export default async function AgentPage() {
  await requireUser();

  return (
    <>
      <PageHeader
        title="Agent"
        description="智能助手，理解需求、调用工具、执行复杂任务"
      />
      <div className="flex h-[calc(100%-4rem)] flex-col">
        <AgentChat />
      </div>
    </>
  );
}
