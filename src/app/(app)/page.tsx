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
 * 外壳已落地：登录成功后直接看到应用本身。首页目前只有便签卡一块真内容，
 * 所以便签卡占满内容区宽度；卡片内部的便签列表按断点分栏（< md 单列 / md 2 列 / xl 3 列）。
 *
 * 原「该功能开发中」虚线占位已移除——它让总览看起来像没做完的页面。
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
      <div className="px-4 py-4 md:px-6 md:py-6">
        <StickyNotesCard notes={notes} />
      </div>
    </>
  );
}
