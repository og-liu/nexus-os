// 通用 OpenAI 兼容流式调用：绝大多数供应商（DeepSeek / OpenRouter / 智谱 / 豆包…）
// 都按这套 chat/completions + SSE 格式工作，差异只在 baseURL、key 和思考参数的方言。
// 加新供应商通常只需在 providers/index.ts 里登记一行配置，不需要动这里的逻辑。

import {
  type ChatMessage,
  type ThinkingOptions,
  type ProviderConfig,
  type StreamDeltaKind,
} from "./types";

export class ProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderError";
  }
}

export async function streamChatOpenAI(
  provider: ProviderConfig,
  model: string,
  systemPrompt: string,
  history: ChatMessage[],
  thinking: ThinkingOptions,
  onDelta: (kind: StreamDeltaKind, text: string) => void,
): Promise<string> {
  const apiKey = process.env[provider.apiKeyEnv];
  if (!apiKey) {
    throw new ProviderError(
      `未配置 ${provider.apiKeyEnv}，请在 .env.local 中填写`,
    );
  }

  const body: Record<string, unknown> = {
    model,
    messages: [{ role: "system", content: systemPrompt }, ...history],
    stream: true,
  };

  // 思考参数按各供应商的「方言」翻译
  if (provider.thinkingStyle === "deepseek") {
    body.thinking = thinking.enabled
      ? { type: "enabled" }
      : { type: "disabled" };
    if (thinking.enabled) body.reasoning_effort = thinking.effort;
  } else {
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
    throw new ProviderError(
      `${provider.name} 请求失败（${res.status}）：${text}`,
    );
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let contentFull = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE：每行一条 data: {...}，按换行切分，保留残留片段
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
              reasoning_content?: string;
              reasoning?: string;
              content?: string;
            };
          }>;
        };
        const delta = json.choices?.[0]?.delta;
        // 思考字段兼容两种常见叫法：reasoning_content（DeepSeek/多数聚合）与 reasoning
        const reasoning = delta?.reasoning_content ?? delta?.reasoning ?? "";
        const content = delta?.content ?? "";
        if (reasoning) onDelta("reasoning", reasoning);
        if (content) {
          contentFull += content;
          onDelta("content", content);
        }
      } catch {
        // 忽略单行解析失败，继续读取后续内容
      }
    }
  }

  return contentFull;
}