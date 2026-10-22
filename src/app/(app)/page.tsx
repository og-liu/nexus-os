import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { DatetimePanel } from "@/components/dashboard/datetime-panel";
import { StickyNotesCard } from "@/components/dashboard/sticky-notes-card";
import { TodoCard } from "@/components/todos/todo-card";
import { getDb } from "@/lib/auth/db";
import { requireUser } from "@/lib/auth/current-user";
import { getTodaySnapshot } from "@/lib/datetime/today";
import { listNotes } from "@/lib/sticky-notes/notes";
import { listTodos } from "@/lib/todos/todos";

export const metadata: Metadata = {
  title: "总览",
};

/**
 * 总览（首页，《界面设计规范》§7.17、《功能/便签》§2.2、《功能/待办清单》§2.1、
 * 《功能/日期时间面板》§2.1）。
 *
 * 外壳已落地：登录成功后直接看到应用本身。
 *
 * 现在只有三块拼图，**逐块各占一行、左对齐**，宽度按旧版总览页参考图预估：
 * - 日期时间面板 372px（旧版同一张卡就是 372px）
 * - 待办卡 / 便签卡 430px（旧版右栏实测 408–442px）
 *
 * 三块一行会被挤窄（2026-10-22 联调否掉了那个版本）；等卡片补齐，再按旧版栅格
 * （主区 2/3 + 常驻栏 1/3）拼回去，尺寸口径已经对齐参考图。
 *
 * < xl 单列，顺序是「面板 → 待办 → 便签」：面板是页头级信息永远第一；
 * 待办排在便签之前（「今天还剩什么」比「随手记」更该第一眼看到）。
 *
 * 单列时用 DOM 顺序保证这个次序（Tab 焦点顺序与视觉顺序一致，不靠 CSS 视觉翻转）；
 * ≥ xl 时用显式的 `col-start` / `row-start` 把三块摆进三列，不改 DOM 顺序。
 *
 * 面板的农历 / 节日 / 年度进度在这里算一次（`getTodaySnapshot`，只在服务端），
 * 客户端只接管秒级时钟；跨天由时钟组件 `router.refresh()` 触发本页重算。
 *
 * 原「该功能开发中」虚线占位已移除——它让总览看起来像没做完的页面。
 * 未登录访问这里会跳登录页（检查贴着页面自己，不靠 layout）。
 */
export default async function OverviewPage() {
  const user = await requireUser();
  const notes = listNotes(getDb(), user.id, 3);
  const todos = listTodos(getDb(), user.id, 3);
  const today = getTodaySnapshot(new Date());

  return (
    <>
      <PageHeader
        title="总览"
        description="串联工具、知识与智能，新一代私人专属数字操作系统"
      />
      {/*
        逐块展示（过渡形态）：三块拼图各占一行、左对齐，宽度按旧版总览页的参考图预估
        （旧版截图是 2x，折算成 CSS 像素：面板 372、右栏里的「今日待办」「便签」408–442 → 取 430）。
        窄屏用 max-w 限制、屏窄于它时自动满宽。

        为什么先这样摆：现在只有 3 块拼图，硬拼成一行每块都被挤窄（2026-10-22 联调否掉了三块一行的版本）。
        以后卡片补齐了，再按旧版的栅格（主区 2/3 + 常驻栏 1/3）拼回去，每块尺寸都已对齐参考图。
      */}
      <div className="space-y-4 px-4 py-4 md:px-6 md:py-6">
        <div className="max-w-[372px]">
          <DatetimePanel username={user.username} today={today} />
        </div>
        <div className="max-w-[430px]">
          <TodoCard todos={todos.open} done={todos.done} total={todos.total} />
        </div>
        <div className="max-w-[430px]">
          <StickyNotesCard notes={notes} />
        </div>
      </div>
    </>
  );
}
