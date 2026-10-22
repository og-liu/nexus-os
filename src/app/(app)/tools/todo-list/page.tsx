import type { Metadata } from "next";
import { TodoListView } from "@/components/todos/todo-list-view";
import { getDb } from "@/lib/auth/db";
import { requireUser } from "@/lib/auth/current-user";
import { listTodos } from "@/lib/todos/todos";

export const metadata: Metadata = {
  title: "待办清单",
};

/**
 * 待办工具页（《功能/待办清单》§2.2）。受保护页面：未登录访问这里跳登录页。
 *
 * 页面只做接线：登录检查 + 取出当前用户整块待办板，交互全部交给客户端视图。
 * 不套 PageHeader——与便签页同构：工具名与状态在内容区的信息条里，
 * 手机上「汉堡 + 新建」住在页面顶部那一行，滚过信息条后还有吸顶工具栏。
 */
export default async function TodoListPage() {
  const user = await requireUser();
  const board = listTodos(getDb(), user.id);

  return <TodoListView initialBoard={board} />;
}
