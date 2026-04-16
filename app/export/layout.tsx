import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Backup & Export — WRAPZ POS",
};

export default function ExportLayout({ children }: { children: ReactNode }) {
  return children;
}
