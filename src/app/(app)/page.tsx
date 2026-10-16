import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { requireUser } from "@/lib/auth/current-user";

export const metadata: Metadata = {
  title: "总览",
};

/**
 * 总览（首页，《界面设计规范》§7.17）。
 *
 * 外壳已落地：登录成功后直接看到应用本身；内容仍是占位——真正的仪表盘
 * 设计出来之前，先用「开发中」虚线框占住位置，不做预演式的设计。
 * 未登录访问这里会跳登录页（检查贴着页面自己，不靠 layout）。
 */
export default async function OverviewPage() {
  await requireUser();

  return (
    <>
      <PageHeader
        title="总览"
        description="串联工具、知识与智能，新一代私人专属数字操作系统"
      />
      <div className="px-4 py-4 md:px-6 md:py-6">
        <div className="rounded-[2px] border border-dashed border-[#D9D9D9] bg-white p-12 text-center">
          <p className="text-sm text-[#A0A8B4]">该功能开发中...</p>
        </div>
      </div>
    </>
  );
}
