import type { ReactNode } from "react";

/**
 * 登录 / 注册页的公共外壳：灰页面居中一张白卡。
 * 这两个页面是全站布局的例外——不进应用外壳（无侧边栏 / 页头 / 页脚）。
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#ECECEC] px-4 py-10">
      {children}
    </div>
  );
}
