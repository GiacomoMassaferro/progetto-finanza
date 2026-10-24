import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { setLanguage } from "../i18n/index.js";
import { authApi, clearAccessToken, restoreSession } from "../lib/api.js";

// Stato globale di sessione: user, caricamento iniziale, login/register/logout.
// Le pagine usano useAuth() invece di toccare i token a mano.

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // All'avvio: il refresh token è in un cookie HttpOnly, quindi l'unico modo
  // per sapere se c'è una sessione è chiedere un nuovo access token.
  // restoreSession() non lancia: senza cookie valido restituisce null.
  useEffect(() => {
    let cancelled = false;
    restoreSession()
      .then(async (data) => {
        if (cancelled || !data?.user) {
          return;
        }
        setUser(data.user);
        if (data.user.language) {
          await setLanguage(data.user.language);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Login/register: il token in memoria lo salva api.js, qui aggiorniamo lo stato.
  const login = useCallback(async (input) => {
    const { user: me } = await authApi.login(input);
    setUser(me);
    if (me.language) {
      await setLanguage(me.language);
    }
    return me;
  }, []);

  const register = useCallback(async (input) => {
    const { user: me } = await authApi.register(input);
    setUser(me);
    if (me.language) {
      await setLanguage(me.language);
    }
    return me;
  }, []);

  // Logout: revoca la sessione sul server (cookie + famiglia) e poi pulisce
  // lo stato locale, anche se la chiamata fallisce (l'utente deve uscire sempre).
  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Best-effort: la sessione locale viene comunque chiusa.
    } finally {
      clearAccessToken();
      setUser(null);
    }
  }, []);

  return <AuthContext.Provider value={{ user, loading, login, register, logout }}>{children}</AuthContext.Provider>;
}

// Hook delle pagine: const { user, login } = useAuth().
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth va usato dentro <AuthProvider>");
  }
  return ctx;
}
