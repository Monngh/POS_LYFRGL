import React, { useEffect, useMemo, useState } from "react";
import {
  BarChart3, Boxes, ClipboardCheck, Coins, DollarSign, Gauge, Layers,
  LineChart as LineIcon, ListOrdered, Package, Percent, Tag, TrendingUp, Trophy,
  Award, AlertTriangle, Star, Store,
} from "lucide-react";
import api from "../../../shared/services/api";
import { useAuth } from "../../../auth";
import { money, fmtDate } from "../shared";
import {
  COMPANY, ReportLogo, buildFolio, REPORT_VERSION,
  ReportPage, SectionTitle, KpiCard, Semaforo, InsightsPanel, AlertsPanel,
  ChartCard, DonutCard, RankingCard, ReportField, ReportSelect,
  ReportTable, ReportShell, ReportConfigPanel,
  HBars, TrendLine, CAT, CHART,
  fmtInt, fmtPct,
  exportExcel, exportCsv,
  type AlertItem, type RankingRow, type ReportPageDef, type ReportDocBundle, type ExportSheet,
} from "./framework";

// ============================================================================
// REPORTE DE ARTÍCULOS VENDIDOS — hereda la plantilla maestra del framework.
// Aporta: tipos de datos, KPIs de producto, análisis ABC/Pareto, motores de
// análisis y sus páginas A4 (incluido el anexo con el detalle de todos los
// productos vendidos). El resto (portada, encabezados, pie, PDF, impresión,
// visor) lo provee el framework.
// ============================================================================
interface Vary { value: number; prev: number; delta: number; pct: number; }

interface ProdRow {
  rank: number; productId: number; name: string; sku: string; category: string;
  cantidad: number; transacciones: number; precioPromedio: number; importe: number;
  costo: number; utilidad: number; margen: number;
}

interface ProductsData {
  period: { from: string; to: string; prevFrom: string; prevTo: string; days: number };
  kpis: Record<string, Vary>;
  tops: { productoEstrella: string; categoriaLider: string; mayorUtilidad: string; mayorRotacion: string };
  series: {
    topImporte: { nombre: string; sku: string; importe: number }[];
    topUnidades: { nombre: string; sku: string; cantidad: number }[];
    porCategoriaImporte: { categoria: string; importe: number; unidades: number }[];
    porCategoriaUnidades: { categoria: string; importe: number; unidades: number }[];
  };
  pareto: { idx: number; nombre: string; importe: number; pct: number; cumPct: number }[];
  abc: { clase: string; productos: number; importe: number; pctProductos: number; pctImporte: number }[];
  rankings: {
    importe: { rank: number; nombre: string; sku: string; cantidad: number; importe: number; utilidad: number }[];
    unidades: { rank: number; nombre: string; sku: string; cantidad: number; importe: number }[];
    utilidad: { rank: number; nombre: string; sku: string; utilidad: number; importe: number }[];
    categorias: { rank: number; nombre: string; unidades: number; importe: number }[];
  };
  products: ProdRow[];
  productsMeta: { total: number; shown: number; truncated: boolean };
  alertsData: {
    margenNegativoCount: number; margenNegativoEjemplos: string[]; margenBajoCount: number;
    concentracionTopPct: number; concentracionTop5Pct: number;
  };
}

interface FilterOptions {
  branches: { id: number; name: string }[];
  sellers: { id: number; name: string; role: string }[];
  categories: { id: number; name: string }[];
  paymentMethods: string[];
}

const isoToday = () => new Date().toISOString().slice(0, 10);
const isoAgo = (d: number) => new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);

type KpiFmt = "money" | "pct" | "int" | "dec";
const fmtKpi = (fmt: KpiFmt, v: number) =>
  fmt === "money" ? money(v) : fmt === "pct" ? fmtPct(v) : fmt === "dec" ? v.toFixed(2) : fmtInt(v);
const deltaText = (fmt: KpiFmt, d: number) => {
  const s = d >= 0 ? "+" : "";
  if (fmt === "money") return `${s}${money(d)}`;
  if (fmt === "pct") return `${s}${d.toFixed(1)} pp`;
  if (fmt === "dec") return `${s}${d.toFixed(2)}`;
  return `${s}${fmtInt(d)}`;
};

// Filas por página del anexo de artículos (denso, A4 con encabezado y pie).
const ROWS_PER_PAGE = 22;
const ABC_DESC: Record<string, string> = {
  A: "Alto impacto — prioritarios (≈80% del ingreso)",
  B: "Impacto medio — seguimiento regular",
  C: "Bajo impacto — cola larga del catálogo",
};

