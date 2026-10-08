import { Router } from "express";
import { auth } from "../../common/middlewares/auth.js";
import * as transactionsController from "./transactions.controller.js";

const router = Router();

// Tutte le rotte transazioni richiedono autenticazione.
router.use(auth);

router.get("/", transactionsController.list);
router.post("/", transactionsController.create);
// Il cestino va prima di /:id: altrimenti "trash" verrebbe letto come id.
router.get("/trash", transactionsController.trash);
router.post("/:id/restore", transactionsController.restoreItem);
router.get("/:id", transactionsController.getById);
router.patch("/:id", transactionsController.update);
router.delete("/:id", transactionsController.remove);

export default router;
