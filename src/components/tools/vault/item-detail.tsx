"use client";

import { ChevronLeft, Copy, Eye, EyeOff, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import type { VaultGroup, VaultItem } from "@/lib/vault/vault";

/**
 * 右栏遮挡用的固定星号串。
 *
 * 为什么固定 12 个而不是「几个就够」：3 个看起来像省略号或占位符，
 * 12 个才像一串被藏起来的密码（主人要求「固定到 12 个」）。
 * 也不按真实长度生成——那等于把长度这个信息泄露出去。
 */
const MASK = "************";

/**
 * 保险库右栏：选中条目的全部内容（《功能/保险库》§2.4）。
 *
 * **字段值默认按 `field.hidden` 遮挡**（`***`），点眼睛能临时露出来——这是密码管理器的常规做法：
 * 详情页经常在别人也能瞄到的屏幕上打开，默认露出等于默认泄露。
 * 而「这一格默认要不要藏」是**在编辑弹窗里设的、跟着记录存**（`fields[].hidden`）；
 * 这里点眼睛只是**这一次**看不看，不写回库。
 *
 * 复制按钮复制的永远是**真值**：点复制的人明确知道自己在拿什么，
 * 遮挡只影响「眼前能不能看见」，不改变数据。
 */

interface ItemDetailProps {
  item: VaultItem | null;
  groups: VaultGroup[];
  /** 用户**临时翻转**过显示的格子，键 `${itemId}:${字段下标}`；与中栏共用。 */
  toggled: Set<string>;
  onToggleReveal: (itemId: number, fieldIndex: number) => void;
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
  toggled,
  onToggleReveal,
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
          toggled={toggled}
          onToggleReveal={onToggleReveal}
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
  toggled,
  onToggleReveal,
  onEdit,
  onDelete,
  onCopy,
  onBack,
}: {
  item: VaultItem;
  groups: VaultGroup[];
  toggled: Set<string>;
  onToggleReveal: (itemId: number, fieldIndex: number) => void;
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
            {item.fields.map((field, index) => {
              // 默认状态来自字段本身（编辑弹窗里设的），点眼睛在本会话内翻转一次
              const isRevealed = !(field.hidden === true) !== toggled.has(`${item.id}:${index}`);
              const hasValue = field.value !== "";

              return (
                <li key={`${field.key}-${index}`} className="py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-[#8A8A8A]">{field.key}</span>
                    <div className="flex items-center gap-0.5">
                      {/* 眼睛**常显**：值默认是遮挡的，它就是唯一的「看一眼」入口，藏起来等于没有 */}
                      {hasValue ? (
                        <button
                          type="button"
                          onClick={() => onToggleReveal(item.id, index)}
                          aria-label={
                            isRevealed ? `隐藏「${field.key}」的值` : `显示「${field.key}」的值`
                          }
                          aria-pressed={isRevealed}
                          title={isRevealed ? "隐藏" : "显示"}
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[2px] text-[#8A8A8A] transition-colors hover:bg-[#F5F5F5] hover:text-[#000000]"
                        >
                          {isRevealed ? (
                            <Eye className="h-3.5 w-3.5" />
                          ) : (
                            <EyeOff className="h-3.5 w-3.5" />
                          )}
                        </button>
                      ) : null}

                      <button
                        type="button"
                        onClick={() => onCopy(field.value)}
                        aria-label={`复制「${field.key}」的值`}
                        title="复制"
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[2px] text-[#8A8A8A] transition-colors hover:bg-[#F5F5F5] hover:text-[#000000]"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {!hasValue ? (
                    <p className="mt-0.5 text-[13px] italic text-[#C4C4C4]">（空）</p>
                  ) : isRevealed ? (
                    <p className="mt-0.5 break-all text-[14px] leading-relaxed text-[#000000]">
                      {field.value}
                    </p>
                  ) : (
                    <p className="mt-0.5 font-mono text-[14px] tracking-[0.15em] text-[#8A8A8A]">
                      {MASK}
                    </p>
                  )}
                </li>
              );
            })}
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
