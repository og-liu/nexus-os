"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Sidebar } from "@/components/sidebar";
import { Footer } from "@/components/footer";

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

  // 抽屉打开时锁定背景滚动，关闭后恢复
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
      {/* 桌面布局：md 及以上保持原样（常驻侧边栏），禁止整页横向滚动 */}
      <div className="flex h-screen overflow-hidden">
        <Sidebar variant="desktop" />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <main className="flex-1 overflow-y-auto bg-[#ECECEC]">{children}</main>
          <Footer />
        </div>
      </div>

      {/* 手机抽屉：仅 md 以下渲染，点击遮罩或导航后关闭 */}
      <div
        className={`fixed inset-0 z-50 md:hidden ${
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
