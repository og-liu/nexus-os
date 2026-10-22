"use client";

import { Modal } from "@/components/ui/modal";
import { NoteEditor } from "./note-editor";

/**
 * 便签的新建 / 编辑弹窗。
 *
 * 为什么不做「卡片原地展开」：原地编辑会把那一张卡撑到很高（长文本甚至占满一屏），
 * 破坏便签网格「统一缩略图大小」的前提，也把下面所有卡片顶下去。
 * 弹窗把编辑态与列表彻底分开，关掉后卡片立刻回到统一的正方形尺寸。
 * 「置顶保存」把保存与置顶合成一步：编辑完顺手置顶，不用再滚回列表里找它。
 */
interface NoteDialogProps {
  open: boolean;
  mode: "create" | "edit";
  initialValue?: string;
  /** 编辑已有便签时传入创建时间；新建时不传。 */
  createdAt?: number;
  busy: boolean;
  error: string | null;
  onSave: (body: string) => void;
  onSavePinned: (body: string) => void;
  onCancel: () => void;
}

export function NoteDialog({
  open,
  mode,
  initialValue,
  createdAt,
  busy,
  error,
  onSave,
  onSavePinned,
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
        createdAt={createdAt}
        busy={busy}
        error={error}
        onSave={onSave}
        onSavePinned={onSavePinned}
        onCancel={onCancel}
      />
    </Modal>
  );
}
