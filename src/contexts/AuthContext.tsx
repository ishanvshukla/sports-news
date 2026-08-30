import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from 'react';
import {
  loginWithGoogle as apiLoginWithGoogle,
  fetchPrefs,
  savePrefsApi,
} from '../services/authApi';
import type { Prefs } from '../types/news';

const TOKEN_KEY = 'auth_token';
const EMAIL_KEY = 'auth_email';

interface AuthContextValue {
  token: string | null;
  email: string | null;
  serverPrefs: Prefs | null;
  isLoggedIn: boolean;
  prefsLoading: boolean;
  loginWithGoogle(credential: string): Promise<void>;
  logout(): void;
  syncPrefs(prefs: Prefs): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [email, setEmail] = useState<string | null>(() => localStorage.getItem(EMAIL_KEY));
  const [serverPrefs, setServerPrefs] = useState<Prefs | null>(null);
  // Start loading only if we have a stored token to verify
  const initialToken = useRef(localStorage.getItem(TOKEN_KEY));
  const [prefsLoading, setPrefsLoading] = useState(!!initialToken.current);

  useEffect(() => {
    if (!initialToken.current) return;
    fetchPrefs(initialToken.current)
      .then((p) => {
        if (p) setServerPrefs(p);
        setPrefsLoading(false);
      })
      .catch(() => {
        // Token expired or invalid — clear auth
        persistAuth(null, null);
        setPrefsLoading(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function persistAuth(t: string | null, e: string | null) {
    if (t && e) {
      localStorage.setItem(TOKEN_KEY, t);
      localStorage.setItem(EMAIL_KEY, e);
    } else {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(EMAIL_KEY);
    }
    setToken(t);
    setEmail(e);
  }

  async function loginWithGoogle(credential: string): Promise<void> {
    const res = await apiLoginWithGoogle(credential);
    persistAuth(res.token, res.email);
    const p = await fetchPrefs(res.token);
    setServerPrefs(p);
  }

  function logout(): void {
    persistAuth(null, null);
    setServerPrefs(null);
  }

  async function syncPrefs(p: Prefs): Promise<void> {
    if (!token) return;
    await savePrefsApi(token, p);
  }

  return (
    <AuthContext.Provider
      value={{
        token,
        email,
        serverPrefs,
        isLoggedIn: !!token,
        prefsLoading,
        loginWithGoogle,
        logout,
        syncPrefs,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
