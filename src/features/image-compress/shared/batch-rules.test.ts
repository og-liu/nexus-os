import { describe, expect, it } from "vitest";
import {
  MAX_BATCH_BYTES,
  MAX_BATCH_FILES,
  batchRejectionReason,
} from "./batch-rules";

const png = (size: number, name = "a.png") => ({
  name,
  type: "image/png",
  size,
});

const at = (acceptedCount: number, acceptedBytes = 0) => ({
  acceptedCount,
  acceptedBytes,
});

describe("batchRejectionReason（批量准入）", () => {
  it("合法文件放行", () => {
    expect(batchRejectionReason(png(1024), at(0))).toBeNull();
  });

  it("单文件规则：超过 20 MB / GIF / 非 JPG-PNG", () => {
    expect(batchRejectionReason(png(21 * 1024 * 1024), at(0))).toContain("20 MB");
    expect(
      batchRejectionReason({ name: "a.gif", type: "image/gif", size: 10 }, at(0)),
    ).toContain("GIF");
    expect(
      batchRejectionReason({ name: "a.webp", type: "image/webp", size: 10 }, at(0)),
    ).toBe("只支持 JPG / PNG");
  });

  it("张数上限：收满 30 张后，第 31 张被跳过", () => {
    expect(batchRejectionReason(png(10), at(MAX_BATCH_FILES - 1))).toBeNull();
    expect(batchRejectionReason(png(10), at(MAX_BATCH_FILES))).toContain(
      `${MAX_BATCH_FILES} 张`,
    );
  });

  it("总量上限：再加这张会超过 200 MB 就跳过", () => {
    expect(
      batchRejectionReason(png(1024), at(1, MAX_BATCH_BYTES - 1024)),
    ).toBeNull();
    expect(
      batchRejectionReason(png(2048), at(1, MAX_BATCH_BYTES - 1024)),
    ).toContain("200 MB");
  });

  it("被跳过的文件不占名额：10 张图 + 20 个 GIF 后，第 11 张合法图仍可收", () => {
    // 调用方只把合法的计入 acceptedCount，GIF 不计数
    expect(batchRejectionReason(png(10), at(10))).toBeNull();
  });
});
