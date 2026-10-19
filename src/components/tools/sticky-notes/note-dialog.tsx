"use client";

import { Modal } from "@/components/ui/modal";
import { NoteEditor } from "./note-editor";

/**
 * 便签的新建 / 编辑弹窗。
 *
 * 为什么不做「卡片原地展开」：原地编辑会把那一张卡撑到很高（长文本甚至占满一屏），
 * 破坏便签网格「统一缩略图大小」的前提，也把下面所有卡片顶下去。
 * 弹窗把编辑态与列表彻底分开，关掉后卡片高度立刻回到 80px。
 */
interface NoteDialogProps {
  open: boolean;
  mode: "create" | "edit";
  initialValue?: string;
  busy: boolean;
  error: string | null;
  onSave: (body: string) => void;
  onCancel: () => void;
}

export function NoteDialog({
  open,
  mode,
  initialValue,
  busy,
  error,
  onSave,
  onCancel,
}: NoteDialogProps) {
  return (
    <Modal
      open={open}
      title={mode === "create" ? "新建便签" : "编辑便签"}
      onClose={onCancel}
    >
      <NoteEditor
        initialValue={initialValue}
        busy={busy}
        error={error}
        onSave={onSave}
        onCancel={onCancel}
      />
    </Modal>
  );
}