// ---- Definición de KPIs (icono, formato y polaridad) ----------------------
type KpiDef = { key: string; label: string; icon: any; fmt: KpiFmt; better: boolean };
const KPI_FIN: KpiDef[] = [
  { key: "importe", label: "Importe Total", icon: DollarSign, fmt: "money", better: true },
  { key: "costo", label: "Costo Total", icon: Package, fmt: "money", better: false },
  { key: "utilidad", label: "Utilidad Total", icon: TrendingUp, fmt: "money", better: true },
  { key: "margen", label: "Margen", icon: Percent, fmt: "pct", better: true },
  { key: "precioPromedio", label: "Precio Prom. Unidad", icon: Tag, fmt: "money", better: true },
  { key: "utilidadUnidad", label: "Utilidad por Unidad", icon: Coins, fmt: "money", better: true },
];
const KPI_OPER: KpiDef[] = [
  { key: "unidades", label: "Unidades Vendidas", icon: Boxes, fmt: "int", better: true },
  { key: "productos", label: "Productos Distintos", icon: Layers, fmt: "int", better: true },
  { key: "lineas", label: "Líneas de Venta", icon: ListOrdered, fmt: "int", better: true },
  { key: "unidadesPorLinea", label: "Unidades por Línea", icon: Gauge, fmt: "dec", better: true },
];
const RESUMEN_ROWS: { key: string; label: string; fmt: KpiFmt; better: boolean }[] = [
  { key: "importe", label: "Importe Total", fmt: "money", better: true },
  { key: "costo", label: "Costo Total", fmt: "money", better: false },
  { key: "utilidad", label: "Utilidad Total", fmt: "money", better: true },
  { key: "margen", label: "Margen", fmt: "pct", better: true },
  { key: "unidades", label: "Unidades Vendidas", fmt: "int", better: true },
  { key: "productos", label: "Productos Distintos", fmt: "int", better: true },
  { key: "lineas", label: "Líneas de Venta", fmt: "int", better: true },
  { key: "precioPromedio", label: "Precio Prom. Unidad", fmt: "money", better: true },
  { key: "utilidadUnidad", label: "Utilidad por Unidad", fmt: "money", better: true },
  { key: "unidadesPorLinea", label: "Unidades por Línea", fmt: "dec", better: true },
];

// ---- Motores de análisis (100% dinámicos — sin texto fijo) ----------------
const B: React.FC<{ children: React.ReactNode }> = ({ children }) => <b>{children}</b>;

function buildInsights(d: ProductsData): React.ReactNode[] {
  const k = d.kpis;
  const out: React.ReactNode[] = [];
  const dir = (p: number, up: string, down: string) => (p >= 0 ? up : down);
  out.push(<>El importe vendido en artículos {dir(k.importe.pct, "creció", "disminuyó")} <B>{fmtPct(Math.abs(k.importe.pct))}</B> respecto al periodo anterior ({money(k.importe.value)} vs. {money(k.importe.prev)}).</>);
  out.push(<>Se vendieron <B>{fmtInt(k.unidades.value)}</B> unidades de <B>{fmtInt(k.productos.value)}</B> productos distintos, con una utilidad de <B>{money(k.utilidad.value)}</B> a un margen del <B>{fmtPct(k.margen.value)}</B>.</>);
  const clsA = d.abc.find((a) => a.clase === "A");
  if (clsA && clsA.productos > 0) out.push(<>Análisis ABC: <B>{fmtInt(clsA.productos)}</B> productos «A» (<B>{fmtPct(clsA.pctProductos)}</B> del catálogo vendido) concentran el <B>{fmtPct(clsA.pctImporte)}</B> del ingreso.</>);
  if (d.tops.productoEstrella !== "—") {
    const star = d.series.topImporte[0];
    out.push(<>El producto de mayor ingreso fue <B>{d.tops.productoEstrella}</B>{star ? <> con <B>{money(star.importe)}</B> ({fmtPct(d.alertsData.concentracionTopPct)} del total)</> : null}.</>);
  }
  if (d.tops.mayorRotacion !== "—") {
    const r = d.series.topUnidades[0];
    out.push(<>El artículo de mayor rotación fue <B>{d.tops.mayorRotacion}</B>{r ? <> con <B>{fmtInt(r.cantidad)}</B> unidades vendidas</> : null}.</>);
  }
  if (d.series.porCategoriaImporte.length > 0) {
    const tot = d.series.porCategoriaImporte.reduce((a, c) => a + c.importe, 0);
    const top = d.series.porCategoriaImporte[0];
    out.push(<>La categoría líder fue <B>{top.categoria}</B>, con el <B>{fmtPct(tot > 0 ? (top.importe / tot) * 100 : 0)}</B> del importe vendido.</>);
  }
  out.push(<>El precio promedio por unidad se ubicó en <B>{money(k.precioPromedio.value)}</B>, con una utilidad promedio de <B>{money(k.utilidadUnidad.value)}</B> por unidad.</>);
  return out;
}

