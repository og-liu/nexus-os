"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import type { SecretProvider } from "@/lib/secrets/providers";
import { clearSecretAction, saveSecretAction } from "@/lib/settings/actions";

/**
 * 一个 Key 的设置行（《功能/用户密钥》§2.1）。
 *
 * 三态：未配置（输入框）/ 已配置（掩码 + 更新 / 清除）/ 提交中。
 * **掩码是固定的一串点，不反映真实内容**——服务端从不回传明文，连前几位都不给。
 */

interface SecretRowProps {
  provider: SecretProvider;
  configured: boolean;
}

/** 掩码长度固定：真实 Key 的长度也是信息，不暴露。 */
const MASK = "••••••••••••";

export function SecretRow({ provider, configured }: SecretRowProps) {
  // 保存成功后本地先翻状态，不等服务端刷新——revalidatePath 回来之前的那一瞬，
  // 界面不能还停在「未配置」上，否则看起来像没存进去。
  const [saved, setSaved] = useState(configured);
  const [editing, setEditing] = useState(!configured);
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  /** 清除是破坏性操作，走**就地确认条**而不是 window.confirm（《界面设计规范》§7.3） */
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit() {
    const trimmed = value.trim();
    if (!trimmed || pending) return;

    startTransition(async () => {
      const result = await saveSecretAction(provider.id, trimmed);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError("");
      setValue("");
      setSaved(true);
      setEditing(false);
    });
  }

  function clear() {
    if (pending) return;
    setConfirming(false);

    startTransition(async () => {
      const result = await clearSecretAction(provider.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError("");
      setSaved(false);
      setEditing(true);
    });
  }

  return (
    <div className="rounded-[2px] border border-[#E5E5E5] p-4">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-[#000000]">{provider.name}</h3>
        <span className="flex items-center gap-1.5 text-xs text-[#8A8A8A]">
          <span
            className={saved ? "h-1.5 w-1.5 rounded-full bg-[#22C55E]" : "h-1.5 w-1.5 rounded-full bg-[#A0A8B4]"}
          />
          {saved ? "已配置" : "未配置"}
        </span>
      </div>

      <p className="mt-1 text-xs text-[#8A8A8A]">{provider.description}</p>
      <p className="mt-1 text-xs text-[#A0A8B4]">
        去哪拿：
        {/* 新窗口打开：用户正在填表，不该被导航走。地址原样显示（带 https://）——
            只写域名的话，用户复制去别处时还得自己补协议头 */}
        <a
          href={provider.docsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="cursor-pointer break-all underline underline-offset-2 transition-colors hover:text-[#000000]"
        >
          {provider.docsUrl}
        </a>
        <span className="mx-1">→</span>
        {provider.docsSteps}
      </p>

      {editing ? (
        <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-center">
          <input
            type="password"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                submit();
              }
            }}
            placeholder={provider.placeholder}
            autoComplete="off"
            className="h-9 w-full flex-1 rounded-[2px] border border-[#E5E5E5] bg-white px-3 text-base text-[#1F1F1F] outline-none transition-colors placeholder:text-[#A0A8B4] focus:border-[#000000] md:text-sm"
          />

          {/* 按钮成组：保存是主操作，「取消」是同一组里的次要动作——
              它不该掉到下一行、也不该缩成一行小字（2026-11-02 修正） */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={submit}
              disabled={!value.trim() || pending}
              className="flex h-9 flex-1 cursor-pointer items-center justify-center gap-2 rounded-[2px] bg-[#000000] px-5 text-sm font-medium text-white transition-colors hover:bg-[#333333] disabled:cursor-not-allowed disabled:bg-[#A0A8B4] md:flex-none"
            >
              {pending ? (
                <>
                  <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                  验证中…
                </>
              ) : (
                "保存"
              )}
            </button>

            {saved ? (
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setValue("");
                  setError("");
                }}
                disabled={pending}
                className="h-9 flex-1 cursor-pointer rounded-[2px] border border-[#E5E5E5] px-4 text-sm text-[#1F1F1F] transition-colors hover:bg-[#F5F5F5] disabled:cursor-not-allowed disabled:text-[#A0A8B4] md:flex-none"
              >
                取消
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {/* 就地确认条：破坏性操作在**按钮行上方**带出一条灰底确认，不用独立弹窗。
              这是《界面设计规范》§7.3 里便签 / 待办删除已经在用的做法
              ——`window.confirm` 会弹出浏览器原生框（还带 localhost:3000 的标题），跟全站风格完全不搭。 */}
          {confirming ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-[2px] border border-[#E5E5E5] bg-[#F5F5F5] px-3 py-2">
              <p className="text-xs text-[#666666]">
                清除后，用到 {provider.name} 的功能会立刻不能用。
              </p>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  disabled={pending}
                  className="h-6 cursor-pointer rounded-[2px] bg-white px-2.5 text-xs text-[#666666] transition-colors hover:bg-[#ECECEC] disabled:cursor-not-allowed"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={clear}
                  disabled={pending}
                  className="h-6 cursor-pointer rounded-[2px] bg-[#000000] px-2.5 text-xs text-white transition-colors hover:bg-[#333333] disabled:cursor-not-allowed disabled:bg-[#A0A8B4]"
                >
                  确认清除
                </button>
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <span className="flex h-9 flex-1 items-center rounded-[2px] bg-[#F5F5F5] px-3 font-mono text-sm text-[#1F1F1F]">
              {MASK}
            </span>
            <button
              type="button"
              onClick={() => setEditing(true)}
              disabled={pending}
              className="h-9 cursor-pointer rounded-[2px] bg-[#000000] px-5 text-sm font-medium text-white transition-colors hover:bg-[#333333] disabled:cursor-not-allowed disabled:bg-[#A0A8B4]"
            >
              更新
            </button>
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={pending}
              className="h-9 cursor-pointer rounded-[2px] border border-[#E5E5E5] px-5 text-sm text-[#1F1F1F] transition-colors hover:bg-[#F5F5F5] disabled:cursor-not-allowed disabled:text-[#A0A8B4]"
            >
              清除
            </button>
          </div>
        </div>
      )}

      {error ? (
        // 表单校验不套错误红：这是「改一下就能过」的事，不是系统坏了。
        // 用比说明文字深一档的灰，位置本身就说明它是针对刚才这次操作的结果。
        <p className="mt-2 text-xs leading-relaxed text-[#666666]">{error}</p>
      ) : null}

    </div>
  );
}
