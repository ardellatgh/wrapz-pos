import type { Metadata } from "next";
import { Bebas_Neue, DM_Sans } from "next/font/google";
import { AppShell } from "@/components/layout/AppShell";
import { KioskModeProvider } from "@/components/layout/KioskModeProvider";
import { ToastProvider } from "@/components/ui/Toast";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const bebasNeue = Bebas_Neue({
  subsets: ["latin"],
  variable: "--font-bebas-neue",
  display: "swap",
  weight: "400",
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
    <html lang="id" className={`${dmSans.variable} ${bebasNeue.variable}`}>
      <body className="min-h-screen bg-brand-bg font-sans text-[14px] leading-normal text-brand-text antialiased">
        <ToastProvider>
          <KioskModeProvider>
            <AppShell>{children}</AppShell>
          </KioskModeProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
