import { Request, Response } from "express";
import { prisma } from "../app";

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
  const b = req.query.branchId as string | undefined;
  return b && b !== "all" && !isNaN(Number(b)) ? Number(b) : undefined;
};

const trimQuery = (v: unknown): string | undefined => {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length > 0 ? s : undefined;
};

// ===========================================================================
// VENTAS
// ===========================================================================
export const listSales = async (req: Request, res: Response): Promise<void> => {
  try {
    const branchId = parseBranch(req);
    const status = req.query.status as string | undefined;
    const search = trimQuery(req.query.search);

    const where: any = {};
    if (branchId) where.branchId = branchId;
    if (status && status !== "all") where.status = status;
    if (search) where.invoiceNumber = { contains: search };

    const sales = await prisma.sale.findMany({
      where,
      take: 100,
      orderBy: { createdAt: "desc" },
      include: {
        branch: { select: { name: true } },
        user: { select: { name: true } },
        _count: { select: { saleDetails: true } },
      },
    });

    const mapped = sales.map((s) => ({
      id: s.id,
      invoiceNumber: s.invoiceNumber,
      createdAt: s.createdAt,
      branch: s.branch.name,
      cajero: s.user.name,
      items: s._count.saleDetails,
      totalAmount: Number(s.totalAmount),
      taxAmount: Number(s.taxAmount),
      paymentMethod: s.paymentMethod,
      status: s.status,
    }));

    res.status(200).json({ sales: mapped });
  } catch (error: any) {
    res.status(500).json({ message: "Error al listar ventas.", error: error.message });
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
    res.status(500).json({ message: "Error al obtener el detalle de la venta.", error: error.message });
  }
};

// ===========================================================================
// INVENTARIO
// ===========================================================================
export const listInventory = async (req: Request, res: Response): Promise<void> => {
  try {
    const branchId = parseBranch(req);
    const search = trimQuery(req.query.search);

    const where: any = {};
    if (search) where.OR = [{ name: { contains: search } }, { sku: { contains: search } }];

    const products = await prisma.product.findMany({
      where,
      orderBy: { name: "asc" },
      include: {
        inventories: branchId ? { where: { branchId } } : true,
      },
    });

    const mapped = products.map((p) => {
      const invs = p.inventories;
      const stock = invs.reduce((acc, i) => acc + i.quantity, 0);
      const minStock = invs.reduce((acc, i) => acc + i.minStock, 0);
      const low = invs.some((i) => i.quantity <= i.minStock);
      return {
        id: p.id,
        sku: p.sku,
        name: p.name,
        active: p.active,
        sellPrice: Number(p.sellPrice),
        costPrice: Number(p.costPrice),
        stock,
        minStock,
        low,
        branchCount: invs.length,
      };
    });

    res.status(200).json({ products: mapped });
  } catch (error: any) {
    res.status(500).json({ message: "Error al listar inventario.", error: error.message });
  }
};

// ===========================================================================
// CLIENTES
// ===========================================================================
export const listCustomers = async (req: Request, res: Response): Promise<void> => {
  try {
    const search = trimQuery(req.query.search);

    const where: any = {};
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { email: { contains: search } },
        { taxId: { contains: search } },
        { phone: { contains: search } },
      ];
    }

    const customers = await prisma.customer.findMany({
      where,
      orderBy: { name: "asc" },
      take: 200,
      include: { _count: { select: { sales: true } } },
    });

    const mapped = customers.map((c) => ({
      id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      taxId: c.taxId,
      address: c.address,
      creditLimit: Number(c.creditLimit),
      balance: Number(c.balance),
      salesCount: c._count.sales,
      createdAt: c.createdAt,
    }));

    res.status(200).json({ customers: mapped });
  } catch (error: any) {
    res.status(500).json({ message: "Error al listar clientes.", error: error.message });
  }
};

export const createCustomer = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, phone, taxId, address, creditLimit } = req.body;

    if (!name || typeof name !== "string" || !name.trim()) {
      res.status(400).json({ message: "El nombre del cliente es obligatorio." });
      return;
    }
    if (creditLimit !== undefined && creditLimit !== "" && isNaN(Number(creditLimit))) {
      res.status(400).json({ message: "El límite de crédito debe ser numérico." });
      return;
    }

    const customer = await prisma.customer.create({
      data: {
        name: name.trim(),
        email: trimQuery(email) ?? null,
        phone: trimQuery(phone) ?? null,
        taxId: trimQuery(taxId) ?? null,
        address: trimQuery(address) ?? null,
        creditLimit: creditLimit ? Number(creditLimit) : 0,
      },
    });

    res.status(201).json({
      message: "Cliente registrado exitosamente.",
      customer: {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        taxId: customer.taxId,
        address: customer.address,
        creditLimit: Number(customer.creditLimit),
        balance: Number(customer.balance),
        salesCount: 0,
        createdAt: customer.createdAt,
      },
    });
  } catch (error: any) {
    res.status(500).json({ message: "Error al registrar el cliente.", error: error.message });
  }
};

