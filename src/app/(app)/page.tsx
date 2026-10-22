import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { StickyNotesCard } from "@/components/dashboard/sticky-notes-card";
import { TodoCard } from "@/components/todos/todo-card";
import { getDb } from "@/lib/auth/db";
import { requireUser } from "@/lib/auth/current-user";
import { listNotes } from "@/lib/sticky-notes/notes";
import { listTodos } from "@/lib/todos/todos";

export const metadata: Metadata = {
  title: "总览",
};

/**
 * 总览（首页，《界面设计规范》§7.17、《功能/便签》§2.2、《功能/待办清单》§2.1）。
 *
 * 外壳已落地：登录成功后直接看到应用本身。
 * 骨架是「主区 2/3 + 常驻栏 1/3」：≥ xl 时便签卡占左 2 列、待办卡占右 1 列；
 * < xl 单列，且**待办卡排在便签卡之前**（「今天还剩什么」比「随手记」更该第一眼看到）。
 *
 * 单列时用 DOM 顺序保证「待办在前」（Tab 焦点顺序与视觉顺序一致，不靠 CSS 视觉翻转）；
 * ≥ xl 时用显式的 `col-start` / `row-start` 把两张卡放回左右两栏，不改 DOM 顺序。
 *
 * 原「该功能开发中」虚线占位已移除——它让总览看起来像没做完的页面。
 * 未登录访问这里会跳登录页（检查贴着页面自己，不靠 layout）。
 */
export default async function OverviewPage() {
  const user = await requireUser();
  const notes = listNotes(getDb(), user.id, 3);
  const todos = listTodos(getDb(), user.id, 3);

  return (
    <>
      <PageHeader
        title="总览"
        description="串联工具、知识与智能，新一代私人专属数字操作系统"
      />
      <div className="grid grid-cols-1 gap-4 px-4 py-4 md:px-6 md:py-6 xl:grid-cols-3">
        <div className="xl:col-start-3 xl:row-start-1">
          <TodoCard
            todos={todos.open}
            done={todos.done}
            total={todos.total}
          />
        </div>
        <div className="xl:col-span-2 xl:col-start-1 xl:row-start-1">
          <StickyNotesCard notes={notes} />
        </div>
      </div>
    </>
  );
}
