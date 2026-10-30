"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type RefObject,
} from "react";
import { useToast } from "@/components/ui/toast";
import {
  DEFAULT_QUALITY,
  MAX_FILE_BYTES,
  QUALITY_MIN,
} from "@/lib/image-compress/constants";
import {
  isGif,
  isSupportedImage,
  outputFilename,
  type OutputPlan,
} from "@/lib/image-compress/plan-output";
import {
  buildSource,
  disposeSource,
  encodeSource,
  planFor,
  type CompressOutcome,
  type LoadedSource,
} from "./image-source";
import type { RejectNotice } from "./compress-dropzone";

export type { CompressOutcome } from "./image-source";

/**
 * 单张图片压缩的状态机（《功能/图片压缩》§二 / §七）。
 *
 * **压缩由「开始压缩」按钮触发**：载入图片、改质量都只更新参数，不自动编码；
 * 参数一变，旧结果立刻作废（数字与滑杆绝不能对不上）。
 *
 * **继续压缩**：质量降一档、从最初的原图重新压，更小才提交。
 *
 * 资源生命周期：原图 object URL 随 `source` 的 effect 清理函数释放；
 * 结果的 object URL 随 `outcome` 的 effect 清理函数释放。
 */

/**
 * `inputRef` 由视图持有（`<input type="file">` 也渲染在视图里）：
 * 把这个 ref 传进来而不是从 hook 返回出去——hook 的返回值一旦带上 ref，
 * 视图里每次属性访问都会被 React 的 lint 规则当成「渲染期读 ref」。
 */
