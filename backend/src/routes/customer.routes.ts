import { Router } from "express";
import { 
  registerCustomerAccount, 
  loginCustomer, 
  getCustomerProfile, 
  updateCustomerProfile, 
  getCustomerInvoices,
  sendOtp,
  sendPasswordResetOtp,
  resetCustomerPassword
} from "../controllers/customer.controller";
import { authenticateJWT, authorizeRoles } from "../middlewares/auth.middleware";

const router = Router();

// Rutas públicas de clientes
router.post("/register", registerCustomerAccount);
router.post("/login", loginCustomer);
router.post("/otp/send", sendOtp);
router.post("/password/reset-otp", sendPasswordResetOtp);
router.post("/password/reset", resetCustomerPassword);

// Rutas protegidas (Requieren autenticación con rol CUSTOMER)
router.get("/profile", authenticateJWT, authorizeRoles(["CUSTOMER"]), getCustomerProfile);
router.put("/profile", authenticateJWT, authorizeRoles(["CUSTOMER"]), updateCustomerProfile);
router.get("/invoices", authenticateJWT, authorizeRoles(["CUSTOMER"]), getCustomerInvoices);

export default router;
