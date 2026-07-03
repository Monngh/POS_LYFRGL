import React, { useEffect, useMemo, useState } from "react";
import {
  BarChart3, ClipboardCheck, Coins, DollarSign, GitCompareArrows, Landmark,
  LineChart as LineIcon, ListOrdered, Package, PackageCheck, Clock, Ban,
  Truck, Store, TrendingUp, Trophy, Award, AlertTriangle, ShoppingCart, Boxes,
} from "lucide-react";
import api from "../../../shared/services/api";
import { useAuth } from "../../../auth";
import { money, fmtDate } from "../shared";
import {
  COMPANY, ReportLogo, buildFolio, REPORT_VERSION,
  ReportPage, SectionTitle, KpiCard, Semaforo, InsightsPanel, AlertsPanel,
  ChartCard, DonutCard, RankingCard, ReportField, ReportSelect,
  ReportTable, ReportShell, ReportConfigPanel,
  TrendArea, HBars, CHART,
  fmtInt, fmtPct,
  exportExcel, exportCsv,
  type AlertItem, type RankingRow, type ReportPageDef, type ReportDocBundle, type ExportSheet,
} from "./framework";

// ============================================================================
// REPORTE DE COMPRAS (órdenes a proveedores) — hereda la plantilla maestra.
// Periodo con comparativo. Resume el gasto en compras, desglosa por proveedor /
// estado / sucursal, rankea proveedores y productos, y lista el detalle de órdenes.
// ============================================================================
interface Vary { value: number; prev: number; delta: number; pct: number; }
interface PoRow { id: number; folio: string; fecha: string; proveedor: string; sucursal: string; articulos: number; subtotal: number; iva: number; total: number; estado: string; estadoRaw: string; registro: string; }

interface PurchaseData {
  period: { from: string; to: string; prevFrom: string; prevTo: string; days: number };
  kpis: Record<string, Vary>;
  tops: { proveedorPrincipal: string; sucursalPrincipal: string; productoMasComprado: string };
  series: {
    porDia: { fecha: string; total: number }[];
    porProveedor: { proveedor: string; total: number; ordenes: number }[];
    porEstado: { estado: string; count: number; total: number }[];
    porSucursal: { sucursal: string; total: number; ordenes: number }[];
  };
  rankings: {
    proveedores: { rank: number; nombre: string; ordenes: number; importe: number }[];
    productos: { rank: number; nombre: string; sku: string; cantidad: number; importe: number }[];
    sucursales: { rank: number; nombre: string; ordenes: number; importe: number }[];
  };
  purchases: PoRow[];
  purchasesMeta: { total: number; shown: number; truncated: boolean };
  alertsData: { pendientesCount: number; pendientesMonto: number; antiguasCount: number; antiguasEjemplos: string[]; canceladasCount: number; canceladasMonto: number };
}

interface FilterOptions { branches: { id: number; name: string }[]; }

const isoToday = () => new Date().toISOString().slice(0, 10);
const isoAgo = (d: number) => new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);
const ROWS_PER_PAGE = 22;

const ESTADO_COLOR: Record<string, string> = { Recibida: "#15803d", Pendiente: "#b45309", Cancelada: "#b91c1c", Parcial: "#2563eb" };
const estadoColor = (e: string) => ESTADO_COLOR[e] ?? "#64748b";

type KpiFmt = "money" | "int";
const fmtKpi = (fmt: KpiFmt, v: number) => (fmt === "money" ? money(v) : fmtInt(v));
const deltaText = (fmt: KpiFmt, d: number) => `${d >= 0 ? "+" : ""}${fmt === "money" ? money(d) : fmtInt(d)}`;

