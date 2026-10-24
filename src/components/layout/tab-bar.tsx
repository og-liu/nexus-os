"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import type { MouseEvent } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  HOME_PATH,
  TABS_STORAGE_KEY,
  nextPathAfterClose,
  parseTabs,
  registerTab,
  removeTab,
  serializeTabs,
  type Tab,
} from "@/lib/navigation/tabs";
import { isTabRoute, resolveTabLabel } from "@/components/layout/tab-routes";

/**
 * 页签栏（《功能/页签栏》§二、《界面设计规范》§7.22）。
 *
 * 外壳级导航：把访问过的页面记成一排标签，点一下就切过去——
 * 深层页面之间互相跳转不用再「回工具中心 → 再进来」。
 *
 * 三条实现上的选择：
 * 1. **状态住在 sessionStorage 里，组件不另存一份**。存储是外部系统，
 *    用 `useSyncExternalStore` 订阅：服务端/水合首帧给一份「只有总览」的快照，
 *    水合后再切到真实快照。这样既不会出现服务端与客户端首帧不一致（§七 水合报错），
 *    也不需要在 effect 里 setState 触发级联渲染。
 * 2. **只在路由变化时登记**（effect 依赖只有 `pathname`）。把标签表也列进依赖，
 *    「关掉当前标签」之后会被同一个 `pathname` 又登记回来。
 * 3. **`<lg` 整条不渲染**：`hidden lg:flex` 是 CSS 判断，不用 JS 读视口宽度
 *    （JS 判断会让服务端输出和客户端首帧对不上）。高度由这条栏自己撑，
 *    不回头给 `<main>` 加 padding。
 */

// ---------- sessionStorage 适配层 ----------

/**
 * 服务端与水合首帧的快照：`sessionStorage` 在服务端不存在，那两帧只画固定标签。
 * 必须是模块级常量——每次返回新数组会让 React 认为快照一直在变。
 */
const SERVER_TABS: Tab[] = [{ path: HOME_PATH }];

/** 存储变化的订阅者（本会话里只有页签栏自己会写）。 */
const listeners = new Set<() => void>();

let cachedRaw: string | null = null;
let cachedTabs: Tab[] = SERVER_TABS;

/**
 * 读存储。**必须返回稳定引用**：同一个 raw 反复读要拿到同一个数组，
 * 否则 React 会认为快照一直变化而无限重渲染。
 */
function getSnapshot(): Tab[] {
  const raw = window.sessionStorage.getItem(TABS_STORAGE_KEY) ?? "";
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    // 存储里可能留着旧版本的白名单路径：读出来就丢掉，免得渲染出一个没有文字的标签
    cachedTabs = parseTabs(raw).filter(
      (tab) => resolveTabLabel(tab.path) !== null,
    );
  }
  return cachedTabs;
}

function getServerSnapshot(): Tab[] {
  return SERVER_TABS;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 写存储并唤醒订阅者；内容没变就不写（避免「读 → 写 → 通知」自己激自己）。 */
function writeTabs(tabs: readonly Tab[]): void {
  const raw = serializeTabs(tabs);
  if (raw === (window.sessionStorage.getItem(TABS_STORAGE_KEY) ?? "")) return;
  window.sessionStorage.setItem(TABS_STORAGE_KEY, raw);
  for (const listener of listeners) listener();
}

// ---------- 交互 ----------

/** 点当前所在的标签：不跳转、不压历史记录（验收 11）；带修饰键的点击仍然照常开新窗口。 */
function keepIfActive(event: MouseEvent<HTMLAnchorElement>, isActive: boolean) {
  if (!isActive) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
}

export function TabBar() {
  const pathname = usePathname();
  const router = useRouter();
  const tabs = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const activeTabRef = useRef<HTMLDivElement | null>(null);

  // 路由一变就登记：写存储 → 通知快照 → 重渲染（没有 setState）
  useEffect(() => {
    if (!isTabRoute(pathname)) return;
    writeTabs(registerTab(getSnapshot(), pathname));
  }, [pathname]);

  // 切到一个横向滚出视野的标签后，把它滚进来（验收 8）
  useEffect(() => {
    activeTabRef.current?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
    });
  }, [pathname, tabs]);

  const closeTab = (path: string) => {
    const current = getSnapshot();
    // 关的是当前所在那个：新激活路径要用关之前的次序算，再直接跳过去——
    // 此刻读 `pathname` 还是旧值（§七 已知的坑）
    const next = path === pathname ? nextPathAfterClose(current, path) : null;
    writeTabs(removeTab(current, path));
    if (next) router.replace(next);
  };

  return (
    <nav
      aria-label="页签栏"
      className="hidden h-10 items-stretch gap-1 overflow-x-auto border-b border-[#E8E8E8] bg-[#F5F5F5] px-2 [scrollbar-width:thin] lg:flex"
    >
      {tabs.map((tab) => {
        const label = resolveTabLabel(tab.path);
        if (!label) return null;
        const isActive = tab.path === pathname;

        return (
          <div
            key={tab.path}
            ref={isActive ? activeTabRef : undefined}
            className={cn(
              "flex shrink-0 items-center gap-1 rounded-[2px] px-3 text-[13px]",
              isActive
                ? "bg-[#d5e3f6] text-[#000000]"
                : "text-[#666666] hover:bg-[#ededed] hover:text-[#000000]",
            )}
          >
            <Link
              href={tab.path}
              prefetch={false}
              aria-current={isActive ? "page" : undefined}
              onClick={(event) => keepIfActive(event, isActive)}
              className="flex h-full items-center"
            >
              {label}
            </Link>
            {/* 固定标签不渲染 ×，也不留占位（§7.22.3 第 3 条） */}
            {tab.path === HOME_PATH ? null : (
              <button
                type="button"
                aria-label={`关闭${label}`}
                onClick={() => closeTab(tab.path)}
                className="flex cursor-pointer items-center text-[#8A8A8A] hover:text-[#000000]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        );
      })}
    </nav>
  );
}
