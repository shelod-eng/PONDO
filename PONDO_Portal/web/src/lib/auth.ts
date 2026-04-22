"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Role } from "./api";

type AuthState = { token: string; role: Role; username: string } | null;

const KEY = "pondo_demo_auth_v1";

export function useAuth() {
  const [state, setState] = useState<AuthState>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(KEY);
    if (!raw) {
      setHydrated(true);
      return;
    }
    try {
      setState(JSON.parse(raw));
    } catch {
      window.localStorage.removeItem(KEY);
      setState(null);
    } finally {
      setHydrated(true);
    }
  }, []);

  const setAuth = useCallback((next: AuthState) => {
    setState(next);
    if (typeof window === "undefined") return;
    if (!next) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, JSON.stringify(next));
  }, []);

  return useMemo(
    () => ({
      auth: state,
      token: state?.token || "",
      role: state?.role,
      username: state?.username,
      hydrated,
      logout: () => setAuth(null),
      setAuth,
    }),
    [hydrated, setAuth, state],
  );
}
