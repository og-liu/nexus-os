"use client";

import { useEffect, useState, useTransition } from "react";
import { ToolMobileBar } from "@/components/tools/tool-mobile-bar";
import { findToolBySlug } from "@/components/tools/tool-catalog";
import { useToast } from "@/components/ui/toast";
import { formatDeletedMessage } from "@/lib/toast/format";
import {
  clearCompletedTodosAction,
  createTodoAction,
  deleteTodoAction,
  toggleTodoAction,
  updateTodoAction,
  type TodosActionResult,
} from "@/lib/todos/actions";
import { cn } from "@/lib/utils";
import { TODO_LEAVE_ANIMATION_MS, TODO_LEAVE_DELAY_MS } from "@/lib/todos/leave";
import type { Todo, TodoBoard } from "@/lib/todos/todos";
import { TodoCompletedSection } from "./todo-completed-section";
import { TodoDialog } from "./todo-dialog";
import { TodoTile } from "./todo-tile";
import { TodoToolIntro } from "./todo-tool-intro";

/**
 * 待办工具页（《功能/待办清单》§2.2）。
 *
 * 页面骨架与便签页完全同构：无页头 → 移动端导航行（汉堡 + 新建）→ 工具信息条 →
 * 吸顶工具栏 → 卡片网格。新建与编辑都走 `TodoDialog` 弹窗，卡片本身只负责展示与入口。
 *
 * **勾选：留一拍，再走**。
 * 1. 点一下先只改本卡外观（黑底白勾 + 标题灰划线），给「勾上了」一个回执；
 * 2. 停留 800ms——期间再点一下就是撤销，卡片不会动；
 * 3. 计时到 → 卡片原地收起（网格行高 + 淡出，约 200ms）→ 移入已完成，
 *    「未完成 / 已完成」两个计数在离场那一刻一起变；
 * 4. **连续勾选会重置计时器**（debounce）：快速勾几张时它们都留在原位，
 *    等手停下来再一起离场，行不会在指针下面跳来跳去。
 *
 * 取消勾选不受这个节奏影响：服务端返回的列表就是它按创建时间该在的位置，立刻归位。
 */

interface TodoListViewProps {
  initialBoard: TodoBoard;
}

