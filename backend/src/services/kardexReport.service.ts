import { prisma } from "../app";
import { vary, isoDay, dayStart } from "./executiveSummary.service";

// ============================================================================
// Reporte de Kardex (movimientos de inventario) — hereda la plantilla maestra.
// Periodo con comparativo vs. periodo anterior. Resume entradas/salidas,
// desglosa por tipo de movimiento, series diarias, rankings por producto y el
// detalle completo de movimientos. Reutiliza helpers de executiveSummary.
// ============================================================================

export interface KardexReportFilters {
  from: Date;
  to: Date;
  branchId?: number;
  movementType?: string;
  search?: string;
}

const DETAIL_LIMIT = 4000;

export const MOV_LABEL: Record<string, string> = {
  COMPRA: "Compra",
  VENTA: "Venta",
  DEVOLUCION: "Devolución",
  AJUSTE_INVENTARIO: "Ajuste inventario",
  AJUSTE_MERMA: "Merma",
  TRASPASO_ENTRADA: "Traspaso entrada",
  TRASPASO_SALIDA: "Traspaso salida",
};

interface LightRow { quantityChange: number; movementType: string; productId: number; createdAt: Date }

const buildWhere = (f: KardexReportFilters): any => {
  const where: any = { createdAt: { gte: f.from, lte: f.to } };
  if (f.branchId) where.branchId = f.branchId;
  if (f.movementType && f.movementType !== "all") where.movementType = f.movementType;
  if (f.search) where.product = { OR: [{ name: { contains: f.search } }, { sku: { contains: f.search } }] };
  return where;
};

function coreFrom(rows: LightRow[]) {
  let entradas = 0, salidas = 0, entradasUnidades = 0, salidasUnidades = 0, mermaUnidades = 0;
  const prods = new Set<number>();
  for (const r of rows) {
    if (r.quantityChange >= 0) { entradas += 1; entradasUnidades += r.quantityChange; }
    else { salidas += 1; salidasUnidades += Math.abs(r.quantityChange); }
    if (r.movementType === "AJUSTE_MERMA") mermaUnidades += Math.abs(r.quantityChange);
    prods.add(r.productId);
  }
  return {
    movimientos: rows.length,
    entradas,
    salidas,
    entradasUnidades,
    salidasUnidades,
    unidadesNetas: entradasUnidades - salidasUnidades,
    productosAfectados: prods.size,
    mermaUnidades,
  };
}

const KPI_KEYS = ["movimientos", "entradas", "salidas", "entradasUnidades", "salidasUnidades", "unidadesNetas", "productosAfectados", "mermaUnidades"] as const;

