import { Router } from "express";
import { auth } from "../../common/middlewares/auth.js";
import * as categoriesController from "./categories.controller.js";

const router = Router();

// Tutte le rotte categorie richiedono autenticazione.
router.use(auth);

router.get("/", categoriesController.list);
router.post("/", categoriesController.create);
// Il cestino va prima di /:id: altrimenti "trash" verrebbe letto come id.
router.get("/trash", categoriesController.trash);
router.post("/:id/restore", categoriesController.restoreItem);
router.get("/:id", categoriesController.getById);
router.patch("/:id", categoriesController.update);
router.delete("/:id", categoriesController.remove);

export default router;
