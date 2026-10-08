import { Router } from "express";
import { auth } from "../../common/middlewares/auth.js";
import * as dashboardController from "./dashboard.controller.js";

const router = Router();

// Tutte le rotte dashboard richiedono autenticazione.
router.use(auth);

router.get("/summary", dashboardController.summary);

export default router;
