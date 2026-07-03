import { Router } from "express";
import {
  listSales,
  getSaleDetail,
  listInventory,
  listCustomers,
  createCustomer,
  updateCustomer,
  listCashSessions,
  getCashSessionDetail,
  forceCloseCashSession,
  listEmployees,
  updateEmployee,
  getReports,
  listBranches,
  createBranch,
  updateBranch,
  createEmployee,
  getEmployeeOperations,
  listKardex,
  listBankDeposits,
  listSuppliers,
  createSupplier,
  updateSupplier,
  listPurchases,
  createPurchase,
  receivePurchase,
  createProduct,
  getNextProductSku,
  listProducts,
  getProductDetail,
  updateProduct,
  adjustInventory,
  transferInventory,
  getSupplierProducts,
  assignProductToSupplier,
  removeProductFromSupplier,
  getProductSuppliers,
  deleteProduct,
  getReportAuditLogs,
  cancelPurchase,
} from "../controllers/admin.controller";
import { auditReport } from "../middlewares/audit.middleware";
import {
  reportSales,
  reportProductsSold,
  reportBySeller,
  reportReceivables,
  reportExecutiveSummary,
  reportFilterOptions,
} from "../controllers/reports.controller";
import {
  getAdminReturns,
  getAdminReturnDetail,
  retryReturnRefund,
  createReturnCfdi,
} from "../controllers/return.controller";
import { createGlobalInvoiceController, getBillingHistoryController } from "../controllers/adminBilling.controller";
import { getCashierAccessLogs, auditUnlock, getAdminAccessLogs } from "../controllers/securityAudit.controller";
import { authenticateJWT, authorizeRoles } from "../middlewares/auth.middleware";

const router = Router();

// Todos los módulos administrativos requieren JWT
router.use(authenticateJWT);

// Ventas
router.get("/sales", authorizeRoles(["ADMIN", "GERENTE"]), listSales);
router.get("/sales/:id", authorizeRoles(["ADMIN", "GERENTE"]), getSaleDetail);

// Inventario
router.get("/inventory", authorizeRoles(["ADMIN", "GERENTE"]), auditReport("Existencias", "INVENTARIO"), listInventory);
router.post("/inventory/adjust", authorizeRoles(["ADMIN", "GERENTE"]), adjustInventory);
router.post("/inventory/transfer", authorizeRoles(["ADMIN", "GERENTE"]), transferInventory);

// Productos
router.get("/products", authorizeRoles(["ADMIN", "GERENTE"]), listProducts);
router.post("/products", authorizeRoles(["ADMIN"]), createProduct);
router.get("/products/next-sku", authorizeRoles(["ADMIN"]), getNextProductSku);
router.get("/products/:productId/suppliers", authorizeRoles(["ADMIN"]), getProductSuppliers);
router.get("/products/:id", authorizeRoles(["ADMIN", "GERENTE"]), getProductDetail);
router.put("/products/:id", authorizeRoles(["ADMIN"]), updateProduct);
router.delete("/products/:id", authorizeRoles(["ADMIN"]), deleteProduct);

// Clientes
router.get("/customers", authorizeRoles(["ADMIN", "GERENTE"]), listCustomers);
router.post("/customers", authorizeRoles(["ADMIN", "GERENTE"]), createCustomer);
router.put("/customers/:id", authorizeRoles(["ADMIN", "GERENTE"]), updateCustomer);

// Cajas
router.get("/cash-sessions", authorizeRoles(["ADMIN", "GERENTE"]), listCashSessions);
router.get("/cash-sessions/:id", authorizeRoles(["ADMIN", "GERENTE"]), getCashSessionDetail);
router.put("/cash-sessions/:id/force-close", authorizeRoles(["ADMIN", "GERENTE"]), forceCloseCashSession);

// Empleados
router.get("/employees", authorizeRoles(["ADMIN", "GERENTE"]), listEmployees);
router.post("/employees", authorizeRoles(["ADMIN", "GERENTE"]), createEmployee);
router.put("/employees/:id", authorizeRoles(["ADMIN", "GERENTE"]), updateEmployee);
router.get("/employees/:id/operations", authorizeRoles(["ADMIN", "GERENTE"]), getEmployeeOperations);

