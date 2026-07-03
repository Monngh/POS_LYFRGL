import { prisma } from "../app";
import { buildSaleWhere, vary, type SummaryFilters } from "./executiveSummary.service";

// ============================================================================
// Reporte de Artículos Vendidos (detallado) — hereda la plantilla maestra.
// Aporta: KPIs de producto con variación vs. periodo anterior, análisis ABC /
// Pareto (concentración de ingresos), desglose por categoría, rankings y el
// detalle de todos los productos vendidos. Reutiliza helpers de
// executiveSummary.service. Mide únicamente ventas COMPLETADAS.
// ============================================================================

export type ProductsReportFilters = SummaryFilters;

// Tope de productos listados en el anexo del documento (protege el render).
const DETAIL_LIMIT = 3000;

const num = (v: any) => Number(v ?? 0);

interface ProdCore {
  importe: number;
  costo: number;
  utilidad: number;
  margen: number;
  unidades: number;
  productos: number;
  lineas: number;
  precioPromedio: number;
  utilidadUnidad: number;
  unidadesPorLinea: number;
}

interface ProdAgg {
  productId: number;
  name: string;
  sku: string;
  category: string;
  cantidad: number;
  transacciones: number;
  importe: number;
  costo: number;
  utilidad: number;
}

interface PeriodLoad {
  core: ProdCore;
  products: Map<number, ProdAgg>;
  categories: Map<string, { importe: number; unidades: number }>;
}

async function loadPeriod(from: Date, to: Date, f: ProductsReportFilters): Promise<PeriodLoad> {
  const base = buildSaleWhere(f);
  delete base.status; // artículos vendidos = ventas efectivas (completadas)
  const saleWhere = { ...base, status: "COMPLETADA", createdAt: { gte: from, lte: to } };

  const sales = await prisma.sale.findMany({ where: saleWhere, select: { id: true } });
  const saleIds = sales.map((s) => s.id);

  const detailWhere: any = { saleId: { in: saleIds } };
  if (f.categoryId) detailWhere.product = { categoryId: f.categoryId };
  if (f.productSearch) {
    detailWhere.product = {
      ...(detailWhere.product ?? {}),
      OR: [{ name: { contains: f.productSearch } }, { sku: { contains: f.productSearch } }],
    };
  }

  const details =
    saleIds.length > 0
      ? await prisma.saleDetail.findMany({
          where: detailWhere,
          select: {
            quantity: true,
            unitPrice: true,
            costPrice: true,
            product: { select: { id: true, name: true, sku: true, category: { select: { name: true } } } },
          },
        })
      : [];

  const products = new Map<number, ProdAgg>();
  const categories = new Map<string, { importe: number; unidades: number }>();

  for (const d of details) {
    const qty = d.quantity;
    const importe = num(d.unitPrice) * qty;
    const costo = num(d.costPrice) * qty;
    const cat = d.product.category?.name ?? "Sin categoría";

    const e =
      products.get(d.product.id) ??
      { productId: d.product.id, name: d.product.name, sku: d.product.sku, category: cat, cantidad: 0, transacciones: 0, importe: 0, costo: 0, utilidad: 0 };
    e.cantidad += qty;
    e.transacciones += 1;
    e.importe += importe;
    e.costo += costo;
    e.utilidad += importe - costo;
    products.set(d.product.id, e);

    const ce = categories.get(cat) ?? { importe: 0, unidades: 0 };
    ce.importe += importe;
    ce.unidades += qty;
    categories.set(cat, ce);
  }

  const importe = [...products.values()].reduce((a, p) => a + p.importe, 0);
  const costo = [...products.values()].reduce((a, p) => a + p.costo, 0);
  const utilidad = importe - costo;
  const unidades = [...products.values()].reduce((a, p) => a + p.cantidad, 0);
  const lineas = details.length;
  const distintos = products.size;

  const core: ProdCore = {
    importe,
    costo,
    utilidad,
    margen: importe > 0 ? (utilidad / importe) * 100 : 0,
    unidades,
    productos: distintos,
    lineas,
    precioPromedio: unidades > 0 ? importe / unidades : 0,
    utilidadUnidad: unidades > 0 ? utilidad / unidades : 0,
    unidadesPorLinea: lineas > 0 ? unidades / lineas : 0,
  };

  return { core, products, categories };
}

const KPI_KEYS: (keyof ProdCore)[] = [
  "importe", "costo", "utilidad", "margen", "precioPromedio", "utilidadUnidad",
  "unidades", "productos", "lineas", "unidadesPorLinea",
];

