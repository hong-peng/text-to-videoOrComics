import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI 短剧生成平台",
  description: "将小说自动转化为短剧剧本与分镜脚本",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" className="h-full">
      <body className="min-h-full bg-zinc-950 text-zinc-100 antialiased">
        {children}
      </body>
    </html>
  );
}
