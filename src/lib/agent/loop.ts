// Agent Loop 核心：模型决策 → 执行工具 → 结果回传 → 再决策，直到模型给出最终回答。
// 这是整个 Agent 的发动机。理解了这个循环，就理解了 Agent 的灵魂。
//
// 关键设计：callLLM 使用真正的流式调用（stream: true）。
//   - 无工具调用时：模型的文本内容实时通过 onEvent("delta") 吐出，首字延迟 ≈ 模型首 token 时间
//   - 有工具调用时：tool_calls 的 arguments 是分片到达的，需要拼接完整后再执行
//   - 这样不需要等模型把整段话写完才开始显示，消除了非流式模式下的等待

import { PROVIDERS } from "@/lib/providers";
import { getModelMeta, DEFAULT_MODEL_ID } from "@/lib/models";
import { ProviderError } from "@/lib/providers/openai";
import { buildToolsSchema, getTool, type ToolDefinition } from "./tools";
import type { ChatMessage, ChatContentPart, ThinkingOptions } from "@/lib/providers/types";

/** Loop 安全边界 */
const MAX_STEPS = 5; // 单轮用户请求最多 5 次工具循环，防死循环

/** Loop 向外部吐出的事件（SSE 推给前端） */
export type LoopEvent =
  | { type: "tool_call"; toolName: string; args: Record<string, unknown>; callId: string }
  | { type: "tool_result"; toolName: string; result: unknown; callId: string }
  | { type: "tool_error"; toolName: string; error: string; callId: string }
  | { type: "delta"; content: string }
  | { type: "reasoning"; content: string };

/** 扩展的消息类型，增加 tool 角色（OpenAI function calling 格式） */
type AgentMessage =
  | ChatMessage
  | {
      role: "assistant";
      content: string | null;
      tool_calls: Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;
    }
  | {
      role: "tool";
      content: string;
      tool_call_id: string;
    };

/** callLLM 返回的解析结果 */
interface LLMResult {
  /** 模型输出的文本（流式过程中已通过 onEvent 实时吐出，这里是完整拼接供落库用） */
  content: string;
  /** 模型发起的工具调用（如果有） */
  toolCalls: Array<{
    id: string;
    name: string;
    args: Record<string, unknown>;
  }>;
}

/**
 * 流式调用 LLM。
 *
 * - 文本内容和思考过程通过 onEvent 实时推给前端
 * - tool_calls 的 arguments 是分片到达的，需要累积拼接
 * - 流结束后才知道有没有完整的 tool_calls，此时返回结果给 Loop 做决策
 */
async function callLLM(
  modelId: string,
  messages: AgentMessage[],
  thinking: ThinkingOptions,
  onEvent: (event: LoopEvent) => void,
): Promise<LLMResult> {
  const meta = getModelMeta(modelId) ?? getModelMeta(DEFAULT_MODEL_ID);
  const provider = meta ? PROVIDERS[meta.provider] : undefined;
  if (!meta || !provider) {
    throw new ProviderError(`未找到模型或供应商配置：${modelId}`);
  }

  const apiKey = process.env[provider.apiKeyEnv];
  if (!apiKey) {
    throw new ProviderError(`未配置 ${provider.apiKeyEnv}，请在 .env.local 中填写`);
  }

  const body: Record<string, unknown> = {
    model: meta.providerModel,
    messages,
    tools: buildToolsSchema(),
    tool_choice: "auto",
    stream: true,
  };

  if (provider.thinkingStyle === "deepseek") {
    body.thinking = thinking.enabled ? { type: "enabled" } : { type: "disabled" };
    if (thinking.enabled) body.reasoning_effort = thinking.effort;
  }

  const res = await fetch(`${provider.baseURL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new ProviderError(`${provider.name} 请求失败（${res.status}）：${text}`);
  }

  // ── 流式读取 SSE ──────────────────────────────────────────
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  // 累积文本内容
  let contentFull = "";
  // 累积 tool_calls：OpenAI 流式返回的 tool_calls 是增量的
  // 每个 chunk 可能带 index、id（通常仅首块）、function.name（首块）、function.arguments（分片）
  interface StreamToolCall {
    id?: string;
    name?: string;
    argsBuffer: string;
  }
  const toolCallMap = new Map<number, StreamToolCall>();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // 按行切分 SSE，保留最后一个不完整片段
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") continue;

      try {
        const json = JSON.parse(payload) as {
          choices?: Array<{
            delta?: {
              content?: string | null;
              reasoning_content?: string;
              reasoning?: string;
              tool_calls?: Array<{
                index?: number;
                id?: string;
                type?: string;
                function?: {
                  name?: string;
                  arguments?: string;
                };
              }>;
            };
          }>;
        };

        const delta = json.choices?.[0]?.delta;
        if (!delta) continue;

        // 1) 思考过程（DeepSeek reasoning_content）
        const reasoning = delta.reasoning_content ?? delta.reasoning ?? "";
        if (reasoning) onEvent({ type: "reasoning", content: reasoning });

        // 2) 正文文本——实时吐出
        const text = delta.content ?? "";
        if (text) {
          contentFull += text;
          onEvent({ type: "delta", content: text });
        }

        // 3) 工具调用增量——拼接
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            let existing = toolCallMap.get(idx);
            if (!existing) {
              existing = { argsBuffer: "" };
              toolCallMap.set(idx, existing);
            }
            if (tc.id) existing.id = tc.id;
            if (tc.function?.name) existing.name = tc.function.name;
            if (tc.function?.arguments) {
              existing.argsBuffer += tc.function.arguments;
            }
          }
        }
      } catch {
        // 单行 JSON 解析失败，跳过继续
      }
    }
  }

  // ── 流结束，组装最终 toolCalls ─────────────────────────────
  const toolCalls: LLMResult["toolCalls"] = [];
  for (const tc of toolCallMap.values()) {
    let parsedArgs: Record<string, unknown> = {};
    try {
      parsedArgs = tc.argsBuffer ? JSON.parse(tc.argsBuffer) : {};
    } catch {
      // 参数 JSON 不完整时保持空对象
    }
    toolCalls.push({
      id: tc.id ?? `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: tc.name ?? "",
      args: parsedArgs,
    });
  }

  return { content: contentFull, toolCalls };
}

