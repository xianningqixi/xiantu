import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "仙途 · 青石人间",
  description: "从青石坊市出发，在相识、修行与约定中，走过你自己的修仙人生。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
