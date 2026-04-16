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

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-brand-text/40"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div
        className={`relative z-10 w-full rounded-xl border border-brand-text/10 bg-white p-5 shadow-lg ${
          size === "wide" ? "max-w-4xl" : "max-w-lg"
        }`}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2
            id="modal-title"
            className="font-sans text-xl font-bold tracking-tight text-brand-text"
          >
            {title}
          </h2>
          <Button variant="ghost" className="shrink-0 px-2 py-1 text-lg" onClick={onClose}>
            ×
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}
