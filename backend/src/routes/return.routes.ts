import { Router } from "express";
import { getReturnEligibility, processReturn } from "../controllers/return.controller";
import { authenticateJWT } from "../middlewares/auth.middleware";
import { enforceCajaDevice } from "../middlewares/device.middleware";

const router = Router();

// Todas las llamadas de devoluciones requieren autenticación
router.use(authenticateJWT);

router.get("/eligible/:invoiceNumber", getReturnEligibility);
// Las devoluciones afectan la caja: solo desde el equipo donde se abrió el turno
router.post("/", enforceCajaDevice, processReturn);

export default router;
