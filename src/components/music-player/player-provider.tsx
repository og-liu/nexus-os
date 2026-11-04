"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import type { PlaylistWithTracks } from "@/lib/music-player/playlists";
import type { PlaybackState } from "@/lib/music-player/playback";
import type { Track, TrackList } from "@/lib/music-player/tracks";

/**
 * 全站唯一的播放器（《功能/音乐播放器》§四第 3、13 条）。
 *
 * **`<audio>` 只在这一处渲染，并且挂在 `AppShell` 上。** 放进首页卡或工具页里，
 * 用户一离开那个页面它就被卸载，歌立刻停——而「切页面歌不停」正是这个功能的核心。
 * 首页卡与工具页播放条都只是它的遥控器。
 *
 * **曲库与播放队列是两件事**（§四第 13 条）：
 * - `library` 是全库，永远完整；
 * - `queue` 是「此刻往下放的顺序」——在歌单里点歌时它等于那个歌单的曲目，
 *   在「全部歌曲」里点歌时它等于全库；
 * - 「下一首 / 上一首 / 随机」都只在这个队列内走。
 *
 * 播放状态全部住在内存里，不落库、不进 localStorage：它是「此刻」的状态，不是资产。
 */

export type PlayMode = "order" | "shuffle";

/**
 * 当前队列的来历：全库，还是某个歌单。只影响 `queue` 怎么算，不影响 `<audio>`。
 *
 * **不存歌单名**：名字会改，存在这里就成了第二个真相。要显示名字时用
 * `queuePlaylistName`（它每次从 `playlists` 里现查）。
 */
export type QueueSource = { type: "library" } | { type: "playlist"; id: number };

/** `GET /tracks` 的完整响应：曲目 + 合计体积 + 歌单（含各自曲目 id）+ 上次播到哪。 */
export interface LibraryPayload extends TrackList {
  playlists: PlaylistWithTracks[];
  /** 上次播到哪；从来没播过或那首已经删了就是 null */
  resume: PlaybackState | null;
}

