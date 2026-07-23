"use client";

// Port of pushCrmToast/dismissCrmToast + TOAST_TONE_META from script.js
// (lines 1034-1038, 3371-3387). Same timing: auto-dismiss after 3800ms,
// "closing" state held for 220ms before actual removal so the CSS
// slide/fade-out animation has time to play.

import { createContext, useCallback, useContext, useState } from "react";

const TOAST_TONE_META: Record<string, { icon: string; accent: string; iconBg: string }> = {
  success: { icon: "circle-check", accent: "var(--status-success-text)", iconBg: "var(--status-success-bg)" },
  error: { icon: "circle-x", accent: "var(--status-danger-text)", iconBg: "var(--status-danger-bg)" },
  warning: { icon: "triangle-alert", accent: "var(--status-warning-text)", iconBg: "var(--status-warning-bg)" },
};

export type CrmToast = {
  id: string;
  text: string;
  closing: boolean;
  icon: string;
  accent: string;
  iconBg: string;
};

type ToastContextValue = {
  toasts: CrmToast[];
  pushToast: (text: string, tone?: "success" | "error" | "warning") => void;
  dismissToast: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<CrmToast[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((cur) => cur.map((t) => (t.id === id ? { ...t, closing: true } : t)));
    setTimeout(() => {
      setToasts((cur) => cur.filter((t) => t.id !== id));
    }, 220);
  }, []);

  const pushToast = useCallback(
    (text: string, tone: "success" | "error" | "warning" = "success") => {
      const id = "toast" + Date.now() + Math.random().toString(36).slice(2, 7);
      const meta = TOAST_TONE_META[tone] || TOAST_TONE_META.success;
      setToasts((cur) => [...cur, { id, text, closing: false, ...meta }]);
      setTimeout(() => dismissToast(id), 3800);
    },
    [dismissToast]
  );

  return (
    <ToastContext.Provider value={{ toasts, pushToast, dismissToast }}>
      {children}
    </ToastContext.Provider>
  );
}
