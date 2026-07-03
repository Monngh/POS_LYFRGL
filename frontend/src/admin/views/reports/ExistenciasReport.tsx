import React, { useEffect, useMemo, useState } from "react";
import {
  BarChart3, Boxes, ClipboardCheck, Coins, DollarSign, Layers, ListOrdered,
  Package, Percent, Store, TrendingUp, Trophy, Award, AlertTriangle, Ban,
  PackageX, PackageCheck,
} from "lucide-react";
import api from "../../../shared/services/api";
import { useAuth } from "../../../auth";
import { money, fmtDate } from "../shared";
import {
  COMPANY, ReportLogo, buildFolio, REPORT_VERSION,
  ReportPage, SectionTitle, KpiCard, InsightsPanel, AlertsPanel,
  ChartCard, DonutCard, RankingCard, ReportField, ReportSelect,
  ReportTable, ReportShell, ReportConfigPanel,
  HBars, CAT, CHART,
  fmtInt, fmtPct,
  exportExcel, exportCsv,
  type AlertItem, type RankingRow, type ReportPageDef, type ReportDocBundle, type ExportSheet,
} from "./framework";

// ============================================================================
// REPORTE DE EXISTENCIAS (inventario valorizado) — hereda la plantilla maestra.
// Reporte de CORTE (punto en el tiempo): valoriza el inventario a costo y a
// precio, clasifica el estado del stock, desglosa por categoría y sucursal, y
// lista el detalle completo. Sin comparativo de periodo (KPIs sin variación).
// ============================================================================
interface InvRow {
  rank: number; productId: number; name: string; sku: string; category: string; active: boolean;
  stock: number; minStock: number; maxStock: number; costPrice: number; sellPrice: number;
  valorCosto: number; valorVenta: number; utilidadPotencial: number; margen: number; estado: string;
}

interface InventoryData {
  generatedAt: string;
  kpis: {
    productos: number; unidades: number; valorCosto: number; valorVenta: number; utilidadPotencial: number;
    margenPotencial: number; agotados: number; stockBajo: number; sobreStock: number; inactivosConStock: number;
  };
  tops: { productoMayorValor: string; categoriaMayorValor: string; productoMayorStock: string };
  series: {
    porCategoria: { categoria: string; valorCosto: number; valorVenta: number; unidades: number }[];
    estadoInventario: { estado: string; count: number }[];
    porSucursal: { sucursal: string; valorCosto: number; unidades: number }[];
    topValor: { nombre: string; sku: string; valorCosto: number }[];
  };
  rankings: {
    valor: { rank: number; nombre: string; sku: string; stock: number; importe: number }[];
    unidades: { rank: number; nombre: string; sku: string; stock: number; importe: number }[];
    categorias: { rank: number; nombre: string; unidades: number; importe: number }[];
    criticos: { rank: number; nombre: string; sku: string; stock: number; minStock: number; estado: string }[];
  };
  products: InvRow[];
  productsMeta: { total: number; shown: number; truncated: boolean };
  alertsData: {
    agotadosCount: number; agotadosEjemplos: string[]; bajoCount: number; bajoEjemplos: string[];
    excesoCount: number; excesoEjemplos: string[]; inactivosCount: number; inactivosEjemplos: string[];
    valorInmovilizado: number;
  };
}

interface FilterOptions {
  branches: { id: number; name: string }[];
  categories: { id: number; name: string }[];
}

type KpiFmt = "money" | "pct" | "int";
const fmtKpi = (fmt: KpiFmt, v: number) => (fmt === "money" ? money(v) : fmt === "pct" ? fmtPct(v) : fmtInt(v));
const ROWS_PER_PAGE = 22;

const ESTADO_COLOR: Record<string, string> = {
  Disponible: "#15803d", "Stock bajo": "#b45309", Agotado: "#b91c1c", Exceso: "#2563eb",
};
const estadoColor = (e: string) => ESTADO_COLOR[e] ?? "#64748b";

