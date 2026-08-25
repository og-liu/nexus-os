import { type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getDb, type MessageRow } from "@/lib/db";
import {
  ProviderError,
  type ChatMessage,
  type ChatContentPart,
  type ThinkingOptions,
  type ThinkingEffort,
} from "@/lib/providers";
import {
  isValidModelId,
  DEFAULT_MODEL_ID,
  getModelMeta,
  getThinkingEfforts,
  getDefaultThinkingEffort,
} from "@/lib/models";
import { agentLoop, type ToolCallRecord, type TokenUsage } from "@/lib/agent/loop";
import { savePlan } from "@/lib/agent/plan-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 上下文滑动窗口：按轮数裁，取最近 20 轮（即 40 条）消息
const MAX_CONTEXT_TURNS = 20;

// 用户图片落盘目录（public/ 下，Next 自动 serve，历史回显直接 <img src="/uploads/x.png">）
const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

const SYSTEM_PROMPT =
  "你是 Nexus OS 的智能助手 Agent。用简洁、自然的语言回答用户，条理清晰，中文为主。\n" +
  "全程用中文思考：你的内部思考过程（reasoning）也用中文表达，不要用英文。\n\n" +
  "## 工具使用规则\n" +
  "1. 当需要调用工具时，直接调用，不要在文字里假装调用。\n" +
  "2. 工具结果返回后，综合信息给出回答，不要直接复制粘贴原始结果。\n" +
  "3. 如果工具返回了错误或空结果，尝试其他方式或如实告诉用户。\n\n" +
  "## 搜索工具使用规范\n" +
  "1. 搜索前先用常识判断，确定自己不知道再搜，不要为搜而搜。\n" +
  "2. 搜索结果里有足够信息时，综合整理后回答。\n" +
  "3. 回答中引用搜索结果时，在相关句末标注来源，格式为 [序号]，" +
  "并在回答末尾列出参考链接，格式：[序号] 标题 - URL。\n" +
  "4. 连续 2 次搜索都没有满意结果，直接告诉用户查不到，并说明试了什么关键词。\n" +
  "5. 天气类问题用 get_weather 工具，不要用搜索。";

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
  // 档位按模型档位表兜底：非法/缺失值回落该模型默认档（DeepSeek 无 low 档）
  const efforts = getThinkingEfforts(model);
  const thinking: ThinkingOptions = {
    enabled: supportsThinking && body?.thinking?.enabled === true,
    effort: efforts.includes(effortRaw as ThinkingEffort)
      ? (effortRaw as ThinkingEffort)
      : getDefaultThinkingEffort(model),
  };

  if (!content && incomingImages.length === 0) {
    return new Response("消息不能为空", { status: 400 });
  }

  // 防御：不支持看图的模型带图时丢弃图片
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

  const countRow = db
    .prepare(`SELECT COUNT(*) AS c FROM messages WHERE session_id = ?`)
    .get(sid) as { c: number };
  const isFirst = countRow.c === 0;

  // 图片落盘
  const savedPaths = images.map(saveImage).filter((p): p is string => !!p);

  // 落库用户消息
  db.prepare(
    `INSERT INTO messages (id, session_id, role, content, images, tool_calls, reasoning, usage, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    sid,
    "user",
    content,
    savedPaths.length > 0 ? JSON.stringify(savedPaths) : null,
    null,
    null,
    null,
    now,
  );

  // 取出历史消息
  const historyRows = db
    .prepare(
      `SELECT * FROM (
         SELECT * FROM messages WHERE session_id = ? ORDER BY created_at DESC LIMIT ?
       ) ORDER BY created_at ASC`,
    )
    .all(sid, MAX_CONTEXT_TURNS * 2) as MessageRow[];

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
        // ignore
      }
    }
    return { role, content: m.content };
  });

  db.prepare(`UPDATE sessions SET updated_at = ? WHERE id = ?`).run(now, sid);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      };

      let assistantContent = "";
      let assistantToolCalls: ToolCallRecord[] | null = null;
      let assistantReasoning = "";
      let assistantUsage: TokenUsage | null = null;
      try {
        const loopResult = await agentLoop(
          model,
          SYSTEM_PROMPT,
          history,
          buildContent(content, images),
          thinking,
          (event) => {
            switch (event.type) {
              case "tool_call":
                send({
                  type: "tool_call",
                  toolName: event.toolName,
                  args: event.args,
                  callId: event.callId,
                });
                break;
              case "tool_result":
                send({
                  type: "tool_result",
                  toolName: event.toolName,
                  result: event.result,
                  callId: event.callId,
                });
                break;
              case "tool_error":
                send({
                  type: "tool_error",
                  toolName: event.toolName,
                  error: event.error,
                  callId: event.callId,
                });
                break;
              case "delta":
                send({ type: "delta", content: event.content });
                break;
              case "reasoning":
                send({ type: "reasoning", content: event.content });
                break;
              // ── 规划-执行新增事件：透传给前端 + 持久化计划 ──────────
              case "plan_created":
                send({
                  type: "plan_created",
                  goal: event.goal,
                  steps: event.steps,
                });
                // 落库活动计划（running）：HITL / 跨轮恢复的数据基础，本次只存不恢复
                savePlan(db, sid, { goal: event.goal, steps: event.steps }, "running");
                break;
              case "step_start":
                send({
                  type: "step_start",
                  stepId: event.stepId,
                  index: event.index,
                  total: event.total,
                  description: event.description,
                });
                break;
              case "step_done":
                send({
                  type: "step_done",
                  stepId: event.stepId,
                  index: event.index,
                  result: event.result,
                });
                break;
              case "step_failed":
                send({
                  type: "step_failed",
                  stepId: event.stepId,
                  index: event.index,
                  error: event.error,
                });
                break;
              case "plan_done":
                send({
                  type: "plan_done",
                  completed: event.completed,
                  total: event.total,
                });
                // 计划收尾：用最终完整快照覆盖落库，状态翻为 done
                savePlan(db, sid, { goal: event.goal, steps: event.steps }, "done");
                break;
            }
          },
        );
        assistantContent = loopResult.content;
        assistantToolCalls =
          loopResult.toolCalls.length > 0 ? loopResult.toolCalls : null;
        assistantReasoning = loopResult.reasoning;
        assistantUsage = loopResult.usage;
      } catch (e) {
        const message =
          e instanceof ProviderError ? e.message : "调用失败，请稍后重试";
        send({ type: "error", message });
        controller.close();
        return;
      }

      if (assistantContent) {
        db.prepare(
          `INSERT INTO messages (id, session_id, role, content, images, tool_calls, reasoning, usage, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          randomUUID(),
          sid,
          "assistant",
          assistantContent,
          null,
          assistantToolCalls ? JSON.stringify(assistantToolCalls) : null,
          assistantReasoning || null,
          assistantUsage ? JSON.stringify(assistantUsage) : null,
          Date.now(),
        );
      }

      let title = "新会话";
      if (isFirst) {
        const base = content || (savedPaths.length > 0 ? "图片消息" : "新会话");
        title = base.length > 20 ? `${base.slice(0, 20)}…` : base;
        db.prepare(
          `UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?`,
        ).run(title, Date.now(), sid);
      }

      send({ type: "done", sessionId: sid, title, usage: assistantUsage });
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
