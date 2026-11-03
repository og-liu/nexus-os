import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * 用户 API Key 的加解密（《功能/用户密钥》§四）。
 *
 * **只在服务端跑**：它读 `process.env.ENCRYPTION_KEY` 并做真实解密。客户端组件
 * 一律不许 import 这个文件——进了浏览器包，主密钥就跟着发到每个访客手里了。
 *
 * 用 AES-256-GCM 而不是 CBC：GCM 自带认证标签，密文被改一个字节解密就会失败，
 * 而不是解出一段垃圾再被当成 Key 发给上游。
 */

const ALGORITHM = "aes-256-gcm";
/** GCM 推荐的 IV 长度（96 bit）。 */
const IV_BYTES = 12;
/** AES-256 的密钥长度。 */
const KEY_BYTES = 32;
/** 密文格式版本号。换算法时靠它区分，不用改表结构。 */
const VERSION = "v1";

/** 服务端没有配置主密钥——这是**配置问题**，不是用户输入问题。 */
export class MasterKeyMissingError extends Error {
  constructor() {
    super("服务端还没配置 ENCRYPTION_KEY，现在存不了 Key");
    this.name = "MasterKeyMissingError";
  }
}

/** 密文解不开：被篡改、换了主密钥、或根本不是我们写的。 */
export class SecretDecryptError extends Error {
  constructor() {
    super("这个 Key 读不出来了，去设置里重新填一次");
    this.name = "SecretDecryptError";
  }
}

/**
 * 读主密钥。接受 **64 位 hex** 或 **base64**（解出来正好 32 字节）。
 *
 * 长度不对时返回 `null` 而不是抛错：调用方要能区分「没配」和「配错了」——
 * 但两者对用户的说法一样（去补配置），所以这里统一成「没有可用的主密钥」。
 *
 * `.env` 里 `ENCRYPTION_KEY=` 解析出来是**空字符串**，`??` 拦不住，所以先 trim。
 */
export function readMasterKey(): Buffer | null {
  const raw = process.env.ENCRYPTION_KEY?.trim();
  if (!raw) return null;

  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }

  const decoded = Buffer.from(raw, "base64");
  return decoded.length === KEY_BYTES ? decoded : null;
}

/**
 * 加密。返回 `v1.<iv>.<tag>.<data>`，四段都用 base64。
 *
 * 每次加密都用新的随机 IV——同一个 Key 存两次得到的密文不同，这正常且必要
 * （复用 IV 会直接毁掉 GCM 的安全性）。
 */
export function encryptSecret(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), tag.toString("base64"), data.toString("base64")].join(".");
}

/**
 * 解密。任何异常（版本不认识、段数不对、认证失败）都收敛成 `SecretDecryptError`，
 * 调用方只需要认这一个类型。
 */
export function decryptSecret(payload: string, key: Buffer): string {
  const parts = payload.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new SecretDecryptError();
  }

  const [, ivPart, tagPart, dataPart] = parts;
  try {
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivPart, "base64"));
    decipher.setAuthTag(Buffer.from(tagPart, "base64"));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(dataPart, "base64")),
      decipher.final(),
    ]);
    return plain.toString("utf8");
  } catch {
    // 认证失败 / 密钥不对 / 数据损坏，对用户是同一件事：重新填一次
    throw new SecretDecryptError();
  }
}

/** 生成一个可直接写进 `.env` 的主密钥（本地初始化用；线上自己生成即可）。 */
export function generateMasterKey(): string {
  return randomBytes(KEY_BYTES).toString("base64");
}
