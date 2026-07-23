"use client";

// Decides what to render at the root of the app: the auth-checking splash,
// the login screen, the mandatory change-password screen, or the real app
// (children). Mirrors renderVals()' authChecking/showLogin/mustChangePassword
// gating in the original script.js, minus the pre-hydration "boot cover"
// flash workaround (a fix for the old runtime's raw-template-swap; Next.js's
// SSR already renders the authChecking splash consistently on first paint,
// so there's nothing analogous to flash).

import { useAuth } from "@/lib/auth-context";
import { AppDataProvider } from "@/lib/app-data-context";
import Shell from "@/components/shell/Shell";
import LoginScreen from "./LoginScreen";
import ChangePasswordScreen from "./ChangePasswordScreen";

function AuthSplash() {
  return (
    <div className="auth-splash-screen">
      <div className="auth-splash-logo">ORBIT</div>
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
