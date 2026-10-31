import type { Metadata } from "next";
import { MarkdownEditorView } from "@/components/tools/markdown/markdown-editor-view";
import { getDb } from "@/lib/auth/db";
import { requireUser } from "@/lib/auth/current-user";
import { getDocument, listDocuments } from "@/lib/markdown/documents";
import { listTags } from "@/lib/markdown/tags";

export const metadata: Metadata = {
  title: "Markdown 编辑器",
};

/**
 * Markdown 编辑器工具页（《功能/Markdown编辑器》§二 2.1）。受保护页面：未登录访问这里跳登录页。
 *
 * 页面只做接线：登录检查 + 取出这个人的文档列表（`updated_at DESC, id DESC`）、全部标签
 * + 打开首屏那一篇。
 * 为什么只多取一篇的正文：列表里几十篇、每篇上限 10 万字，全量塞进首屏 HTML 就是几 MB；
 * 切换文档时由 `openDocumentAction` 单独取（本地 SQLite，一次查询）。
 */
export default async function MarkdownEditorPage() {
  const user = await requireUser();
  const db = getDb();

  const documents = listDocuments(db, user.id);
  const first = documents[0];
  const initialDocument = first ? getDocument(db, user.id, first.id) : null;

  return (
    <MarkdownEditorView
      initialDocuments={documents}
      initialDocument={initialDocument}
      initialTags={listTags(db, user.id)}
    />
  );
}
