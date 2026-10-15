import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nexus OS",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="h-full">{children}</body>
    </html>
  );
}
