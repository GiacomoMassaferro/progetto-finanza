import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { setLanguage } from "../i18n/index.js";
import { authApi, tokenStore } from "../lib/api.js";

// Stato globale di sessione: user, caricamento iniziale, login/register/logout.
// Le pagine usano useAuth() invece di toccare i token a mano.

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // All'avvio: se c'è un token salvato, ricarica il profilo (col refresh
  // automatico se l'access è scaduto ma il refresh è valido) e applica
  // la lingua salvata nel profilo (verità su ogni dispositivo).
  useEffect(() => {
    if (!tokenStore.getAccess()) {
      setLoading(false);
      return;
    }
    authApi
      .me(tokenStore.getAccess())
      .then(({ user: me }) => {
        setUser(me);
        if (me.language) {
          setLanguage(me.language);
        }
      })
      .catch(() => tokenStore.clear())
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (input) => {
    const { user: me, tokens } = await authApi.login(input);
    tokenStore.set(tokens);
    setUser(me);
    if (me.language) {
      await setLanguage(me.language);
    }
    return me;
  }, []);

  const register = useCallback(async (input) => {
    const { user: me, tokens } = await authApi.register(input);
    tokenStore.set(tokens);
    setUser(me);
    if (me.language) {
      await setLanguage(me.language);
    }
    return me;
  }, []);

  // Logout: pulisce subito lo stato locale (l'utente esce anche se la rete
  // è lenta) e poi revoca la sessione sul server. I token vengono letti
  // prima della pulizia e passati esplicitamente.
  const logout = useCallback(async () => {
    const refreshToken = tokenStore.getRefresh();
    const accessToken = tokenStore.getAccess();
    tokenStore.clear();
    setUser(null);
    if (refreshToken) {
      await authApi.logout(refreshToken, accessToken).catch(() => {});
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
