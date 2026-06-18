import { Request, Response } from "express";
import { prisma } from "../app";
import { parseReportDateRange, type ValidatedDateRange } from "../utils/dateRange.util";

/**
 * Controlador de Reportes del Panel Administrativo Central.
 * Endpoints de SOLO LECTURA que agregan datos sobre tablas existentes.
 * No modifica el esquema ni escribe en la base de datos.
 *
 * Protegido por JWT + ADMIN/GERENTE (ver admin.routes.ts).
 */

const parseBranchId = (req: Request): number | undefined => {
  const b = req.query.branchId as string | undefined;
  return b && b !== "all" && !isNaN(Number(b)) ? Number(b) : undefined;
};

export const parseAndValidateRange = (req: Request): ValidatedDateRange => {
  const startDateParam = req.query.startDate || req.query.from;
  const endDateParam = req.query.endDate || req.query.to;

  if (startDateParam !== undefined) {
    if (typeof startDateParam !== "string" || !startDateParam || isNaN(Date.parse(startDateParam))) {
      return { from: new Date(), to: new Date(), errorStatus: 400, errorMessage: "Fecha inicial o fecha final inválida." };
    }
  }

  if (endDateParam !== undefined) {
    if (typeof endDateParam !== "string" || !endDateParam || isNaN(Date.parse(endDateParam))) {
      return { from: new Date(), to: new Date(), errorStatus: 400, errorMessage: "Fecha inicial o fecha final inválida." };
    }
  }

  const now = new Date();
  const fromStr = typeof startDateParam === "string" && startDateParam ? startDateParam : null;
  const toStr = typeof endDateParam === "string" && endDateParam ? endDateParam : null;

  const from = fromStr
    ? new Date(`${fromStr}T00:00:00`)
    : new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
  const to = toStr ? new Date(`${toStr}T23:59:59`) : now;

  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    return { from, to, errorStatus: 400, errorMessage: "Fecha inicial o fecha final inválida." };
  }

  if (from.getTime() > to.getTime()) {
    return { from, to, errorStatus: 400, errorMessage: "La fecha inicial no puede ser mayor que la fecha final." };
  }

  return { from, to };
};

// ===========================================================================
// VENTA — listado detallado de ventas por periodo
// ===========================================================================
export const reportSales = async (req: Request, res: Response): Promise<void> => {
  try {
    const branchId = parseBranchId(req);
    const range = parseReportDateRange(req.query);
    if (range.errorStatus) {
      res.status(range.errorStatus).json({ success: false, message: range.errorMessage });
      return;
    }
    const { from, to } = range;
    const status = req.query.status as string | undefined;

    const where: any = { createdAt: { gte: from, lte: to } };
    if (branchId) where.branchId = branchId;
    if (status && status !== "all") where.status = status;

    const pageQuery = req.query.page;
    const pageSizeQuery = req.query.pageSize;

    let page = 1;
    let pageSize = 50;

    if (pageQuery !== undefined) {
      const parsedPage = Number(pageQuery);
      if (isNaN(parsedPage) || !Number.isInteger(parsedPage) || parsedPage < 1) {
        res.status(400).json({ success: false, message: "El parámetro page debe ser un número entero mayor o igual a 1." });
        return;
      }
      page = parsedPage;
    }

    if (pageSizeQuery !== undefined) {
      const parsedPageSize = Number(pageSizeQuery);
      if (isNaN(parsedPageSize) || !Number.isInteger(parsedPageSize) || parsedPageSize < 1) {
        res.status(400).json({ success: false, message: "El parámetro pageSize debe ser un número entero mayor o igual a 1." });
        return;
      }
      pageSize = parsedPageSize;
    }

    const safePage = page;
    const safePageSize = Math.min(100, pageSize);
    const skip = (safePage - 1) * safePageSize;

    const [sales, total] = await Promise.all([
      prisma.sale.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: safePageSize,
        skip,
        include: {
          branch: { select: { name: true } },
          user: { select: { name: true } },
          customer: { select: { name: true } },
          _count: { select: { saleDetails: true } },
        },
      }),
      prisma.sale.count({ where })
    ]);

    const rows = sales.map((s) => {
      const totalAmount = Number(s.totalAmount);
      const tax = Number(s.taxAmount);
      return {
        id: s.id,
        invoiceNumber: s.invoiceNumber,
        createdAt: s.createdAt,
        branch: s.branch.name,
        cajero: s.user.name,
        customer: s.customer?.name ?? "Público General",
        items: s._count.saleDetails,
        paymentMethod: s.paymentMethod,
        subtotal: totalAmount - tax,
        taxAmount: tax,
        discountAmount: Number(s.discountAmount),
        totalAmount: totalAmount,
        status: s.status,
      };
    });

    const completed = rows.filter((r) => r.status === "COMPLETADA");
    const totalNeto = completed.reduce((a, r) => a + r.totalAmount, 0);
    const totals = {
      ticketCount: completed.length,
      totalNeto,
      subtotal: completed.reduce((a, r) => a + r.subtotal, 0),
      impuestos: completed.reduce((a, r) => a + r.taxAmount, 0),
      descuentos: completed.reduce((a, r) => a + r.discountAmount, 0),
      ticketPromedio: completed.length > 0 ? totalNeto / completed.length : 0,
      canceladas: rows.filter((r) => r.status === "CANCELADA").length,
    };

    res.status(200).json({
      rows,
      data: rows,
      totals,
      pagination: {
        page: safePage,
        pageSize: safePageSize,
        total,
        totalPages: Math.ceil(total / safePageSize),
        hasNextPage: safePage * safePageSize < total,
        hasPreviousPage: safePage > 1
      }
    });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ message: "Error al generar el reporte de ventas." });
  }
};

