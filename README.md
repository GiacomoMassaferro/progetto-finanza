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

## Variabili d'ambiente

Vedi `backend/.env.example`. Nota: in locale `DATABASE_SSL` resta `false`
(l'SSL attivo blocca l'handshake col MySQL locale); in produzione con
certificati validi va impostato a `true`.

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

## Environment variables

See `backend/.env.example`. Note: locally `DATABASE_SSL` stays `false`
(enabled SSL stalls the handshake with local MySQL); in production with valid
certificates set it to `true`.

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
