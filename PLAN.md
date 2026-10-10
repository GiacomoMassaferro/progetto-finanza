# Project Finance — PLAN.md

> Living project plan: architecture, decisions, history, operations and roadmap.
> **Update this file on every functional change (see §13).**

| Field | Value |
|---|---|
| Project (working name) | Project Finance |
| Mission | Portal that helps anyone manage debt and save money; AI provides payoff and saving suggestions without worsening the user's finances |
| Status | Backend foundation done — no auth, no business endpoints yet |
| Frontend | React + Vite (planned, `frontend/` currently empty) |
| Last updated | 2026-10-10 |
| Maintainer | @giaco |

---

## 1. Vision & scope

- **Problem:** getting into debt is easier than ever; prices keep rising.
- **Goal:** fewer debts, more savings — via tracking (transactions, debts, installments) plus AI guidance for payoff plans and sustainable saving.
- **Non-goals (for now):** production deploy (target undecided), multi-currency, bank sync.

## 2. Current architecture

### 2.1 Stack (pinned versions)

| Layer | Tech | Version | Notes |
|---|---|---|---|
| Runtime | Node.js | 24.18.0 | ESM (`"type": "module"`) |
| Package manager | pnpm | 11.27.1 | `devEngines` enforces `^11.9.0` |
| API | Express | 5.2.1 | JSON only, `limit: 100kb` |
| Security | helmet | 8.3.0 | default security headers |
| CORS | cors | 2.8.6 | `origin: [FRONTEND_URL]` array form — emits ACAO only on match |
| Hashing | bcryptjs | 3.0.3 | password hashing, cost 10 |
| Tokens | jsonwebtoken | 9.0.3 | access 15m + refresh 7d, rotation with single use |
| Validation | zod | 4.6.5 | all `*.schemas.js` via shared `parseOr400` helper → uniform `AppError(400, details[])` |
| Rate limit | express-rate-limit | 8.7.1 | 300/15min global on `/api`, 30/15min on `/api/v1/auth`, JSON 429 |
| Tests (dev) | vitest 5.0.3 + supertest 7.3.1 | `pnpm test` — integration vs real MySQL, throwaway `test-*` users, I-06 cleanup |
| AI | @langchain/core 1.2.17 | router + specialist runnables, zod-validated I/O; Gemini Flash wired in Phase 2 |
| Frontend | React 19 + Vite 8 + react-router 7 + Tailwind 3.4 | JS only, mobile-first, theme tokens from Stitch DESIGN.md, JWT client with auto-refresh |
| Frontend i18n | i18next + react-i18next | key-based `src/i18n/*.json` (en default + it/es/de, 142 keys), `pnpm i18n:check` parity script, Intl dates/numbers follow language |
| ORM | Prisma | 7.10.0 | `prisma-client-js` generator, MySQL provider |
| DB driver | @prisma/adapter-mariadb (mariadb connector) | 7.10.0 (3.4.5) | Prisma 7 requires a driver adapter |
| DB | MySQL | 8.4.10 (local) | `utf8mb4_unicode_ci` |
| Env | dotenv | 18.0.3 | validated once in `src/config/env.js` |

### 2.2 Backend layout

```text
backend/
  src/
    app.js                  # Express factory (middlewares, /health, /ready, 404, error handler)
    server.js               # bootstrap only: listen + graceful shutdown
    config/
      env.js                # loads .env, fail-fast validation, DATABASE_URL↔DATABASE_NAME check
      prisma.js             # PrismaClient singleton + PrismaMariaDb adapter (SSL via DATABASE_SSL)
    common/
      middlewares/notFound.js | errorHandler.js   # uniform { error: { message } } responses
      utils/AppError.js     # operational error with statusCode
      utils/asyncHandler.js # async wrapper -> next(err)
      utils/softDelete.js   # withAlive / withDeleted / softDelete / restore
  prisma/
    schema.prisma           # single source of truth for the DB
    migrations/             # 3 applied migrations (see §3.2)
  .env / .env.example / .gitignore
  package.json              # scripts: dev, start, db:validate, db:migrate, db:generate, db:studio
  prisma.config.ts          # CLI datasource (DATABASE_URL + SHADOW_DATABASE_URL)
```

### 2.3 Environment variables