interface PlayerContextValue {
  /** 全库曲目（不随视图变化） */
  library: Track[];
  totalBytes: number;
  /** 曲库还在读（首屏那一小会儿） */
  loading: boolean;
  playlists: PlaylistWithTracks[];
  /** 当前队列的来历 */
  queueSource: QueueSource;
  /**
   * 当前播放范围的显示名：具体歌单的名字，或「全部歌曲」。
   * 首页卡与悬浮球拿它显示「正在放哪一摊」。
   */
  queuePlaylistName: string;
  /** 当前播放队列（已经按播放顺序排好） */
  queue: Track[];
  current: Track | null;
  playing: boolean;
  /** 已播秒数 */
  position: number;
  /** 当前曲目总秒数；元数据还没到或读不出时为 0 */
  duration: number;
  /** 0..1 */
  volume: number;
  mode: PlayMode;
  /** 播放失败的一句话（换歌时自动清掉） */
  error: string | null;
  /** 在某个歌单里从某一首开始播（不传 startId 就从头开始） */
  playPlaylist: (playlistId: number, startId?: number) => void;
  /**
   * **只换队列的来历，不换歌**。
   *
   * 切左栏歌单时用它：正在播的歌继续播（不打断），但之后「下一首」只在新队列里走。
   * 跟 `playPlaylist` 分开是因为两者的意图不同——一个是「我要看这个歌单」，
   * 一个是「我要播这个歌单」。
   */
  switchQueue: (source: QueueSource) => void;
  /** 切回全库队列，从某一首开始播 */
  playLibrary: (startId?: number) => void;
  /** 播放器的主按钮：没选歌时从队列第一首开始 */
  toggle: () => void;
  next: () => void;
  prev: () => void;
  seek: (seconds: number) => void;
  setVolume: (value: number) => void;
  cycleMode: () => void;
  /** 重新读曲库与歌单（上传 / 删除 / 改元数据 / 动歌单之后调） */
  refresh: () => Promise<void>;
  /** 删一批（连文件和库行），删到当前曲目时自动接下一首 */
  removeTracks: (ids: number[]) => Promise<void>;
  /** 删一首 = 只有一个元素的 removeTracks */
  removeTrack: (id: number) => Promise<void>;
  /** 改歌名 / 歌手 / 所属歌单；成功后本地立刻更新，不整页刷新 */
  updateTrack: (id: number, patch: { title: string; artist: string; playlistIds: number[] }) => Promise<void>;
  /** 把一批歌加进某个歌单 */
  addToPlaylist: (playlistId: number, trackIds: number[]) => Promise<{ added: number }>;
  /**
   * 把曲库整体重排成 `ids` 的顺序（拖拽松手时调）。
   * 传的是**完整列表**的 id 序列，服务端全量覆盖。
   */
  reorderTracks: (ids: number[]) => Promise<void>;
  /** 把某个歌单内的顺序重排成 `ids`（只动这个歌单，不动曲库顺序） */
  reorderPlaylistTracks: (playlistId: number, ids: number[]) => Promise<void>;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

/** 读播放器状态。**必须**在 `PlayerProvider` 里用，否则直接抛——静默的空实现会让 bug 变成"没反应"。 */
export function usePlayer(): PlayerContextValue {
  const value = useContext(PlayerContext);
  if (!value) {
    throw new Error("usePlayer 必须在 PlayerProvider 里使用");
  }
  return value;
}

function streamUrl(trackId: number): string {
  return `/api/tools/music-player/stream?id=${trackId}`;
}

/** 从响应里抠出一句给人看的错误。 */
async function readError(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? fallback;
}

/**
 * 恢复期间的「上报静默窗口」。
 *
 * 正常只要几十毫秒（`loadedmetadata` 一到就放开），这里只是兜底：
 * 音频一直加载不出来时，不能让上报被永久拦住。
 */
const RESTORE_GRACE_MS = 3_000;

export function PlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  /**
   * 恢复进度要等的那个秒数。
   *
   * 不能在 `setCurrentId` 的同时 `audio.currentTime = x`——那时新歌还没加载，
   * 赋了也会被 `loadstart` 清掉。所以先记在这里，等 `loadedmetadata` 一响就 seek。
   */
  const pendingSeekRef = useRef<number | null>(null);
  /**
   * 正在从服务端恢复进度。
   *
   * 这期间**不许上报**：恢复的那一刻 `audio.currentTime` 还是 0（新歌没加载完），
   * 「暂停就上报」那条逻辑会把库里的 45 秒覆盖成 0——用户刚好在这 100 毫秒里刷新，
   * 进度就丢了。等 `loadedmetadata` 把位置摆好之后再放开。
   */
  const restoringRef = useRef(false);
  /**
   * 恢复是从什么时候开始的（`restoringRef` 的兜底）。
   *
   * 正常路径：`loadedmetadata` 一响就放开上报。但音频**一直加载不出来**时那个事件不会来，
   * 上报就被永久拦死（用户切歌、暂停都不会记）。所以再加一条时间线：超过
   * {@link RESTORE_GRACE_MS} 就不再拦——宁可写一次可能不准的位置，也不要从此不再上报。
   */
  const restoreStartedAtRef = useRef(0);
  /**
   * 首屏恢复时「上次是不是正在播」（2026-11-04 联调加的）。
   *
   * - `null` = 不是恢复（用户点歌 / 切歌），照常播；
   * - `true` = 上次在播：尝试接着播（浏览器拒绝就静默停在暂停态）；
   * - `false` = 上次是暂停：**只把歌和进度摆好，不按播放**——
   *   否则一刷新页面就自己响起来（这就是用户报的那个 bug）。
   */
  const resumeAutoPlayRef = useRef<boolean | null>(null);

