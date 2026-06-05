import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

function formatValue(value: any): string {
  if (value === null || value === undefined) {
    return "NULL";
  }
  if (typeof value === "boolean") {
    return value ? "1" : "0";
  }
  if (value instanceof Date) {
    // Convierte la fecha al formato standard de SQL Server 'YYYY-MM-DD HH:mm:ss.fff'
    const pad = (n: number, l = 2) => String(n).padStart(l, "0");
    const y = value.getFullYear();
    const m = pad(value.getMonth() + 1);
    const d = pad(value.getDate());
    const hr = pad(value.getHours());
    const min = pad(value.getMinutes());
    const sec = pad(value.getSeconds());
    const ms = pad(value.getMilliseconds(), 3);
    return `'${y}-${m}-${d} ${hr}:${min}:${sec}.${ms}'`;
  }
  if (typeof value === "number") {
    return String(value);
  }
  // Para valores tipo Decimal de Prisma (decimal.js)
  if (typeof value === "object" && typeof value.toFixed === "function") {
    return String(value);
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function dumpTable(tableName: string, model: any, columns: string[]): Promise<string> {
  console.log(`  ⏳ Descargando registros de: ${tableName}...`);
  const records = await model.findMany();
  if (records.length === 0) {
    console.log(`  ⚠️  Tabla vacía: ${tableName}`);
    return `-- Sin registros en la tabla: ${tableName}\n\n`;
  }

  let sql = `-- =========================================================\n`;
  sql += `-- DATOS DE LA TABLA: ${tableName} (${records.length} registros)\n`;
  sql += `-- =========================================================\n`;
  sql += `SET IDENTITY_INSERT [dbo].[${tableName}] ON;\n\n`;

  for (const row of records) {
    const cols = columns.map((c) => `[${c}]`).join(", ");
    const vals = columns.map((c) => formatValue(row[c])).join(", ");
    sql += `INSERT INTO [dbo].[${tableName}] (${cols}) VALUES (${vals});\n`;
  }

  sql += `\nSET IDENTITY_INSERT [dbo].[${tableName}] OFF;\n`;
  sql += `GO\n\n`;
  console.log(`  ✅ Completada tabla: ${tableName} (${records.length} registros)`);
  return sql;
}

async function main() {
  const outputPath = path.join(__dirname, "../backup_data.sql");
  console.log(`🚀 Iniciando generación de volcado de datos SQL Server...`);

  let sqlOutput = `-- =========================================================\n`;
  sqlOutput += `-- RESPALDO DE DATOS POS LYFRGL\n`;
  sqlOutput += `-- Generado automáticamente en: ${new Date().toISOString()}\n`;
  sqlOutput += `-- =========================================================\n\n`;

  try {
    // 1. Branch
    sqlOutput += await dumpTable("Branch", prisma.branch, [
      "id",
      "name",
      "address",
      "phone",
      "active",
      "createdAt",
      "updatedAt",
    ]);

    // 2. User
    sqlOutput += await dumpTable("User", prisma.user, [
      "id",
      "email",
      "passwordHash",
      "pinCode",
      "name",
      "role",
      "active",
      "phone",
      "baseSalary",
      "commissionRate",
      "branchId",
      "createdAt",
      "updatedAt",
    ]);

    // 3. Product
    sqlOutput += await dumpTable("Product", prisma.product, [
      "id",
      "sku",
      "barcode",
      "name",
      "description",
      "costPrice",
      "sellPrice",
      "active",
      "isReturnable",
      "returnWindowDays",
      "trackingType",
      "satProductKey",
      "satUnitKey",
      "createdAt",
      "updatedAt",
    ]);

    // 4. Inventory
    sqlOutput += await dumpTable("Inventory", prisma.inventory, [
      "id",
      "productId",
      "branchId",
      "quantity",
      "minStock",
      "maxStock",
    ]);

    // 5. Customer
    sqlOutput += await dumpTable("Customer", prisma.customer, [
      "id",
      "name",
      "email",
      "phone",
      "taxId",
      "address",
      "creditLimit",
      "balance",
      "points",
      "zipCode",
      "taxRegime",
      "cfdiUse",
      "createdAt",
      "updatedAt",
    ]);

    // 6. TaxType
    sqlOutput += await dumpTable("TaxType", prisma.taxType, [
      "id",
      "name",
      "description",
      "rate",
      "active",
      "createdAt",
      "updatedAt",
    ]);

    // 7. ProductTax
    sqlOutput += await dumpTable("ProductTax", prisma.productTax, [
      "id",
      "productId",
      "taxTypeId",
    ]);

    // 8. StoreCredit
    sqlOutput += await dumpTable("StoreCredit", prisma.storeCredit, [
      "id",
      "code",
      "amount",
      "remaining",
      "active",
      "customerId",
      "createdAt",
      "updatedAt",
    ]);

    // 9. Supplier
    sqlOutput += await dumpTable("Supplier", prisma.supplier, [
      "id",
      "name",
      "rfc",
      "email",
      "phone",
      "address",
      "city",
      "state",
      "zipCode",
      "contactName",
      "active",
      "createdAt",
      "updatedAt",
    ]);

    // 10. SupplierProduct
    sqlOutput += await dumpTable("SupplierProduct", prisma.supplierProduct, [
      "id",
      "supplierId",
      "productId",
    ]);

    // 11. PromotionType
    sqlOutput += await dumpTable("PromotionType", prisma.promotionType, [
      "id",
      "name",
      "description",
    ]);

    // 12. Promotion
    sqlOutput += await dumpTable("Promotion", prisma.promotion, [
      "id",
      "name",
      "description",
      "promotionTypeId",
      "startDate",
      "endDate",
      "isActive",
      "value",
      "minQuantity",
      "payQuantity",
      "specialPrice",
      "createdAt",
      "updatedAt",
    ]);

    // 13. PromotionProduct
    sqlOutput += await dumpTable("PromotionProduct", prisma.promotionProduct, [
      "id",
      "promotionId",
      "productId",
    ]);

    // 14. CashSession
    sqlOutput += await dumpTable("CashSession", prisma.cashSession, [
      "id",
      "branchId",
      "userId",
      "openedAt",
      "closedAt",
      "initialAmount",
      "expectedAmount",
      "declaredAmount",
      "difference",
      "cashIn",
      "cashOut",
      "status",
      "createdAt",
      "updatedAt",
    ]);

    // 15. BankDeposit
    sqlOutput += await dumpTable("BankDeposit", prisma.bankDeposit, [
      "id",
      "accountNumber",
      "targetName",
      "amount",
      "paymentType",
      "comments",
      "reference",
      "status",
      "mercadoPagoPaymentId",
      "mercadoPagoStatus",
      "ticketUrl",
      "cashSessionId",
      "userId",
      "branchId",
      "confirmedAt",
      "cancelledAt",
      "cancelReason",
      "createdAt",
    ]);

    // 16. Sale
    sqlOutput += await dumpTable("Sale", prisma.sale, [
      "id",
      "invoiceNumber",
      "branchId",
      "userId",
      "customerId",
      "cashSessionId",
      "totalAmount",
      "taxAmount",
      "discountAmount",
      "paymentMethod",
      "cashReceived",
      "changeGiven",
      "status",
      "pointsEarned",
      "pointsRedeemed",
      "pointsDiscount",
      "cfdiEmail",
      "cfdiUuid",
      "cardType",
      "mercadoPagoPaymentId",
      "mercadoPagoReference",
      "mercadoPagoStatus",
      "mercadoPagoQrData",
      "refundStatus",
      "refundId",
      "refundDate",
      "refundAmount",
      "createdAt",
      "updatedAt",
    ]);

    // 17. SaleDetail
    sqlOutput += await dumpTable("SaleDetail", prisma.saleDetail, [
      "id",
      "saleId",
      "productId",
      "quantity",
      "unitPrice",
      "costPrice",
      "taxAmount",
      "discountAmount",
      "promotionId",
      "promotionLabel",
      "serialNumber",
      "batchNumber",
    ]);

    // 18. SaleDetailTax
    sqlOutput += await dumpTable("SaleDetailTax", prisma.saleDetailTax, [
      "id",
      "saleDetailId",
      "taxTypeId",
      "taxName",
      "taxRate",
      "taxAmount",
    ]);

    // 19. CashCut
    sqlOutput += await dumpTable("CashCut", prisma.cashCut, [
      "id",
      "cashSessionId",
      "createdAt",
      "totalSales",
      "totalCash",
      "totalCreditCard",
      "totalDebitCard",
      "totalRefunds",
      "netTotal",
      "cutNumber",
    ]);

    // 20. Return
    sqlOutput += await dumpTable("Return", prisma.return, [
      "id",
      "returnNumber",
      "saleId",
      "userId",
      "authorizedById",
      "reason",
      "type",
      "totalRefunded",
      "paymentMethod",
      "cashSessionId",
      "cfdiUuid",
      "exchangeSaleId",
      "createdAt",
      "updatedAt",
    ]);

    // 21. ReturnDetail
    sqlOutput += await dumpTable("ReturnDetail", prisma.returnDetail, [
      "id",
      "returnId",
      "productId",
      "saleDetailId",
      "quantity",
      "unitPrice",
      "taxAmount",
      "discountAmount",
      "destination",
      "serialNumber",
      "batchNumber",
    ]);

    // 22. PurchaseOrder
    sqlOutput += await dumpTable("PurchaseOrder", prisma.purchaseOrder, [
      "id",
      "supplierId",
      "branchId",
      "reference",
      "purchaseDate",
      "expectedDate",
      "subtotal",
      "tax",
      "total",
      "status",
      "notes",
      "createdBy",
      "receivedBy",
      "receivedDate",
      "createdAt",
      "updatedAt",
    ]);

    // 23. PurchaseDetail
    sqlOutput += await dumpTable("PurchaseDetail", prisma.purchaseDetail, [
      "id",
      "purchaseOrderId",
      "productId",
      "quantity",
      "unitCost",
      "subtotal",
      "createdAt",
      "updatedAt",
    ]);

    // 24. Kardex
    sqlOutput += await dumpTable("Kardex", prisma.kardex, [
      "id",
      "productId",
      "branchId",
      "userId",
      "quantityChange",
      "balanceAfter",
      "movementType",
      "reason",
      "purchaseOrderId",
      "createdAt",
    ]);

    fs.writeFileSync(outputPath, sqlOutput, "utf-8");
    console.log(`\n🎉 Volcado de base de datos generado exitosamente en:`);
    console.log(`📁 ${outputPath}\n`);
  } catch (error: any) {
    console.error("❌ Error en la generación del dump:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