| Var | Required | Default | Purpose |
|---|---|---|---|
| `NODE_ENV` | no | `development` | `development` = verbose errors + Prisma log |
| `PORT` | no | `3000` | HTTP port |
| `DATABASE_URL` | **yes** | — | Prisma CLI (migrations, Studio) |
| `SHADOW_DATABASE_URL` | **yes** | — | empty DB used by `migrate dev` to replay migrations |
| `DATABASE_HOST/PORT/USER/PASSWORD/NAME` | **yes** | — | runtime adapter; must describe the same DB as `DATABASE_URL` |
| `DATABASE_SSL` | no | `false` | `true` only in prod with valid certs (see incident I-01) |
| `FRONTEND_URL` | no | `http://localhost:5173` | single origin allowed by CORS; prod value e.g. `https://app.example.com` |
| `JWT_SECRET` | **yes** | — | signing secret, min 32 chars (fail-fast at boot); prod value from vault |
| `JWT_ACCESS_TTL` / `JWT_REFRESH_TTL` | no | `15m` / `7d` | token lifetimes (`Nm`/`Nh`/`Nd` format) |

### 2.4 API (current)

| Method & path | Auth | Description |
|---|---|---|
| `GET /health` | no | liveness, no DB touch |
| `GET /ready` | no | readiness, runs `SELECT 1` via Prisma |
| `GET /api/v1/status` | no | API info (`{ data: { name, version } }`), reachability check for the frontend |
| `POST /api/v1/auth/register` | no | body `{ email, password≥8, firstName?, lastName? }` → 201 `{ data: { user, tokens } }`, 409 on duplicate email |
| `POST /api/v1/auth/login` | no | body `{ email, password }` → 200 `{ data: { user, tokens } }`, 401 generic on bad credentials |
| `POST /api/v1/auth/refresh` | no | body `{ refreshToken }` → 200 new pair (single-use rotation), 401 on reuse/expiry |
| `GET /api/v1/auth/me` | **yes (Bearer access)** | 200 `{ data: { user } }`, 401 without/invalid token |
| `PATCH /api/v1/auth/me` | **yes (Bearer access)** | body `{ language: en\|it\|es\|de }` → 200 `{ data: { user } }`, saved to profile |
| `GET /api/v1/categories` | **yes** | list own active categories, `?page&limit(max100)&type=`, 200 `{ data: [], meta: { page, limit, total, pages } }` |
| `POST /api/v1/categories` | **yes** | body `{ name, type: INCOME\|EXPENSE, color? }` → 201 `{ data }` |
| `GET /api/v1/categories/:id` | **yes** | 200 `{ data }`, 404 if foreign/deleted/malformed id |
| `PATCH /api/v1/categories/:id` | **yes** | partial update → 200 `{ data }`, 404 if foreign/deleted |
| `DELETE /api/v1/categories/:id` | **yes** | soft delete → 200 `{ data: { id, deletedAt } }` |
| `GET /api/v1/transactions` | **yes** | list own active transactions, `?page&limit(max100)&type&categoryId&from&to`, ordered by date desc, 200 `{ data: [], meta }` (each item embeds `category: { id, name, type, color }`, `amount` as exact string) |
| `POST /api/v1/transactions` | **yes** | body `{ amount>0 max2dec, type, description?, transactionDate ISO, movementsCategoryId (own+active), debtPaymentId? }` → 201 `{ data }`, 404 on foreign category/installment |
| `GET /api/v1/transactions/:id` | **yes** | 200 `{ data }`, 404 if foreign/deleted/malformed id |
| `PATCH /api/v1/transactions/:id` | **yes** | partial update (category/installment re-checked) → 200 `{ data }` |
| `DELETE /api/v1/transactions/:id` | **yes** | soft delete → 200 `{ data: { id, deletedAt } }` |
| `GET /api/v1/debts` | **yes** | list own active debts with embedded payments, `?page&limit(max100)&status&debtType`, 200 `{ data: [], meta }` (amounts as exact strings) |
| `POST /api/v1/debts` | **yes** | body `{ creditorName, debtType, totalAmount, remainingAmount?=total, interestRate?=0, monthlyPayment, dueDayOfMonth? 1-31, startDate }` → 201 `{ data }` |
| `GET /api/v1/debts/:id` | **yes** | debt with active payments by due date → 200 `{ data }`, 404 if foreign/deleted |
| `PATCH /api/v1/debts/:id` | **yes** | partial update → 200 `{ data }` |
| `DELETE /api/v1/debts/:id` | **yes** | soft delete debt + its installments (one tx) → 200 `{ data: { id, deletedAt } }` |
| `GET /api/v1/debts/:id/payments` | **yes** | installments of own debt → 200 `{ data: [] }` |
| `POST /api/v1/debts/:id/payments` | **yes** | body `{ amount, dueDate }` → 201 `{ data }` |
| `PATCH /api/v1/debts/:id/payments/:paymentId` | **yes** | partial (PAID without paidDate auto-sets today) → 200 `{ data }` |
| `POST /api/v1/debts/with-installments` | **yes** | body `{ creditorName, debtType, totalAmount, interestRate?, tan?, taeg?, startDate, installments 1-60, firstDueDate }` → one tx creates debt + N monthly installments (equal, last adjusts cents) → 201 `{ data }` with embedded payments |
| `POST /api/v1/debts/:id/payments/:paymentId/pay` | **yes** | atomic: mark PAID + create linked EXPENSE transaction + scale remainder; auto `PAID_OFF` at zero → 200 `{ data: { payment, transaction, debt } }`, 409 if already paid |
| `POST /api/v1/ai/suggest` | **yes** | body `{ intent=payoff, locale? }` → LangChain router → deterministic avalanche engine on live data → 200 `{ data: { summary, items, warnings, snapshot, savings, projectedDebtFree } }` |
| `GET /api/v1/dashboard/summary` | **yes** | `?month=YYYY-MM` (default current): income/expenses/balance (exact strings), count, per-category totals with names, active debts (count + total remaining/monthly), overdue count + next 10 payments in 30 days → 200 `{ data }`, 400 on bad month |
| `GET /api/v1/{categories,transactions}/trash` | **yes** | soft-deleted rows of the user, paginated → 200 `{ data: [], meta }` |
| `POST /api/v1/{categories,transactions}/:id/restore` | **yes** | restore from trash → 200 `{ data }`, 404 if active/foreign |
| `GET /api/v1/debts/trash` | **yes** | soft-deleted debts with their deleted installments → 200 `{ data: [], meta }` |
| `POST /api/v1/debts/:id/restore` | **yes** | restores debt + installments (one tx) → 200 `{ data }` |
| `*` unknown | no | `404 { error: { message } }` via `notFound` |

