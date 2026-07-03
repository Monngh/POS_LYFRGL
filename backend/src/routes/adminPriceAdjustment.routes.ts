import { Router } from "express";
import {
    applyPriceAdjustment,
    getPriceAdjustmentByIdController,
    getPriceAdjustmentHistoryController,
    getPriceAdjustmentProductsController,
    previewMassPriceAdjustment,
    resolvePriceAdjustmentProducts,
} from "../controllers/adminPriceAdjustment.controller";

import { authenticateJWT, authorizeRoles } from "../middlewares/auth.middleware";

const router = Router();

router.use(authenticateJWT);
router.use(authorizeRoles(["ADMIN"]));

router.post("/resolve-products", resolvePriceAdjustmentProducts);
router.post("/preview", previewMassPriceAdjustment);
router.post("/apply", applyPriceAdjustment);

router.get("/history", getPriceAdjustmentHistoryController);
router.get("/history/:id", getPriceAdjustmentByIdController);
router.get(
    "/history/:id/products",
    getPriceAdjustmentProductsController
);

export default router;
