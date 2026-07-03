import { prisma } from "../app";

// ============================================================================
// Reporte de Existencias (inventario valorizado) — hereda la plantilla maestra.
// Es un reporte de CORTE (punto en el tiempo, sin comparativo de periodo):
// valoriza el inventario actual a costo y a precio de venta, clasifica el
// estado del stock (disponible / bajo / agotado / exceso), desglosa por
// categoría y sucursal, y lista el detalle completo.
// ============================================================================

export interface InventoryReportFilters {
  branchId?: number;
  categoryId?: number;
  search?: string;
}

const num = (v: any) => Number(v ?? 0);
const DETAIL_LIMIT = 3000;

type Estado = "Disponible" | "Stock bajo" | "Agotado" | "Exceso";

const estadoDe = (stock: number, min: number, max: number): Estado => {
  if (stock <= 0) return "Agotado";
  if (stock <= min) return "Stock bajo";
  if (max > 0 && stock > max) return "Exceso";
  return "Disponible";
};

export async function getInventoryReport(f: InventoryReportFilters) {
  const where: any = {
    product: {
      ...(f.categoryId ? { categoryId: f.categoryId } : {}),
      ...(f.search ? { OR: [{ name: { contains: f.search } }, { sku: { contains: f.search } }] } : {}),
    },
  };
  if (f.branchId) where.branchId = f.branchId;

  const inventories = await prisma.inventory.findMany({
    where,
    select: {
      quantity: true,
      minStock: true,
      maxStock: true,
      branchId: true,
      branch: { select: { name: true } },
      product: {
        select: { id: true, name: true, sku: true, active: true, costPrice: true, sellPrice: true, category: { select: { name: true } } },
      },
    },
  });

  // Agregar por producto (suma de existencias entre las sucursales en alcance).
  interface Agg {
    productId: number; name: string; sku: string; category: string; active: boolean;
    costPrice: number; sellPrice: number; stock: number; minStock: number; maxStock: number;
  }
  const prodMap = new Map<number, Agg>();
  const branchValor = new Map<string, { valorCosto: number; unidades: number }>();
  const catMap = new Map<string, { valorCosto: number; valorVenta: number; unidades: number }>();

  for (const inv of inventories) {
    const p = inv.product;
    const cat = p.category?.name ?? "Sin categoría";
    const cost = num(p.costPrice);
    const sell = num(p.sellPrice);

    const e =
      prodMap.get(p.id) ??
      { productId: p.id, name: p.name, sku: p.sku, category: cat, active: p.active, costPrice: cost, sellPrice: sell, stock: 0, minStock: 0, maxStock: 0 };
    e.stock += inv.quantity;
    e.minStock += inv.minStock;
    e.maxStock += inv.maxStock;
    prodMap.set(p.id, e);

    const valorCosto = inv.quantity * cost;
    const bv = branchValor.get(inv.branch.name) ?? { valorCosto: 0, unidades: 0 };
    bv.valorCosto += valorCosto; bv.unidades += inv.quantity; branchValor.set(inv.branch.name, bv);

    const ce = catMap.get(cat) ?? { valorCosto: 0, valorVenta: 0, unidades: 0 };
    ce.valorCosto += valorCosto; ce.valorVenta += inv.quantity * sell; ce.unidades += inv.quantity; catMap.set(cat, ce);
  }

  const rows = [...prodMap.values()].map((e) => {
    const valorCosto = e.stock * e.costPrice;
    const valorVenta = e.stock * e.sellPrice;
    const utilidadPotencial = valorVenta - valorCosto;
    return {
      productId: e.productId, name: e.name, sku: e.sku, category: e.category, active: e.active,
      stock: e.stock, minStock: e.minStock, maxStock: e.maxStock, costPrice: e.costPrice, sellPrice: e.sellPrice,
      valorCosto, valorVenta, utilidadPotencial,
      margen: valorVenta > 0 ? (utilidadPotencial / valorVenta) * 100 : 0,
      estado: estadoDe(e.stock, e.minStock, e.maxStock),
    };
  });

  const byValor = [...rows].sort((a, b) => b.valorCosto - a.valorCosto);
  const byStock = [...rows].sort((a, b) => b.stock - a.stock);

  // ---------------- KPIs de corte (sin variación) ----------------
  const valorCosto = rows.reduce((a, r) => a + r.valorCosto, 0);
  const valorVenta = rows.reduce((a, r) => a + r.valorVenta, 0);
  const utilidadPotencial = valorVenta - valorCosto;
  const kpis = {
    productos: rows.length,
    unidades: rows.reduce((a, r) => a + r.stock, 0),
    valorCosto,
    valorVenta,
    utilidadPotencial,
    margenPotencial: valorVenta > 0 ? (utilidadPotencial / valorVenta) * 100 : 0,
    agotados: rows.filter((r) => r.estado === "Agotado").length,
    stockBajo: rows.filter((r) => r.estado === "Stock bajo").length,
    sobreStock: rows.filter((r) => r.estado === "Exceso").length,
    inactivosConStock: rows.filter((r) => !r.active && r.stock > 0).length,
  };

  // ---------------- Series / distribución ----------------
  const porCategoria = [...catMap.entries()]
    .map(([categoria, v]) => ({ categoria, valorCosto: v.valorCosto, valorVenta: v.valorVenta, unidades: v.unidades }))
    .sort((a, b) => b.valorCosto - a.valorCosto);

  const estados: Estado[] = ["Disponible", "Stock bajo", "Agotado", "Exceso"];
  const series = {
    porCategoria: porCategoria.slice(0, 12),
    estadoInventario: estados.map((estado) => ({ estado, count: rows.filter((r) => r.estado === estado).length })),
    porSucursal: [...branchValor.entries()].map(([sucursal, v]) => ({ sucursal, valorCosto: v.valorCosto, unidades: v.unidades })).sort((a, b) => b.valorCosto - a.valorCosto),
    topValor: byValor.slice(0, 12).map((r) => ({ nombre: r.name, sku: r.sku, valorCosto: r.valorCosto })),
  };

  // ---------------- Rankings ----------------
  const criticos = rows.filter((r) => r.estado === "Agotado" || r.estado === "Stock bajo")
    .sort((a, b) => a.stock - a.minStock - (b.stock - b.minStock));
  const rankings = {
    valor: byValor.slice(0, 10).map((r, i) => ({ rank: i + 1, nombre: r.name, sku: r.sku, stock: r.stock, importe: r.valorCosto })),
    unidades: byStock.slice(0, 10).map((r, i) => ({ rank: i + 1, nombre: r.name, sku: r.sku, stock: r.stock, importe: r.valorCosto })),
    categorias: porCategoria.slice(0, 10).map((c, i) => ({ rank: i + 1, nombre: c.categoria, unidades: c.unidades, importe: c.valorCosto })),
    criticos: criticos.slice(0, 10).map((r, i) => ({ rank: i + 1, nombre: r.name, sku: r.sku, stock: r.stock, minStock: r.minStock, estado: r.estado })),
  };

  // ---------------- Detalle (anexo) ----------------
  const detailAll = byValor.map((r, i) => ({ rank: i + 1, ...r }));
  const products = detailAll.slice(0, DETAIL_LIMIT);

  // ---------------- Datos para alertas ----------------
  const agotadosRows = rows.filter((r) => r.estado === "Agotado");
  const bajoRows = rows.filter((r) => r.estado === "Stock bajo");
  const excesoRows = rows.filter((r) => r.estado === "Exceso");
  const inactivosRows = rows.filter((r) => !r.active && r.stock > 0);
  const alertsData = {
    agotadosCount: agotadosRows.length,
    agotadosEjemplos: agotadosRows.slice(0, 5).map((r) => r.name),
    bajoCount: bajoRows.length,
    bajoEjemplos: bajoRows.slice(0, 5).map((r) => r.name),
    excesoCount: excesoRows.length,
    excesoEjemplos: excesoRows.slice(0, 4).map((r) => r.name),
    inactivosCount: inactivosRows.length,
    inactivosEjemplos: inactivosRows.slice(0, 4).map((r) => r.name),
    valorInmovilizado: excesoRows.reduce((a, r) => a + r.valorCosto, 0),
  };

  return {
    generatedAt: new Date().toISOString(),
    kpis,
    tops: {
      productoMayorValor: byValor[0]?.name ?? "—",
      categoriaMayorValor: porCategoria[0]?.categoria ?? "—",
      productoMayorStock: byStock[0]?.name ?? "—",
    },
    series,
    rankings,
    products,
    productsMeta: { total: detailAll.length, shown: products.length, truncated: detailAll.length > products.length },
    alertsData,
  };
}
