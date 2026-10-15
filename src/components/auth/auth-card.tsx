import type { ReactNode } from "react";
import { LogoIcon } from "@/components/layout/logo-icon";

interface AuthCardProps {
  /** 卡片主标题 */
  title: string;
  /** 标题下的一句说明 */
  description: string;
  /** 表单 / 操作区 */
  children: ReactNode;
  /** 卡片外的次要操作（去另一页的链接）。登录页与注册页都必须有 */
  footer: ReactNode;
}

/**
 * 登录 / 注册 / 受保护首页共用的卡片（《界面设计规范》§7.16 / §7.17）。
 * 层次沿用全站语言：灰页面 → 白卡片 → 白卡内的黑底 Logo 块。
 */
export function AuthCard({
  title,
  description,
  children,
  footer,
}: AuthCardProps) {
  return (
    <div className="w-full max-w-[380px]">
      <div className="rounded-[2px] bg-white p-8">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-[2px] bg-[#000000]">
            <LogoIcon className="h-6 w-6 text-white" />
          </div>
          <h1 className="mt-4 text-xl font-semibold text-[#000000]">{title}</h1>
          <p className="mt-1 text-xs text-[#8A8A8A]">{description}</p>
        </div>

        <div className="mt-7">{children}</div>
      </div>

      <div className="mt-4 text-center text-xs text-[#8A8A8A]">{footer}</div>

      <p
        className="mt-8 text-center text-[11px] tracking-[0.1em] text-[#A0A8B4]"
        style={{ fontFamily: "var(--font-sekuya)" }}
      >
        NEXUS OS
      </p>
    </div>
  );
}
