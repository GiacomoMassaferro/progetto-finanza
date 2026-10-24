# Project Finance (nome provvisorio)

Piattaforma che aiuta chiunque a gestire situazioni debitorie e a risparmiare.
L'IA avrà un ruolo centrale: suggerimenti utili per estinguere i debiti e creare
risparmi senza aggravare la situazione finanziaria dell'utente. Meno debiti in
un'epoca in cui indebitarsi è facile, più risparmi in un periodo di prezzi in
forte crescita.

## Stato

Backend: fondamenta + auth + CRUD + dashboard + test (vedi sotto).
Frontend React + Vite: fondamenta pronte (login, tema Stitch, client API),
dashboard e pagine operative in arrivo. Dettagli tecnici e storico modifiche:
vedi `PLAN.md`.

## Stack

| Livello | Tecnologia |
|---|---|
| Runtime | Node.js 24 + pnpm 11 |
| API | Express 5 (ESM, JSON) |
| ORM / DB | Prisma 7 + MySQL 8 |
| Frontend | React + Vite (pianificato) |

## Prerequisiti

- Node.js 24, pnpm 11, MySQL 8 in ascolto su `localhost:3306`
- Database `express_finance` + shadow database vuoto `express_finance_shadow`
- Utente MySQL `prisma_user` con accesso a entrambi

## Avvio rapido (tutto insieme)

```powershell
pnpm install:all   # una volta sola: dipendenze backend + frontend
pnpm start         # backend :3000 + frontend :5173 insieme
```

Poi apri `http://localhost:5173` e accedi con `demo@example.com / DemoPass123`
(dopo `pnpm --dir backend db:seed`).

## Avvio rapido (backend)

```powershell
cd backend
Copy-Item .env.example .env   # poi compila le credenziali reali
$env:CI = "true"              # aggira un prompt pnpm nei terminali non interattivi
pnpm install
pnpm db:migrate               # applica le migration
pnpm dev                      # http://localhost:3000
```

Verifica:

```powershell
Invoke-RestMethod http://localhost:3000/health  # {"status":"ok",...}
Invoke-RestMethod http://localhost:3000/ready   # {"status":"ready","db":"up"}
pnpm db:studio                                  # ispeziona il DB su :5555
```

## Script (`backend/`)

| Comando | Cosa fa |
|---|---|
| `pnpm dev` | avvio sviluppo con watch |
| `pnpm start` | avvio produzione |
| `pnpm db:validate` | valida lo schema Prisma |
| `pnpm db:migrate` | crea/applica migration |
| `pnpm db:generate` | rigenera il client Prisma |
| `pnpm db:studio` | UI web del database |
| `pnpm db:seed` | dati demo (demo@example.com / DemoPass123, idempotente) |
| `pnpm dev:test` | API su `http://localhost:3001` contro il DB di test |
| `pnpm db:test:status` | stato migration del DB di test |
| `pnpm db:test:migrate` | applica/crea migration solo sul DB di test |
| `pnpm db:test:reset` | azzera e ricrea il DB di test (distruttivo, solo `*_test`) |
| `pnpm db:test:seed` | dati demo sul DB di test |

## Database di test delle migrazioni

Per provare una migration senza rischiare i dati reali esiste `backend/.env.test`
(gitignored, template in `.env.test.example`) che punta a `express_finance_test`
e `express_finance_test_shadow`. Setup una tantum, da `backend/`:

```powershell
mysql -u root -p < scripts/create-test-db.sql   # crea DB + grant
Copy-Item .env.test.example .env.test            # poi compila i valori
pnpm db:test:migrate                             # replica lo schema sul DB di test
pnpm db:test:status                              # deve risultare "up to date"
```

Il wrapper `scripts/prisma-test.js` rifiuta di partire se le URL non puntano a
database che contengono `_test`: un errore di battitura non può toccare
`express_finance`. `pnpm db:migrate` continua a lavorare sul DB di sviluppo.

## Variabili d'ambiente

Vedi `backend/.env.example`. Nota: in locale `DATABASE_SSL` resta `false`
(l'SSL attivo blocca l'handshake col MySQL locale); in produzione con
certificati validi va impostato a `true`.

