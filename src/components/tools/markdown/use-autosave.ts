"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { saveDocumentAction } from "@/lib/markdown/actions";
import type { MdDocument } from "@/lib/markdown/documents";

/**
 * 自动保存（《功能/Markdown编辑器》§二 2.3、§七）。
 *
 * 三条规矩，都是踩过的坑换来的：
 * 1. **防抖 800ms**：每个字都发请求，中文输入法一次拼字能触发十几次（§七「中文输入法」）；
 * 2. **串行**：一次只飞一个保存请求，后到的旧响应不可能盖掉新内容（§七「保存请求乱序覆盖」）；
 * 3. **`flush()`**：切换文档 / 删除 / 卸载前立刻补存——防抖计时器还没到就切走，
 *    最后不到 0.8 秒的输入就丢了，而这类丢失用户不会立刻发现（§四「切换文档」）。
 *
 * 状态只有三态（外加一个空态）：`saving` 在**排上队时**就置上——用户敲完字立刻看到
 * 「保存中…」，而不是等 800ms 后才看到任何反馈。
 */

export type SaveStatus = "saved" | "saving" | "error";

/** 防抖窗口。改这个数会让「保存中…」与「已保存」的节奏一起变。 */
const DEBOUNCE_MS = 800;

interface PendingContent {
  id: number;
  title: string;
  body: string;
}

interface UseAutosaveArgs {
  /** 当前打开的文档 id；`null` = 一篇都没打开（空态，不做任何保存）。 */
  documentId: number | null;
  title: string;
  body: string;
  /** 保存成功后把服务端那一行交回给界面（标题可能被补成「未命名文档 2」）。 */
  onSaved: (document: MdDocument) => void;
}

export interface UseAutosaveResult {
  status: SaveStatus;
  /** 立刻保存并等它落地（切换文档 / 删除 / 卸载前调用）。 */
  flush: () => Promise<void>;
  /** 保存失败后点状态栏重试。 */
  retry: () => void;
  /** 中文输入法拼字开始 / 结束：拼字期间不排保存（半截拼音不该落库）。 */
  setComposing: (composing: boolean) => void;
  /** 刚打开 / 刚建好一篇：把它当作「已保存」的基准，不要立刻反手存一遍。 */
  syncBaseline: (document: Pick<MdDocument, "id" | "title" | "body">) => void;
  /** 一篇都不剩（删光了）：清掉基准，别把空内容存到已经不存在的 id 上。 */
  resetBaseline: () => void;
}

export function useAutosave({
  documentId,
  title,
  body,
  onSaved,
}: UseAutosaveArgs): UseAutosaveResult {
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [composing, setComposing] = useState(false);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 串行队列：每次保存都挂在上一次之后，时间顺序 = 内容顺序。 */
  const chainRef = useRef<Promise<void>>(Promise.resolve());
  /** 上一次「已经存进去（或刚打开时就是这份）」的内容，用来判断有没有真的改过。 */
  const baselineRef = useRef<PendingContent | null>(null);
  /** 最近一次失败的内容：点「保存失败，重试」时原样再发一次。 */
  const failedRef = useRef<PendingContent | null>(null);
  /** 每次渲染都更新的最新内容（定时器 / flush 读它，不读闭包里的旧值）。 */
  const latestRef = useRef<PendingContent | null>(null);
  const onSavedRef = useRef(onSaved);
  const aliveRef = useRef(true);

  // 最新内容与回调写进 ref：定时器 / flush 读它，读到的永远是「这一刻」的输入，
  // 而不是排保存那一刻闭包里的旧值。写在 effect 里是因为渲染期间不许改 ref。
  useEffect(() => {
    latestRef.current = documentId === null ? null : { id: documentId, title, body };
  }, [documentId, title, body]);

  useEffect(() => {
    onSavedRef.current = onSaved;
  }, [onSaved]);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  /** 真正发请求的那一步：排队执行，永远按内容的新旧顺序落地。 */
  const performSave = useCallback(async (target: PendingContent) => {
    const baseline = baselineRef.current;
    if (
      baseline &&
      baseline.id === target.id &&
      baseline.title === target.title &&
      baseline.body === target.body
    ) {
      return; // 排队期间已经被更早的一次保存覆盖掉了，不用再发
    }

    if (aliveRef.current) setStatus("saving");
    try {
      const result = await saveDocumentAction(target.id, {
        title: target.title,
        body: target.body,
      });
      if (!result.ok) {
        failedRef.current = target;
        if (aliveRef.current) setStatus("error");
        return;
      }
      baselineRef.current = { id: target.id, title: target.title, body: target.body };
      failedRef.current = null;
      if (aliveRef.current) setStatus("saved");
      onSavedRef.current(result.document);
    } catch {
      // 断网 / 请求被浏览器中止：留在失败态，输入不丢，重试一次就能补上
      failedRef.current = target;
      if (aliveRef.current) setStatus("error");
    }
  }, []);

  const enqueue = useCallback(
    (target: PendingContent): Promise<void> => {
      chainRef.current = chainRef.current.then(() => performSave(target));
      return chainRef.current;
    },
    [performSave],
  );

  /** 内容变了就排一次保存（防抖）；拼字期间不排。 */
  useEffect(() => {
    if (documentId === null || composing) return;

    const baseline = baselineRef.current;
    if (
      baseline &&
      baseline.id === documentId &&
      baseline.title === title &&
      baseline.body === body
    ) {
      clearTimer();
      return;
    }

    clearTimer();
    setStatus("saving");
    const target = { id: documentId, title, body };
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void enqueue(target);
    }, DEBOUNCE_MS);

    return clearTimer;
  }, [documentId, title, body, composing, enqueue, clearTimer]);

  // 卸载（换页 / 关标签）：补存最后一次输入。浏览器直接关掉的情况兜不住（§一「主动放弃」）
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      clearTimer();
      const latest = latestRef.current;
      if (!latest) return;
      const baseline = baselineRef.current;
      if (
        baseline &&
        baseline.id === latest.id &&
        baseline.title === latest.title &&
        baseline.body === latest.body
      ) {
        return;
      }
      void enqueue(latest);
    };
  }, [enqueue, clearTimer]);

  const flush = useCallback(async () => {
    clearTimer();
    const latest = latestRef.current;
    if (latest) {
      const baseline = baselineRef.current;
      const changed =
        !baseline ||
        baseline.id !== latest.id ||
        baseline.title !== latest.title ||
        baseline.body !== latest.body;
      if (changed) await enqueue(latest);
    }
    // 等这一刻之前排进来的全部保存落地（切换文档要拿它的 updated_at）
    await chainRef.current;
  }, [clearTimer, enqueue]);

  const retry = useCallback(() => {
    const target = failedRef.current ?? latestRef.current;
    if (!target) return;
    void enqueue(target);
  }, [enqueue]);

  const syncBaseline = useCallback((document: Pick<MdDocument, "id" | "title" | "body">) => {
    clearTimer();
    baselineRef.current = {
      id: document.id,
      title: document.title,
      body: document.body,
    };
    failedRef.current = null;
    setStatus("saved");
  }, [clearTimer]);

  const resetBaseline = useCallback(() => {
    clearTimer();
    baselineRef.current = null;
    failedRef.current = null;
    setStatus("saved");
  }, [clearTimer]);

  // 返回稳定引用：调用方会把它写进 useCallback / useEffect 的依赖，每次渲染都换对象会让那些依赖白跑
  return useMemo(
    () => ({ status, flush, retry, setComposing, syncBaseline, resetBaseline }),
    [status, flush, retry, syncBaseline, resetBaseline],
  );
}
