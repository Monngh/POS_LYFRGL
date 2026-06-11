import { Router } from "express";
import { createQRPreference, checkPaymentStatus, webhook } from "../controllers/mercadopago.controller";
import { authenticateJWT } from "../middlewares/auth.middleware";

const router = Router();

router.post("/qr-preference", authenticateJWT, createQRPreference);
router.get("/status/:externalReference", authenticateJWT, checkPaymentStatus);
router.post("/webhook", webhook);

export default router;
