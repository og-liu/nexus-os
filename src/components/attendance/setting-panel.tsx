"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { addDays, parseDayKey, saturdayOfWeek } from "@/lib/attendance/month-grid";
import {
  clearSettingAction,
  saveSaturdayModeAction,
} from "@/lib/attendance/actions";
import {
  DEFAULT_SETTING,
  resolveDayStatus,
  type AttendanceSetting,
  type SaturdayMode,
} from "@/lib/attendance/schedule";

/**
 * 制度设置面板（§2.5）：选周六算不算上班。
 *
 * **只在打开时挂载**（由父组件的 `settingsOpen` 控制）：选中态直接读当前设置，
 * 不需要「打开时用 effect 把 props 抄进 state」——那种写法会触发级联渲染，
 * 而且保存 / 清除之后 props 变了、面板里的旧值还留着。
 *
 * 「恢复默认」只删掉库里那条设置（回到内置的默认制度），手动改过的日子照旧生效——
 * 它不是破坏性操作（删了还能再来），所以没有用错误色。
 */
interface SettingPanelProps {
  setting: AttendanceSetting | null;
  /** 北京时间的今天：单双休的默认锚点取「今天所在那周的周六」。 */
  todayKey: string;
  onClose: () => void;
}

export function SettingPanel({ setting, todayKey, onClose }: SettingPanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // 没设过制度时按默认制度预选（单双休），主人原话「默认激活单双休」
  const [mode, setMode] = useState<SaturdayMode>(
    setting?.saturdayMode ?? DEFAULT_SETTING.saturdayMode,
  );
  /**
   * 单双休的锚点：**永远是「本周」**（今天所在那周的周六）。
   *
   * 为什么不再回填存着的老锚点（2026-10-23 联调第二轮）：主人隔了几个月再打开设置，
   * 面板上还写着「10月24日那周是：单休周 / 双休周」——他早不记得那天上没上班，
   * 根本没法回答。改成问「本周（10月19日–25日）是单休周还是双休周」：
   * 这周刚过完，谁都答得上来；保存时把锚点重设到本周，前后相位一起跟着对齐。
   *
   * 默认值 = **按当前制度推算出来的本周六状态**：这样「不改直接保存」相位不跳；
   * 没设过制度时默认「单休周」（跟着主人那句「本周单休，下周就双休」）。
   */
  const anchorSaturday = saturdayOfWeek(todayKey);
  const [anchorIsWork, setAnchorIsWork] = useState(
    () =>
      resolveDayStatus(anchorSaturday, setting, null).status !== "off",
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  function finish() {
    onClose();
    startTransition(() => router.refresh());
  }

  async function save() {
    if (saving) return;

    const alternate = mode === "alternate";
    setSaving(true);
    const result = await saveSaturdayModeAction(
      mode,
      alternate ? anchorSaturday : null,
      alternate ? anchorIsWork : null,
    );
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    finish();
  }

  async function clear() {
    if (saving) return;
    setSaving(true);
    const result = await clearSettingAction();
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    finish();
  }

  return (
    <>
      {/* 点外部关闭（与状态弹层同一套遮罩规则，§5.4） */}
      <button
        type="button"
        aria-label="关闭设置"
        onClick={onClose}
        className="fixed inset-0 z-20 cursor-default"
      />

      <div className="absolute right-0 top-full z-30 mt-2 w-[300px] rounded-[2px] border border-[#E5E5E5] bg-white p-3">
        <p className="text-xs text-[#8A8A8A]">周六制度</p>

        <div className="mt-2 flex items-center gap-1.5">
          {(
            [
              { value: "work", label: "单休" },
              { value: "off", label: "双休" },
              { value: "alternate", label: "单双休" },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={mode === option.value}
              onClick={() => setMode(option.value)}
              className={cn(
                "h-7 cursor-pointer rounded-[2px] px-2.5 text-xs transition-colors",
                mode === option.value
                  ? "bg-[#000000] text-white"
                  : "bg-[#F5F5F5] text-[#666666] hover:bg-[#ECECEC]",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        <p className="mt-1.5 text-[10px] leading-relaxed text-[#999999]">
          单休 = 每周六上班；双休 = 每周六休息；单双休 = 单休周与双休周交替（大小周）
        </p>

        {/*
          单双休要指定「从哪一周起算」：锚点落在今天所在那周的周六，
          再选那一周是单休还是双休。没有这个锚点，每次打开都会拿「今天」当起点，
          排出来的单双周会随日子往前漂。
        */}
        {mode === "alternate" ? (
          <div className="mt-2">
            <p className="text-[10px] leading-relaxed text-[#666666]">
              本周（{formatWeekRange(todayKey)}）是：
            </p>
            <div className="mt-1 flex items-center gap-1.5">
              {(
                [
                  { value: true, label: "单休周" },
                  { value: false, label: "双休周" },
                ] as const
              ).map((option) => (
                <button
                  key={String(option.value)}
                  type="button"
                  aria-pressed={anchorIsWork === option.value}
                  onClick={() => setAnchorIsWork(option.value)}
                  className={cn(
                    "h-7 cursor-pointer rounded-[2px] px-3 text-xs transition-colors",
                    anchorIsWork === option.value
                      ? "bg-[#000000] text-white"
                      : "bg-[#F5F5F5] text-[#666666] hover:bg-[#ECECEC]",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {error ? (
          <p className="mt-2 text-[10px] leading-relaxed text-[#B91C1C]">{error}</p>
        ) : null}

        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            disabled={saving || pending}
            onClick={save}
            className="h-7 cursor-pointer rounded-[2px] bg-[#000000] px-3 text-xs font-medium text-white transition-colors hover:bg-[#333333] disabled:cursor-not-allowed"
          >
            保存
          </button>
          <button
            type="button"
            disabled={saving || pending}
            onClick={clear}
            className="h-7 cursor-pointer rounded-[2px] bg-[#F5F5F5] px-3 text-xs text-[#666666] transition-colors hover:bg-[#ECECEC] disabled:cursor-not-allowed"
          >
            恢复默认
          </button>
        </div>

        <p className="mt-2 text-[10px] leading-relaxed text-[#999999]">
          恢复默认 = 单双休（大小周）；手动改过的日子不受影响。
        </p>
      </div>
    </>
  );
}

/** 本周的日期范围「10月19日–25日」（周一到周日）——面板里那句「本周」用。 */
function formatWeekRange(todayKey: string): string {
  const saturday = saturdayOfWeek(todayKey);
  const start = parseDayKey(addDays(saturday, -5));
  const end = parseDayKey(addDays(saturday, 1));
  if (!start || !end) return "";

  return start.month === end.month
    ? `${start.month}月${start.day}日–${end.day}日`
    : `${start.month}月${start.day}日–${end.month}月${end.day}日`;
}
