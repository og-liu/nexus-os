"use client";

import { useActionState } from "react";
import { TextField } from "@/components/ui/text-field";
import { useDirtyFields } from "@/hooks/use-dirty-fields";
import { type AuthFormState, loginAction } from "@/lib/auth/actions";

/**
 * 登录表单（《界面设计规范》§7.16）。
 *
 * 静态阶段这里是纯布局、按钮是 `type="button"`（当时还没有 action，`<form>` 一提交就走 GET
 * 会把密码带进 URL）。现在接上了 Server Action，才换成 `<form action={...}>` 与 `type="submit"`。
 *
 * 用 `useActionState` 拿三样东西：返回值（错误信息）、`action`、`pending`（提交中）。
 * action 只在服务端执行，密码与数据库都不会经过浏览器。
 *
 * 初始状态在本文件里定义，不从 actions.ts 取：`'use server'` 文件**只允许导出 async 函数**，
 * 导出一个对象常量会在构建期报错。
 *
 * `useDirtyFields` 管的是错误提示的生命周期：服务端返回的是上一次提交的快照，
 * 用户一旦重新编辑，旧提示就必须让位；提交时再清空一次，交给服务端重新判定。
 */
const initialState: AuthFormState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);
  const { isDirty, anyDirty, markDirty, clearAll } = useDirtyFields();

  return (
    <form action={formAction} onSubmit={clearAll}>
      <div className="space-y-5 md:space-y-4">
        <TextField
          id="username"
          name="username"
          label="用户名"
          placeholder="请输入用户名"
          autoComplete="username"
          defaultValue={state.username}
          error={isDirty("username") ? undefined : state.fieldErrors?.username}
          onChange={() => markDirty("username")}
        />
        <TextField
          id="password"
          name="password"
          type="password"
          label="密码"
          placeholder="请输入密码"
          autoComplete="current-password"
          error={isDirty("password") ? undefined : state.fieldErrors?.password}
          onChange={() => markDirty("password")}
        />
        {state.formError && !anyDirty ? (
          <p
            role="alert"
            className="rounded-[2px] border border-[#E5E5E5] bg-[#F5F5F5] px-3 py-2 text-xs text-[#B91C1C]"
          >
            {state.formError}
          </p>
        ) : null}
      </div>

      <button
        type="submit"
        disabled={pending}
        className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-[2px] bg-[#000000] px-4 text-sm font-medium text-white transition-colors hover:bg-[#333333] disabled:cursor-not-allowed disabled:opacity-50 md:h-11"
      >
        {pending ? "登录中…" : "登录"}
      </button>
    </form>
  );
}
