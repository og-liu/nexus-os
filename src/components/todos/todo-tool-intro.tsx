"use client";

import { Plus } from "lucide-react";
import { ToolBar } from "@/components/tools/tool-bar";
import { ToolHeader } from "@/components/tools/tool-header";
import type { Tool } from "@/components/tools/tool-catalog";

/**
 * 待办工具页的头部三件套：工具信息条 → 吸顶工具栏 → 页面级错误条。
 *
 * 与便签页同构（信息条右侧是「新建待办」主操作；滚动后吸顶栏滑入），
 * 所以布局细节不散在页面视图里，改一处即两页对齐。
 */
interface TodoToolIntroProps {
  tool: Tool | undefined;
  onNew: () => void;
  disabled: boolean;
  /** 弹窗之外的写操作失败（勾选 / 删除 / 清除）。 */
  error: string | null;
}

export function TodoToolIntro({
  tool,
  onNew,
  disabled,
  error,
}: TodoToolIntroProps) {
  return (
    <>
      {tool ? (
        <ToolHeader
          tool={tool}
          actions={
            <button
              type="button"
              onClick={onNew}
              disabled={disabled}
              className="flex h-8 cursor-pointer items-center gap-1.5 rounded-[2px] bg-[#000000] px-3 text-xs font-medium text-white transition-colors hover:bg-[#333333] disabled:cursor-not-allowed"
            >
              <Plus className="h-3.5 w-3.5" />
              新建待办
            </button>
          }
        />
      ) : null}

      {tool ? (
        <ToolBar name={tool.name} icon={tool.icon} onNew={onNew} />
      ) : null}

      {error ? (
        <p role="alert" className="text-xs text-[#B91C1C]">
          {error}
        </p>
      ) : null}
    </>
  );
}
