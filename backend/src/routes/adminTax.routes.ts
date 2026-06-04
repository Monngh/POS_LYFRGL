import { Router } from "express"
import {
    getTaxes,
    createTax,
    updateTax,
    updateTaxStatus,
    createProductTax,
    deleteProductTax,
    getProductTaxes,
    syncProductTaxes,
} from "../controllers/adminTax.controller"
import { authenticateJWT } from "../middlewares/auth.middleware";

const router = Router()

router.get("/taxes", authenticateJWT, getTaxes)
router.post("/taxes", authenticateJWT, createTax)
router.put("/taxes", authenticateJWT, updateTax)
router.put("/taxes/status", authenticateJWT, updateTaxStatus)
router.get("/products/:productId/taxes", authenticateJWT, getProductTaxes)
router.put("/products/:productId/taxes", authenticateJWT, syncProductTaxes)
router.post("/taxes/product", authenticateJWT, createProductTax)
router.delete("/taxes/product", authenticateJWT, deleteProductTax)

export default router;
