import { Router } from "express";
import { getReturnEligibility, processReturn } from "../controllers/return.controller";
import { authenticateJWT } from "../middlewares/auth.middleware";

const router = Router();

// Todas las llamadas de devoluciones requieren autenticación
router.use(authenticateJWT);

router.get("/eligible/:invoiceNumber", getReturnEligibility);
router.post("/", processReturn);

export default router;
