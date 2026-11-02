import { describe, expect, it } from "vitest";
import { batchRejectionReason } from "./batch-rules";
import { MAX_BATCH_FILES, MAX_FILE_BYTES } from "./constants";

const video = (size = 10 * 1024 * 1024) => ({
  name: "a.mp4",
  type: "video/mp4",
  size,
});

describe("batchRejectionReason（批量准入）", () => {
  it("正常视频可以进批次", () => {
    expect(batchRejectionReason(video(), { acceptedCount: 0 })).toBeNull();
  });

  it("非视频与超限先于批次规则判断（提示更准确）", () => {
    expect(
      batchRejectionReason({ name: "a.txt", type: "text/plain", size: 1 }, { acceptedCount: 0 }),
    ).toBe("只支持视频文件");
    expect(
      batchRejectionReason(video(MAX_FILE_BYTES + 1), { acceptedCount: 0 }),
    ).toBe("超过 500 MB，已跳过");
  });

  it(`第 ${MAX_BATCH_FILES + 1} 个被拒，第 ${MAX_BATCH_FILES} 个还能进`, () => {
    expect(
      batchRejectionReason(video(), { acceptedCount: MAX_BATCH_FILES - 1 }),
    ).toBeNull();
    expect(
      batchRejectionReason(video(), { acceptedCount: MAX_BATCH_FILES }),
    ).toBe(`超过每批 ${MAX_BATCH_FILES} 个，已跳过`);
  });
});
