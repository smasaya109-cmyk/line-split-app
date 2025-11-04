import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// app/layout.tsx
export const metadata = {
  title: "みんなで割り勘",
  description: "LINE連携でサクッと割り勘＆自動精算",
  metadataBase: new URL("https://line-split.vercel.app"),
  openGraph: {
    title: "みんなで割り勘",
    description: "LINE連携でサクッと割り勘＆自動精算",
    url: "https://line-split.vercel.app",
    siteName: "みんなで割り勘",
    images: ["/og.png"], // public/og.png に 1200x630 の画像を置くと綺麗
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "みんなで割り勘",
    description: "LINE連携でサクッと割り勘＆自動精算",
    images: ["/og.png"],
  },
};


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