  const [library, setLibrary] = useState<Track[]>([]);
  const [totalBytes, setTotalBytes] = useState(0);
  const [loading, setLoading] = useState(true);
  const [playlists, setPlaylists] = useState<PlaylistWithTracks[]>([]);
  const [queueSourceState, setQueueSource] = useState<QueueSource>({ type: "library" });
  const [currentId, setCurrentId] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(1);
  const [mode, setMode] = useState<PlayMode>("order");
  const [error, setError] = useState<string | null>(null);

  const current = useMemo(
    () => library.find((track) => track.id === currentId) ?? null,
    [library, currentId],
  );

  /**
   * 当前的队列来源（对外就是这个）。
   *
   * 指向的歌单已经被删掉时视为全库——这样删完歌单不用再手动切一次，
   * 左栏的选中态也跟着回到「全部歌曲」（它直接由这个值派生）。
   *
   * **它是整个播放器唯一的「当前在放哪个歌单」，不是某个页面的局部状态。**
   * 之前把「左栏选中谁」存在 `MusicView` 里，一离开页面就被卸载、回来变成「全部歌曲」，
   * 用户看到的是「我明明在放 DJ，进来却不是」。
   */
  const queueSource = useMemo<QueueSource>(() => {
    if (queueSourceState.type === "playlist") {
      const found = playlists.find((item) => item.id === queueSourceState.id);
      return found ? { type: "playlist", id: found.id } : { type: "library" };
    }
    return queueSourceState;
  }, [queueSourceState, playlists]);

  /**
   * 当前播放范围的显示名：某个歌单的名字，或者「全部歌曲」。
   *
   * 全库播放时返回「全部歌曲」而不是 null——用户要的是「现在放的是哪一摊」，
   * 而全库播放同样有名字，留空反而像「没信息可显示」。
   * 名字每次从 `playlists` 现查，歌单改名后这里立刻是新的。
   */
  const queuePlaylistName = useMemo(() => {
    if (queueSource.type === "library") return "全部歌曲";
    return playlists.find((item) => item.id === queueSource.id)?.name ?? "全部歌曲";
  }, [queueSource, playlists]);

  /**
   * 当前播放队列。
   *
   * 歌单被删掉、或者歌单里的歌被删光时**退回全库**而不是变成空队列：
   * 队列为空会让「下一首」彻底失灵，用户看到的是按钮点不动。
   */
  const queue = useMemo<Track[]>(() => {
    if (queueSource.type === "library") return library;

    const playlist = playlists.find((item) => item.id === queueSource.id);
    if (!playlist) return library;

    const byId = new Map(library.map((track) => [track.id, track]));
    const scoped = playlist.trackIds
      .map((id) => byId.get(id))
      .filter((track): track is Track => track !== undefined);

    return scoped.length > 0 ? scoped : library;
  }, [library, playlists, queueSource]);

