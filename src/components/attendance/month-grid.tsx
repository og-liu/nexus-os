"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  WEEKDAY_HEADER,
  weekdayShortLabel,
  type MonthDayView,
} from "@/lib/attendance/month-grid";
import { statusLabel, type DayStatus } from "@/lib/attendance/schedule";
import type { AttendanceDayResult } from "@/lib/attendance/actions";
import { DayDialog } from "./day-dialog";

/**
 * 月历（《界面设计规范》§7.21、《功能/工作日历》§2.2 / §2.3）。
 *
 * 两档密度、**同一套格子规则**（周一起始 / 7 列 / 固定 42 格 / 白格 + 细网格线）：
 * - `full`：工具页完整月历，格高 76/68/56px，日期 + 农历/节日 + 「休 / 班」角标；
 * - `compact`：首页工作日历卡，格高 28/26px，日期 + **只给休息日挂一个「休」**
 *   （2026-10-23 联调口径：上班日不挂任何标识——整格黑底那种表达扫一眼就是一片黑，
 *   主人明确否掉了；「哪天休息」才是要一眼看到的信息）。
 *
 * **这是客户端组件**（文档 §五 把它记成服务端组件）：格子里有真实操作（点某天改状态），
 * 弹层的锚点要按被点格子的实测位置算，交给客户端才不用为「点击」再套一层事件代理。
 * 农历 / 节日仍然是服务端算好的 props（`labels`），这里一次也没 import 农历库。
 *
 * 改完一天的乐观更新：先用 action 返回的「这一天的最新推算结果」把格子改掉，
 * 再 `router.refresh()` 让服务端重算其它格子（换制度时所有周六都会变）、
 * 首页卡第二行的「今天 · 休息」和顶部提示条。服务端数据一到，本地补丁自动清掉。
 */
interface MonthGridProps {
  days: MonthDayView[];
  variant: "full" | "compact";
}

type DayPatch = Pick<MonthDayView, "status" | "source" | "overridden">;

interface DialogAnchor {
  left: number;
  top?: number;
  bottom?: number;
}

/** 弹层宽度（§7.21.3：200px）。 */
const DIALOG_WIDTH = 200;
/** 弹层离视口边缘至少留这么多，免得贴边。 */
const VIEWPORT_MARGIN = 8;
/** 下方空间不足这个高度就翻到格子上方。 */
const DIALOG_MIN_SPACE = 150;

/** 日期数字的颜色：上班黑、休息灰、未设定更浅（两档密度共用）。 */
function dateTextClass(status: DayStatus): string {
  if (status === "work") return "text-[#000000]";
  if (status === "off") return "text-[#666666]";
  return "text-[#B0B0B0]";
}

/**
 * 状态角标：三态都要挂（2026-10-23 联调定）。
 *
 * - 上班 → 黑底白字「班」
 * - 休息 → 浅灰底灰字「休」
 * - 未设定（周六还没选过制度）→ 白底 + 虚线边 + 最弱文字，写「未定」
 *   （首页卡格子只有 43–56px，放不下两个字，写「?」）
 *
 * 「未定」为什么要显示：以前它是空着不挂角标，主人看到周六一格什么都没有，
 * 第一反应是「标识怎么没显示」——空着会被读成漏数据。挂上「未定」它才是一个
 * 说得清的状态；顶部提示条仍然负责引导他去设置。
 */
function statusBadge(
  status: DayStatus,
  variant: "full" | "compact",
): { label: string; className: string } {
  if (status === "work") {
    return { label: "班", className: "bg-[#000000] text-white" };
  }
  if (status === "off") {
    return { label: "休", className: "bg-[#F5F5F5] text-[#666666]" };
  }
  return {
    label: variant === "compact" ? "?" : "未定",
    className: "border border-dashed border-[#D9D9D9] bg-white text-[#A0A8B4]",
  };
}

