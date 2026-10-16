import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { UserControl } from "@/components/layout/user-control";
import { requireUser } from "@/lib/auth/current-user";

export const metadata: Metadata = {
  title: "文件",
};

/** 文件（占位）：外壳已就位，内容待该功能立项后实现。 */
export default async function FilesPage() {
  const user = await requireUser();

  return (
    <>
      <PageHeader
        title="文件"
        description="管理本地文件和目录，支持以图找图等高级功能"
      >
        <UserControl username={user.username} />
      </PageHeader>
      <div className="px-4 py-4 md:px-6 md:py-6">
        <div className="rounded-[2px] border border-dashed border-[#D9D9D9] bg-white p-12 text-center">
          <p className="text-sm text-[#A0A8B4]">该功能开发中...</p>
        </div>
      </div>
    </>
  );
}
