import type { Metadata } from "next";
import { Space_Grotesk } from "next/font/google";
import { AuthProvider } from "@/contexts/AuthContext";
import BackgroundEffect from "@/components/layout/BackgroundEffect";
import "./globals.css";
import "./todo/global.css";
// 인라인 에디터 라인 상태 토큰 — todo/global.css 의 `.detail textarea` 를 이겨야 하므로 뒤에 로드한다.
import "@/components/editor/inline/editor-tokens.css";

const spaceGrotesk = Space_Grotesk({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "TODO",
  description: "Standalone todo frontend",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body
        className={`${spaceGrotesk.className} min-h-screen bg-black text-white antialiased selection:bg-[#3994ef] selection:text-white`}
      >
        <BackgroundEffect />
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