// ===========================================================================
// CAJAS (sesiones de caja)
// ===========================================================================
export const listCashSessions = async (req: Request, res: Response): Promise<void> => {
  try {
    const branchId = parseBranch(req);
    const status = req.query.status as string | undefined;

    const where: any = {};
    if (branchId) where.branchId = branchId;
    if (status && status !== "all") where.status = status;

    const sessions = await prisma.cashSession.findMany({
      where,
      take: 100,
      orderBy: { openedAt: "desc" },
      include: {
        branch: { select: { name: true } },
        user: { select: { name: true } },
        _count: { select: { sales: true } },
      },
    });

    const mapped = sessions.map((s) => {
      const expected =
        Number(s.initialAmount) + Number(s.cashIn) - Number(s.cashOut);
      return {
        id: s.id,
        branch: s.branch.name,
        cajero: s.user.name,
        openedAt: s.openedAt,
        closedAt: s.closedAt,
        initialAmount: Number(s.initialAmount),
        cashIn: Number(s.cashIn),
        cashOut: Number(s.cashOut),
        expectedAmount: s.status === "CERRADA" ? Number(s.expectedAmount) : expected,
        declaredAmount: s.declaredAmount !== null ? Number(s.declaredAmount) : null,
        difference: s.difference !== null ? Number(s.difference) : null,
        salesCount: s._count.sales,
        status: s.status,
      };
    });

    res.status(200).json({ sessions: mapped });
  } catch (error: any) {
    res.status(500).json({ message: "Error al listar las sesiones de caja.", error: error.message });
  }
};

// ===========================================================================
// EMPLEADOS (usuarios) — nunca se exponen passwordHash ni pinCode
// ===========================================================================
export const listEmployees = async (req: Request, res: Response): Promise<void> => {
  try {
    const branchId = parseBranch(req);
    const role = req.query.role as string | undefined;
    const search = trimQuery(req.query.search);

    const where: any = {};
    if (branchId) where.branchId = branchId;
    if (role && role !== "all") where.role = role;
    if (search) where.OR = [{ name: { contains: search } }, { email: { contains: search } }];

    const users = await prisma.user.findMany({
      where,
      orderBy: [{ role: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        createdAt: true,
        branch: { select: { name: true } },
      },
    });

    const mapped = users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      active: u.active,
      branch: u.branch.name,
      createdAt: u.createdAt,
    }));

    res.status(200).json({ employees: mapped });
  } catch (error: any) {
    res.status(500).json({ message: "Error al listar empleados.", error: error.message });
  }
};

// ===========================================================================
// REPORTES (resumen por rango de fechas)
// ===========================================================================
export const getReports = async (req: Request, res: Response): Promise<void> => {
  try {
    const branchId = parseBranch(req);
    const fromStr = trimQuery(req.query.from);
    const toStr = trimQuery(req.query.to);

    const now = new Date();
    const from = fromStr
      ? new Date(`${fromStr}T00:00:00`)
      : new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
    const to = toStr ? new Date(`${toStr}T23:59:59`) : now;

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
        where: { ...rangeFilter, status: "COMPLETADA" },
        _sum: { totalAmount: true },
        _count: { _all: true },
      }),
      prisma.sale.findMany({ where: completedWhere, select: { id: true } }),
      prisma.branch.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { id: "asc" } }),
    ]);

    const saleIds = completedSales.map((s) => s.id);

    let utilidad = 0;
    let topProducts: { id: number; name: string; unidades: number; importe: number }[] = [];

    if (saleIds.length > 0) {
      const [detailsForProfit, topRaw] = await Promise.all([
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
    }

    const ventasNetas = Number(totalsAgg._sum.totalAmount ?? 0);
    const ticketCount = totalsAgg._count._all;

    const branchNameById = new Map(branches.map((b) => [b.id, b.name]));

    res.status(200).json({
      range: { from: from.toISOString(), to: to.toISOString() },
      totals: {
        ventasNetas,
        impuestos: Number(totalsAgg._sum.taxAmount ?? 0),
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
    });
  } catch (error: any) {
    res.status(500).json({ message: "Error al generar los reportes.", error: error.message });
  }
};
