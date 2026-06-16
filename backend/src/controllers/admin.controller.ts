import { Request, Response } from "express";
import { prisma } from "../app";
import { parseReportDateRange } from "../utils/dateRange.util";
import { logger } from "../utils/logger";
import { AppError } from "../utils/AppError";
import {
  listCashSessions as listCashSessionsService,
  getCashSessionDetail as getCashSessionDetailService,
  forceCloseCashSession as forceCloseCashSessionService,
  listBankDeposits as listBankDepositsService,
} from "../services/adminCash.service";

/**
 * Controlador del Panel Administrativo Central (módulos de gestión).
 * Todas las rutas están protegidas por JWT + rol ADMIN/GERENTE (ver admin.routes.ts).
 *
 * NOTA Prisma/SQL Server:
 *  - El conector de SQL Server NO admite `mode: "insensitive"`; se omite a propósito.
 *  - No se comparan dos columnas dentro de `where`; los cálculos columna-vs-columna
 *    (p. ej. stock <= minStock) se resuelven en memoria sobre conjuntos pequeños.
 *  - Los valores Decimal se normalizan con Number() antes de enviarse al cliente.
 */

// Lee el filtro de sucursal de la query (?branchId=). "all"/vacío => todas.
const parseBranch = (req: Request): number | undefined => {
  if (req.user && req.user.role === "GERENTE") {
    return req.user.branchId;
  }
  const b = req.query.branchId as string | undefined;
  return b && b !== "all" && !isNaN(Number(b)) ? Number(b) : undefined;
};

const trimQuery = (v: unknown): string | undefined => {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length > 0 ? s : undefined;
};

// ===========================================================================
// RE-EXPORTS — Modules extracted to dedicated controllers (Phase 4A)
// admin.routes.ts imports from this file; it continues to work without changes.
// ===========================================================================

export { listBranches, createBranch, updateBranch } from "./adminBranch.controller";

export { listEmployees, createEmployee, updateEmployee, getEmployeeOperations } from "./adminEmployee.controller";

export { listCustomers, createCustomer, updateCustomer } from "./adminCustomer.controller";

export {
  createProduct,
  listProducts,
  getProductDetail,
  updateProduct,
  deleteProduct,
  listSuppliers,
  createSupplier,
  updateSupplier,
  getSupplierProducts,
  assignProductToSupplier,
  removeProductFromSupplier,
  getProductSuppliers,
} from "./adminProduct.controller";

export { listPurchases, createPurchase, receivePurchase, registerPurchase } from "./adminPurchase.controller";

export { listInventory, listKardex, adjustInventory, transferInventory } from "./adminInventory.controller";

// ===========================================================================
// VENTAS
// ===========================================================================
export const listSales = async (req: Request, res: Response): Promise<void> => {
  try {
    const branchId = parseBranch(req);
    const status = req.query.status as string | undefined;
    const search = trimQuery(req.query.search);
    const from = trimQuery(req.query.from);
    const to = trimQuery(req.query.to);

    const where: any = {};
    if (branchId) where.branchId = branchId;
    if (status && status !== "all") where.status = status;
    if (search) where.invoiceNumber = { contains: search };
    if (from || to) {
      const createdAt: any = {};
      if (from) createdAt.gte = new Date(`${from}T00:00:00`);
      if (to) createdAt.lte = new Date(`${to}T23:59:59.999`);
      where.createdAt = createdAt;
    }

    const sales = await prisma.sale.findMany({
      where,
      take: 100,
      orderBy: { createdAt: "desc" },
      include: {
        branch: { select: { name: true } },
        user: { select: { name: true } },
        customer: { select: { name: true } },
        _count: { select: { saleDetails: true } },
      },
    });

    const mapped = sales.map((s) => ({
      id: s.id,
      invoiceNumber: s.invoiceNumber,
      createdAt: s.createdAt,
      branch: s.branch.name,
      cajero: s.user.name,
      customer: s.customer?.name ?? "Público General",
      items: s._count.saleDetails,
      totalAmount: Number(s.totalAmount),
      taxAmount: Number(s.taxAmount),
      paymentMethod: s.paymentMethod,
      status: s.status,
      cfdiUuid: s.cfdiUuid,
    }));

    res.status(200).json({ sales: mapped });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ message: "Error al listar ventas." });
  }
};

