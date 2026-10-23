import { Router } from "express";
import { auth } from "../../common/middlewares/auth.js";
import * as authController from "./auth.controller.js";

const router = Router();

// Rotte pubbliche: registrazione, login e rinnovo token.
router.post("/register", authController.register);
router.post("/login", authController.login);
router.post("/refresh", authController.refresh);

// Rotta protetta: richiede `Authorization: Bearer <accessToken>`.
router.get("/me", auth, authController.me);
router.patch("/me", auth, authController.updateMe);

// Logout: revoca lato server la sessione (il refresh token e la sua famiglia).
router.post("/logout", auth, authController.logout);
// Logout da tutti i dispositivi: revoca tutte le sessioni attive.
router.post("/logout-all", auth, authController.logoutAll);

export default router;
