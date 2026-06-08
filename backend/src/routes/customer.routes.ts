import { Router } from "express";
import { 
  registerCustomerAccount, 
  loginCustomer, 
  getCustomerProfile, 
  updateCustomerProfile, 
  getCustomerInvoices 
} from "../controllers/customer.controller";
import { authenticateJWT, authorizeRoles } from "../middlewares/auth.middleware";

const router = Router();

// Rutas públicas de clientes
router.post("/register", registerCustomerAccount);
router.post("/login", loginCustomer);

// Rutas protegidas (Requieren autenticación con rol CUSTOMER)
router.get("/profile", authenticateJWT, authorizeRoles(["CUSTOMER"]), getCustomerProfile);
router.put("/profile", authenticateJWT, authorizeRoles(["CUSTOMER"]), updateCustomerProfile);
router.get("/invoices", authenticateJWT, authorizeRoles(["CUSTOMER"]), getCustomerInvoices);

export default router;