export function useImageCompress(inputRef: RefObject<HTMLInputElement | null>) {
  const toast = useToast();

  const [source, setSource] = useState<LoadedSource | null>(null);
  const [outcome, setOutcome] = useState<CompressOutcome | null>(null);
  const [reject, setReject] = useState<RejectNotice | null>(null);
  const [encoding, setEncoding] = useState(false);
  /** 编码开始的时刻（毫秒）：给进度条算「已用 N 秒」。 */
  const [encodingStartedAt, setEncodingStartedAt] = useState<number | null>(null);

  // 参数跨「换一张」保留（文档 §六 第 11 条）。
  const [quality, setQuality] = useState(DEFAULT_QUALITY);

  const loadSeqRef = useRef(0);
  const encodeSeqRef = useRef(0);

  /** 原图换了 / 页面卸载时释放上一张的 object URL。 */
  useEffect(() => {
    if (!source) return;
    return () => disposeSource(source);
  }, [source]);

  /** 结果换了 / 页面卸载时 revoke 上一份 object URL（「压不动」没有 URL）。 */
  useEffect(() => {
    if (!outcome || outcome.kind !== "compressed") return;
    return () => URL.revokeObjectURL(outcome.url);
  }, [outcome]);

  const openPicker = useCallback(() => {
    inputRef.current?.click();
  }, [inputRef]);

  /** 清掉当前图片与结果，回到空态（参数保留）。正在跑的编码一并作废。 */
  const clearImage = useCallback(() => {
    encodeSeqRef.current += 1;
    setSource(null);
    setOutcome(null);
    setEncoding(false);
    setEncodingStartedAt(null);
  }, []);

  const loadFile = useCallback(
    async (file: File) => {
      // 超过上限立刻拒绝：不进解码、不留半截状态（原来那张若有，保持不动）
      if (file.size > MAX_FILE_BYTES) {
        toast.warn("图片超过 20 MB");
        return;
      }

      const loadId = ++loadSeqRef.current;
      clearImage();
      setReject(null);

      if (isGif(file.name, file.type)) {
        setReject({
          title: "GIF / 动图暂不支持",
          detail: "压缩会把动图变成单帧静图，所以这里不做——请换一张 JPG 或 PNG。",
        });
        return;
      }

      // 输入白名单：只收 JPG / JPEG / PNG，其余格式一律不接
      if (!isSupportedImage(file.name, file.type)) {
        setReject({
          title: "只支持 JPG / PNG 图片",
          detail: "WebP、HEIC、BMP 等格式暂不支持——请先转成 JPG 或 PNG 再拖进来。",
        });
        return;
      }

      try {
        const next = await buildSource(file);
        if (loadId !== loadSeqRef.current) {
          // 解码期间用户又换了一张：这一张没人要了，直接释放
          disposeSource(next);
          return;
        }
        setSource(next);
      } catch {
        if (loadId !== loadSeqRef.current) return;
        setReject({
          title: "你的浏览器打不开这个格式",
          detail: "建议先用系统「预览」把它导出成 JPG，再拖进来。",
        });
      }
    },
    [clearImage, toast],
  );

  const handleInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      // 清空 value：不然再选同一个文件不会触发 change
      event.target.value = "";
      if (file) void loadFile(file);
    },
    [loadFile],
  );

  // 粘贴载入：截图后直接 ⌘/Ctrl + V（文档 §四「载入方式」）。
  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      const data = event.clipboardData;
      if (!data) return;

      let image = Array.from(data.files).find((file) =>
        file.type.startsWith("image/"),
      );
      if (!image) {
        for (const item of Array.from(data.items)) {
          if (item.kind !== "file") continue;
          const file = item.getAsFile();
          if (file && file.type.startsWith("image/")) {
            image = file;
            break;
          }
        }
      }
      if (!image) return;

      event.preventDefault();
      void loadFile(image);
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [loadFile]);

  /** 当前输出方案（输出尺寸 = 源图尺寸）。 */
  const plan = useMemo<OutputPlan | null>(
    () => (source ? planFor(source) : null),
    [source],
  );

  const filename =
    source && outcome?.kind === "compressed"
      ? outputFilename(source.name, outcome.plan.extension)
      : "";

  /** 编码一次并把结果落到 state；序号守住乱序回调。 */
  const encode = useCallback(
    async (requestedQuality: number) => {
      if (!source || !plan || encoding) return;

      const jobId = ++encodeSeqRef.current;
      setEncoding(true);
      setEncodingStartedAt(Date.now());
      try {
        const { blob, effectiveQuality } = await encodeSource(
          source,
          plan,
          requestedQuality,
        );
        if (jobId !== encodeSeqRef.current) return;

        // Worker 已经尽量降档；还是没变小就判定「压不动」，绝不递更大的文件
        if (blob.size >= source.size) {
          setOutcome({
            kind: "not-smaller",
            attemptedSize: blob.size,
            attemptedQuality: effectiveQuality,
            plan,
          });
          return;
        }
        // 自动降过档：滑杆跟着走，避免「滑杆 95%、结果是 85% 压的」
        if (effectiveQuality !== requestedQuality) setQuality(effectiveQuality);
        setOutcome({
          kind: "compressed",
          url: URL.createObjectURL(blob),
          size: blob.size,
          plan,
          requestedQuality,
          effectiveQuality,
        });
      } catch {
        if (jobId !== encodeSeqRef.current) return;
        toast.error("压缩失败，换一张图片试试");
      } finally {
        if (jobId === encodeSeqRef.current) {
          setEncoding(false);
          setEncodingStartedAt(null);
        }
      }
    },
    [source, plan, encoding, toast],
  );

  const startCompress = useCallback(() => encode(quality), [encode, quality]);

  /** 「继续压缩」：降一档质量、从原图重压；更小才提交，否则保留当前结果。 */
  const continueCompress = useCallback(async () => {
    if (!source || !plan || outcome?.kind !== "compressed" || encoding) return;
    if (quality <= QUALITY_MIN + 0.001) {
      toast.info("已经到最低质量了，压不动了");
      return;
    }

    const nextQuality = Math.max(
      QUALITY_MIN,
      Math.round((quality - 0.1) * 100) / 100,
    );
    const previousSize = outcome.size;

    const jobId = ++encodeSeqRef.current;
    setEncoding(true);
    setEncodingStartedAt(Date.now());
    try {
      const { blob, effectiveQuality } = await encodeSource(
        source,
        plan,
        nextQuality,
      );
      if (jobId !== encodeSeqRef.current) return;

      if (blob.size >= previousSize) {
        toast.info("再降质量也小不了了，这张已经压到极限");
        return;
      }

      setQuality(effectiveQuality);
      setOutcome({
        kind: "compressed",
        url: URL.createObjectURL(blob),
        size: blob.size,
        plan,
        requestedQuality: nextQuality,
        effectiveQuality,
      });
    } catch {
      if (jobId === encodeSeqRef.current) {
        toast.error("继续压缩失败，换一张图片试试");
      }
    } finally {
      if (jobId === encodeSeqRef.current) {
        setEncoding(false);
        setEncodingStartedAt(null);
      }
    }
  }, [source, plan, outcome, quality, encoding, toast]);

  /**
   * 改质量：只改参数，顺手**作废**已有结果与在跑的编码。
   *
   * 不保留旧结果是有意的——滑杆停在 50%、结果区却显示 80% 压出来的数字，
   * 正是「参数态与结果态不同步」那个坑。
   */
  const changeQuality = useCallback((next: number) => {
    setQuality(next);
    encodeSeqRef.current += 1;
    setOutcome(null);
    setEncoding(false);
    setEncodingStartedAt(null);
  }, []);

  return {
    source,
    outcome,
    reject,
    encoding,
    encodingStartedAt,
    quality,
    plan,
    filename,
    openPicker,
    clearImage,
    loadFile,
    handleInputChange,
    startCompress,
    continueCompress,
    changeQuality,
  };
}
