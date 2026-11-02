declare module "@ffmpeg-installer/ffmpeg" {
  /** 二进制在本机的绝对路径（随平台子包发布，构建产物里也有一份）。 */
  export const path: string;
  export const version: string;
  export const url: string;
}
