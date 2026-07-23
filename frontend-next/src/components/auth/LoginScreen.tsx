"use client";

// Pixel-matched port of the `showLogin` block in unpacked/template.html
// (lines 1996-2024) — same class names (.login-screen/.login-card/...),
// which already carry the full "Light Glassmorphism" styling ported into
// globals.css. Markup/copy kept verbatim; only the templating syntax
// ({{ }}, sc-if, sc-camel-on-*) is translated to real JSX/React.

import { useAuth } from "@/lib/auth-context";

export default function LoginScreen() {
  const {
    loginEmail,
    loginPassword,
    loginLoading,
    loginError,
    setLoginEmail,
    setLoginPassword,
    handleLogin,
  } = useAuth();

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleLogin();
  };

  return (
    <div className="login-screen">
      <div className="login-card" onKeyDown={onKeyDown}>
        <div className="login-logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/orbit-logo.png"
            alt="ORBIT logo"
            style={{ width: 52, height: 52, flexShrink: 0, display: "block" }}
          />
          ORBIT
        </div>
        <div className="login-tagline">Operational Revenue &amp; Business Intelligence</div>
        <div className="login-powered-by">Powered by Upmotion Tech</div>
        <div className="login-subtitle">Sign in to your account</div>

        {loginError && <div className="login-error">{loginError}</div>}

        <div className="login-input-wrap">
          <span className="login-input-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
            </svg>
          </span>
          <input
            type="email"
            className="login-input"
            placeholder="Email"
            value={loginEmail}
            onChange={(e) => setLoginEmail(e.target.value)}
          />
        </div>
        <div className="login-input-wrap">
          <span className="login-input-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </span>
          <input
            type="password"
            className="login-input"
            placeholder="Password"
            value={loginPassword}
            onChange={(e) => setLoginPassword(e.target.value)}
          />
        </div>
        <button className="login-btn" disabled={loginLoading} onClick={handleLogin}>
          {loginLoading ? "Signing in..." : "Sign in"}
        </button>
      </div>
    </div>
  );
}