  const applyPayload = useCallback((data: LibraryPayload) => {
    setLibrary(data.tracks);
    setTotalBytes(data.totalBytes);
    setPlaylists(data.playlists ?? []);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/tools/music-player/tracks", { cache: "no-store" });
      if (!response.ok) return;
      applyPayload((await response.json()) as LibraryPayload);
    } catch {
      // 网络抖动不该让播放器崩：保留上一次的列表
    } finally {
      setLoading(false);
    }
  }, [applyPayload]);

  /**
   * 首屏读一次曲库。
   *
   * 写成一串 `.then` 而不是直接调 `refresh()`：`react-hooks/set-state-in-effect`
   * 会把「effect 里同步调到带 setState 的函数」判成级联渲染，而这些 setState
   * 其实都落在网络回调里。`.then` 里更新状态是这条规则明确允许的形态。
   */
  useEffect(() => {
    let cancelled = false;
    fetch("/api/tools/music-player/tracks", { cache: "no-store" })
      .then((response) => (response.ok ? (response.json() as Promise<LibraryPayload>) : null))
      .then((data) => {
        if (cancelled || !data) return;
        setLibrary(data.tracks);
        setTotalBytes(data.totalBytes);
        setPlaylists(data.playlists ?? []);

        // 接着上次播（《功能/音乐播放器》§2.1.6）。恢复「哪首 + 在哪一摊 + 第几秒」，
        // 外加**上次是不是正在播**：暂停就不许自己响起来（2026-11-04 修的 bug——
        // 原来这里不记播放状态，下面的切歌 effect 一挂载就 play()）。
        if (data.resume?.trackId) {
          resumeAutoPlayRef.current = data.resume.playing;
          // 恢复期间不许上报：这时 currentTime 还是 0，「暂停就上报」会把进度覆盖成 0
          restoringRef.current = true;
          restoreStartedAtRef.current = Date.now();
          setCurrentId(data.resume.trackId);
          if (data.resume.playlistId !== null) {
            setQueueSource({ type: "playlist", id: data.resume.playlistId });
          }
          if (data.resume.positionMs > 0) {
            pendingSeekRef.current = data.resume.positionMs / 1000;
          }
        }
      })
      .catch(() => {
        // 读不到就先当空曲库，下一次 refresh 会再试
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * 切歌之后开始播。
   *
   * `src` 由 React 渲染在 `<audio>` 上（见底部的 JSX），这里只负责按播放。
   * 进度的归零交给 `loadstart` 事件——在 effect 里直接 `setPosition(0)` 会被
   * `react-hooks/set-state-in-effect` 判成级联渲染，而且那个位置本来就有「加载开始」这个事件。
   */
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || currentId === null) return;

    // 首屏恢复出来的**暂停态**：只把歌和进度摆好，不按播放。
    // 「暂停着刷新，页面自己响起来」就是这里漏了这一个判断（2026-11-04）。
    const resumePlaying = resumeAutoPlayRef.current;
    resumeAutoPlayRef.current = null;
    if (resumePlaying === false) return;

    // iOS 上「自动接下一首」可能被拒：静默停在暂停态，不弹错误
    void audio.play().catch(() => setPlaying(false));
  }, [currentId]);

  /** 顺序 / 随机地取下一首。`auto` = 一首自然播完，顺序模式到最后一首就停。 */
  const advance = useCallback(
    (auto: boolean) => {
      if (queue.length === 0) return;

      if (mode === "shuffle") {
        const pool = queue.filter((track) => track.id !== currentId);
        const picks = pool.length > 0 ? pool : queue;
        setCurrentId(picks[Math.floor(Math.random() * picks.length)].id);
        return;
      }

      const index = queue.findIndex((track) => track.id === currentId);
      if (index === -1) {
        setCurrentId(queue[0].id);
        return;
      }

      const nextIndex = index + 1;
      if (nextIndex < queue.length) {
        setCurrentId(queue[nextIndex].id);
        return;
      }

      if (auto) {
        // 播完队列最后一首：停下、回到开头（不循环）
        audioRef.current?.pause();
        if (audioRef.current) audioRef.current.currentTime = 0;
        setPosition(0);
        return;
      }

      // 手动点「下一首」在最后一首时绕回第一首，按钮不该失灵
      setCurrentId(queue[0].id);
    },
    [queue, currentId, mode],
  );

  const advanceRef = useRef(advance);
  useEffect(() => {
    advanceRef.current = advance;
  }, [advance]);

  const prev = useCallback(() => {
    if (queue.length === 0) return;
    const index = queue.findIndex((track) => track.id === currentId);
    if (index <= 0) {
      setCurrentId(queue[queue.length - 1].id);
      return;
    }
    setCurrentId(queue[index - 1].id);
  }, [queue, currentId]);

  const prevRef = useRef(prev);
  useEffect(() => {
    prevRef.current = prev;
  }, [prev]);

  // 音频元素的全部事件只在挂载时绑一次，回调通过 ref 取最新逻辑（不然每次切歌都要重绑）
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setPosition(audio.currentTime);
    const onLoadedMetadata = () => {
      if (Number.isFinite(audio.duration)) setDuration(audio.duration);

      // 恢复上次的进度：元数据到了才知道总长，这时候 seek 才不会被夹回 0
      const seekTo = pendingSeekRef.current;
      if (seekTo !== null) {
        pendingSeekRef.current = null;
        if (seekTo > 0) {
          const max = Number.isFinite(audio.duration) ? audio.duration : seekTo;
          audio.currentTime = Math.min(seekTo, max);
          setPosition(audio.currentTime);
        }
      }
      // 无论有没有要 seek，恢复到这里都结束了，可以开始上报
      // （顺序不能反：先 seek 再放开。`positionMs = 0` 的恢复也要放开，否则永远不上报）
      restoringRef.current = false;
    };
    // 新歌一开始加载就把进度归零：切歌那一刻进度条不该还停在上一首的位置
    const onLoadStart = () => {
      setPosition(0);
      setDuration(0);
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => advanceRef.current(true);
    const onError = () => {
      setPlaying(false);
      // 恢复失败（文件丢了 / 编码坏了）：放开上报，否则这一个会话永远记不上进度
      restoringRef.current = false;
      setError("这首歌播放失败了");
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("loadstart", onLoadStart);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("loadstart", onLoadStart);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
    };
  }, []);

  const playPlaylist = useCallback(
    (playlistId: number, startId?: number) => {
      const playlist = playlists.find((item) => item.id === playlistId);
      if (!playlist || playlist.trackIds.length === 0) return;

      setQueueSource({ type: "playlist", id: playlist.id });
      setError(null);
      // 只换队列、不换歌：点的还是同一首时不要重新加载，歌会从头发
      const start =
        startId !== undefined && playlist.trackIds.includes(startId)
          ? startId
          : playlist.trackIds[0];
      setCurrentId(start);
    },
    [playlists],
  );

  const switchQueue = useCallback((source: QueueSource) => {
    setQueueSource(source);
  }, []);

  const playLibrary = useCallback(
    (startId?: number) => {
      setQueueSource({ type: "library" });
      setError(null);
      setCurrentId((previous) => startId ?? previous ?? library[0]?.id ?? null);
    },
    [library],
  );

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (currentId === null) {
      if (queue[0]) setCurrentId(queue[0].id);
      return;
    }
    if (audio.paused) void audio.play().catch(() => setPlaying(false));
    else audio.pause();
  }, [currentId, queue]);

  const seek = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(seconds)) return;
    const max = Number.isFinite(audio.duration) ? audio.duration : seconds;
    audio.currentTime = Math.min(Math.max(0, seconds), max);
    setPosition(audio.currentTime);
  }, []);

  const setVolume = useCallback((value: number) => {
    const clamped = Math.min(1, Math.max(0, value));
    setVolumeState(clamped);
    if (audioRef.current) audioRef.current.volume = clamped;
  }, []);

  const cycleMode = useCallback(() => {
    setMode((previous) => (previous === "order" ? "shuffle" : "order"));
  }, []);

  const removeTracks = useCallback(
    async (ids: number[]) => {
      const unique = [...new Set(ids)].filter((id) => Number.isInteger(id) && id > 0);
      if (unique.length === 0) return;

      const response = await fetch(
        `/api/tools/music-player/tracks?ids=${unique.join(",")}`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error(await readError(response, "删除失败"));

      // 用服务端回的 removed 而不是本地请求的 ids：混进别人的 id 时只有一部分会被删
      const result = (await response.json()) as { removed: number[] };
      const removedSet = new Set(result.removed);

      const remaining = library.filter((track) => !removedSet.has(track.id));
      const removedBytes = library
        .filter((track) => removedSet.has(track.id))
        .reduce((sum, track) => sum + track.sizeBytes, 0);

      setLibrary(remaining);
      setTotalBytes((previous) => Math.max(0, previous - removedBytes));
      // 歌单里的歌少了，计数与 trackIds 都要重算
      setPlaylists((previous) =>
        previous.map((playlist) => ({
          ...playlist,
          trackIds: playlist.trackIds.filter((id) => !removedSet.has(id)),
          trackCount: playlist.trackIds.filter((id) => !removedSet.has(id)).length,
        })),
      );

      // 正在播的那首被删了：优先接它后面的第一首，没有就往回找，都没有就停
      if (currentId !== null && removedSet.has(currentId)) {
        const index = library.findIndex((track) => track.id === currentId);
        const next =
          remaining.slice(Math.max(0, index)).find((track) => !removedSet.has(track.id)) ??
          [...remaining].reverse().find((track) => !removedSet.has(track.id));

        if (next) {
          setCurrentId(next.id);
        } else {
          // 曲库空了：`<audio>` 的 src 会被移除，但它不会自己把时长清零
          setCurrentId(null);
          setPosition(0);
          setDuration(0);
        }
      }
    },
    [library, currentId],
  );

  const removeTrack = useCallback((id: number) => removeTracks([id]), [removeTracks]);

  const updateTrack = useCallback(
    async (
      id: number,
      patch: { title: string; artist: string; playlistIds: number[] },
    ) => {
      const response = await fetch("/api/tools/music-player/tracks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      if (!response.ok) throw new Error(await readError(response, "保存失败"));

      const { track } = (await response.json()) as { track: Track };
      // 本地先落一版：正在播的那首歌名要立刻变，不能等 refresh 回来
      setLibrary((previous) => previous.map((item) => (item.id === track.id ? track : item)));
      // 歌单的曲目归属变了，计数要跟着动
      await refresh();
    },
    [refresh],
  );

  const addToPlaylist = useCallback(
    async (playlistId: number, trackIds: number[]) => {
      const response = await fetch("/api/tools/music-player/playlists/tracks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playlistId, trackIds }),
      });
      if (!response.ok) throw new Error(await readError(response, "加入歌单失败"));

      const result = (await response.json()) as { added: number };
      await refresh();
      return { added: result.added };
    },
    [refresh],
  );

  const reorderTracks = useCallback(async (ids: number[]) => {
    const response = await fetch("/api/tools/music-player/tracks/order", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    if (!response.ok) throw new Error(await readError(response, "调整顺序失败"));

    // 用服务端回的列表覆盖本地，而不是只相信自己刚算的顺序
    const data = (await response.json()) as TrackList;
    setLibrary(data.tracks);
    setTotalBytes(data.totalBytes);
  }, []);

  const reorderPlaylistTracks = useCallback(async (playlistId: number, ids: number[]) => {
    const response = await fetch("/api/tools/music-player/playlists/tracks/order", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playlistId, ids }),
    });
    if (!response.ok) throw new Error(await readError(response, "调整顺序失败"));

    const data = (await response.json()) as { playlists: PlaylistWithTracks[] };
    setPlaylists(data.playlists);
  }, []);

  /**
   * 记一笔「上次播到哪」。**失败就失败**，不提示、不重试——
   * 它只影响「下次能不能接着播」，不该在任何时候打断用户。
   *
   * `keepalive`：页面正在卸载时也要把请求发出去（`fetch` 的 keepalive 让浏览器
   * 在文档销毁后继续完成这个请求，大小上限 64 KB，我们只有几十字节）。
   */
  const savePlayback = useCallback(
    (keepalive = false) => {
      if (currentId === null) return;
      // 恢复中，别把 0 / 旧位置写回去；但最多拦 RESTORE_GRACE_MS，之后照常上报
      if (restoringRef.current && Date.now() - restoreStartedAtRef.current < RESTORE_GRACE_MS) {
        return;
      }
      const audio = audioRef.current;
      const positionMs = audio ? Math.round(audio.currentTime * 1000) : 0;
      // 用 `<audio>` 的真实状态而不是 React 的 `playing`：「暂停那一刻」的 effect 调这里时，
      // state 可能还没追上；`audio.paused` 是这一刻的事实
      const isPlaying = audio ? !audio.paused : false;

      void fetch("/api/tools/music-player/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trackId: currentId,
          playlistId: queueSource.type === "playlist" ? queueSource.id : null,
          positionMs,
          playing: isPlaying,
        }),
        keepalive,
      }).catch(() => {
        // 记不上就算了
      });
    },
    [currentId, queueSource],
  );

  // 播放中每 15 秒记一次：崩了、断电了最多丢 15 秒，而不是整首
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => savePlayback(), 15_000);
    return () => clearInterval(timer);
  }, [playing, savePlayback]);

  // 暂停那一刻记一次（用户「听到这儿先停」是最常见的离开方式）
  useEffect(() => {
    if (!playing) savePlayback();
  }, [playing, savePlayback]);

  // 关标签页 / 切到后台：这是最后一次机会，用 keepalive 把请求送出去
  useEffect(() => {
    const onHide = () => savePlayback(true);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") savePlayback(true);
    };

    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [savePlayback]);

  // 手机锁屏 / 耳机线控：显示当前歌，并能切歌
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    if (!current) {
      navigator.mediaSession.metadata = null;
      return;
    }
    navigator.mediaSession.metadata = new MediaMetadata({
      title: current.title,
      artist: current.artist ?? "",
    });
  }, [current]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;

    navigator.mediaSession.setActionHandler("play", () => {
      void audioRef.current?.play().catch(() => setPlaying(false));
    });
    navigator.mediaSession.setActionHandler("pause", () => audioRef.current?.pause());
    navigator.mediaSession.setActionHandler("nexttrack", () => advanceRef.current(false));
    navigator.mediaSession.setActionHandler("previoustrack", () => prevRef.current());

    return () => {
      navigator.mediaSession.setActionHandler("play", null);
      navigator.mediaSession.setActionHandler("pause", null);
      navigator.mediaSession.setActionHandler("nexttrack", null);
      navigator.mediaSession.setActionHandler("previoustrack", null);
    };
  }, []);

  const value = useMemo<PlayerContextValue>(
    () => ({
      library,
      totalBytes,
      loading,
      playlists,
      queueSource,
      queuePlaylistName,
      queue,
      current,
      playing,
      position,
      duration,
      volume,
      mode,
      error,
      playPlaylist,
      switchQueue,
      playLibrary,
      toggle,
      next: () => advance(false),
      prev,
      seek,
      setVolume,
      cycleMode,
      refresh,
      removeTracks,
      removeTrack,
      updateTrack,
      addToPlaylist,
      reorderTracks,
      reorderPlaylistTracks,
    }),
    [
      library,
      totalBytes,
      loading,
      playlists,
      queueSource,
      queuePlaylistName,
      queue,
      current,
      playing,
      position,
      duration,
      volume,
      mode,
      error,
      playPlaylist,
      switchQueue,
      playLibrary,
      toggle,
      advance,
      prev,
      seek,
      setVolume,
      cycleMode,
      refresh,
      removeTracks,
      removeTrack,
      updateTrack,
      addToPlaylist,
      reorderTracks,
      reorderPlaylistTracks,
    ],
  );

  return (
    <PlayerContext.Provider value={value}>
      {children}
      {/*
        全站唯一的 audio。`src` 由 React 渲染：切成 null 时属性被移除，浏览器自然停。
        `preload="metadata"`：切歌前只拿时长，不预下载整首。
        `hidden` 而不是不渲染——不放 DOM 里，某些浏览器不会创建媒体会话。
      */}
      <audio
        ref={audioRef}
        src={currentId === null ? undefined : streamUrl(currentId)}
        preload="metadata"
        className="hidden"
      />
    </PlayerContext.Provider>
  );
}
