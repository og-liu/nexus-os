"use client";

import { useCallback, useState } from "react";

/**
 * 记录「用户已经改过哪些字段」，用来让**过期的错误提示**立刻消失。
 *
 * 为什么需要：Server Action 的校验结果通过 `useActionState` 回传，它是**上一次提交的快照**，
 * 不会随着输入变化自动重算。于是把密码从 7 位改成 8 位之后，「密码至少 8 位」仍然挂在输入框下面
 * —— 它不是"校验没通过"，而是一条过期提示，但用户读到的就是「我明明改对了，它却说我不对」。
 *
 * 规则（《界面设计规范》§7.16）：
 * - 某个字段被编辑过 → 该字段的旧错误不再显示
 * - 表单里任意字段被编辑过 → 表单级错误（如「用户名或密码不正确」）不再显示
 * - 下一次提交时全部清空，由服务端给出新结果
 *
 * 这个 hook 放在 `src/hooks/`：两个表单都需要同一份状态逻辑，不是为一次性使用提前抽象。
 */
export function useDirtyFields() {
  const [dirty, setDirty] = useState<readonly string[]>([]);

  const markDirty = useCallback((field: string) => {
    setDirty((previous) =>
      previous.includes(field) ? previous : [...previous, field],
    );
  }, []);

  const clearAll = useCallback(() => setDirty([]), []);

  const isDirty = useCallback((field: string) => dirty.includes(field), [dirty]);

  return { isDirty, anyDirty: dirty.length > 0, markDirty, clearAll };
}