export async function getProductsReport(f: ProductsReportFilters) {
  const { from, to } = f;
  const durationMs = to.getTime() - from.getTime();
  const prevTo = new Date(from.getTime() - 1);
  const prevFrom = new Date(from.getTime() - durationMs - 1);

  const [cur, prev] = await Promise.all([loadPeriod(from, to, f), loadPeriod(prevFrom, prevTo, f)]);
  const c = cur.core;
  const p = prev.core;

  const kpis: Record<string, ReturnType<typeof vary>> = {};
  for (const k of KPI_KEYS) kpis[k] = vary(c[k] ?? 0, p[k] ?? 0);

  // ---------------- Ordenamientos base ----------------
  const byImporte = [...cur.products.values()].sort((a, b) => b.importe - a.importe);
  const byUnidades = [...cur.products.values()].sort((a, b) => b.cantidad - a.cantidad);
  const byUtilidad = [...cur.products.values()].sort((a, b) => b.utilidad - a.utilidad);
  const totalImporte = c.importe || 1;
  const totalProductos = byImporte.length || 1;

  // ---------------- Análisis ABC / Pareto ----------------
  const abcAcc = { A: { productos: 0, importe: 0 }, B: { productos: 0, importe: 0 }, C: { productos: 0, importe: 0 } };
  let cum = 0;
  for (const prod of byImporte) {
    cum += prod.importe;
    const cumPct = (cum / totalImporte) * 100;
    const cls: "A" | "B" | "C" = cumPct <= 80 ? "A" : cumPct <= 95 ? "B" : "C";
    abcAcc[cls].productos += 1;
    abcAcc[cls].importe += prod.importe;
  }
  const abc = (["A", "B", "C"] as const).map((clase) => ({
    clase,
    productos: abcAcc[clase].productos,
    importe: abcAcc[clase].importe,
    pctProductos: (abcAcc[clase].productos / totalProductos) * 100,
    pctImporte: (abcAcc[clase].importe / totalImporte) * 100,
  }));

  let cumP = 0;
  const pareto = byImporte.slice(0, 20).map((prod, i) => {
    cumP += prod.importe;
    return {
      idx: i + 1,
      nombre: prod.name,
      importe: prod.importe,
      pct: (prod.importe / totalImporte) * 100,
      cumPct: (cumP / totalImporte) * 100,
    };
  });

  // ---------------- Series / categorías ----------------
  const porCategoria = [...cur.categories.entries()]
    .map(([categoria, v]) => ({ categoria, importe: v.importe, unidades: v.unidades }))
    .sort((a, b) => b.importe - a.importe);

  const series = {
    topImporte: byImporte.slice(0, 12).map((prod) => ({ nombre: prod.name, sku: prod.sku, importe: prod.importe })),
    topUnidades: byUnidades.slice(0, 12).map((prod) => ({ nombre: prod.name, sku: prod.sku, cantidad: prod.cantidad })),
    porCategoriaImporte: porCategoria.slice(0, 10),
    porCategoriaUnidades: [...porCategoria].sort((a, b) => b.unidades - a.unidades).slice(0, 10),
  };

  // ---------------- Rankings top-10 ----------------
  const rankings = {
    importe: byImporte.slice(0, 10).map((prod, i) => ({ rank: i + 1, nombre: prod.name, sku: prod.sku, cantidad: prod.cantidad, importe: prod.importe, utilidad: prod.utilidad })),
    unidades: byUnidades.slice(0, 10).map((prod, i) => ({ rank: i + 1, nombre: prod.name, sku: prod.sku, cantidad: prod.cantidad, importe: prod.importe })),
    utilidad: byUtilidad.slice(0, 10).map((prod, i) => ({ rank: i + 1, nombre: prod.name, sku: prod.sku, utilidad: prod.utilidad, importe: prod.importe })),
    categorias: porCategoria.slice(0, 10).map((cat, i) => ({ rank: i + 1, nombre: cat.categoria, unidades: cat.unidades, importe: cat.importe })),
  };

  const tops = {
    productoEstrella: byImporte[0]?.name ?? "—",
    categoriaLider: porCategoria[0]?.categoria ?? "—",
    mayorUtilidad: byUtilidad[0]?.name ?? "—",
    mayorRotacion: byUnidades[0]?.name ?? "—",
  };

  // ---------------- Detalle completo (anexo) ----------------
  const detailAll = byImporte.map((prod, i) => ({
    rank: i + 1,
    productId: prod.productId,
    name: prod.name,
    sku: prod.sku,
    category: prod.category,
    cantidad: prod.cantidad,
    transacciones: prod.transacciones,
    precioPromedio: prod.cantidad > 0 ? prod.importe / prod.cantidad : 0,
    importe: prod.importe,
    costo: prod.costo,
    utilidad: prod.utilidad,
    margen: prod.importe > 0 ? (prod.utilidad / prod.importe) * 100 : 0,
  }));
  const products = detailAll.slice(0, DETAIL_LIMIT);

  // ---------------- Datos para alertas ----------------
  const margenNegativo = byImporte.filter((prod) => prod.utilidad < 0);
  const margenBajo = byImporte.filter((prod) => prod.importe > 0 && prod.utilidad >= 0 && (prod.utilidad / prod.importe) * 100 < 10);
  const alertsData = {
    margenNegativoCount: margenNegativo.length,
    margenNegativoEjemplos: margenNegativo.slice(0, 4).map((prod) => prod.name),
    margenBajoCount: margenBajo.length,
    concentracionTopPct: byImporte[0] ? (byImporte[0].importe / totalImporte) * 100 : 0,
    concentracionTop5Pct: byImporte.slice(0, 5).reduce((a, prod) => a + prod.importe, 0) / totalImporte * 100,
  };

  return {
    period: {
      from: from.toISOString(),
      to: to.toISOString(),
      prevFrom: prevFrom.toISOString(),
      prevTo: prevTo.toISOString(),
      days: Math.max(1, Math.round(durationMs / 864e5) + 1),
    },
    kpis,
    tops,
    series,
    pareto,
    abc,
    rankings,
    products,
    productsMeta: { total: detailAll.length, shown: products.length, truncated: detailAll.length > products.length },
    alertsData,
  };
}