Response conventions (binding for all future endpoints): success `{ data, meta? }`, errors `{ error: { message, details? } }`. API versioning prefix: `/api/v1/...`.

## 3. Database

### 3.1 Models (`prisma/schema.prisma`)

- `User` — email (unique), passwordHash, firstName?, lastName?, language (default `en`)
- `MovementsCategory` — per-user, `type: INCOME|EXPENSE`, color?
- `Debt` — creditorName, `debtType: BNPL|CREDIT_CARD|PERSONAL_LOAN|MORTGAGE|OTHER`, totals, interestRate (legacy), `tan?`/`taeg?` (effective rate: taeg ?? tan ?? interestRate), monthlyPayment, dueDayOfMonth?, startDate, `status: ACTIVE|PAID_OFF|DEFAULTED`
- `SavingsGoal` — per-user, name, targetAmount, currentAmount (default 0), `status: ACTIVE|REACHED|ARCHIVED`
- `DebtPayment` — installment: amount, dueDate, paidDate?, `status: PENDING|PAID|LATE`
- `Transaction` — amount, `type: INCOME|EXPENSE`, description?, transactionDate, optional link to DebtPayment
- `RefreshToken` — per-session row (`tokenHash` unique SHA-256, `expiresAt`); enables revocation + rotation. Ephemeral credential: expired/consumed rows are hard-deleted (exception to soft delete, see D-10)

Cross-cutting columns on every **domain** model: `createdAt`, `updatedAt`, `deletedAt?` (soft delete). `RefreshToken` is the exception (ephemeral credential, see D-10). FK deletes: `Cascade` on `userId`/`debtId`, `Restrict` on `Transaction→MovementsCategory` (never silently lose history), `SetNull` on `Transaction→DebtPayment`.

### 3.2 Migration history

| Date | Migration | Content |
|---|---|---|
| 2026-09-24 | `20260924095304_basic_db_scheme` | initial tables, enums, FKs |
| 2026-10-08 | `20261008113428_fix_schema_timestamps_indexes` | `created_at/updated_at` everywhere, `@@index` on FKs + `status` + `transaction_date`, `onDelete: Restrict` explicit, field renames (`remainingAmount`, `firstName`) |
| 2026-10-08 | `20261008114349_add_soft_delete` | `deleted_at NULL` + index on all 5 tables |
| 2026-10-08 | `20261008172500_add_refresh_tokens` | `refresh_tokens` table (hash unique, expiry + indexes) |
| 2026-10-10 | `20261010080732_add_user_language` | `users.language` VARCHAR(2) default `en` |
| 2026-10-10 | `20261010095609_add_tan_taeg_savings_goals` | `debts.tan/taeg` nullable + `savings_goals` table (target/current, status, soft delete) |

