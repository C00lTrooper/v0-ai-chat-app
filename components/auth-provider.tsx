"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";

type AuthContextValue = {
  isAuthenticated: boolean;
  userEmail: string | null;
  sessionToken: string | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const STORAGE_SESSION_KEY = "app_convex_session_token";

async function hashPassword(password: string): Promise<string> {
  const enc = new TextEncoder();
  const data = enc.encode(password);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(digest);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !convexClient) {
      setIsReady(true);
      return;
    }

    const token = window.localStorage.getItem(STORAGE_SESSION_KEY);
    if (!token) {
      setIsReady(true);
      return;
    }

    void (async () => {
      try {
        const session = await convexClient.query(api.auth.getSession, {
          token,
        });
        if (session) {
          setIsAuthenticated(true);
          setUserEmail(session.email);
          setSessionToken(token);
        } else {
          window.localStorage.removeItem(STORAGE_SESSION_KEY);
        }
      } finally {
        setIsReady(true);
      }
    })();
  }, []);

  const login = async (email: string, password: string) => {
    if (!convexClient) {
      throw new Error("Convex client is not configured");
    }

    const passwordHash = await hashPassword(password);
    const result = await convexClient.mutation(api.auth.loginWithPassword, {
      email,
      passwordHash,
    });

    if (!result.ok) {
      throw new Error("Invalid email or password");
    }

    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_SESSION_KEY, result.token);
    }

    setIsAuthenticated(true);
    setUserEmail(result.email);
    setSessionToken(result.token);
  };

  const signup = async (email: string, password: string) => {
    if (!convexClient) {
      throw new Error("Convex client is not configured");
    }

    const passwordHash = await hashPassword(password);
    const result = await convexClient.mutation(api.auth.signup, {
      email,
      passwordHash,
    });

    if (!result.ok) {
      throw new Error("User with this email already exists");
    }

    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_SESSION_KEY, result.token);
    }

    setIsAuthenticated(true);
    setUserEmail(result.email);
    setSessionToken(result.token);
  };

  const logout = async () => {
    if (typeof window === "undefined") {
      setIsAuthenticated(false);
      setUserEmail(null);
      setSessionToken(null);
      return;
    }

    const token = window.localStorage.getItem(STORAGE_SESSION_KEY);
    if (convexClient && token) {
      try {
        await convexClient.mutation(api.auth.logout, { token });
      } catch {
        // ignore logout errors
      }
    }

    window.localStorage.removeItem(STORAGE_SESSION_KEY);
    setIsAuthenticated(false);
    setUserEmail(null);
    setSessionToken(null);
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        userEmail,
        sessionToken,
        login,
        signup,
        logout,
      }}
    >
      {isReady ? children : null}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
