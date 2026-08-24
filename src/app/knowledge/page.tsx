import { PageHeader } from "@/components/page-header";

export default function KnowledgePage() {
  return (
    <>
      <PageHeader title="知识" description="个人知识管理中心，让知识可被 AI 理解和调用" />
      <div className="space-y-6 px-6 py-4">
        <div className="rounded-lg border border-dashed border-border bg-white p-12 text-center">
          <p className="text-sm text-muted-foreground">知识库功能开发中...</p>
        </div>
      </div>
    </>
  );
}