### 3.3 Soft-delete policy (binding)

- **Never `DELETE` rows** — use `softDelete(model, { id })` (`UPDATE … SET deleted_at=NOW()`).
- Public lists **always** filter `withAlive(...)` (`deleted_at IS NULL`).
- Support trash views use `withDeleted(...)`; recovery via `restore(model, { id })` (only touches already-deleted rows).
- Filter lives in `src/common/utils/softDelete.js` — services must reuse it, never hand-write `deletedAt: null`.
- Known limitation: `User.email` stays `UNIQUE` including soft-deleted rows (re-registering the same email is blocked until hard purge — acceptable for now, revisit with partial index or purge flow).

## 4. Decision log (ADR-lite)

| Date | ID | Decision | Rationale |
|---|---|---|---|
| 2026-10-08 | D-01 | Layered + per-module `src/` layout (routes→controller→service→db) | standard Express structure, testable (`createApp` factory) |
| 2026-10-08 | D-02 | Prisma schema = single source of truth; `example.sql` deleted | SQL dump had diverged (`ENUM('')`, typos, `DECIMAL(8,2)` vs `(10,2)`) |
| 2026-10-08 | D-03 | Fail-fast env validation + URL↔NAME coherence check | prevents recurrence of the `express_store` vs `express_finance` mismatch |
| 2026-10-08 | D-04 | `DATABASE_SSL=false` default for local dev | mariadb connector enables SSL by default and handshakes hang vs local MySQL w/o certs (incident I-01) |
| 2026-10-08 | D-05 | Soft delete via `deletedAt`, not negative IDs / trash tables / enum flag | keeps FK graph intact, trivial restore, free deletion timestamp; negative IDs break UNIQUE/autoincrement/ordering, trash tables duplicate schema |
| 2026-10-08 | D-06 | No new runtime deps for foundation (only express/dotenv/prisma) | zod/auth/logger deferred to feature steps to keep the base reviewable |
| 2026-10-08 | D-07 | Project guidelines in `AGENTS.md`, referenced via `.opencode/opencode.json` (`instructions`) | persistent assistant rules incl. the mandatory PLAN-update rule (§13), so it survives session restarts |
| 2026-10-08 | D-08 | CORS `origin` as array `[FRONTEND_URL]`, never plain string | cors string form emits ACAO unconditionally (incident I-05); array form validates the request origin |
| 2026-10-08 | D-09 | Global commenting rule (`~/.config/opencode/AGENTS.md` + project `AGENTS.md`) | all written code must carry concise comments explaining what/why, so future maintenance and debugging don't rely on memory |
| 2026-10-08 | D-10 | Refresh rotation with DB-backed single-use tokens; hard delete allowed only for consumed/expired tokens | rotation kills reuse attacks; tokens are ephemeral credentials (not user data), so physical delete on consume/expiry is correct hygiene — sole exception to the soft-delete rule |
| 2026-10-08 | D-11 | zod replaces hand-written validation (same `validateX` interface, shared `parseOr400` → `AppError(400)`) | declarative schemas, uniform `{ field: reason }` details, controllers untouched |
| 2026-10-08 | D-12 | debt restore revives installments too (mirror of remove, one tx) | trash/restore must be symmetric: deleting hides both, restoring revives both |
| 2026-10-08 | D-13 | shared `src/common/utils/money.js` — cents for math, `"0.00"` strings for API | `String(Decimal("300.00"))` yields `"300"` (incident I-07); single helper guarantees exact uniform amounts everywhere |
| 2026-10-09 | D-14 | frontend React+Vite+Tailwind3 (JS only, mobile-first), Stitch token names kept 1:1, `src/lib/api.js` with single-retry refresh | reusing Stitch class names makes porting markup direct; refresh-once-then-logout keeps sessions alive without loops |
| 2026-10-10 | D-15 | i18n key-based (react-i18next, 4 JSON dicts) instead of per-language components | one component set, new language = new file; `i18n:check` enforces key parity; backend messages stay as-is for MVP |
| 2026-10-10 | D-16 | profile `language` in DB as source of truth, browser language pre-login, no localStorage | cross-device sync needs server state; logged-out choice is session-only by design (predictable, no stale overrides) |
| 2026-10-10 | D-17 | LangChain.js router with explicit intent + deterministic stub chains, zod I/O contract | numbers never from LLM (Phase 2 narrative only); same contract covers rules now and LLM later; no auto-apply without user confirm |
| 2026-10-10 | D-18 | explicit TAN/TAEG columns (legacy `interestRate` kept as fallback) + `SavingsGoal` model; snapshot gains `savingsTotalCents` | the engine needs the true rate for early-payoff math; savings total lets the future LLM judge advance payments without draining the account |

