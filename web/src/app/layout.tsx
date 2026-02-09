import type { Metadata } from "next";
import "../styles/globals.css";

export const metadata: Metadata = {
  title: "Anima Companion Web",
  description: "Web MVP for anime companion with chat, voice and 3D avatar."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
