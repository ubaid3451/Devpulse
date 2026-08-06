"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
} from "react";
import { ApiError, apiGet, apiPost, type AuthResponse, type User } from "./api";
import { ensureIdentitySetUp } from "./signal-e2ee";

// ── State ──────────────────────────────────────────────────────────────────────

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isInitialized: boolean;
}

type AuthAction =
  | { type: "SET_USER"; user: User }
  | { type: "CLEAR_USER" }
  | { type: "SET_LOADING"; loading: boolean }
  | { type: "SET_INITIALIZED" };

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case "SET_USER":
      return { ...state, user: action.user, isLoading: false };
    case "CLEAR_USER":
      return { ...state, user: null, isLoading: false };
    case "SET_LOADING":
      return { ...state, isLoading: action.loading };
    case "SET_INITIALIZED":
      return { ...state, isInitialized: true };
    default:
      return state;
  }
}

// ── Context ────────────────────────────────────────────────────────────────────

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isInitialized: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (
    fullName: string,
    email: string,
    password: string
  ) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, {
    user: null,
    isLoading: true,
    isInitialized: false,
  });

  /** Fetch current user from /auth/me on mount. */
  const refreshUser = useCallback(async () => {
    try {
      const user = await apiGet<User>("/auth/me");
      dispatch({ type: "SET_USER", user });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        dispatch({ type: "CLEAR_USER" });
      }
    } finally {
      dispatch({ type: "SET_INITIALIZED" });
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  /**
   * Initialize Signal Protocol in the background whenever
   * a user becomes authenticated.
   */
  useEffect(() => {
    if (!state.user) return;

    const user = state.user;

    (async () => {
     try {
        console.log("🔐 Initializing Signal identity...");
     await ensureIdentitySetUp(user.id);
      console.log("✅ Signal identity ready.");
     } catch (err) {
      console.error("❌ Failed to initialize Signal identity:", err);
    }
  })();
}, [state.user]);

  const login = useCallback(async (email: string, password: string) => {
    dispatch({ type: "SET_LOADING", loading: true });

    const res = await apiPost<AuthResponse>("/auth/login", {
      email,
      password,
    });

    // Store session marker so Next.js middleware can detect auth state
    // (cross-domain backend httpOnly cookies are not visible to middleware)
    document.cookie = `devpulse_session=1; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;

    dispatch({ type: "SET_USER", user: res.user });

    return res.user;
  }, []);

  const register = useCallback(
    async (fullName: string, email: string, password: string) => {
      await apiPost("/auth/register", {
        full_name: fullName,
        email,
        password,
      });
    },
    []
  );

  const logout = useCallback(async () => {
    await apiPost("/auth/logout");
    localStorage.removeItem("devpulse_access_token");
    document.cookie = "devpulse_session=; path=/; max-age=0";
    dispatch({ type: "CLEAR_USER" });
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user: state.user,
        isLoading: state.isLoading,
        isInitialized: state.isInitialized,
        login,
        register,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);

  if (!ctx) {
    throw new Error("useAuth must be used within <AuthProvider>");
  }

  return ctx;
}