import { Router } from "express";
import {
  listSales,
  getSaleDetail,
  listInventory,
  listCustomers,
  createCustomer,
  listCashSessions,
  listEmployees,
  getReports,
} from "../controllers/admin.controller";
import { authenticateJWT, authorizeRoles } from "../middlewares/auth.middleware";

const router = Router();

// Todos los módulos administrativos requieren JWT y rol ADMIN/GERENTE
router.use(authenticateJWT);
router.use(authorizeRoles(["ADMIN", "GERENTE"]));

// Ventas
router.get("/sales", listSales);
router.get("/sales/:id", getSaleDetail);

// Inventario
router.get("/inventory", listInventory);

// Clientes
router.get("/customers", listCustomers);
router.post("/customers", createCustomer);

// Cajas
router.get("/cash-sessions", listCashSessions);

// Empleados
router.get("/employees", listEmployees);

// Reportes
router.get("/reports", getReports);

export default router;
