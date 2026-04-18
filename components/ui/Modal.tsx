"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { Button } from "./Button";

type ModalProps = {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  /** Wider panel for dense tables (e.g. bulk stock forms). */
  size?: "default" | "wide";
};

export function Modal({ open, title, children, onClose, size = "default" }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  if (!open) return null;

  const panelMax =
    size === "wide"
      ? "max-w-4xl max-h-[min(92dvh,920px)]"
      : "max-w-lg max-h-[min(92dvh,820px)]";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overscroll-contain p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <button
        type="button"
        className="fixed inset-0 bg-brand-text/40"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div
        className={`relative z-10 my-auto flex min-h-0 w-full flex-col overflow-hidden rounded-ref border border-brand-text/10 bg-white shadow-lift ${panelMax}`}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-brand-text/8 px-4 pb-3 pt-4 sm:px-5 sm:pt-5">
          <h2
            id="modal-title"
            className="min-w-0 font-display text-xl font-normal uppercase tracking-wide text-brand-yellow sm:text-2xl"
          >
            {title}
          </h2>
          <Button variant="ghost" className="shrink-0 px-2 py-1 text-lg leading-none" onClick={onClose}>
            ×
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 py-4 [-webkit-overflow-scrolling:touch] sm:px-5 sm:pb-5">
          {children}
        </div>
      </div>
    </div>
  );
}
