import Link from "next/link";
import { SECRET_GROUPS, SECRET_PROVIDERS, type SecretGroup } from "@/lib/secrets/providers";
import { cn } from "@/lib/utils";
import { SecretRow } from "./secret-row";

/**
 * 「API 密钥」设置卡（《功能/用户密钥》§2.1）。
 *
 * 服务端组件：只负责把「配了哪些」这个**布尔集合**传给客户端，明文永远不出服务端。
 *
 * 分组用 tab 而不是纵向堆叠：模型以后会有多家、工具会有多个，堆在一起只会越来越长，
 * 而且一屏里同时摆着「跟你无关的那几组」。
 */

interface SecretsCardProps {
  /** 当前用户已经配过的 provider id */
  configured: Set<string>;
  /** 当前停在哪个 tab——由 URL 的 `?tab=` 决定，见 page.tsx */
  activeGroup: SecretGroup;
}

export function SecretsCard({ configured, activeGroup }: SecretsCardProps) {
  const current = SECRET_GROUPS.find((group) => group.id === activeGroup) ?? SECRET_GROUPS[0];
  const items = SECRET_PROVIDERS.filter((provider) => provider.group === current.id);

  return (
    <section className="rounded-[2px] bg-white p-5 md:p-6">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-[#000000]">
        <span className="h-3.5 w-[3px] bg-[#000000]" />
        API 密钥
      </h2>

      <p className="mt-2 text-xs leading-relaxed text-[#8A8A8A]">
        这些 Key 只属于你：加密存在你自己的账号下，别人看不到、也用不到。没配 Key
        的功能会明确告诉你缺哪一个。
      </p>

      {/*
        tab 用 Link 而不是客户端 state：刷新、浏览器后退、把链接发给别人，
        都能落到同一个 tab。`scroll={false}` 避免切 tab 时页面跳回顶部。
      */}
      <nav
        aria-label="密钥分类"
        className="mt-5 flex gap-6 overflow-x-auto border-b border-[#E5E5E5]"
      >
        {SECRET_GROUPS.map((group) => {
          const isActive = group.id === current.id;

          return (
            <Link
              key={group.id}
              href={`/settings?tab=${group.id}`}
              scroll={false}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "relative shrink-0 whitespace-nowrap pb-2.5 text-sm transition-colors",
                isActive ? "font-medium text-[#000000]" : "text-[#8A8A8A] hover:text-[#1F1F1F]",
              )}
            >
              {group.label}
              {isActive ? (
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 -bottom-px h-[2px] bg-[#000000]"
                />
              ) : null}
            </Link>
          );
        })}
      </nav>

      <p className="mt-3 text-xs leading-relaxed text-[#A0A8B4]">{current.hint}</p>

      <div className="mt-3 space-y-3">
        {items.length === 0 ? (
          <p className="text-xs text-[#A0A8B4]">这一组还没有需要配的东西。</p>
        ) : (
          items.map((provider) => (
            <SecretRow
              key={provider.id}
              provider={provider}
              configured={configured.has(provider.id)}
            />
          ))
        )}
      </div>
    </section>
  );
}
