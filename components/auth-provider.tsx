"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

type AuthContextValue = {
  isAuthenticated: boolean;
  userEmail: string | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const STORAGE_SESSION_KEY = "app_convex_session_token";

const convexUrl =
  typeof process !== "undefined"
    ? process.env.NEXT_PUBLIC_CONVEX_URL
    : undefined;

const client =
  typeof window !== "undefined" && convexUrl
    ? new ConvexHttpClient(convexUrl)
    : null;

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

  useEffect(() => {
    if (typeof window === "undefined" || !client) {
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
        const session = await client.query(api.auth.getSession, { token });
        if (session) {
          setIsAuthenticated(true);
          setUserEmail(session.email);
        } else {
          window.localStorage.removeItem(STORAGE_SESSION_KEY);
        }
      } finally {
        setIsReady(true);
      }
    })();
  }, []);

  const login = async (email: string, password: string) => {
    if (!client) {
      throw new Error("Convex client is not configured");
    }

    const passwordHash = await hashPassword(password);
    const result = await client.mutation(api.auth.loginWithPassword, {
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
  };

  const signup = async (email: string, password: string) => {
    if (!client) {
      throw new Error("Convex client is not configured");
    }

    const passwordHash = await hashPassword(password);
    const result = await client.mutation(api.auth.signup, {
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
  };

  const logout = async () => {
    if (typeof window === "undefined") {
      setIsAuthenticated(false);
      setUserEmail(null);
      return;
    }

    const token = window.localStorage.getItem(STORAGE_SESSION_KEY);
    if (client && token) {
      try {
        await client.mutation(api.auth.logout, { token });
      } catch {
        // ignore logout errors
      }
    }

    window.localStorage.removeItem(STORAGE_SESSION_KEY);
    setIsAuthenticated(false);
    setUserEmail(null);
  };

  return (
    <AuthContext.Provider
      value={{ isAuthenticated, userEmail, login, signup, logout }}
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