## 5. Changelog (newest first — every entry dated)


- **2026-10-10** — Installment expense tool: `POST /debts/with-installments` (one tx: debt + N monthly installments, last adjusts cents) + Debts form with live rate estimate + i18n ×4 (151); 3 endpoint tests; live verified on :3001 (user server holds :3000 with older code — restart it to pick this up).
- **2026-10-10** — Debts paid-off view:


- **2026-10-10** — Debts paid-off view: Attivi/Estinti/Cestino tabs (`SegmentedTabs`, `?status=PAID_OFF` filter), read-only installments in paid-off view, i18n keys ×4 (145); build green, live verified on Marco data.
- **2026-10-10** — Cleanup fix:


- **2026-10-10** — Cleanup fix: plurals in payoff calculator (1 debito/N debiti, 1 rata/N rate in 4 locales + test), removed dead `dueParts()`, I-09 orphan-node rule; suite 33/33, build green.
- **2026-10-10** — TAN/TAEG + savings goals:


- **2026-10-10** — TAN/TAEG + savings goals: `debts.tan/taeg` nullable (effective rate taeg→tan→interestRate), `savings_goals` model + migration, debt API exposes both, AI snapshot gains `savingsTotalCents`; suite 32/32 green, DB clean.
- **2026-10-10** — AI-1b:


- **2026-10-10** — AI-1b: deterministic avalanche engine (`calculator.js`: rate-order payoff simulation, all surplus → savings fixed rule, aggregate-only LLM snapshot) + real payoff chain + `POST /ai/suggest`; contract extended (warnings/snapshot/savings); 9 new tests, suite 31/31 green; a wrong relative import broke 5 suites, fixed.
- **2026-10-10** — AI-1a:


- **2026-10-10** — AI-1a: `@langchain/core` + intent router (`payoff/savings/chat/unknown`) with deterministic stub chains and zod I/O contract (`src/modules/ai/`); 6 router tests, suite 22/22 green.
- **2026-10-10** — Profile language:


- **2026-10-10** — Profile language: `users.language` + migration, `PATCH /auth/me`, frontend browser-default + login selector + DB sync (no localStorage); backend tests 16/16, E2E verified (en→de→me), build green.
- **2026-10-10** — Frontend i18n (solution A):


- **2026-10-10** — Frontend i18n (solution A): react-i18next, `src/i18n/` with en (default) + it/es/de (142 keys each, `pnpm i18n:check` parity green), all components on `t()`, language selector in header + drawer, Intl numbers/dates follow language; build green, servers verified.
- **2026-10-10** — Root `package.json` with `pnpm start` launching backend :3000 + frontend :5173 together (`concurrently`); `install:all`, `build`, `test` shortcuts; verified live.


- **2026-10-10** — Root `package.json` with `pnpm start` launching backend :3000 + frontend :5173 together (`concurrently`); `install:all`, `build`, `test` shortcuts; verified live.
- **2026-10-10** — Drawer animation:


- **2026-10-10** — Drawer animation: subtle slide-in (200ms) + backdrop fade, quick slide-out (150ms) via CSS keyframes; close on backdrop/×/Esc/route change.
- **2026-10-10** — Mobile drawer menu replaces bottom tab bar (`AppShell`):


- **2026-10-10** — Mobile drawer menu replaces bottom tab bar (`AppShell`): hamburger in header (mobile only), slide-in panel with nav + account + logout, backdrop/Esc/route-change close; desktop top nav unchanged.
- **2026-10-10** — Frontend fix (I-08):


- **2026-10-10** — Frontend fix (I-08): lists crashed with `items.find of undefined` — `api()` dropped `meta` and pages read `.data` off the array; added `apiPaged()` returning `{ items, meta }`, pages adapted; build green, servers verified.


- **2026-10-10** — Frontend F3: operational pages Transactions (filters, create with comma-dot normalization, trash/restore), Debts (create, installments, pay with category, trash/restore with installments), Categories (create, inline rename, trash/restore, account box); Stitch sources deleted after porting.


