export interface ChatMessage {
  role: "system" | "user" | "assistant" | "developer";
  content: string;
}

const API_BASE = "https://api.deepseek.com";
const MODEL = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";

const SYSTEM_PROMPT =
  "你是 Nexus OS 的智能助手 Agent。用简洁、自然的语言回答用户，条理清晰，中文为主。";

export class DeepSeekError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeepSeekError";
  }
}

export async function streamChat(
  history: ChatMessage[],
  onDelta: (delta: string) => void,
): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new DeepSeekError("未配置 DEEPSEEK_API_KEY，请在 .env.local 中填写");
  }

  const res = await fetch(`${API_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "system", content: SYSTEM_PROMPT }, ...history],
      stream: true,
    }),
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new DeepSeekError(`DeepSeek 请求失败（${res.status}）：${text}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // DeepSeek 返回 SSE：每行一条 data: {...}，按换行切分并保留残留片段
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") continue;

      try {
        const json = JSON.parse(payload) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        const delta = json.choices?.[0]?.delta?.content ?? "";
        if (delta) {
          full += delta;
          onDelta(delta);
        }
      } catch {
        // 忽略单行解析失败，继续读取后续内容
      }
    }
  }

  return full;
}