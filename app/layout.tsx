import type { Metadata } from "next";
import { Barlow_Condensed, DM_Mono, Manrope } from "next/font/google";
import { AppShell } from "@/components/layout/AppShell";
import { KioskModeProvider } from "@/components/layout/KioskModeProvider";
import { ToastProvider } from "@/components/ui/Toast";
import "./globals.css";

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

const barlowCondensed = Barlow_Condensed({
  subsets: ["latin"],
  variable: "--font-barlow-condensed",
  display: "swap",
  weight: ["500", "600", "700"],
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
    <html lang="id" className={`${manrope.variable} ${dmMono.variable} ${barlowCondensed.variable}`}>
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
