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
import { authenticateJWT, authorizeRoles } from "../middlewares/auth.middleware";

const router = Router()

router.use(authenticateJWT)
router.use(authorizeRoles(["ADMIN"]))

router.get("/taxes", getTaxes)
router.post("/taxes", createTax)
router.put("/taxes", updateTax)
router.put("/taxes/status", updateTaxStatus)
router.get("/products/:productId/taxes", getProductTaxes)
router.put("/products/:productId/taxes", syncProductTaxes)
router.post("/taxes/product", createProductTax)
router.delete("/taxes/product", deleteProductTax)

export default router;
