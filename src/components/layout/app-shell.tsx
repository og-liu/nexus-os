"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Footer } from "@/components/layout/footer";
import { Sidebar } from "@/components/layout/sidebar";

/**
 * 应用外壳（《界面设计规范》§5.1）。
 *
 * 桌面（≥ lg）：常驻图标侧边栏 + 右侧「主内容区 + 页脚」两段式。
 * 手机（< lg）：侧边栏收进抽屉，由页头的汉堡按钮打开。
 *
 * 「打开抽屉」的按钮在页头里、状态却住在外壳上，两者隔着好几层组件树——
 * 用一个 Context 把 `openNav` 传下去（页头里 `useAppShell()` 取用），
 * 避免把这个状态一路用 props 捅下去。
 */

interface AppShellContextValue {
  openNav: () => void;
}

const AppShellContext = createContext<AppShellContextValue>({
  openNav: () => {},
});

export const useAppShell = () => useContext(AppShellContext);

export function AppShell({ children }: { children: ReactNode }) {
  const [navOpen, setNavOpen] = useState(false);
  const openNav = useCallback(() => setNavOpen(true), []);
  const closeNav = useCallback(() => setNavOpen(false), []);

  // 抽屉打开时锁定背景滚动，关闭后恢复：
  // 不锁的话，手指在遮罩上划，底下的页面会跟着一起滚。
  useEffect(() => {
    if (!navOpen) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [navOpen]);

  return (
    <AppShellContext.Provider value={{ openNav }}>
      {/* 桌面布局：整页禁止横向滚动，只有主内容区纵向滚动 */}
      <div className="flex h-screen overflow-hidden">
        <Sidebar variant="desktop" />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <main className="flex-1 overflow-y-auto bg-[#ECECEC]">{children}</main>
          <Footer />
        </div>
      </div>

      {/* 手机抽屉（< lg，仅这些尺寸渲染）：点击遮罩或任一导航后关闭 */}
      <div
        className={`fixed inset-0 z-50 lg:hidden ${
          navOpen ? "" : "pointer-events-none"
        }`}
      >
        <div
          onClick={closeNav}
          className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${
            navOpen ? "opacity-100" : "opacity-0"
          }`}
        />
        <div
          className={`absolute left-0 top-0 h-full w-64 bg-[#F5F5F5] shadow-xl transition-transform duration-300 ${
            navOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <Sidebar variant="mobile" onNavigate={closeNav} />
        </div>
      </div>
    </AppShellContext.Provider>
  );
}
