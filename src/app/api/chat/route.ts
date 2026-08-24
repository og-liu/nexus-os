import { type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { getDb, type MessageRow } from "@/lib/db";
import { streamChat, DeepSeekError, type ChatMessage } from "@/lib/deepseek";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 上下文滑动窗口：按轮数裁，取最近 20 轮（即 40 条）消息
const MAX_CONTEXT_TURNS = 20;

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    content?: string;
    sessionId?: string;
  } | null;

  const content = body?.content?.trim() ?? "";
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId : null;

  if (!content) {
    return new Response("消息不能为空", { status: 400 });
  }

  const db = getDb();
  const now = Date.now();

  // 懒创建：没有会话时先建一个
  let sid = sessionId;
  if (!sid) {
    sid = randomUUID();
    db.prepare(
      `INSERT INTO sessions (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)`,
    ).run(sid, "新会话", now, now);
  }

  // 是否为该会话第一条消息（据此决定是否生成标题）
  const countRow = db
    .prepare(`SELECT COUNT(*) AS c FROM messages WHERE session_id = ?`)
    .get(sid) as { c: number };
  const isFirst = countRow.c === 0;

  // 落库用户消息
  db.prepare(
    `INSERT INTO messages (id, session_id, role, content, images, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(randomUUID(), sid, "user", content, null, now);

  // 取出历史消息，滑动窗口按轮数裁，组装上下文
  const historyRows = db
    .prepare(
      `SELECT * FROM (
         SELECT * FROM messages WHERE session_id = ? ORDER BY created_at DESC LIMIT ?
       ) ORDER BY created_at ASC`,
    )
    .all(sid, MAX_CONTEXT_TURNS * 2) as MessageRow[];

  const history: ChatMessage[] = historyRows.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  db.prepare(`UPDATE sessions SET updated_at = ? WHERE id = ?`).run(now, sid);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      };

      let assistantContent = "";
      try {
        assistantContent = await streamChat(history, (delta) => {
          send({ type: "delta", content: delta });
        });
      } catch (e) {
        const message =
          e instanceof DeepSeekError ? e.message : "调用失败，请稍后重试";
        send({ type: "error", message });
        controller.close();
        return;
      }

      if (assistantContent) {
        db.prepare(
          `INSERT INTO messages (id, session_id, role, content, images, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
        ).run(randomUUID(), sid, "assistant", assistantContent, null, Date.now());
      }

      // 标题自动生成（v1：取首条用户消息截断；后续可升级为智能摘要）
      let title = "新会话";
      if (isFirst) {
        title = content.length > 20 ? `${content.slice(0, 20)}…` : content;
        db.prepare(
          `UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?`,
        ).run(title, Date.now(), sid);
      }

      send({ type: "done", sessionId: sid, title });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}