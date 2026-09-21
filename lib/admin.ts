import { API_BASE } from "./client";

// Developer console transport. The token is kept in tab-scoped storage only.
const KEY = "still-dev-token";

export function devToken(): string {
  try {
    return sessionStorage.getItem(KEY) || "";
  } catch {
    return "";
  }
}

export function setDevToken(value: string) {
  try {
    if (value) sessionStorage.setItem(KEY, value);
    else sessionStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
}

export function devRoute(): boolean {
  return (
    typeof window !== "undefined" && window.location.hash.startsWith("#dev")
  );
}

export type AdminAccount = {
  id: string;
  email: string;
  name: string;
  created: number;
  suspended: boolean;
  provider: string;
  model: string;
  theme: string;
  accent: string;
  notes: number;
  decks: number;
  attempts: number;
  events: number;
  assets: number;
  bytes: number;
};

export type AdminContent = {
  email: string;
  name: string;
  notes: { id: string; title: string; subject: string; created: number; text: string }[];
  decks: { id: string; title: string; created: number; cards: number }[];
};

async function call<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const token = devToken();
  const response = await fetch(API_BASE + "/api/" + path, {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as {
    error?: string;
  };
  if (!response.ok) throw new Error(data.error || "Request failed (" + response.status + ").");
  return data as T;
}

export const admin = {
  login: (email: string, password: string) =>
    call<{ email: string; token: string }>("admin/login", "POST", { email, password }),
  session: () => call<{ email: string }>("admin/session"),
  logout: () => call<{ ok: boolean }>("admin/logout", "POST", {}),
  accounts: () => call<{ accounts: AdminAccount[] }>("admin/accounts"),
  content: (id: string) =>
    call<AdminContent>("admin/content?id=" + encodeURIComponent(id)),
  setPassword: (id: string, password: string) =>
    call<{ ok: boolean }>("admin/password", "POST", { id, password }),
  suspend: (id: string, suspended: boolean) =>
    call<{ ok: boolean }>("admin/suspend", "POST", { id, suspended }),
  remove: (id: string) => call<{ ok: boolean }>("admin/delete", "POST", { id }),
};
