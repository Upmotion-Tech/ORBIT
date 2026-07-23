"use client";

// Ported from unpacked/script.js's checkAuth/onAuthenticated/handleLogin/
// handleChangePassword/handleLogout (componentDidMount + related handlers).
// Same behavior: validate whatever token is in localStorage against
// /api/auth/me on mount (with retry/backoff for transient failures, e.g. a
// free-tier backend cold start), never trust a client-decoded token.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  apiFetch,
  apiErrorMessage,
  setOnSessionExpired,
  derivePersonaFlavor,
  deriveLandingFromAccess,
  mergeAccess,
  readStoredScreen,
  readStoredCrmView,
} from "@/lib/orbit-client";

export type OrbitUser = {
  id: string;
  name: string;
  email: string;
  department?: string | null;
  access_levels?: string[];
  access_level?: string; // derived persona flavor, added client-side
  must_change_password?: boolean;
  [key: string]: unknown;
};

type AuthState = {
  authChecking: boolean;
  currentUser: OrbitUser | null;
  mustChangePassword: boolean;
  loginEmail: string;
  loginPassword: string;
  loginLoading: boolean;
  loginError: string | null;
  changePasswordCurrent: string;
  changePasswordNew: string;
  changePasswordConfirm: string;
  changePasswordLoading: boolean;
  changePasswordError: string | null;
  sessionToast: string | null;
};

