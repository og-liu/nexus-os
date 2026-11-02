import { describe, expect, it } from "vitest";
import { isVideoFile, rejectionReason } from "./accept";
import { MAX_FILE_BYTES } from "./constants";

describe("isVideoFile（MIME 或扩展名任一命中）", () => {
  it("MIME 是 video/* 就放行（iOS 的 quicktime 也算）", () => {
    expect(isVideoFile({ name: "a.bin", type: "video/quicktime" })).toBe(true);
  });

  it("MIME 是空串时看扩展名（拖拽路径的常态）", () => {
    expect(isVideoFile({ name: "抖音_❤️.mp4", type: "" })).toBe(true);
    expect(isVideoFile({ name: "X.MKV", type: "" })).toBe(true);
  });

  it("两个都不像就不是视频", () => {
    expect(isVideoFile({ name: "笔记.txt", type: "text/plain" })).toBe(false);
    expect(isVideoFile({ name: "noext", type: "" })).toBe(false);
  });
});

describe("rejectionReason（选中那一刻的准入）", () => {
  it("正常视频返回 null", () => {
    expect(
      rejectionReason({ name: "a.mp4", type: "video/mp4", size: 10 * 1024 * 1024 }),
    ).toBeNull();
  });

  it("非视频优先于体积判断（提示更准确）", () => {
    expect(rejectionReason({ name: "a.txt", type: "text/plain", size: 1 })).toBe("not-video");
  });

  it("超过 500 MB 被拒，恰好 500 MB 放行", () => {
    expect(
      rejectionReason({ name: "a.mp4", type: "video/mp4", size: MAX_FILE_BYTES + 1 }),
    ).toBe("too-large");
    expect(
      rejectionReason({ name: "a.mp4", type: "video/mp4", size: MAX_FILE_BYTES }),
    ).toBeNull();
  });
});
