import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env.js";
import { prisma } from "./config/prisma.js";
import { errorHandler } from "./common/middlewares/errorHandler.js";
import { notFound } from "./common/middlewares/notFound.js";
import { apiLimiter } from "./common/middlewares/rateLimit.js";
import { asyncHandler } from "./common/utils/asyncHandler.js";
import v1Routes from "./routes/v1.js";

export function createApp() {
    const app = express();

    app.disable("x-powered-by");
    // Security headers (helmet) + JSON + CORS verso il frontend.
    app.use(helmet());
    app.use(express.json({ limit: "100kb" }));
    // Array (non stringa): cors emette ACAO solo se l'Origin
    // coincide, altrimenti nessun header per origini estranee.
    app.use(cors({ origin: [env.frontendUrl] }));
    // Anti-abuso globale sulle API (il tetto stretto sull'auth sta in routes/v1.js).
    app.use("/api/", apiLimiter);

    // Sonda di liveness: il processo risponde (non tocca il DB).
    app.get(
        "/health",
        asyncHandler(async (_req, res) => {
            res.json({ status: "ok", timestamp: new Date().toISOString() });
        }),
    );

    // Sonda di readiness: DB raggiungibile via Prisma.
    app.get(
        "/ready",
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
