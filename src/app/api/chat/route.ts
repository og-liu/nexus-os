import { type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getDb, type MessageRow, type MessageStatus } from "@/lib/db";
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
import {
  agentLoop,
  resumeLoop,
  resumeStoppedLoop,
  type LoopResult,
  type LoopEvent,
  type ToolCallRecord,
  type TokenUsage,
} from "@/lib/agent/loop";
import {
  savePlan,
  getPausedPlan,
  getRecoverablePlan,
  updatePlanStatus,
  archiveStoppedTurn,
  PLAN_STATUS,
} from "@/lib/agent/plan-store";

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
    /** 断点恢复标记：为 true 时表示「继续执行上次中断的计划」，此时 content 可为空 */
    resume?: boolean;
  } | null;

  const content = body?.content?.trim() ?? "";
  const resume = body?.resume === true;
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

  // 断点恢复（resume）时 content 允许为空——它不是一条新消息，而是一个「继续执行」的动作
  if (!content && incomingImages.length === 0 && !resume) {
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

  // 落库用户消息（user 消息没有生命周期状态，status 恒为 NULL）。
  // 断点恢复（resume）不是一条新消息，而是「继续执行」的系统动作，不落 user 消息，
  // 否则历史里会多一条空白的「用户气泡」。
  if (!resume) {
    db.prepare(
      `INSERT INTO messages (id, session_id, role, content, images, tool_calls, reasoning, usage, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      randomUUID(),
      sid,
      "user",
      content,
      savedPaths.length > 0 ? JSON.stringify(savedPaths) : null,
      null,
      null,
      null,
      null,
      now,
    );
  }

  // ── 本轮走向判定 + 残留任务归档（必须在「查 history」之前执行！）──────────────
  // 归档为什么要提前到查 history 之前：archiveStoppedTurn 会把上一轮残留的
  // 「user 提问 + stopped 半截回复」整轮翻成 cancelled，而被取代的旧 user 需求
  // 平时 status 是 NULL（user 消息只有被归档时才有状态）。如果先查 history 再归档，
  // 本轮喂给模型的历史还是归档前的脏数据——那条旧需求仍会进上下文，模型就会把
  // 新消息理解成旧任务的「催促」，自作主张继续执行旧任务（表现为：停止/放弃后
  // 换话题，AI 却回答旧话题）。先归档再取历史，本轮模型看到的才全是有效轮次。
  // 判断该会话是否有「暂停中、等待用户回复」的计划（HITL 补问后）。
  // 有则本轮走续跑（resumeLoop），把用户这轮的 content 当作补问的答案；无则正常走 agentLoop。
  const pausedPlan = getPausedPlan(db, sid);
  // 断点恢复：读取「可恢复的未完成计划」（running / stopped），供 resume 分支与归档判断使用。
  const recoverablePlan = getRecoverablePlan(db, sid);

  // resume 请求的前置校验：必须存在「已停止（stopped）」的计划才能续跑。若没有（例如用户
  // 在别的窗口已放弃、或计划已完成），直接拒绝。此处位于 assistant 占位行 INSERT 之前，
  // 被拒时库里不会残留空壳消息，无需清理。
  if (resume && (!recoverablePlan || recoverablePlan.status !== "stopped")) {
    return new Response("没有可恢复的中断任务", { status: 400 });
  }

  // 正常新消息（非 resume）：若上一轮残留了「已停止」的任务，先整轮归档成 cancelled
  //（被这轮取代），再进入本轮。归档是配对的整体（archiveStoppedTurn 连 user 提问
  // 一起收尾）：计划翻 cancelled → 前端 getRecoverablePlan 读不到，不再渲染「继续/放弃」；
  // 消息整轮翻 cancelled → 刷新后旧任务显示「已放弃」角标，且「提问 + 半截回复」
  // 都不会进本轮的模型上下文。注意：paused 计划（AI 补问等待回答）不算「被取代」，
  // 用户这轮的输入大概率是对补问的回答，归档条件只认 stopped。
  if (!resume && recoverablePlan && recoverablePlan.status === "stopped") {
    updatePlanStatus(db, sid, PLAN_STATUS.CANCELLED);
    archiveStoppedTurn(db, sid);
  }

  // 【真停止 / 刷新保留的关键】提前为 assistant 消息 INSERT 一行占位记录（status=running）。
  // 这样在 agentLoop 还没跑完、甚至被中途打断时，这条 assistant 消息在库里已经「存在」，
  // 后续的增量落盘只需 UPDATE 这条占位行；刷新页面读历史也能看到「进行中/已停止」的半截消息，
  // 彻底解决「agentLoop 跑完才落库 → 中途刷新即丢」的问题。
  const assistantMsgId = randomUUID();
  db.prepare(
    `INSERT INTO messages (id, session_id, role, content, images, tool_calls, reasoning, usage, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    assistantMsgId,
    sid,
    "assistant",
    "",
    null,
    null,
    null,
    null,
    "running",
    now,
  );

  // 取出历史消息（喂给模型做上下文）。核心原则：只喂「完整有效的对话轮次」，
  // running / stopped / cancelled 三种状态一律排除：
  //   - running  ：正在生成的 assistant 占位行（内容还是空壳），不算历史；
  //   - stopped  ：用户中途叫停的半截 assistant 回复；
  //   - cancelled：被后续新消息取代、已整轮归档的「user 提问 + assistant 半截回复」
  //                （archiveStoppedTurn 会把配对轮次整体收尾，user 消息也会带此状态）。
  // 若把 stopped / cancelled 喂给模型，模型会看到「自己上一句刚说要做什么、还没说完」
  // 或「一条没被回应过的旧需求」，于是在用户发新话题时自作主张把旧任务接着做
  // （表现为「停止后换话题仍执行上一轮内容」「第二轮答的还是第一轮的问题」）。
  // assistant 的 done / failed 正常保留（failed 是完整的出错回答，多轮对话需要连贯）。
  // 注意：SQL 里 `status != 'x'` 对 NULL 会返回 NULL（被 WHERE 判为 false），
  // 所以必须显式写 `status IS NULL OR status NOT IN (...)` 才能让普通 user 消息通过。
  const historyRows = db
    .prepare(
      `SELECT * FROM (
         SELECT * FROM messages
         WHERE session_id = ? AND (status IS NULL OR status NOT IN ('running', 'stopped', 'cancelled'))
         ORDER BY created_at DESC LIMIT ?
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

  // 本轮走向判定（pausedPlan / recoverablePlan 读取）与「残留 stopped 任务归档」已前移到
  // 查 history 之前执行（原因见上方归档段注释）；resume 的 400 前置校验也一并前移，
  // 提前到 assistant 占位行 INSERT 之前，被拒时无需再清理占位。

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

      // ── 「边跑边存」增量落盘（真停止 / 刷新保留的核心）──────────────
      // assistant 消息在请求一进来就已 INSERT 好占位行（status=running，见上文），
      // 这里负责把 loop 产出的半截内容「增量写回」那行占位记录，让刷新/停止后还能读回。
      const persistAssistant = (status: MessageStatus) => {
        db.prepare(
          `UPDATE messages
           SET status = ?, content = ?, tool_calls = ?, reasoning = ?, usage = ?
           WHERE id = ?`,
        ).run(
          status,
          assistantContent,
          assistantToolCalls ? JSON.stringify(assistantToolCalls) : null,
          assistantReasoning || null,
          assistantUsage ? JSON.stringify(assistantUsage) : null,
          assistantMsgId,
        );
      };

      // 终态标志：一旦定格为 done/stopped/failed，节流 timer 就不能再写回 running
      let settled = false;
      // 节流落盘：正常流式过程中，每 800ms 把已累积内容写库一次。
      // 即便进程崩溃（不是走正常 abort 路径），最多也只丢最近 800ms 的增量。
      const persistTimer = setInterval(() => {
        if (!settled) persistAssistant("running");
      }, 800);

      // 取消标志：req.signal 一旦 abort（用户点停止 / 刷新断连）就置 true，
      // 供 catch 里区分「主动取消」还是「真·模型报错」。
      let cancelled = false;
      const markCancelled = () => {
        cancelled = true;
      };
      req.signal.addEventListener("abort", markCancelled, { once: true });

      // 收尾：无论 done/stopped/failed 哪条路径，都要停掉节流 timer 并解绑 abort 监听
      const cleanup = () => {
        settled = true;
        clearInterval(persistTimer);
        req.signal.removeEventListener("abort", markCancelled);
      };

      try {
        // 事件回调：agentLoop / resumeLoop 共用同一套「透传 + 持久化」逻辑。
        // 单独抽出来，是因为两条链路（全新执行 / 断点续跑）都要复用同一份事件处理。
        const handleEvent = (event: LoopEvent) => {
          switch (event.type) {
            case "tool_call":
              // 边收边累积：abort 时已发起的工具调用也存进半截消息
              if (!assistantToolCalls) assistantToolCalls = [];
              assistantToolCalls.push({
                toolName: event.toolName,
                args: event.args,
                callId: event.callId,
                status: "success",
                result: undefined,
              });
              send({ type: "tool_call", toolName: event.toolName, args: event.args, callId: event.callId });
              break;
            case "tool_result":
              if (assistantToolCalls) {
                const tc = assistantToolCalls.find((t) => t.callId === event.callId);
                if (tc) tc.result = event.result;
              }
              send({ type: "tool_result", toolName: event.toolName, result: event.result, callId: event.callId });
              break;
            case "tool_error":
              if (assistantToolCalls) {
                const tc = assistantToolCalls.find((t) => t.callId === event.callId);
                if (tc) { tc.status = "error"; tc.error = event.error; }
              }
              send({ type: "tool_error", toolName: event.toolName, error: event.error, callId: event.callId });
              break;
            case "delta":
              assistantContent += event.content;
              send({ type: "delta", content: event.content });
              break;
            case "reasoning":
              assistantReasoning += event.content;
              send({ type: "reasoning", content: event.content });
              break;
            // ── 规划-执行新增事件：透传给前端 + 持久化计划 ──────────
            case "plan_created":
              send({
                type: "plan_created",
                goal: event.goal,
                steps: event.steps,
              });
              // 落库活动计划（running）：全新执行或断点续跑都会发，收到即把计划翻成 running
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
            case "plan_paused":
              // 补问步骤触发暂停：透传给前端（等用户输入）。这里只透传不落库——
              // paused 计划的持久化在 agentLoop/resumeLoop 返回之后统一处理（见下方）。
              send({
                type: "plan_paused",
                goal: event.goal,
                stepId: event.stepId,
                index: event.index,
                question: event.question,
                steps: event.steps,
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
        };

        // 根据请求类型分三条路：断点恢复 / 补问续跑 / 正常执行
        let loopResult: LoopResult;
        if (resume && recoverablePlan) {
          // 断点恢复：先把手里的 stopped 计划翻回 running（这样 loop 内 plan_created 事件触发
          // 的 savePlan 能原地更新同一条记录、planId 保持不变），再从断点续跑。
          updatePlanStatus(db, sid, PLAN_STATUS.RUNNING);
          loopResult = await resumeStoppedLoop(
            model,
            SYSTEM_PROMPT,
            history,
            { goal: recoverablePlan.goal, steps: recoverablePlan.steps },
            thinking,
            handleEvent,
            req.signal,
          );
        } else if (pausedPlan) {
          // 补问续跑：用户这轮是回来回答补问的，content 即 answer；history 里已含上一轮问句与本轮回答
          loopResult = await resumeLoop(
            model,
            SYSTEM_PROMPT,
            history,
            pausedPlan,
            content,
            thinking,
            handleEvent,
            req.signal,
          );
        } else {
          // 正常新消息：残留 stopped 任务的整轮归档已在进入本 stream 之前完成——
          // 必须先归档再查 history，否则归档动作对本轮已取出的历史不生效（见上文注释）。
          loopResult = await agentLoop(
            model,
            SYSTEM_PROMPT,
            history,
            buildContent(content, images),
            thinking,
            handleEvent,
            req.signal,
          );
        }

        // 补问暂停：用返回的完整计划快照把计划持久化成 paused 态（含各步进度 + 暂停步骤断点）
        if (loopResult.paused && loopResult.plan) {
          savePlan(db, sid, loopResult.plan, "paused");
        }
        assistantContent = loopResult.content;
        assistantToolCalls =
          loopResult.toolCalls.length > 0 ? loopResult.toolCalls : null;
        assistantReasoning = loopResult.reasoning;
        assistantUsage = loopResult.usage;
      } catch (e) {
        cleanup();
        // 区分「用户主动停止 / 断连」与「真·模型报错」：
        //   - 取消：AbortError（fetch 被 signal 中止，或 loop 内部循环检查主动抛出），
        //     或 cancel 标志已被 abort 监听置位 → 消息定格 stopped（保留已产出半截），
        //     活动计划同步标 stopped，并给前端发 stopped 事件。
        //   - 报错：ProviderError 等其他异常 → 消息定格 failed，计划标 failed，走原 error 事件。
        const isCancelled =
          cancelled || (e instanceof Error && e.name === "AbortError");
        if (isCancelled) {
          persistAssistant("stopped");
          updatePlanStatus(db, sid, PLAN_STATUS.STOPPED);
          send({ type: "stopped" });
        } else {
          const message =
            e instanceof ProviderError ? e.message : "调用失败，请稍后重试";
          persistAssistant("failed");
          updatePlanStatus(db, sid, PLAN_STATUS.FAILED);
          send({ type: "error", message });
        }
        controller.close();
        return;
      }

      // 正常完成：停掉节流落盘，把占位消息定格为 done
      cleanup();
      if (assistantContent) {
        persistAssistant("done");
      } else {
        // 极端情况：正常返回但没有正文（如规划失败走直答但也没吐出字），
        // 占位消息是空壳，直接删掉这条空占位，避免历史里多一条空白消息。
        db.prepare(`DELETE FROM messages WHERE id = ?`).run(assistantMsgId);
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
