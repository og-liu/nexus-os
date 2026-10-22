"use client";

import { Menu, Plus } from "lucide-react";
import { useAppShell } from "@/components/layout/app-shell";

/**
 * 工具页的移动端顶部导航行（< lg）：汉堡 + 新建。
 *
 * 工具页没有页头，手机上就少了「打开侧栏」的入口；桌面端的新建按钮住在工具信息条右侧，
 * 窄屏时也不该把两个按钮挤进信息条——所以单起一行，由便签页与待办页共用。
 *
 * 断点用 `lg` 而不是 `md`：应用外壳的抽屉本身就是 `< lg`，汉堡必须和它同档出现
 * （界面设计规范 §六：显隐、排列方向这类结构性布局一律用 `lg:`）。
 */
interface ToolMobileBarProps {
  newLabel: string;
  onNew: () => void;
  disabled?: boolean;
}

export function ToolMobileBar({
  newLabel,
  onNew,
  disabled = false,
}: ToolMobileBarProps) {
  const { openNav } = useAppShell();

  return (
    <div className="flex items-center justify-between px-4 pt-3 lg:hidden">
      <button
        type="button"
        onClick={openNav}
        aria-label="打开菜单"
        className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-[2px] text-[#1F1F1F] transition-colors hover:bg-[#E5E5E5]"
      >
        <Menu className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={onNew}
        disabled={disabled}
        className="flex h-8 cursor-pointer items-center gap-1.5 rounded-[2px] bg-[#000000] px-3 text-xs font-medium text-white transition-colors hover:bg-[#333333] disabled:cursor-not-allowed"
      >
        <Plus className="h-3.5 w-3.5" />
        {newLabel}
      </button>
    </div>
  );
}
