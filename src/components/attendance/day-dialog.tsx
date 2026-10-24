"use client";

import { useEffect, useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import {
  followAutoAction,
  setDayStatusAction,
  type AttendanceActionResult,
  type AttendanceDayResult,
} from "@/lib/attendance/actions";
import { weekdayShortLabel, type MonthDayView } from "@/lib/attendance/month-grid";
import { statusLabel, type OverrideStatus } from "@/lib/attendance/schedule";

/**
 * 点某一天弹出的状态弹层（《功能/出勤日历》§2.4、《界面设计规范》§7.21.3）。
 *
 * | 按钮 | 写哪张表 |
 * |---|---|
 * | 上班 / 休息 | `attendance_overrides`——**就是这一天**，周六和别的日子没有区别 |
 * | 跟随自动 | 删掉这天的覆盖行，回到推算值（周六按制度、其余按星期） |
 *
 * 「全年怎么排」由「设置」里的周六制度（单休 / 双休）决定，所以这里没有「只改这一天 /
 * 改整个循环」的勾选框：同一件事只有一个入口（2026-10-23 联调口径）。
 * 覆盖永远最优先——改了就一直是它，换制度也冲不掉。
 *
 * 弹层位置由父组件（月历）按被点格子的实测位置算好传进来，这里只负责渲染与写操作。
 */
interface DayDialogProps {
  day: MonthDayView;
  /** 视口坐标：给了 `top` 就挂在格子下方，给了 `bottom` 就翻到格子上方。 */
  anchor: { left: number; top?: number; bottom?: number };
  onClose: () => void;
  /** 写成功：把这一天的最新结果交回月历（乐观更新 + 刷新）。 */
  onResolved: (day: AttendanceDayResult) => void;
}

export function DayDialog({ day, anchor, onClose, onResolved }: DayDialogProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  function run(task: () => Promise<AttendanceActionResult>) {
    if (pending) return;
    startTransition(async () => {
      const result = await task();
      if (result.ok) {
        if (result.day) onResolved(result.day);
        else onClose();
        return;
      }
      setError(result.error);
    });
  }

  function choose(status: OverrideStatus) {
    run(() => setDayStatusAction(day.dayKey, status));
  }

  // 顶行：`10月24日 周六 · 农历九月十五 · 重阳节`（农历与节日只在服务端算过）
  const subtitle = [
    `${day.month}月${day.day}日 ${weekdayShortLabel(day.dayKey)}`,
    day.labels?.lunarFull ?? null,
    day.labels?.festival ?? null,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" · ");

  return (
    <div className="fixed inset-0 z-50">
      {/* 独立遮罩层：点外部关闭（§7.21.3 / §5.4） */}
      <button
        type="button"
        aria-label="关闭"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${day.month}月${day.day}日 工作状态`}
        style={{ left: anchor.left, top: anchor.top, bottom: anchor.bottom }}
        className="absolute z-10 w-[200px] rounded-[2px] border border-[#E5E5E5] bg-white p-3"
      >
        <p className="text-xs leading-relaxed text-[#8A8A8A]">{subtitle}</p>

        <div className="mt-2 flex items-center gap-1.5">
          {(["work", "off"] as const).map((status) => (
            <button
              key={status}
              type="button"
              disabled={pending}
              aria-pressed={day.status === status}
              onClick={() => choose(status)}
              className={cn(
                "h-7 cursor-pointer rounded-[2px] px-2 text-xs transition-colors disabled:cursor-not-allowed",
                day.status === status
                  ? "bg-[#000000] text-white"
                  : "bg-[#F5F5F5] text-[#666666] hover:bg-[#ECECEC]",
              )}
            >
              {statusLabel(status)}
            </button>
          ))}
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => followAutoAction(day.dayKey))}
            className="h-7 cursor-pointer rounded-[2px] bg-[#F5F5F5] px-2 text-xs text-[#666666] transition-colors hover:bg-[#ECECEC] disabled:cursor-not-allowed"
          >
            跟随自动
          </button>
        </div>

        {error ? (
          <p className="mt-2 text-[10px] leading-relaxed text-[#B91C1C]">{error}</p>
        ) : null}
      </div>
    </div>
  );
}
