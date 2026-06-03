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
  listBranches,
  createBranch,
  updateBranch,
  createEmployee,
  getEmployeeOperations,
  listKardex,
  listBankDeposits,
  registerPurchase,
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
router.post("/employees", createEmployee);
router.get("/employees/:id/operations", getEmployeeOperations);

// Kardex (movimientos de inventario)
router.get("/kardex", listKardex);

// Compras (entrada de mercancía)
router.post("/purchases", registerPurchase);

// Depósitos bancarios
router.get("/bank-deposits", listBankDeposits);

// Sucursales
router.get("/branches", listBranches);
router.post("/branches", createBranch);
router.put("/branches/:id", updateBranch);

// Reportes
router.get("/reports", getReports);

export default router;
