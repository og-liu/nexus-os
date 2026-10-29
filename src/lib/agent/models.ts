// 模型注册表：项目内「能选哪些模型」的唯一答案。
//
// 三个地方都读它，所以只维护这一份：
//   - API 路由：校验前端传上来的 model 是不是白名单里的（防注入任意模型名）
//   - 界面：模型选择器（第一版还没有，后面加）
//   - 文档：《技术栈说明》里登记的模型清单
//
// 注意 id 是**供应商真实模型名**，直接用接口返回的那个字符串。
// 别自己造一个好看的名字再映射——映射层是多余的，而且一旦供应商改名就会静默失效。

export interface ModelMeta {
  /** 项目内唯一 id，同时也是传给 API 的 model 字段 */
  id: string;
  /** 界面上显示的名字 */
  name: string;
  /** 一行说明，给选择器用 */
  desc: string;
  /** 上下文窗口（token）。超了就报错，所以要知道这个数 */
  contextWindow: number;
  /** 能不能看图。决定图片上传按钮是否可用 */
  supportsVision: boolean;
}

export const MODELS: ModelMeta[] = [
  {
    id: "deepseek-flash",
    name: "DeepSeek V4.1 Flash",
    desc: "快、便宜，日常对话主力",
    contextWindow: 1_048_576,
    supportsVision: true,
  },
  {
    id: "deepseek-v4-pro",
    name: "DeepSeek V4 Pro",
    desc: "推理更强，复杂任务用",
    contextWindow: 1_048_576,
    supportsVision: false,
  },
];

/** 新建对话 / 没选模型时的默认值 */
export const DEFAULT_MODEL_ID = "deepseek-flash";

export function getModelMeta(id: string): ModelMeta | undefined {
  return MODELS.find((m) => m.id === id);
}

/**
 * 后端白名单校验。
 *
 * 为什么要校验：model 是前端传上来的字符串，直接拼进请求体等于让浏览器
 * 决定「用哪个模型」。轻则报错难懂，重则被拿来探测别的模型或跑更贵的档位。
 * 白名单是一行 `find`，成本极低。
 */
export function isValidModelId(id: unknown): id is string {
  return typeof id === "string" && MODELS.some((m) => m.id === id);
}