type AuthContextValue = AuthState & {
  setLoginEmail: (v: string) => void;
  setLoginPassword: (v: string) => void;
  handleLogin: () => void;
  setChangePasswordCurrent: (v: string) => void;
  setChangePasswordNew: (v: string) => void;
  setChangePasswordConfirm: (v: string) => void;
  handleChangePassword: () => void;
  handleLogout: () => void;
  dismissSessionToast: () => void;
  landingScreen: string;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authChecking, setAuthChecking] = useState(true);
  const [currentUser, setCurrentUser] = useState<OrbitUser | null>(null);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [loginEmail, setLoginEmailState] = useState("");
  const [loginPassword, setLoginPasswordState] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [changePasswordCurrent, setChangePasswordCurrentState] = useState("");
  const [changePasswordNew, setChangePasswordNewState] = useState("");
  const [changePasswordConfirm, setChangePasswordConfirmState] = useState("");
  const [changePasswordLoading, setChangePasswordLoading] = useState(false);
  const [changePasswordError, setChangePasswordError] = useState<string | null>(null);
  const [sessionToast, setSessionToast] = useState<string | null>(null);
  const [landingScreen, setLandingScreen] = useState("dashboard");

  const onAuthenticated = useCallback((user: OrbitUser) => {
    user.access_level = derivePersonaFlavor(user.access_levels);
    const landing = deriveLandingFromAccess(mergeAccess(user.access_levels));
    const needsPasswordChange = !!user.must_change_password;
    setCurrentUser(user);
    setAuthChecking(false);
    setMustChangePassword(needsPasswordChange);
    setLandingScreen(readStoredScreen(landing));
    // crm sub-view pref read here to mirror the original bootAppData timing;
    // consumed later once the CRM screen itself is ported.
    readStoredCrmView(user.id, "kanban");
  }, []);

  const checkAuthRef = useRef<(attempt?: number) => void>(() => {});
  checkAuthRef.current = (attempt = 1) => {
    const token = localStorage.getItem("orbit_token");
    if (!token) {
      setAuthChecking(false);
      return;
    }
    apiFetch("/api/auth/me", { skipAuthExpiry: true } as RequestInit & { skipAuthExpiry: boolean }).then(
      (user: OrbitUser) => onAuthenticated(user),
      (err: Error) => {
        if (err.message !== "Session expired" && attempt < 4) {
          setTimeout(() => checkAuthRef.current(attempt + 1), 1200 * attempt);
          return;
        }
        localStorage.removeItem("orbit_token");
        setAuthChecking(false);
      }
    );
  };

  useEffect(() => {
    setOnSessionExpired((message: string | null) => {
      // handleSessionExpired: only a real, already-logged-in session's
      // expiry shows the toast — a bad-credentials 401 on the login screen
      // itself is handled separately by handleLogin's own error path.
      setCurrentUser((prev) => {
        if (!prev) return prev;
        setMustChangePassword(false);
        setSessionToast(message || "Your session expired. Please sign in again.");
        return null;
      });
    });
    checkAuthRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setLoginEmail = (v: string) => {
    setLoginEmailState(v);
    setLoginError(null);
  };
  const setLoginPassword = (v: string) => {
    setLoginPasswordState(v);
    setLoginError(null);
  };

  const handleLogin = () => {
    if (loginLoading) return;
    const email = loginEmail.trim();
    const password = loginPassword;
    if (!email || !password) {
      setLoginError("Enter your email and password.");
      return;
    }
    setLoginLoading(true);
    setLoginError(null);
    apiFetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    }).then(
      (res: { access_token: string; user: OrbitUser }) => {
        localStorage.setItem("orbit_token", res.access_token);
        setLoginLoading(false);
        setLoginEmailState("");
        setLoginPasswordState("");
        onAuthenticated(res.user);
      },
      (err: Error) => {
        setLoginLoading(false);
        setLoginError(err.message || "Invalid email or password.");
      }
    );
  };

  const setChangePasswordCurrent = (v: string) => {
    setChangePasswordCurrentState(v);
    setChangePasswordError(null);
  };
  const setChangePasswordNew = (v: string) => {
    setChangePasswordNewState(v);
    setChangePasswordError(null);
  };
  const setChangePasswordConfirm = (v: string) => {
    setChangePasswordConfirmState(v);
    setChangePasswordError(null);
  };

  const handleChangePassword = () => {
    if (changePasswordLoading) return;
    const current = changePasswordCurrent;
    const next = changePasswordNew;
    const confirm = changePasswordConfirm;
    if (!current || !next || !confirm) {
      setChangePasswordError("Fill in all three fields.");
      return;
    }
    if (next.length < 6) {
      setChangePasswordError("New password must be at least 6 characters.");
      return;
    }
    if (next !== confirm) {
      setChangePasswordError("New password and confirmation do not match.");
      return;
    }
    if (next === current) {
      setChangePasswordError("New password must be different from your current (temporary) password.");
      return;
    }
    const user = currentUser;
    setChangePasswordLoading(true);
    setChangePasswordError(null);
    apiFetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current_password: current, new_password: next }),
    }).then(
      () => {
        // Changing the password doesn't invalidate the current JWT (the
        // backend only checks is_active/access_levels on each request, never
        // the password hash) — so there's no need to sign out and force a
        // second login. Just clear the mandatory-change flag and continue
        // straight into the app as the same session.
        setChangePasswordLoading(false);
        setMustChangePassword(false);
        setChangePasswordCurrentState("");
        setChangePasswordNewState("");
        setChangePasswordConfirmState("");
        if (user) setCurrentUser({ ...user, must_change_password: false });
      },
      (err: Error) => {
        setChangePasswordLoading(false);
        setChangePasswordError(err.message || "Could not change password.");
      }
    );
  };

  const handleLogout = () => {
    localStorage.removeItem("orbit_token");
    setCurrentUser(null);
    setLoginEmailState("");
    setLoginPasswordState("");
    setLoginError(null);
    setMustChangePassword(false);
    setChangePasswordCurrentState("");
    setChangePasswordNewState("");
    setChangePasswordConfirmState("");
    setChangePasswordError(null);
  };

  const dismissSessionToast = () => setSessionToast(null);

  return (
    <AuthContext.Provider
      value={{
        authChecking,
        currentUser,
        mustChangePassword,
        loginEmail,
        loginPassword,
        loginLoading,
        loginError,
        changePasswordCurrent,
        changePasswordNew,
        changePasswordConfirm,
        changePasswordLoading,
        changePasswordError,
        sessionToast,
        landingScreen,
        setLoginEmail,
        setLoginPassword,
        handleLogin,
        setChangePasswordCurrent,
        setChangePasswordNew,
        setChangePasswordConfirm,
        handleChangePassword,
        handleLogout,
        dismissSessionToast,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// apiErrorMessage re-exported for screens that need to format raw error
// bodies the same way apiFetch does internally.
export { apiErrorMessage };
