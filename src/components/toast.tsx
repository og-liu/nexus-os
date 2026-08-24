"use client";

import { useEffect, useRef } from "react";
import { AlertTriangle, Info, XCircle } from "lucide-react";

export type ToastType = "info" | "warn" | "error";

export interface ToastData {
  id: number;
  text: string;
  type: ToastType;
}

const ICONS = {
  info: Info,
  warn: AlertTriangle,
  error: XCircle,
} as const;

const ACCENT: Record<ToastType, string> = {
  info: "text-[#000000]",
  warn: "text-[#9A6B0A]",
  error: "text-[#B91C1C]",
};

/** 全局轻提示：屏幕居中，3 秒后自动消失 */
export function Toast({
  toast,
  onDismiss,
}: {
  toast: ToastData | null;
  onDismiss: () => void;
}) {
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => dismissRef.current(), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  if (!toast) return null;
  const Icon = ICONS[toast.type] ?? Info;

  return (
    <div
      key={toast.id}
      role="status"
      className="fixed left-1/2 top-1/2 z-[100] flex max-w-[min(88vw,400px)] -translate-x-1/2 -translate-y-1/2 items-center gap-3 rounded-[4px] border border-[#E5E5E5] bg-white px-5 py-3.5 shadow-[0_16px_48px_rgba(0,0,0,0.18)]"
    >
      <Icon className={`h-5 w-5 shrink-0 ${ACCENT[toast.type]}`} />
      <span className="text-[15px] leading-relaxed text-[#1F1F1F]">
        {toast.text}
      </span>
    </div>
  );
}