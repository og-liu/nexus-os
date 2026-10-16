import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { UserControl } from "@/components/layout/user-control";
import { requireUser } from "@/lib/auth/current-user";

export const metadata: Metadata = {
  title: "知识",
};

/** 知识（占位）：外壳已就位，内容待该功能立项后实现。 */
export default async function KnowledgePage() {
  const user = await requireUser();

  return (
    <>
      <PageHeader
        title="知识"
        description="个人知识管理中心，让知识可被 AI 理解和调用"
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
