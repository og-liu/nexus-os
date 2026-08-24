// 供应商适配层的共享类型。
// 页面与后端只认「项目内模型 id」，供应商细节都收敛在 providers/index.ts 与 openai.ts。

export type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "developer";
  /** 纯文本消息为 string；带图消息为图文分段数组 */
  content: string | ChatContentPart[];
}

export type ThinkingEffort = "low" | "high" | "max";

export interface ThinkingOptions {
  enabled: boolean;
  effort: ThinkingEffort;
}

/** 流式回调里的一种增量：思考过程 / 正文 */
export type StreamDeltaKind = "reasoning" | "content";

/**
 * 思考参数的「方言」：
 * - deepseek：用 thinking:{type} + reasoning_effort
 * - openai：只用 reasoning_effort（OpenRouter 等聚合 / OpenAI 系）
 */
export type ThinkingStyle = "deepseek" | "openai";

export interface ProviderConfig {
  /** 供应商标识，如 deepseek / openrouter */
  id: string;
  /** 展示名（报错提示用） */
  name: string;
  /** OpenAI 兼容接口的 base URL */
  baseURL: string;
  /** 该供应商 API key 的环境变量名 */
  apiKeyEnv: string;
  thinkingStyle: ThinkingStyle;
}