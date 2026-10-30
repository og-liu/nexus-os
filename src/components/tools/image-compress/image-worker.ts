/// <reference lib="webworker" />

/**
 * 图片编码跑在 Worker 里（《功能/图片压缩》§七）。
 *
 * - **JPG**：mozjpeg（`@jsquash/jpeg`）的 WASM，比浏览器 canvas 自带编码器小 5–15%
 *   （渐进式 + 优化 Huffman + trellis）。**压不小就自动降一档质量重试**，直到比原图小
 *   或降到 50%——JPG 是有损格式，永远有一档能变小，不再出现「重编码反而变大」。
 * - **PNG**：调色板量化（`imagequant`）+ oxipng 收尾，输出仍是 PNG；同样有降档兜底。
 *
 * 为什么必须单独开 Worker：这些都是**同步** WASM，跑在主线程会把页面连同动画一起
 * 冻住——用户看到的就是「卡死在压缩中」。
 *
 * 两个包都不能直接 import 包入口：
 * - `@jsquash/oxipng/optimise` 会拖进并行版 codec 与 wasm-feature-detect（Turbopack 卡死）；
 * - `imagequant` 的入口是 `import * as wasm from "./imagequant_bg.wasm"`（Worker 里挂住）。
 * 所以 oxipng 用单线程 glue 子路径、imagequant 用 JS 胶水 + `public/codecs/` 里的 wasm
 * 手动实例化。
 *
 * 通信协议：主线程 `postMessage({ id, buffer, mime, quality })`（buffer 转移所有权），
 * Worker 回 `{ id, buffer, effectiveQuality }` 或 `{ id, error }`。
 */

import * as imagequantBindings from "imagequant/imagequant_bg.js";
import initOxipng, {
  optimise,
} from "@jsquash/oxipng/codec/pkg/squoosh_oxipng.js";
import encodeMozjpeg from "@jsquash/jpeg/encode.js";

/** oxipng 等级：1–6，超过 4 不推荐。量化后只需轻度优化，取 2。 */
const OXIPNG_LEVEL = 2;

/** 质量下限：再低就糊得没法看了。 */
const QUALITY_FLOOR = 0.5;
/** 每次重试降多少（和「继续压缩」的步长一致）。 */
const QUALITY_STEP = 0.05;
/** 最多重试几次（0.95 一路降到 0.5 大约 9 次）。 */
const MAX_ATTEMPTS = 10;

/** imagequant 的 wasm 在 `public/codecs/`（随发布包走）；升级依赖时要同步替换。 */
const IMAGEQUANT_WASM_URL = "/codecs/imagequant_bg.wasm";

type Mime = "image/jpeg" | "image/png";

interface CompressRequest {
  id: number;
  buffer: ArrayBuffer;
  mime: Mime;
  /** 0–1 的质量（滑杆值）。 */
  quality: number;
}

interface CompressResponse {
  id: number;
  buffer?: ArrayBuffer;
  /** 实际使用的质量（自动降档后可能比请求的低）。 */
  effectiveQuality?: number;
  error?: string;
}

const scope = self as unknown as DedicatedWorkerGlobalScope;

let oxipngReady: Promise<unknown> | null = null;
let imagequantReady: Promise<void> | null = null;

function ensureOxipng(): Promise<unknown> {
  if (!oxipngReady) oxipngReady = initOxipng();
  return oxipngReady;
}

/** 手动实例化 imagequant 的 wasm（只用到它导入的两个 wbindgen 函数）。 */
function ensureImagequant(): Promise<void> {
  if (!imagequantReady) {
    imagequantReady = (async () => {
      const response = await fetch(IMAGEQUANT_WASM_URL);
      if (!response.ok) {
        throw new Error(`量化引擎加载失败（HTTP ${response.status}）`);
      }
      const bytes = await response.arrayBuffer();
      const { instance } = await WebAssembly.instantiate(bytes, {
        "./imagequant_bg.js": {
          __wbindgen_error_new: imagequantBindings.__wbindgen_error_new,
          __wbindgen_throw: imagequantBindings.__wbindgen_throw,
        },
      });
      imagequantBindings.__wbg_set_wasm(instance.exports);
    })().catch((error: unknown) => {
      imagequantReady = null;
      throw error;
    });
  }
  return imagequantReady;
}