function buildAlerts(d: ProductsData): AlertItem[] {
  const k = d.kpis;
  const a = d.alertsData;
  const out: AlertItem[] = [];
  if (k.importe.pct < -10) out.push({ tone: "red", text: <>Contracción: el importe vendido cayó <B>{fmtPct(Math.abs(k.importe.pct))}</B> vs. el periodo anterior.</> });
  if (a.margenNegativoCount > 0) out.push({ tone: "red", text: <><B>{fmtInt(a.margenNegativoCount)}</B> producto(s) vendidos con margen negativo{a.margenNegativoEjemplos.length > 0 && <>: {a.margenNegativoEjemplos.join(", ")}</>}. Revisar costo o precio.</> });
  if (a.margenBajoCount > 0) out.push({ tone: "amber", text: <><B>{fmtInt(a.margenBajoCount)}</B> producto(s) con margen inferior al 10%.</> });
  if (a.concentracionTopPct > 30) out.push({ tone: "amber", text: <>Dependencia de un solo producto: <B>{d.tops.productoEstrella}</B> representa el <B>{fmtPct(a.concentracionTopPct)}</B> del ingreso.</> });
  if (a.concentracionTop5Pct > 70) out.push({ tone: "amber", text: <>Alta concentración: los 5 productos principales acumulan el <B>{fmtPct(a.concentracionTop5Pct)}</B> del ingreso.</> });
  if (k.margen.value < 15 && k.importe.value > 0) out.push({ tone: "amber", text: <>Margen global bajo: <B>{fmtPct(k.margen.value)}</B>. Revisar mezcla de productos y descuentos.</> });
  if (d.productsMeta.truncated) out.push({ tone: "amber", text: <>El detalle muestra los <B>{fmtInt(d.productsMeta.shown)}</B> productos de mayor ingreso de <B>{fmtInt(d.productsMeta.total)}</B>. Use Excel para el listado completo.</> });
  if (out.length === 0 && k.importe.pct > 5) out.push({ tone: "green", text: <>Desempeño saludable: crecimiento de <B>{fmtPct(k.importe.pct)}</B> en importe vendido, con margen del <B>{fmtPct(k.margen.value)}</B>.</> });
  return out;
}

function buildConclusions(d: ProductsData): React.ReactNode[] {
  const k = d.kpis;
  const parts: React.ReactNode[] = [];
  parts.push(
    <>Las ventas de artículos {k.importe.pct >= 0 ? "mantienen una tendencia positiva" : "presentan una contracción"} en el periodo, con {money(k.importe.value)} de importe ({k.importe.pct >= 0 ? "+" : ""}{fmtPct(k.importe.pct)} vs. periodo anterior), {fmtInt(k.unidades.value)} unidades y una utilidad de {money(k.utilidad.value)} al {fmtPct(k.margen.value)} de margen.</>
  );
  const clsA = d.abc.find((a) => a.clase === "A");
  const clsC = d.abc.find((a) => a.clase === "C");
  if (clsA && clsC) parts.push(
    <>La estructura de ingresos está concentrada: {fmtInt(clsA.productos)} productos «A» generan el {fmtPct(clsA.pctImporte)} del ingreso, mientras que {fmtInt(clsC.productos)} productos «C» aportan apenas el {fmtPct(clsC.pctImporte)}. Conviene proteger el abasto de los productos «A» y revisar la rentabilidad de la cola larga.</>
  );
  if (d.series.porCategoriaImporte.length > 1) {
    const tot = d.series.porCategoriaImporte.reduce((a, c) => a + c.importe, 0);
    const top = d.series.porCategoriaImporte[0];
    parts.push(<>La categoría {top.categoria} lidera con el {fmtPct(tot > 0 ? (top.importe / tot) * 100 : 0)} del importe; el resto del surtido ofrece espacio para impulsar ventas y atender los puntos de la sección de alertas.</>);
  }
  return parts;
}

const margenColor = (m: number): string => (m < 0 ? "#b91c1c" : m < 10 ? "#b45309" : "#15803d");
const abcColor = (clase: string): string => (clase === "A" ? "#15803d" : clase === "B" ? "#b45309" : "#64748b");

