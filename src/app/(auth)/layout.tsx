import type { ReactNode } from "react";
import { AuthBrandCompact } from "@/components/auth/auth-brand-compact";
import { AuthBrandPanel } from "@/components/auth/auth-brand-panel";
import { BeianLink } from "@/components/layout/footer";

/**
 * 登录 / 注册页的外壳（《界面设计规范》§7.16）。
 *
 * 这两页是全站布局的例外，不进应用外壳（无侧边栏 / 页头 / 页脚）。
 * 三档各司其职，**一次只变一件事**，所以窗口从手机拖到宽屏是「顺」的：
 *
 * | 档位 | 品牌区 | 底色与卡片 | 版式 |
 * |---|---|---|---|
 * | < md | 白底：品牌标 + 34px 口号 + 1px 线 + 等宽脚注 | 白底、**无卡片**（铺满） | 纵向流 |
 * | ≥ md | 同上，口号 40px、留白放大 | **整页换灰底**，表单成一张居中的白卡 | 仍是纵向流 |
 * | ≥ lg | 换成左侧黑栏（`AuthBrandPanel`） | 灰底 + 白卡 | **翻成左右分栏** |
 *
 * 也就是：底色与卡片的切换发生在 **md**，版式的翻转发生在 **lg**。
 * 两件事压在同一个断点上，1024px 附近会同时跳底色、跳卡片、跳方向——那才是突兀的来源。
 *
 * 底色统一写在最外层（而不是各块自己带底色）：手机是白底、md 起是灰底，
 * 品牌区与表单区因此**永远同色**，不会在中途出现一条白灰分界。
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white md:bg-[#F5F5F5] lg:flex-row">
      <AuthBrandCompact />
      <AuthBrandPanel />

      <div className="flex flex-1 flex-col">
        <div className="flex-1 pb-14 pt-8 md:px-8 md:pb-16 md:pt-12 lg:flex lg:flex-1 lg:items-center lg:justify-center lg:px-6 lg:py-12">
          {children}
        </div>

        {/* 备案号：未登录用户看到的第一个页面（登录/注册）也得挂上，
            这是 ICP 备案的展示要求；样式与应用外壳页脚保持一致。 */}
        <div className="pb-6 text-center text-xs text-[#A0A8B4] lg:pb-8">
          <BeianLink />
        </div>
      </div>
    </div>
  );
}
