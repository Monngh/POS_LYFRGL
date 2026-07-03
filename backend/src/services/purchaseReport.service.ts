import { prisma } from "../app";
import { vary, isoDay, dayStart } from "./executiveSummary.service";

// ============================================================================
// Reporte de Compras (órdenes a proveedores) — hereda la plantilla maestra.
// Periodo con comparativo vs. periodo anterior. Resume el gasto en compras,
// desglosa por proveedor / estado / sucursal, rankea proveedores y productos
// comprados, y lista el detalle de órdenes. Reutiliza helpers de executiveSummary.
// ============================================================================

export interface PurchaseReportFilters {
  from: Date;
  to: Date;
  branchId?: number;
  status?: string;
  search?: string;
}

const num = (v: any) => Number(v ?? 0);
const DETAIL_LIMIT = 4000;

export const PURCHASE_STATUS_LABEL: Record<string, string> = {
  PENDIENTE: "Pendiente",
  RECIBIDA: "Recibida",
  CANCELADA: "Cancelada",
  PARCIAL: "Parcial",
};

const buildWhere = (f: PurchaseReportFilters): any => {
  const where: any = { purchaseDate: { gte: f.from, lte: f.to } };
  if (f.branchId) where.branchId = f.branchId;
  if (f.status && f.status !== "all") where.status = f.status;
  if (f.search) where.OR = [{ reference: { contains: f.search } }, { supplier: { name: { contains: f.search } } }];
  return where;
};

