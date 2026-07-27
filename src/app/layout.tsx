import type { Metadata } from "next";
import { AuthProvider } from "@/contexts/AuthContext";
import "./globals.css";
import "./todo/global.css";
// 인라인 에디터 라인 상태 토큰 — todo/global.css 의 `.detail textarea` 를 이겨야 하므로 뒤에 로드한다.
import "@/components/editor/inline/editor-tokens.css";

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
      {/* 폰트는 원본(todo-next :3030)의 Arial 스택 — todo/global.css body 규칙이 적용된다. 다크 배경은 유지. */}
      <body
        className="min-h-screen bg-black text-white antialiased selection:bg-[#3994ef] selection:text-white"
      >
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
