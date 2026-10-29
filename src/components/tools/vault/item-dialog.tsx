"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";
import { generatePassword } from "@/lib/vault/password";
import type { VaultField, VaultGroup, VaultItem } from "@/lib/vault/vault";
import { UNTITLED } from "@/lib/vault/validate";
import { FieldRow, type DraftField } from "./field-row";
import { useFieldDrag } from "./use-field-drag";

/**
 * 新建 / 编辑条目弹窗（《功能/保险库》§2.5）。新建与编辑共用一份——
 * 差别只有初始值和标题，分两套会出现「两边校验不一样」这种迟早发生的事。
 *
 * **关闭就是关闭**：点「取消」/ `Esc` / 点遮罩一律直接关、改动丢弃。
 * 曾经做过「有改动要按两次」的防手滑，被主人否掉——他的原话是
 * 「我都要取消了，为什么还要保存」。要留住改动就点保存，取消这个动作本身就表达了意图。
 */

interface ItemDialogProps {
  /** `null` = 新建；有值 = 编辑这一条。 */
  item: VaultItem | null;
  groups: VaultGroup[];
  /** 新建时默认选中的群组：跟着当前视图走（在「银行」里点新建，默认就归到银行）。 */
  defaultGroupId: number | null;
  busy: boolean;
  /** 服务端回来的错误（标题超长、群组不存在…），显示在弹窗顶部，不关窗。 */
  error: string | null;
  onSubmit: (input: { title: string; groupId: number | null; fields: VaultField[] }) => void;
  onClose: () => void;
}

let uidSeed = 0;

function nextUid(): string {
  uidSeed += 1;
  return `field-${uidSeed}`;
}

function toDraft(field: VaultField): DraftField {
  return { uid: nextUid(), key: field.key, value: field.value };
}

export function ItemDialog({
  item,
  groups,
  defaultGroupId,
  busy,
  error,
  onSubmit,
  onClose,
}: ItemDialogProps) {
  const [title, setTitle] = useState(item?.title ?? UNTITLED);
  const [groupId, setGroupId] = useState<number | null>(
    item ? item.groupId : defaultGroupId,
  );
  // 新建时先给一行空字段：打开就能直接打字，少一次「添加字段」的点击
  const [fields, setFields] = useState<DraftField[]>(() =>
    item ? item.fields.map(toDraft) : [{ uid: nextUid(), key: "", value: "" }],
  );

  /**
   * 打开弹窗就聚焦标题并**全选**「未命名」：进来直接打字就是替换，
   * 不用先把那三个字删掉。焦点在标题而不是字段名——标题是这条记录的名字，
   * 也是之后列表里唯一能看到的东西（新建时默认值已经是「未命名」，全选状态下敲字即覆盖）。
   */
  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const input = titleRef.current;
    if (!input) return;
    input.focus();
    input.select();
  }, []);

  const reorder = useCallback((from: number, to: number) => {
    setFields((current) => {
      if (from === to || from < 0 || to < 0 || from >= current.length || to >= current.length) {
        return current;
      }
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }, []);

  const { dragIndex, offset, startDrag, moveByKeyboard } = useFieldDrag(
    fields.length,
    reorder,
  );

  const updateField = useCallback(
    (index: number, patch: Partial<Pick<DraftField, "key" | "value">>) => {
      setFields((current) =>
        current.map((field, at) => (at === index ? { ...field, ...patch } : field)),
      );
    },
    [],
  );

  const addField = useCallback(() => {
    setFields((current) => [...current, { uid: nextUid(), key: "", value: "" }]);
  }, []);

  const removeField = useCallback((index: number) => {
    setFields((current) => current.filter((_, at) => at !== index));
  }, []);

  /**
   * 🎲：直接覆盖这一行的值，不弹确认。
   * 用户在弹窗里点它就是要换掉；想反悔点「取消」，整份改动一起丢。
   */
  const generateInto = useCallback((index: number) => {
    const password = generatePassword();
    setFields((current) =>
      current.map((field, at) => (at === index ? { ...field, value: password } : field)),
    );
  }, []);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const submit = useCallback(() => {
    if (busy) return;
    onSubmit({
      title: title.trim(),
      groupId,
      fields: fields.map(({ key, value }) => ({ key, value })),
    });
  }, [busy, onSubmit, title, groupId, fields]);

  return (
    <Modal open title={item ? "编辑记录" : "新建记录"} onClose={handleClose}>
      <div
        className="flex min-h-0 flex-1 flex-col"
        onKeyDown={(event) => {
          // ⌘/Ctrl + Enter 保存：填字段时手不用离开键盘
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            submit();
          }
        }}
      >
        {error ? (
          <p
            role="alert"
            className="mb-3 rounded-[2px] bg-[#FEF2F2] px-2.5 py-2 text-[12px] text-[#B91C1C]"
          >
            {error}
          </p>
        ) : null}

        <div className="shrink-0 space-y-3">
          <label className="block">
            <span className="mb-1 block text-[11px] text-[#8A8A8A]">标题</span>
            <input
              ref={titleRef}
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              aria-label="标题"
              className="h-9 w-full rounded-[2px] border border-[#E5E5E5] bg-white px-2 text-[14px] text-[#1F1F1F] outline-none placeholder:text-[#A0A8B4] focus:border-[#000000]"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-[11px] text-[#8A8A8A]">群组</span>
            <select
              value={groupId === null ? "" : String(groupId)}
              onChange={(event) =>
                setGroupId(event.target.value === "" ? null : Number(event.target.value))
              }
              aria-label="群组"
              className="h-9 w-full rounded-[2px] border border-[#E5E5E5] bg-white px-2 text-[13px] text-[#1F1F1F] outline-none focus:border-[#000000]"
            >
              <option value="">未分组</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4 flex shrink-0 items-center justify-between">
          <span className="text-[11px] text-[#8A8A8A]">自定义字段</span>
          <button
            type="button"
            onClick={addField}
            className="flex h-7 items-center gap-1 rounded-[2px] px-2 text-[12px] text-[#1F1F1F] transition-colors hover:bg-[#F5F5F5]"
          >
            <Plus className="h-3.5 w-3.5" />
            添加
          </button>
        </div>

        {/* 字段列表自己滚：字段一多，按钮不能被顶出可视区 */}
        <div className="mt-1 min-h-0 flex-1 space-y-2 overflow-y-auto pb-1 sm:max-h-[38vh]">
          {fields.length === 0 ? (
            <p className="px-1 py-3 text-[12px] text-[#A0A8B4]">
              还没有字段。点上面的「添加」加一个，比如「卡号」「密码」。
            </p>
          ) : (
            fields.map((field, index) => (
              <FieldRow
                key={field.uid}
                field={field}
                index={index}
                dragging={dragIndex === index}
                offset={offset}
                onStartDrag={startDrag}
                onMoveByKeyboard={moveByKeyboard}
                onChange={updateField}
                onGenerate={generateInto}
                onRemove={removeField}
              />
            ))
          )}
        </div>

        <div className="mt-4 flex shrink-0 items-center justify-end gap-2 border-t border-[#F0F0F0] pt-3">
          <button
            type="button"
            onClick={handleClose}
            className="flex h-9 items-center rounded-[2px] bg-[#F5F5F5] px-4 text-[13px] text-[#1F1F1F] transition-colors hover:bg-[#ECECEC]"
          >
            取消
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className={cn(
              "flex h-9 items-center rounded-[2px] bg-[#000000] px-4 text-[13px] font-medium text-white transition-colors hover:bg-[#1F1F1F]",
              busy && "opacity-60",
            )}
          >
            {busy ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