export async function getKardexReport(f: KardexReportFilters) {
  const { from, to } = f;
  const durationMs = to.getTime() - from.getTime();
  const prevTo = new Date(from.getTime() - 1);
  const prevFrom = new Date(from.getTime() - durationMs - 1);

  const [light, prevLight, detailRaw] = await Promise.all([
    prisma.kardex.findMany({ where: buildWhere(f), select: { quantityChange: true, movementType: true, productId: true, createdAt: true } }),
    prisma.kardex.findMany({ where: buildWhere({ ...f, from: prevFrom, to: prevTo }), select: { quantityChange: true, movementType: true, productId: true, createdAt: true } }),
    prisma.kardex.findMany({
      where: buildWhere(f),
      take: DETAIL_LIMIT,
      orderBy: { createdAt: "desc" },
      select: {
        quantityChange: true, balanceAfter: true, movementType: true, reason: true, createdAt: true,
        product: { select: { name: true, sku: true } },
        branch: { select: { name: true } },
        user: { select: { name: true } },
      },
    }),
  ]);

  const c = coreFrom(light);
  const p = coreFrom(prevLight);
  const kpis: Record<string, ReturnType<typeof vary>> = {};
  for (const key of KPI_KEYS) kpis[key] = vary((c as any)[key] ?? 0, (p as any)[key] ?? 0);

  // ---------------- Series diarias ----------------
  const dayKeys: string[] = [];
  for (let d = dayStart(from); d <= to; d.setDate(d.getDate() + 1)) dayKeys.push(isoDay(d));
  const entradasDia = new Map<string, number>(dayKeys.map((k) => [k, 0]));
  const salidasDia = new Map<string, number>(dayKeys.map((k) => [k, 0]));
  for (const r of light) {
    const key = isoDay(r.createdAt);
    if (!entradasDia.has(key)) continue;
    if (r.quantityChange >= 0) entradasDia.set(key, entradasDia.get(key)! + r.quantityChange);
    else salidasDia.set(key, salidasDia.get(key)! + Math.abs(r.quantityChange));
  }

  // ---------------- Desglose por tipo ----------------
  const tipoMap = new Map<string, { count: number; unidades: number }>();
  for (const r of light) {
    const e = tipoMap.get(r.movementType) ?? { count: 0, unidades: 0 };
    e.count += 1; e.unidades += Math.abs(r.quantityChange); tipoMap.set(r.movementType, e);
  }
  const porTipo = [...tipoMap.entries()]
    .map(([tipo, v]) => ({ tipo: MOV_LABEL[tipo] ?? tipo, tipoRaw: tipo, count: v.count, unidades: v.unidades }))
    .sort((a, b) => b.count - a.count);

  const series = {
    porDia: dayKeys.map((k) => ({ fecha: k, entradas: entradasDia.get(k) ?? 0, salidas: salidasDia.get(k) ?? 0 })),
    porTipo,
  };

  // ---------------- Rankings por producto ----------------
  const prodAgg = new Map<number, { movs: number; entradaU: number; salidaU: number }>();
  for (const r of light) {
    const e = prodAgg.get(r.productId) ?? { movs: 0, entradaU: 0, salidaU: 0 };
    e.movs += 1;
    if (r.quantityChange >= 0) e.entradaU += r.quantityChange; else e.salidaU += Math.abs(r.quantityChange);
    prodAgg.set(r.productId, e);
  }
  const topMovIds = [...prodAgg.entries()].sort((a, b) => b[1].movs - a[1].movs).slice(0, 10).map(([id]) => id);
  const topEntradaIds = [...prodAgg.entries()].sort((a, b) => b[1].entradaU - a[1].entradaU).slice(0, 10).map(([id]) => id);
  const topSalidaIds = [...prodAgg.entries()].sort((a, b) => b[1].salidaU - a[1].salidaU).slice(0, 10).map(([id]) => id);
  const rankIds = [...new Set([...topMovIds, ...topEntradaIds, ...topSalidaIds])];
  const rankProducts = rankIds.length
    ? await prisma.product.findMany({ where: { id: { in: rankIds } }, select: { id: true, name: true, sku: true } })
    : [];
  const nameOf = new Map(rankProducts.map((pr) => [pr.id, pr]));
  const mkRank = (ids: number[], val: (a: { movs: number; entradaU: number; salidaU: number }) => number) =>
    ids.map((id, i) => {
      const a = prodAgg.get(id)!;
      const pr = nameOf.get(id);
      return { rank: i + 1, nombre: pr?.name ?? `#${id}`, sku: pr?.sku ?? "", movs: a.movs, valor: val(a) };
    });

  const rankings = {
    movimientos: mkRank(topMovIds, (a) => a.movs),
    entradas: mkRank(topEntradaIds, (a) => a.entradaU),
    salidas: mkRank(topSalidaIds, (a) => a.salidaU),
    tipos: porTipo.slice(0, 10).map((t, i) => ({ rank: i + 1, nombre: t.tipo, movs: t.count, valor: t.unidades })),
  };

  // ---------------- Detalle (anexo) ----------------
  const entries = detailRaw.map((k) => ({
    fecha: k.createdAt.toISOString(),
    producto: k.product.name,
    sku: k.product.sku,
    sucursal: k.branch.name,
    tipo: MOV_LABEL[k.movementType] ?? k.movementType,
    tipoRaw: k.movementType,
    cambio: k.quantityChange,
    saldo: k.balanceAfter,
    usuario: k.user.name,
    motivo: k.reason ?? "—",
  }));

  // ---------------- Datos para alertas ----------------
  const mermaEjemplos = [...new Set(entries.filter((e) => e.tipoRaw === "AJUSTE_MERMA").map((e) => e.producto))].slice(0, 5);
  const ajusteNegativos = light.filter((r) => r.movementType === "AJUSTE_INVENTARIO" && r.quantityChange < 0).length;
  const alertsData = {
    mermaCount: tipoMap.get("AJUSTE_MERMA")?.count ?? 0,
    mermaUnidades: c.mermaUnidades,
    mermaEjemplos,
    ajusteCount: tipoMap.get("AJUSTE_INVENTARIO")?.count ?? 0,
    ajusteNegativos,
    traspasos: (tipoMap.get("TRASPASO_ENTRADA")?.count ?? 0) + (tipoMap.get("TRASPASO_SALIDA")?.count ?? 0),
  };

  return {
    period: { from: from.toISOString(), to: to.toISOString(), prevFrom: prevFrom.toISOString(), prevTo: prevTo.toISOString(), days: dayKeys.length },
    kpis,
    tops: {
      tipoPrincipal: porTipo[0]?.tipo ?? "—",
      productoMasMovido: rankings.movimientos[0]?.nombre ?? "—",
      diaMasActivo: series.porDia.reduce((m, d) => (d.entradas + d.salidas > m.tot ? { fecha: d.fecha, tot: d.entradas + d.salidas } : m), { fecha: "—", tot: 0 }).fecha,
    },
    series,
    rankings,
    entries,
    entriesMeta: { total: light.length, shown: entries.length, truncated: light.length > entries.length },
    alertsData,
  };
}
