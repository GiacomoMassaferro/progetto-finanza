import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env.js";
import { prisma } from "./config/prisma.js";
import { errorHandler } from "./common/middlewares/errorHandler.js";
import { notFound } from "./common/middlewares/notFound.js";
import { apiLimiter, probeLimiter } from "./common/middlewares/rateLimit.js";
import { asyncHandler } from "./common/utils/asyncHandler.js";
import v1Routes from "./routes/v1.js";

// Origin su loopback con qualsiasi porta (solo sviluppo): Vite slitta di
// porta se la 5173 è occupata. In produzione serve un unico origin esplicito.
function isLoopbackOrigin(origin) {
    try {
        const url = new URL(origin);
        const isHttp = url.protocol === "http:" || url.protocol === "https:";
        return (
            isHttp &&
            ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname.toLowerCase())
        );
    } catch {
        return false;
    }
}

export function createApp() {
    const app = express();

    app.disable("x-powered-by");
    // Dietro reverse proxy (nginx, ingress, load balancer): gli header
    // X-Forwarded-For servono a ricavare l'IP reale nei rate limit.
    // Il numero di hop è configurabile (0 = nessun proxy fidato).
    app.set("trust proxy", env.trustProxy);
    // Security headers (helmet) + JSON + CORS verso il frontend.
    app.use(helmet());
    app.use(express.json({ limit: "100kb" }));
    // Chiamata con l'Origin richiesto: ACAO viene emesso solo se coincide con
    // `FRONTEND_URL` (in sviluppo anche con loopback su altra porta, D-29),
    // altrimenti nessun header per origini estranee.
    // credentials: i cookie di sessione (refresh/CSRF) devono viaggiare
    // anche quando frontend e API sono su porte/origini diverse (D-28).
    app.use(
        cors({
            origin(origin, callback) {
                if (!origin) return callback(null, false);
                if (origin === env.frontendUrl) return callback(null, true);
                if (env.corsAllowLoopback && isLoopbackOrigin(origin)) {
                    return callback(null, true);
                }
                return callback(null, false);
            },
            credentials: true,
        }),
    );
    // Anti-abuso globale sulle API (il tetto stretto sull'auth sta in routes/v1.js).
    app.use("/api/", apiLimiter);

    // Sonda di liveness: il processo risponde (non tocca il DB).
    app.get(
        "/health",
        asyncHandler(async (_req, res) => {
            res.json({ status: "ok", timestamp: new Date().toISOString() });
        }),
    );

    // Sonda di readiness: DB raggiungibile via Prisma. Con tetto anti-abuso
    // perché tocca il DB a ogni richiesta.
    app.get(
        "/ready",
        probeLimiter,
        asyncHandler(async (_req, res) => {
            await prisma.$queryRaw`SELECT 1`;
            res.json({ status: "ready", db: "up" });
        }),
    );

    // API versionate: il frontend chiama sempre sotto /api/v1.
    app.use("/api/v1", v1Routes);

    app.use(notFound);
    app.use(errorHandler);

    return app;
}