- **2026-10-10** — Frontend F2: responsive Dashboard (one page, mobile-first) wired to real data — month selector, 4 KPIs, debts with payoff progress, upcoming/overdue payments, recent transactions; AI advisor + savings goals as marked static placeholders; demo login verified with live summary.
- **2026-10-10** — Frontend F1: Vite+React+router+Tailwind3 scaffold (JS only, mobile-first), theme from Stitch DESIGN.md (same class names), `src/lib/api.js` (JWT + single-retry refresh), AuthContext, login/register, protected Dashboard placeholder; `pnpm build` green, dev servers verified.
- **2026-10-08** — Automated tests:


- **2026-10-08** — Automated tests: vitest + supertest (`tests/`: auth 7, categories 6, pay 1), real-MySQL integration with throwaway users + I-06 cleanup; found incident I-07 (Decimal→string normalization) fixed via shared `money.js`; 14/14 green, DB clean (demo user only).
- **2026-10-08** — Backend Step 8 (finishing): zod replaces manual validation (same interface, `parseOr400` helper); `express-rate-limit` (300/15min global, 30/15min auth, JSON 429); `trash`+`restore` on categories/transactions/debts (debt restore revives installments); malformed JSON now 400 (was 500); `prisma/seed.js` demo + `db:seed` (idempotent); live verified (zod 400 details, 30×401 then 429, trash→restore cycles); test users cleaned, demo user kept.
- **2026-10-08** — Backend Step 7 (dashboard): `src/modules/dashboard/` with `GET /summary?month=` (groupBy aggregates, integer-cent math, per-category totals, active-debt sums, overdue + upcoming payments); 8 live checks passed (month filter excludes September row, empty month zeros, 400/401); test data cleaned.
- **2026-10-08** — Backend Step 6 (debts): `src/modules/debts/` (debts CRUD + installments CRUD + atomic `pay` creating the linked transaction, scaling remainder, auto `PAID_OFF` at zero; debt soft delete cascades to installments in one tx); 14 live checks passed (409 double-pay, 404 isolation, I-06 purge order for cleanup); test data cleaned.
- **2026-10-08** — Backend Step 5 (transactions): `src/modules/transactions/` CRUD (list paginated + filters type/categoryId/from-to, get, create with owned-category check, patch, soft delete; amounts exact strings, category embedded); 14 live checks passed (isolation, validation 400s, purge order I-06); test data cleaned.
- **2026-10-08** — Backend Step 4 (categories): `src/modules/categories/` CRUD (list paginated+filtered, get, create, patch, soft delete), all `auth`-protected and `userId`-scoped; 13 live checks passed (isolation 404, validation 400, soft delete hidden); test data cleaned.
- **2026-10-08** — Backend Step 3 (auth): `bcryptjs` + `jsonwebtoken`, `JWT_SECRET` fail-fast env, `refresh_tokens` model + migration, `auth` middleware + `auth` module (register/login/refresh/me, manual validation); 10 live checks passed (incl. rotation single-use, 401/409 negatives); test data cleaned.
- **2026-10-08** — Global commenting rule (`~/.config/opencode/AGENTS.md` + project `AGENTS.md`): all written code must be commented.

- **2026-10-08** — Backend Step 1: `/api/v1` router (`src/routes/v1.js`) with `GET /status`, mounted in `app.js`; `pnpm start` verified live (`/health`, `/ready`, `/api/v1/status`, JSON 404 all OK).
- **2026-10-08** — Project guidelines: `AGENTS.md` (working rules + mandatory PLAN-update rule) wired via `.opencode/opencode.json`; README.md (IT+EN) and PLAN.md created.
- **2026-10-08** — Soft delete: `deleted_at` + index on 5 models, migration `add_soft_delete`, `softDelete.js` helper (alive/deleted/softDelete/restore), cycle tested on live DB (hide→trash→restore OK).
- **2026-10-08** — Schema fix migration `fix_schema_timestamps_indexes` (timestamps, indexes, renames, explicit Restrict); DB in sync.
- **2026-10-08** — Backend foundation: `src/` layout (app/server/config/common), `/health` + `/ready`, central error handler + 404, `AppError`/`asyncHandler`, Prisma singleton with SSL flag; removed empty root `server.js`; scripts renamed (`dev/start/db:*`); `.env.example` + `.gitignore` added; `NODE_ENV/PORT/DATABASE_SSL` added to `.env`.
- **2026-10-08** — Incident I-01 fixed: `/ready` timeout caused by mariadb SSL handshake hang (see §8.2).
- **2026-09-24** — Initial DB: `schema.prisma` + `basic_db_scheme` migration.

## 6. Conventions (binding)

