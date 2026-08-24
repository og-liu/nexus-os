// 供应商注册表 + 统一流式调用入口。
// 页面/后端只调用 streamChat(模型id, ...)，内部按模型的 provider 字段路由到对应供应商。

import { DEFAULT_MODEL_ID, getModelMeta } from "../models";
import { streamChatOpenAI, ProviderError } from "./openai";
import {
  type ProviderConfig,
  type ThinkingOptions,
  type ChatMessage,
  type StreamDeltaKind,
} from "./types";

export * from "./types";
export { ProviderError } from "./openai";

export const PROVIDERS: Record<string, ProviderConfig> = {
  deepseek: {
    id: "deepseek",
    name: "DeepSeek",
    baseURL: "https://api.deepseek.com",
    apiKeyEnv: "DEEPSEEK_API_KEY",
    thinkingStyle: "deepseek",
  },
  openrouter: {
    id: "openrouter",
    name: "OpenRouter",
    baseURL: "https://openrouter.ai/api/v1",
    apiKeyEnv: "OPENROUTER_API_KEY",
    thinkingStyle: "openai",
  },
};

const SYSTEM_PROMPT =
  "你是 Nexus OS 的智能助手 Agent。用简洁、自然的语言回答用户，条理清晰，中文为主。";

export async function streamChat(
  modelId: string,
  history: ChatMessage[],
  thinking: ThinkingOptions,
  onDelta: (kind: StreamDeltaKind, text: string) => void,
): Promise<string> {
  const meta = getModelMeta(modelId) ?? getModelMeta(DEFAULT_MODEL_ID);
  const provider = meta ? PROVIDERS[meta.provider] : undefined;
  if (!meta || !provider) {
    throw new ProviderError(`未找到模型或供应商配置：${modelId}`);
  }
  return streamChatOpenAI(
    provider,
    meta.providerModel,
    SYSTEM_PROMPT,
    history,
    thinking,
    onDelta,
  );
}