type KpiDef = { key: string; label: string; icon: any; fmt: KpiFmt; better: boolean };
const KPI_FIN: KpiDef[] = [
  { key: "totalComprado", label: "Total Comprado", icon: DollarSign, fmt: "money", better: true },
  { key: "subtotal", label: "Subtotal", icon: Coins, fmt: "money", better: true },
  { key: "iva", label: "IVA", icon: Landmark, fmt: "money", better: true },
  { key: "promedioPorOrden", label: "Promedio por Orden", icon: BarChart3, fmt: "money", better: true },
  { key: "ordenes", label: "Órdenes", icon: ShoppingCart, fmt: "int", better: true },
  { key: "unidadesCompradas", label: "Unidades Compradas", icon: Boxes, fmt: "int", better: true },
];
const KPI_EST: KpiDef[] = [
  { key: "recibidas", label: "Recibidas", icon: PackageCheck, fmt: "int", better: true },
  { key: "pendientes", label: "Pendientes", icon: Clock, fmt: "int", better: false },
  { key: "canceladas", label: "Canceladas", icon: Ban, fmt: "int", better: false },
  { key: "proveedores", label: "Proveedores", icon: Truck, fmt: "int", better: true },
];
const RESUMEN_ROWS: { key: string; label: string; fmt: KpiFmt; better: boolean }[] = [
  { key: "totalComprado", label: "Total Comprado", fmt: "money", better: true },
  { key: "subtotal", label: "Subtotal", fmt: "money", better: true },
  { key: "iva", label: "IVA", fmt: "money", better: true },
  { key: "ordenes", label: "Órdenes", fmt: "int", better: true },
  { key: "promedioPorOrden", label: "Promedio por Orden", fmt: "money", better: true },
  { key: "unidadesCompradas", label: "Unidades Compradas", fmt: "int", better: true },
  { key: "proveedores", label: "Proveedores", fmt: "int", better: true },
  { key: "recibidas", label: "Recibidas", fmt: "int", better: true },
  { key: "pendientes", label: "Pendientes", fmt: "int", better: false },
  { key: "canceladas", label: "Canceladas", fmt: "int", better: false },
];

const B: React.FC<{ children: React.ReactNode }> = ({ children }) => <b>{children}</b>;

function buildInsights(d: PurchaseData): React.ReactNode[] {
  const k = d.kpis;
  const out: React.ReactNode[] = [];
  const dir = (p: number, up: string, down: string) => (p >= 0 ? up : down);
  out.push(<>El gasto en compras {dir(k.totalComprado.pct, "creció", "disminuyó")} <B>{fmtPct(Math.abs(k.totalComprado.pct))}</B> respecto al periodo anterior ({money(k.totalComprado.value)} vs. {money(k.totalComprado.prev)}).</>);
  out.push(<>Se generaron <B>{fmtInt(k.ordenes.value)}</B> órdenes a <B>{fmtInt(k.proveedores.value)}</B> proveedores, con un promedio de <B>{money(k.promedioPorOrden.value)}</B> por orden.</>);
  out.push(<>Estado de las órdenes: <B>{fmtInt(k.recibidas.value)}</B> recibidas, <B>{fmtInt(k.pendientes.value)}</B> pendientes y <B>{fmtInt(k.canceladas.value)}</B> canceladas.</>);
  if (d.series.porProveedor.length > 0) {
    const tot = d.series.porProveedor.reduce((a, p) => a + p.total, 0);
    const top = d.series.porProveedor[0];
    out.push(<>El proveedor principal fue <B>{top.proveedor}</B>, con el <B>{fmtPct(tot > 0 ? (top.total / tot) * 100 : 0)}</B> del gasto en compras.</>);
  }
  if (d.tops.productoMasComprado !== "—") out.push(<>El producto más comprado (por importe) fue <B>{d.tops.productoMasComprado}</B>.</>);
  out.push(<>Se compraron <B>{fmtInt(k.unidadesCompradas.value)}</B> unidades en total durante el periodo.</>);
  return out;
}

function buildAlerts(d: PurchaseData): AlertItem[] {
  const k = d.kpis;
  const a = d.alertsData;
  const out: AlertItem[] = [];
  if (a.antiguasCount > 0) out.push({ tone: "red", text: <><B>{fmtInt(a.antiguasCount)}</B> orden(es) pendientes con más de 15 días{a.antiguasEjemplos.length > 0 && <>: {a.antiguasEjemplos.join(", ")}</>}. Dar seguimiento a la recepción.</> });
  if (a.pendientesCount > 0) out.push({ tone: "amber", text: <><B>{fmtInt(a.pendientesCount)}</B> orden(es) pendientes por <B>{money(a.pendientesMonto)}</B> aún sin recibir.</> });
  if (a.canceladasCount > 0) out.push({ tone: "amber", text: <><B>{fmtInt(a.canceladasCount)}</B> orden(es) canceladas ({money(a.canceladasMonto)}). Revisar causas con proveedores.</> });
  if (k.totalComprado.pct > 25) out.push({ tone: "amber", text: <>Incremento del gasto en compras: <B>+{fmtPct(k.totalComprado.pct)}</B> vs. periodo anterior. Verificar contra la demanda de ventas.</> });
  if (out.length === 0) out.push({ tone: "green", text: <>Sin excepciones relevantes: las compras del periodo se encuentran dentro de parámetros normales.</> });
  return out;
}

