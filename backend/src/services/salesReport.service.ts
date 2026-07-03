import { prisma } from "../app";
import {
  buildSaleWhere,
  vary,
  isoDay,
  dayStart,
  getSalesTimeframes,
  type SummaryFilters,
} from "./executiveSummary.service";

// ============================================================================
// Reporte de Ventas (detallado) — hereda la plantilla maestra del framework.
// Aporta: KPIs de venta con variación vs. periodo anterior, comparativos por
// marco temporal, series para gráficas, desglose por método de pago / estado /
// sucursal / vendedor, rankings y el DETALLE de transacciones (lo distintivo de
// este módulo). Reutiliza los helpers de executiveSummary.service.
// ============================================================================

export type SalesReportFilters = SummaryFilters;

// Tope de transacciones incluidas en el detalle del documento (protege el
// render del visor y del PDF). Se informa al cliente si se truncó.
const TX_LIMIT = 4000;

const num = (v: any) => Number(v ?? 0);

interface PeriodCore {
  ventasBrutas: number;
  ventasNetas: number;
  subtotal: number;
  iva: number;
  descuentos: number;
  tickets: number;
  ticketPromedio: number;
  articulosVendidos: number;
  ticketMaximo: number;
  cancelaciones: number;
  ventaCancelada: number;
  devoluciones: number;
  devolucionesMonto: number;
  ventaPromedioDiaria: number;
}

interface CompletedSale {
  id: number;
  totalAmount: number;
  taxAmount: number;
  discountAmount: number;
  paymentMethod: string;
  createdAt: Date;
  branchId: number;
  userId: number;
  customerId: number | null;
}

interface PeriodLoad {
  core: PeriodCore;
  completed: CompletedSale[];
  cancelled: { createdAt: Date; totalAmount: number }[];
  returns: { createdAt: Date; totalRefunded: number }[];
  days: number;
}

// Carga las ventas del rango (ignorando el filtro de estado: los KPIs miden el
// panorama completo — completadas vs. canceladas — como en el resumen ejecutivo).
async function loadPeriod(from: Date, to: Date, f: SalesReportFilters): Promise<PeriodLoad> {
  const base = buildSaleWhere(f);
  delete base.status;
  const saleWhere = { ...base, createdAt: { gte: from, lte: to } };

  const [sales, returnsRaw] = await Promise.all([
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
      select: { createdAt: true, totalRefunded: true },
    }),
  ]);

  const completed: CompletedSale[] = sales
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
  const cancelled = sales
    .filter((s) => s.status === "CANCELADA")
    .map((s) => ({ createdAt: s.createdAt, totalAmount: num(s.totalAmount) }));

  const completedIds = completed.map((s) => s.id);
  const articulosAgg =
    completedIds.length > 0
      ? await prisma.saleDetail.aggregate({
          where: { saleId: { in: completedIds } },
          _sum: { quantity: true },
        })
      : { _sum: { quantity: 0 } };

  const returns = returnsRaw.map((r) => ({ createdAt: r.createdAt, totalRefunded: num(r.totalRefunded) }));

  const ventasBrutas = completed.reduce((a, s) => a + s.totalAmount, 0);
  const iva = completed.reduce((a, s) => a + s.taxAmount, 0);
  const descuentos = completed.reduce((a, s) => a + s.discountAmount, 0);
  const ventasNetas = ventasBrutas - iva;
  const tickets = completed.length;
  const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / 864e5));

  const core: PeriodCore = {
    ventasBrutas,
    ventasNetas,
    subtotal: ventasNetas,
    iva,
    descuentos,
    tickets,
    ticketPromedio: tickets > 0 ? ventasBrutas / tickets : 0,
    articulosVendidos: num(articulosAgg._sum.quantity),
    ticketMaximo: completed.reduce((m, s) => (s.totalAmount > m ? s.totalAmount : m), 0),
    cancelaciones: cancelled.length,
    ventaCancelada: cancelled.reduce((a, s) => a + s.totalAmount, 0),
    devoluciones: returns.length,
    devolucionesMonto: returns.reduce((a, r) => a + r.totalRefunded, 0),
    ventaPromedioDiaria: ventasBrutas / days,
  };

  return { core, completed, cancelled, returns, days };
}

const KPI_KEYS: (keyof PeriodCore)[] = [
  "ventasBrutas", "ventasNetas", "subtotal", "iva", "descuentos", "tickets", "ticketPromedio",
  "articulosVendidos", "ticketMaximo", "cancelaciones", "ventaCancelada", "devoluciones",
  "devolucionesMonto", "ventaPromedioDiaria",
];

const STATUS_LABEL: Record<string, string> = {
  COMPLETADA: "Completada",
  CANCELADA: "Cancelada",
  PENDIENTE: "Pendiente",
  DEVUELTA: "Devuelta",
};

