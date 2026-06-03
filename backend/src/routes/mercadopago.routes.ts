import { Router } from "express";
import { createQRPreference, checkPaymentStatus, webhook } from "../controllers/mercadopago.controller";

const router = Router();

router.post("/qr-preference", createQRPreference);
router.get("/status/:externalReference", checkPaymentStatus);
router.post("/webhook", webhook);

export default router;
