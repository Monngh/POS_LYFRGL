import { prisma } from "../app";

interface Params {
  from: Date;
  to: Date;
  branchId?: number;
}

const num = (v: any) => Number(v ?? 0);

// Variación de un indicador contra el periodo anterior.
const vary = (value: number, prev: number) => ({
  value,
  prev,
  delta: value - prev,
  pct: prev !== 0 ? ((value - prev) / Math.abs(prev)) * 100 : value > 0 ? 100 : 0,
});

interface PeriodCore {
  ventasNetas: number;
  ventasBrutas: number;
  iva: number;
  descuentos: number;
  costo: number;
  utilidad: number;
  margen: number;
  tickets: number;
  ticketPromedio: number;
  articulosVendidos: number;
  cancelaciones: number;
  devoluciones: number;
  devolucionesMonto: number;
  clientesNuevos: number;
  clientesRecurrentes: number;
}

// Carga un periodo y calcula los indicadores escalares + (opcional) datos base
// para las series. Reutilizado para el periodo actual y el anterior.
async function loadPeriod(from: Date, to: Date, branchId?: number) {
  const saleWhere: any = { createdAt: { gte: from, lte: to } };
  if (branchId) saleWhere.branchId = branchId;

  const [sales, returnsAgg, newCustomers] = await Promise.all([
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
    prisma.return.aggregate({
      where: { createdAt: { gte: from, lte: to }, ...(branchId ? { sale: { branchId } } : {}) },
      _count: { _all: true },
      _sum: { totalRefunded: true },
    }),
    prisma.customer.count({ where: { createdAt: { gte: from, lte: to } } }),
  ]);

  const completed = sales.filter((s) => s.status === "COMPLETADA");
  const completedIds = completed.map((s) => s.id);

  // Detalle de líneas vendidas (para costo, artículos, categorías y productos).
  const details =
    completedIds.length > 0
      ? await prisma.saleDetail.findMany({
          where: { saleId: { in: completedIds } },
          select: {
            quantity: true,
            unitPrice: true,
            costPrice: true,
            product: { select: { id: true, name: true, sku: true, category: { select: { name: true } } } },
          },
        })
      : [];

  const ventasBrutas = completed.reduce((a, s) => a + num(s.totalAmount), 0);
  const iva = completed.reduce((a, s) => a + num(s.taxAmount), 0);
  const descuentos = completed.reduce((a, s) => a + num(s.discountAmount), 0);
  const ventasNetas = ventasBrutas - iva;
  const costo = details.reduce((a, d) => a + num(d.costPrice) * d.quantity, 0);
  const utilidad = ventasNetas - costo;
  const margen = ventasNetas > 0 ? (utilidad / ventasNetas) * 100 : 0;
  const tickets = completed.length;
  const ticketPromedio = tickets > 0 ? ventasBrutas / tickets : 0;
  const articulosVendidos = details.reduce((a, d) => a + d.quantity, 0);

  const distinctCustomers = new Set(completed.filter((s) => s.customerId).map((s) => s.customerId));
  const clientesRecurrentes = Math.max(0, distinctCustomers.size - newCustomers);

  const core: PeriodCore = {
    ventasNetas,
    ventasBrutas,
    iva,
    descuentos,
    costo,
    utilidad,
    margen,
    tickets,
    ticketPromedio,
    articulosVendidos,
    cancelaciones: sales.filter((s) => s.status === "CANCELADA").length,
    devoluciones: returnsAgg._count._all,
    devolucionesMonto: num(returnsAgg._sum.totalRefunded),
    clientesNuevos: newCustomers,
    clientesRecurrentes,
  };

  return { core, sales, completed, details };
}

