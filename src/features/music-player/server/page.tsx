import type { Metadata } from "next";
import { MusicView } from "../client/music-view";
import { requireUser } from "@/lib/auth/current-user";

export const metadata: Metadata = {
  title: "音乐播放器",
};

/**
 * 音乐播放器工具页（features/music-player/README.md §2.1）。受保护页面：未登录访问跳登录页。
 *
 * 页面只做接线：`requireUser()` + 渲染客户端视图。
 * 曲库数据由 `PlayerProvider` 在客户端读一次（那个 Provider 挂在应用外壳上，
 * 比这个页面活得久），所以这里不再单独查库——两处各读一遍会打架。
 */
export default async function MusicPlayerPage() {
  await requireUser();

  return <MusicView />;
}