## Sessione e cookie

Il refresh token vive in un cookie `HttpOnly` (`pf_refresh`), quindi JavaScript
non può leggerlo: il frontend tiene in memoria solo l'access token (15 min) e
lo recupera al reload tramite il cookie. Le richieste usano
`credentials: "include"`; refresh e logout richiedono l'header `x-csrf-token`
col valore del cookie `pf_csrf` (protezione CSRF). In produzione i cookie sono
`Secure` di default; se frontend e API stanno su siti diversi servono
`COOKIE_SAME_SITE="none"` e `COOKIE_SECURE="true"`. Client non-browser (curl,
mobile) possono tornare al vecchio contratto con `x-auth-mode: bearer`, che
restituisce i token nel body.

## Cancellazioni (soft delete)

I record non vengono mai eliminati fisicamente: la cancellazione imposta
`deleted_at` e il ripristino lo azzera. Le liste mostrano solo i record attivi,
l'assistenza può vedere e recuperare quelli cancellati. Dettagli in `PLAN.md` §3.3.

## Problemi noti

- `/ready` in timeout → controlla `DATABASE_SSL="false"` nel `.env` (vedi `PLAN.md` §8).
- pnpm chiede conferma TTY → `$env:CI = "true"` prima dei comandi.

## Frontend (`frontend/`)

React 19 + Vite + Tailwind col tema Stitch, mobile-first. Avvio:

```powershell
cd frontend
Copy-Item .env.example .env   # opzionale: default = http://localhost:3000/api/v1
pnpm install
pnpm dev                      # http://localhost:5173 (il backend deve girare)
```

Apri **`http://localhost:5173`**, non `127.0.0.1`: il backend autorizza un solo
origin CORS e i cookie di sessione sono legati all'host, quindi da `127.0.0.1`
login e refresh falliscono (il dev server reindirizza comunque su `localhost`).

Login con `demo@example.com / DemoPass123` (dopo `pnpm db:seed` nel backend).
Pagine: dashboard coi dati veri, transazioni, debiti/rate, categorie
(tutte con cestino e ripristino). IA e obiettivi risparmio: segnaposto statici.

## Roadmap

1. Auth JWT (register/login/refresh) + sicurezza (helmet, rate-limit) ✅
2. CRUD categorie, transazioni, debiti/rate + dashboard ✅
3. Validazione con zod, endpoint `trash`/`restore` per l'assistenza ✅
4. Frontend React + Vite (completo: dashboard, transazioni, debiti, categorie)
5. Suggerimenti IA per estinzione debiti e risparmi

## Licenza

Da definire.

--- ENG ---

# Project Finance (working name)

Platform that helps anyone manage debt and save money.
AI plays a key role: useful suggestions to pay off debts and build savings
without worsening the user's financial situation. Fewer debts in an era when
borrowing is easy, more savings in a time of sharply rising prices.

## Status

Backend: foundation + auth + CRUD + dashboard + tests (see below).
React + Vite frontend: foundation ready (login, Stitch theme, API client),
dashboard and operational pages coming. Technical details and change history:
see `PLAN.md`.

## Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 24 + pnpm 11 |
| API | Express 5 (ESM, JSON) |
| ORM / DB | Prisma 7 + MySQL 8 |
| Frontend | React + Vite (planned) |

## Prerequisites

- Node.js 24, pnpm 11, MySQL 8 listening on `localhost:3306`
- `express_finance` database + empty `express_finance_shadow` database
- `prisma_user` MySQL user with access to both

## Quickstart (all together)

```powershell
pnpm install:all   # once: backend + frontend dependencies
pnpm start         # backend :3000 + frontend :5173 together
```

Then open `http://localhost:5173` and login with `demo@example.com / DemoPass123`
(after `pnpm --dir backend db:seed`).

## Quickstart (backend)

```powershell
cd backend
Copy-Item .env.example .env   # then fill in real credentials
$env:CI = "true"              # works around a pnpm prompt in non-interactive shells
pnpm install
pnpm db:migrate               # apply migrations
pnpm dev                      # http://localhost:3000
```

Verify:

