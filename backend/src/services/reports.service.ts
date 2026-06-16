import { prisma } from "../app";

interface SalesReportParams {
  from: Date;
  to: Date;
  branchId?: number;
  page: number;
  pageSize: number;
  status?: string;
}

interface DateRangeParams {
  from: Date;
  to: Date;
  branchId?: number;
}

export const getSalesReport = async ({
  from,
  to,
  branchId,
  page,
  pageSize,
  status,
}: SalesReportParams) => {
  const where: any = { createdAt: { gte: from, lte: to } };
  if (branchId) where.branchId = branchId;
  if (status && status !== "all") where.status = status;

  const skip = (page - 1) * pageSize;

  const [sales, total] = await Promise.all([
    prisma.sale.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: pageSize,
      skip,
      include: {
        branch: { select: { name: true } },
        user: { select: { name: true } },
        customer: { select: { name: true } },
        _count: { select: { saleDetails: true } },
      },
    }),
    prisma.sale.count({ where }),
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
      totalAmount,
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

  const pagination = {
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
    hasNextPage: page * pageSize < total,
    hasPreviousPage: page > 1,
  };

  return { rows, totals, pagination };
};

export const getProductsSoldReport = async ({ from, to, branchId }: DateRangeParams) => {
  const saleWhere: any = { status: "COMPLETADA", createdAt: { gte: from, lte: to } };
  if (branchId) saleWhere.branchId = branchId;

  const saleIds = (
    await prisma.sale.findMany({ where: saleWhere, select: { id: true } })
  ).map((s) => s.id);

  if (saleIds.length === 0) {
    return {
      rows: [],
      summary: {
        totalUnidades: 0,
        totalImporte: 0,
        totalUtilidad: 0,
        masVendido: null,
        menosVendido: null,
      },
    };
  }

  const details = await prisma.saleDetail.findMany({
    where: { saleId: { in: saleIds } },
    select: { productId: true, quantity: true, unitPrice: true, costPrice: true },
  });

  const agg = new Map<number, { qty: number; importe: number; cost: number; tx: number }>();
  for (const d of details) {
    const e = agg.get(d.productId) ?? { qty: 0, importe: 0, cost: 0, tx: 0 };
    e.qty += d.quantity;
    e.importe += Number(d.unitPrice) * d.quantity;
    e.cost += Number(d.costPrice) * d.quantity;
    e.tx += 1;
    agg.set(d.productId, e);
  }

  const ids = [...agg.keys()];
  const products = await prisma.product.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, sku: true },
  });
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
  const rankedRows = rows.map((r, i) => ({ rank: i + 1, ...r }));

  const summary = {
    totalUnidades: rankedRows.reduce((a, r) => a + r.cantidad, 0),
    totalImporte: rankedRows.reduce((a, r) => a + r.importe, 0),
    totalUtilidad: rankedRows.reduce((a, r) => a + r.utilidad, 0),
    masVendido: rankedRows[0]?.name ?? null,
    menosVendido: rankedRows[rankedRows.length - 1]?.name ?? null,
  };

  return { rows: rankedRows, summary };
};

export const getSellerReport = async ({ from, to, branchId }: DateRangeParams) => {
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
      where: {
        createdAt: { gte: from, lte: to },
        ...(branchId ? { sale: { branchId } } : {}),
      },
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
    select: {
      id: true,
      name: true,
      role: true,
      commissionRate: true,
      branch: { select: { name: true } },
    },
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

  for (const id of userIds) {
    if (rows.some((r) => r.userId === id)) continue;
    const u = userById.get(id);
    const ret = returnsByUser.get(id) ?? { count: 0, monto: 0 };
    rows.push({
      userId: id,
      name: u?.name ?? `Usuario #${id}`,
      role: u?.role ?? "—",
      branch: u?.branch?.name ?? "—",
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
  return { rows };
};

export const getReceivablesReport = async () => {
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

  return { rows, totals };
};
