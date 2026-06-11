import { Router } from "express";
import { 
  getSessionStatus, 
  openSession, 
  closeSession, 
  getSessionStats,
  createPartialCut,
  getPartialCuts
} from "../controllers/cashSession.controller";
import { authenticateJWT } from "../middlewares/auth.middleware";
import { enforceCajaDevice } from "../middlewares/device.middleware";

const router = Router();

// Todas las rutas de caja están protegidas por JWT
router.use(authenticateJWT);

router.get("/status", getSessionStatus);
router.post("/open", openSession);
// Las operaciones sobre el turno solo pueden ejecutarse desde el equipo que lo abrió
router.post("/close", enforceCajaDevice, closeSession);
router.get("/stats", getSessionStats);
router.post("/cut", enforceCajaDevice, createPartialCut);
router.get("/cuts", getPartialCuts);

export default router;

