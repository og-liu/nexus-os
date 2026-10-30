/**
 * `imagequant` 的 wasm-bindgen 胶水（`imagequant_bg.js`）没有类型声明。
 *
 * 我们只用它来做「手动实例化」：`public/codecs/imagequant_bg.wasm` 在 Worker 里
 * 自己 fetch + instantiate，再把 exports 交给 `__wbg_set_wasm`——不走包入口
 * （包入口是 `import * as wasm from "./imagequant_bg.wasm"`，打包器在 Worker 里
 * 解析这种 wasm 模块会挂住，实测点了「开始压缩」永远停在压缩中）。
 *
 * 只声明实际用到的成员，多余的能力不暴露。
 */
declare module "imagequant/imagequant_bg.js" {
  export function __wbg_set_wasm(value: WebAssembly.Exports): void;
  export function __wbindgen_error_new(arg0: number, arg1: number): Error;
  export function __wbindgen_throw(arg0: number, arg1: number): never;

  export class Imagequant {
    constructor();
    set_max_colors(maxColors: number): void;
    set_quality(minimum: number, target: number): void;
    process(image: ImagequantImage): Uint8Array;
    free(): void;
  }

  export class ImagequantImage {
    constructor(data: Uint8Array, width: number, height: number, gamma: number);
  }
}
