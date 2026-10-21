"use client";

import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";

export interface AuthUser {
  email: string;
  name: string;
  role: "tenant_admin";
}

interface AuthContextValue {
  user: AuthUser | null;
  ready: boolean;
  login: (email: string) => void;
  logout: () => void;
}

const SESSION_KEY = "pichat-session";

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SESSION_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<AuthUser>;
        if (parsed.email) {
          setUser({
            email: parsed.email,
            name: parsed.name ?? "张明",
            role: "tenant_admin",
          });
        }
      }
    } catch {
      // A missing or unreadable session is treated as signed out.
    } finally {
      setReady(true);
    }
  }, []);

  const login = useCallback((email: string) => {
    const next: AuthUser = {
      email: email.trim(),
      name: "张明",
      role: "tenant_admin",
    };
    try {
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(next));
    } catch {
      // The session still works for this tab when storage is unavailable.
    }
    setUser(next);
  }, []);

  const logout = useCallback(() => {
    try {
      window.localStorage.removeItem(SESSION_KEY);
    } catch {
      // Ignore storage failures; clearing state is enough for this tab.
    }
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, ready, login, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return value;
}
