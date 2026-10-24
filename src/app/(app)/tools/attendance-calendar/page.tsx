import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { AttendanceMobileBar } from "@/components/attendance/attendance-mobile-bar";
import { CalendarToolbar } from "@/components/attendance/calendar-toolbar";
import { MonthGrid } from "@/components/attendance/month-grid";
import { ToolHeader } from "@/components/tools/tool-header";
import { findToolBySlug } from "@/components/tools/tool-catalog";
import {
  getOverride,
  getSetting,
  listOverrides,
  overridesToMap,
} from "@/lib/attendance/data";
import {
  buildMonthGrid,
  parseDayKey,
  parseMonthKey,
  saturdayOfWeek,
  weekdayShortLabel,
} from "@/lib/attendance/month-grid";
import { buildMonthView } from "@/lib/attendance/month-view";
import { resolveDayStatus, statusLabel } from "@/lib/attendance/schedule";
import { requireUser } from "@/lib/auth/current-user";
import { getDb } from "@/lib/auth/db";
import { formatDateKey } from "@/lib/datetime/format";
import { shanghaiParts } from "@/lib/datetime/shanghai";

export const metadata: Metadata = {
  title: "工作日历",
};

/**
 * 工作日历页（《功能/出勤日历》§2.3、《界面设计规范》§7.21）。
 *
 * **骨架与便签 / 待办两个工具页一致**（2026-10-23 联调第三轮改的）：
 * 手机一行 `ToolMobileBar`（汉堡 + 主操作「今天」，桌面同款按钮在 `ToolHeader` 右侧），
 * 下面 `ToolHeader` 工具信息条，再下面才是内容——**没有 `PageHeader`**。
 * 上一版用了 `PageHeader`（写「工具」+ 返回）跟别的工具页长得不一样，被主人指出来。
 *
 * 内容区两栏（≥ xl）：
 * - 左：工具栏 + 月历，占满剩余宽度——上一版限宽 820px 左对齐，宽屏右侧空一大片；
 * - 右：概览（本月 / 今天 / 本周六）+ 图例说明，280–300px。
 *
 * 小屏单列，顺序是「概览 → 月历 → 说明」：手机上先看到「这周六上不上班」，
 * 说明也跟在本页内容里，不用滚到页面最底部才看得见。
 *
 * 农历 / 节日 / 节气在这里算（`buildMonthView` → `day-label.ts`，全项目唯一碰
 * `lunar-javascript` 的地方之一），客户端只拿到算好的字符串——436KB 的农历库不进浏览器。
 *
 * 没设过制度的人按内置默认制度（单双休、从 2026-10-24 那周起双休周）算，所以界面上
 * 永远有答案，不需要先跑一趟设置。
 */
interface WorkCalendarPageProps {
  /** `?ym=2026-10`：要看的月份；不传或非法就用本月。 */
  searchParams: Promise<{ ym?: string | string[] }>;
}

