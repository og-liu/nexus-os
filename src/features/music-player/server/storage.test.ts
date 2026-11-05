import { describe, expect, it } from "vitest";
import { musicRootFor } from "./storage";

describe("storage.musicRootFor（features/music-player/README.md §四「文件夹在哪」）", () => {
  it("线上：跟着数据库落在 shared/data/music", () => {
    expect(musicRootFor("/opt/nexus-os/shared/data/nexus-os.db")).toBe(
      "/opt/nexus-os/shared/data/music",
    );
  });

  it("本地：跟着数据库落在 data/music", () => {
    expect(musicRootFor("/Users/ogliu/nexus-os/data/nexus-os.db")).toBe(
      "/Users/ogliu/nexus-os/data/music",
    );
    expect(musicRootFor("data/nexus-os.db")).toBe("data/music");
  });

  it("内存库没有目录，返回 null 而不是落到当前目录", () => {
    expect(musicRootFor(":memory:")).toBeNull();
    expect(musicRootFor("")).toBeNull();
    expect(musicRootFor("   ")).toBeNull();
  });
});
