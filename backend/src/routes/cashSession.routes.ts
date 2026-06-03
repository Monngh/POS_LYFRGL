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

const router = Router();

// Todas las rutas de caja están protegidas por JWT
router.use(authenticateJWT);

router.get("/status", getSessionStatus);
router.post("/open", openSession);
router.post("/close", closeSession);
router.get("/stats", getSessionStats);
router.post("/cut", createPartialCut);
router.get("/cuts", getPartialCuts);

export default router;

