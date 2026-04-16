// Simple API helper for the Node/Express backend
// - Reads base URL from VITE_API_BASE_URL (ex: http://localhost:5000/api)
// - Automatically attaches JWT token from localStorage

export const API_BASE_URL: string =
  (import.meta as any).env?.VITE_API_BASE_URL ||
  `https://mypfefull-production.up.railway.app/api`;

const TOKEN_KEY = "sentinel_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (!token) localStorage.removeItem(TOKEN_KEY);
  else localStorage.setItem(TOKEN_KEY, token);
}

type ApiError = {
  message?: string;
  error?: any;
};

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { auth?: boolean } = {}
): Promise<T> {
  const { auth = true, headers, ...rest } = options;
  const token = getToken();

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(auth && token ? { Authorization: `Bearer ${token}` } : {}),
      ...(headers || {}),
    },
  });

  const text = await res.text();
  const data = text ? (JSON.parse(text) as any) : null;

  if (!res.ok) {
    const err: ApiError = data || { message: res.statusText };
    throw new Error(err.message || "Request failed");
  }

  return data as T;
}
