import { Router } from "express";
import { createSale, getRecentSales, authorizeAndCancelSale, createBankDeposit, getRecentDeposits, confirmQrPayment } from "../controllers/sale.controller";
import { authenticateJWT } from "../middlewares/auth.middleware";

const router = Router();

// Todas las llamadas de ventas requieren autenticación
router.use(authenticateJWT);

router.post("/", createSale);
router.get("/recent", getRecentSales);
router.post("/authorize-cancel", authorizeAndCancelSale);
router.post("/bank-deposit", createBankDeposit);
router.get("/deposits", getRecentDeposits);
router.post("/confirm-qr", confirmQrPayment);

export default router;
