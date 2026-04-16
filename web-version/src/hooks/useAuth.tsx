import { useState, useEffect, createContext, useContext, ReactNode } from "react";
import { apiFetch, getToken, setToken } from "@/lib/api";
import { setSocketToken } from "@/services/socket";

export type AppRole = "admin" | "utilisateur";

export type AppUser = {
  _id: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  phone?: string;
  preferredLanguage?: "fr" | "en";
  notificationPreferences?: {
    emailOnSignup?: boolean;
    emailOnLogin?: boolean;
    emailOnAlert?: boolean;
    criticalOnly?: boolean;
    aiNotifications?: boolean;
  };
  role: AppRole;
  avatarUrl?: string | null;
};

interface AuthContextType {
  user: AppUser | null;
  token: string | null;
  role: AppRole | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (payload: { email: string; password: string; firstName: string; lastName: string; phone: string }) => Promise<{ error: Error | null }>;
  requestPasswordReset: (email: string) => Promise<{ error: Error | null; message?: string }>;
  resetPassword: (payload: { email: string; token: string; newPassword: string }) => Promise<{ error: Error | null; message?: string }>;
  signOut: () => Promise<void>;
  refreshMe: () => Promise<void>;
  setUser: (user: AppUser | null) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [token, setTokenState] = useState<string | null>(getToken());
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshMe = async () => {
    const me = await apiFetch<{ success: boolean; user: AppUser }>("/auth/me", { auth: true });
    setUser(me.user);
    setRole(me.user.role);
  };

  useEffect(() => {
    const boot = async () => {
      const existing = getToken();
      setTokenState(existing);
      setSocketToken(existing);

      if (!existing) {
        setUser(null);
        setRole(null);
        setLoading(false);
        return;
      }

      try {
        await refreshMe();
      } catch {
        setToken(null);
        setTokenState(null);
        setSocketToken(null);
        setUser(null);
        setRole(null);
      } finally {
        setLoading(false);
      }
    };

    boot();
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      const res = await apiFetch<{ success: boolean; token: string; user: AppUser }>("/auth/login", {
        method: "POST",
        auth: false,
        body: JSON.stringify({ email, password }),
      });

      setToken(res.token);
      setTokenState(res.token);
      setSocketToken(res.token);
      setUser(res.user);
      setRole(res.user.role);
      return { error: null };
    } catch (e: any) {
      return { error: e as Error };
    }
  };

  const signUp = async (payload: { email: string; password: string; firstName: string; lastName: string; phone: string }) => {
    try {
      await apiFetch("/auth/register", {
        method: "POST",
        auth: false,
        body: JSON.stringify(payload),
      });
      return { error: null };
    } catch (e: any) {
      return { error: e as Error };
    }
  };

  const requestPasswordReset = async (email: string) => {
    try {
      const res = await apiFetch<{ success: boolean; message: string }>("/auth/forgot-password", {
        method: "POST",
        auth: false,
        body: JSON.stringify({ email }),
      });
      return { error: null, message: res.message };
    } catch (e: any) {
      return { error: e as Error };
    }
  };

  const resetPassword = async (payload: { email: string; token: string; newPassword: string }) => {
    try {
      const res = await apiFetch<{ success: boolean; message: string }>("/auth/reset-password", {
        method: "POST",
        auth: false,
        body: JSON.stringify(payload),
      });
      return { error: null, message: res.message };
    } catch (e: any) {
      return { error: e as Error };
    }
  };

  const signOut = async () => {
    setToken(null);
    setTokenState(null);
    setSocketToken(null);
    setUser(null);
    setRole(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, role, loading, signIn, signUp, requestPasswordReset, resetPassword, signOut, refreshMe, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