/** 把图片字节解码成 RGBA 像素（Worker 里用 OffscreenCanvas）。 */
async function decodeToPixels(buffer: ArrayBuffer, mime: Mime): Promise<ImageData> {
  // 显式按 EXIF 摆正：不写死方向的话，不同浏览器默认值不一样（Chrome 目前是 from-image），
  // 手机照片可能在结果里横躺、尺寸也和状态条对不上。
  const bitmap = await createImageBitmap(new Blob([buffer], { type: mime }), {
    imageOrientation: "from-image",
  });
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("拿不到 2d 上下文");
    ctx.drawImage(bitmap, 0, 0);
    return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}

/**
 * 滑杆质量 → 调色板颜色数（PNG）。
 *
 * 0.95 → 256 色（几乎看不出损失），0.5 → 16 色（明显可见的色块）。
 */
function colorsForQuality(quality: number): number {
  const clamped = Math.min(0.95, Math.max(QUALITY_FLOOR, quality));
  return Math.max(
    16,
    Math.min(256, Math.round(16 + ((clamped - 0.5) / 0.45) * 240)),
  );
}

/** JPG：mozjpeg 一次编码（渐进式 + 优化 Huffman）。 */
async function encodeJpegOnce(
  pixels: ImageData,
  quality: number,
): Promise<Uint8Array> {
  const buffer = await encodeMozjpeg(pixels, {
    quality: Math.round(quality * 100),
    progressive: true,
    optimize_coding: true,
  });
  return new Uint8Array(buffer);
}

/** PNG：调色板量化 + oxipng 收尾。 */
async function encodePngOnce(
  pixels: ImageData,
  quality: number,
): Promise<Uint8Array> {
  await ensureImagequant();

  const quantizer = new imagequantBindings.Imagequant();
  try {
    quantizer.set_max_colors(colorsForQuality(quality));
    quantizer.set_quality(0, Math.round(quality * 100));
    const image = new imagequantBindings.ImagequantImage(
      new Uint8Array(pixels.data.buffer),
      pixels.width,
      pixels.height,
      0,
    );
    const quantized = quantizer.process(image);

    await ensureOxipng();
    const optimized = optimise(
      new Uint8Array(quantized),
      OXIPNG_LEVEL,
      false,
      false,
    );
    return new Uint8Array(optimized);
  } finally {
    quantizer.free();
  }
}

/**
 * 编码并保证「至少比原图小」：从请求的质量开始，没变小就降一档重试。
 *
 * 返回实际使用的质量；`notSmaller` 表示连 50% 都压不小（理论上极少见）。
 */
async function compressWithFloor(
  encodeOnce: (quality: number) => Promise<Uint8Array>,
  originalSize: number,
  requestedQuality: number,
): Promise<{ bytes: Uint8Array; effectiveQuality: number }> {
  let quality = Math.min(0.95, Math.max(QUALITY_FLOOR, requestedQuality));
  let bytes = await encodeOnce(quality);
  let attempts = 1;

  while (bytes.byteLength >= originalSize && quality > QUALITY_FLOOR) {
    if (attempts >= MAX_ATTEMPTS) break;
    quality = Math.max(
      QUALITY_FLOOR,
      Math.round((quality - QUALITY_STEP) * 100) / 100,
    );
    bytes = await encodeOnce(quality);
    attempts += 1;
  }

  return { bytes, effectiveQuality: quality };
}

scope.onmessage = async (event: MessageEvent<CompressRequest>) => {
  const { id, buffer, mime, quality } = event.data;
  try {
    const originalSize = buffer.byteLength;
    const pixels = await decodeToPixels(buffer, mime);

    const { bytes, effectiveQuality } = await compressWithFloor(
      (q) =>
        mime === "image/png" ? encodePngOnce(pixels, q) : encodeJpegOnce(pixels, q),
      originalSize,
      quality,
    );

    const result = new Uint8Array(bytes).buffer;
    const response: CompressResponse = { id, buffer: result, effectiveQuality };
    scope.postMessage(response, [result]);
  } catch (error) {
    const response: CompressResponse = {
      id,
      error: error instanceof Error ? error.message : String(error),
    };
    scope.postMessage(response);
  }
};