type KpiDef = { key: keyof InventoryData["kpis"]; label: string; icon: any; fmt: KpiFmt };
const KPI_VAL: KpiDef[] = [
  { key: "productos", label: "Productos", icon: Package, fmt: "int" },
  { key: "unidades", label: "Unidades en Stock", icon: Boxes, fmt: "int" },
  { key: "valorCosto", label: "Valor a Costo", icon: DollarSign, fmt: "money" },
  { key: "valorVenta", label: "Valor a Precio Venta", icon: Coins, fmt: "money" },
  { key: "utilidadPotencial", label: "Utilidad Potencial", icon: TrendingUp, fmt: "money" },
  { key: "margenPotencial", label: "Margen Potencial", icon: Percent, fmt: "pct" },
];
const KPI_EST: KpiDef[] = [
  { key: "agotados", label: "Agotados", icon: PackageX, fmt: "int" },
  { key: "stockBajo", label: "Stock Bajo", icon: AlertTriangle, fmt: "int" },
  { key: "sobreStock", label: "Sobre-inventario", icon: PackageCheck, fmt: "int" },
  { key: "inactivosConStock", label: "Inactivos con Stock", icon: Ban, fmt: "int" },
];

const B: React.FC<{ children: React.ReactNode }> = ({ children }) => <b>{children}</b>;

function buildInsights(d: InventoryData): React.ReactNode[] {
  const k = d.kpis;
  const out: React.ReactNode[] = [];
  out.push(<>El inventario actual suma <B>{fmtInt(k.unidades)}</B> unidades de <B>{fmtInt(k.productos)}</B> productos, valorizadas en <B>{money(k.valorCosto)}</B> a costo.</>);
  out.push(<>A precio de venta el inventario vale <B>{money(k.valorVenta)}</B>, con una utilidad potencial de <B>{money(k.utilidadPotencial)}</B> ({fmtPct(k.margenPotencial)} de margen).</>);
  if (d.series.porCategoria.length > 0) {
    const tot = d.series.porCategoria.reduce((a, c) => a + c.valorCosto, 0);
    const top = d.series.porCategoria[0];
    out.push(<>La categoría con mayor valor es <B>{top.categoria}</B>, con el <B>{fmtPct(tot > 0 ? (top.valorCosto / tot) * 100 : 0)}</B> del valor del inventario.</>);
  }
  out.push(<>Estado del stock: <B>{fmtInt(k.agotados)}</B> agotados, <B>{fmtInt(k.stockBajo)}</B> en nivel bajo y <B>{fmtInt(k.sobreStock)}</B> en sobre-inventario.</>);
  if (d.tops.productoMayorValor !== "—") out.push(<>El producto que concentra más valor es <B>{d.tops.productoMayorValor}</B>.</>);
  if (d.alertsData.valorInmovilizado > 0) out.push(<>Hay <B>{money(d.alertsData.valorInmovilizado)}</B> inmovilizados en productos con sobre-inventario.</>);
  return out;
}

function buildAlerts(d: InventoryData): AlertItem[] {
  const a = d.alertsData;
  const out: AlertItem[] = [];
  if (a.agotadosCount > 0) out.push({ tone: "red", text: <><B>{fmtInt(a.agotadosCount)}</B> producto(s) agotados (existencia en cero){a.agotadosEjemplos.length > 0 && <>: {a.agotadosEjemplos.join(", ")}</>}.</> });
  if (a.bajoCount > 0) out.push({ tone: "amber", text: <><B>{fmtInt(a.bajoCount)}</B> producto(s) en stock bajo (≤ mínimo){a.bajoEjemplos.length > 0 && <>: {a.bajoEjemplos.join(", ")}</>}. Programar reabasto.</> });
  if (a.excesoCount > 0) out.push({ tone: "amber", text: <><B>{fmtInt(a.excesoCount)}</B> producto(s) en sobre-inventario ({money(a.valorInmovilizado)} inmovilizados){a.excesoEjemplos.length > 0 && <>: {a.excesoEjemplos.join(", ")}</>}.</> });
  if (a.inactivosCount > 0) out.push({ tone: "amber", text: <><B>{fmtInt(a.inactivosCount)}</B> producto(s) inactivos con existencia{a.inactivosEjemplos.length > 0 && <>: {a.inactivosEjemplos.join(", ")}</>}. Revisar depuración o reactivación.</> });
  if (out.length === 0) out.push({ tone: "green", text: <>Inventario dentro de parámetros normales: sin agotados, sin stock crítico ni excesos relevantes.</> });
  return out;
}

