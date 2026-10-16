import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";

/**
 * 应用外壳布局（`(app)` 路由分组）。
 *
 * 为什么要分组：登录 / 注册在 `(auth)` 组里、不进外壳；根布局保持中立
 * （只有 html / body / 字体）。两组各有一套 layout，互不打扰。
 *
 * 为什么这里**不做**登录检查：检查要贴着每个受保护页面自己做 `requireUser()`
 * ——Next 16 的 layout 在客户端导航时不重新渲染、也拦不住子页面，
 * 写在这一层只是「看起来安全」（详见 `src/lib/auth/current-user.ts` 的注释）。
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
