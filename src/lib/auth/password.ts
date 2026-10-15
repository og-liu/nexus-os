import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

/**
 * 密码哈希。用 Node 内置的 scrypt，不引入第三方加密库。
 *
 * 存进库的字符串是**自描述**的：
 *   scrypt$16384$8$1$<salt-base64>$<hash-base64>
 *    算法   N   r p   随机盐 16 字节     派生密钥 64 字节
 * 参数写在字符串里，将来调整参数或换算法时，老密码仍按它自己的参数校验通过，
 * 可以逐个平滑升级，而不是强制所有人重设密码。
 */
const ALGORITHM = "scrypt";
const N = 16384; // CPU / 内存开销因子：约 128 × N × r ≈ 16 MB
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/**
 * scrypt 默认 maxmem 32 MB，而实际需要约 `128 × N × r` 字节。
 * 这里按 N 与 r 把上限算出来（留一倍余量），这样将来把 N 调高到 2^15 以上也不会直接抛错。
 */
function maxmemFor(n: number, r: number): number {
  return Math.max(32 * 1024 * 1024, 128 * n * r * 2);
}

/** 生成一条新的密码哈希。每次调用都用新的随机盐。 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await scrypt(password, salt, KEY_LENGTH, {
    N,
    r: R,
    p: P,
    maxmem: maxmemFor(N, R),
  });
  return [ALGORITHM, N, R, P, salt.toString("base64"), key.toString("base64")].join(
    "$",
  );
}

interface ParsedHash {
  n: number;
  r: number;
  p: number;
  salt: Buffer;
  key: Buffer;
}

/**
 * 解析自描述哈希串。任何解析不出来的情况都返回 null——
 * **畸形数据必须表现为「密码不正确」，而不是抛异常**：一条坏数据不应该让所有人都 500。
 */
function parseHash(stored: string): ParsedHash | null {
  const parts = stored.split("$");
  if (parts.length !== 6) return null;

  const [algorithm, nRaw, rRaw, pRaw, saltRaw, keyRaw] = parts;
  if (algorithm !== ALGORITHM) return null;

  const n = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) {
    return null;
  }
  // 参数上限是防滥用：库里的参数被改坏时，不能让一次登录把进程 CPU / 内存吃光
  if (n < 2 || n > 2 ** 18 || r < 1 || r > 32 || p < 1 || p > 4) return null;

  const salt = Buffer.from(saltRaw, "base64");
  const key = Buffer.from(keyRaw, "base64");
  if (salt.length === 0 || key.length === 0) return null;

  return { n, r, p, salt, key };
}

/**
 * 校验密码。
 *
 * 用 `timingSafeEqual` 而不是 `===`：`===` 在第一个不同的字节处就会返回，
 * 理论上可被逐字节试探出正确值（时序攻击）；`timingSafeEqual` 的耗时与内容无关。
 */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parsed = parseHash(stored);
  if (!parsed) return false;

  const key = await scrypt(password, parsed.salt, parsed.key.length, {
    N: parsed.n,
    r: parsed.r,
    p: parsed.p,
    maxmem: maxmemFor(parsed.n, parsed.r),
  });

  if (key.length !== parsed.key.length) return false;
  return timingSafeEqual(key, parsed.key);
}
