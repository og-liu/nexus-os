import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";
import { Footer } from "@/components/footer";

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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="zh-CN"
      className={`${sekuya.variable} ${notoSansSC.variable} ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="h-full bg-[#F5F7FA]">
        <div className="flex h-screen">
          <Sidebar />
          <div className="flex flex-1 flex-col overflow-hidden">
            <main className="flex-1 overflow-y-auto bg-[#ECECEC]">
              {children}
            </main>
            <Footer />
          </div>
        </div>
      </body>
    </html>
  );
}
