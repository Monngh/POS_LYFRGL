import { Router } from "express";
import {
  createSale,
  getRecentSales,
  authorizeAndCancelSale,
  createBankDeposit,
  getRecentDeposits,
  confirmQrPayment,
  searchDeposits,
  getDepositById,
  confirmDeposit,
  cancelDeposit,
  syncDepositStatus,
  searchCustomers,
  registerCustomer,
  getSaleDetailForCashier
} from "../controllers/sale.controller";
import { authenticateJWT } from "../middlewares/auth.middleware";

const router = Router();

// Todas las llamadas de ventas requieren autenticación
router.use(authenticateJWT);

router.post("/", createSale);
router.get("/recent", getRecentSales);
router.post("/authorize-cancel", authorizeAndCancelSale);
router.post("/bank-deposit", createBankDeposit);
router.get("/deposits", getRecentDeposits);
router.get("/deposits/search", searchDeposits);
router.get("/deposits/:id", getDepositById);
router.post("/deposits/:id/confirm", confirmDeposit);
router.post("/deposits/:id/cancel", cancelDeposit);
router.post("/deposits/:id/sync", syncDepositStatus);
router.post("/confirm-qr", confirmQrPayment);
router.get("/detail", getSaleDetailForCashier);

// Clientes y Lealtad para Cajero
router.get("/customers/search", searchCustomers);
router.post("/customers", registerCustomer);

export default router;
