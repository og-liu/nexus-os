import { describe, expect, it } from "vitest";
import { planOutput } from "./plan-output";

describe("planOutput（源编码 → 输出容器与处理方式）", () => {
  it("无损编码一律流拷贝，容器与编码配对", () => {
    expect(planOutput("aac")).toMatchObject({
      extension: ".m4a",
      mime: "audio/mp4",
      mode: "copy",
      label: "无损提取",
    });
    expect(planOutput("alac")).toMatchObject({ extension: ".m4a", mode: "copy" });
    expect(planOutput("mp3")).toMatchObject({
      extension: ".mp3",
      mime: "audio/mpeg",
      mode: "copy",
    });
    expect(planOutput("flac")).toMatchObject({ extension: ".flac", mode: "copy" });
  });

  it("编码大小写不影响判断（ffmpeg 各版本输出不一致）", () => {
    expect(planOutput("AAC").mode).toBe("copy");
    expect(planOutput("  Mp3  ").extension).toBe(".mp3");
  });

  it("播放兼容差的编码转成 AAC，装进 .m4a", () => {
    for (const codec of ["opus", "vorbis", "ac3", "eac3", "dts", "amr_nb", "pcm_s16le"]) {
      expect(planOutput(codec)).toMatchObject({
        extension: ".m4a",
        mime: "audio/mp4",
        mode: "transcode",
        label: "已转为 AAC",
      });
    }
  });

  it("没有音轨 / 编码认不出来时也走转码（不抛异常）", () => {
    for (const codec of [null, undefined, "", "unknown"]) {
      expect(planOutput(codec).mode).toBe("transcode");
    }
  });
});
