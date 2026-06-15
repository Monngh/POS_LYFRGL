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
} from "../controllers/admin.controller";
import { auditReport } from "../middlewares/audit.middleware";
import {
  reportSales,
  reportProductsSold,
  reportBySeller,
  reportReceivables,
} from "../controllers/reports.controller";
import {
  getAdminReturns,
  getAdminReturnDetail,
  retryReturnRefund,
  createReturnCfdi,
} from "../controllers/return.controller";
import { createGlobalInvoiceController, getBillingHistoryController } from "../controllers/adminBilling.controller";
import { authenticateJWT, authorizeRoles } from "../middlewares/auth.middleware";

const router = Router();

// Todos los módulos administrativos requieren JWT y rol ADMIN/GERENTE
router.use(authenticateJWT);
router.use(authorizeRoles(["ADMIN", "GERENTE"]));

// Ventas
router.get("/sales", listSales);
router.get("/sales/:id", getSaleDetail);

// Inventario
router.get("/inventory", auditReport("Existencias", "INVENTARIO"), listInventory);
router.post("/inventory/adjust", adjustInventory);
router.post("/inventory/transfer", transferInventory);

// Productos
router.get("/products", listProducts);
router.post("/products", createProduct);
router.get("/products/:productId/suppliers", getProductSuppliers);
router.get("/products/:id", getProductDetail);
router.put("/products/:id", updateProduct);
router.delete("/products/:id", deleteProduct);

// Clientes
router.get("/customers", listCustomers);
router.post("/customers", createCustomer);
router.put("/customers/:id", updateCustomer);

// Cajas
router.get("/cash-sessions", listCashSessions);
router.get("/cash-sessions/:id", getCashSessionDetail);
router.put("/cash-sessions/:id/force-close", forceCloseCashSession);

// Empleados
router.get("/employees", listEmployees);
router.post("/employees", createEmployee);
router.put("/employees/:id", updateEmployee);
router.get("/employees/:id/operations", getEmployeeOperations);

// Kardex (movimientos de inventario)
router.get("/kardex", auditReport("Kardex", "INVENTARIO"), listKardex);

// Proveedores
router.get("/suppliers", listSuppliers);
router.post("/suppliers", createSupplier);
router.put("/suppliers/:id", updateSupplier);
router.get("/suppliers/:supplierId/products", getSupplierProducts);
router.post("/suppliers/products/assign", assignProductToSupplier);
router.post("/suppliers/products/remove", removeProductFromSupplier);

// Compras (órdenes de compra — nueva arquitectura)
router.get("/purchases", auditReport("Compras", "COMPRAS"), listPurchases);
router.post("/purchases", createPurchase);
router.put("/purchases/:id/receive", receivePurchase);

// Depósitos bancarios
router.get("/bank-deposits", listBankDeposits);

// Sucursales
router.get("/branches", listBranches);
router.post("/branches", createBranch);
router.put("/branches/:id", updateBranch);

// Reportes
router.get("/reports", auditReport("Resumen Ejecutivo", "VENTAS"), getReports);
router.get("/reports/sales", auditReport("Venta", "VENTAS"), reportSales);
router.get("/reports/products-sold", auditReport("Artículos Vendidos", "VENTAS"), reportProductsSold);
router.get("/reports/by-seller", auditReport("Operaciones por Vendedor", "PERSONAL"), reportBySeller);
router.get("/reports/receivables", auditReport("Cobranza", "VENTAS"), reportReceivables);
router.get("/reports/audit-logs", authorizeRoles(["ADMIN"]), getReportAuditLogs);

// Devoluciones (admin)
router.get("/returns", getAdminReturns);
router.get("/returns/:id", getAdminReturnDetail);
router.post("/returns/:id/retry-refund", retryReturnRefund);
router.post("/returns/:id/create-cfdi", createReturnCfdi);

// Facturación Global e Historial
router.post("/billing/global", createGlobalInvoiceController);
router.get("/billing/history", getBillingHistoryController);

export default router;