export function TodoListView({ initialBoard }: TodoListViewProps) {
  const [open, setOpen] = useState<Todo[]>(initialBoard.open);
  const [completed, setCompleted] = useState<Todo[]>(initialBoard.completed);
  /** 本会话里勾过、但还留在未完成区原位的卡片。 */
  const [checked, setChecked] = useState<ReadonlySet<number>>(
    () => new Set<number>(),
  );
  /** 正在收起（离场动画中）的卡片：这 200ms 内不可再操作。 */
  const [leaving, setLeaving] = useState<ReadonlySet<number>>(
    () => new Set<number>(),
  );
  const [expanded, setExpanded] = useState(false);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<number | null>(
    null,
  );
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  /** 离场计时器的截止时间；勾选成功后重置，连续勾选会顺延。 */
  const [leaveAt, setLeaveAt] = useState<number | null>(null);

  // 停留到点：把当前勾选的卡片标记为「正在离场」，进入收起动画
  useEffect(() => {
    if (leaveAt === null) return;
    const delay = Math.max(0, leaveAt - Date.now());
    const timer = setTimeout(() => {
      if (checked.size === 0) {
        setLeaveAt(null);
        return;
      }
      setLeaving(new Set(checked));
      setLeaveAt(null);
    }, delay);
    return () => clearTimeout(timer);
  }, [leaveAt, checked]);

  // 收起动画结束：真正把卡片从未完成挪到已完成，两个计数在这一刻一起变
  useEffect(() => {
    if (leaving.size === 0) return;
    const timer = setTimeout(() => {
      const ids = leaving;
      // `leaving` 的迭代顺序就是勾选顺序：倒过来 = 最后勾的排最前（与 completed_at DESC 一致）
      const completedAt = Date.now();
      const leavingTodos = [...leaving]
        .map((id) => open.find((todo) => todo.id === id))
        .filter((todo): todo is Todo => Boolean(todo))
        .reverse()
        .map((todo) => ({ ...todo, completedAt }));
      setOpen((current) => current.filter((todo) => !ids.has(todo.id)));
      setCompleted((current) => [...leavingTodos, ...current]);
      // 只清掉这批离场的勾选态：离场动画的 200ms 里可能又勾了别的卡
      setChecked((current) => {
        const next = new Set(current);
        for (const id of ids) next.delete(id);
        return next;
      });
      setLeaving(new Set());
    }, TODO_LEAVE_ANIMATION_MS);
    return () => clearTimeout(timer);
  }, [leaving, open]);

  const toast = useToast();
  const tool = findToolBySlug("todo-list");
  // 一条都没有才是「空」；只有已完成时仍是一张网格 + 折叠条
  const empty = open.length === 0 && completed.length === 0;
  const dialogOpen = creating || editingTodo !== null;
  // 顶部错误条只承载「弹窗之外」的失败（勾选 / 删除 / 清除）
  const showTopError = error !== null && !dialogOpen;

  /** 结构性写操作（新建 / 保存 / 删除 / 清除 / 取消勾选）之后，整块板以服务端为准。 */
  function applyBoard(board: TodoBoard) {
    setLeaveAt(null);
    setOpen(board.open);
    setCompleted(board.completed);
    setChecked(new Set());
    setLeaving(new Set());
    setConfirmingDeleteId(null);
    setConfirmingClear(false);
  }

  function run(
    action: () => Promise<TodosActionResult>,
    onSuccess: (board: TodoBoard) => void,
    onFailure?: () => void,
  ) {
    startTransition(async () => {
      setError(null);
      const result = await action();
      if (result.ok) {
        onSuccess(result.board);
        return;
      }
      setError(result.error);
      onFailure?.();
    });
  }

  function openCreate() {
    setEditingTodo(null);
    setCreating(true);
    setConfirmingDeleteId(null);
    setConfirmingClear(false);
    setError(null);
  }

  function openEdit(todo: Todo) {
    setCreating(false);
    setEditingTodo(todo);
    setConfirmingDeleteId(null);
    setConfirmingClear(false);
    setError(null);
  }

  function closeDialog() {
    setCreating(false);
    setEditingTodo(null);
    setError(null);
  }

  /** 新建 / 编辑共用一次保存：失败时错误留在弹窗里，成功才关窗并套用整块板。 */
  function save(title: string) {
    if (pending) return;

    startTransition(async () => {
      setError(null);
      const result = creating
        ? await createTodoAction(title)
        : editingTodo
          ? await updateTodoAction(editingTodo.id, title)
          : null;
      if (!result) return;

      if (!result.ok) {
        setError(result.error);
        return;
      }
      applyBoard(result.board);
      setCreating(false);
      setEditingTodo(null);
    });
  }

  /** 勾选 / 取消勾选一条**未完成**的卡片：先改外观，成功后再安排「留一拍离场」。 */
  function toggleOpen(todo: Todo) {
    if (pending || leaving.has(todo.id)) return;

    const nextChecked = !checked.has(todo.id);
    const previousChecked = checked;
    const nextSet = new Set(previousChecked);
    if (nextChecked) nextSet.add(todo.id);
    else nextSet.delete(todo.id);
    setChecked(nextSet);

    run(
      () => toggleTodoAction(todo.id, nextChecked),
      () => {
        if (nextChecked) {
          // 勾上：留一拍再走；连续勾选会把计时器往后顺延
          setLeaveAt(Date.now() + TODO_LEAVE_DELAY_MS);
        } else if (nextSet.size === 0) {
          // 撤销了最后一张，没有要离场的卡了
          setLeaveAt(null);
        }
      },
      () => setChecked(previousChecked),
    );
  }

  /** 取消勾选一条**已完成**的卡片：让它回到未完成区里按创建时间该在的位置。 */
  function toggleCompleted(todo: Todo) {
    if (pending) return;

    const previousCompleted = completed;
    setCompleted((current) => current.filter((item) => item.id !== todo.id));

    run(
      () => toggleTodoAction(todo.id, false),
      (board) => applyBoard(board),
      () => setCompleted(previousCompleted),
    );
  }

  function remove(todo: Todo) {
    if (pending) return;
    run(
      () => deleteTodoAction(todo.id),
      (board) => {
        applyBoard(board);
        toast.success(formatDeletedMessage("待办", todo.title));
      },
    );
  }

  function clearCompleted() {
    if (pending) return;
    run(
      () => clearCompletedTodosAction(),
      (board) => applyBoard(board),
    );
  }

  function renderTile(todo: Todo, done: boolean, onToggle: () => void) {
    return (
      <TodoTile
        key={todo.id}
        todo={todo}
        completed={done}
        busy={pending || leaving.has(todo.id)}
        confirmingDelete={confirmingDeleteId === todo.id}
        onToggle={onToggle}
        onEdit={() => openEdit(todo)}
        onRequestDelete={() => {
          setConfirmingClear(false);
          setConfirmingDeleteId(todo.id);
        }}
        onCancelDelete={() => setConfirmingDeleteId(null)}
        onConfirmDelete={() => remove(todo)}
      />
    );
  }

  const gridClass =
    "grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3";

  return (
    <>
      {/* 移动端顶部导航行：汉堡 + 新建（桌面由工具信息条右侧承担） */}
      <ToolMobileBar
        newLabel="新建待办"
        onNew={openCreate}
        disabled={pending}
      />

      <div className="px-4 py-4 md:px-6 md:py-6">
        <TodoToolIntro
          tool={tool}
          onNew={openCreate}
          disabled={pending}
          error={showTopError ? error : null}
        />

        <div className="mt-4 space-y-4 xl:mt-6 xl:space-y-6">
          {empty ? (
            <div className="rounded-[2px] border border-dashed border-[#D9D9D9] bg-white p-8 text-center md:p-12">
              <p className="text-sm text-[#A0A8B4]">还没有待办</p>
              <button
                type="button"
                onClick={openCreate}
                className="mt-3 h-8 cursor-pointer rounded-[2px] bg-[#000000] px-4 text-xs font-medium text-white transition-colors hover:bg-[#333333]"
              >
                新建待办
              </button>
            </div>
          ) : (
            <>
              {open.length > 0 ? (
                <section className="space-y-3">
                  <div className="flex min-h-7 items-center gap-2">
                    <span className="h-3.5 w-[3px] bg-[#000000]" />
                    <h2 className="text-sm font-semibold text-[#000000]">
                      未完成
                    </h2>
                    <span className="text-xs tabular-nums text-[#999999]">
                      {open.length}
                    </span>
                  </div>
                  <div className={gridClass}>
                    {open.map((todo) => {
                      const isLeaving = leaving.has(todo.id);
                      return (
                        <div
                          key={todo.id}
                          className={cn(
                            "grid transition-[grid-template-rows] duration-200 ease-out",
                            isLeaving ? "grid-rows-[0fr]" : "grid-rows-[1fr]",
                          )}
                        >
                          <div
                            className={cn(
                              "min-h-0 overflow-hidden transition-opacity duration-150",
                              isLeaving && "opacity-0",
                            )}
                          >
                            {renderTile(todo, checked.has(todo.id), () =>
                              toggleOpen(todo),
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ) : null}

              {/* 没有已完成时整条不渲染 */}
              {completed.length > 0 ? (
                <TodoCompletedSection
                  count={completed.length}
                  expanded={expanded}
                  busy={pending}
                  confirmingClear={confirmingClear}
                  onToggleExpanded={() => setExpanded((current) => !current)}
                  onRequestClear={() => {
                    setConfirmingDeleteId(null);
                    setConfirmingClear(true);
                  }}
                  onCancelClear={() => setConfirmingClear(false)}
                  onConfirmClear={clearCompleted}
                >
                  {expanded ? (
                    <div className={gridClass}>
                      {completed.map((todo) =>
                        renderTile(todo, true, () => toggleCompleted(todo)),
                      )}
                    </div>
                  ) : null}
                </TodoCompletedSection>
              ) : null}
            </>
          )}
        </div>
      </div>

      <TodoDialog
        open={dialogOpen}
        mode={creating ? "create" : "edit"}
        initialValue={editingTodo?.title}
        createdAt={editingTodo?.createdAt}
        busy={pending}
        error={error}
        onSave={save}
        onDelete={
          // 编辑态才有删除：直接删掉当前这条、关掉弹窗（没有二次确认，2026-10-22 联调要求）
          editingTodo
            ? () =>
                run(
                  () => deleteTodoAction(editingTodo.id),
                  (board) => {
                    applyBoard(board);
                    setEditingTodo(null);
                    toast.success(
                      formatDeletedMessage("待办", editingTodo.title),
                    );
                  },
                )
            : undefined
        }
        onCancel={closeDialog}
      />
    </>
  );
}