// ============================================================================
// Componente
// ============================================================================
const ArticulosReport: React.FC<{ branchId: string; branchLabel: string }> = ({ branchId, branchLabel }) => {
  const { user } = useAuth();

  // ---- Filtros ----
  const [from, setFrom] = useState(isoAgo(29));
  const [to, setTo] = useState(isoToday());
  const [fBranch, setFBranch] = useState<string>(branchId);
  const [fSeller, setFSeller] = useState("");
  const [fCategory, setFCategory] = useState("");
  const [fProduct, setFProduct] = useState("");
  const [fSearch, setFSearch] = useState("");
  const [options, setOptions] = useState<FilterOptions | null>(null);
  const [configOpen, setConfigOpen] = useState(true);

  // ---- Datos ----
  const [data, setData] = useState<ProductsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ folio: string; generatedAt: Date } | null>(null);

  useEffect(() => {
    api.get<FilterOptions>("/api/admin/reports/filter-options").then((r) => setOptions(r.data)).catch(() => {});
  }, []);
  useEffect(() => { setFBranch(branchId); }, [branchId]);

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<ProductsData>("/api/admin/reports/products-report", {
        params: {
          from, to,
          ...(fBranch !== "all" ? { branchId: fBranch } : {}),
          ...(fSeller ? { sellerId: fSeller } : {}),
          ...(fCategory ? { categoryId: fCategory } : {}),
          ...(fProduct ? { product: fProduct } : {}),
          ...(fSearch ? { search: fSearch } : {}),
        },
      });
      setData(res.data);
      setMeta({ folio: buildFolio("RPT-ART"), generatedAt: new Date() });
      setConfigOpen(false);
    } catch (e: any) {
      setError(e?.response?.data?.message || "No se pudo generar el reporte.");
    } finally {
      setLoading(false);
    }
  };

  // ---- Etiquetas derivadas ----
  const branchOptions = options?.branches ?? [];
  const branchDisplay = fBranch === "all" ? "Todas las sucursales" : branchOptions.find((b) => String(b.id) === String(fBranch))?.name || branchLabel;
  const periodLabel = `${fmtDate(from)} – ${fmtDate(to)}`;
  const userName = user?.name ?? "—";

  const filtersLabel = useMemo(() => {
    const parts: string[] = [periodLabel, branchDisplay];
    if (fSeller && options) parts.push(`Vendedor: ${options.sellers.find((s) => String(s.id) === fSeller)?.name ?? fSeller}`);
    if (fCategory && options) parts.push(`Categoría: ${options.categories.find((c) => String(c.id) === fCategory)?.name ?? fCategory}`);
    if (fProduct) parts.push(`Producto: ${fProduct}`);
    if (fSearch) parts.push(`Búsqueda: ${fSearch}`);
    return parts.join(" · ");
  }, [periodLabel, branchDisplay, fSeller, fCategory, fProduct, fSearch, options]);

  const insights = useMemo(() => (data ? buildInsights(data) : []), [data]);
  const alerts = useMemo(() => (data ? buildAlerts(data) : []), [data]);
  const conclusions = useMemo(() => (data ? buildConclusions(data) : []), [data]);

  // ---- Exportaciones ----
  const buildResumenRows = (d: ProductsData) =>
    RESUMEN_ROWS.map((r) => {
      const v = d.kpis[r.key];
      return {
        concepto: r.label,
        actual: r.fmt === "int" ? Math.round(v.value) : Number(v.value.toFixed(2)),
        anterior: r.fmt === "int" ? Math.round(v.prev) : Number(v.prev.toFixed(2)),
        varMon: Number(v.delta.toFixed(2)),
        varPct: Number(v.pct.toFixed(2)),
      };
    });

  const onExcel = () => {
    if (!data || !meta) return;
    const sheets: ExportSheet[] = [
      {
        name: "Indicadores", title: `Artículos Vendidos · ${periodLabel}`,
        columns: [
          { header: "Concepto", key: "concepto", width: 26 },
          { header: "Periodo actual", key: "actual", type: "number" },
          { header: "Periodo anterior", key: "anterior", type: "number" },
          { header: "Variación $", key: "varMon", type: "number" },
          { header: "Variación %", key: "varPct", type: "number" },
        ],
        rows: buildResumenRows(data),
      },
      {
        name: "Análisis ABC",
        columns: [
          { header: "Clase", key: "clase", width: 10 },
          { header: "Productos", key: "productos", type: "int" },
          { header: "% Productos", key: "pctProductos", type: "pct" },
          { header: "Importe", key: "importe", type: "money" },
          { header: "% Importe", key: "pctImporte", type: "pct" },
        ],
        rows: data.abc.map((a) => ({ ...a, pctProductos: Number(a.pctProductos.toFixed(1)), pctImporte: Number(a.pctImporte.toFixed(1)) })),
      },
      {
        name: "Artículos",
        columns: [
          { header: "#", key: "rank", type: "int", width: 6 },
          { header: "Producto", key: "name", width: 34 },
          { header: "SKU", key: "sku", width: 16 },
          { header: "Categoría", key: "category", width: 20 },
          { header: "Cantidad", key: "cantidad", type: "int" },
          { header: "Transacciones", key: "transacciones", type: "int" },
          { header: "Precio prom.", key: "precioPromedio", type: "money" },
          { header: "Importe", key: "importe", type: "money" },
          { header: "Costo", key: "costo", type: "money" },
          { header: "Utilidad", key: "utilidad", type: "money" },
          { header: "Margen %", key: "margen", type: "pct" },
        ],
        rows: data.products.map((p) => ({ ...p, margen: Number(p.margen.toFixed(1)) })),
        totals: {
          cantidad: data.products.reduce((a, p) => a + p.cantidad, 0),
          importe: data.products.reduce((a, p) => a + p.importe, 0),
          costo: data.products.reduce((a, p) => a + p.costo, 0),
          utilidad: data.products.reduce((a, p) => a + p.utilidad, 0),
        },
      },
      {
        name: "Por categoría",
        columns: [
          { header: "Categoría", key: "categoria", width: 26 },
          { header: "Unidades", key: "unidades", type: "int" },
          { header: "Importe", key: "importe", type: "money" },
        ],
        rows: data.series.porCategoriaImporte,
      },
    ];
    exportExcel(`Articulos_Vendidos_${from}_${to}`, sheets, {
      Reporte: "Artículos Vendidos",
      Versión: REPORT_VERSION,
      Folio: meta.folio,
      Empresa: COMPANY.legalName,
      Sucursal: branchDisplay,
      Periodo: periodLabel,
      "Generado por": userName,
      "Fecha de generación": meta.generatedAt.toLocaleString("es-MX"),
      Filtros: filtersLabel,
    });
  };

  const onCsv = () => {
    if (!data) return;
    exportCsv(`Articulos_Vendidos_${from}_${to}`, [
      { header: "#", key: "rank" },
      { header: "Producto", key: "name" },
      { header: "SKU", key: "sku" },
      { header: "Categoría", key: "category" },
      { header: "Cantidad", key: "cantidad" },
      { header: "Transacciones", key: "transacciones" },
      { header: "Precio prom.", key: "precioPromedio" },
      { header: "Importe", key: "importe" },
      { header: "Costo", key: "costo" },
      { header: "Utilidad", key: "utilidad" },
      { header: "Margen %", key: "margen" },
    ], data.products.map((p) => ({ ...p, margen: Number(p.margen.toFixed(1)) })));
  };

  // ---- Panel de configuración ----
  const configPanel = (
    <ReportConfigPanel
      open={configOpen}
      onToggle={() => setConfigOpen(!configOpen)}
      canCollapse={!!data}
      onGenerate={generate}
      onClear={() => { setFSeller(""); setFCategory(""); setFProduct(""); setFSearch(""); }}
      loading={loading}
      generated={!!data}
    >
      <ReportField label="Fecha inicial"><input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></ReportField>
      <ReportField label="Fecha final"><input type="date" value={to} min={from} max={isoToday()} onChange={(e) => setTo(e.target.value)} /></ReportField>
      <ReportField label="Sucursal">
        <select value={fBranch} onChange={(e) => setFBranch(e.target.value)}>
          <option value="all">Todas las sucursales</option>
          {branchOptions.map((b) => <option key={b.id} value={String(b.id)}>{b.name}</option>)}
        </select>
      </ReportField>
      <ReportField label="Categoría"><ReportSelect value={fCategory} onChange={setFCategory} options={(options?.categories ?? []).map((c) => ({ value: String(c.id), label: c.name }))} allLabel="Todas" /></ReportField>
      <ReportField label="Vendedor / Usuario"><ReportSelect value={fSeller} onChange={setFSeller} options={(options?.sellers ?? []).map((s) => ({ value: String(s.id), label: s.name }))} allLabel="Todos" /></ReportField>
      <ReportField label="Producto"><input type="text" maxLength={80} value={fProduct} onChange={(e) => setFProduct(e.target.value)} placeholder="Nombre o SKU" /></ReportField>
      <ReportField label="Buscar por texto"><input type="text" maxLength={80} value={fSearch} onChange={(e) => setFSearch(e.target.value)} placeholder="Folio, producto, cliente…" /></ReportField>
    </ReportConfigPanel>
  );

  // ---- Documento ----
  let doc: ReportDocBundle | undefined;
  if (data && meta) {
    const k = data.kpis;

    const rankImporte = (rows: { rank: number; nombre: string; importe: number; cantidad?: number }[], label: (r: any) => string): RankingRow[] => {
      const max = rows[0]?.importe || 1;
      return rows.map((r) => ({ rank: r.rank, nombre: r.nombre, valor: money(r.importe), meta: label(r), share: (r.importe / max) * 100 }));
    };
    const rankUtilidad = (rows: { rank: number; nombre: string; utilidad: number; importe: number }[]): RankingRow[] => {
      const max = rows[0]?.utilidad || 1;
      return rows.map((r) => ({ rank: r.rank, nombre: r.nombre, valor: money(r.utilidad), meta: `${fmtPct(r.importe > 0 ? (r.utilidad / r.importe) * 100 : 0)} margen`, share: (r.utilidad / max) * 100 }));
    };
    const resumenRows = RESUMEN_ROWS.map((r) => ({ ...r, v: k[r.key] }));

    const detTotals = {
      cantidad: data.products.reduce((a, p) => a + p.cantidad, 0),
      importe: data.products.reduce((a, p) => a + p.importe, 0),
      costo: data.products.reduce((a, p) => a + p.costo, 0),
      utilidad: data.products.reduce((a, p) => a + p.utilidad, 0),
    };
    const detTotalMargen = detTotals.importe > 0 ? (detTotals.utilidad / detTotals.importe) * 100 : 0;

    const detColumns = [
      { key: "rank", header: "#", align: "center" as const, render: (p: ProdRow) => String(p.rank) },
      { key: "name", header: "Producto", render: (p: ProdRow) => <span style={{ fontWeight: 700 }}>{p.name}</span> },
      { key: "sku", header: "SKU", render: (p: ProdRow) => p.sku },
      { key: "category", header: "Categoría", render: (p: ProdRow) => p.category },
      { key: "cantidad", header: "Cant.", align: "center" as const, render: (p: ProdRow) => fmtInt(p.cantidad) },
      { key: "precioPromedio", header: "Precio prom.", align: "right" as const, render: (p: ProdRow) => money(p.precioPromedio) },
      { key: "importe", header: "Importe", align: "right" as const, render: (p: ProdRow) => <span style={{ fontWeight: 700 }}>{money(p.importe)}</span> },
      { key: "costo", header: "Costo", align: "right" as const, render: (p: ProdRow) => money(p.costo) },
      { key: "utilidad", header: "Utilidad", align: "right" as const, render: (p: ProdRow) => money(p.utilidad) },
      { key: "margen", header: "Margen", align: "right" as const, render: (p: ProdRow) => <span style={{ color: margenColor(p.margen), fontWeight: 800 }}>{fmtPct(p.margen)}</span> },
    ];

    // Anexo — detalle de artículos paginado.
    const chunks: ProdRow[][] = [];
    for (let i = 0; i < data.products.length; i += ROWS_PER_PAGE) chunks.push(data.products.slice(i, i + ROWS_PER_PAGE));
    const detailPages: ReportPageDef[] = chunks.map((chunk, ci) => {
      const startRow = ci * ROWS_PER_PAGE + 1;
      const endRow = ci * ROWS_PER_PAGE + chunk.length;
      const isLast = ci === chunks.length - 1;
      return {
        id: `det-${ci}`,
        toc: ci === 0 ? "Detalle de artículos" : undefined,
        render: (page, dm) => (
          <ReportPage meta={dm} page={page}>
            <SectionTitle
              icon={ListOrdered}
              title="Anexo — Detalle de artículos vendidos"
              sub={`Productos ${fmtInt(startRow)}–${fmtInt(endRow)} de ${fmtInt(data.productsMeta.shown)}${data.productsMeta.truncated ? ` (de ${fmtInt(data.productsMeta.total)} totales)` : ""} · ordenados por importe`}
            />
            <ReportTable
              rows={chunk}
              keyOf={(p: ProdRow) => p.productId}
              columns={detColumns}
              total={isLast ? {
                sku: `${fmtInt(data.productsMeta.shown)} productos`,
                cantidad: fmtInt(detTotals.cantidad),
                importe: money(detTotals.importe),
                costo: money(detTotals.costo),
                utilidad: money(detTotals.utilidad),
                margen: fmtPct(detTotalMargen),
              } : undefined}
              totalLabel="TOTALES"
              totalSpan={1}
            />
          </ReportPage>
        ),
      };
    });
    if (detailPages.length === 0) {
      detailPages.push({
        id: "det-empty",
        toc: "Detalle de artículos",
        render: (page, dm) => (
          <ReportPage meta={dm} page={page}>
            <SectionTitle icon={ListOrdered} title="Anexo — Detalle de artículos vendidos" />
            <div className="erp-alert-empty">Sin artículos vendidos en el periodo con los filtros seleccionados.</div>
          </ReportPage>
        ),
      });
    }

    const pages: ReportPageDef[] = [
      // 1 · PORTADA
      {
        id: "portada", toc: "Portada",
        render: (page, dm) => (
          <ReportPage meta={dm} page={page} cover>
            <div className="erp-cover-top">
              <ReportLogo size={58} />
              <div>
                <div className="erp-cover-brandname">{COMPANY.name}</div>
                <div className="erp-cover-brandtag">{COMPANY.tagline}</div>
              </div>
            </div>
            <div className="erp-cover-band">
              <div className="erp-cover-kicker">Reporte de Producto</div>
              <div className="erp-cover-title">Artículos<br />Vendidos</div>
              <div className="erp-cover-desc">Análisis del desempeño de los productos: indicadores con variación, análisis ABC / Pareto de concentración de ingresos, rentabilidad por artículo, desglose por categoría, rankings y el detalle completo de lo vendido.</div>
            </div>
            <div className="erp-cover-meta">
              {[
                ["Empresa", COMPANY.legalName],
                ["Reporte", `Artículos Vendidos · Versión ${REPORT_VERSION}`],
                ["Periodo analizado", periodLabel],
                ["Sucursal", branchDisplay],
                ["Generado por", userName],
                ["Folio", meta.folio],
                ["Fecha de generación", meta.generatedAt.toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" })],
                ["Hora", meta.generatedAt.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })],
              ].map(([l, v]) => (
                <div className="erp-cover-meta-item" key={l}>
                  <div className="erp-cover-meta-label">{l}</div>
                  <div className="erp-cover-meta-value">{v}</div>
                </div>
              ))}
            </div>
          </ReportPage>
        ),
      },
      // 2 · KPIs FINANCIEROS
      {
        id: "kpi-fin", toc: "Indicadores",
        render: (page, dm) => (
          <ReportPage meta={dm} page={page}>
            <SectionTitle icon={BarChart3} title="Indicadores de producto — Rentabilidad" sub={periodLabel} />
            <div className="erp-kpi-grid big">
              {KPI_FIN.map((def) => (
                <KpiCard key={def.key} icon={def.icon} label={def.label} display={fmtKpi(def.fmt, k[def.key].value)} variation={k[def.key]} higherIsBetter={def.better} />
              ))}
            </div>
          </ReportPage>
        ),
      },
      // 3 · KPIs OPERACIÓN + DESTACADOS
      {
        id: "kpi-op",
        render: (page, dm) => (
          <ReportPage meta={dm} page={page}>
            <SectionTitle icon={Boxes} title="Indicadores de producto — Volumen" sub={periodLabel} />
            <div className="erp-kpi-grid big">
              {KPI_OPER.map((def) => (
                <KpiCard key={def.key} icon={def.icon} label={def.label} display={fmtKpi(def.fmt, k[def.key].value)} variation={k[def.key]} higherIsBetter={def.better} />
              ))}
            </div>
            <SectionTitle icon={Award} title="Destacados del periodo" />
            <div className="erp-tops" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
              {[
                ["Producto estrella (ingreso)", data.tops.productoEstrella],
                ["Mayor rotación (unidades)", data.tops.mayorRotacion],
                ["Mayor utilidad", data.tops.mayorUtilidad],
                ["Categoría líder", data.tops.categoriaLider],
              ].map(([l, v]) => (
                <div className="erp-top" key={l}>
                  <div className="erp-top-label">{l}</div>
                  <div className="erp-top-value">{v}</div>
                </div>
              ))}
            </div>
          </ReportPage>
        ),
      },
      // 4 · TABLA RESUMEN (actual vs anterior)
      {
        id: "comparativo", toc: "Comparativo",
        render: (page, dm) => (
          <ReportPage meta={dm} page={page}>
            <SectionTitle icon={ClipboardCheck} title="Tabla resumen de artículos" sub="Periodo vs. periodo anterior equivalente" />
            <ReportTable
              rows={resumenRows}
              keyOf={(r: any) => r.key}
              columns={[
                { key: "label", header: "Concepto", render: (r: any) => <span style={{ fontWeight: 700 }}>{r.label}</span> },
                { key: "actual", header: "Periodo actual", align: "right", render: (r: any) => fmtKpi(r.fmt, r.v.value) },
                { key: "anterior", header: "Periodo anterior", align: "right", render: (r: any) => fmtKpi(r.fmt, r.v.prev) },
                { key: "delta", header: "Variación", align: "right", render: (r: any) => deltaText(r.fmt, r.v.delta) },
                { key: "pct", header: "Variación %", align: "right", render: (r: any) => <span style={{ color: (r.better ? r.v.pct >= 0 : r.v.pct <= 0) ? "#15803d" : "#b91c1c", fontWeight: 800 }}>{r.v.pct >= 0 ? "+" : ""}{r.v.pct.toFixed(1)}%</span> },
                { key: "sem", header: "Semáforo", align: "center", render: (r: any) => <Semaforo pct={r.v.pct} higherIsBetter={r.better} /> },
              ]}
            />
          </ReportPage>
        ),
      },
      // 5 · ANÁLISIS ABC / PARETO
      {
        id: "abc", toc: "Análisis ABC",
        render: (page, dm) => (
          <ReportPage meta={dm} page={page}>
            <SectionTitle icon={Layers} title="Análisis ABC — Concentración de ingresos" sub="Clasificación de productos por contribución al importe" />
            <ReportTable
              rows={data.abc}
              keyOf={(a: any) => a.clase}
              columns={[
                { key: "clase", header: "Clase", align: "center", render: (a: any) => <span style={{ color: abcColor(a.clase), fontWeight: 900, fontSize: 14 }}>{a.clase}</span> },
                { key: "desc", header: "Interpretación", render: (a: any) => ABC_DESC[a.clase] },
                { key: "productos", header: "Productos", align: "right", render: (a: any) => fmtInt(a.productos) },
                { key: "pctProductos", header: "% del catálogo", align: "right", render: (a: any) => fmtPct(a.pctProductos) },
                { key: "importe", header: "Importe", align: "right", render: (a: any) => money(a.importe) },
                { key: "pctImporte", header: "% del ingreso", align: "right", render: (a: any) => <span style={{ fontWeight: 800 }}>{fmtPct(a.pctImporte)}</span> },
              ]}
            />
            <SectionTitle icon={LineIcon} title="Curva de Pareto — ¿Pocos productos generan la mayoría del ingreso?" sub="Ingreso acumulado sobre los 20 productos principales" />
            <ChartCard question="¿Dónde se acumula el ingreso?" sub="Porcentaje acumulado del importe por producto (ordenados de mayor a menor)" full>
              <TrendLine data={data.pareto} xKey="idx" yKey="cumPct" name="Acumulado" height={190} color={CHART.navy} formatX={(v) => `#${v}`} formatY={(v) => `${Math.round(v)}%`} formatValue={(v) => fmtPct(v)} formatLabel={(l) => `Producto #${l}`} />
            </ChartCard>
          </ReportPage>
        ),
      },
      // 6 · ESTRUCTURA (productos y categorías)
      {
        id: "estructura", toc: "Estructura",
        render: (page, dm) => (
          <ReportPage meta={dm} page={page}>
            <SectionTitle icon={BarChart3} title="Estructura de las ventas por producto y categoría" />
            <div className="erp-charts-grid">
              <ChartCard question="¿Qué productos generan más ingreso?" sub="Top 8 por importe">
                <HBars data={data.series.topImporte.slice(0, 8)} categoryKey="nombre" valueKey="importe" name="Importe" height={165} yWidth={104} yFontSize={7.5} barSize={12} color={CHART.blue} formatValue={money} />
              </ChartCard>
              <ChartCard question="¿Qué productos tienen más rotación?" sub="Top 8 por unidades">
                <HBars data={data.series.topUnidades.slice(0, 8)} categoryKey="nombre" valueKey="cantidad" name="Unidades" height={165} yWidth={104} yFontSize={7.5} barSize={12} formatValue={fmtInt} formatX={fmtInt} />
              </ChartCard>
              <DonutCard
                question="¿Cómo se reparte el ingreso por categoría?"
                sub="Participación por importe · segmentos menores se agrupan en «Otros»"
                data={data.series.porCategoriaImporte.map((c, i) => ({ name: c.categoria, value: c.importe, color: CAT[i % CAT.length] }))}
                format={(v) => money(v)}
                centerTitle="Total"
              />
              <ChartCard question="¿Qué categorías mueven más unidades?" sub="Top 8 por volumen">
                <HBars data={data.series.porCategoriaUnidades.slice(0, 8)} categoryKey="categoria" valueKey="unidades" name="Unidades" height={165} yWidth={92} barSize={12} color={CHART.navy} formatValue={fmtInt} formatX={fmtInt} />
              </ChartCard>
            </div>
          </ReportPage>
        ),
      },
      // 7 · HALLAZGOS + ALERTAS
      {
        id: "hallazgos", toc: "Hallazgos y Alertas",
        render: (page, dm) => (
          <ReportPage meta={dm} page={page}>
            <SectionTitle icon={TrendingUp} title="Hallazgos del periodo" sub="Generados automáticamente a partir de los datos" />
            <InsightsPanel items={insights} />
            <SectionTitle icon={AlertTriangle} title="Alertas del negocio" sub="Excepciones que requieren atención" />
            <AlertsPanel items={alerts} />
          </ReportPage>
        ),
      },
      // 8 · RANKINGS
      {
        id: "rankings", toc: "Rankings",
        render: (page, dm) => (
          <ReportPage meta={dm} page={page}>
            <SectionTitle icon={Trophy} title="Rankings del periodo" sub="Top 10" />
            <div className="erp-rank-grid">
              <RankingCard icon={Star} title="Top productos por ingreso" rows={rankImporte(data.rankings.importe, (r) => `${fmtInt(r.cantidad)} uds`)} />
              <RankingCard icon={Boxes} title="Top productos por rotación" rows={rankImporte(data.rankings.unidades, (r) => `${fmtInt(r.cantidad)} uds`)} />
              <RankingCard icon={Coins} title="Top productos por utilidad" rows={rankUtilidad(data.rankings.utilidad)} />
              <RankingCard icon={Store} title="Top categorías por ingreso" rows={rankImporte(data.rankings.categorias, (r) => `${fmtInt(r.unidades)} uds`)} />
            </div>
          </ReportPage>
        ),
      },
      // 9 · CONCLUSIONES
      {
        id: "conclusiones", toc: "Conclusiones",
        render: (page, dm) => (
          <ReportPage meta={dm} page={page}>
            <SectionTitle icon={ClipboardCheck} title="Conclusiones" sub="Síntesis automática del periodo" />
            <div className="erp-conclusion">
              {conclusions.map((c, i) => <p key={i}>{c}</p>)}
            </div>
          </ReportPage>
        ),
      },
      // 10..N · ANEXO — DETALLE DE ARTÍCULOS
      ...detailPages,
    ];

    doc = {
      docMeta: {
        reportTitle: "Artículos Vendidos",
        folio: meta.folio,
        branch: branchDisplay,
        period: periodLabel,
        user: userName,
        filtersLabel,
        generatedAt: meta.generatedAt,
      },
      pages,
      filenameBase: "Articulos_Vendidos",
      onExcel,
      onCsv,
    };
  }

  return (
    <ReportShell
      configPanel={configPanel}
      ready={!!data && !!meta}
      loading={loading}
      error={error}
      doc={doc}
      emptyText="Configure los filtros y presione «Generar reporte» para obtener la vista previa del documento."
    />
  );
};

export default ArticulosReport;
