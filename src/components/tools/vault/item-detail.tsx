"use client";

import { ChevronLeft, Copy, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import type { VaultGroup, VaultItem } from "@/lib/vault/vault";

/**
 * 保险库右栏：选中条目的全部内容（《功能/保险库》§2.4）。
 *
 * **字段值按原样显示**：这一版不做掩码（没有字段类型，就无从判断「哪个是密码」；
 * 加个全局眼睛开关会让人误以为数据被加密了）。安全边界写在
 * 《数据库/保险库条目表》§七：库里是明文，这是知情选择。
 */

interface ItemDetailProps {
  item: VaultItem | null;
  groups: VaultGroup[];
  onEdit: () => void;
  onDelete: () => void;
  onCopy: (value: string) => void;
  /** 手机上从详情返回列表。桌面不存在这个动作（三栏同屏）。 */
  onBack: () => void;
  className?: string;
}

export function ItemDetail({
  item,
  groups,
  onEdit,
  onDelete,
  onCopy,
  onBack,
  className,
}: ItemDetailProps) {
  return (
    <div className={cn("flex h-full min-w-0 flex-col bg-white", className)}>
      {item ? (
        <ItemBody
          item={item}
          groups={groups}
          onEdit={onEdit}
          onDelete={onDelete}
          onCopy={onCopy}
          onBack={onBack}
        />
      ) : (
        <EmptyDetail onBack={onBack} />
      )}
    </div>
  );
}

function ItemBody({
  item,
  groups,
  onEdit,
  onDelete,
  onCopy,
  onBack,
}: {
  item: VaultItem;
  groups: VaultGroup[];
  onEdit: () => void;
  onDelete: () => void;
  onCopy: (value: string) => void;
  onBack: () => void;
}) {
  const groupName = groups.find((group) => group.id === item.groupId)?.name ?? "未分组";

  return (
    <>
      {/* 头部：手机上多一个返回（详情是整页替换列表的），桌面没有 */}
      <div className="flex items-start gap-2 border-b border-[#E8E8E8] px-3 py-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="返回列表"
          className="-ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-[2px] text-[#1F1F1F] transition-colors hover:bg-[#F5F5F5] md:hidden"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <div className="min-w-0 flex-1">
          <h2 className="break-words text-[17px] font-semibold leading-tight text-[#000000]">
            {item.title}
          </h2>
          <p className="mt-1 text-[11px] text-[#999999]">
            {groupName} · 修改于 {formatDateTime(item.updatedAt)}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onEdit}
            aria-label="编辑"
            title="编辑"
            className="flex h-8 w-8 items-center justify-center rounded-[2px] text-[#1F1F1F] transition-colors hover:bg-[#F5F5F5]"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label="删除"
            title="删除"
            className="flex h-8 w-8 items-center justify-center rounded-[2px] text-[#B91C1C] transition-colors hover:bg-[#FEF2F2]"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* 字段：字段名 11px 灰、值 14px 黑；长值折行（密码 / 卡号没有空格，必须 break-all） */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {item.fields.length === 0 ? (
          <p className="px-1 py-6 text-[12px] text-[#A0A8B4]">
            这条记录还没有字段。点右上角的编辑加一个。
          </p>
        ) : (
          <ul className="divide-y divide-[#F0F0F0]">
            {item.fields.map((field, index) => (
              <li key={`${field.key}-${index}`} className="group py-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[11px] text-[#8A8A8A]">{field.key}</span>
                  <button
                    type="button"
                    onClick={() => onCopy(field.value)}
                    aria-label={`复制「${field.key}」的值`}
                    title="复制"
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[2px] text-[#8A8A8A] opacity-0 transition-opacity hover:bg-[#F5F5F5] hover:text-[#000000] focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
                {field.value ? (
                  <p className="mt-0.5 break-all text-[14px] leading-relaxed text-[#000000]">
                    {field.value}
                  </p>
                ) : (
                  <p className="mt-0.5 text-[13px] italic text-[#C4C4C4]">（空）</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

/** 没有选中任何条目时的右栏（文案见《功能/保险库》§2.4：先说动作，再给备选路径）。 */
function EmptyDetail({ onBack }: { onBack: () => void }) {
  return (
    <>
      <div className="flex items-center border-b border-[#E8E8E8] px-3 py-3 md:hidden">
        <button
          type="button"
          onClick={onBack}
          aria-label="返回列表"
          className="-ml-1 flex h-8 w-8 items-center justify-center rounded-[2px] text-[#1F1F1F] transition-colors hover:bg-[#F5F5F5]"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-10 text-center">
        <p className="text-[14px] font-medium text-[#1F1F1F]">在左边选一条记录</p>
        <p className="max-w-56 text-[12px] leading-relaxed text-[#A0A8B4]">
          这里会显示它的全部字段；也可以点上面的「新建」随手记一条。
        </p>
      </div>
    </>
  );
}
