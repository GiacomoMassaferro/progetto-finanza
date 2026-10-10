// Client HTTP verso il backend (stesso formato ovunque: { data } ok,
// { error: { message, details? } } ko). Solo fetch, nessuna dipendenza.

// Base URL dall'env Vite (VITE_API_URL) o default sviluppo locale.
const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000/api/v1";

const ACCESS_KEY = "pf.accessToken";
const REFRESH_KEY = "pf.refreshToken";

// Token in localStorage (prototipo: ok; in produzione valutare httpOnly cookie).
export const tokenStore = {
  getAccess: () => localStorage.getItem(ACCESS_KEY),
  getRefresh: () => localStorage.getItem(REFRESH_KEY),
  set: ({ accessToken, refreshToken }) => {
    localStorage.setItem(ACCESS_KEY, accessToken);
    localStorage.setItem(REFRESH_KEY, refreshToken);
  },
  clear: () => {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

// Errore con status HTTP: i componenti distinguono 401/404/409 dal message.
export class ApiError extends Error {
  constructor(status, payload) {
    super(payload?.error?.message ?? "Errore di rete");
    this.status = status;
    this.details = payload?.error?.details;
  }
}

// Chiamata singola: access token nell'header, JSON in/out.
// Restituisce il payload intero { data, meta? }: lo spacchettano api/apiPaged.
async function request(path, { method = "GET", body, token } = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, payload);
  }
  return payload;
}

// Esegue la chiamata col token dato; su 401 prova UN solo refresh e ripete.
// Se fallisce ancora, pulisce la sessione (l'utente dovrà riloggarsi).
async function withAuthRetry(fn, options, token) {
  try {
    return await fn(token);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401 && token && !options.retried) {
      const fresh = await refreshPair().catch(() => null);
      if (fresh) {
        return fn(fresh);
      }
      tokenStore.clear();
    }
    throw err;
  }
}

// Rinnova la coppia di token col refresh (uso singolo, rotazione lato server).
async function refreshPair() {
  const refreshToken = tokenStore.getRefresh();
  if (!refreshToken) {
    throw new ApiError(401, { error: { message: "Sessione scaduta" } });
  }
  const payload = await request("/auth/refresh", { method: "POST", body: { refreshToken } });
  tokenStore.set(payload.data.tokens);
  return payload.data.tokens.accessToken;
}

// Entry point per le pagine (risorsa singola): restituisce `data`.
// Aggiunge il token e, su 401, tenta un refresh prima di arrendersi.
export async function api(path, options = {}) {
  const token = options.token ?? tokenStore.getAccess();
  const payload = await withAuthRetry((t) => request(path, { ...options, token: t }), options, token);
  return payload.data;
}

// Entry point per le liste paginate: restituisce { items, meta }.
// Le liste backend rispondono { data: [], meta } — mai scartare meta.
export async function apiPaged(path, params = {}, options = {}) {
  const token = options.token ?? tokenStore.getAccess();
  const payload = await withAuthRetry(
    (t) => request(`${path}${toQuery(params)}`, { ...options, token: t }),
    options,
    token,
  );
  return { items: payload.data ?? [], meta: payload.meta ?? null };
}

// --- Auth ---
export const authApi = {
  // { email, password, firstName?, lastName? } -> { user, tokens }.
  register: (input) => api("/auth/register", { method: "POST", body: input }),
  // { email, password } -> { user, tokens }.
  login: (input) => api("/auth/login", { method: "POST", body: input }),
  me: (token) => api("/auth/me", { token }),
  // Salva la lingua preferita nel profilo (segue l'utente su ogni dispositivo).
  updateMe: (input) => api("/auth/me", { method: "PATCH", body: input }),
};

// --- Risorse protette (il token lo mette api/apiPaged da sole) ---
export const categoriesApi = {
  list: (params = {}) => apiPaged("/categories", params),
  create: (input) => api("/categories", { method: "POST", body: input }),
  update: (id, input) => api(`/categories/${id}`, { method: "PATCH", body: input }),
  remove: (id) => api(`/categories/${id}`, { method: "DELETE" }),
  trash: (params = {}) => apiPaged("/categories/trash", params),
  restore: (id) => api(`/categories/${id}/restore`, { method: "POST" }),
};

export const transactionsApi = {
  list: (params = {}) => apiPaged("/transactions", params),
  create: (input) => api("/transactions", { method: "POST", body: input }),
  update: (id, input) => api(`/transactions/${id}`, { method: "PATCH", body: input }),
  remove: (id) => api(`/transactions/${id}`, { method: "DELETE" }),
  trash: (params = {}) => apiPaged("/transactions/trash", params),
  restore: (id) => api(`/transactions/${id}/restore`, { method: "POST" }),
};

export const debtsApi = {
  list: (params = {}) => apiPaged("/debts", params),
  create: (input) => api("/debts", { method: "POST", body: input }),
  update: (id, input) => api(`/debts/${id}`, { method: "PATCH", body: input }),
  remove: (id) => api(`/debts/${id}`, { method: "DELETE" }),
  trash: (params = {}) => apiPaged("/debts/trash", params),
  restore: (id) => api(`/debts/${id}/restore`, { method: "POST" }),
  payments: (id) => api(`/debts/${id}/payments`),
  createPayment: (id, input) => api(`/debts/${id}/payments`, { method: "POST", body: input }),
  pay: (id, paymentId, input) => api(`/debts/${id}/payments/${paymentId}/pay`, { method: "POST", body: input }),
};

export const dashboardApi = {
  // ?month=YYYY-MM, omesso = mese corrente.
  summary: (month) => api(`/dashboard/summary${month ? `?month=${month}` : ""}`),
};

// Costruisce ?a=1&b=2 saltando i valori vuoti.
function toQuery(params) {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== "");
  return entries.length > 0 ? `?${new URLSearchParams(entries).toString()}` : "";
}
