import type { Metadata } from "next";
import { AttendanceCard } from "@/components/attendance/attendance-card";
import { DatetimePanel } from "@/components/dashboard/datetime-panel";
import { QuoteCard } from "@/components/dashboard/quote-card";
import { StickyNotesCard } from "@/components/dashboard/sticky-notes-card";
import { PageHeader } from "@/components/layout/page-header";
import { TodoCard } from "@/components/todos/todo-card";
import {
  getSetting,
  listOverrides,
  overridesToMap,
} from "@/lib/attendance/data";
import { buildMonthGrid } from "@/lib/attendance/month-grid";
import { buildMonthView } from "@/lib/attendance/month-view";
import { getDb } from "@/lib/auth/db";
import { requireUser } from "@/lib/auth/current-user";
import { getTodaySnapshot } from "@/lib/datetime/today";
import { shanghaiParts } from "@/lib/datetime/shanghai";
import { quoteForDateKey } from "@/lib/quote/daily";
import { listNotes } from "@/lib/sticky-notes/notes";
import { listTodos } from "@/lib/todos/todos";

export const metadata: Metadata = {
  title: "总览",
};

/**
 * 总览（首页，《界面设计规范》§7.17、《功能/便签》§2.2、《功能/待办清单》§2.1、
 * 《功能/日期时间面板》§2.1、《功能/每日一句》§2.1、《功能/工作日历》§2.2）。
 *
 * 外壳已落地：登录成功后直接看到应用本身。
 *
 * 五块拼图**逐块各占一行、左对齐**，宽度按旧版总览页参考图预估：
 * - 日期时间面板 / 工作日历卡 / 待办卡 / 便签卡 / 每日一句卡都是 430px
 *   （面板原本按旧版参考图定 372px，2026-10-23 联调时主人要求五块先统一宽度）
 * - 工作日历卡 / 待办卡 / 便签卡 / 每日一句卡 430px（旧版右栏实测 408–442px）
 *
 * 排成一行每块都会被挤窄（2026-10-22 联调否掉了那个版本）；等卡片补齐，再按旧版栅格
 * （主区 2/3 + 常驻栏 1/3）拼回去，尺寸口径已经对齐参考图。
 *
 * 顺序是「面板 → 出勤 → 待办 → 便签 → 每日一句」：面板与工作日历卡都是「今天」的即时信息
 * （今天到底上不上班），同属页头级信息，所以工作日历卡紧跟面板；待办排在便签之前
 * （「今天还剩什么」比「随手记」更该第一眼看到）；每日一句是氛围信息，放最后。
 *
 * 没有栅格、没有 `col-start` / `row-start`：五块就是竖列里顺序排列的五个 div，
 * 各自 `max-w-*` 限宽，DOM 顺序天然等于视觉顺序（Tab 焦点顺序也随之正确）。
 *
 * 面板的农历 / 节日 / 年度进度、工作日历卡的整月状态都在这里算一次（只在服务端），
 * 农历库不进浏览器；工作日历卡的「今天」框与「今天 · 休息」跟着 `today.dateKey` 走，
 * 跨天由时钟组件 `router.refresh()` 触发本页重算。
 *
 * 原「该功能开发中」虚线占位已移除——它让总览看起来像没做完的页面。
 * 未登录访问这里会跳登录页（检查贴着页面自己，不靠 layout）。
 */
export default async function OverviewPage() {
  const user = await requireUser();
  const db = getDb();
  const now = new Date();

  const notes = listNotes(db, user.id, 3);
  const todos = listTodos(db, user.id, 3);
  const today = getTodaySnapshot(now);
  const quote = quoteForDateKey(today.dateKey);

  // 工作日历卡：本月（北京时间）42 格。覆盖只捞这 42 天的区间，一次查询。
  const todayParts = shanghaiParts(now);
  const monthCells = buildMonthGrid(todayParts.year, todayParts.month);
  const attendanceDays = buildMonthView({
    year: todayParts.year,
    month: todayParts.month,
    todayKey: today.dateKey,
    setting: getSetting(db, user.id),
    overrides: overridesToMap(
      listOverrides(db, user.id, monthCells[0].dayKey, monthCells[41].dayKey),
    ),
  });

  return (
    <>
      <PageHeader
        title="总览"
        description="串联工具、知识与智能，新一代私人专属数字操作系统"
      />
      {/*
        逐块展示（过渡形态）：五块拼图各占一行、左对齐，宽度按旧版总览页的参考图预估
        （旧版截图是 2x，折算成 CSS 像素：右栏里的「今日待办」「便签」408–442 → 取 430；
        面板原本 372，2026-10-23 联调时先统一成 430）。
        窄屏用 max-w 限制、屏窄于它时自动满宽。

        为什么先这样摆：现在只有 5 块拼图，硬拼成一行每块都被挤窄（2026-10-22 联调否掉了三块一行的版本）。
        以后卡片补齐了，再按旧版的栅格（主区 2/3 + 常驻栏 1/3）拼回去，每块尺寸都已对齐参考图。
      */}
      <div className="space-y-4 px-4 py-4 md:px-6 md:py-6">
        <div className="max-w-[430px]">
          <DatetimePanel username={user.username} today={today} />
        </div>
        <div className="max-w-[430px]">
          <AttendanceCard
            year={todayParts.year}
            month={todayParts.month}
            days={attendanceDays}
          />
        </div>
        <div className="max-w-[430px]">
          <TodoCard todos={todos.open} done={todos.done} total={todos.total} />
        </div>
        <div className="max-w-[430px]">
          <StickyNotesCard notes={notes} />
        </div>
        <div className="max-w-[430px]">
          {/*
            key 用日期键：跨天时（零点 router.refresh）React 会重挂载卡片，
            把「换一句」的本地状态丢掉、回到新一天那句；同一天刷新则保持服务端那句。
          */}
          <QuoteCard
            key={today.dateKey}
            index={quote.index}
            body={quote.body}
            author={quote.author}
          />
        </div>
      </div>
    </>
  );
}
