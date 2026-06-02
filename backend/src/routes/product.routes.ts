import { Router } from "express";
import { searchProducts } from "../controllers/product.controller";
import { authenticateJWT } from "../middlewares/auth.middleware";

const router = Router();

// Todas las consultas de producto requieren autenticación
router.use(authenticateJWT);

router.get("/search", searchProducts);

export default router;
