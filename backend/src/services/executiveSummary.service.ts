import { prisma } from "../app";

// ============================================================================
// Resumen Ejecutivo — agregaciones para el reporte gerencial.
// Calcula KPIs con variación contra el periodo anterior equivalente,
// comparativos por marco temporal (día/semana/mes/año), series para gráficas,
// rankings top-10 y datos de alertas del negocio.
// ============================================================================

export interface SummaryFilters {
  from: Date;
  to: Date;
  branchId?: number;
  sellerId?: number;
  categoryId?: number;
  paymentMethod?: string;
  status?: string; // COMPLETADA | CANCELADA | (vacío = todas)
  cashSessionId?: number;
  customerSearch?: string;
  productSearch?: string; // nombre o SKU de producto
  search?: string; // texto libre: folio / producto / SKU / cliente
}

const num = (v: any) => Number(v ?? 0);

const vary = (value: number, prev: number) => ({
  value,
  prev,
  delta: value - prev,
  pct: prev !== 0 ? ((value - prev) / Math.abs(prev)) * 100 : value > 0 ? 100 : 0,
});

const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const dayEnd = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
const isoDay = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

// Cláusula where de ventas a partir de los filtros (sin el rango de fechas).
const buildSaleWhere = (f: SummaryFilters): any => {
  const where: any = {};
  if (f.branchId) where.branchId = f.branchId;
  if (f.sellerId) where.userId = f.sellerId;
  if (f.paymentMethod) where.paymentMethod = f.paymentMethod;
  if (f.cashSessionId) where.cashSessionId = f.cashSessionId;
  if (f.status && f.status !== "all") where.status = f.status;
  if (f.customerSearch) {
    where.customer = {
      OR: [{ name: { contains: f.customerSearch } }, { phone: { contains: f.customerSearch } }],
    };
  }
  if (f.categoryId || f.productSearch) {
    where.saleDetails = {
      some: {
        product: {
          ...(f.categoryId ? { categoryId: f.categoryId } : {}),
          ...(f.productSearch
            ? { OR: [{ name: { contains: f.productSearch } }, { sku: { contains: f.productSearch } }] }
            : {}),
        },
      },
    };
  }
  if (f.search) {
    where.OR = [
      { invoiceNumber: { contains: f.search } },
      { customer: { name: { contains: f.search } } },
      { saleDetails: { some: { product: { OR: [{ name: { contains: f.search } }, { sku: { contains: f.search } }] } } } },
    ];
  }
  return where;
};

interface PeriodLoad {
  core: Record<string, number>;
  completed: {
    id: number;
    totalAmount: number;
    taxAmount: number;
    discountAmount: number;
    paymentMethod: string;
    createdAt: Date;
    branchId: number;
    userId: number;
    customerId: number | null;
  }[];
  cancelled: { createdAt: Date }[];
  details: {
    saleId: number;
    quantity: number;
    unitPrice: number;
    costPrice: number;
    productId: number;
    productName: string;
    sku: string;
    category: string;
  }[];
  returnRows: { createdAt: Date; totalRefunded: number; customerId: number | null; customerName: string | null }[];
}

