import { Router } from "express";
import { getAdminMetrics } from "../controllers/dashboard.controller";
import { authenticateJWT, authorizeRoles } from "../middlewares/auth.middleware";

const router = Router();

// Las métricas del Panel Administrativo Central requieren JWT y rol ADMIN/GERENTE
router.use(authenticateJWT);
router.use(authorizeRoles(["ADMIN", "GERENTE"]));

router.get("/metrics", getAdminMetrics);

export default router;
