"use client";
import { create } from "zustand";
import { api, ApiError } from "@/lib/api";

export interface User { id: string; email: string; full_name: string; phone: string | null; role: "customer" | "owner" | "admin"; locale: string }
interface TokenResponse { access_token: string; expires_in: number; user: User }

interface AuthState {
  user: User | null;
  /** Kept in memory only: an XSS can't read it from storage, and the httpOnly refresh cookie restores it on reload. */
  token: string | null;
  status: "loading" | "anon" | "authed";
  init: () => Promise<void>;
  login: (email: string, password: string) => Promise<User>;
  register: (body: { email: string; password: string; full_name: string; role: "customer" | "owner" }) => Promise<User>;
  logout: () => Promise<void>;
}

const post = <T,>(path: string, body?: unknown) =>
  api<T>(path, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });

let refreshing: Promise<TokenResponse | null> | null = null;
const refresh = () => (refreshing ??= post<TokenResponse>("/auth/refresh").catch(() => null).finally(() => { refreshing = null; }));

export const useAuth = create<AuthState>((set) => {
  const accept = (r: TokenResponse) => { set({ user: r.user, token: r.access_token, status: "authed" }); return r.user; };
  return {
    user: null, token: null, status: "loading",
    init: async () => {
      const r = await refresh();
      if (r) accept(r); else set({ user: null, token: null, status: "anon" });
    },
    login: async (email, password) => accept(await post<TokenResponse>("/auth/login", { email, password })),
    register: async (body) => accept(await post<TokenResponse>("/auth/register", body)),
    logout: async () => {
      await post("/auth/logout").catch(() => undefined);
      set({ user: null, token: null, status: "anon" });
    },
  };
});

/** Authenticated request; on a 401 it refreshes the session once and retries. */
export async function authApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const call = () => api<T>(path, { ...init, credentials: "include", headers: { ...init.headers, Authorization: `Bearer ${useAuth.getState().token}`, ...(init.body ? { "content-type": "application/json" } : {}) } });
  try {
    return await call();
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      const r = await refresh();
      if (r) { useAuth.setState({ user: r.user, token: r.access_token, status: "authed" }); return call(); }
      useAuth.setState({ user: null, token: null, status: "anon" });
    }
    throw e;
  }
}