export async function getExecutiveSummary({ from, to, branchId }: Params) {
  const durationMs = to.getTime() - from.getTime();
  const prevTo = new Date(from.getTime() - 1);
  const prevFrom = new Date(from.getTime() - durationMs - 1);

  const [cur, prev] = await Promise.all([
    loadPeriod(from, to, branchId),
    loadPeriod(prevFrom, prevTo, branchId),
  ]);

  const c = cur.core;
  const p = prev.core;

  const kpis = {
    ventasNetas: vary(c.ventasNetas, p.ventasNetas),
    ventasBrutas: vary(c.ventasBrutas, p.ventasBrutas),
    iva: vary(c.iva, p.iva),
    descuentos: vary(c.descuentos, p.descuentos),
    costo: vary(c.costo, p.costo),
    utilidad: vary(c.utilidad, p.utilidad),
    margen: vary(c.margen, p.margen),
    tickets: vary(c.tickets, p.tickets),
    ticketPromedio: vary(c.ticketPromedio, p.ticketPromedio),
    articulosVendidos: vary(c.articulosVendidos, p.articulosVendidos),
    cancelaciones: vary(c.cancelaciones, p.cancelaciones),
    devoluciones: vary(c.devoluciones, p.devoluciones),
    clientesNuevos: vary(c.clientesNuevos, p.clientesNuevos),
    clientesRecurrentes: vary(c.clientesRecurrentes, p.clientesRecurrentes),
  };

  // ---- Mapas de apoyo para nombres ----
  const branchIds = [...new Set(cur.completed.map((s) => s.branchId))];
  const userIds = [...new Set(cur.completed.map((s) => s.userId))];
  const [branches, users] = await Promise.all([
    prisma.branch.findMany({ where: { id: { in: branchIds } }, select: { id: true, name: true } }),
    prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }),
  ]);
  const branchName = new Map(branches.map((b) => [b.id, b.name]));
  const userName = new Map(users.map((u) => [u.id, u.name]));

  // ---- Series ----
  // Ventas por día (relleno de todos los días del rango)
  const dayMap = new Map<string, number>();
  for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
    dayMap.set(d.toISOString().slice(0, 10), 0);
  }
  // Ventas por hora (0-23) y heatmap (día de semana x hora)
  const hourArr = Array.from({ length: 24 }, () => 0);
  const heatmap: { dow: number; hour: number; value: number }[] = [];
  const heatIdx = new Map<string, number>();
  for (let dow = 0; dow < 7; dow++)
    for (let h = 0; h < 24; h++) {
      heatIdx.set(`${dow}-${h}`, heatmap.length);
      heatmap.push({ dow, hour: h, value: 0 });
    }

  const branchSales = new Map<number, number>();
  const payMap = new Map<string, { total: number; count: number }>();

  for (const s of cur.completed) {
    const total = num(s.totalAmount);
    const dt = new Date(s.createdAt);
    const key = dt.toISOString().slice(0, 10);
    if (dayMap.has(key)) dayMap.set(key, (dayMap.get(key) || 0) + total);
    const h = dt.getHours();
    hourArr[h] += total;
    heatmap[heatIdx.get(`${dt.getDay()}-${h}`)!].value += total;
    branchSales.set(s.branchId, (branchSales.get(s.branchId) || 0) + total);
    const pm = payMap.get(s.paymentMethod) || { total: 0, count: 0 };
    pm.total += total;
    pm.count += 1;
    payMap.set(s.paymentMethod, pm);
  }

  // Productos y categorías (desde el detalle)
  const prodMap = new Map<number, { name: string; sku: string; qty: number; importe: number; utilidad: number }>();
  const catMap = new Map<string, number>();
  for (const d of cur.details) {
    const pid = d.product.id;
    const e = prodMap.get(pid) || { name: d.product.name, sku: d.product.sku, qty: 0, importe: 0, utilidad: 0 };
    const imp = num(d.unitPrice) * d.quantity;
    e.qty += d.quantity;
    e.importe += imp;
    e.utilidad += imp - num(d.costPrice) * d.quantity;
    prodMap.set(pid, e);
    const cat = d.product.category?.name ?? "Sin categoría";
    catMap.set(cat, (catMap.get(cat) || 0) + imp);
  }

  const ventasPorDia = [...dayMap.entries()].map(([fecha, total]) => ({ fecha, total }));
  const ventasPorHora = hourArr.map((total, hour) => ({ hour, total }));
  const ventasPorSucursal = [...branchSales.entries()]
    .map(([id, total]) => ({ sucursal: branchName.get(id) ?? `#${id}`, total }))
    .sort((a, b) => b.total - a.total);
  const ventasPorCategoria = [...catMap.entries()]
    .map(([categoria, total]) => ({ categoria, total }))
    .sort((a, b) => b.total - a.total);
  const metodosPago = [...payMap.entries()]
    .map(([metodo, v]) => ({ metodo, total: v.total, count: v.count }))
    .sort((a, b) => b.total - a.total);
  const top20Productos = [...prodMap.values()]
    .sort((a, b) => b.importe - a.importe)
    .slice(0, 20)
    .map((e, i) => ({ rank: i + 1, name: e.name, sku: e.sku, cantidad: e.qty, importe: e.importe, utilidad: e.utilidad }));

  // Top vendedores (por total vendido)
  const sellerSales = new Map<number, { total: number; tickets: number }>();
  for (const s of cur.completed) {
    const e = sellerSales.get(s.userId) || { total: 0, tickets: 0 };
    e.total += num(s.totalAmount);
    e.tickets += 1;
    sellerSales.set(s.userId, e);
  }
  const topVendedores = [...sellerSales.entries()]
    .map(([id, v]) => ({ vendedor: userName.get(id) ?? `#${id}`, total: v.total, tickets: v.tickets }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  const tops = {
    topVendedor: topVendedores[0]?.vendedor ?? "—",
    topSucursal: ventasPorSucursal[0]?.sucursal ?? "—",
    topCategoria: ventasPorCategoria[0]?.categoria ?? "—",
    topProducto: top20Productos[0]?.name ?? "—",
    metodoPagoPrincipal: metodosPago[0]?.metodo ?? "—",
  };

  return {
    period: { from: from.toISOString(), to: to.toISOString(), prevFrom: prevFrom.toISOString(), prevTo: prevTo.toISOString() },
    kpis,
    tops,
    series: {
      ventasPorDia,
      ventasPorHora,
      ventasPorSucursal,
      ventasPorCategoria,
      metodosPago,
      top20Productos,
      topVendedores,
      heatmap,
    },
  };
}
