/**
 * 极简 ZIP 打包（只做 store，不压缩）——给「批量压缩 → 全部下载」用。
 *
 * 为什么不用现成的 zip 库：待打包的都是**已经压好的** PNG/JPG，再 deflate 一遍
 * 基本没有收益；store 模式（method 0）只需要「文件头 + CRC + 目录」几十行代码，
 * 不新增依赖、也没有异步 API 的复杂度。
 *
 * 规范要点（PKWARE APPNOTE）：
 * - 本地文件头 `PK\x03\x04`，通用标志位 0x0800（文件名按 UTF-8 编码）；
 * - 中央目录 `PK\x01\x02`、结尾记录 `PK\x05\x06`；
 * - CRC-32 用标准多项式 0xEDB88320。
 */

export interface ZipEntry {
  /** 压缩包内的文件名（含扩展名）。 */
  name: string;
  data: Uint8Array;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value >>> 0;
  }
  return table;
})();

/** 标准 CRC-32（与 zip 工具一致）。 */
export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const encoder = new TextEncoder();

/** 固定时间戳（2020-01-01 00:00），让同样输入的 zip 字节稳定，便于测试。 */
const DOS_TIME = 0;
const DOS_DATE = ((2020 - 1980) << 9) | (1 << 5) | 1;

/**
 * 把若干文件打成一个 ZIP（store 模式）。
 *
 * 返回完整的 zip 字节；空列表返回一个合法的空包（只有 EOCD）。
 */
export function buildZip(entries: ZipEntry[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const size = entry.data.length;

    const local = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true); // 本地文件头签名
    localView.setUint16(4, 20, true); // 解压所需版本
    localView.setUint16(6, 0x0800, true); // 标志位：UTF-8 文件名
    localView.setUint16(8, 0, true); // 压缩方法：store
    localView.setUint16(10, DOS_TIME, true);
    localView.setUint16(12, DOS_DATE, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, size, true); // 压缩后大小
    localView.setUint32(22, size, true); // 原始大小
    localView.setUint16(26, nameBytes.length, true);
    localView.setUint16(28, 0, true); // 扩展字段长度
    local.set(nameBytes, 30);

    chunks.push(local, entry.data);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true); // 中央目录签名
    centralView.setUint16(4, 20, true); // 创建者版本
    centralView.setUint16(6, 20, true); // 解压所需版本
    centralView.setUint16(8, 0x0800, true); // UTF-8 文件名
    centralView.setUint16(10, 0, true); // store
    centralView.setUint16(12, DOS_TIME, true);
    centralView.setUint16(14, DOS_DATE, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, size, true);
    centralView.setUint32(24, size, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint16(30, 0, true); // 扩展字段
    centralView.setUint16(32, 0, true); // 注释
    centralView.setUint16(34, 0, true); // 起始磁盘号
    centralView.setUint16(36, 0, true); // 内部属性
    centralView.setUint32(38, 0, true); // 外部属性
    centralView.setUint32(42, offset, true); // 本地头偏移
    centralHeader.set(nameBytes, 46);

    central.push(centralHeader);
    offset += local.length + size;
  }

  const centralSize = central.reduce((sum, chunk) => sum + chunk.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true); // EOCD 签名
  endView.setUint16(4, 0, true); // 当前磁盘号
  endView.setUint16(6, 0, true); // 中央目录起始磁盘号
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true); // 中央目录偏移
  endView.setUint16(20, 0, true); // 注释长度

  const total =
    chunks.reduce((sum, chunk) => sum + chunk.length, 0) + centralSize + end.length;
  const output = new Uint8Array(total);
  let cursor = 0;
  for (const chunk of [...chunks, ...central, end]) {
    output.set(chunk, cursor);
    cursor += chunk.length;
  }
  return output;
}

/**
 * 打包名消毒：去掉路径分隔符（防解压时写到子目录 / `../` 穿越）、
 * 开头的点和空白（Windows 上会变成不可见文件）。
 */
export function sanitizeEntryName(name: string): string {
  const cleaned = name
    .replace(/[\\/]+/g, "_")
    .replace(/^\.+/, "")
    .trim();
  return cleaned.length > 0 ? cleaned : "image";
}

/**
 * 给压缩包里的文件去重：`1.png`、`1-compressed.png` 撞名时补 ` (2)`、` (3)`…
 * 保留扩展名，Windows/macOS 解压都不会覆盖已有文件。
 */
export function uniqueName(name: string, used: Set<string>): string {
  const safe = sanitizeEntryName(name);
  if (!used.has(safe)) {
    used.add(safe);
    return safe;
  }
  const dot = safe.lastIndexOf(".");
  const base = dot > 0 ? safe.slice(0, dot) : safe;
  const ext = dot > 0 ? safe.slice(dot) : "";
  let index = 2;
  let candidate = `${base} (${index})${ext}`;
  while (used.has(candidate)) {
    index += 1;
    candidate = `${base} (${index})${ext}`;
  }
  used.add(candidate);
  return candidate;
}
