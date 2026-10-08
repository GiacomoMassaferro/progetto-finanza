# Project Finance — linee guida progetto

Istruzioni permanenti per l'assistente su questo repo. README operativo:
`README.md`, piano dettagliato: `PLAN.md` (inglese, fonte autoritativa per
architettura, decisioni e storico).

## Contesto

- Root: `C:\Sviluppo\progetto-finanza` — `backend/` (Express 5 + Prisma 7 + MySQL 8,
  ESM, pnpm 11, Node 24), `frontend/` (React + Vite, pianificato, ora vuota).
- Shell: Windows PowerShell 5.1 — niente `&&`/`||`, usare `; if ($?) {...}`.
  Nei terminali non interattivi: `$env:CI = "true"` prima dei comandi pnpm.
- Comunicazione: italiano, risposte brevi e dirette, niente emoji.

## Regole di lavoro

- Prima di modificare: leggere i file coinvolti; dopo `edit` con vincoli di
  conservazione, rileggere la zona modificata.
- Mai Prisma nei controller (routes → controller → service → db).
- Mai `process.env` fuori da `backend/src/config/env.js`; mai `new PrismaClient`
  fuori da `backend/src/config/prisma.js`.
- Mai `DELETE` fisico: usare `softDelete.js` (`withAlive` nelle liste,
  `withDeleted` nel cestino, `softDelete`/`restore`).
- Errori client → `AppError(status, message)`; formato risposta errori:
  `{ error: { message, details? } }`.
- Verificare con esecuzione reale quando possibile (`db:validate`, `dev` +
  `/health` + `/ready`, test usa-e-getta con pulizia).
- Commentare sempre il codice scritto: ogni file, funzione ed elemento non
  banale deve avere un commento che spiega cosa fa e perché (conciso,
  in italiano).

## REGOLA OBBLIGATORIA — aggiornare PLAN.md

**A ogni modifica funzionale** (schema, endpoint, dipendenze, policy,
incidenti, tooling) aggiornare `PLAN.md` nello stesso intervento:

1. Riga nel §5 Changelog con **data odierna (YYYY-MM-DD)**.
2. Aggiornare le sezioni impattate (§2 architettura, §3 DB, §4 decisioni,
   §8 troubleshooting, §10 sicurezza, §11 roadmap).
3. Nuova scelta architetturale → nuova riga in §4 con data + motivazione.
4. Nuovo malfunzionamento/fix → nuova voce in §8 (sintomi → causa → fix) + data.
5. Spostare `Last updated` alla data della modifica.
6. Mai completare un task senza la voce PLAN corrispondente.