export async function getPurchaseReport(f: PurchaseReportFilters) {
  const { from, to } = f;
  const durationMs = to.getTime() - from.getTime();
  const prevTo = new Date(from.getTime() - 1);
  const prevFrom = new Date(from.getTime() - durationMs - 1);

  const [orders, prevOrders] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where: buildWhere(f),
      orderBy: { purchaseDate: "desc" },
      select: {
        id: true, reference: true, purchaseDate: true, subtotal: true, tax: true, total: true, status: true,
        supplierId: true,
        supplier: { select: { name: true } },
        branch: { select: { name: true } },
        createdByUser: { select: { name: true } },
        _count: { select: { details: true } },
      },
    }),
    prisma.purchaseOrder.findMany({
      where: buildWhere({ ...f, from: prevFrom, to: prevTo }),
      select: { total: true, subtotal: true, tax: true, status: true, supplierId: true },
    }),
  ]);

  const orderIds = orders.map((o) => o.id);
  const [details, prevUnitsAgg] = await Promise.all([
    orderIds.length
      ? prisma.purchaseDetail.findMany({
          where: { purchaseOrderId: { in: orderIds } },
          select: { quantity: true, unitCost: true, subtotal: true, product: { select: { name: true, sku: true } } },
        })
      : Promise.resolve([]),
    prisma.purchaseDetail.aggregate({
      where: { purchaseOrder: buildWhere({ ...f, from: prevFrom, to: prevTo }) },
      _sum: { quantity: true },
    }),
  ]);

  const coreOf = (rows: { total: any; subtotal: any; tax: any; status: string; supplierId: number }[], unidades: number) => ({
    ordenes: rows.length,
    totalComprado: rows.reduce((a, r) => a + num(r.total), 0),
    subtotal: rows.reduce((a, r) => a + num(r.subtotal), 0),
    iva: rows.reduce((a, r) => a + num(r.tax), 0),
    recibidas: rows.filter((r) => r.status === "RECIBIDA").length,
    pendientes: rows.filter((r) => r.status === "PENDIENTE").length,
    canceladas: rows.filter((r) => r.status === "CANCELADA").length,
    unidadesCompradas: unidades,
    proveedores: new Set(rows.map((r) => r.supplierId)).size,
    promedioPorOrden: rows.length > 0 ? rows.reduce((a, r) => a + num(r.total), 0) / rows.length : 0,
  });

  const curUnidades = details.reduce((a, d) => a + d.quantity, 0);
  const c = coreOf(orders as any, curUnidades);
  const p = coreOf(prevOrders as any, num(prevUnitsAgg._sum.quantity));

  const KPI_KEYS = ["ordenes", "totalComprado", "subtotal", "iva", "recibidas", "pendientes", "canceladas", "unidadesCompradas", "proveedores", "promedioPorOrden"] as const;
  const kpis: Record<string, ReturnType<typeof vary>> = {};
  for (const key of KPI_KEYS) kpis[key] = vary((c as any)[key] ?? 0, (p as any)[key] ?? 0);

  // ---------------- Series ----------------
  const dayKeys: string[] = [];
  for (let d = dayStart(from); d <= to; d.setDate(d.getDate() + 1)) dayKeys.push(isoDay(d));
  const compraDia = new Map<string, number>(dayKeys.map((k) => [k, 0]));
  const provMap = new Map<string, { total: number; ordenes: number }>();
  const branchMap = new Map<string, { total: number; ordenes: number }>();
  const estadoMap = new Map<string, { count: number; total: number }>();

  for (const o of orders) {
    const key = isoDay(o.purchaseDate);
    if (compraDia.has(key)) compraDia.set(key, compraDia.get(key)! + num(o.total));
    const pv = provMap.get(o.supplier.name) ?? { total: 0, ordenes: 0 };
    pv.total += num(o.total); pv.ordenes += 1; provMap.set(o.supplier.name, pv);
    const bt = branchMap.get(o.branch.name) ?? { total: 0, ordenes: 0 };
    bt.total += num(o.total); bt.ordenes += 1; branchMap.set(o.branch.name, bt);
    const es = estadoMap.get(o.status) ?? { count: 0, total: 0 };
    es.count += 1; es.total += num(o.total); estadoMap.set(o.status, es);
  }

  const porProveedor = [...provMap.entries()].map(([proveedor, v]) => ({ proveedor, total: v.total, ordenes: v.ordenes })).sort((a, b) => b.total - a.total);
  const series = {
    porDia: dayKeys.map((k) => ({ fecha: k, total: compraDia.get(k) ?? 0 })),
    porProveedor: porProveedor.slice(0, 12),
    porEstado: [...estadoMap.entries()].map(([estado, v]) => ({ estado: PURCHASE_STATUS_LABEL[estado] ?? estado, count: v.count, total: v.total })).sort((a, b) => b.total - a.total),
    porSucursal: [...branchMap.entries()].map(([sucursal, v]) => ({ sucursal, total: v.total, ordenes: v.ordenes })).sort((a, b) => b.total - a.total),
  };

  // ---------------- Productos comprados ----------------
  const prodMap = new Map<string, { nombre: string; sku: string; cantidad: number; costo: number }>();
  for (const d of details) {
    const keyName = d.product.name;
    const e = prodMap.get(keyName) ?? { nombre: d.product.name, sku: d.product.sku, cantidad: 0, costo: 0 };
    e.cantidad += d.quantity; e.costo += num(d.subtotal); prodMap.set(keyName, e);
  }
  const topProductos = [...prodMap.values()].sort((a, b) => b.costo - a.costo).slice(0, 10);

  const rankings = {
    proveedores: porProveedor.slice(0, 10).map((r, i) => ({ rank: i + 1, nombre: r.proveedor, ordenes: r.ordenes, importe: r.total })),
    productos: topProductos.map((r, i) => ({ rank: i + 1, nombre: r.nombre, sku: r.sku, cantidad: r.cantidad, importe: r.costo })),
    sucursales: series.porSucursal.slice(0, 10).map((r, i) => ({ rank: i + 1, nombre: r.sucursal, ordenes: r.ordenes, importe: r.total })),
  };

  // ---------------- Detalle de órdenes (anexo) ----------------
  const purchases = orders.slice(0, DETAIL_LIMIT).map((o) => ({
    id: o.id,
    folio: o.reference,
    fecha: o.purchaseDate.toISOString(),
    proveedor: o.supplier.name,
    sucursal: o.branch.name,
    articulos: o._count.details,
    subtotal: num(o.subtotal),
    iva: num(o.tax),
    total: num(o.total),
    estado: PURCHASE_STATUS_LABEL[o.status] ?? o.status,
    estadoRaw: o.status,
    registro: o.createdByUser?.name ?? "—",
  }));

  // ---------------- Datos para alertas ----------------
  const now = Date.now();
  const pendientes = orders.filter((o) => o.status === "PENDIENTE");
  const antiguas = pendientes.filter((o) => now - o.purchaseDate.getTime() > 15 * 864e5);
  const alertsData = {
    pendientesCount: pendientes.length,
    pendientesMonto: pendientes.reduce((a, o) => a + num(o.total), 0),
    antiguasCount: antiguas.length,
    antiguasEjemplos: antiguas.slice(0, 5).map((o) => o.reference),
    canceladasCount: orders.filter((o) => o.status === "CANCELADA").length,
    canceladasMonto: orders.filter((o) => o.status === "CANCELADA").reduce((a, o) => a + num(o.total), 0),
  };

  return {
    period: { from: from.toISOString(), to: to.toISOString(), prevFrom: prevFrom.toISOString(), prevTo: prevTo.toISOString(), days: dayKeys.length },
    kpis,
    tops: {
      proveedorPrincipal: porProveedor[0]?.proveedor ?? "—",
      sucursalPrincipal: series.porSucursal[0]?.sucursal ?? "—",
      productoMasComprado: topProductos[0]?.nombre ?? "—",
    },
    series,
    rankings,
    purchases,
    purchasesMeta: { total: orders.length, shown: purchases.length, truncated: orders.length > purchases.length },
    alertsData,
  };
}
