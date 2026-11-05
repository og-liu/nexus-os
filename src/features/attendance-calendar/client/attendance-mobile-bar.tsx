"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { ToolMobileBar } from "@/components/tools/tool-mobile-bar";

/**
 * 工作日历页的移动端顶部行（< lg）：汉堡 + 「今天」。
 *
 * 直接复用工具页共用的 `ToolMobileBar`——便签页是「汉堡 + 新建便签」，待办页是
 * 「汉堡 + 新建待办」，日历页的主操作是「回到今天」，所以只换图标和文案。
 * 桌面端同一个动作住在 `ToolHeader` 右侧，与便签 / 待办的排法一致。
 */
export function AttendanceMobileBar() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <ToolMobileBar
      newLabel="今天"
      icon={CalendarDays}
      disabled={pending}
      onNew={() =>
        startTransition(() => router.push("/tools/attendance-calendar"))
      }
    />
  );
}