// Kardex (movimientos de inventario)
router.get("/kardex", authorizeRoles(["ADMIN", "GERENTE"]), auditReport("Kardex", "INVENTARIO"), listKardex);

// Proveedores
router.get("/suppliers", authorizeRoles(["ADMIN"]), listSuppliers);
router.post("/suppliers", authorizeRoles(["ADMIN"]), createSupplier);
router.put("/suppliers/:id", authorizeRoles(["ADMIN"]), updateSupplier);
router.get("/suppliers/:supplierId/products", authorizeRoles(["ADMIN"]), getSupplierProducts);
router.post("/suppliers/products/assign", authorizeRoles(["ADMIN"]), assignProductToSupplier);
router.post("/suppliers/products/remove", authorizeRoles(["ADMIN"]), removeProductFromSupplier);

// Compras (órdenes de compra)
router.get("/purchases", authorizeRoles(["ADMIN"]), auditReport("Compras", "COMPRAS"), listPurchases);
router.post("/purchases", authorizeRoles(["ADMIN"]), createPurchase);
router.put("/purchases/:id/receive", authorizeRoles(["ADMIN"]), receivePurchase);
router.put("/purchases/:id/cancel", authorizeRoles(["ADMIN"]), cancelPurchase);

// Depósitos bancarios
router.get("/bank-deposits", authorizeRoles(["ADMIN", "GERENTE"]), listBankDeposits);

// Sucursales
router.get("/branches", authorizeRoles(["ADMIN"]), listBranches);
router.post("/branches", authorizeRoles(["ADMIN"]), createBranch);
router.put("/branches/:id", authorizeRoles(["ADMIN"]), updateBranch);

// Reportes
router.get("/reports", authorizeRoles(["ADMIN", "GERENTE"]), auditReport("Resumen Ejecutivo", "VENTAS"), getReports);
router.get("/reports/executive-summary", authorizeRoles(["ADMIN", "GERENTE"]), auditReport("Resumen Ejecutivo", "VENTAS"), reportExecutiveSummary);
router.get("/reports/filter-options", authorizeRoles(["ADMIN", "GERENTE"]), reportFilterOptions);
router.get("/reports/sales", authorizeRoles(["ADMIN", "GERENTE"]), auditReport("Venta", "VENTAS"), reportSales);
router.get("/reports/products-sold", authorizeRoles(["ADMIN", "GERENTE"]), auditReport("Artículos Vendidos", "VENTAS"), reportProductsSold);
router.get("/reports/by-seller", authorizeRoles(["ADMIN", "GERENTE"]), auditReport("Operaciones por Vendedor", "PERSONAL"), reportBySeller);
router.get("/reports/receivables", authorizeRoles(["ADMIN", "GERENTE"]), auditReport("Cobranza", "VENTAS"), reportReceivables);
router.get("/reports/audit-logs", authorizeRoles(["ADMIN"]), getReportAuditLogs);

// Seguridad — bitácoras de accesos (inicios de sesión)
router.get("/security/cashier-access", authorizeRoles(["ADMIN"]), getCashierAccessLogs);
router.post("/security/audit-unlock", authorizeRoles(["ADMIN"]), auditUnlock);
router.post("/security/admin-access", authorizeRoles(["ADMIN"]), getAdminAccessLogs);

// Devoluciones (admin)
router.get("/returns", authorizeRoles(["ADMIN", "GERENTE"]), getAdminReturns);
router.get("/returns/:id", authorizeRoles(["ADMIN", "GERENTE"]), getAdminReturnDetail);
router.post("/returns/:id/retry-refund", authorizeRoles(["ADMIN", "GERENTE"]), retryReturnRefund);
router.post("/returns/:id/create-cfdi", authorizeRoles(["ADMIN", "GERENTE"]), createReturnCfdi);

// Facturación Global e Historial
router.post("/billing/global", authorizeRoles(["ADMIN"]), createGlobalInvoiceController);
router.get("/billing/history", authorizeRoles(["ADMIN"]), getBillingHistoryController);

export default router;
