import type { Metadata } from "next";
import { DM_Mono, DM_Serif_Display, Manrope } from "next/font/google";
import { AppShell } from "@/components/layout/AppShell";
import { KioskModeProvider } from "@/components/layout/KioskModeProvider";
import { ToastProvider } from "@/components/ui/Toast";
import "./globals.css";

const dmSerif = DM_Serif_Display({
  subsets: ["latin"],
  variable: "--font-dm-serif",
  display: "swap",
  weight: "400",
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

const dmMono = DM_Mono({
  subsets: ["latin"],
  variable: "--font-dm-mono",
  display: "swap",
  weight: ["300", "400", "500"],
});

export const metadata: Metadata = {
  title: "WRAPZ POS",
  description: "Single-day event POS — Wisuda ITB Apr 2026",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="id"
      className={`${dmSerif.variable} ${manrope.variable} ${dmMono.variable}`}
    >
      <body className="min-h-screen bg-brand-bg font-sans text-brand-text antialiased">
        <ToastProvider>
          <KioskModeProvider>
            <AppShell>{children}</AppShell>
          </KioskModeProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