export const getSaleDetail = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ message: "Identificador de venta inválido." });
      return;
    }

    const sale = await prisma.sale.findUnique({
      where: { id },
      include: {
        branch: { select: { name: true } },
        user: { select: { name: true } },
        customer: { select: { name: true } },
        saleDetails: { include: { product: { select: { name: true, sku: true } } } },
      },
    });

    if (!sale) {
      res.status(404).json({ message: "Venta no encontrada." });
      return;
    }

    if (req.user && req.user.role === "GERENTE" && sale.branchId !== req.user.branchId) {
      res.status(403).json({ message: "Acceso denegado. Esta venta pertenece a otra sucursal." });
      return;
    }

    res.status(200).json({
      sale: {
        id: sale.id,
        invoiceNumber: sale.invoiceNumber,
        createdAt: sale.createdAt,
        branch: sale.branch.name,
        cajero: sale.user.name,
        customer: sale.customer?.name ?? "Público General",
        paymentMethod: sale.paymentMethod,
        status: sale.status,
        subtotal: Number(sale.totalAmount) - Number(sale.taxAmount),
        taxAmount: Number(sale.taxAmount),
        discountAmount: Number(sale.discountAmount),
        totalAmount: Number(sale.totalAmount),
        items: sale.saleDetails.map((d) => ({
          sku: d.product.sku,
          name: d.product.name,
          quantity: d.quantity,
          unitPrice: Number(d.unitPrice),
          importe: Number(d.unitPrice) * d.quantity,
        })),
      },
    });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ message: "Error al obtener el detalle de la venta." });
  }
};

// ===========================================================================
// CAJAS (sesiones de caja) — DB logic delegated to adminCash.service.ts
// ===========================================================================
export const listCashSessions = async (req: Request, res: Response): Promise<void> => {
  try {
    const sessions = await listCashSessionsService({
      branchId: parseBranch(req),
      status: req.query.status as string | undefined,
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
      userId: req.query.userId as string | undefined,
    });
    res.status(200).json({ sessions });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ message: "Error al listar las sesiones de caja." });
  }
};

export const getCashSessionDetail = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ message: "Identificador de sesión inválido." }); return; }

    const requester = req.user ? { role: req.user.role, branchId: req.user.branchId } : undefined;
    const detail = await getCashSessionDetailService(id, requester);

    if (!detail) { res.status(404).json({ message: "Sesión de caja no encontrada." }); return; }

    res.status(200).json(detail);
  } catch (error: any) {
    if (error instanceof AppError) { res.status(error.statusCode).json({ message: error.message }); return; }
    console.error(error);
    res.status(500).json({ message: "Error al cargar el detalle de la sesión." });
  }
};

export const forceCloseCashSession = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ message: "Identificador de sesión inválido." }); return; }

    const { reason, forcedBy } = req.body;
    if (!reason || typeof reason !== "string" || !reason.trim()) {
      res.status(400).json({ message: "El motivo de cierre es requerido." });
      return;
    }

    const requester = req.user ? { role: req.user.role, branchId: req.user.branchId } : undefined;
    const result = await forceCloseCashSessionService(
      id,
      String(reason).trim(),
      forcedBy ? Number(forcedBy) : undefined,
      requester
    );

    res.status(200).json({
      message: "Caja cerrada forzadamente. Se generó el reporte de corte Z.",
      session: result.closedSession,
      cut: { ...result.cut, totalMercadoPago: result.totalMercadoPago },
    });
  } catch (error: any) {
    if (error instanceof AppError) { res.status(error.statusCode).json({ message: error.message }); return; }
    console.error(error);
    res.status(500).json({ message: "Error al cerrar la caja forzadamente." });
  }
};

export const listBankDeposits = async (req: Request, res: Response): Promise<void> => {
  try {
    const deposits = await listBankDepositsService({
      branchId: parseBranch(req),
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
      account: req.query.account as string | undefined,
    });

    logger.debug(`Encontrados ${deposits.length} depósitos`);
    res.status(200).json({ deposits });
  } catch (error: any) {
    console.error("Error en listBankDeposits:", error);
    res.status(500).json({ message: "Error al listar los depósitos bancarios." });
  }
};

