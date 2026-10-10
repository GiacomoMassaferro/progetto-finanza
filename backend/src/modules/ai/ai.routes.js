import { Router } from "express";
import { auth } from "../../common/middlewares/auth.js";
import * as aiController from "./ai.controller.js";

const router = Router();

// Tutte le rotte IA richiedono autenticazione (dati finanziari personali).
router.use(auth);

router.post("/suggest", aiController.suggest);

export default router;
