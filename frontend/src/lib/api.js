// Client HTTP verso il backend (stesso formato ovunque: { data } ok,
// { error: { message, details? } } ko). Solo fetch, nessuna dipendenza.
//
// Sessione (D-28): il refresh token vive in un cookie HttpOnly impostato dal
// server e JavaScript non può leggerlo. Qui teniamo SOLO l'access token, in
// memoria: si perde al reload e si recupera con restoreSession() (che usa il
// cookie). Niente localStorage: un XSS non trova credenziali da rubare.

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000/api/v1";

// Cookie leggibile impostato dal server: da rimandare in `x-csrf-token`.
const CSRF_COOKIE = "pf_csrf";

// Access token corrente (in memoria del modulo, mai persistito).
let accessToken = null;

export function setAccessToken(token) {
  accessToken = token ?? null;
}

export function clearAccessToken() {
  accessToken = null;
}

// Errore con status HTTP: i componenti distinguono 401/404/409 dal message.
export class ApiError extends Error {
  constructor(status, payload) {
    super(payload?.error?.message ?? "Errore di rete");
    this.status = status;
    this.details = payload?.error?.details;
  }
}

// Legge il token CSRF dal cookie (double-submit: il server lo confronta).
function readCsrfToken() {
  if (typeof document === "undefined") {
    return null;
  }
  const match = document.cookie.match(new RegExp(`(?:^|; )${CSRF_COOKIE}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

// Chiamata singola: access token nell'header, JSON in/out.
// `credentials: "include"` fa viaggiare i cookie di sessione anche quando
// frontend (5173) e API (3000) sono su origini diverse.
async function request(path, { method = "GET", body, token, csrf = false } = {}) {
  const csrfToken = csrf ? readCsrfToken() : null;
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, payload);
  }
  return payload;
}

// Rinnova la sessione col cookie httpOnly: il server ruota refresh e CSRF e
// restituisce solo l'access token (+ utente).
async function refreshSession() {
  const payload = await request("/auth/refresh", { method: "POST", csrf: true });
  setAccessToken(payload.data.accessToken);
  return payload.data;
}

// Un solo refresh alla volta (single-flight): se due chiamate falliscono
// insieme con 401 (es. doppio mount StrictMode), condividono la stessa
// rotazione invece di usare due volte lo stesso cookie (→ 401 a catena).
let inflightRefresh = null;
function singleRefresh() {
  if (!inflightRefresh) {
    inflightRefresh = refreshSession().then(
      (data) => {
        inflightRefresh = null;
        return data;
      },
      (err) => {
        inflightRefresh = null;
        clearAccessToken();
        throw err;
      },
    );
  }
  return inflightRefresh;
}

// All'avvio della pagina: se il cookie di sessione è valido, recupera utente
// e access token; altrimenti null (utente non loggato, nessun errore in console).
export async function restoreSession() {
  try {
    return await singleRefresh();
  } catch {
    return null;
  }
}

// Esegue la chiamata col token dato; su 401 usa il refresh condiviso
// (single-flight) e ripete una sola volta.
async function withAuthRetry(fn, options) {
  const current = options.token ?? accessToken;
  try {
    return await fn(current);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401 && current && !options.retried) {
      const fresh = await singleRefresh().catch(() => null);
      if (fresh) {
        return fn(fresh.accessToken);
      }
    }
    throw err;
  }
}

// Entry point per le pagine (risorsa singola): restituisce `data`.
export async function api(path, options = {}) {
  const payload = await withAuthRetry((token) => request(path, { ...options, token }), options);
  return payload.data;
}

// Entry point per le liste paginate: restituisce { items, meta }.
// Le liste backend rispondono { data: [], meta } — mai scartare meta.
export async function apiPaged(path, params = {}, options = {}) {
  const payload = await withAuthRetry(
    (token) => request(`${path}${toQuery(params)}`, { ...options, token }),
    options,
  );
  return { items: payload.data ?? [], meta: payload.meta ?? null };
}

// --- Auth ---
// Il server risponde { user, accessToken }: il token viene tenuto qui in
// memoria, il refresh resta nel cookie HttpOnly.
async function startSession(promise) {
  const data = await promise;
  setAccessToken(data.accessToken);
  return data;
}

export const authApi = {
  // { email, password, firstName?, lastName? } -> { user, accessToken }.
  register: (input) => startSession(api("/auth/register", { method: "POST", body: input })),
  // { email, password } -> { user, accessToken }.
  login: (input) => startSession(api("/auth/login", { method: "POST", body: input })),
  me: (token) => api("/auth/me", { token }),
  // Salva la lingua preferita nel profilo (segue l'utente su ogni dispositivo).
  updateMe: (input) => api("/auth/me", { method: "PATCH", body: input }),
  // Revoca lato server la sessione (cookie + famiglia) e cancella i cookie.
  logout: () => api("/auth/logout", { method: "POST", csrf: true }),
  // Chiude tutte le sessioni dell'utente (tutti i dispositivi).
  logoutAll: () => api("/auth/logout-all", { method: "POST" }),
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
  // Spesa a rate: crea debito + N rate mensili in un colpo solo (atomico).
  createWithInstallments: (input) => api("/debts/with-installments", { method: "POST", body: input }),
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

export const aiApi = {
  // Suggerimento payoff nella lingua data (il backend unisce regole + LLM).
  suggest: (intent = "payoff", locale = "en") => api("/ai/suggest", { method: "POST", body: { intent, locale } }),
};

export const goalsApi = {
  list: (params = {}) => apiPaged("/goals", params),
  create: (input) => api("/goals", { method: "POST", body: input }),
  update: (id, input) => api(`/goals/${id}`, { method: "PATCH", body: input }),
  remove: (id) => api(`/goals/${id}`, { method: "DELETE" }),
  trash: (params = {}) => apiPaged("/goals/trash", params),
  restore: (id) => api(`/goals/${id}/restore`, { method: "POST" }),
  // Versa una somma: si somma all'accantonato (auto-REACHED al target).
  deposit: (id, amount) => api(`/goals/${id}/deposit`, { method: "POST", body: { amount } }),
};

// Costruisce ?a=1&b=2 saltando i valori vuoti.
function toQuery(params) {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== "");
  return entries.length > 0 ? `?${new URLSearchParams(entries).toString()}` : "";
}
