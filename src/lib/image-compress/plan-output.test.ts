import { describe, expect, it } from "vitest";
import {
  isGif,
  isSupportedImage,
  outputFilename,
  planOutput,
  resolveFormat,
  sourceMime,
} from "./plan-output";

const jpegSource = { type: "image/jpeg", width: 4000, height: 3000 };
const pngSource = { type: "image/png", width: 4000, height: 3000 };
const pngSmall = { type: "image/png", width: 800, height: 600 };

describe("resolveFormat（输出格式：不换格式）", () => {
  it("JPG 进 → JPG 出", () => {
    expect(resolveFormat("image/jpeg")).toBe("jpeg");
  });

  it("PNG 进 → PNG 出（透明不透明都一样，走 oxipng 无损优化）", () => {
    expect(resolveFormat("image/png")).toBe("png");
  });

  it("白名单外的类型（理论上进不来）按 JPG 兜底", () => {
    expect(resolveFormat("image/bmp")).toBe("jpeg");
    expect(resolveFormat("")).toBe("jpeg");
  });
});

describe("planOutput（输出方案）", () => {
  it("JPG：质量生效，格式与扩展名为 jpg，尺寸保持原图", () => {
    const plan = planOutput(jpegSource);
    expect(plan.format).toBe("jpeg");
    expect(plan.mime).toBe("image/jpeg");
    expect(plan.extension).toBe("jpg");
    expect(plan.label).toBe("JPG");
    expect(plan.width).toBe(4000);
    expect(plan.height).toBe(3000);
  });

  it("PNG：输出仍是 PNG（含透明），质量控制调色板颜色数，尺寸保持原图", () => {
    const plan = planOutput(pngSource);
    expect(plan.format).toBe("png");
    expect(plan.mime).toBe("image/png");
    expect(plan.extension).toBe("png");
    expect(plan.label).toBe("PNG");
    expect(plan.width).toBe(4000);
    expect(plan.height).toBe(3000);
  });

  it("小 PNG：尺寸也保持原图（不缩放、不放大）", () => {
    const plan = planOutput(pngSmall);
    expect(plan.width).toBe(800);
    expect(plan.height).toBe(600);
  });

});

describe("isSupportedImage（输入白名单：只收 JPG / JPEG / PNG）", () => {
  it("JPG / JPEG / PNG 放行（MIME 或扩展名任一命中）", () => {
    expect(isSupportedImage("photo.jpg", "image/jpeg")).toBe(true);
    expect(isSupportedImage("PHOTO.JPG", "image/jpeg")).toBe(true);
    expect(isSupportedImage("scan.jpeg", "image/jpeg")).toBe(true);
    expect(isSupportedImage("logo.png", "image/png")).toBe(true);
    // 拖拽路径下 File.type 可能是空串，靠扩展名放行
    expect(isSupportedImage("photo.jpg", "")).toBe(true);
    expect(isSupportedImage("logo.png", "")).toBe(true);
  });

  it("WebP / GIF / HEIC / BMP / txt 一律拒绝", () => {
    expect(isSupportedImage("a.webp", "image/webp")).toBe(false);
    expect(isSupportedImage("a.gif", "image/gif")).toBe(false);
    expect(isSupportedImage("a.heic", "image/heic")).toBe(false);
    expect(isSupportedImage("a.bmp", "image/bmp")).toBe(false);
    expect(isSupportedImage("a.txt", "text/plain")).toBe(false);
    expect(isSupportedImage("没有扩展名", "image/jpeg")).toBe(true);
  });
});

describe("sourceMime（归一化源图 MIME）", () => {
  it("MIME 已经正确时原样返回", () => {
    expect(sourceMime("a.png", "image/png")).toBe("image/png");
    expect(sourceMime("a.jpg", "image/jpeg")).toBe("image/jpeg");
  });

  it("MIME 为空时按扩展名补：.png → image/png，其余 → image/jpeg", () => {
    expect(sourceMime("a.png", "")).toBe("image/png");
    expect(sourceMime("a.PNG", "")).toBe("image/png");
    expect(sourceMime("a.jpg", "")).toBe("image/jpeg");
    expect(sourceMime("a.jpeg", "")).toBe("image/jpeg");
  });
});

describe("isGif（动图拒绝）", () => {
  it("MIME 是 image/gif 就拒绝，扩展名大小写都认", () => {
    expect(isGif("a.gif", "image/gif")).toBe(true);
    expect(isGif("A.GIF", "image/gif")).toBe(true);
  });

  it("只凭扩展名也拒绝（有些系统给不出 MIME）", () => {
    expect(isGif("动图.gif", "")).toBe(true);
  });

  it("JPG / PNG / WebP 不误判", () => {
    expect(isGif("photo.jpg", "image/jpeg")).toBe(false);
    expect(isGif("shot.png", "image/png")).toBe(false);
    expect(isGif("logo.webp", "image/webp")).toBe(false);
  });
});

describe("outputFilename（下载文件名）", () => {
  it("去掉原扩展名，加上 -compressed 与新扩展名", () => {
    expect(outputFilename("photo.JPG", "jpg")).toBe("photo-compressed.jpg");
    expect(outputFilename("截图 2026-10-30 10.00.00.png", "webp")).toBe(
      "截图 2026-10-30 10.00.00-compressed.webp",
    );
  });

  it("没有扩展名（或以点开头）时整串当名字", () => {
    expect(outputFilename("photo", "png")).toBe("photo-compressed.png");
    expect(outputFilename(".env", "png")).toBe(".env-compressed.png");
  });
});