/**
 * Agent Loop 主函数。
 *
 * 执行流程：
 *   1. 把消息发给大模型（流式），带上工具清单
 *   2. 模型边生成边推 delta/reasoning 给前端
 *   3. 流结束后检查有没有 tool_calls
 *      - 没有 → 回答完成，return
 *      - 有 → 逐个执行工具，结果加入 messages，回到步骤 1
 *   4. 最多 MAX_STEPS 轮，防止死循环
 *
 * @returns 模型最终回答文本（用于落库）
 */
export async function agentLoop(
  modelId: string,
  systemPrompt: string,
  history: ChatMessage[],
  userContent: string | ChatContentPart[],
  thinking: ThinkingOptions,
  onEvent: (event: LoopEvent) => void,
): Promise<string> {
  // 组装初始消息：系统提示 + 历史 + 当前用户消息
  const messages: AgentMessage[] = [
    { role: "system", content: systemPrompt },
    ...history,
    { role: "user", content: userContent },
  ];

  for (let step = 0; step < MAX_STEPS; step++) {
    // 1. 流式调用大模型——文本实时推给前端，工具调用在流结束后拿到
    const { content, toolCalls } = await callLLM(modelId, messages, thinking, onEvent);

    // 2. 没有工具调用 → 最终回答已通过流式吐完，直接返回
    if (toolCalls.length === 0) {
      return content;
    }

    // 3. 有工具调用——把 assistant 的 tool_calls 消息加入历史
    //    注意：此时 content 可能是空（模型直接发起调用），也可能有一句"我查一下"
    messages.push({
      role: "assistant",
      content: content || null,
      tool_calls: toolCalls.map((tc) => ({
        id: tc.id,
        type: "function",
        function: { name: tc.name, arguments: JSON.stringify(tc.args) },
      })),
    });

    // 4. 逐个执行工具，把结果加入历史
    for (const tc of toolCalls) {
      // 通知前端：开始调用工具
      onEvent({ type: "tool_call", toolName: tc.name, args: tc.args, callId: tc.id });

      const tool: ToolDefinition | undefined = getTool(tc.name);
      if (!tool) {
        const errorMsg = `工具「${tc.name}」不存在`;
        onEvent({ type: "tool_error", toolName: tc.name, error: errorMsg, callId: tc.id });
        messages.push({
          role: "tool",
          content: JSON.stringify({ error: errorMsg }),
          tool_call_id: tc.id,
        });
        continue;
      }

      try {
        const result = await tool.execute(tc.args);
        onEvent({ type: "tool_result", toolName: tc.name, result, callId: tc.id });
        messages.push({
          role: "tool",
          content: JSON.stringify(result),
          tool_call_id: tc.id,
        });
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        onEvent({ type: "tool_error", toolName: tc.name, error: errorMsg, callId: tc.id });
        // 错误也喂回给模型，让它决定怎么办（换个方式、告诉用户等）
        messages.push({
          role: "tool",
          content: JSON.stringify({ error: errorMsg }),
          tool_call_id: tc.id,
        });
      }
    }

    // 5. 不 return，回到循环顶部，带着工具结果再问模型
  }

  // 超过最大轮次兜底——直接吐给前端
  const fallback = "抱歉，我处理了太多步骤还是没能完成，可能是工具调用遇到了问题，请换个方式提问。";
  onEvent({ type: "delta", content: fallback });
  return fallback;
}
