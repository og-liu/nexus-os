"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 全局通知（《界面设计规范》§7.13）。
 *
 * **两种形态按断点切换**（2026-10-22 联调要求）：
 * - `≥ md`（桌面/平板）：**右下角**，从下往上堆叠，不挡内容；
 * - `< md`（手机）：**水平垂直居中**，像一张小弹窗，居中才不会被拇指挡住。
 *
 * 3 秒自动消失；点一下就立刻关；最多同时留 3 条（第 4 条把最旧的顶掉）。
 * 不做全屏遮罩：这是「做完了」的回执，不该拦住下一步操作。
 *
 * 用法：`const toast = useToast(); toast.success("便签「…」已删除")`。
 * Provider 挂在 `(app)/layout`，所以受保护页面里的任何客户端组件都能拿到。
 */
export type ToastType = "info" | "success" | "warn" | "error";

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

export interface ToastApi {
  info: (message: string) => void;
  success: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
}

/** 同时最多显示几条：再多就把最旧的顶掉，避免整屏都被提示占满。 */
const MAX_TOASTS = 3;
/** 自动消失时间（《界面设计规范》§7.13：3 秒）。 */
const TOAST_DURATION_MS = 3000;

const ICONS = {
  info: Info,
  success: CheckCircle2,
  warn: AlertTriangle,
  error: XCircle,
} as const;

const ToastContext = createContext<ToastApi | null>(null);

/** 取通知 API。必须在 `<ToastProvider>` 内调用（本项目挂在 `(app)/layout`）。 */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast 必须在 <ToastProvider> 内使用");
  return api;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const remove = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback((type: ToastType, message: string) => {
    nextId.current += 1;
    const item: ToastItem = { id: nextId.current, type, message };
    setToasts((current) => [...current, item].slice(-MAX_TOASTS));
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      info: (message) => push("info", message),
      success: (message) => push("success", message),
      warn: (message) => push("warn", message),
      error: (message) => push("error", message),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/*
        容器整屏铺开、`pointer-events-none`，只有每张提示自己是 `pointer-events-auto`——
        否则这层透明浮层会吃掉整页的点击。
        `aria-live="polite"`：提示出现时读屏会念一遍，但不打断当前朗读。
        卡片宽度在手机上只占约 64%（375 屏约 240px、两侧各留 67px）：撑满整宽会变成
        一条细长条，收窄之后文案自然换成两三行，整块更方（2026-10-22 联调）。
      */}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center px-6 md:items-end md:justify-end md:p-6"
      >
        <div className="flex w-full max-w-[min(64vw,240px)] flex-col gap-2 md:w-auto md:max-w-[400px] md:items-end">
          {toasts.map((toast) => (
            <ToastCard key={toast.id} toast={toast} onDismiss={remove} />
          ))}
        </div>
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({
  toast,
  onDismiss,
}: {
  toast: ToastItem;
  onDismiss: (id: number) => void;
}) {
  const Icon = ICONS[toast.type];

  // 到点自动消失；卸载时清掉计时器（手动点掉也走这条清理）
  useEffect(() => {
    const timer = window.setTimeout(
      () => onDismiss(toast.id),
      TOAST_DURATION_MS,
    );
    return () => window.clearTimeout(timer);
  }, [toast.id, onDismiss]);

  return (
    <button
      type="button"
      role="status"
      onClick={() => onDismiss(toast.id)}
      className={cn(
        "pointer-events-auto flex w-full cursor-pointer items-center gap-3 rounded-[4px] border border-[#E5E5E5] bg-white p-3 text-left shadow-[0_16px_48px_rgba(0,0,0,0.18)] md:w-auto md:px-4",
        // PC：从右侧向左推进来（§12.1 的 slide-in-right）；手机居中形态用淡入，
        // 居中卡片从右边滑进来会先贴着屏幕右缘、再跳到中间，看着像闪一下
        "animate-fade md:animate-slide-in-right",
      )}
    >
      {/* 黑底白图标块：全站是黑白语言（§7.4 的图标块、黑底按钮），
          这里也用它当唯一的「黑」，类型只靠图标形状区分，不再用彩色 */}
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[2px] bg-[#000000]">
        <Icon className="h-4 w-4 text-white" />
      </span>
      <span className="min-w-0 flex-1 text-sm leading-relaxed text-[#1F1F1F]">
        {toast.message}
      </span>
    </button>
  );
}
