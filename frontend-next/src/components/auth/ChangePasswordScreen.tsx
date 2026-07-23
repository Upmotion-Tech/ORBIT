"use client";

// Port of the `mustChangePassword` block in unpacked/template.html
// (lines 2026-2059) — mandatory password change on first login / after an
// HR/Owner reset.

import { useAuth } from "@/lib/auth-context";

function LockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

export default function ChangePasswordScreen() {
  const {
    changePasswordCurrent,
    changePasswordNew,
    changePasswordConfirm,
    changePasswordLoading,
    changePasswordError,
    setChangePasswordCurrent,
    setChangePasswordNew,
    setChangePasswordConfirm,
    handleChangePassword,
    handleLogout,
  } = useAuth();

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleChangePassword();
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
        <div className="login-subtitle">
          Your password was set by HR/Owner. Choose a new password of your own before continuing.
        </div>

        {changePasswordError && <div className="login-error">{changePasswordError}</div>}

        <div className="login-input-wrap">
          <span className="login-input-icon"><LockIcon /></span>
          <input
            type="password"
            className="login-input"
            placeholder="Current (temporary) password"
            value={changePasswordCurrent}
            onChange={(e) => setChangePasswordCurrent(e.target.value)}
          />
        </div>
        <div className="login-input-wrap">
          <span className="login-input-icon"><LockIcon /></span>
          <input
            type="password"
            className="login-input"
            placeholder="New password"
            value={changePasswordNew}
            onChange={(e) => setChangePasswordNew(e.target.value)}
          />
        </div>
        <div className="login-input-wrap">
          <span className="login-input-icon"><LockIcon /></span>
          <input
            type="password"
            className="login-input"
            placeholder="Confirm new password"
            value={changePasswordConfirm}
            onChange={(e) => setChangePasswordConfirm(e.target.value)}
          />
        </div>
        <button className="login-btn" disabled={changePasswordLoading} onClick={handleChangePassword}>
          {changePasswordLoading ? "Updating..." : "Set new password"}
        </button>
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            handleLogout();
          }}
          style={{ textAlign: "center", fontSize: 12.5, color: "var(--text-muted)", textDecoration: "none", marginTop: 2 }}
        >
          Sign out instead
        </a>
      </div>
    </div>
  );
}