```powershell
Invoke-RestMethod http://localhost:3000/health  # {"status":"ok",...}
Invoke-RestMethod http://localhost:3000/ready   # {"status":"ready","db":"up"}
pnpm db:studio                                  # inspect the DB on :5555
```

## Scripts (`backend/`)

| Command | What it does |
|---|---|
| `pnpm dev` | dev start with watch |
| `pnpm start` | production start |
| `pnpm db:validate` | validate the Prisma schema |
| `pnpm db:migrate` | create/apply migrations |
| `pnpm db:generate` | regenerate the Prisma client |
| `pnpm db:studio` | web UI for the database |
| `pnpm db:seed` | demo data (demo@example.com / DemoPass123, idempotent) |
| `pnpm dev:test` | API on `http://localhost:3001` against the test DB |
| `pnpm db:test:status` | migration status of the test DB |
| `pnpm db:test:migrate` | create/apply migrations on the test DB only |
| `pnpm db:test:reset` | wipe and recreate the test DB (destructive, `*_test` only) |
| `pnpm db:test:seed` | demo data on the test DB |

## Migration test database

To try a migration without risking real data there is `backend/.env.test`
(gitignored, template in `.env.test.example`) pointing at `express_finance_test`
and `express_finance_test_shadow`. One-time setup, from `backend/`:

```powershell
mysql -u root -p < scripts/create-test-db.sql   # create DBs + grants
Copy-Item .env.test.example .env.test            # then fill in the values
pnpm db:test:migrate                             # replay the schema on the test DB
pnpm db:test:status                              # must report "up to date"
```

The `scripts/prisma-test.js` wrapper refuses to run unless the URLs point to
databases containing `_test`: a typo cannot touch `express_finance`.
`pnpm db:migrate` keeps working on the development DB.

## Environment variables

See `backend/.env.example`. Note: locally `DATABASE_SSL` stays `false`
(enabled SSL stalls the handshake with local MySQL); in production with valid
certificates set it to `true`.

## Session and cookies

The refresh token lives in an `HttpOnly` cookie (`pf_refresh`), so JavaScript
cannot read it: the frontend only keeps the access token in memory (15 min) and
recovers it on reload through the cookie. Requests use `credentials: "include"`;
refresh and logout require the `x-csrf-token` header matching the `pf_csrf`
cookie (CSRF protection). In production cookies are `Secure` by default; if
frontend and API live on different sites use `COOKIE_SAME_SITE="none"` and
`COOKIE_SECURE="true"`. Non-browser clients (curl, mobile) can fall back to the
old contract with `x-auth-mode: bearer`, which returns the tokens in the body.

## Deletions (soft delete)

Records are never physically deleted: deleting sets `deleted_at`, restoring
clears it. Lists show only active records; support can view and recover deleted
ones. Details in `PLAN.md` §3.3.

## Known issues

- `/ready` timing out → check `DATABASE_SSL="false"` in `.env` (see `PLAN.md` §8).
- pnpm asking for TTY confirmation → `$env:CI = "true"` before commands.

## Frontend (`frontend/`)

React 19 + Vite + Tailwind with the Stitch theme, mobile-first. Start:

```powershell
cd frontend
Copy-Item .env.example .env   # optional: default = http://localhost:3000/api/v1
pnpm install
pnpm dev                      # http://localhost:5173 (backend must run)
```

Open **`http://localhost:5173`**, not `127.0.0.1`: the backend allows a single
CORS origin and session cookies are host-scoped, so from `127.0.0.1` login and
refresh fail (the dev server redirects to `localhost` anyway).

Login with `demo@example.com / DemoPass123` (after `pnpm db:seed` in backend).
Pages: real-data dashboard, transactions, debts/installments, categories
(all with trash and restore). AI and savings goals: static placeholders.

## Roadmap

1. JWT auth (register/login/refresh) + hardening (helmet, rate-limit) ✅
2. Categories, transactions, debts/installments CRUD + dashboard ✅
3. Zod validation, `trash`/`restore` endpoints for support ✅
4. React + Vite frontend (done: dashboard, transactions, debts, categories)
5. AI suggestions for debt payoff and savings

## License

TBD.
