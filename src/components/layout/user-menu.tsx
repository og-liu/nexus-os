"use client";

import { ChevronsUpDown, LogOut, UserRound } from "lucide-react";
import { logoutAction } from "@/lib/auth/actions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * 侧边栏底部用户区（《界面设计规范》§7.18）——账户区，不属于导航。
 *
 * - 桌面（图标窄栏）：一个「用户」图标可点块，与导航项同风格、同格；
 * - 手机（手机抽屉）：整行「用户图标 + 用户名 + chevron」；
 * 两档点开的都是同一个向上弹出的用户菜单（用户名 + 退出登录）。
 *
 * 图标用 lucide `UserRound`（线条风格与导航图标一致）——不做头像、
 * 也不做首字母徽标；将来接入真实头像时，这一块才是替换点。
 * 两个触发器显式 `cursor-pointer`（「可点 = 小手」，§2.5）；菜单项的光标
 * 由 `dropdown-menu.tsx` 统一给定。
 *
 * 为什么是客户端组件：菜单行为（键盘导航、外点关闭、焦点管理）由 Base UI
 * 原语提供；登出仍是 Server Action（logoutAction）——客户端组件里它照样
 * 以「服务端函数」执行，浏览器只拿到引用。
 */
export function UserMenu({
  username,
  variant,
}: {
  username: string;
  variant: "desktop" | "mobile";
}) {
  // 布局渲染可能早于页面的登录检查（跳转前的一瞬）：没有用户名就整块不渲染
  if (!username) return null;

  return (
    <DropdownMenu>
      {variant === "desktop" ? (
        <DropdownMenuTrigger
          title={username}
          aria-label="用户菜单"
          className="flex w-full cursor-pointer items-center justify-center rounded-xl px-4 py-4 text-black outline-none transition-colors hover:bg-[#ededed] focus-visible:bg-[#ededed] data-[popup-open]:bg-[#ededed]"
        >
          <UserRound className="h-6 w-6" />
        </DropdownMenuTrigger>
      ) : (
        <DropdownMenuTrigger className="flex w-full cursor-pointer items-center gap-3 rounded-[2px] px-4 py-3 text-left outline-none transition-colors hover:bg-[#ededed] focus-visible:bg-[#ededed] data-[popup-open]:bg-[#ededed]">
          <UserRound className="h-5 w-5 shrink-0 text-[#000000]" />
          <span className="min-w-0 flex-1 truncate text-[15px] text-[#000000]">
            {username}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-[#8A8A8A]" />
        </DropdownMenuTrigger>
      )}

      {/* 底部元素一律向上弹（§7.18）；min-w 显式覆盖「宽度跟随锚点」（窄栏里锚点只有 56px） */}
      <DropdownMenuContent
        side="top"
        align="start"
        sideOffset={8}
        className="min-w-56 rounded-[2px]"
      >
        <span className="block truncate px-2 py-1.5 text-[13px] font-medium text-[#000000]">
          {username}
        </span>
        <DropdownMenuSeparator />
        <form action={logoutAction}>
          <DropdownMenuItem
            nativeButton
            render={<button type="submit" />}
            className="w-full rounded-[2px] py-1.5 text-[13px]"
          >
            <LogOut className="h-4 w-4" />
            退出登录
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
