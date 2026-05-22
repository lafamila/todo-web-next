import type { Metadata } from "next";
import { Space_Grotesk } from "next/font/google";
import { AuthProvider } from "@/contexts/AuthContext";
import BackgroundEffect from "@/components/layout/BackgroundEffect";
import "./globals.css";

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