function buildConclusions(d: InventoryData): React.ReactNode[] {
  const k = d.kpis;
  const parts: React.ReactNode[] = [];
  parts.push(<>El inventario se valoriza en {money(k.valorCosto)} a costo ({money(k.valorVenta)} a precio de venta), representando una utilidad potencial de {money(k.utilidadPotencial)} al {fmtPct(k.margenPotencial)} de margen.</>);
  if (k.agotados + k.stockBajo > 0) parts.push(<>Requieren atención inmediata {fmtInt(k.agotados + k.stockBajo)} productos entre agotados y stock bajo, para evitar quiebres de venta.</>);
  if (d.series.porCategoria.length > 1) {
    const tot = d.series.porCategoria.reduce((a, c) => a + c.valorCosto, 0);
    const top = d.series.porCategoria[0];
    parts.push(<>El valor está concentrado en {top.categoria} ({fmtPct(tot > 0 ? (top.valorCosto / tot) * 100 : 0)} del total); conviene equilibrar la inversión en inventario y liberar capital de los excesos señalados.</>);
  }
  return parts;
}

// ============================================================================
const ExistenciasReport: React.FC<{ branchId: string; branchLabel: string }> = ({ branchId, branchLabel }) => {
  const { user } = useAuth();
  const [fBranch, setFBranch] = useState<string>(branchId);
  const [fCategory, setFCategory] = useState("");
  const [fSearch, setFSearch] = useState("");
  const [options, setOptions] = useState<FilterOptions | null>(null);
  const [configOpen, setConfigOpen] = useState(true);

  const [data, setData] = useState<InventoryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ folio: string; generatedAt: Date } | null>(null);

  useEffect(() => {
    api.get<FilterOptions>("/api/admin/reports/filter-options").then((r) => setOptions(r.data)).catch(() => {});
  }, []);
  useEffect(() => { setFBranch(branchId); }, [branchId]);

  const generate = async () => {
    setLoading(true); setError(null);
    try {
      const res = await api.get<InventoryData>("/api/admin/reports/inventory-report", {
        params: {
          ...(fBranch !== "all" ? { branchId: fBranch } : {}),
          ...(fCategory ? { categoryId: fCategory } : {}),
          ...(fSearch ? { search: fSearch } : {}),
        },
      });
      setData(res.data);
      setMeta({ folio: buildFolio("RPT-EXIS"), generatedAt: new Date() });
      setConfigOpen(false);
    } catch (e: any) {
      setError(e?.response?.data?.message || "No se pudo generar el reporte.");
    } finally { setLoading(false); }
  };

  const branchOptions = options?.branches ?? [];
  const branchDisplay = fBranch === "all" ? "Todas las sucursales" : branchOptions.find((b) => String(b.id) === String(fBranch))?.name || branchLabel;
  const cutLabel = meta ? `Corte: ${fmtDate(meta.generatedAt)}` : "";
  const userName = user?.name ?? "—";

  const filtersLabel = useMemo(() => {
    const parts: string[] = [branchDisplay];
    if (fCategory && options) parts.push(`Categoría: ${options.categories.find((c) => String(c.id) === fCategory)?.name ?? fCategory}`);
    if (fSearch) parts.push(`Búsqueda: ${fSearch}`);
    return parts.join(" · ");
  }, [branchDisplay, fCategory, fSearch, options]);

  const insights = useMemo(() => (data ? buildInsights(data) : []), [data]);
  const alerts = useMemo(() => (data ? buildAlerts(data) : []), [data]);
  const conclusions = useMemo(() => (data ? buildConclusions(data) : []), [data]);

  const onExcel = () => {
    if (!data || !meta) return;
    const sheets: ExportSheet[] = [
      {
        name: "Indicadores", title: `Existencias · ${cutLabel}`,
        columns: [{ header: "Indicador", key: "k", width: 28 }, { header: "Valor", key: "v", width: 22 }],
        rows: [
          { k: "Productos", v: data.kpis.productos },
          { k: "Unidades en stock", v: data.kpis.unidades },
          { k: "Valor a costo", v: Number(data.kpis.valorCosto.toFixed(2)) },
          { k: "Valor a precio venta", v: Number(data.kpis.valorVenta.toFixed(2)) },
          { k: "Utilidad potencial", v: Number(data.kpis.utilidadPotencial.toFixed(2)) },
          { k: "Margen potencial %", v: Number(data.kpis.margenPotencial.toFixed(2)) },
          { k: "Agotados", v: data.kpis.agotados },
          { k: "Stock bajo", v: data.kpis.stockBajo },
          { k: "Sobre-inventario", v: data.kpis.sobreStock },
          { k: "Inactivos con stock", v: data.kpis.inactivosConStock },
        ],
      },
      {
        name: "Por categoría",
        columns: [
          { header: "Categoría", key: "categoria", width: 26 },
          { header: "Unidades", key: "unidades", type: "int" },
          { header: "Valor costo", key: "valorCosto", type: "money" },
          { header: "Valor venta", key: "valorVenta", type: "money" },
        ],
        rows: data.series.porCategoria,
      },
      {
        name: "Existencias",
        columns: [
          { header: "#", key: "rank", type: "int", width: 6 },
          { header: "Producto", key: "name", width: 34 },
          { header: "SKU", key: "sku", width: 16 },
          { header: "Categoría", key: "category", width: 20 },
          { header: "Stock", key: "stock", type: "int" },
          { header: "Mínimo", key: "minStock", type: "int" },
          { header: "Costo", key: "costPrice", type: "money" },
          { header: "Precio", key: "sellPrice", type: "money" },
          { header: "Valor costo", key: "valorCosto", type: "money" },
          { header: "Valor venta", key: "valorVenta", type: "money" },
          { header: "Estado", key: "estado", width: 14 },
        ],
        rows: data.products,
        totals: {
          stock: data.products.reduce((a, r) => a + r.stock, 0),
          valorCosto: data.products.reduce((a, r) => a + r.valorCosto, 0),
          valorVenta: data.products.reduce((a, r) => a + r.valorVenta, 0),
        },
      },
    ];
    exportExcel(`Existencias_${meta.generatedAt.toISOString().slice(0, 10)}`, sheets, {
      Reporte: "Existencias (inventario valorizado)",
      Versión: REPORT_VERSION, Folio: meta.folio, Empresa: COMPANY.legalName,
      Sucursal: branchDisplay, Corte: cutLabel, "Generado por": userName,
      "Fecha de generación": meta.generatedAt.toLocaleString("es-MX"), Filtros: filtersLabel,
    });
  };

  const onCsv = () => {
    if (!data) return;
    exportCsv(`Existencias_${new Date().toISOString().slice(0, 10)}`, [
      { header: "#", key: "rank" }, { header: "Producto", key: "name" }, { header: "SKU", key: "sku" },
      { header: "Categoría", key: "category" }, { header: "Stock", key: "stock" }, { header: "Mínimo", key: "minStock" },
      { header: "Costo", key: "costPrice" }, { header: "Precio", key: "sellPrice" }, { header: "Valor costo", key: "valorCosto" },
      { header: "Valor venta", key: "valorVenta" }, { header: "Estado", key: "estado" },
    ], data.products);
  };

  const configPanel = (
    <ReportConfigPanel
      open={configOpen} onToggle={() => setConfigOpen(!configOpen)} canCollapse={!!data}
      onGenerate={generate} onClear={() => { setFCategory(""); setFSearch(""); }} loading={loading} generated={!!data}
    >
      <ReportField label="Sucursal">
        <select value={fBranch} onChange={(e) => setFBranch(e.target.value)}>
          <option value="all">Todas las sucursales</option>
          {branchOptions.map((b) => <option key={b.id} value={String(b.id)}>{b.name}</option>)}
        </select>
      </ReportField>
      <ReportField label="Categoría"><ReportSelect value={fCategory} onChange={setFCategory} options={(options?.categories ?? []).map((c) => ({ value: String(c.id), label: c.name }))} allLabel="Todas" /></ReportField>
      <ReportField label="Buscar producto"><input type="text" maxLength={80} value={fSearch} onChange={(e) => setFSearch(e.target.value)} placeholder="Nombre o SKU" /></ReportField>
    </ReportConfigPanel>
  );

  let doc: ReportDocBundle | undefined;
  if (data && meta) {
    const k = data.kpis;
    const catTotal = data.series.porCategoria.reduce((a, c) => a + c.valorCosto, 0) || 1;

    const rankValor = (rows: { rank: number; nombre: string; importe: number; stock: number }[], label: (r: any) => string): RankingRow[] => {
      const max = rows[0]?.importe || 1;
      return rows.map((r) => ({ rank: r.rank, nombre: r.nombre, valor: money(r.importe), meta: label(r), share: (r.importe / max) * 100 }));
    };
    const rankCriticos = (rows: typeof data.rankings.criticos): RankingRow[] =>
      rows.map((r) => ({ rank: r.rank, nombre: r.nombre, valor: `${fmtInt(r.stock)} uds`, meta: `mín ${fmtInt(r.minStock)}`, share: r.minStock > 0 ? Math.min(100, (r.stock / r.minStock) * 100) : 0 }));

    const detTotals = {
      stock: data.products.reduce((a, r) => a + r.stock, 0),
      valorCosto: data.products.reduce((a, r) => a + r.valorCosto, 0),
    };

    const detColumns = [
      { key: "rank", header: "#", align: "center" as const, render: (r: InvRow) => String(r.rank) },
      { key: "name", header: "Producto", render: (r: InvRow) => <span style={{ fontWeight: 700 }}>{r.name}</span> },
      { key: "sku", header: "SKU", render: (r: InvRow) => r.sku },
      { key: "category", header: "Categoría", render: (r: InvRow) => r.category },
      { key: "stock", header: "Stock", align: "center" as const, render: (r: InvRow) => fmtInt(r.stock) },
      { key: "minStock", header: "Mín.", align: "center" as const, render: (r: InvRow) => fmtInt(r.minStock) },
      { key: "costPrice", header: "Costo", align: "right" as const, render: (r: InvRow) => money(r.costPrice) },
      { key: "sellPrice", header: "Precio", align: "right" as const, render: (r: InvRow) => money(r.sellPrice) },
      { key: "valorCosto", header: "Valor costo", align: "right" as const, render: (r: InvRow) => <span style={{ fontWeight: 700 }}>{money(r.valorCosto)}</span> },
      { key: "estado", header: "Estado", align: "center" as const, render: (r: InvRow) => <span style={{ color: estadoColor(r.estado), fontWeight: 800 }}>{r.estado}</span> },
    ];

    const chunks: InvRow[][] = [];
    for (let i = 0; i < data.products.length; i += ROWS_PER_PAGE) chunks.push(data.products.slice(i, i + ROWS_PER_PAGE));
    const detailPages: ReportPageDef[] = chunks.map((chunk, ci) => {
      const startRow = ci * ROWS_PER_PAGE + 1, endRow = ci * ROWS_PER_PAGE + chunk.length, isLast = ci === chunks.length - 1;
      return {
        id: `det-${ci}`, toc: ci === 0 ? "Detalle de existencias" : undefined,
        render: (page, dm) => (
          <ReportPage meta={dm} page={page}>
            <SectionTitle icon={ListOrdered} title="Anexo — Detalle de existencias" sub={`Productos ${fmtInt(startRow)}–${fmtInt(endRow)} de ${fmtInt(data.productsMeta.shown)}${data.productsMeta.truncated ? ` (de ${fmtInt(data.productsMeta.total)})` : ""} · ordenados por valor`} />
            <ReportTable rows={chunk} keyOf={(r: InvRow) => r.productId} columns={detColumns}
              total={isLast ? { sku: `${fmtInt(data.productsMeta.shown)} productos`, stock: fmtInt(detTotals.stock), valorCosto: money(detTotals.valorCosto) } : undefined}
              totalLabel="TOTALES" totalSpan={1} />
          </ReportPage>
        ),
      };
    });
    if (detailPages.length === 0) detailPages.push({
      id: "det-empty", toc: "Detalle de existencias",
      render: (page, dm) => (<ReportPage meta={dm} page={page}><SectionTitle icon={ListOrdered} title="Anexo — Detalle de existencias" /><div className="erp-alert-empty">Sin existencias con los filtros seleccionados.</div></ReportPage>),
    });

    const pages: ReportPageDef[] = [
      {
        id: "portada", toc: "Portada",
        render: (page, dm) => (
          <ReportPage meta={dm} page={page} cover>
            <div className="erp-cover-top"><ReportLogo size={58} /><div><div className="erp-cover-brandname">{COMPANY.name}</div><div className="erp-cover-brandtag">{COMPANY.tagline}</div></div></div>
            <div className="erp-cover-band">
              <div className="erp-cover-kicker">Reporte de Inventario</div>
              <div className="erp-cover-title">Existencias<br />Valorizadas</div>
              <div className="erp-cover-desc">Corte del inventario actual valorizado a costo y a precio de venta: utilidad potencial, estado del stock, concentración por categoría y sucursal, alertas de reabasto y el detalle completo de existencias.</div>
            </div>
            <div className="erp-cover-meta">
              {[["Empresa", COMPANY.legalName], ["Reporte", `Existencias · Versión ${REPORT_VERSION}`], ["Corte", cutLabel], ["Sucursal", branchDisplay], ["Generado por", userName], ["Folio", meta.folio], ["Fecha de generación", meta.generatedAt.toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" })], ["Hora", meta.generatedAt.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })]].map(([l, v]) => (
                <div className="erp-cover-meta-item" key={l}><div className="erp-cover-meta-label">{l}</div><div className="erp-cover-meta-value">{v}</div></div>
              ))}
            </div>
          </ReportPage>
        ),
      },
      {
        id: "kpi-val", toc: "Indicadores",
        render: (page, dm) => (
          <ReportPage meta={dm} page={page}>
            <SectionTitle icon={BarChart3} title="Valoración del inventario" sub={cutLabel} />
            <div className="erp-kpi-grid big">{KPI_VAL.map((def) => <KpiCard key={def.key} icon={def.icon} label={def.label} display={fmtKpi(def.fmt, k[def.key])} />)}</div>
          </ReportPage>
        ),
      },
      {
        id: "kpi-est",
        render: (page, dm) => (
          <ReportPage meta={dm} page={page}>
            <SectionTitle icon={AlertTriangle} title="Estado del stock" sub={cutLabel} />
            <div className="erp-kpi-grid big">{KPI_EST.map((def) => <KpiCard key={def.key} icon={def.icon} label={def.label} display={fmtKpi(def.fmt, k[def.key])} />)}</div>
            <SectionTitle icon={Award} title="Destacados" />
            <div className="erp-tops" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
              {[["Producto de mayor valor", data.tops.productoMayorValor], ["Categoría de mayor valor", data.tops.categoriaMayorValor], ["Producto de mayor stock", data.tops.productoMayorStock]].map(([l, v]) => (
                <div className="erp-top" key={l}><div className="erp-top-label">{l}</div><div className="erp-top-value">{v}</div></div>
              ))}
            </div>
          </ReportPage>
        ),
      },
      {
        id: "categorias", toc: "Valorización",
        render: (page, dm) => (
          <ReportPage meta={dm} page={page}>
            <SectionTitle icon={Layers} title="Valorización por categoría" sub="Participación sobre el valor a costo del inventario" />
            <ReportTable rows={data.series.porCategoria} keyOf={(c: any) => c.categoria}
              columns={[
                { key: "categoria", header: "Categoría", render: (c: any) => <span style={{ fontWeight: 700 }}>{c.categoria}</span> },
                { key: "unidades", header: "Unidades", align: "right", render: (c: any) => fmtInt(c.unidades) },
                { key: "valorCosto", header: "Valor costo", align: "right", render: (c: any) => money(c.valorCosto) },
                { key: "valorVenta", header: "Valor venta", align: "right", render: (c: any) => money(c.valorVenta) },
                { key: "part", header: "% del valor", align: "right", render: (c: any) => <span style={{ fontWeight: 800 }}>{fmtPct((c.valorCosto / catTotal) * 100)}</span> },
              ]}
              total={{ unidades: fmtInt(data.series.porCategoria.reduce((a, c) => a + c.unidades, 0)), valorCosto: money(data.series.porCategoria.reduce((a, c) => a + c.valorCosto, 0)), valorVenta: money(data.series.porCategoria.reduce((a, c) => a + c.valorVenta, 0)), part: "100.0%" }}
              totalLabel="TOTAL" totalSpan={1} />
            {data.series.porSucursal.length > 1 && (
              <>
                <SectionTitle icon={Store} title="Valor por sucursal" />
                <ReportTable rows={data.series.porSucursal} keyOf={(s: any) => s.sucursal}
                  columns={[
                    { key: "sucursal", header: "Sucursal", render: (s: any) => <span style={{ fontWeight: 700 }}>{s.sucursal}</span> },
                    { key: "unidades", header: "Unidades", align: "right", render: (s: any) => fmtInt(s.unidades) },
                    { key: "valorCosto", header: "Valor a costo", align: "right", render: (s: any) => money(s.valorCosto) },
                  ]} />
              </>
            )}
          </ReportPage>
        ),
      },
      {
        id: "estructura", toc: "Estructura",
        render: (page, dm) => (
          <ReportPage meta={dm} page={page}>
            <SectionTitle icon={BarChart3} title="Estructura del inventario" />
            <div className="erp-charts-grid">
              <DonutCard question="¿Dónde está el valor del inventario?" sub="Valor a costo por categoría · menores en «Otros»" data={data.series.porCategoria.map((c, i) => ({ name: c.categoria, value: c.valorCosto, color: CAT[i % CAT.length] }))} format={(v) => money(v)} centerTitle="Costo" />
              <DonutCard question="¿Cómo se distribuye el estado del stock?" sub="Número de productos por estado" data={data.series.estadoInventario.map((e) => ({ name: e.estado, value: e.count, color: estadoColor(e.estado) }))} format={(v) => fmtInt(v)} centerTitle="Productos" />
              <ChartCard question="¿Qué productos concentran más valor?" sub="Top 8 por valor a costo"><HBars data={data.series.topValor.slice(0, 8)} categoryKey="nombre" valueKey="valorCosto" name="Valor" height={165} yWidth={104} yFontSize={7.5} barSize={12} color={CHART.blue} formatValue={money} /></ChartCard>
              {data.series.porSucursal.length > 1
                ? <ChartCard question="¿Cómo se reparte el valor por sucursal?" sub="Valor a costo por sucursal"><HBars data={data.series.porSucursal.slice(0, 8)} categoryKey="sucursal" valueKey="valorCosto" name="Valor" height={165} barSize={14} formatValue={money} /></ChartCard>
                : <ChartCard question="¿Qué categorías mueven más unidades?" sub="Top 8 por unidades en stock"><HBars data={[...data.series.porCategoria].sort((a, b) => b.unidades - a.unidades).slice(0, 8)} categoryKey="categoria" valueKey="unidades" name="Unidades" height={165} barSize={12} color={CHART.navy} formatValue={fmtInt} formatX={fmtInt} /></ChartCard>}
            </div>
          </ReportPage>
        ),
      },
      {
        id: "hallazgos", toc: "Hallazgos y Alertas",
        render: (page, dm) => (
          <ReportPage meta={dm} page={page}>
            <SectionTitle icon={TrendingUp} title="Hallazgos del inventario" sub="Generados automáticamente a partir de los datos" />
            <InsightsPanel items={insights} />
            <SectionTitle icon={AlertTriangle} title="Alertas de inventario" sub="Excepciones que requieren atención" />
            <AlertsPanel items={alerts} />
          </ReportPage>
        ),
      },
      {
        id: "rankings", toc: "Rankings",
        render: (page, dm) => (
          <ReportPage meta={dm} page={page}>
            <SectionTitle icon={Trophy} title="Rankings del inventario" sub="Top 10" />
            <div className="erp-rank-grid">
              <RankingCard icon={DollarSign} title="Mayor valor (a costo)" rows={rankValor(data.rankings.valor, (r) => `${fmtInt(r.stock)} uds`)} />
              <RankingCard icon={Boxes} title="Mayor stock (unidades)" rows={rankValor(data.rankings.unidades, (r) => `${fmtInt(r.stock)} uds`)} />
              <RankingCard icon={Layers} title="Categorías por valor" rows={rankValor(data.rankings.categorias.map((c) => ({ ...c, stock: c.unidades })), (r) => `${fmtInt(r.stock)} uds`)} />
              <RankingCard icon={AlertTriangle} title="Stock crítico" rows={rankCriticos(data.rankings.criticos)} />
            </div>
          </ReportPage>
        ),
      },
      {
        id: "conclusiones", toc: "Conclusiones",
        render: (page, dm) => (
          <ReportPage meta={dm} page={page}>
            <SectionTitle icon={ClipboardCheck} title="Conclusiones" sub="Síntesis automática del corte" />
            <div className="erp-conclusion">{conclusions.map((c, i) => <p key={i}>{c}</p>)}</div>
          </ReportPage>
        ),
      },
      ...detailPages,
    ];

    doc = {
      docMeta: { reportTitle: "Existencias", folio: meta.folio, branch: branchDisplay, period: cutLabel, user: userName, filtersLabel, generatedAt: meta.generatedAt },
      pages, filenameBase: "Existencias", onExcel, onCsv,
    };
  }

  return (
    <ReportShell configPanel={configPanel} ready={!!data && !!meta} loading={loading} error={error} doc={doc}
      emptyText="Configure los filtros y presione «Generar reporte» para obtener la vista previa del documento." />
  );
};

export default ExistenciasReport;
