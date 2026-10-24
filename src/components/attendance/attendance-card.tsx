import Link from "next/link";
import { ArrowRight } from "lucide-react";
import {
  monthKey,
  weekdayShortLabel,
  type MonthDayView,
} from "@/lib/attendance/month-grid";
import { statusLabel } from "@/lib/attendance/schedule";
import { MonthGrid } from "./month-grid";

/**
 * 首页「工作日历」常驻卡（《功能/出勤日历》§2.2、《界面设计规范》§7.17）。
 *
 * **服务端组件**：整月 42 格的状态与「今天上不上班」都是服务端算好的 props，
 * 客户端只有格子点击与弹层（`MonthGrid` 里的那一小块）。
 *
 * 卡上只做两件事：看 + 改某一天（快捷操作）。**年月切换、「今天」、周期设置一律不在卡上**——
 * 那些是管理动作，只在工具页（§2.1 与待办卡能直接勾、便签卡能直接删同一性质）。
 * 整卡不承担「点哪都跳」：格子里有真实操作，跳转只走右上角的「管理」。
 *
 * 高度恒定：表头一行 + 固定 6 行 28px 格 + 标题区，任何月份都一样（42 格固定）。
 */
interface AttendanceCardProps {
  year: number;
  /** 1~12。 */
  month: number;
  /** 本月 42 格（含上下月补齐），由 `buildMonthView` 算好。 */
  days: MonthDayView[];
}

export function AttendanceCard({ year, month, days }: AttendanceCardProps) {
  const today = days.find((day) => day.isToday);

  return (
    <section aria-label="工作日历" className="rounded-[2px] bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-[#000000]">
          <span aria-hidden="true" className="h-3.5 w-[3px] bg-[#000000]" />
          工作日历
        </h2>
        <Link
          // 带上卡片当前显示的月份：跨月之后再点进来，落在的还是卡上那个月（§七「首页卡点进去月份不对」）
          href={`/tools/attendance-calendar?ym=${monthKey(year, month)}`}
          className="flex cursor-pointer items-center gap-0.5 text-xs text-[#666666] transition-colors hover:text-[#000000]"
        >
          管理
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      <p className="mt-1 text-xs text-[#8A8A8A]">
        {today ? (
          <>
            今天 {weekdayShortLabel(today.dayKey)} ·{" "}
            <span className="text-[#000000]">{statusLabel(today.status)}</span>
          </>
        ) : (
          "今天 · 未设定"
        )}
      </p>

      <div className="mt-2">
        <MonthGrid days={days} variant="compact" />
      </div>
    </section>
  );
}
