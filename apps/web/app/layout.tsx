import type { Metadata, Viewport } from "next";
import Script from "next/script";
import type { ReactNode } from "react";
import { ToastProvider } from "@/components/admin/toast";
import { AuthGate } from "@/components/auth/auth-gate";
import { AuthProvider } from "@/components/auth/auth-provider";
import { ModelConfigProvider } from "@/components/model-config/model-config-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "PiChat · 企业知识库 Agent",
  description: "基于权限范围的企业知识库对话 Agent",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f8fb" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1120" },
  ],
};

const themeScript = `try{var stored=localStorage.getItem("pichat-theme");var dark=stored?stored==="dark":window.matchMedia("(prefers-color-scheme: dark)").matches;var root=document.documentElement;root.classList.toggle("dark",dark);root.style.colorScheme=dark?"dark":"light";}catch(error){}`;

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        <Script id="pichat-theme" strategy="beforeInteractive">
          {themeScript}
        </Script>
        <ToastProvider>
          <ModelConfigProvider>
            <AuthProvider>
              <AuthGate>{children}</AuthGate>
            </AuthProvider>
          </ModelConfigProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
