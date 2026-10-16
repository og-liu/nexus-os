import type { ReactNode } from "react";

interface AuthCardProps {
  /** 表单标题 */
  title: string;
  /** 标题下的一句说明 */
  description: string;
  /** 表单 / 操作区 */
  children: ReactNode;
  /** 表单下方的次要操作（去另一页的链接）。登录页与注册页都必须有 */
  footer: ReactNode;
}

/**
 * 登录 / 注册页的表单容器（《界面设计规范》§7.16）。
 *
 * 卡片外壳从 md 起出现：手机上表单铺满整屏，卡片的边界就是屏幕边缘，套上只剩多余的留白；
 * 从平板开始页面有了灰底，白卡才有「把自己托起来」的意义。
 */
export function AuthCard({
  title,
  description,
  children,
  footer,
}: AuthCardProps) {
  return (
    <div className="mx-auto w-full max-w-[420px] animate-rise px-5 md:rounded-[2px] md:bg-white md:p-8">
      <h1 className="text-xl font-semibold text-[#000000]">{title}</h1>
      <p className="mt-1 text-xs text-[#8A8A8A]">{description}</p>

      <div className="mt-6 lg:mt-7">{children}</div>

      <div className="mt-6 text-center text-xs text-[#8A8A8A]">{footer}</div>
    </div>
  );
}
