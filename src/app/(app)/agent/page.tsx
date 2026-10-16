import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { requireUser } from "@/lib/auth/current-user";

export const metadata: Metadata = {
  title: "Agent",
};

/** Agent（占位）：外壳已就位，内容待该功能立项后实现。 */
export default async function AgentPage() {
  await requireUser();

  return (
    <>
      <PageHeader
        title="Agent"
        description="智能助手，理解需求、调用工具、执行复杂任务"
      />
      <div className="px-4 py-4 md:px-6 md:py-6">
        <div className="rounded-[2px] border border-dashed border-[#D9D9D9] bg-white p-12 text-center">
          <p className="text-sm text-[#A0A8B4]">该功能开发中...</p>
        </div>
      </div>
    </>
  );
}
