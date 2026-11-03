import { describe, expect, it } from "vitest";
import { createConnection } from "@/lib/auth/db";
import {
  CACHE_TTL_MS,
  findAwemeIdByLink,
  findFreshVideo,
  findVideo,
  saveLink,
  saveVideo,
} from "./store";

function makeDb() {
  return createConnection(":memory:");
}

const sample = {
  awemeId: "7702813136873757106",
  title: "村里办酒席",
  author: "MK",
  coverUrl: "https://p3.example/cover.jpg",
  durationMs: 6367,
  playUrl: "https://v5.example/video.mp4",
};

describe("douyin store（解析缓存）", () => {
  it("写进去能原样读回来", () => {
    const db = makeDb();
    saveVideo(db, sample, 1_000);

    expect(findVideo(db, sample.awemeId)).toEqual({
      awemeId: sample.awemeId,
      title: "村里办酒席",
      author: "MK",
      coverUrl: "https://p3.example/cover.jpg",
      durationMs: 6367,
      playUrl: "https://v5.example/video.mp4",
      fetchedAt: 1_000,
    });
  });

  it("没存过的 id 返回 null", () => {
    const db = makeDb();
    expect(findVideo(db, "999999999999999999")).toBeNull();
    expect(findFreshVideo(db, "999999999999999999")).toBeNull();
  });

  it("24 小时内算新鲜，超过就不算", () => {
    const db = makeDb();
    saveVideo(db, sample, 1_000);

    expect(findFreshVideo(db, sample.awemeId, 1_000 + CACHE_TTL_MS)).not.toBeNull();
    expect(findFreshVideo(db, sample.awemeId, 1_000 + CACHE_TTL_MS + 1)).toBeNull();
  });

  it("过期后 findVideo 仍能取到（下载要拿旧直链先试一次）", () => {
    const db = makeDb();
    saveVideo(db, sample, 1_000);

    expect(findVideo(db, sample.awemeId)).not.toBeNull();
  });

  it("同一个 id 再写一次是覆盖，不是插两行", () => {
    const db = makeDb();
    saveVideo(db, sample, 1_000);
    saveVideo(db, { ...sample, playUrl: "https://v5.example/fresh.mp4" }, 2_000);

    const rows = db.prepare("SELECT COUNT(*) AS n FROM douyin_videos").get() as { n: number };
    expect(rows.n).toBe(1);
    expect(findVideo(db, sample.awemeId)?.playUrl).toBe("https://v5.example/fresh.mp4");
    expect(findVideo(db, sample.awemeId)?.fetchedAt).toBe(2_000);
  });

  it("链接映射：短链解析过之后再贴同一条就不用重新调上游", () => {
    const db = makeDb();
    saveVideo(db, sample, 1_000);
    saveLink(db, "https://v.douyin.com/abc123/", sample.awemeId, 1_000);

    expect(findAwemeIdByLink(db, "https://v.douyin.com/abc123/")).toBe(sample.awemeId);
    expect(findAwemeIdByLink(db, "https://v.douyin.com/other/")).toBeNull();
  });

  it("链接映射指向的作品必须真实存在（外键挡住悬空映射）", () => {
    const db = makeDb();
    expect(() => saveLink(db, "https://v.douyin.com/abc123/", "123456789012345678")).toThrow();
  });

  it("写入新行时顺手清掉 7 天前的老行（这张表不会只增不减）", () => {
    const db = makeDb();
    const day = 24 * 60 * 60 * 1000;
    const now = 10 * day;
    const oldId = "111111111111111111";

    // 8 天前解析的那条
    saveVideo(db, { ...sample, awemeId: oldId }, now - 8 * day);
    expect(findVideo(db, oldId)).not.toBeNull();

    // 今天再解析一条，顺手把 7 天前的清掉
    saveVideo(db, sample, now);

    expect(findVideo(db, oldId)).toBeNull();
    expect(findVideo(db, sample.awemeId)).not.toBeNull();
  });

  it("老行被清掉时，短链映射跟着一起删（ON DELETE CASCADE）", () => {
    const db = makeDb();
    const day = 24 * 60 * 60 * 1000;
    const now = 10 * day;
    const oldId = "111111111111111111";
    const oldLink = "https://v.douyin.com/old/";

    saveVideo(db, { ...sample, awemeId: oldId }, now - 8 * day);
    saveLink(db, oldLink, oldId, now - 8 * day);

    saveVideo(db, sample, now);

    // 悬空的映射会让人以为「这条链接解析过」，实际作品行已经没了
    expect(findAwemeIdByLink(db, oldLink)).toBeNull();
  });
});
