import { PageHeader } from "@/components/page-header";

export default function FilesPage() {
  return (
    <>
      <PageHeader title="文件" description="管理本地文件和目录，支持以图找图等高级功能" />
      <div className="space-y-6 px-6 py-4">
        <div className="rounded-lg border border-dashed border-border bg-white p-12 text-center">
          <p className="text-sm text-muted-foreground">文件管理功能开发中...</p>
        </div>
      </div>
    </>
  );
}
