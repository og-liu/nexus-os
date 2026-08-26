// 供应商注册表 + 统一流式调用入口。
// 页面/后端只调用 streamChat(模型id, ...)，内部按模型的 provider 字段路由到对应供应商。

import { MODELS, DEFAULT_MODEL_ID, getModelMeta } from "../models";
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

// ─── Key 可用性（服务端专用） ─────────────────────────────────────
// 这几个函数读 process.env 判断 Key 是否存在，只能在 Node 运行时调用；
// 浏览器端想知道「哪些模型可用」，请请求 /api/providers 拿布尔结果。

/** 某供应商是否已配置 API Key（只判断存在性，绝不返回 Key 内容） */
export function isProviderConfigured(providerId: string): boolean {
  const provider = PROVIDERS[providerId];
  return Boolean(provider && process.env[provider.apiKeyEnv]);
}

/** 某项目内模型 id 是否真正可用：模型存在于注册表 且 其供应商已配 Key */
export function isModelConfigured(modelId: string): boolean {
  const meta = getModelMeta(modelId);
  return Boolean(meta && isProviderConfigured(meta.provider));
}

/**
 * 服务端兜底默认模型：注册表顺序里第一个「配了 Key」的模型。
 * 一个 Key 都没有时回落 DEFAULT_MODEL_ID——此时调用方会在实际请求阶段收到
 * 「未配置 XXX_API_KEY」的明确报错，引导用户去 .env.local 补配置。
 *
 * 为什么需要它：以前后端把非法/未配置的模型一律兜回硬编码的 DeepSeek 默认值，
 * 用户只配了 OpenRouter 时就会「明明配了模型，却报缺 DeepSeek 的 Key」。
 * 现在兜底改成动态的「第一个可用的」，没配 DeepSeek 也能开箱即用。
 */
export function getFirstAvailableModelId(): string {
  const hit = MODELS.find((m) => isProviderConfigured(m.provider));
  return hit?.id ?? DEFAULT_MODEL_ID;
}

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