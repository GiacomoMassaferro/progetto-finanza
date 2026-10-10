import { Router } from "express";
import { auth } from "../../common/middlewares/auth.js";
import * as savingsController from "./savings.controller.js";

const router = Router();

// Tutte le rotte obiettivi richiedono autenticazione.
router.use(auth);

router.get("/", savingsController.list);
router.post("/", savingsController.create);
// Rotte fisse prima di /:id: altrimenti verrebbero lette come id.
router.get("/trash", savingsController.trash);
router.post("/:id/restore", savingsController.restoreItem);
router.get("/:id", savingsController.getById);
router.patch("/:id", savingsController.update);
router.delete("/:id", savingsController.remove);
router.post("/:id/deposit", savingsController.deposit);

export default router;
