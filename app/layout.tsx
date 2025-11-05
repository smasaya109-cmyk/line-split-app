// app/layout.tsx
import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "みんなで割り勘",
  description: "LINE連携でサクッと割り勘＆自動精算",
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
    other: [
      { rel: "icon", url: "/app-icon-192.png", sizes: "192x192" },
      { rel: "icon", url: "/app-icon-512.png", sizes: "512x512" },
    ],
  },
  openGraph: {
    title: "みんなで割り勘",
    description: "LINE連携でサクッと割り勘＆自動精算",
    url: "https://line-split.vercel.app/",
    siteName: "みんなで割り勘",
    images: [{ url: "/card.png", width: 1200, height: 780 }],
    locale: "ja_JP",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "みんなで割り勘",
    description: "LINE連携でサクッと割り勘＆自動精算",
    images: ["/card.png"],
  },
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}