export default async function WorkCalendarPage({
  searchParams,
}: WorkCalendarPageProps) {
  const user = await requireUser();
  const db = getDb();
  const tool = findToolBySlug("attendance-calendar");

  const now = shanghaiParts(new Date());
  const todayKey = formatDateKey(now);

  const params = await searchParams;
  const raw = Array.isArray(params.ym) ? params.ym[0] : params.ym;
  // 非法值当没传处理（用户看到的还是本月），不做报错
  const view = parseMonthKey(raw) ?? { year: now.year, month: now.month };

  const setting = getSetting(db, user.id);
  const monthCells = buildMonthGrid(view.year, view.month);
  const overrides = overridesToMap(
    listOverrides(db, user.id, monthCells[0].dayKey, monthCells[41].dayKey),
  );
  const days = buildMonthView({
    year: view.year,
    month: view.month,
    todayKey,
    setting,
    overrides,
    withLabels: true,
  });

  // 概览：这个月上了几天班、今天什么状态、这周六上不上班
  const monthDays = days.filter((day) => day.inMonth);
  const workDays = monthDays.filter((day) => day.status === "work").length;
  const offDays = monthDays.filter((day) => day.status === "off").length;

  const todayStatus = resolveDayStatus(
    todayKey,
    setting,
    getOverride(db, user.id, todayKey),
  ).status;

  const saturdayKey = saturdayOfWeek(todayKey);
  const saturdayStatus = resolveDayStatus(
    saturdayKey,
    setting,
    getOverride(db, user.id, saturdayKey),
  ).status;
  const saturdayParts = parseDayKey(saturdayKey);

  return (
    <>
      <AttendanceMobileBar />

      <div className="px-4 py-4 md:px-6 md:py-6">
        <div className="mx-auto w-full max-w-[1360px]">
          {tool ? (
            <ToolHeader
              tool={tool}
              actions={
                /* 桌面端主操作：与便签「新建便签」同一个位置、同一种样式 */
                <Link
                  href="/tools/attendance-calendar"
                  className="flex h-8 cursor-pointer items-center gap-1.5 rounded-[2px] bg-[#000000] px-3 text-xs font-medium text-white transition-colors hover:bg-[#333333]"
                >
                  <CalendarDays className="h-3.5 w-3.5" />
                  今天
                </Link>
              }
            />
          ) : null}

          {/*
            两栏：≥ xl 时「主区（工具栏 + 月历）| 侧栏（概览 + 图例说明）」。
            侧栏两张卡包在一个 aside 里，DOM 顺序在**主区之前**——窄屏（单列）时
            概览与图例排在上面、日历详情在下面（2026-10-23 联调主人要求）；
            桌面靠 grid 把它放到右栏。
            分两个 grid item 的话，主区跨两行会把第一行撑高，两张卡中间凭空多出一段空白。
          */}
          <div className="mt-4 grid grid-cols-1 items-start gap-4 xl:mt-6 xl:grid-cols-[minmax(0,1fr)_300px] xl:gap-6">
            <aside className="space-y-4 xl:col-start-2 xl:row-start-1">
              {/* 概览 */}
              <section aria-label="出勤概览" className="@container rounded-[2px] bg-white p-5">
                <div className="flex items-center gap-2">
                  <span aria-hidden="true" className="h-3.5 w-[3px] bg-[#000000]" />
                  <h2 className="text-sm font-semibold text-[#000000]">概览</h2>
                </div>

                {/*
                  按**卡片自己**的宽度排（容器查询）：右栏只有 300px 时竖排三行、
                  屏幕上只有一栏时（平板）自动变三列——用视口断点会犯「窗口宽、卡片窄
                  却排三列」的错（§7.17 便签卡那里踩过同一个坑）。
                */}
                <dl className="mt-3 grid grid-cols-1 gap-2 @lg:grid-cols-3 @lg:gap-6">
                  <div className="flex items-baseline justify-between gap-3 @lg:block">
                    <dt className="text-xs text-[#8A8A8A]">{view.month} 月</dt>
                    <dd className="text-sm tabular-nums text-[#000000] @lg:mt-0.5">
                      上班 {workDays} 天 · 休息 {offDays} 天
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3 @lg:block">
                    <dt className="text-xs text-[#8A8A8A]">今天</dt>
                    <dd className="text-sm text-[#000000] @lg:mt-0.5">
                      {weekdayShortLabel(todayKey)} · {statusLabel(todayStatus)}
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3 @lg:block">
                    <dt className="text-xs text-[#8A8A8A]">本周六</dt>
                    <dd className="text-sm text-[#000000] @lg:mt-0.5">
                      {saturdayParts
                        ? `${saturdayParts.month}月${saturdayParts.day}日 · `
                        : ""}
                      {statusLabel(saturdayStatus)}
                    </dd>
                  </div>
                </dl>
              </section>

              {/* 图例与说明 */}
              <section aria-label="图例与说明" className="rounded-[2px] bg-white p-5">
                <div className="flex items-center gap-2">
                  <span aria-hidden="true" className="h-3.5 w-[3px] bg-[#000000]" />
                  <h2 className="text-sm font-semibold text-[#000000]">图例</h2>
                </div>

                <ul className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-[#666666]">
                  <li className="flex items-center gap-1.5">
                    <span className="bg-[#000000] px-1 text-[10px] leading-[15px] text-white">
                      班
                    </span>
                    上班
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="bg-[#F5F5F5] px-1 text-[10px] leading-[15px] text-[#666666]">
                      休
                    </span>
                    休息
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span
                      aria-hidden="true"
                      className="h-1.5 w-1.5 rounded-full bg-[#000000]"
                    />
                    今天
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span
                      aria-hidden="true"
                      className="h-1 w-3 rounded-full bg-[#000000]"
                    />
                    手动改过
                  </li>
                </ul>

                <p className="mt-3 border-t border-[#F0F0F0] pt-3 text-xs leading-relaxed text-[#999999]">
                  点任意一天可以改那天的状态；周六的规律（单休 / 双休 /
                  单双休）在「设置」里改，改动只影响推算，手动改过的日子优先。
                </p>
              </section>
            </aside>
            {/*
              主区一张白卡包住「工具栏 + 表头 + 月历」。
              只把月历留白、工具栏与表头落在页面灰底上时，中间那一横条会像被掏空
              （2026-10-23 联调主人指出），连成一片才是一个完整的日历。
            */}
            <div className="rounded-[2px] bg-white p-4 md:p-5 xl:col-start-1 xl:row-start-1">
              <CalendarToolbar
                year={view.year}
                month={view.month}
                setting={setting}
                todayKey={todayKey}
              />

              <div className="mt-3 md:mt-4">
                <MonthGrid days={days} variant="full" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
