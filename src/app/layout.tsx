import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

// 中文正文用**系统字体**（苹方 / 微软雅黑 / 思源），见《界面设计规范》§4.1。
// 原来自托管的 NotoSansSC 是 17MB 的 TTF：服务器上行 3Mbps，首屏下载要 45 秒，
// 每次部署 hash 一变又要重下——2026-11-04 换成系统字体，加载成本归零。

// 品牌名专用装饰字体，仅用于「NEXUS OS」字样
const sekuya = localFont({
  src: "../fonts/Sekuya-Regular.ttf",
  variable: "--font-sekuya",
  display: "swap",
});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Nexus OS",
    template: "%s · Nexus OS",
  },
  description:
    "面向个人用户的智能工作空间，整合工具、自动化、知识管理与 AI Agent 能力",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="zh-CN"
      className={`${sekuya.variable} ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="h-full bg-[#F5F7FA]">{children}</body>
    </html>
  );
}