// ===========================================================================
// ARTÍCULOS VENDIDOS — ranking de productos por periodo
// ===========================================================================
export const reportProductsSold = async (req: Request, res: Response): Promise<void> => {
  try {
    const branchId = parseBranchId(req);
    const range = parseReportDateRange(req.query);
    if (range.errorStatus) {
      res.status(range.errorStatus).json({ success: false, message: range.errorMessage });
      return;
    }
    const { from, to } = range;

    const saleWhere: any = { status: "COMPLETADA", createdAt: { gte: from, lte: to } };
    if (branchId) saleWhere.branchId = branchId;

    const saleIds = (await prisma.sale.findMany({ where: saleWhere, select: { id: true } })).map((s) => s.id);

    if (saleIds.length === 0) {
      res.status(200).json({ rows: [], summary: { totalUnidades: 0, totalImporte: 0, totalUtilidad: 0, masVendido: null, menosVendido: null } });
      return;
    }

    const details = await prisma.saleDetail.findMany({
      where: { saleId: { in: saleIds } },
      select: { productId: true, quantity: true, unitPrice: true, costPrice: true, discountAmount: true },
    });

    const agg = new Map<number, { qty: number; importe: number; cost: number; tx: number }>();
    for (const d of details) {
      const e = agg.get(d.productId) ?? { qty: 0, importe: 0, cost: 0, tx: 0 };
      e.qty += d.quantity;
      e.importe += (Number(d.unitPrice) * d.quantity) - Number(d.discountAmount);
      e.cost += Number(d.costPrice) * d.quantity;
      e.tx += 1;
      agg.set(d.productId, e);
    }

    const ids = [...agg.keys()];
    const products = await prisma.product.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, sku: true } });
    const byId = new Map(products.map((p) => [p.id, p]));

    let rows = ids.map((id) => {
      const e = agg.get(id)!;
      const p = byId.get(id);
      return {
        productId: id,
        name: p?.name ?? `Producto #${id}`,
        sku: p?.sku ?? "",
        cantidad: e.qty,
        transacciones: e.tx,
        precioPromedio: e.qty > 0 ? e.importe / e.qty : 0,
        importe: e.importe,
        utilidad: e.importe - e.cost,
      };
    });
    rows.sort((a, b) => b.cantidad - a.cantidad);
    rows = rows.map((r, i) => ({ rank: i + 1, ...r }));

    const summary = {
      totalUnidades: rows.reduce((a, r) => a + r.cantidad, 0),
      totalImporte: rows.reduce((a, r) => a + r.importe, 0),
      totalUtilidad: rows.reduce((a, r) => a + r.utilidad, 0),
      masVendido: rows[0]?.name ?? null,
      menosVendido: rows[rows.length - 1]?.name ?? null,
    };

    res.status(200).json({ rows, summary });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ message: "Error al generar el reporte de artículos vendidos." });
  }
};

