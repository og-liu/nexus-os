"use client";

import { Columns2, PanelLeft, PanelRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 版式开关：编辑器 / 编辑器 + 预览 / 预览（《功能/Markdown编辑器》§2.3）。
 *
 * 三枚图标是一套「版面示意」，语义与位置一致：左边那枚 = 只左栏（编辑），
 * 中间 = 左右各半，右边 = 只右栏（预览）。比拿铅笔 / 眼睛当图标更不容易误读
 * （眼睛只能表达「看见 / 看不见」，表达不了「只看预览」）。
 *
 * 住在**贯穿整页的标题行**里，不在编辑区内部：只显示预览时编辑区会整块让位，
 * 开关要是跟着编辑区一起消失，就没法切回来了。
 *
 * < md 只有两档：手机上「编辑 + 预览」并排时每栏只有 180px 高，谁都读不了
 * （《功能/Markdown编辑器》§2.5），所以中间那枚在手机上藏起来，只留「编辑 / 预览」。
 */

export type ViewMode = "editor" | "split" | "preview";

interface ModeOption {
  key: ViewMode;
  label: string;
  icon: LucideIcon;
  /** 手机上不出现（窄屏两栏读不了）。 */
  desktopOnly?: boolean;
}

const OPTIONS: ModeOption[] = [
  { key: "editor", label: "仅编辑器", icon: PanelLeft },
  { key: "split", label: "编辑器与预览", icon: Columns2, desktopOnly: true },
  { key: "preview", label: "仅预览", icon: PanelRight },
];

interface ViewModeSwitchProps {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
  className?: string;
}

export function ViewModeSwitch({ value, onChange, className }: ViewModeSwitchProps) {
  return (
    <div
      role="group"
      aria-label="版式"
      className={cn("flex shrink-0 gap-0.5 rounded-[2px] bg-[#F5F5F5] p-0.5", className)}
    >
      {OPTIONS.map(({ key, label, icon: Icon, desktopOnly }) => {
        const active = value === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            aria-label={label}
            title={label}
            aria-pressed={active}
            className={cn(
              "flex h-7 w-7 cursor-pointer items-center justify-center rounded-[2px] transition-colors",
              desktopOnly && "hidden md:flex",
              active
                ? "bg-white text-[#000000] shadow-sm"
                : "text-[#8A8A8A] hover:text-[#000000]",
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
