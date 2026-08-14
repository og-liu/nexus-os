import { PageHeader } from "@/components/page-header";

export default function AgentPage() {
  return (
    <>
      <PageHeader description="智能助手，理解需求、调用工具、执行复杂任务" />
      <div className="space-y-6 px-6 py-4">
        <div className="rounded-lg border border-dashed border-border bg-white p-12 text-center">
          <p className="text-sm text-muted-foreground">
            AI Agent 功能开发中...
          </p>
        </div>
      </div>
    </>
  );
}