// ===========================================================================
// OPERACIONES / VENTAS POR VENDEDOR — agregado por usuario
// ===========================================================================
export const reportBySeller = async (req: Request, res: Response): Promise<void> => {
  try {
    const branchId = parseBranchId(req);
    const range = parseReportDateRange(req.query);
    if (range.errorStatus) {
      res.status(range.errorStatus).json({ success: false, message: range.errorMessage });
      return;
    }
    const { from, to } = range;

    const baseWhere: any = { createdAt: { gte: from, lte: to } };
    if (branchId) baseWhere.branchId = branchId;

    const [completedGroup, cancelledGroup, returns] = await Promise.all([
      prisma.sale.groupBy({
        by: ["userId"],
        where: { ...baseWhere, status: "COMPLETADA" },
        _sum: { totalAmount: true, discountAmount: true },
        _count: { _all: true },
      }),
      prisma.sale.groupBy({
        by: ["userId"],
        where: { ...baseWhere, status: "CANCELADA" },
        _count: { _all: true },
      }),
      prisma.return.findMany({
        where: { createdAt: { gte: from, lte: to }, ...(branchId ? { sale: { branchId } } : {}) },
        select: { userId: true, totalRefunded: true },
      }),
    ]);

    const cancelledByUser = new Map(cancelledGroup.map((g) => [g.userId, g._count._all]));
    const returnsByUser = new Map<number, { count: number; monto: number }>();
    for (const r of returns) {
      const e = returnsByUser.get(r.userId) ?? { count: 0, monto: 0 };
      e.count += 1;
      e.monto += Number(r.totalRefunded);
      returnsByUser.set(r.userId, e);
    }

    const userIds = new Set<number>();
    completedGroup.forEach((g) => userIds.add(g.userId));
    cancelledGroup.forEach((g) => userIds.add(g.userId));
    returns.forEach((r) => userIds.add(r.userId));

    const users = await prisma.user.findMany({
      where: { id: { in: [...userIds] } },
      select: { id: true, name: true, role: true, commissionRate: true, branch: { select: { name: true } } },
    });
    const userById = new Map(users.map((u) => [u.id, u]));

    let rows = completedGroup.map((g) => {
      const u = userById.get(g.userId);
      const ventasCount = g._count._all;
      const totalVendido = Number(g._sum.totalAmount ?? 0);
      const descuentos = Number(g._sum.discountAmount ?? 0);
      const ret = returnsByUser.get(g.userId) ?? { count: 0, monto: 0 };
      const commissionRate = u?.commissionRate ? Number(u.commissionRate) : 0;
      return {
        userId: g.userId,
        name: u?.name ?? `Usuario #${g.userId}`,
        role: u?.role ?? "—",
        branch: u?.branch.name ?? "—",
        ventasCount,
        totalVendido,
        descuentos,
        canceladas: cancelledByUser.get(g.userId) ?? 0,
        devolucionesCount: ret.count,
        devolucionesMonto: ret.monto,
        ticketPromedio: ventasCount > 0 ? totalVendido / ventasCount : 0,
        comision: totalVendido * commissionRate,
      };
    });

    // Incluir vendedores que solo tuvieron cancelaciones/devoluciones (sin ventas completadas)
    for (const id of userIds) {
      if (rows.some((r) => r.userId === id)) continue;
      const u = userById.get(id);
      const ret = returnsByUser.get(id) ?? { count: 0, monto: 0 };
      rows.push({
        userId: id,
        name: u?.name ?? `Usuario #${id}`,
        role: u?.role ?? "—",
        branch: u?.branch.name ?? "—",
        ventasCount: 0,
        totalVendido: 0,
        descuentos: 0,
        canceladas: cancelledByUser.get(id) ?? 0,
        devolucionesCount: ret.count,
        devolucionesMonto: ret.monto,
        ticketPromedio: 0,
        comision: 0,
      });
    }

    rows.sort((a, b) => b.totalVendido - a.totalVendido);

    res.status(200).json({ rows });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ message: "Error al generar el reporte por vendedor." });
  }
};

// ===========================================================================
// COBRANZA — clientes con saldo pendiente y sus ventas a crédito
// ===========================================================================
export const reportReceivables = async (_req: Request, res: Response): Promise<void> => {
  try {
    const customers = await prisma.customer.findMany({
      where: { balance: { gt: 0 } },
      orderBy: { balance: "desc" },
      select: { id: true, name: true, phone: true, creditLimit: true, balance: true },
    });

    const custIds = customers.map((c) => c.id);
    const creditAgg =
      custIds.length > 0
        ? await prisma.sale.groupBy({
            by: ["customerId"],
            where: { customerId: { in: custIds }, paymentMethod: "CREDITO" },
            _count: { _all: true },
            _sum: { totalAmount: true },
            _max: { createdAt: true },
          })
        : [];
    const aggById = new Map(
      creditAgg
        .filter((a): a is typeof a & { customerId: number } => a.customerId !== null)
        .map((a) => [a.customerId, a])
    );

    const rows = customers.map((c) => {
      const a = aggById.get(c.id);
      return {
        customerId: c.id,
        name: c.name,
        phone: c.phone,
        creditLimit: Number(c.creditLimit),
        balance: Number(c.balance),
        creditSalesCount: a ? a._count._all : 0,
        creditSalesTotal: a ? Number(a._sum.totalAmount ?? 0) : 0,
        lastSaleDate: a?._max.createdAt ?? null,
      };
    });

    const totals = {
      clientes: rows.length,
      saldoTotal: rows.reduce((s, r) => s + r.balance, 0),
      creditoOtorgado: rows.reduce((s, r) => s + r.creditLimit, 0),
    };

    res.status(200).json({ rows, totals });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ message: "Error al generar el reporte de cobranza." });
  }
};
