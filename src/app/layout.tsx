import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import { AppShell } from "@/components/app-shell";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const notoSansSC = localFont({
  src: "../fonts/NotoSansSC-Variable.ttf",
  variable: "--font-noto-sans-sc",
  display: "swap",
});

const sekuya = localFont({
  src: "../fonts/Sekuya-Regular.ttf",
  variable: "--font-sekuya",
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Nexus OS",
  description:
    "面向个人用户的智能工作空间，整合工具、自动化、知识管理与 AI Agent 能力",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="zh-CN"
      className={`${sekuya.variable} ${notoSansSC.variable} ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="h-full bg-[#F5F7FA]">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
