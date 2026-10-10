import { Router } from "express";
import { auth } from "../../common/middlewares/auth.js";
import * as debtsController from "./debts.controller.js";

const router = Router();

// Tutte le rotte debiti richiedono autenticazione.
router.use(auth);

router.get("/", debtsController.list);
router.post("/", debtsController.create);
// Rotta fissa prima di /:id: altrimenti "with-installments" verrebbe letto come id.
router.post("/with-installments", debtsController.createWithInstallments);
// Il cestino va prima di /:id: altrimenti "trash" verrebbe letto come id.
router.get("/trash", debtsController.trash);
router.post("/:id/restore", debtsController.restoreItem);
router.get("/:id", debtsController.getById);
router.patch("/:id", debtsController.update);
router.delete("/:id", debtsController.remove);

// Rate del debito: lista, creazione, modifica e pagamento.
router.get("/:id/payments", debtsController.listPayments);
router.post("/:id/payments", debtsController.createPayment);
router.patch("/:id/payments/:paymentId", debtsController.updatePayment);
router.post("/:id/payments/:paymentId/pay", debtsController.pay);

export default router;
