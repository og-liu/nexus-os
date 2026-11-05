/**
 * 歌单内曲目排序接口的薄壳：实现住在 `features/music-player/server/api/playlist-tracks-order.ts`。
 *
 * **segment config 必须留在壳里**（`runtime` / `dynamic`）：它们是 Next 读的路由段配置，
 * 不是实现，放进 features 里就不生效了。这条已在定稿 §一 实测过。
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export { PATCH } from "@/features/music-player/server/api/playlist-tracks-order";