export function MonthGrid({ days, variant }: MonthGridProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [openDay, setOpenDay] = useState<MonthDayView | null>(null);
  const [anchor, setAnchor] = useState<DialogAnchor>({ left: 0 });
  const [patch, setPatch] = useState<Record<string, DayPatch>>({});

  /** 服务端数据一变就丢掉本地补丁：props 才是真相，补丁只负责「点完到刷新回来」这一小段。 */
  const signature = days
    .map((day) => `${day.dayKey}:${day.status}:${day.overridden ? 1 : 0}`)
    .join("|");
  const lastSignature = useRef(signature);
  useEffect(() => {
    if (lastSignature.current === signature) return;
    lastSignature.current = signature;
    setPatch({});
  }, [signature]);

  const shown = days.map((day) =>
    patch[day.dayKey] ? { ...day, ...patch[day.dayKey] } : day,
  );

  /**
   * 弹层锚在被点格子的下方（§7.21.3）。位置用视口坐标算：
   * 卡片在页面中部、月历最后一行贴着屏幕底部时都要能完整显示，
   * 所以左右夹在视口内，下方放不下就翻到格子上方。
   */
  function openAt(event: React.MouseEvent<HTMLButtonElement>, day: MonthDayView) {
    const rect = event.currentTarget.getBoundingClientRect();
    const maxLeft = Math.max(
      VIEWPORT_MARGIN,
      window.innerWidth - DIALOG_WIDTH - VIEWPORT_MARGIN,
    );
    const left = Math.min(
      Math.max(VIEWPORT_MARGIN, rect.left + rect.width / 2 - DIALOG_WIDTH / 2),
      maxLeft,
    );
    const spaceBelow = window.innerHeight - rect.bottom;
    const useAbove = spaceBelow < DIALOG_MIN_SPACE && rect.top > spaceBelow;
    setAnchor(
      useAbove
        ? { left, bottom: window.innerHeight - rect.top + 6 }
        : { left, top: rect.bottom + 6 },
    );
    setOpenDay(day);
  }

  function handleResolved(result: AttendanceDayResult) {
    setPatch((current) => ({
      ...current,
      [result.dayKey]: {
        status: result.status,
        source: result.source,
        overridden: result.overridden,
      },
    }));
    setOpenDay(null);
    startTransition(() => router.refresh());
  }

  return (
    <div>
      <div
        aria-hidden="true"
        className={cn("grid grid-cols-7", variant === "full" ? "pb-2" : "pb-1")}
      >
        {WEEKDAY_HEADER.map((label) => (
          <span
            key={label}
            className={cn(
              "text-center",
              variant === "full"
                ? "text-xs text-[#8A8A8A]"
                : "text-[10px] text-[#999999]",
            )}
          >
            {label}
          </span>
        ))}
      </div>

      {/* 细网格：容器画左边与上边、格子画右边与下边，相邻格之间只有 1px（不会双线） */}
      <div className="grid grid-cols-7 border-l border-t border-[#F0F0F0]">
        {shown.map((day) => {
          const label = day.labels?.festival ?? day.labels?.lunarDay ?? null;
          const ariaLabel = `${day.month}月${day.day}日 ${weekdayShortLabel(day.dayKey)}，${statusLabel(day.status)}${day.overridden ? "，已手动调整" : ""}`;
          const isToday = day.isToday && day.inMonth;
          /*
            跨月补齐的格子（上月末 / 下月初）跟本月格子走同一套状态：也挂角标、
            也能点开弹层（2026-10-23 联调补的——之前它们只是灰占位，跨月那几格看不到
            上不上班，看着像漏了数据）。唯一的区别是**日期灰掉**，提示「这不是本月」。
          */
          const dateClass = day.inMonth ? dateTextClass(day.status) : "text-[#D0D0D0]";
          const badge = statusBadge(day.status, variant);

          if (variant === "compact") {
            /*
              首页卡：日期靠左、角标贴右上角、今天用右下角一个小黑点（2026-10-23 联调：
              2px 黑框太抢眼，换成圆点）。角标走绝对定位，才腾得下右下角那个点。
            */
            return (
              <button
                key={day.dayKey}
                type="button"
                onClick={(event) => openAt(event, day)}
                aria-label={ariaLabel}
                className="relative flex h-[26px] cursor-pointer items-start border-r border-b border-[#F0F0F0] bg-white pl-1 pt-0.5 text-[11px] tabular-nums sm:h-[28px] sm:pl-1.5 sm:text-xs"
              >
                <span className={cn("leading-none", dateClass)}>{day.day}</span>
                <span
                  className={cn(
                    "absolute right-0.5 top-0.5 px-0.5 text-[9px] leading-[11px]",
                    badge.className,
                  )}
                >
                  {badge.label}
                </span>
                {isToday ? (
                  <span
                    aria-hidden="true"
                    className="absolute bottom-1 right-1 h-1.5 w-1.5 rounded-full bg-[#000000]"
                  />
                ) : null}
              </button>
            );
          }

          return (
            <button
              key={day.dayKey}
              type="button"
              onClick={(event) => openAt(event, day)}
              aria-label={ariaLabel}
              className="relative flex h-[56px] cursor-pointer flex-col items-start overflow-hidden border-r border-b border-[#F0F0F0] bg-white p-2 text-left sm:h-[68px] lg:h-[76px]"
            >
              <span className="flex items-baseline gap-1">
                <span className={cn("text-base tabular-nums", dateClass)}>
                  {day.day}
                </span>
                {isToday ? (
                  <span className="text-[10px] text-[#000000]">今</span>
                ) : null}
              </span>

              {/*
                手动改过的日子挂一根**小横条**（4×12px 胶囊）。
                原来是 h-1 w-1 的圆点，跟「今天」右下角那个圆点撞车——两个黑点分不清
                谁是谁（2026-10-23 联调主人指出），所以改过用横条、今天用圆点。
              */}
              <span aria-hidden="true" className="mt-0.5 flex h-1 items-center">
                {day.overridden ? (
                  <span
                    title="已手动调整"
                    className="block h-1 w-3 rounded-full bg-[#000000]"
                  />
                ) : null}
              </span>

              {/* 农历/节日只留一行；手机（< 640）整行不渲染，功能仍能从弹层里看到（§2.6） */}
              <span
                className={cn(
                  "mt-1 hidden w-full truncate pr-4 text-[10px] sm:block",
                  day.inMonth ? "text-[#999999]" : "text-[#D0D0D0]",
                )}
              >
                {label}
              </span>

              <span
                className={cn(
                  "absolute right-1 top-1 px-1 text-[9px] sm:text-[10px]",
                  badge.className,
                )}
              >
                {badge.label}
              </span>

              {/* 今天：右下角一个黑点（2026-10-23 联调把 2px 黑框换掉，框太抢眼） */}
              {isToday ? (
                <span
                  aria-hidden="true"
                  className="absolute bottom-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-[#000000]"
                />
              ) : null}
            </button>
          );
        })}
      </div>

      {openDay ? (
        <DayDialog
          key={openDay.dayKey}
          day={openDay}
          anchor={anchor}
          onClose={() => setOpenDay(null)}
          onResolved={handleResolved}
        />
      ) : null}
    </div>
  );
}
