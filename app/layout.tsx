import type { Metadata } from "next";
import "./globals.css";
import "./viewport-layout.css";

export const metadata: Metadata = {
  title: "仙途 · 青石人间",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "仙途", statusBarStyle: "default" },
  description: "从青石坊市出发，在相识、修行与约定中，走过你自己的修仙人生。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/icon-192.png",
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