async function loadPeriod(from: Date, to: Date, f: SummaryFilters): Promise<PeriodLoad> {
  const saleWhere = { ...buildSaleWhere(f), createdAt: { gte: from, lte: to } };

  const [sales, returnsRaw, newCustomers] = await Promise.all([
    prisma.sale.findMany({
      where: saleWhere,
      select: {
        id: true,
        totalAmount: true,
        taxAmount: true,
        discountAmount: true,
        paymentMethod: true,
        status: true,
        createdAt: true,
        branchId: true,
        userId: true,
        customerId: true,
      },
    }),
    prisma.return.findMany({
      where: {
        createdAt: { gte: from, lte: to },
        ...(f.branchId ? { sale: { branchId: f.branchId } } : {}),
      },
      select: {
        createdAt: true,
        totalRefunded: true,
        sale: { select: { customerId: true, customer: { select: { name: true } } } },
      },
    }),
    prisma.customer.count({ where: { createdAt: { gte: from, lte: to } } }),
  ]);

  const completed = sales
    .filter((s) => s.status === "COMPLETADA")
    .map((s) => ({
      id: s.id,
      totalAmount: num(s.totalAmount),
      taxAmount: num(s.taxAmount),
      discountAmount: num(s.discountAmount),
      paymentMethod: s.paymentMethod,
      createdAt: s.createdAt,
      branchId: s.branchId,
      userId: s.userId,
      customerId: s.customerId,
    }));
  const cancelled = sales.filter((s) => s.status === "CANCELADA").map((s) => ({ createdAt: s.createdAt }));

  const completedIds = completed.map((s) => s.id);
  const detailsRaw =
    completedIds.length > 0
      ? await prisma.saleDetail.findMany({
          where: {
            saleId: { in: completedIds },
            ...(f.categoryId ? { product: { categoryId: f.categoryId } } : {}),
          },
          select: {
            saleId: true,
            quantity: true,
            unitPrice: true,
            costPrice: true,
            product: { select: { id: true, name: true, sku: true, category: { select: { name: true } } } },
          },
        })
      : [];

  const details = detailsRaw.map((d) => ({
    saleId: d.saleId,
    quantity: d.quantity,
    unitPrice: num(d.unitPrice),
    costPrice: num(d.costPrice),
    productId: d.product.id,
    productName: d.product.name,
    sku: d.product.sku,
    category: d.product.category?.name ?? "Sin categoría",
  }));

  const returnRows = returnsRaw.map((r) => ({
    createdAt: r.createdAt,
    totalRefunded: num(r.totalRefunded),
    customerId: r.sale?.customerId ?? null,
    customerName: r.sale?.customer?.name ?? null,
  }));

  const ventasBrutas = completed.reduce((a, s) => a + s.totalAmount, 0);
  const iva = completed.reduce((a, s) => a + s.taxAmount, 0);
  const descuentos = completed.reduce((a, s) => a + s.discountAmount, 0);
  const ventasNetas = ventasBrutas - iva;
  const costo = details.reduce((a, d) => a + d.costPrice * d.quantity, 0);
  const utilidad = ventasNetas - costo;
  const margen = ventasNetas > 0 ? (utilidad / ventasNetas) * 100 : 0;
  const tickets = completed.length;
  const identified = new Set(completed.filter((s) => s.customerId).map((s) => s.customerId));

  const core: Record<string, number> = {
    ventasBrutas,
    ventasNetas,
    iva,
    descuentos,
    costo,
    utilidad,
    margen,
    tickets,
    ticketPromedio: tickets > 0 ? ventasBrutas / tickets : 0,
    articulosVendidos: details.reduce((a, d) => a + d.quantity, 0),
    productosVendidos: new Set(details.map((d) => d.productId)).size,
    clientesAtendidos: identified.size,
    clientesNuevos: newCustomers,
    clientesRecurrentes: Math.max(0, identified.size - newCustomers),
    cancelaciones: cancelled.length,
    devoluciones: returnRows.length,
    devolucionesMonto: returnRows.reduce((a, r) => a + r.totalRefunded, 0),
  };

  return { core, completed, cancelled, details, returnRows };
}

// Ventas brutas completadas en un rango, respetando los filtros no temporales.
async function salesTotal(from: Date, to: Date, f: SummaryFilters): Promise<number> {
  const base = buildSaleWhere(f);
  delete base.status; // los comparativos miden ventas efectivas (completadas)
  const agg = await prisma.sale.aggregate({
    where: { ...base, status: "COMPLETADA", createdAt: { gte: from, lte: to } },
    _sum: { totalAmount: true },
  });
  return num(agg._sum.totalAmount);
}

