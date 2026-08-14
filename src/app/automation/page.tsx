import { PageHeader } from "@/components/page-header";

export default function AutomationPage() {
  return (
    <>
      <PageHeader description="定义工作流，让重复任务自动执行" />
      <div className="space-y-6 px-6 py-4">
        <div className="rounded-lg border border-dashed border-border bg-white p-12 text-center">
          <p className="text-sm text-muted-foreground">自动化功能开发中...</p>
        </div>
      </div>
    </>
  );
}
