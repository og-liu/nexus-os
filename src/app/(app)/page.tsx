import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { StickyNotesCard } from "@/components/dashboard/sticky-notes-card";
import { getDb } from "@/lib/auth/db";
import { requireUser } from "@/lib/auth/current-user";
import { listNotes } from "@/lib/sticky-notes/notes";

export const metadata: Metadata = {
  title: "总览",
};

/**
 * 总览（首页，《界面设计规范》§7.17、《功能/便签》§2.2）。
 *
 * 外壳已落地：登录成功后直接看到应用本身。本单只把右栏的便签卡立起来——
 * 它是首页目前唯一一块真内容，其余区域仍是「开发中」占位，总览整体设计不动。
 *
 * 布局：< xl 单列且便签卡在前（压在占位框下面等于把它藏起来）；
 * xl 起回到「左 2 列占位 + 右 1 列便签卡」。
 * 未登录访问这里会跳登录页（检查贴着页面自己，不靠 layout）。
 */
export default async function OverviewPage() {
  const user = await requireUser();
  const notes = listNotes(getDb(), user.id, 3);

  return (
    <>
      <PageHeader
        title="总览"
        description="串联工具、知识与智能，新一代私人专属数字操作系统"
      />
      <div className="grid grid-cols-1 gap-4 px-4 py-4 md:px-6 md:py-6 xl:grid-cols-3">
        <div className="order-1 xl:order-2 xl:col-span-1">
          <StickyNotesCard notes={notes} />
        </div>
        <div className="order-2 xl:order-1 xl:col-span-2">
          <div className="rounded-[2px] border border-dashed border-[#D9D9D9] bg-white p-12 text-center">
            <p className="text-sm text-[#A0A8B4]">该功能开发中...</p>
          </div>
        </div>
      </div>
    </>
  );
}
