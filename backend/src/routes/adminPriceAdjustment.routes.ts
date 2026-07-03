import { Router } from "express";
import { resolvePriceAdjustmentProducts, previewMassPriceAdjustment } from "../controllers/adminPriceAdjustment.controller";
import { authenticateJWT, authorizeRoles } from "../middlewares/auth.middleware";

const router = Router();

router.use(authenticateJWT);
router.use(authorizeRoles(["ADMIN"]));

router.post("/resolve-products", resolvePriceAdjustmentProducts);
router.post("/preview", previewMassPriceAdjustment);

export default router;

