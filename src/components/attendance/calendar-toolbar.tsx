"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Settings2 } from "lucide-react";
import { addMonths, monthKey } from "@/lib/attendance/month-grid";
import type { AttendanceSetting } from "@/lib/attendance/schedule";
import { SettingPanel } from "./setting-panel";

/**
 * 工作日历页的工具栏与制度设置（《功能/工作日历》§2.3、§2.5）。
 *
 * 两件事都只在**工具页**出现，首页工作日历卡上没有（§2.1 分工：总览卡只做展示 + 快捷操作）：
 * 1. 年 / 月切换——切月份走 URL（`?ym=2026-11`），服务端算整月，
 *    链接可分享、刷新不丢月份；用 `router.push` 而不是 `<Link>` 是为了让旧数据留到
 *    新数据到（`useTransition` 里不闪白）。「今天」不在这里：桌面在 ToolHeader 右侧、
 *    手机在 ToolMobileBar 上（与便签 / 待办同构）；
 * 2. 「设置」——周六制度三选一：单休（每周六上班）/ 双休（每周六休息）/
 *    单双休（大小周，单休周与双休周交替）。单双休还要选**从哪一周起算**：
 *    锚点默认落在「今天所在那周的周六」，再选那一周是单休还是双休。
 *    手动改过的日子优先级更高，换制度也冲不掉。
 *
 * 制度设置面板单独一个文件（`setting-panel.tsx`）：它自己也带状态与异步写操作，
 * 塞在工具栏里会把两个组件的负担混在一起。
 */
interface CalendarToolbarProps {
  year: number;
  /** 1~12。 */
  month: number;
  setting: AttendanceSetting | null;
  /** 北京时间的今天：单双休的默认锚点取「今天所在那周的周六」。 */
  todayKey: string;
}

export function CalendarToolbar({
  year,
  month,
  setting,
  todayKey,
}: CalendarToolbarProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [settingsOpen, setSettingsOpen] = useState(false);

  function navigate(next: { year: number; month: number }) {
    const href = `/tools/attendance-calendar?ym=${monthKey(next.year, next.month)}`;
    startTransition(() => router.push(href));
  }

  return (
    <div className="relative flex flex-wrap items-center gap-2">
      {/* 年切换：‹ 2026 年 › */}
      <div className="flex h-7 items-center rounded-[2px] bg-[#F5F5F5] text-xs text-[#666666]">
        <button
          type="button"
          aria-label="上一年"
          onClick={() => navigate(addMonths({ year, month }, -12))}
          className="flex h-7 w-6 cursor-pointer items-center justify-center rounded-[2px] transition-colors hover:bg-[#ECECEC]"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <span className="px-1 tabular-nums text-[#000000]">{year} 年</span>
        <button
          type="button"
          aria-label="下一年"
          onClick={() => navigate(addMonths({ year, month }, 12))}
          className="flex h-7 w-6 cursor-pointer items-center justify-center rounded-[2px] transition-colors hover:bg-[#ECECEC]"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* 月切换：‹ 10 月 › */}
      <div className="flex h-7 items-center rounded-[2px] bg-[#F5F5F5] text-xs text-[#666666]">
        <button
          type="button"
          aria-label="上个月"
          onClick={() => navigate(addMonths({ year, month }, -1))}
          className="flex h-7 w-6 cursor-pointer items-center justify-center rounded-[2px] transition-colors hover:bg-[#ECECEC]"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <span className="px-1 tabular-nums text-[#000000]">{month} 月</span>
        <button
          type="button"
          aria-label="下个月"
          onClick={() => navigate(addMonths({ year, month }, 1))}
          className="flex h-7 w-6 cursor-pointer items-center justify-center rounded-[2px] transition-colors hover:bg-[#ECECEC]"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          aria-expanded={settingsOpen}
          onClick={() => setSettingsOpen((open) => !open)}
          className="flex h-7 cursor-pointer items-center gap-1 rounded-[2px] px-2 text-xs text-[#666666] transition-colors hover:text-[#000000]"
        >
          <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
          设置
        </button>
      </div>

      {settingsOpen ? (
        <SettingPanel
          setting={setting}
          todayKey={todayKey}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
    </div>
  );
}
