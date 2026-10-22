"use client";

import { Modal } from "@/components/ui/modal";
import { TodoEditor } from "./todo-editor";

/**
 * 待办的新建 / 编辑弹窗（与便签弹窗同一套壳）。
 *
 * 为什么不把编辑态塞进卡片：卡片是固定高度的统一缩略图，原地编辑会把那一张撑高、
 * 把整片网格顶下去；弹窗把编辑态与列表彻底分开，关掉后卡片高度立刻回到 96px。
 */
interface TodoDialogProps {
  open: boolean;
  mode: "create" | "edit";
  initialValue?: string;
  createdAt?: number;
  busy: boolean;
  error: string | null;
  onSave: (title: string) => void;
  /** 删除当前这条（只在编辑态传）；点了直接删，没有二次确认。 */
  onDelete?: () => void;
  onCancel: () => void;
}

export function TodoDialog({
  open,
  mode,
  initialValue,
  createdAt,
  busy,
  error,
  onSave,
  onDelete,
  onCancel,
}: TodoDialogProps) {
  return (
    <Modal
      open={open}
      title={mode === "create" ? "新建待办" : "编辑待办"}
      onClose={onCancel}
    >
      <TodoEditor
        initialValue={initialValue}
        createdAt={createdAt}
        busy={busy}
        error={error}
        onSave={onSave}
        onDelete={onDelete}
        onCancel={onCancel}
      />
    </Modal>
  );
}
