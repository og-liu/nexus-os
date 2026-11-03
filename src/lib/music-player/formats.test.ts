import { describe, expect, it } from "vitest";
import {
  baseNameOf,
  cleanTag,
  cleanTitle,
  containerFor,
  extensionOf,
  formatLabel,
  isAcceptedExtension,
} from "./formats";

describe("formats（《功能/音乐播放器》§三）", () => {
  it("扩展名取小写，没有扩展名返回空串", () => {
    expect(extensionOf("晴天.MP3")).toBe("mp3");
    expect(extensionOf("a.b.flac")).toBe("flac");
    expect(extensionOf("无扩展名")).toBe("");
    expect(extensionOf(".mp3")).toBe("");
    expect(extensionOf("尾部点.")).toBe("");
  });

  it("取文件名时丢掉两种斜杠开头的目录", () => {
    expect(baseNameOf("../../etc/passwd")).toBe("passwd");
    expect(baseNameOf("C:\\Users\\x\\a.mp3")).toBe("a.mp3");
    expect(baseNameOf("a/b/c.mp3")).toBe("c.mp3");
    expect(baseNameOf("  纯名字.mp3  ")).toBe("纯名字.mp3");
  });

  it("入口白名单只认音频容器", () => {
    for (const ext of ["mp3", "m4a", "aac", "wav", "flac", "ogg", "oga", "opus"]) {
      expect(isAcceptedExtension(ext)).toBe(true);
    }
    for (const ext of ["txt", "jpg", "mp4", "wma", "ape", ""]) {
      expect(isAcceptedExtension(ext)).toBe(false);
    }
  });

  it("容器由编码决定，不看扩展名", () => {
    expect(containerFor("mp3")).toEqual({ ext: "mp3", mime: "audio/mpeg" });
    expect(containerFor("AAC")).toEqual({ ext: "m4a", mime: "audio/mp4" });
    expect(containerFor("opus")).toEqual({ ext: "ogg", mime: "audio/ogg" });
    expect(containerFor("pcm_s16le")).toEqual({ ext: "wav", mime: "audio/wav" });
    // 浏览器放不了的编码：没有容器 = 上传时拒
    expect(containerFor("ac3")).toBeNull();
    expect(containerFor("dts")).toBeNull();
  });

  it("格式标签按容器缩写", () => {
    expect(formatLabel("mp3")).toBe("MP3");
    expect(formatLabel("aac")).toBe("M4A");
    expect(formatLabel("pcm_s24le")).toBe("WAV");
    expect(formatLabel("ac3")).toBe("AC3");
  });

  it("歌名去掉扩展名、压空白、限长，空名兜底", () => {
    expect(cleanTitle("周杰伦 - 晴天.mp3")).toBe("周杰伦 - 晴天");
    expect(cleanTitle("  多个   空格 .flac")).toBe("多个 空格");
    expect(cleanTitle(".mp3")).toBe("未命名");
    expect(cleanTitle("")).toBe("未命名");
    expect(cleanTitle("x".repeat(200))).toHaveLength(120);
  });

  it("标签里的替换字符一律当没有（GBK 乱码回退文件名）", () => {
    expect(cleanTag("晴天")).toBe("晴天");
    expect(cleanTag("  晴天  ")).toBe("晴天");
    expect(cleanTag("")).toBeNull();
    expect(cleanTag(null)).toBeNull();
    expect(cleanTag("����")).toBeNull();
  });
});