- ESM imports with explicit `.js` extensions; `src/server.js` contains no logic (test via `createApp()`).
- Errors: throw `AppError(status, message)` for client errors; unexpected → 500 + server log; dev responses may include `details`/`stack` (never in prod).
- Env access only via `src/config/env.js` export — never `process.env` elsewhere.
- Prisma access only via `src/config/prisma.js` singleton.
- Migrations: one logical change per migration, descriptive lowercase names (`add_soft_delete`).

## 7. Operations runbook

```powershell
cd backend
$env:CI = "true"        # works around pnpm TTY prompt in non-interactive shells
pnpm install
pnpm db:validate        # schema valid?
pnpm db:migrate         # apply pending migrations (needs shadow DB to exist & be empty)
pnpm db:generate        # regenerate client
pnpm dev                # node --watch src/server.js → http://localhost:3000
pnpm test               # vitest suite (needs MySQL up; uses throwaway test-* users)
```

Startup order: MySQL (3306) → `pnpm dev` → check `/health` then `/ready`.
Prereqs: Node 24, pnpm 11, MySQL 8.x with databases `express_finance` + empty `express_finance_shadow` and user `prisma_user`.
Smoke-test hygiene: `Stop-Job` does NOT kill child `node` processes — kill them (`Get-Process node | Stop-Process -Force`) or use `Start-Process`/`Stop-Process -Id`, else stale code keeps serving :3000 (see I-09).

## 8. Troubleshooting (known incidents)

### I-01 (2026-10-08) — `GET /ready` hangs, pool timeout after 10s
- **Symptoms:** TCP 3306 open, server greeting (`8.4.10`, `caching_sha2_password`) readable, but connector never completes handshake. `SELECT 1` via adapter times out.
- **Cause:** mariadb connector 3.x enables SSL by default; handshake stalls against local MySQL without (valid) certs.
- **Fix:** `ssl: false` in adapter, driven by `DATABASE_SSL` (default `false` local, `true` prod). Verified: `{"status":"ready","db":"up"}`.
- **If it recurs:** confirm `DATABASE_SSL` value, test raw TCP greeting (PowerShell `TcpClient` read), then connector with `ssl:false`.

### I-02 (2026-10-08) — pnpm aborts: `ABORTED_REMOVE_MODULES_DIR_NO_TTY`
- **Cause:** pnpm wants to recreate `node_modules` and asks for TTY confirmation.
- **Fix:** `$env:CI = "true"` before pnpm commands in scripts/non-TTY shells.

### I-03 — `Do not know how to serialize a BigInt`
- **Cause:** mariadb returns `COUNT`/integers as BigInt; `JSON.stringify` throws.
- **Fix:** convert (`String(id)` / custom replacer) at API boundary. Future: central serializer for BigInt + Decimal.

### I-04 — `DATABASE_NAME` ≠ DB in `DATABASE_URL`
- **Fix applied:** `env.js` throws at boot on mismatch. Keep the check.

### I-05 (2026-10-08) — CORS emitted `Access-Control-Allow-Origin` for foreign origins
- **Symptoms:** `curl -H "Origin: http://evil.example"` received `ACAO: http://localhost:5173` on both GET and preflight.
- **Cause:** `cors` string form (`origin: "url"`) is "fixed origin" mode — it sets ACAO unconditionally without comparing to the request `Origin` (verified in `cors/lib/index.js:configureOrigin`). Browsers would still block (mismatch), but the header must not be emitted.
- **Fix:** array form `origin: [FRONTEND_URL]` — validates and omits the header on mismatch. Verified 4 cases: foreign GET/preflight → no ACAO; Vite GET/preflight → ACAO present.

### I-06 (2026-10-08) — hard-deleting a user fails with FK violation on `transactions`
- **Symptoms:** `prisma.user.delete()` → P2003 `Foreign key constraint violated on (movements_category_id)` even though rows were soft-deleted.
- **Cause:** soft-deleted rows still exist; `Transaction→MovementsCategory Restrict` (plus category→user cascade blocked by live transaction rows) forbids the delete. Restrict working as designed.
- **Fix / rule:** hard purge order is mandatory — transactions → debt_payments → debts → categories → user. Support must follow this order for GDPR purges; normal flows never hard-delete (see §9).

### I-07 (2026-10-08) — amounts returned as `"300"` instead of `"300.00"`
- **Symptoms:** automated test expected `"300.00"`, API returned `"300"`.
- **Cause:** `String(Decimal("300.00"))` normalizes away trailing zeros (Decimal.js `toString`).
- **Fix:** shared `src/common/utils/money.js` (`toCents`/`moneyFromCents`/`toMoneyString`); all services return `"0.00"`-format strings. Found by the test suite — exactly what it is for.

