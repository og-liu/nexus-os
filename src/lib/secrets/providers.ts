/**
 * 站点支持的「用户自带 Key」清单（《功能/用户密钥》§二）。
 *
 * 加一家供应商 = 在这里加一条 + 让消费方用这个 id 去读，不用改表结构：
 * `user_secrets.provider` 存的就是这里的 `id`。
 */

/**
 * 设置页的分组（就是那两个 tab）。
 *
 * `id` 进 URL（`/settings?tab=tool`），`label` 进界面——**中文不能当 URL 参数**，
 * 而且以后加新分组（比如「存储」「通知」）只要往 `SECRET_GROUPS` 里加一行，
 * tab 和过滤逻辑都不用改。
 */
export type SecretGroup = "model" | "tool";

export interface SecretGroupMeta {
  id: SecretGroup;
  label: string;
  /** tab 下方那句说明：这一组是给什么用的 */
  hint: string;
}

export const SECRET_GROUPS: SecretGroupMeta[] = [
  { id: "model", label: "大模型", hint: "Agent 对话用的大模型。换一家就填这一家的 Key。" },
  { id: "tool", label: "工具 API", hint: "工具自己调用的第三方服务。只有用到它的工具才需要。" },
];

/** 把 URL 里那个可能乱写的值收敛到合法分组，兜底落在第一个（大模型）。 */
export function resolveGroup(raw: string | string[] | undefined): SecretGroup {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return SECRET_GROUPS.some((group) => group.id === value)
    ? (value as SecretGroup)
    : SECRET_GROUPS[0].id;
}

export interface SecretProvider {
  /** 存进 `user_secrets.provider` 的值，也是代码里读 Key 时用的名字 */
  id: string;
  name: string;
  group: SecretGroup;
  /** 这个 Key 用来干什么，一句话 */
  description: string;
  /** 去哪拿：一个可以直接点开的地址，**界面上原样显示完整 URL**（带协议头） */
  docsUrl: string;
  /** 打开那个页面之后，点哪里拿到 Key */
  docsSteps: string;
  /** 输入框占位提示 */
  placeholder: string;
}

export const SECRET_PROVIDERS: SecretProvider[] = [
  {
    id: "deepseek",
    name: "DeepSeek",
    group: "model",
    description: "Agent 对话用的大模型",
    docsUrl: "https://platform.deepseek.com/api_keys",
    docsSteps: "左侧「API keys」→ 新建 → 复制（只显示一次）",
    placeholder: "sk-...",
  },
  {
    id: "tikhub",
    name: "TikHub",
    group: "tool",
    description: "抖音下载解析分享链接",
    docsUrl: "https://user.tikhub.io",
    docsSteps: "左侧「API Keys」→ 新建 → 权限全选 → 复制",
    placeholder: "粘贴 TikHub 的 API Key",
  },
];

/** 按 id 查一个 provider；找不到返回 undefined（由调用方决定怎么报错）。 */
export function findSecretProvider(id: string): SecretProvider | undefined {
  return SECRET_PROVIDERS.find((provider) => provider.id === id);
}
