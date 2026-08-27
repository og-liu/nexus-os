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

/** 把上游错误转成给人看的话：429 限流单独友好提示，其余保留原文便于排障 */
function describeError(
  provider: ProviderConfig,
  status: number,
  raw: string,
): string {
  if (status === 429) {
    return `${provider.name} 暂时被上游限流（已自动重试一次仍未成功）。请稍等几秒再发；若频繁遇到，可考虑接入自己的 Key 或换用其他模型。`;
  }
  return `${provider.name} 请求失败（${status}）：${raw}`;
}

/** 简单延时（429 重试前的退避） */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    // openai 方言（OpenRouter 等）：用官方 reasoning 对象；effort 只有 low/medium/high 三档
    if (thinking.enabled) {
      const effort =
        thinking.effort === "max"
          ? "high"
          : thinking.effort === "high"
            ? "medium"
            : "low";
      body.reasoning = { effort, exclude: false };
    }
  }

  // 连接超时兜底：只保护「建立连接 + 等待响应头」这一段。上游偶发的网络挂起
  // 会让 fetch 无限 pending，Agent 循环就此卡死、界面零输出（历史事故）。
  // 响应头一返回就 clearTimeout，正文的流式读取不受限——深度思考模型完整
  // 推理可能持续数分钟，不能整体套超时。streamChatOpenAI 没有外部 AbortSignal
  // 来源，因此这里的 AbortError 只能来自超时定时器，可安全转译成友好报错。
  const CONNECT_TIMEOUT_MS = 30_000;

  const doRequest = () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), CONNECT_TIMEOUT_MS);
    return fetch(`${provider.baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })
      .catch((e: unknown) => {
        // 超时触发的中止 → 转成给人看的话；其余错误原样上抛交给上游处理
        if (e instanceof Error && e.name === "AbortError") {
          throw new ProviderError(
            `${provider.name} 连接超时（${CONNECT_TIMEOUT_MS / 1000} 秒未响应），请稍后重试`,
          );
        }
        throw e;
      })
      .finally(() => clearTimeout(timer));
  };

  let res = await doRequest();

  // 429 限流：稍等后自动重试一次（上游提示「retry shortly」）
  if (res.status === 429) {
    await res.body?.cancel().catch(() => {});
    await sleep(1500);
    res = await doRequest();
  }

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new ProviderError(describeError(provider, res.status, text));
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