export async function getExecutiveSummary(f: SummaryFilters) {
  const { from, to } = f;
  const durationMs = to.getTime() - from.getTime();
  const prevTo = new Date(from.getTime() - 1);
  const prevFrom = new Date(from.getTime() - durationMs - 1);

  const [cur, prev] = await Promise.all([loadPeriod(from, to, f), loadPeriod(prevFrom, prevTo, f)]);
  const c = cur.core;
  const p = prev.core;

  const KPI_KEYS = [
    "ventasBrutas", "ventasNetas", "iva", "descuentos", "costo", "utilidad", "margen",
    "tickets", "ticketPromedio", "articulosVendidos", "productosVendidos",
    "clientesAtendidos", "clientesNuevos", "clientesRecurrentes",
    "cancelaciones", "devoluciones", "devolucionesMonto",
  ];
  const kpis: Record<string, ReturnType<typeof vary>> = {};
  for (const k of KPI_KEYS) kpis[k] = vary(c[k] ?? 0, p[k] ?? 0);

  // ---------------- Catálogos de nombres ----------------
  const branchIds = [...new Set(cur.completed.map((s) => s.branchId))];
  const userIds = [...new Set(cur.completed.map((s) => s.userId))];
  const [branches, users] = await Promise.all([
    prisma.branch.findMany({ where: { id: { in: branchIds } }, select: { id: true, name: true } }),
    prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }),
  ]);
  const branchName = new Map(branches.map((b) => [b.id, b.name]));
  const userName = new Map(users.map((u) => [u.id, u.name]));

  // ---------------- Series diarias ----------------
  const dayKeys: string[] = [];
  for (let d = dayStart(from); d <= to; d.setDate(d.getDate() + 1)) dayKeys.push(isoDay(d));
  const zeroDayMap = () => new Map<string, number>(dayKeys.map((k) => [k, 0]));

  const ventasDia = zeroDayMap();
  const ticketsDia = zeroDayMap();
  const utilidadDia = zeroDayMap();
  const cancelDia = zeroDayMap();
  const devolDia = zeroDayMap();

  const hourArr = Array.from({ length: 24 }, () => 0);
  const heat: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));

  const branchTot = new Map<number, { total: number; tickets: number }>();
  const sellerTot = new Map<number, { total: number; tickets: number }>();
  const payTot = new Map<string, { total: number; count: number }>();
  const custTot = new Map<number, { total: number; tickets: number }>();
  const saleDate = new Map<number, string>();

  for (const s of cur.completed) {
    const key = isoDay(s.createdAt);
    saleDate.set(s.id, key);
    if (ventasDia.has(key)) {
      ventasDia.set(key, ventasDia.get(key)! + s.totalAmount);
      ticketsDia.set(key, ticketsDia.get(key)! + 1);
    }
    const h = s.createdAt.getHours();
    hourArr[h] += s.totalAmount;
    heat[s.createdAt.getDay()][h] += s.totalAmount;

    const bt = branchTot.get(s.branchId) ?? { total: 0, tickets: 0 };
    bt.total += s.totalAmount; bt.tickets += 1; branchTot.set(s.branchId, bt);
    const st = sellerTot.get(s.userId) ?? { total: 0, tickets: 0 };
    st.total += s.totalAmount; st.tickets += 1; sellerTot.set(s.userId, st);
    const pt = payTot.get(s.paymentMethod) ?? { total: 0, count: 0 };
    pt.total += s.totalAmount; pt.count += 1; payTot.set(s.paymentMethod, pt);
    if (s.customerId) {
      const ct = custTot.get(s.customerId) ?? { total: 0, tickets: 0 };
      ct.total += s.totalAmount; ct.tickets += 1; custTot.set(s.customerId, ct);
    }
  }
  for (const s of cur.cancelled) {
    const key = isoDay(s.createdAt);
    if (cancelDia.has(key)) cancelDia.set(key, cancelDia.get(key)! + 1);
  }
  for (const r of cur.returnRows) {
    const key = isoDay(r.createdAt);
    if (devolDia.has(key)) devolDia.set(key, devolDia.get(key)! + 1);
  }

  // Productos / categorías (y utilidad por día vía la fecha de su venta)
  const prodMap = new Map<number, { name: string; sku: string; qty: number; importe: number; utilidad: number }>();
  const catMap = new Map<string, { total: number; qty: number }>();
  for (const d of cur.details) {
    const imp = d.unitPrice * d.quantity;
    const util = imp - d.costPrice * d.quantity;
    const e = prodMap.get(d.productId) ?? { name: d.productName, sku: d.sku, qty: 0, importe: 0, utilidad: 0 };
    e.qty += d.quantity; e.importe += imp; e.utilidad += util;
    prodMap.set(d.productId, e);
    const ce = catMap.get(d.category) ?? { total: 0, qty: 0 };
    ce.total += imp; ce.qty += d.quantity; catMap.set(d.category, ce);
    const dk = saleDate.get(d.saleId);
    if (dk && utilidadDia.has(dk)) utilidadDia.set(dk, utilidadDia.get(dk)! + util);
  }

  const series = {
    ventasPorDia: dayKeys.map((k) => ({ fecha: k, total: ventasDia.get(k) ?? 0 })),
    ticketPromedioDiario: dayKeys.map((k) => {
      const t = ticketsDia.get(k) ?? 0;
      return { fecha: k, promedio: t > 0 ? (ventasDia.get(k) ?? 0) / t : 0 };
    }),
    utilidadDiaria: dayKeys.map((k) => ({ fecha: k, utilidad: utilidadDia.get(k) ?? 0 })),
    cancelacionesPorDia: dayKeys.map((k) => ({ fecha: k, cantidad: cancelDia.get(k) ?? 0 })),
    devolucionesPorDia: dayKeys.map((k) => ({ fecha: k, cantidad: devolDia.get(k) ?? 0 })),
    ventasPorHora: hourArr.map((total, hour) => ({ hour, total })),
    heatmap: heat.flatMap((row, dow) => row.map((value, hour) => ({ dow, hour, value }))),
    ventasPorSucursal: [...branchTot.entries()]
      .map(([id, v]) => ({ sucursal: branchName.get(id) ?? `#${id}`, total: v.total, tickets: v.tickets }))
      .sort((a, b) => b.total - a.total),
    ventasPorVendedor: [...sellerTot.entries()]
      .map(([id, v]) => ({ vendedor: userName.get(id) ?? `#${id}`, total: v.total, tickets: v.tickets }))
      .sort((a, b) => b.total - a.total),
    ventasPorCategoria: [...catMap.entries()]
      .map(([categoria, v]) => ({ categoria, total: v.total, unidades: v.qty }))
      .sort((a, b) => b.total - a.total),
    metodosPago: [...payTot.entries()]
      .map(([metodo, v]) => ({ metodo, total: v.total, count: v.count }))
      .sort((a, b) => b.total - a.total),
    clientesNuevosVsRecurrentes: [
      { tipo: "Nuevos", cantidad: c.clientesNuevos },
      { tipo: "Recurrentes", cantidad: c.clientesRecurrentes },
    ],
  };

  // ---------------- Rankings top-10 ----------------
  const custIds = [...custTot.keys()];
  const customers = custIds.length
    ? await prisma.customer.findMany({ where: { id: { in: custIds } }, select: { id: true, name: true } })
    : [];
  const custName = new Map(customers.map((cu) => [cu.id, cu.name]));

  const rankings = {
    productos: [...prodMap.values()].sort((a, b) => b.importe - a.importe).slice(0, 10)
      .map((r, i) => ({ rank: i + 1, nombre: r.name, sku: r.sku, cantidad: r.qty, importe: r.importe, utilidad: r.utilidad })),
    categorias: series.ventasPorCategoria.slice(0, 10)
      .map((r, i) => ({ rank: i + 1, nombre: r.categoria, unidades: r.unidades, importe: r.total })),
    vendedores: series.ventasPorVendedor.slice(0, 10)
      .map((r, i) => ({ rank: i + 1, nombre: r.vendedor, tickets: r.tickets, importe: r.total })),
    sucursales: series.ventasPorSucursal.slice(0, 10)
      .map((r, i) => ({ rank: i + 1, nombre: r.sucursal, tickets: r.tickets, importe: r.total })),
    clientes: [...custTot.entries()]
      .map(([id, v]) => ({ nombre: custName.get(id) ?? `Cliente #${id}`, tickets: v.tickets, importe: v.total }))
      .sort((a, b) => b.importe - a.importe).slice(0, 10)
      .map((r, i) => ({ rank: i + 1, ...r })),
  };

  const tops = {
    topVendedor: rankings.vendedores[0]?.nombre ?? "—",
    topSucursal: rankings.sucursales[0]?.nombre ?? "—",
    topCategoria: rankings.categorias[0]?.nombre ?? "—",
    topProducto: rankings.productos[0]?.nombre ?? "—",
    topCliente: rankings.clientes[0]?.nombre ?? "—",
    metodoPagoPrincipal: series.metodosPago[0]?.metodo ?? "—",
  };

  // ---------------- Comparativo por marco temporal ----------------
  const now = new Date();
  const ref = to.getTime() > now.getTime() ? now : to;
  const d0 = dayStart(ref);
  const prevMonthDays = new Date(d0.getFullYear(), d0.getMonth(), 0).getDate();

  const frames: { key: string; label: string; a: [Date, Date]; b: [Date, Date] }[] = [
    {
      key: "dia", label: "Ayer vs. día previo",
      a: [dayStart(new Date(d0.getTime() - 864e5)), dayEnd(new Date(d0.getTime() - 864e5))],
      b: [dayStart(new Date(d0.getTime() - 2 * 864e5)), dayEnd(new Date(d0.getTime() - 2 * 864e5))],
    },
    {
      key: "semana", label: "Últimos 7 días vs. 7 previos",
      a: [dayStart(new Date(d0.getTime() - 6 * 864e5)), dayEnd(ref)],
      b: [dayStart(new Date(d0.getTime() - 13 * 864e5)), dayEnd(new Date(d0.getTime() - 7 * 864e5))],
    },
    {
      key: "mes", label: "Mes en curso vs. mes anterior",
      a: [new Date(d0.getFullYear(), d0.getMonth(), 1), dayEnd(ref)],
      b: [
        new Date(d0.getFullYear(), d0.getMonth() - 1, 1),
        dayEnd(new Date(d0.getFullYear(), d0.getMonth() - 1, Math.min(d0.getDate(), prevMonthDays))),
      ],
    },
    {
      key: "anio", label: "Año en curso vs. año anterior",
      a: [new Date(d0.getFullYear(), 0, 1), dayEnd(ref)],
      b: [new Date(d0.getFullYear() - 1, 0, 1), dayEnd(new Date(d0.getFullYear() - 1, d0.getMonth(), d0.getDate()))],
    },
  ];

  const frameTotals = await Promise.all(
    frames.flatMap((fr) => [salesTotal(fr.a[0], fr.a[1], f), salesTotal(fr.b[0], fr.b[1], f)])
  );
  const timeframes = frames.map((fr, i) => {
    const actual = frameTotals[i * 2];
    const anterior = frameTotals[i * 2 + 1];
    return { key: fr.key, label: fr.label, actual, anterior, ...vary(actual, anterior) };
  });

  // ---------------- Datos para alertas ----------------
  const invWhere: any = { product: { active: true } };
  if (f.branchId) invWhere.branchId = f.branchId;
  const inventories = await prisma.inventory.findMany({
    where: invWhere,
    select: { quantity: true, minStock: true, maxStock: true, productId: true, product: { select: { name: true } } },
  });
  let agotados = 0, stockCritico = 0, sobreInventario = 0;
  const criticoEjemplos: string[] = [];
  for (const inv of inventories) {
    if (inv.quantity <= 0) agotados += 1;
    else if (inv.quantity <= inv.minStock) {
      stockCritico += 1;
      if (criticoEjemplos.length < 4) criticoEjemplos.push(inv.product.name);
    }
    if (inv.maxStock > 0 && inv.quantity > inv.maxStock) sobreInventario += 1;
  }

  const soldIds = new Set(cur.details.map((d) => d.productId));
  const invProductIds = new Set(inventories.map((i) => i.productId));
  let sinMovimiento = 0;
  const sinMovEjemplos: string[] = [];
  for (const inv of inventories) {
    if (!soldIds.has(inv.productId)) {
      sinMovimiento += 1;
      if (sinMovEjemplos.length < 4 && inv.quantity > 0) sinMovEjemplos.push(inv.product.name);
    }
  }
  void invProductIds;

  const margenNegativo = [...prodMap.values()].filter((r) => r.utilidad < 0);
  const devolPorCliente = new Map<string, number>();
  for (const r of cur.returnRows) {
    if (!r.customerName) continue;
    devolPorCliente.set(r.customerName, (devolPorCliente.get(r.customerName) ?? 0) + 1);
  }
  const clientesAltaDevolucion = [...devolPorCliente.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([nombre, devoluciones]) => ({ nombre, devoluciones }));

  const alertsData = {
    agotados,
    stockCritico,
    criticoEjemplos,
    sobreInventario,
    sinMovimiento,
    sinMovEjemplos,
    margenNegativoCount: margenNegativo.length,
    margenNegativoEjemplos: margenNegativo.slice(0, 4).map((r) => r.name),
    clientesAltaDevolucion,
  };

  return {
    period: {
      from: from.toISOString(),
      to: to.toISOString(),
      prevFrom: prevFrom.toISOString(),
      prevTo: prevTo.toISOString(),
      days: dayKeys.length,
    },
    kpis,
    tops,
    series,
    rankings,
    timeframes,
    alertsData,
  };
}

// Opciones para el panel de filtros del reporte (reutilizable por otros reportes).
export async function getReportFilterOptions() {
  const [branches, sellers, categories, methods] = await Promise.all([
    prisma.branch.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { active: true }, select: { id: true, name: true, role: true }, orderBy: { name: "asc" } }),
    prisma.category.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.sale.groupBy({ by: ["paymentMethod"], _count: { _all: true } }),
  ]);
  return {
    branches,
    sellers,
    categories,
    paymentMethods: methods.map((m) => m.paymentMethod).sort(),
  };
}
