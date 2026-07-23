"use client";

// Port of the global toast container (template.html:2485-2499). Fixed
// bottom-right stack, rendered at root so it floats above every screen.

import { useToast } from "@/lib/toast-context";
import { Icon } from "@/design-system/healer-bundle";

export default function ToastContainer() {
  const { toasts, dismissToast } = useToast();
  if (toasts.length === 0) return null;

  return (
    <div style={{ position: "fixed", right: 24, bottom: 24, zIndex: 1200, display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-end" }}>
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={"crm-toast" + (toast.closing ? " orbit-closing" : "")}
          style={{
            display: "flex", alignItems: "center", gap: 12, background: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)", borderLeft: "4px solid " + toast.accent,
            boxShadow: "var(--shadow-modal)", borderRadius: 12, padding: "14px 16px", fontSize: 14,
            fontWeight: 600, color: "var(--text-primary)", maxWidth: 380, minWidth: 280,
          }}
        >
          <div style={{ width: 30, height: 30, borderRadius: 9999, background: toast.iconBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Icon name={toast.icon} size={17} color={toast.accent} />
          </div>
          <span style={{ flex: 1, lineHeight: 1.4 }}>{toast.text}</span>
          <button
            onClick={() => dismissToast(toast.id)}
            aria-label="Dismiss"
            style={{ background: "none", border: "none", cursor: "pointer", padding: 2, lineHeight: 0, flexShrink: 0, opacity: 0.45, color: "var(--text-muted)" }}
          >
            <Icon name="x" size={15} color="currentColor" />
          </button>
        </div>
      ))}
    </div>
  );
}