// ===========================================================================
// REPORTES (resumen por rango de fechas)
// ===========================================================================
export const getReports = async (req: Request, res: Response): Promise<void> => {
  try {
    const branchId = parseBranch(req);
    const range = parseReportDateRange(req.query);
    if (range.errorStatus) {
      res.status(range.errorStatus).json({ message: range.errorMessage });
      return;
    }
    const { from, to } = range;

    const rangeFilter = { createdAt: { gte: from, lte: to } };
    const branchFilter = branchId ? { branchId } : {};
    const completedWhere = { ...branchFilter, ...rangeFilter, status: "COMPLETADA" };

    const [
      totalsAgg,
      cancelledCount,
      byPaymentRaw,
      byBranchRaw,
      completedSales,
      branches,
      salesListRaw,
    ] = await Promise.all([
      prisma.sale.aggregate({
        where: completedWhere,
        _sum: { totalAmount: true, taxAmount: true, discountAmount: true },
        _count: { _all: true },
      }),
      prisma.sale.count({ where: { ...branchFilter, ...rangeFilter, status: "CANCELADA" } }),
      prisma.sale.groupBy({
        by: ["paymentMethod"],
        where: completedWhere,
        _sum: { totalAmount: true },
        _count: { _all: true },
      }),
      prisma.sale.groupBy({
        by: ["branchId"],
        where: completedWhere,
        _sum: { totalAmount: true },
        _count: { _all: true },
      }),
      prisma.sale.findMany({ where: completedWhere, select: { id: true } }),
      prisma.branch.findMany({
        where: {
          active: true,
          ...(req.user && req.user.role === "GERENTE" ? { id: req.user.branchId } : {}),
        },
        select: { id: true, name: true },
        orderBy: { id: "asc" },
      }),
      prisma.sale.findMany({
        where: { ...branchFilter, ...rangeFilter },
        select: {
          id: true, invoiceNumber: true, createdAt: true, totalAmount: true,
          taxAmount: true, discountAmount: true, status: true,
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const saleIds = completedSales.map((s) => s.id);

    let utilidad = 0;
    let topProducts: { id: number; name: string; unidades: number; importe: number }[] = [];
    let taxBreakdown: { taxName: string; taxRate: number; total: number }[] = [];
    let taxByProduct: { productId: number; name: string; sku: string; totalTax: number }[] = [];
    let ivaAmount = 0;
    let iepsAmount = 0;
    let otherTaxesAmount = 0;

    if (saleIds.length > 0) {
      const [detailsForProfit, topRaw, saleDetailTaxes] = await Promise.all([
        prisma.saleDetail.findMany({
          where: { saleId: { in: saleIds } },
          select: { quantity: true, unitPrice: true, costPrice: true },
        }),
        prisma.saleDetail.groupBy({
          by: ["productId"],
          where: { saleId: { in: saleIds } },
          _sum: { quantity: true },
          orderBy: { _sum: { quantity: "desc" } },
          take: 8,
        }),
        prisma.saleDetailTax.findMany({
          where: { saleDetail: { saleId: { in: saleIds } } },
          include: {
            saleDetail: {
              select: { productId: true, product: { select: { name: true, sku: true } } },
            },
          },
        }),
      ]);

      utilidad = detailsForProfit.reduce(
        (acc, d) => acc + (Number(d.unitPrice) - Number(d.costPrice)) * d.quantity,
        0
      );

      const topIds = topRaw.map((t) => t.productId);
      const info = await prisma.product.findMany({
        where: { id: { in: topIds } },
        select: { id: true, name: true, sellPrice: true },
      });
      const byId = new Map(info.map((p) => [p.id, p]));
      topProducts = topRaw.map((t) => {
        const prod = byId.get(t.productId);
        const unidades = Number(t._sum.quantity ?? 0);
        return {
          id: t.productId,
          name: prod?.name ?? `Producto #${t.productId}`,
          unidades,
          importe: unidades * Number(prod?.sellPrice ?? 0),
        };
      });

      const taxBreakdownMap = new Map<string, { taxName: string; taxRate: number; total: number }>();
      const taxByProductMap = new Map<number, { productId: number; name: string; sku: string; totalTax: number }>();

      for (const sdt of saleDetailTaxes) {
        const amount = Number(sdt.taxAmount);
        const name = sdt.taxName;
        const rate = Number(sdt.taxRate);

        if (!taxBreakdownMap.has(name)) {
          taxBreakdownMap.set(name, { taxName: name, taxRate: rate, total: 0 });
        }
        taxBreakdownMap.get(name)!.total += amount;

        const nameUpper = name.toUpperCase();
        if (nameUpper.includes("IVA")) {
          ivaAmount += amount;
        } else if (nameUpper.includes("IEPS")) {
          iepsAmount += amount;
        } else {
          otherTaxesAmount += amount;
        }

        const prodId = sdt.saleDetail.productId;
        const prodName = sdt.saleDetail.product.name;
        const prodSku = sdt.saleDetail.product.sku;

        if (!taxByProductMap.has(prodId)) {
          taxByProductMap.set(prodId, { productId: prodId, name: prodName, sku: prodSku, totalTax: 0 });
        }
        taxByProductMap.get(prodId)!.totalTax += amount;
      }

      const sumNewTaxes = saleDetailTaxes.reduce((acc, sdt) => acc + Number(sdt.taxAmount), 0);
      const totalTaxSum = Number(totalsAgg._sum.taxAmount ?? 0);
      const legacyTaxAmount = totalTaxSum - sumNewTaxes;

      if (legacyTaxAmount > 0.05) {
        ivaAmount += legacyTaxAmount;
        const legacyKey = "IVA 16% (Legacy)";
        if (!taxBreakdownMap.has(legacyKey)) {
          taxBreakdownMap.set(legacyKey, { taxName: legacyKey, taxRate: 0.16, total: 0 });
        }
        taxBreakdownMap.get(legacyKey)!.total += legacyTaxAmount;
      }

      taxBreakdown = Array.from(taxBreakdownMap.values()).map((tb) => ({
        ...tb,
        total: Number(tb.total.toFixed(2)),
      }));
      taxByProduct = Array.from(taxByProductMap.values()).map((tbp) => ({
        ...tbp,
        totalTax: Number(tbp.totalTax.toFixed(2)),
      })).sort((a, b) => b.totalTax - a.totalTax);
    }

    const ventasNetas = Number(totalsAgg._sum.totalAmount ?? 0);
    const ticketCount = totalsAgg._count._all;

    const branchNameById = new Map(branches.map((b) => [b.id, b.name]));

    const salesList = salesListRaw.map((s) => ({
      id: s.id,
      invoiceNumber: s.invoiceNumber,
      createdAt: s.createdAt,
      subtotal: Number(s.totalAmount) - Number(s.taxAmount),
      taxAmount: Number(s.taxAmount),
      totalAmount: Number(s.totalAmount),
      status: s.status,
    }));

    res.status(200).json({
      range: { from: from.toISOString(), to: to.toISOString() },
      totals: {
        ventasNetas,
        impuestos: Number(totalsAgg._sum.taxAmount ?? 0),
        ivaAmount: Number(ivaAmount.toFixed(2)),
        iepsAmount: Number(iepsAmount.toFixed(2)),
        otherTaxesAmount: Number(otherTaxesAmount.toFixed(2)),
        descuentos: Number(totalsAgg._sum.discountAmount ?? 0),
        utilidad,
        ticketCount,
        ticketPromedio: ticketCount > 0 ? ventasNetas / ticketCount : 0,
        canceladas: cancelledCount,
      },
      byPaymentMethod: byPaymentRaw.map((p) => ({
        method: p.paymentMethod,
        total: Number(p._sum.totalAmount ?? 0),
        count: p._count._all,
      })),
      byBranch: byBranchRaw
        .map((b) => ({
          id: b.branchId,
          name: branchNameById.get(b.branchId) ?? `Sucursal #${b.branchId}`,
          total: Number(b._sum.totalAmount ?? 0),
          count: b._count._all,
        }))
        .sort((a, b) => b.total - a.total),
      topProducts,
      taxBreakdown,
      taxByProduct,
      salesList,
    });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ message: "Error al generar los reportes." });
  }
};

export const getReportAuditLogs = async (req: Request, res: Response) => {
  try {
    const { from, to, userId, reportType } = req.query;

    const where: any = {};

    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from as string);
      if (to) {
        const toDate = new Date(to as string);
        toDate.setHours(23, 59, 59, 999);
        where.createdAt.lte = toDate;
      }
    }
    if (userId) where.userId = Number(userId);
    if (reportType) where.reportType = reportType as string;

    const logs = await prisma.reportAuditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 500,
      include: {
        user: { select: { id: true, name: true, email: true } },
        branch: { select: { id: true, name: true } },
      },
    });

    res.json({ logs });
  } catch (err) {
    console.error("[getReportAuditLogs]", err);
    res.status(500).json({ message: "Error al obtener logs de auditoría" });
  }
};