### I-08 (2026-10-10) — frontend lists crash: `Cannot read properties of undefined (reading 'find')`
- **Symptoms:** all data pages (`/debts`, `/transactions`, `/categories`) blank; console points at `items.find`.
- **Cause:** list endpoints answer `{ data: [], meta }` but frontend `api()` returned only `payload.data` (dropping `meta`), and pages read `.data` off that array → `undefined`.
- **Fix:** new `apiPaged()` helper returning `{ items, meta }` in `src/lib/api.js`; pages adapted (`res.items`/`res.meta`); Dashboard simplified the same way. Rule: single-resource helpers return `data`, list helpers return `{ items, meta }`.

### I-09 (2026-10-10) — stale node processes serve old code on :3000
- **Symptoms:** smoke test returned 404 on `/ai/suggest` and 400 on valid PATCH tan/taeg while the automated suite was green.
- **Cause:** `Stop-Job` kills the PowerShell job but orphaned `node` children survive and keep the port with stale code.
- **Fix / rule:** after smoke tests kill node processes (`Get-Process node | Stop-Process -Force`), or launch the server with `Start-Process` + `Stop-Process -Id` (tracks the exact PID). Always re-run smoke after cleanup.

## 9. Backup & recovery

- **DB backup (run before every migration in prod):** `mysqldump -h HOST -u USER -p express_finance > backup_YYYYMMDD.sql`.
- **Soft-deleted data:** query `WHERE deleted_at IS NOT NULL`, restore with `restore()` helper — no backup needed for user-error deletions.
- **Hard purge (GDPR / unique-email conflict):** manual `DELETE` by support only, documented case-by-case until a purge flow exists.
- **Shadow DB:** must exist and be empty; CLI wipes it on every `migrate dev` — never point it at real data.

## 10. Security notes (current gaps — see roadmap)

- `.env` holds plaintext dev credentials — never commit (gitignored); prod secrets go to a vault/env manager.
- Auth live since 2026-10-08 (register/login/refresh/me, rotation, bcrypt cost 10). **All new `/api/v1` domain routes must require the `auth` middleware.** Rate limiting active (global + auth). Remaining: none on this front.
- Local `DATABASE_SSL=false` is dev-only; prod DB connections must use `DATABASE_SSL=true` with valid certs.
- `express.json({ limit: "100kb" })` + `x-powered-by` disabled + `helmet` headers + CORS restricted to `FRONTEND_URL` (array form, see I-05). `rate-limit` still to add with the auth step.

## 11. Roadmap

1. **Auth** — ✅ done 2026-10-08 (`bcryptjs` + JWT access 15m + refresh 7d with rotation; `helmet`/`cors`/`rate-limit` done).
2. **Domain CRUD** — categories ✅ 2026-10-08, transactions ✅ 2026-10-08, debts+payments ✅ 2026-10-08, `dashboard/summary` ✅ 2026-10-08.
3. **Validation & support** — zod ✅ 2026-10-08, `trash`/`restore` ✅ 2026-10-08, `rate-limit` ✅ 2026-10-08, seed ✅ 2026-10-08.
4. **Tooling** — vitest + supertest ✅ 2026-10-08 (14 tests, `pnpm test`); Docker/compose still open.
5. **Frontend** — F1 ✅, F2 ✅, F3 ✅ 2026-10-10 (transactions/debts/categories pages wired; Stitch sources deleted).
6. **AI layer** — AI-1a ✅, AI-1b ✅ 2026-10-10 (rules engine + `POST /ai/suggest`) → Phase 2 Gemini Flash narrative (lazy provider, same contract).

## 12. Glossary

- **Soft delete:** `deleted_at` timestamp instead of `DELETE`; reversible.
- **Shadow DB:** scratch database Prisma CLI uses to diff migrations.
- **Ready vs health:** `health` = process alive; `ready` = can serve (DB up).

## 13. How to update this file (mandatory)

1. **Every functional change** (schema, endpoint, dep, policy, incident) gets: a row in §5 Changelog with **today's date (YYYY-MM-DD)**, plus updates to the affected section (§2/§3/§4/§10/§11).
2. New architectural choice → append to §4 Decision log with date + rationale.
3. New malfunction/fix → append to §8 with symptoms → cause → fix + date.
4. `Last updated` (top) always moves to the change date; never commit code without the PLAN entry.
5. Keep English; keep rows short — link code (`path:line`), don't paste code.
