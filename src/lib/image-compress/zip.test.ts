import { describe, expect, it } from "vitest";
import { buildZip, crc32, sanitizeEntryName, uniqueName } from "./zip";

const encoder = new TextEncoder();

describe("crc32", () => {
  it("标准测试向量：空数据为 0，\"123456789\" 为 0xCBF43926", () => {
    expect(crc32(new Uint8Array())).toBe(0);
    expect(crc32(encoder.encode("123456789"))).toBe(0xcbf43926);
  });

  it("同样输入结果稳定，不同输入结果不同", () => {
    const a = crc32(encoder.encode("nexus"));
    expect(crc32(encoder.encode("nexus"))).toBe(a);
    expect(crc32(encoder.encode("nexuS"))).not.toBe(a);
  });
});

describe("buildZip（store 模式）", () => {
  it("空列表也是一个合法的空包（只有 EOCD）", () => {
    const zip = buildZip([]);
    expect(zip.length).toBe(22);
    expect(Array.from(zip.slice(0, 4))).toEqual([0x50, 0x4b, 0x05, 0x06]);
  });

  it("结构正确：本地头 + 中央目录 + EOCD，文件数写对", () => {
    const zip = buildZip([
      { name: "a.txt", data: encoder.encode("hello") },
      { name: "b.txt", data: encoder.encode("world!") },
    ]);
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);

    // 第一个本地文件头
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint16(6, true)).toBe(0x0800); // UTF-8 标志
    expect(view.getUint16(8, true)).toBe(0); // store
    // 第一个文件名
    const nameLength = view.getUint16(26, true);
    const name = new TextDecoder().decode(zip.slice(30, 30 + nameLength));
    expect(name).toBe("a.txt");
    // 第一个文件内容
    const dataStart = 30 + nameLength;
    expect(new TextDecoder().decode(zip.slice(dataStart, dataStart + 5))).toBe("hello");

    // EOCD 在最后 22 字节
    const eocd = zip.length - 22;
    expect(view.getUint32(eocd, true)).toBe(0x06054b50);
    expect(view.getUint16(eocd + 8, true)).toBe(2); // 本盘文件数
    expect(view.getUint16(eocd + 10, true)).toBe(2); // 总文件数
  });

  it("中文文件名按 UTF-8 写入", () => {
    const zip = buildZip([{ name: "图片.png", data: new Uint8Array([1, 2, 3]) }]);
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    const nameLength = view.getUint16(26, true);
    expect(nameLength).toBe(encoder.encode("图片.png").length);
    expect(new TextDecoder().decode(zip.slice(30, 30 + nameLength))).toBe("图片.png");
  });
});

describe("sanitizeEntryName（打包名消毒）", () => {
  it("路径分隔符换成下划线，开头的点去掉", () => {
    expect(sanitizeEntryName("../../evil.png")).toBe("_.._evil.png");
    expect(sanitizeEntryName("a/b\\c.png")).toBe("a_b_c.png");
    expect(sanitizeEntryName(".hidden.png")).toBe("hidden.png");
  });

  it("空名字兜底成 image", () => {
    expect(sanitizeEntryName("")).toBe("image");
    expect(sanitizeEntryName("   ")).toBe("image");
  });
});

describe("uniqueName（压缩包内去重）", () => {
  it("撞名时补 (2)、(3)，保留扩展名", () => {
    const used = new Set<string>();
    expect(uniqueName("a.png", used)).toBe("a.png");
    expect(uniqueName("a.png", used)).toBe("a (2).png");
    expect(uniqueName("a.png", used)).toBe("a (3).png");
  });

  it("没有扩展名时直接补后缀", () => {
    const used = new Set<string>();
    expect(uniqueName("README", used)).toBe("README");
    expect(uniqueName("README", used)).toBe("README (2)");
  });
});