function buildConclusions(d: PurchaseData): React.ReactNode[] {
  const k = d.kpis;
  const parts: React.ReactNode[] = [];
  parts.push(<>El gasto en compras del periodo fue de {money(k.totalComprado.value)} en {fmtInt(k.ordenes.value)} órdenes ({k.totalComprado.pct >= 0 ? "+" : ""}{fmtPct(k.totalComprado.pct)} vs. periodo anterior), con {fmtInt(k.recibidas.value)} recibidas y {fmtInt(k.pendientes.value)} pendientes.</>);
  if (d.series.porProveedor.length > 1) {
    const tot = d.series.porProveedor.reduce((a, p) => a + p.total, 0);
    const top = d.series.porProveedor[0];
    parts.push(<>El abasto se concentra en {top.proveedor} ({fmtPct(tot > 0 ? (top.total / tot) * 100 : 0)} del gasto); conviene diversificar proveedores clave y negociar condiciones por volumen.</>);
  }
  if (d.alertsData.pendientesCount > 0) parts.push(<>Quedan {fmtInt(d.alertsData.pendientesCount)} órdenes pendientes por {money(d.alertsData.pendientesMonto)}; su recepción oportuna evita quiebres de inventario.</>);
  return parts;
}

// ============================================================================
const ComprasReport: React.FC<{ branchId: string; branchLabel: string }> = ({ branchId, branchLabel }) => {
  const { user } = useAuth();
  const [from, setFrom] = useState(isoAgo(29));
  const [to, setTo] = useState(isoToday());
  const [fBranch, setFBranch] = useState<string>(branchId);
  const [fStatus, setFStatus] = useState("");
  const [fSearch, setFSearch] = useState("");
  const [options, setOptions] = useState<FilterOptions | null>(null);
  const [configOpen, setConfigOpen] = useState(true);

  const [data, setData] = useState<PurchaseData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ folio: string; generatedAt: Date } | null>(null);

  useEffect(() => { api.get<FilterOptions>("/api/admin/reports/filter-options").then((r) => setOptions(r.data)).catch(() => {}); }, []);
  useEffect(() => { setFBranch(branchId); }, [branchId]);

  const generate = async () => {
    setLoading(true); setError(null);
    try {
      const res = await api.get<PurchaseData>("/api/admin/reports/purchase-report", {
        params: { from, to, ...(fBranch !== "all" ? { branchId: fBranch } : {}), ...(fStatus ? { status: fStatus } : {}), ...(fSearch ? { search: fSearch } : {}) },
      });
      setData(res.data);
      setMeta({ folio: buildFolio("RPT-CMP"), generatedAt: new Date() });
      setConfigOpen(false);
    } catch (e: any) { setError(e?.response?.data?.message || "No se pudo generar el reporte."); } finally { setLoading(false); }
  };

  const branchOptions = options?.branches ?? [];
  const branchDisplay = fBranch === "all" ? "Todas las sucursales" : branchOptions.find((b) => String(b.id) === String(fBranch))?.name || branchLabel;
  const periodLabel = `${fmtDate(from)} – ${fmtDate(to)}`;
  const userName = user?.name ?? "—";

  const filtersLabel = useMemo(() => {
    const parts: string[] = [periodLabel, branchDisplay];
    if (fStatus) parts.push(`Estado: ${fStatus}`);
    if (fSearch) parts.push(`Búsqueda: ${fSearch}`);
    return parts.join(" · ");
  }, [periodLabel, branchDisplay, fStatus, fSearch]);

  const insights = useMemo(() => (data ? buildInsights(data) : []), [data]);
  const alerts = useMemo(() => (data ? buildAlerts(data) : []), [data]);
  const conclusions = useMemo(() => (data ? buildConclusions(data) : []), [data]);

  const onExcel = () => {
    if (!data || !meta) return;
    const sheets: ExportSheet[] = [
      {
        name: "Indicadores", title: `Compras · ${periodLabel}`,
        columns: [{ header: "Concepto", key: "concepto", width: 26 }, { header: "Periodo actual", key: "actual", type: "number" }, { header: "Periodo anterior", key: "anterior", type: "number" }, { header: "Variación %", key: "pct", type: "number" }],
        rows: RESUMEN_ROWS.map((r) => ({ concepto: r.label, actual: r.fmt === "int" ? Math.round(data.kpis[r.key].value) : Number(data.kpis[r.key].value.toFixed(2)), anterior: r.fmt === "int" ? Math.round(data.kpis[r.key].prev) : Number(data.kpis[r.key].prev.toFixed(2)), pct: Number(data.kpis[r.key].pct.toFixed(2)) })),
      },
      {
        name: "Órdenes",
        columns: [
          { header: "Folio", key: "folio", width: 16 }, { header: "Fecha", key: "fecha", width: 14 }, { header: "Proveedor", key: "proveedor", width: 26 },
          { header: "Sucursal", key: "sucursal", width: 18 }, { header: "Artículos", key: "articulos", type: "int" }, { header: "Subtotal", key: "subtotal", type: "money" },
          { header: "IVA", key: "iva", type: "money" }, { header: "Total", key: "total", type: "money" }, { header: "Estado", key: "estado", width: 14 }, { header: "Registró", key: "registro", width: 18 },
        ],
        rows: data.purchases.map((p) => ({ ...p, fecha: fmtDate(p.fecha) })),
        totals: { subtotal: data.purchases.reduce((a, p) => a + p.subtotal, 0), iva: data.purchases.reduce((a, p) => a + p.iva, 0), total: data.purchases.reduce((a, p) => a + p.total, 0) },
      },
      { name: "Proveedores", columns: [{ header: "Proveedor", key: "proveedor", width: 28 }, { header: "Órdenes", key: "ordenes", type: "int" }, { header: "Importe", key: "total", type: "money" }], rows: data.series.porProveedor },
      { name: "Por estado", columns: [{ header: "Estado", key: "estado", width: 16 }, { header: "Órdenes", key: "count", type: "int" }, { header: "Importe", key: "total", type: "money" }], rows: data.series.porEstado },
    ];
    exportExcel(`Compras_${from}_${to}`, sheets, {
      Reporte: "Compras (órdenes a proveedores)", Versión: REPORT_VERSION, Folio: meta.folio, Empresa: COMPANY.legalName,
      Sucursal: branchDisplay, Periodo: periodLabel, "Generado por": userName, "Fecha de generación": meta.generatedAt.toLocaleString("es-MX"), Filtros: filtersLabel,
    });
  };

  const onCsv = () => {
    if (!data) return;
    exportCsv(`Compras_${from}_${to}`, [
      { header: "Folio", key: "folio" }, { header: "Fecha", key: "fecha" }, { header: "Proveedor", key: "proveedor" }, { header: "Sucursal", key: "sucursal" },
      { header: "Artículos", key: "articulos" }, { header: "Subtotal", key: "subtotal" }, { header: "IVA", key: "iva" }, { header: "Total", key: "total" }, { header: "Estado", key: "estado" }, { header: "Registró", key: "registro" },
    ], data.purchases.map((p) => ({ ...p, fecha: fmtDate(p.fecha) })));
  };

  const configPanel = (
    <ReportConfigPanel open={configOpen} onToggle={() => setConfigOpen(!configOpen)} canCollapse={!!data} onGenerate={generate}
      onClear={() => { setFStatus(""); setFSearch(""); }} loading={loading} generated={!!data}>
      <ReportField label="Fecha inicial"><input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></ReportField>
      <ReportField label="Fecha final"><input type="date" value={to} min={from} max={isoToday()} onChange={(e) => setTo(e.target.value)} /></ReportField>
      <ReportField label="Sucursal">
        <select value={fBranch} onChange={(e) => setFBranch(e.target.value)}>
          <option value="all">Todas las sucursales</option>
          {branchOptions.map((b) => <option key={b.id} value={String(b.id)}>{b.name}</option>)}
        </select>
      </ReportField>
      <ReportField label="Estado"><ReportSelect value={fStatus} onChange={setFStatus} options={[{ value: "PENDIENTE", label: "Pendientes" }, { value: "RECIBIDA", label: "Recibidas" }, { value: "CANCELADA", label: "Canceladas" }]} allLabel="Todos" /></ReportField>
      <ReportField label="Buscar (folio / proveedor)"><input type="text" maxLength={80} value={fSearch} onChange={(e) => setFSearch(e.target.value)} placeholder="Folio o proveedor" /></ReportField>
    </ReportConfigPanel>
  );

  let doc: ReportDocBundle | undefined;
  if (data && meta) {
    const k = data.kpis;
    const resumenRows = RESUMEN_ROWS.map((r) => ({ ...r, v: k[r.key] }));

    const rankImporte = (rows: { rank: number; nombre: string; importe: number }[], label: (r: any) => string): RankingRow[] => {
      const max = rows[0]?.importe || 1;
      return rows.map((r) => ({ rank: r.rank, nombre: r.nombre, valor: money(r.importe), meta: label(r), share: (r.importe / max) * 100 }));
    };

    const detTotals = { subtotal: data.purchases.reduce((a, p) => a + p.subtotal, 0), iva: data.purchases.reduce((a, p) => a + p.iva, 0), total: data.purchases.reduce((a, p) => a + p.total, 0) };
    const detColumns = [
      { key: "folio", header: "Folio", render: (p: PoRow) => <span style={{ fontWeight: 700 }}>{p.folio}</span> },
      { key: "fecha", header: "Fecha", render: (p: PoRow) => fmtDate(p.fecha) },
      { key: "proveedor", header: "Proveedor", render: (p: PoRow) => p.proveedor },
      { key: "sucursal", header: "Sucursal", render: (p: PoRow) => p.sucursal },
      { key: "articulos", header: "Art.", align: "center" as const, render: (p: PoRow) => fmtInt(p.articulos) },
      { key: "subtotal", header: "Subtotal", align: "right" as const, render: (p: PoRow) => money(p.subtotal) },
      { key: "iva", header: "IVA", align: "right" as const, render: (p: PoRow) => money(p.iva) },
      { key: "total", header: "Total", align: "right" as const, render: (p: PoRow) => <span style={{ fontWeight: 700 }}>{money(p.total)}</span> },
      { key: "estado", header: "Estado", align: "center" as const, render: (p: PoRow) => <span style={{ color: estadoColor(p.estado), fontWeight: 800 }}>{p.estado}</span> },
      { key: "registro", header: "Registró", render: (p: PoRow) => p.registro },
    ];

    const chunks: PoRow[][] = [];
    for (let i = 0; i < data.purchases.length; i += ROWS_PER_PAGE) chunks.push(data.purchases.slice(i, i + ROWS_PER_PAGE));
    const detailPages: ReportPageDef[] = chunks.map((chunk, ci) => {
      const startRow = ci * ROWS_PER_PAGE + 1, endRow = ci * ROWS_PER_PAGE + chunk.length, isLast = ci === chunks.length - 1;
      return {
        id: `po-${ci}`, toc: ci === 0 ? "Detalle de órdenes" : undefined,
        render: (page, dm) => (
          <ReportPage meta={dm} page={page}>
            <SectionTitle icon={ListOrdered} title="Anexo — Detalle de órdenes de compra" sub={`Órdenes ${fmtInt(startRow)}–${fmtInt(endRow)} de ${fmtInt(data.purchasesMeta.shown)}${data.purchasesMeta.truncated ? ` (de ${fmtInt(data.purchasesMeta.total)})` : ""} · más recientes primero`} />
            <ReportTable rows={chunk} keyOf={(p: PoRow) => p.id} columns={detColumns}
              total={isLast ? { proveedor: `${fmtInt(data.purchasesMeta.shown)} órdenes`, subtotal: money(detTotals.subtotal), iva: money(detTotals.iva), total: money(detTotals.total) } : undefined}
              totalLabel="TOTALES" totalSpan={1} />
          </ReportPage>
        ),
      };
    });
    if (detailPages.length === 0) detailPages.push({
      id: "po-empty", toc: "Detalle de órdenes",
      render: (page, dm) => (<ReportPage meta={dm} page={page}><SectionTitle icon={ListOrdered} title="Anexo — Detalle de órdenes de compra" /><div className="erp-alert-empty">Sin órdenes de compra en el periodo con los filtros seleccionados.</div></ReportPage>),
    });

    const pages: ReportPageDef[] = [
      {
        id: "portada", toc: "Portada",
        render: (page, dm) => (
          <ReportPage meta={dm} page={page} cover>
            <div className="erp-cover-top"><ReportLogo size={58} /><div><div className="erp-cover-brandname">{COMPANY.name}</div><div className="erp-cover-brandtag">{COMPANY.tagline}</div></div></div>
            <div className="erp-cover-band">
              <div className="erp-cover-kicker">Reporte de Abasto</div>
              <div className="erp-cover-title">Reporte de<br />Compras</div>
              <div className="erp-cover-desc">Análisis de las compras a proveedores del periodo: gasto total con variación, desglose por proveedor, estado y sucursal, productos más comprados, alertas de órdenes pendientes y el detalle completo de las órdenes.</div>
            </div>
            <div className="erp-cover-meta">
              {[["Empresa", COMPANY.legalName], ["Reporte", `Compras · Versión ${REPORT_VERSION}`], ["Periodo analizado", periodLabel], ["Sucursal", branchDisplay], ["Generado por", userName], ["Folio", meta.folio], ["Fecha de generación", meta.generatedAt.toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" })], ["Hora", meta.generatedAt.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })]].map(([l, v]) => (
                <div className="erp-cover-meta-item" key={l}><div className="erp-cover-meta-label">{l}</div><div className="erp-cover-meta-value">{v}</div></div>
              ))}
            </div>
          </ReportPage>
        ),
      },
      {
        id: "kpi-fin", toc: "Indicadores",
        render: (page, dm) => (
          <ReportPage meta={dm} page={page}>
            <SectionTitle icon={BarChart3} title="Indicadores de compras — Gasto" sub={periodLabel} />
            <div className="erp-kpi-grid big">{KPI_FIN.map((def) => <KpiCard key={def.key} icon={def.icon} label={def.label} display={fmtKpi(def.fmt, k[def.key].value)} variation={k[def.key]} higherIsBetter={def.better} />)}</div>
          </ReportPage>
        ),
      },
      {
        id: "kpi-est",
        render: (page, dm) => (
          <ReportPage meta={dm} page={page}>
            <SectionTitle icon={PackageCheck} title="Indicadores de compras — Estado y proveedores" sub={periodLabel} />
            <div className="erp-kpi-grid big">{KPI_EST.map((def) => <KpiCard key={def.key} icon={def.icon} label={def.label} display={fmtKpi(def.fmt, k[def.key].value)} variation={k[def.key]} higherIsBetter={def.better} />)}</div>
            <SectionTitle icon={Award} title="Destacados del periodo" />
            <div className="erp-tops" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
              {[["Proveedor principal", data.tops.proveedorPrincipal], ["Sucursal con más compras", data.tops.sucursalPrincipal], ["Producto más comprado", data.tops.productoMasComprado]].map(([l, v]) => (
                <div className="erp-top" key={l}><div className="erp-top-label">{l}</div><div className="erp-top-value">{v}</div></div>
              ))}
            </div>
          </ReportPage>
        ),
      },
      {
        id: "comparativo", toc: "Comparativo",
        render: (page, dm) => (
          <ReportPage meta={dm} page={page}>
            <SectionTitle icon={GitCompareArrows} title="Comparativo contra periodo anterior" sub="Periodo vs. periodo anterior equivalente" />
            <ReportTable rows={resumenRows} keyOf={(r: any) => r.key}
              columns={[
                { key: "label", header: "Concepto", render: (r: any) => <span style={{ fontWeight: 700 }}>{r.label}</span> },
                { key: "actual", header: "Periodo actual", align: "right", render: (r: any) => fmtKpi(r.fmt, r.v.value) },
                { key: "anterior", header: "Periodo anterior", align: "right", render: (r: any) => fmtKpi(r.fmt, r.v.prev) },
                { key: "delta", header: "Variación", align: "right", render: (r: any) => deltaText(r.fmt, r.v.delta) },
                { key: "pct", header: "Variación %", align: "right", render: (r: any) => <span style={{ color: (r.better ? r.v.pct >= 0 : r.v.pct <= 0) ? "#15803d" : "#b91c1c", fontWeight: 800 }}>{r.v.pct >= 0 ? "+" : ""}{r.v.pct.toFixed(1)}%</span> },
                { key: "sem", header: "Semáforo", align: "center", render: (r: any) => <Semaforo pct={r.v.pct} higherIsBetter={r.better} /> },
              ]} />
          </ReportPage>
        ),
      },
      {
        id: "estructura", toc: "Estructura",
        render: (page, dm) => (
          <ReportPage meta={dm} page={page}>
            <SectionTitle icon={LineIcon} title="Estructura de las compras" sub="Cada gráfica responde una pregunta del negocio" />
            <ChartCard question="¿Cómo evolucionó el gasto en compras?" sub="Total de compras por día" full><TrendArea data={data.series.porDia} xKey="fecha" yKey="total" name="Compras" height={150} formatValue={money} formatLabel={(l) => fmtDate(String(l))} /></ChartCard>
            <div style={{ height: 11 }} />
            <div className="erp-charts-grid">
              <ChartCard question="¿A qué proveedores se compra más?" sub="Top 8 por importe"><HBars data={data.series.porProveedor.slice(0, 8)} categoryKey="proveedor" valueKey="total" name="Compras" height={158} yWidth={100} yFontSize={7.5} barSize={12} color={CHART.blue} formatValue={money} /></ChartCard>
              <DonutCard question="¿Cómo se reparten las órdenes por estado?" sub="Importe por estado de la orden" data={data.series.porEstado.map((e) => ({ name: e.estado, value: e.total, color: estadoColor(e.estado) }))} format={(v) => money(v)} centerTitle="Total" />
            </div>
          </ReportPage>
        ),
      },
      {
        id: "hallazgos", toc: "Hallazgos y Alertas",
        render: (page, dm) => (
          <ReportPage meta={dm} page={page}>
            <SectionTitle icon={TrendingUp} title="Hallazgos del periodo" sub="Generados automáticamente a partir de los datos" />
            <InsightsPanel items={insights} />
            <SectionTitle icon={AlertTriangle} title="Alertas de compras" sub="Excepciones que requieren atención" />
            <AlertsPanel items={alerts} />
          </ReportPage>
        ),
      },
      {
        id: "rankings", toc: "Rankings",
        render: (page, dm) => (
          <ReportPage meta={dm} page={page}>
            <SectionTitle icon={Trophy} title="Rankings del periodo" sub="Top 10 por importe" />
            <div className="erp-rank-grid">
              <RankingCard icon={Truck} title="Top proveedores" rows={rankImporte(data.rankings.proveedores, (r) => `${fmtInt(r.ordenes)} órdenes`)} />
              <RankingCard icon={Package} title="Productos más comprados" rows={rankImporte(data.rankings.productos, (r) => `${fmtInt(r.cantidad)} uds`)} />
              <RankingCard icon={Store} title="Compras por sucursal" rows={rankImporte(data.rankings.sucursales, (r) => `${fmtInt(r.ordenes)} órdenes`)} />
              <RankingCard icon={ClipboardCheck} title="Órdenes por estado" rows={rankImporte(data.series.porEstado.map((e, i) => ({ rank: i + 1, nombre: e.estado, importe: e.total, count: e.count })), (r) => `${fmtInt(r.count)} órdenes`)} />
            </div>
          </ReportPage>
        ),
      },
      {
        id: "conclusiones", toc: "Conclusiones",
        render: (page, dm) => (
          <ReportPage meta={dm} page={page}>
            <SectionTitle icon={ClipboardCheck} title="Conclusiones" sub="Síntesis automática del periodo" />
            <div className="erp-conclusion">{conclusions.map((c, i) => <p key={i}>{c}</p>)}</div>
          </ReportPage>
        ),
      },
      ...detailPages,
    ];

    doc = {
      docMeta: { reportTitle: "Compras", folio: meta.folio, branch: branchDisplay, period: periodLabel, user: userName, filtersLabel, generatedAt: meta.generatedAt },
      pages, filenameBase: "Compras", onExcel, onCsv,
    };
  }

  return (
    <ReportShell configPanel={configPanel} ready={!!data && !!meta} loading={loading} error={error} doc={doc}
      emptyText="Configure los filtros y presione «Generar reporte» para obtener la vista previa del documento." />
  );
};

export default ComprasReport;
