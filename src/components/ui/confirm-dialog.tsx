"use client";

import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";

/**
 * 二次确认框（删除类动作共用）。
 *
 * 为什么不做「删除后 3 秒可撤销」：那要引入软删除与恢复接口，而这里的删除是**真删**。
 * 确认框便宜、诚实——点了确认就是删了。
 *
 * 住在 `ui/` 而不是某个功能的目录里：保险库与 Markdown 编辑器都要用同一套确认观感，
 * 复制一份到各自目录，两边迟早长得不一样。
 */

interface ConfirmDialogProps {
  title: string;
  description: string;
  confirmLabel?: string;
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDialog({
  title,
  description,
  confirmLabel = "确认删除",
  busy = false,
  error,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  return (
    <Modal open title={title} onClose={onClose}>
      <div className="flex flex-col">
        {error ? (
          <p
            role="alert"
            className="mb-3 rounded-[2px] bg-[#FEF2F2] px-2.5 py-2 text-[12px] text-[#B91C1C]"
          >
            {error}
          </p>
        ) : null}

        <p className="text-[13px] leading-relaxed text-[#1F1F1F]">{description}</p>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 items-center rounded-[2px] bg-[#F5F5F5] px-4 text-[13px] text-[#1F1F1F] transition-colors hover:bg-[#ECECEC]"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={cn(
              "flex h-9 items-center rounded-[2px] bg-[#B91C1C] px-4 text-[13px] font-medium text-white transition-colors hover:bg-[#991B1B]",
              busy && "opacity-60",
            )}
          >
            {busy ? "处理中…" : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
