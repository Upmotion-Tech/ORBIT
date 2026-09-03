"use client";

// Decides what to render at the root of the app: the auth-checking splash,
// the login screen, the mandatory change-password screen, or the real app
// (children). Mirrors renderVals()' authChecking/showLogin/mustChangePassword
// gating in the original script.js, minus the pre-hydration "boot cover"
// flash workaround (a fix for the old runtime's raw-template-swap; Next.js's
// SSR already renders the authChecking splash consistently on first paint,
// so there's nothing analogous to flash).

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { AppDataProvider } from "@/lib/app-data-context";
import Shell from "@/components/shell/Shell";
import LoginScreen from "./LoginScreen";
import ChangePasswordScreen from "./ChangePasswordScreen";

// The backend sleeps after a period of inactivity (Render spins the instance
// down), so the first request after a quiet spell can sit for 30-60s while it
// cold-starts. This splash used to show a bare "ORBIT" wordmark for that whole
// time, which reads as a frozen app rather than a server waking up — and the
// natural user response to that is to refresh, which achieves nothing and
// restarts the wait.
//
// The message is deliberately DELAYED rather than shown immediately: when the
// backend is already warm, checkAuth resolves in well under a second, and
// flashing "waking up the server" on every ordinary load would be both
// inaccurate and alarming. It only appears once the wait is long enough to
// actually need explaining.
const COLD_START_HINT_MS = 2500;

function AuthSplash() {
  const [showColdStartHint, setShowColdStartHint] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setShowColdStartHint(true), COLD_START_HINT_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="auth-splash-screen">
      <div className="auth-splash-logo">ORBIT</div>
      {showColdStartHint && (
        // role/aria-live so a screen reader announces this when it appears,
        // rather than it being a silent visual-only change.
        <div role="status" aria-live="polite" style={{ textAlign: "center", maxWidth: 340, padding: "0 20px" }}>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 600, color: "#1B2233" }}>
            Waking up the server…
          </div>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: 12.5, lineHeight: 1.5, color: "#6A7285", marginTop: 6 }}>
            The server goes to sleep after a period of inactivity. This can take
            up to a minute — no need to refresh.
          </div>
        </div>
      )}
    </div>
  );
}

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { authChecking, currentUser, mustChangePassword, sessionToast, dismissSessionToast } = useAuth();

  if (authChecking) return <AuthSplash />;
  if (!currentUser) return <LoginScreen />;
  if (mustChangePassword) return <ChangePasswordScreen />;

  return (
    <AppDataProvider>
      <Shell>{children}</Shell>
      {sessionToast && (
        <div
          role="status"
          style={{
            position: "fixed",
            bottom: 20,
            left: "50%",
            transform: "translateX(-50%)",
            background: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
            boxShadow: "var(--shadow-popover)",
            borderRadius: "var(--radius-md)",
            padding: "12px 20px",
            fontFamily: "var(--font-sans)",
            fontSize: 13.5,
            color: "var(--text-primary)",
            zIndex: 2000,
          }}
        >
          {sessionToast}
          <button
            onClick={dismissSessionToast}
            style={{ marginLeft: 12, background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }}
          >
            Dismiss
          </button>
        </div>
      )}
    </AppDataProvider>
  );
}
