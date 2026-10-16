import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { requireUser } from "@/lib/auth/current-user";

export const metadata: Metadata = {
  title: "设置",
};

/** 设置（占位）：外壳已就位，内容待该功能立项后实现。 */
export default async function SettingsPage() {
  await requireUser();

  return (
    <>
      <PageHeader
        title="设置"
        description="配置 AI 模型、工具目录、系统偏好等"
      />
      <div className="px-4 py-4 md:px-6 md:py-6">
        <div className="rounded-[2px] border border-dashed border-[#D9D9D9] bg-white p-12 text-center">
          <p className="text-sm text-[#A0A8B4]">该功能开发中...</p>
        </div>
      </div>
    </>
  );
}
