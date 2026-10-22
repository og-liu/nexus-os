import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { ToastProvider } from "@/components/ui/toast";
import { getCurrentUser } from "@/lib/auth/current-user";

/**
 * 应用外壳布局（`(app)` 路由分组）。
 *
 * 为什么要分组：登录 / 注册在 `(auth)` 组里、不进外壳；根布局保持中立
 * （只有 html / body / 字体）。两组各有一套 layout，互不打扰。
 *
 * 为什么这里**不做**登录检查：检查要贴着每个受保护页面自己做 `requireUser()`
 * ——Next 16 的 layout 在客户端导航时不重新渲染、也拦不住子页面，
 * 写在这一层只是「看起来安全」（详见 `src/lib/auth/current-user.ts` 的注释）。
 *
 * 那为什么又在这里取一次用户：侧栏底部的用户区（§7.18）要显示用户名——**纯显示用途**。
 * 用户名在一次会话内不会变，layout 不重渲染的影响只到「外观」层；
 * 它不承担任何安全职责。
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  return (
    /* ToastProvider 包在外壳外面：外壳里的每个客户端组件都能 useToast() */
    <ToastProvider>
      <AppShell username={user?.username ?? ""}>{children}</AppShell>
    </ToastProvider>
  );
}
