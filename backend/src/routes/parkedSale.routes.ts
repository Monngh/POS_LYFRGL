import { Router } from "express";
import { authenticateJWT } from "../middlewares/auth.middleware";
import { parkSale, getParkedSales, deleteParkedSale } from "../controllers/parkedSale.controller";

const router = Router();

// Todas las rutas requieren estar autenticado (el userId se saca del token)
router.use(authenticateJWT);

router.post("/", parkSale);
router.get("/", getParkedSales);
router.delete("/:id", deleteParkedSale);

export default router;
