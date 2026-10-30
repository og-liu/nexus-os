"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";

/**
 * 二次确认框（保险库的删除动作都用它）。
 *
 * 为什么不做「删除后 3 秒可撤销」：那要引入软删除与恢复接口，而这里的删除是
 * **真删**（《功能/保险库》§四）。确认框便宜、诚实——点了确认就是删了。
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

/**
 * 群组的新建 / 重命名（同一个表单，两处共用）。
 *
 * 只做一件事：拿到一个非空名字。重名由服务端 `(user_id, name)` 唯一约束判，
 * 客户端不预判——预判要和库里保持一致，迟早不一致。
 */
interface GroupDialogProps {
  mode: "create" | "rename";
  initialName?: string;
  busy?: boolean;
  error?: string | null;
  onSubmit: (name: string) => void;
  onClose: () => void;
}

export function GroupDialog({
  mode,
  initialName = "",
  busy = false,
  error,
  onSubmit,
  onClose,
}: GroupDialogProps) {
  const [name, setName] = useState(initialName);

  return (
    <Modal open title={mode === "create" ? "新建群组" : "重命名群组"} onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (busy) return;
          onSubmit(name);
        }}
        className="flex flex-col"
      >
        {error ? (
          <p
            role="alert"
            className="mb-3 rounded-[2px] bg-[#FEF2F2] px-2.5 py-2 text-[12px] text-[#B91C1C]"
          >
            {error}
          </p>
        ) : null}

        <label className="block">
          <span className="mb-1 block text-[11px] text-[#8A8A8A]">群组名</span>
          <input
            type="text"
            value={name}
            autoFocus
            onChange={(event) => setName(event.target.value)}
            placeholder="比如：银行、阿里云、工作账号"
            aria-label="群组名"
            className="h-9 w-full rounded-[2px] border border-[#E5E5E5] bg-white px-2 text-[14px] text-[#1F1F1F] outline-none placeholder:text-[#A0A8B4] focus:border-[#000000]"
          />
        </label>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 items-center rounded-[2px] bg-[#F5F5F5] px-4 text-[13px] text-[#1F1F1F] transition-colors hover:bg-[#ECECEC]"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={busy}
            className={cn(
              "flex h-9 items-center rounded-[2px] bg-[#000000] px-4 text-[13px] font-medium text-white transition-colors hover:bg-[#1F1F1F]",
              busy && "opacity-60",
            )}
          >
            {busy ? "保存中…" : "保存"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
