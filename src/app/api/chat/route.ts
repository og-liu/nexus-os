// 对话接口：浏览器 POST 一条消息进来，这里把模型的流式回答一个字一个字推回去。
//
// 为什么用 Route Handler（而不是 Server Action）：
// Server Action 的返回值会被序列化成一整块结果，天生不适合「边生成边给你看」。
// 流式输出的标准做法是 Server-Sent Events（SSE）——一条长连接，服务端不停往下写，
// 浏览器边读边渲染。Next 16 的官方文档在《Streaming》指南里明确把这类场景
// 指向 Route Handler + ReadableStream（见 node_modules/next/dist/docs/01-app/02-guides/streaming.md）。
//
// 这也是本项目第一个 API 路由：在此之前全站都是 Server Action。
// 选择在这里开这个口子，是因为流式是它的硬需求，不是图省事。

import { DEFAULT_MODEL_ID, getModelMeta, isValidModelId } from "@/lib/agent/models";
import {
  PROVIDERS,
  ProviderError,
  streamChat,
  type ChatMessage,
} from "@/lib/agent/providers";
import { getCurrentUser } from "@/lib/auth/current-user";

// better-sqlite3 是原生模块，必须跑在 Node 运行时（不能用 Edge）
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 一次最多带多少条历史。防的是异常输入，不是正常使用 */
const MAX_MESSAGES = 40;
/** 所有消息正文加起来的总字符上限 */
const MAX_TOTAL_CHARS = 20_000;

/**
 * 系统提示词：模型每次请求都会看到这段话，它决定了「你是谁、你不该干什么」。
 *
 * 第一版刻意写死了三条限制，其中第三条最重要：
 * 模型并不知道用户的便签、待办、日历，如果不提前按住，它会顺着「帮我看看我的待办」
 * 这类请求编出一份看起来很真的清单——这种幻觉比报错危险得多。
 */
const SYSTEM_PROMPT = `你是 Nexus OS 的个人 AI 助手。

- 用中文回答，简洁直接，不要客套开场，不要重复用户的话。
- 你目前**没有**调用工具的能力，看不到用户的便签、待办、日历等个人数据。
  遇到这类请求，直说「现在还做不到」，**绝对不要编造数据或假装已经帮忙完成**。
- 不确定的事就说不确定。`;

export async function POST(req: Request) {
  // 这个接口会花钱（每次调用都消耗 token），必须确认是登录用户
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "未登录" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  const rawMessages = (body as { messages?: unknown })?.messages;
  const rawModel = (body as { model?: unknown })?.model;

  if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
    return Response.json({ error: "messages 必须是非空数组" }, { status: 400 });
  }
  if (rawMessages.length > MAX_MESSAGES) {
    return Response.json(
      { error: `消息太多（上限 ${MAX_MESSAGES} 条）` },
      { status: 400 },
    );
  }

  // 逐条校验并收窄类型。前端传来的东西一律当作不可信输入。
  const history: ChatMessage[] = [];
  let totalChars = 0;
  for (const item of rawMessages) {
    const role = (item as { role?: unknown })?.role;
    const content = (item as { content?: unknown })?.content;
    if (role !== "user" && role !== "assistant") {
      return Response.json({ error: `非法的消息角色：${String(role)}` }, { status: 400 });
    }
    if (typeof content !== "string" || content.trim() === "") {
      return Response.json({ error: "消息内容必须是非空字符串" }, { status: 400 });
    }
    totalChars += content.length;
    history.push({ role, content });
  }
  if (totalChars > MAX_TOTAL_CHARS) {
    return Response.json(
      { error: `对话太长了（累计 ${totalChars} 字，上限 ${MAX_TOTAL_CHARS}）` },
      { status: 400 },
    );
  }

  // 白名单校验：前端只能从注册表里挑模型，不能自己编一个名字递进来
  const model = isValidModelId(rawModel) ? rawModel : DEFAULT_MODEL_ID;
  const modelMeta = getModelMeta(model);
  if (!modelMeta) {
    return Response.json({ error: `未知模型：${model}` }, { status: 400 });
  }

  const provider = PROVIDERS.deepseek;
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history,
  ];

  const encoder = new TextEncoder();

  // ReadableStream = 一条可以「边产边发」的管道。
  // start() 里每 enqueue 一次，浏览器那边就立刻收到一块，不用等全部生成完。
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        // SSE 的固定格式：`data: <一行 JSON>` 后面跟两个换行
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        const result = await streamChat(
          provider,
          model,
          messages,
          (kind, text) => send({ type: "delta", kind, text }),
        );
        send({ type: "done", usage: result.usage });
      } catch (e) {
        // 已经吐了一半再出错时，也要让前端知道「停在哪、为什么」，不能静默截断
        const message =
          e instanceof ProviderError
            ? e.message
            : e instanceof Error
              ? `${provider.name} 调用失败：${e.message}`
              : "未知错误";
        send({ type: "error", message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      // 禁止任何中间层缓存这一条流
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Nginx 默认会把响应攒够一块再发，流式就变成了「等半天然后一次性出现」。
      // 这个头是告诉 Nginx「别缓冲」。线上部署时必须带着它。
      "X-Accel-Buffering": "no",
    },
  });
}