export async function getSalesReport(f: SalesReportFilters) {
  const { from, to } = f;
  const durationMs = to.getTime() - from.getTime();
  const prevTo = new Date(from.getTime() - 1);
  const prevFrom = new Date(from.getTime() - durationMs - 1);

  const [cur, prev, timeframes] = await Promise.all([
    loadPeriod(from, to, f),
    loadPeriod(prevFrom, prevTo, f),
    getSalesTimeframes(f),
  ]);
  const c = cur.core;
  const p = prev.core;

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

  // ---------------- Series diarias / horarias ----------------
  const dayKeys: string[] = [];
  for (let d = dayStart(from); d <= to; d.setDate(d.getDate() + 1)) dayKeys.push(isoDay(d));
  const ventasDia = new Map<string, number>(dayKeys.map((k) => [k, 0]));
  const ticketsDia = new Map<string, number>(dayKeys.map((k) => [k, 0]));

  const hourArr = Array.from({ length: 24 }, () => 0);
  const branchTot = new Map<number, { total: number; tickets: number }>();
  const sellerTot = new Map<number, { total: number; tickets: number }>();
  const payTot = new Map<string, { total: number; count: number }>();

  for (const s of cur.completed) {
    const key = isoDay(s.createdAt);
    if (ventasDia.has(key)) {
      ventasDia.set(key, ventasDia.get(key)! + s.totalAmount);
      ticketsDia.set(key, ticketsDia.get(key)! + 1);
    }
    hourArr[s.createdAt.getHours()] += s.totalAmount;
    const bt = branchTot.get(s.branchId) ?? { total: 0, tickets: 0 };
    bt.total += s.totalAmount; bt.tickets += 1; branchTot.set(s.branchId, bt);
    const st = sellerTot.get(s.userId) ?? { total: 0, tickets: 0 };
    st.total += s.totalAmount; st.tickets += 1; sellerTot.set(s.userId, st);
    const pt = payTot.get(s.paymentMethod) ?? { total: 0, count: 0 };
    pt.total += s.totalAmount; pt.count += 1; payTot.set(s.paymentMethod, pt);
  }

  const ventasPorDia = dayKeys.map((k) => ({ fecha: k, total: ventasDia.get(k) ?? 0, tickets: ticketsDia.get(k) ?? 0 }));
  const series = {
    ventasPorDia,
    ticketPromedioDiario: dayKeys.map((k) => {
      const t = ticketsDia.get(k) ?? 0;
      return { fecha: k, promedio: t > 0 ? (ventasDia.get(k) ?? 0) / t : 0 };
    }),
    ventasPorHora: hourArr.map((total, hour) => ({ hour, total })),
    metodosPago: [...payTot.entries()]
      .map(([metodo, v]) => ({ metodo, total: v.total, count: v.count }))
      .sort((a, b) => b.total - a.total),
    porEstado: [
      { estado: "Completadas", count: c.tickets, total: c.ventasBrutas },
      { estado: "Canceladas", count: c.cancelaciones, total: c.ventaCancelada },
      { estado: "Devoluciones", count: c.devoluciones, total: c.devolucionesMonto },
    ],
    ventasPorSucursal: [...branchTot.entries()]
      .map(([id, v]) => ({ sucursal: branchName.get(id) ?? `#${id}`, total: v.total, tickets: v.tickets }))
      .sort((a, b) => b.total - a.total),
    ventasPorVendedor: [...sellerTot.entries()]
      .map(([id, v]) => ({ vendedor: userName.get(id) ?? `#${id}`, total: v.total, tickets: v.tickets }))
      .sort((a, b) => b.total - a.total),
  };

  // ---------------- Rankings ----------------
  const rankings = {
    vendedores: series.ventasPorVendedor.slice(0, 10).map((r, i) => ({ rank: i + 1, nombre: r.vendedor, tickets: r.tickets, importe: r.total })),
    sucursales: series.ventasPorSucursal.slice(0, 10).map((r, i) => ({ rank: i + 1, nombre: r.sucursal, tickets: r.tickets, importe: r.total })),
    dias: [...ventasPorDia].filter((d) => d.total > 0).sort((a, b) => b.total - a.total).slice(0, 10)
      .map((r, i) => ({ rank: i + 1, nombre: r.fecha, tickets: r.tickets, importe: r.total })),
    metodos: series.metodosPago.slice(0, 10).map((r, i) => ({ rank: i + 1, nombre: r.metodo, tickets: r.count, importe: r.total })),
  };

  // ---------------- Detalle de transacciones (respeta el filtro de estado) ----
  const txWhere = { ...buildSaleWhere(f), createdAt: { gte: from, lte: to } };
  const [txTotal, txRaw] = await Promise.all([
    prisma.sale.count({ where: txWhere }),
    prisma.sale.findMany({
      where: txWhere,
      orderBy: { createdAt: "desc" },
      take: TX_LIMIT,
      select: {
        id: true,
        invoiceNumber: true,
        createdAt: true,
        paymentMethod: true,
        status: true,
        taxAmount: true,
        discountAmount: true,
        totalAmount: true,
        branch: { select: { name: true } },
        user: { select: { name: true } },
        customer: { select: { name: true } },
        _count: { select: { saleDetails: true } },
      },
    }),
  ]);

  const transactions = txRaw.map((s) => {
    const total = num(s.totalAmount);
    const iva = num(s.taxAmount);
    return {
      id: s.id,
      folio: s.invoiceNumber,
      fecha: s.createdAt.toISOString(),
      sucursal: s.branch.name,
      vendedor: s.user.name,
      cliente: s.customer?.name ?? "Público General",
      articulos: s._count.saleDetails,
      metodo: s.paymentMethod,
      subtotal: total - iva,
      iva,
      descuento: num(s.discountAmount),
      total,
      estado: STATUS_LABEL[s.status] ?? s.status,
    };
  });

  return {
    period: {
      from: from.toISOString(),
      to: to.toISOString(),
      prevFrom: prevFrom.toISOString(),
      prevTo: prevTo.toISOString(),
      days: dayKeys.length,
    },
    kpis,
    tops: {
      topVendedor: rankings.vendedores[0]?.nombre ?? "—",
      topSucursal: rankings.sucursales[0]?.nombre ?? "—",
      metodoPagoPrincipal: series.metodosPago[0]?.metodo ?? "—",
      mejorDia: rankings.dias[0]?.nombre ?? "—",
    },
    series,
    rankings,
    timeframes,
    transactions,
    transactionsMeta: { total: txTotal, shown: transactions.length, truncated: txTotal > transactions.length },
  };
}
