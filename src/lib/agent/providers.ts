// 供应商适配层：把「怎么跟某一家模型说话」全部收敛在这一个文件里。
//
// 为什么要单独一层：上层（API 路由）只想说「给我一段回答」，
// 不该关心 baseURL 是什么、鉴权头怎么拼、流式数据长什么样。
// 换供应商 / 加供应商时，只改这里和 models.ts，上层一行都不用动。
//
// 本项目目前只接 DeepSeek，但它走的是 OpenAI 兼容格式，
// 以后接智谱、豆包、OpenRouter 只需要在 PROVIDERS 里加一条。

/** 一条对话消息。第一版只支持纯文本——图片和文件留到后面。 */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** 流式回调里的两类增量：模型的思考过程 / 正文回答。 */
export type StreamKind = "reasoning" | "content";

/** token 用量。第一版一轮只有一次请求，所以就是这一次调用的账。 */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/** 一家供应商的静态配置。加一家通常只是往 PROVIDERS 里加一条。 */
export interface ProviderConfig {
  id: string;
  /** 报错提示里用的展示名 */
  name: string;
  /** OpenAI 兼容接口的 base URL */
  baseURL: string;
  /**
   * API Key 所在的环境变量**名字**——注意存的是「去哪找」，不是 Key 本身。
   * Key 只存在于 .env.local（本地）与服务器上的 .env.production，不进代码、不进仓库。
   */
  apiKeyEnv: string;
}

export const PROVIDERS: Record<string, ProviderConfig> = {
  deepseek: {
    id: "deepseek",
    name: "DeepSeek",
    baseURL: "https://api.deepseek.com",
    apiKeyEnv: "DEEPSEEK_API_KEY",
  },
};

/** 供应商侧的失败（网络、鉴权、限流…）。上层据此返回给用户看的话。 */
export class ProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderError";
  }
}

export interface StreamResult {
  /** 正文全文（流式过程中已经逐块回调出去了，这里是拼好的完整版） */
  content: string;
  /** 上游没返回 usage 时为 null */
  usage: TokenUsage | null;
}

/**
 * 流式调用一次 chat/completions。
 *
 * 三件事按顺序发生：
 *   1. 发请求，等响应头（这一段有 30 秒超时保护）
 *   2. 拿到响应体，一行行读 SSE
 *   3. 每读到一个增量就回调 onDelta，同时累积完整正文
 *
 * 为什么超时只保护「等响应头」这一段：深度思考模型生成完整回答可能要几分钟，
 * 给整个流套超时会误杀正常请求；但「服务器连上就不吭声」是纯粹的坏状态，
 * 不拦就会让界面永远转圈（这是踩过的坑，不是假设）。
 */
export async function streamChat(
  provider: ProviderConfig,
  model: string,
  messages: ChatMessage[],
  onDelta: (kind: StreamKind, text: string) => void,
): Promise<StreamResult> {
  const apiKey = process.env[provider.apiKeyEnv];
  if (!apiKey) {
    throw new ProviderError(
      `未配置 ${provider.apiKeyEnv}，请填进项目根目录的 .env.local 后重启 dev`,
    );
  }

  const CONNECT_TIMEOUT_MS = 30_000;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CONNECT_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${provider.baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        // 流式默认不回传用量，显式要求它在最后补一个带 usage 的块。
        // 不写这一行，界面上就永远看不到「这轮花了多少 token」。
        stream_options: { include_usage: true },
      }),
      signal: ctrl.signal,
    });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new ProviderError(
        `${provider.name} 连接超时（${CONNECT_TIMEOUT_MS / 1000} 秒没响应），稍后重试`,
      );
    }
    throw e;
  } finally {
    // 响应头一到就撤掉超时计时器：后面的流式读取不设整体上限
    clearTimeout(timer);
  }

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    if (res.status === 401) {
      throw new ProviderError(`${provider.name} 鉴权失败：API Key 无效或已过期`);
    }
    if (res.status === 402) {
      throw new ProviderError(`${provider.name} 余额不足，请到平台充值`);
    }
    if (res.status === 429) {
      throw new ProviderError(`${provider.name} 被限流了，等几秒再发`);
    }
    throw new ProviderError(`${provider.name} 请求失败（${res.status}）：${detail}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let usage: TokenUsage | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    // stream: true 告诉解码器「后面还有」，避免把一个多字节汉字从中间切坏
    buffer += decoder.decode(value, { stream: true });

    // SSE 的格式是「一行一条 data: {...}」。
    // 按换行切开，最后一段可能是不完整的半行——留着，下一轮拼上再解析。
    // 不留这一手，中文和长 JSON 会随机丢字。
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") continue;

      try {
        const chunk = JSON.parse(payload) as {
          choices?: Array<{
            delta?: {
              reasoning_content?: string;
              reasoning?: string;
              content?: string;
            };
          }>;
          usage?: {
            prompt_tokens?: number;
            completion_tokens?: number;
            total_tokens?: number;
          };
        };

        // 用量只出现在最后一个块里（而且那个块的 choices 是空数组）
        if (chunk.usage) {
          usage = {
            promptTokens: chunk.usage.prompt_tokens ?? 0,
            completionTokens: chunk.usage.completion_tokens ?? 0,
            totalTokens: chunk.usage.total_tokens ?? 0,
          };
        }

        const delta = chunk.choices?.[0]?.delta;
        if (!delta) continue;

        // 思考字段有两种常见叫法，两个都认：reasoning_content（DeepSeek 等）/ reasoning
        const reasoning = delta.reasoning_content ?? delta.reasoning ?? "";
        if (reasoning) onDelta("reasoning", reasoning);

        if (delta.content) {
          content += delta.content;
          onDelta("content", delta.content);
        }
      } catch {
        // 单个块解析失败就跳过——不能因为一行坏数据把整段回答废掉
      }
    }
  }

  return { content, usage };
}
