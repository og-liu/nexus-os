// 模型注册表：所有可选模型的元信息集中在这里。
// 加模型 / 换供应商，只需在这里增删条目、并在 providers/index.ts 登记供应商，
// 前端选择器、后端白名单校验、深度思考开关显隐都会自动跟着走。

export interface ModelMeta {
  /** 项目内唯一 id（页面、数据库都只存这个，跟供应商解耦） */
  id: string;
  /** 选择器里展示的名称 */
  name: string;
  /** 名称右侧的小标签（可选），如 推荐 / NEW / 实验 */
  tag?: string;
  /** 一行特性说明 */
  desc: string;
  /** 所属供应商 id，对应 providers/index.ts 里的 PROVIDERS 键 */
  provider: string;
  /** 该供应商下的真实模型名（实际传给 API 的 model 字段） */
  providerModel: string;
  /** 是否支持深度思考（决定思考开关显隐 + 是否传 thinking 参数） */
  supportsThinking: boolean;
  /** 是否支持看图（决定图片上传是否可用 + 是否真正把图片发给模型） */
  supportsVision: boolean;
}

export const MODELS: ModelMeta[] = [
  {
    id: "deepseek-v4-flash",
    name: "DeepSeek V4 Flash",
    tag: "推荐",
    desc: "极速 · 最省 · 日常对话主力",
    provider: "deepseek",
    providerModel: "deepseek-v4-flash",
    supportsThinking: true,
    supportsVision: false,
  },
  {
    id: "deepseek-v4-pro",
    name: "DeepSeek V4 Pro",
    tag: "NEW",
    desc: "推理最强 · 复杂任务首选 · 价格约 3 倍",
    provider: "deepseek",
    providerModel: "deepseek-v4-pro",
    supportsThinking: true,
    supportsVision: false,
  },
  {
    id: "deepseek-v4-flash-vision-exp",
    name: "DeepSeek V4 Vision",
    tag: "实验",
    desc: "支持看图理解 · 实验版 · 价格同 Flash",
    provider: "deepseek",
    providerModel: "deepseek-v4-flash-vision-exp",
    supportsThinking: false,
    supportsVision: true,
  },
  {
    id: "ox-alpha",
    name: "Ox Alpha",
    tag: "免费",
    desc: "匿名模型 · 1M 上下文 · 看图 + 深度思考",
    provider: "openrouter",
    providerModel: "stealth/ox-alpha",
    supportsThinking: true,
    supportsVision: true,
  },
];

/** 新建会话 / 未选择时的默认模型 */
export const DEFAULT_MODEL_ID = "deepseek-v4-flash";

export function getModelMeta(id: string): ModelMeta | undefined {
  return MODELS.find((m) => m.id === id);
}

/** 后端白名单校验：仅放行注册表内存在的模型 id */
export function isValidModelId(id: unknown): id is string {
  return typeof id === "string" && MODELS.some((m) => m.id === id);
}