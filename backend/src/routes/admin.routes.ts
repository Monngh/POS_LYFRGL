import { Router } from "express";
import {
  listSales,
  getSaleDetail,
  listInventory,
  listCustomers,
  createCustomer,
  listCashSessions,
  getCashSessionDetail,
  forceCloseCashSession,
  listEmployees,
  getReports,
  listBranches,
  createBranch,
  updateBranch,
  createEmployee,
  getEmployeeOperations,
  listKardex,
  listBankDeposits,
  //registerPurchase,
  listSuppliers,
  createSupplier,
  updateSupplier,
  listPurchases,
  createPurchase,
  receivePurchase,
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
router.get("/cash-sessions/:id", getCashSessionDetail);
router.put("/cash-sessions/:id/force-close", forceCloseCashSession);

// Empleados
router.get("/employees", listEmployees);
router.post("/employees", createEmployee);
router.get("/employees/:id/operations", getEmployeeOperations);

// Kardex (movimientos de inventario)
router.get("/kardex", listKardex);

// Proveedores
router.get("/suppliers", listSuppliers);
router.post("/suppliers", createSupplier);
router.put("/suppliers/:id", updateSupplier);

// Compras (órdenes de compra — nueva arquitectura)
router.get("/purchases", listPurchases);
router.post("/purchases", createPurchase);
router.put("/purchases/:id/receive", receivePurchase);

// Depósitos bancarios
router.get("/bank-deposits", listBankDeposits);

// Sucursales
router.get("/branches", listBranches);
router.post("/branches", createBranch);
router.put("/branches/:id", updateBranch);

// Reportes
router.get("/reports", getReports);

export default router;
