"use client";

import { logoutAction } from "@/lib/auth/actions";

/**
 * 页头右侧的用户区（《界面设计规范》§7.10）——用户名 + 退出登录。
 *
 * 为什么是客户端组件：工具页的页头由客户端组件渲染，而服务器组件不能被
 * 客户端组件 import。登出动作本身仍是 Server Action（`logoutAction`）：
 * 表单提交发到服务端执行，浏览器里只有它的引用。
 */
export function UserControl({ username }: { username: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="hidden text-xs text-[#8A8A8A] md:inline">
        {username}
      </span>
      <form action={logoutAction}>
        <button
          type="submit"
          className="text-xs text-[#8A8A8A] underline-offset-2 transition-colors hover:text-[#000000] hover:underline"
        >
          退出登录
        </button>
      </form>
    </div>
  );
}
