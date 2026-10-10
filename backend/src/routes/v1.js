import { Router } from "express";
import { authLimiter } from "../common/middlewares/rateLimit.js";
import aiRoutes from "../modules/ai/ai.routes.js";
import authRoutes from "../modules/auth/auth.routes.js";
import categoriesRoutes from "../modules/categories/categories.routes.js";
import dashboardRoutes from "../modules/dashboard/dashboard.routes.js";
import debtsRoutes from "../modules/debts/debts.routes.js";
import savingsRoutes from "../modules/savings/savings.routes.js";
import transactionsRoutes from "../modules/transactions/transactions.routes.js";

const router = Router();

// Info API: il frontend la usa per verificare versione e raggiungibilità.
router.get("/status", (_req, res) => {
    res.json({ data: { name: "project-finance-api", version: "v1" } });
});

// Moduli di dominio montati sotto /api/v1.
// L'auth ha il tetto stretto anti brute-force; il resto usa il tetto globale.
router.use("/auth", authLimiter, authRoutes);
router.use("/ai", aiRoutes);
router.use("/categories", categoriesRoutes);
router.use("/transactions", transactionsRoutes);
router.use("/debts", debtsRoutes);
router.use("/dashboard", dashboardRoutes);
router.use("/goals", savingsRoutes);

export default router;
