"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { toggleTodoAction } from "@/lib/todos/actions";
import {
  TODO_LEAVE_ANIMATION_MS,
  TODO_LEAVE_DELAY_MS,
} from "@/lib/todos/leave";
import type { Todo, TodoBoard } from "@/lib/todos/todos";
import { cn } from "@/lib/utils";
import { TodoRow } from "./todo-row";

/**
 * 首页「待办清单」常驻卡（《界面设计规范》§7.17、《功能/待办清单》§2.1）。
 *
 * 数据由首页（Server Component）查好传进来——与工具页共用 `listTodos`，只是取未完成的前 3 条。
 * 计数是**全局**的：已完成数 / 全部条数，与卡里显示几条无关。
 *
 * **勾选与工具页同一节奏：留一拍，再走。**
 * 1. 点一下先原地变灰划线（回执），计数暂不动；
 * 2. 停留 800ms——期间再点一下就是撤销；连续勾选会顺延；
 * 3. 时间到 → 行淡出（200ms）→ 用服务端返回的**整块板**取未完成前 3 条补位，
 *    第 4 条自然补进来，计数也在这一刻一起变。
 *
 * 为什么必须用 action 返回的板：首页初始只拿到 3 条，勾掉一条后第 4 条不在本地；
 * 服务端 action 返回的是全量 open，取 `slice(0, 3)` 就是新的「最新 3 条」。
 *
 * 失败时只回滚这一行的外观，不动整卡（否则刚勾的条目会闪回未勾）。
 *
 * 「管理 →」直指待办本身（`/tools/todo-list`），不是工具列表：管理的是待办，
 * 而工具中心的卡片统一不可点，这一条链接是工具页在站内的唯一入口。
 */

interface TodoCardProps {
  /** 未完成里最新的 3 条。 */
  todos: Todo[];
  /** 全局已完成数。 */
  done: number;
  /** 全局全部条数。 */
  total: number;
}

interface TodoRowState extends Todo {
  /** 本地勾选态：离场前留在原位。 */
  checked: boolean;
}

export function TodoCard({ todos, done, total }: TodoCardProps) {
  const [rows, setRows] = useState<TodoRowState[]>(() =>
    todos.map((todo) => ({ ...todo, checked: false })),
  );
  const [counts, setCounts] = useState({ done, total });
  /** 最近一次写操作返回的整块板：离场时用它补上第 4 条及计数。 */
  const [latestBoard, setLatestBoard] = useState<TodoBoard | null>(null);
  /** 离场计时器的截止时间；勾选成功后重置，连续勾选会顺延。 */
  const [leaveAt, setLeaveAt] = useState<number | null>(null);
  /** 正在淡出的行：这 200ms 内整卡不可再点。 */
  const [leaving, setLeaving] = useState<ReadonlySet<number>>(
    () => new Set<number>(),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // 停留到点：把当前勾着的行标记为「正在离场」
  useEffect(() => {
    if (leaveAt === null) return;
    if (rows.every((row) => !row.checked)) return;

    const delay = Math.max(0, leaveAt - Date.now());
    const timer = setTimeout(() => {
      const ids = new Set(
        rows.filter((row) => row.checked).map((row) => row.id),
      );
      if (ids.size === 0) {
        setLeaveAt(null);
        return;
      }
      setLeaving(ids);
      setLeaveAt(null);
    }, delay);
    return () => clearTimeout(timer);
  }, [leaveAt, rows]);

  // 淡出结束：用服务端整块板补位（未完成前 3 条 + 全局计数）
  useEffect(() => {
    if (leaving.size === 0) return;
    const timer = setTimeout(() => {
      if (latestBoard) {
        setRows(
          latestBoard.open.slice(0, 3).map((todo) => ({
            ...todo,
            checked: false,
          })),
        );
        setCounts({ done: latestBoard.done, total: latestBoard.total });
      } else {
        setRows((current) => current.filter((row) => !leaving.has(row.id)));
      }
      setLeaving(new Set());
    }, TODO_LEAVE_ANIMATION_MS);
    return () => clearTimeout(timer);
  }, [leaving, latestBoard]);

  function toggle(row: TodoRowState) {
    if (pending || leaving.size > 0) return;

    const next = !row.checked;

    setRows((current) =>
      current.map((item) =>
        item.id === row.id ? { ...item, checked: next } : item,
      ),
    );

    startTransition(async () => {
      setError(null);
      const result = await toggleTodoAction(row.id, next);

      if (!result.ok) {
        setRows((current) =>
          current.map((item) =>
            item.id === row.id ? { ...item, checked: !next } : item,
          ),
        );
        setError(result.error);
        return;
      }

      setLatestBoard(result.board);
      if (next) {
        setLeaveAt(Date.now() + TODO_LEAVE_DELAY_MS);
      } else if (!rows.some((item) => item.checked && item.id !== row.id)) {
        // 撤销了最后一条勾选，没有要离场的行了
        setLeaveAt(null);
      }
    });
  }

  return (
    <section className="rounded-[2px] bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="h-3.5 w-[3px] bg-[#000000]" />
          <h2 className="text-sm font-semibold text-[#000000]">待办清单</h2>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <Link
            href="/tools/todo-list"
            className="flex cursor-pointer items-center gap-0.5 text-xs text-[#8A8A8A] transition-colors hover:text-[#000000]"
          >
            管理
            <ArrowRight className="h-3 w-3" />
          </Link>
          <span className="text-xs tabular-nums text-[#999999]">
            {counts.done}/{counts.total}
          </span>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="mt-3 rounded-[2px] bg-[#F5F5F5] p-3">
          <p className="text-[13px] text-[#999999]">
            {counts.total === 0 ? "还没有待办" : "都做完了"}
          </p>
          <Link
            href="/tools/todo-list"
            className="mt-1 inline-block text-[13px] text-[#000000] underline underline-offset-2"
          >
            {counts.total === 0 ? "加一条 →" : "再加一条 →"}
          </Link>
        </div>
      ) : (
        <div className="mt-3 space-y-1">
          {rows.map((row) => (
            <div
              key={row.id}
              className={cn(
                "transition-opacity duration-150",
                leaving.has(row.id) && "opacity-0",
              )}
            >
              <TodoRow
                title={row.title}
                createdAt={row.createdAt}
                completed={row.checked}
                disabled={pending || leaving.size > 0}
                onToggle={() => toggle(row)}
              />
            </div>
          ))}
        </div>
      )}

      {error ? (
        <p role="alert" className="mt-2 text-xs text-[#B91C1C]">
          {error}
        </p>
      ) : null}
    </section>
  );
}
