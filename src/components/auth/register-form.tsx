"use client";

import { useActionState } from "react";
import { TextField } from "@/components/ui/text-field";
import { useDirtyFields } from "@/hooks/use-dirty-fields";
import { type AuthFormState, registerAction } from "@/lib/auth/actions";

/**
 * 注册表单（《界面设计规范》§7.16）。
 *
 * 用户名提示文案来自《功能/登录注册》定稿的校验规则——规则定下来了，提示才能写具体；
 * 规则没定的时候不写提示，免得凭空造出一条谁也没同意过的要求。
 *
 * 错误提示的生命周期交给 `useDirtyFields`：改过的字段不再显示旧错误，提交时全部清空。
 *
 * 注册页的失败目前**全部**是字段级（校验不通过、用户名被占用），所以这里没有表单级提示块
 * ——真出现归不到某个字段的失败时再加（对比 `login-form.tsx`，那边有「用户名或密码不正确」）。
 */
const initialState: AuthFormState = {};

export function RegisterForm() {
  const [state, formAction, pending] = useActionState(
    registerAction,
    initialState,
  );
  const { isDirty, markDirty, clearAll } = useDirtyFields();

  return (
    <form action={formAction} onSubmit={clearAll}>
      <div className="space-y-5 md:space-y-4">
        <TextField
          id="username"
          name="username"
          label="用户名"
          placeholder="请输入用户名"
          hint="3–20 位，可用汉字、字母、数字、下划线"
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
          hint="至少 8 位字符"
          autoComplete="new-password"
          error={isDirty("password") ? undefined : state.fieldErrors?.password}
          onChange={() => markDirty("password")}
        />
        <TextField
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          label="确认密码"
          placeholder="请再次输入密码"
          autoComplete="new-password"
          error={
            isDirty("confirmPassword")
              ? undefined
              : state.fieldErrors?.confirmPassword
          }
          onChange={() => markDirty("confirmPassword")}
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-[2px] bg-[#000000] px-4 text-sm font-medium text-white transition-colors hover:bg-[#333333] disabled:cursor-not-allowed disabled:opacity-50 md:h-11"
      >
        {pending ? "注册中…" : "注册"}
      </button>
    </form>
  );
}
