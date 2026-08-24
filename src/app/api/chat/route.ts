import { type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getDb, type MessageRow } from "@/lib/db";
import {
  streamChat,
  ProviderError,
  type ChatMessage,
  type ChatContentPart,
  type ThinkingOptions,
} from "@/lib/providers";
import { isValidModelId, DEFAULT_MODEL_ID, getModelMeta } from "@/lib/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 上下文滑动窗口：按轮数裁，取最近 20 轮（即 40 条）消息
const MAX_CONTEXT_TURNS = 20;

// 用户图片落盘目录（public/ 下，Next 自动 serve，历史回显直接 <img src="/uploads/x.png">）
const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

/** 从 data URL 推断图片扩展名（保存文件用） */
function extFromDataUrl(dataUrl: string): string {
  const m = /^data:image\/(png|jpe?g|gif|webp);/i.exec(dataUrl);
  const ext = m ? m[1].toLowerCase() : "png";
  return ext === "jpeg" ? "jpg" : ext;
}

/** 把 base64 data URL 存成文件，返回可回显的相对路径（如 /uploads/xxx.png） */
function saveImage(dataUrl: string): string | null {
  try {
    const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
    if (!base64) return null;
    const filename = `${randomUUID()}.${extFromDataUrl(dataUrl)}`;
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(UPLOAD_DIR, filename),
      Buffer.from(base64, "base64"),
    );
    return `/uploads/${filename}`;
  } catch {
    return null;
  }
}

/** 把历史图片路径读回 base64 data URL（喂给模型用） */
function pathToDataUrl(relPath: string): string | null {
  try {
    const rel = relPath.replace(/^\/+/, "");
    const abs = path.join(process.cwd(), "public", rel);
    const buf = fs.readFileSync(abs);
    const ext = path.extname(rel).slice(1).toLowerCase();
    const mime =
      ext === "png" ? "image/png"
      : ext === "jpg" || ext === "jpeg" ? "image/jpeg"
      : ext === "gif" ? "image/gif"
      : ext === "webp" ? "image/webp"
      : "image/png";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

/** 组装消息 content：无图返回纯文本；有图返回图文分段数组 */
function buildContent(
  text: string,
  images: string[],
): string | ChatContentPart[] {
  if (images.length === 0) return text;
  const parts: ChatContentPart[] = [];
  // 纯图没写字时，补一句默认引导，让模型知道要干嘛
  parts.push({ type: "text", text: text.trim() || "请看这张图片，描述你看到的内容。" });
  for (const url of images) {
    parts.push({ type: "image_url", image_url: { url } });
  }
  return parts;
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    content?: string;
    sessionId?: string;
    model?: string;
    thinking?: { enabled?: boolean; effort?: string };
    images?: string[];
  } | null;

  const content = body?.content?.trim() ?? "";
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId : null;
  const incomingImages = Array.isArray(body?.images)
    ? body.images.filter(
        (u) => typeof u === "string" && u.startsWith("data:image/"),
      )
    : [];

  const requestedModel = body?.model ?? "";
  const model = isValidModelId(requestedModel) ? requestedModel : DEFAULT_MODEL_ID;
  const supportsVision = getModelMeta(model)?.supportsVision ?? false;
  const effortRaw = body?.thinking?.effort;
  const supportsThinking = getModelMeta(model)?.supportsThinking ?? false;
  const thinking: ThinkingOptions = {
    enabled: supportsThinking && body?.thinking?.enabled === true,
    effort: effortRaw === "high" || effortRaw === "max" ? effortRaw : "low",
  };

  if (!content && incomingImages.length === 0) {
    return new Response("消息不能为空", { status: 400 });
  }

  // 防御：不支持看图的模型带图时丢弃图片（前端已拦截，这里兜底）
  const images = supportsVision ? incomingImages : [];

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

  // 图片落盘（库只存路径，图片本体不进 SQLite）
  const savedPaths = images.map(saveImage).filter((p): p is string => !!p);

  // 落库用户消息
  db.prepare(
    `INSERT INTO messages (id, session_id, role, content, images, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    sid,
    "user",
    content,
    savedPaths.length > 0 ? JSON.stringify(savedPaths) : null,
    now,
  );

  // 取出历史消息，滑动窗口按轮数裁，组装上下文
  const historyRows = db
    .prepare(
      `SELECT * FROM (
         SELECT * FROM messages WHERE session_id = ? ORDER BY created_at DESC LIMIT ?
       ) ORDER BY created_at ASC`,
    )
    .all(sid, MAX_CONTEXT_TURNS * 2) as MessageRow[];

  // 历史消息：user 消息带图时，把图片路径读回 data URL 再喂给模型（多轮看图）
  const history: ChatMessage[] = historyRows.map((m) => {
    const role = m.role as "user" | "assistant";
    if (role === "user" && m.images) {
      try {
        const paths = JSON.parse(m.images) as string[];
        const dataUrls = paths
          .map(pathToDataUrl)
          .filter((u): u is string => !!u);
        if (dataUrls.length > 0) {
          return { role, content: buildContent(m.content, dataUrls) };
        }
      } catch {
        // 图片字段损坏时回落纯文本
      }
    }
    return { role, content: m.content };
  });

  // 本条用户消息追加进历史末尾（图片直接用手头的 data URL）
  history.push({
    role: "user",
    content: buildContent(content, images),
  });

  db.prepare(`UPDATE sessions SET updated_at = ? WHERE id = ?`).run(now, sid);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      };

      let assistantContent = "";
      try {
        assistantContent = await streamChat(model, history, thinking, (kind, text) => {
          send({
            type: kind === "reasoning" ? "reasoning" : "delta",
            content: text,
          });
        });
      } catch (e) {
        const message =
          e instanceof ProviderError ? e.message : "调用失败，请稍后重试";
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
        const base = content || (savedPaths.length > 0 ? "图片消息" : "新会话");
        title = base.length > 20 ? `${base.slice(0, 20)}…` : base;
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