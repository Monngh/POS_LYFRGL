import React, { useEffect, useMemo, useState } from "react";
import {
  BarChart3, Boxes, CalendarRange, ClipboardCheck, Coins, CreditCard, DollarSign,
  GitCompareArrows, Landmark, LineChart as LineIcon, Package, Receipt, RotateCcw,
  ShoppingCart, Store, Tag, TrendingUp, Trophy, UserCheck, UserPlus, Users, XCircle,
  Award, AlertTriangle,
} from "lucide-react";
import api from "../../../shared/services/api";
import { useAuth } from "../../../auth";
import { money, fmtDate } from "../shared";
import {
  COMPANY, ReportLogo, buildFolio, REPORT_VERSION,
  ReportPage, SectionTitle, KpiCard, Semaforo, InsightsPanel, AlertsPanel,
  ChartCard, DonutCard, RankingCard, ReportField, ReportSelect,
  ReportTable, ReportShell, ReportConfigPanel,
  TrendArea, TrendLine, VBars, HBars, Heatmap, CAT, CHART, payColor,
  fmtInt, fmtPct, shortDay,
  exportExcel, exportCsv,
  type AlertItem, type RankingRow, type ReportPageDef, type ReportDocBundle, type ExportSheet,
} from "./framework";

// ============================================================================
// REPORTE EJECUTIVO — Plantilla maestra de todos los reportes del sistema.
// Solo aporta: tipos de datos, definición de KPIs, motores de análisis y sus
// páginas A4. La portada/encabezados/pie/impresión/PDF/visor los provee el
// framework (ReportShell + componentes + chartkit).
// ============================================================================
interface Vary { value: number; prev: number; delta: number; pct: number; }
interface SummaryData {
  period: { from: string; to: string; prevFrom: string; prevTo: string; days: number };
  kpis: Record<string, Vary>;
  tops: { topVendedor: string; topSucursal: string; topCategoria: string; topProducto: string; topCliente: string; metodoPagoPrincipal: string };
  series: {
    ventasPorDia: { fecha: string; total: number }[];
    ticketPromedioDiario: { fecha: string; promedio: number }[];
    utilidadDiaria: { fecha: string; utilidad: number }[];
    cancelacionesPorDia: { fecha: string; cantidad: number }[];
    devolucionesPorDia: { fecha: string; cantidad: number }[];
    ventasPorHora: { hour: number; total: number }[];
    heatmap: { dow: number; hour: number; value: number }[];
    ventasPorSucursal: { sucursal: string; total: number; tickets: number }[];
    ventasPorVendedor: { vendedor: string; total: number; tickets: number }[];
    ventasPorCategoria: { categoria: string; total: number; unidades: number }[];
    metodosPago: { metodo: string; total: number; count: number }[];
    clientesNuevosVsRecurrentes: { tipo: string; cantidad: number }[];
  };
  rankings: {
    productos: { rank: number; nombre: string; sku: string; cantidad: number; importe: number; utilidad: number }[];
    categorias: { rank: number; nombre: string; unidades: number; importe: number }[];
    vendedores: { rank: number; nombre: string; tickets: number; importe: number }[];
    sucursales: { rank: number; nombre: string; tickets: number; importe: number }[];
    clientes: { rank: number; nombre: string; tickets: number; importe: number }[];
  };
  timeframes: { key: string; label: string; actual: number; anterior: number; delta: number; pct: number }[];
  alertsData: {
    agotados: number; stockCritico: number; criticoEjemplos: string[]; sobreInventario: number;
    sinMovimiento: number; sinMovEjemplos: string[]; margenNegativoCount: number;
    margenNegativoEjemplos: string[]; clientesAltaDevolucion: { nombre: string; devoluciones: number }[];
  };
}

interface FilterOptions {
  branches: { id: number; name: string }[];
  sellers: { id: number; name: string; role: string }[];
  categories: { id: number; name: string }[];
  paymentMethods: string[];
}

const DOW = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const isoToday = () => new Date().toISOString().slice(0, 10);
const isoAgo = (d: number) => new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);

type KpiFmt = "money" | "pct" | "int";
const fmtKpi = (fmt: KpiFmt, v: number) => (fmt === "money" ? money(v) : fmt === "pct" ? fmtPct(v) : fmtInt(v));

// ---- Definición de KPIs (icono, formato y polaridad) ----------------------
const KPI_FIN: { key: string; label: string; icon: any; fmt: KpiFmt; better: boolean }[] = [
  { key: "ventasBrutas", label: "Ventas Brutas", icon: Receipt, fmt: "money", better: true },
  { key: "ventasNetas", label: "Ventas Netas", icon: DollarSign, fmt: "money", better: true },
  { key: "utilidad", label: "Utilidad", icon: TrendingUp, fmt: "money", better: true },
  { key: "margen", label: "Margen", icon: Coins, fmt: "pct", better: true },
  { key: "costo", label: "Costo", icon: Package, fmt: "money", better: false },
  { key: "iva", label: "IVA", icon: Landmark, fmt: "money", better: true },
  { key: "descuentos", label: "Descuentos", icon: Tag, fmt: "money", better: false },
  { key: "ticketPromedio", label: "Ticket Promedio", icon: CreditCard, fmt: "money", better: true },
];
const KPI_OPER: { key: string; label: string; icon: any; fmt: KpiFmt; better: boolean }[] = [
  { key: "tickets", label: "Tickets", icon: ShoppingCart, fmt: "int", better: true },
  { key: "clientesAtendidos", label: "Clientes Atendidos", icon: Users, fmt: "int", better: true },
  { key: "clientesNuevos", label: "Clientes Nuevos", icon: UserPlus, fmt: "int", better: true },
  { key: "clientesRecurrentes", label: "Clientes Recurrentes", icon: UserCheck, fmt: "int", better: true },
  { key: "productosVendidos", label: "Productos Vendidos", icon: Package, fmt: "int", better: true },
  { key: "articulosVendidos", label: "Artículos Vendidos", icon: Boxes, fmt: "int", better: true },
  { key: "cancelaciones", label: "Cancelaciones", icon: XCircle, fmt: "int", better: false },
  { key: "devoluciones", label: "Devoluciones", icon: RotateCcw, fmt: "int", better: false },
];
const RESUMEN_ROWS: { key: string; label: string; fmt: KpiFmt; better: boolean }[] = [
  { key: "ventasBrutas", label: "Ventas Brutas", fmt: "money", better: true },
  { key: "ventasNetas", label: "Ventas Netas", fmt: "money", better: true },
  { key: "utilidad", label: "Utilidad", fmt: "money", better: true },
  { key: "margen", label: "Margen", fmt: "pct", better: true },
  { key: "costo", label: "Costo", fmt: "money", better: false },
  { key: "iva", label: "IVA", fmt: "money", better: true },
  { key: "descuentos", label: "Descuentos", fmt: "money", better: false },
  { key: "tickets", label: "Tickets", fmt: "int", better: true },
  { key: "ticketPromedio", label: "Ticket Promedio", fmt: "money", better: true },
  { key: "articulosVendidos", label: "Artículos Vendidos", fmt: "int", better: true },
  { key: "cancelaciones", label: "Cancelaciones", fmt: "int", better: false },
  { key: "devoluciones", label: "Devoluciones", fmt: "int", better: false },
];

// ---- Motores de análisis (100% dinámicos — sin texto fijo) ----------------
const B: React.FC<{ children: React.ReactNode }> = ({ children }) => <b>{children}</b>;

function buildInsights(d: SummaryData): React.ReactNode[] {
  const k = d.kpis;
  const out: React.ReactNode[] = [];
  const dirWord = (p: number, up: string, down: string) => (p >= 0 ? up : down);
  out.push(<>Las ventas netas {dirWord(k.ventasNetas.pct, "crecieron", "disminuyeron")} <B>{fmtPct(Math.abs(k.ventasNetas.pct))}</B> respecto al periodo anterior ({money(k.ventasNetas.value)} vs. {money(k.ventasNetas.prev)}).</>);
  out.push(<>El ticket promedio {dirWord(k.ticketPromedio.pct, "aumentó", "disminuyó")} <B>{fmtPct(Math.abs(k.ticketPromedio.pct))}</B>, ubicándose en <B>{money(k.ticketPromedio.value)}</B>.</>);
  if (k.utilidad.pct >= 0 && k.descuentos.pct < 0) {
    out.push(<>La utilidad aumentó <B>{fmtPct(k.utilidad.pct)}</B>, apoyada en menores descuentos (<B>{fmtPct(k.descuentos.pct)}</B>).</>);
  } else {
    out.push(<>La utilidad {dirWord(k.utilidad.pct, "aumentó", "se redujo")} <B>{fmtPct(Math.abs(k.utilidad.pct))}</B>, con un margen de <B>{fmtPct(k.margen.value)}</B>.</>);
  }
  const payTotal = d.series.metodosPago.reduce((a, m) => a + m.total, 0);
  if (d.series.metodosPago.length > 0 && payTotal > 0) {
    const top = d.series.metodosPago[0];
    out.push(<>El método de pago predominante fue <B>{top.metodo}</B> con el <B>{fmtPct((top.total / payTotal) * 100)}</B> del importe.</>);
  }
  if (d.tops.topProducto !== "—") out.push(<>El producto más vendido fue <B>{d.tops.topProducto}</B>.</>);
  if (d.series.ventasPorSucursal.length > 1) {
    const tot = d.series.ventasPorSucursal.reduce((a, b) => a + b.total, 0);
    const top = d.series.ventasPorSucursal[0];
    out.push(<>La sucursal con mayor venta fue <B>{top.sucursal}</B>, concentrando el <B>{fmtPct(tot > 0 ? (top.total / tot) * 100 : 0)}</B> del total.</>);
  }
  const ops = k.tickets.value + k.cancelaciones.value;
  if (ops > 0) out.push(<>Las cancelaciones representan el <B>{fmtPct((k.cancelaciones.value / ops) * 100)}</B> de las operaciones del periodo.</>);
  out.push(<>Las devoluciones {k.devoluciones.value <= k.devoluciones.prev ? <>disminuyeron ({fmtInt(k.devoluciones.value)} vs. {fmtInt(k.devoluciones.prev)})</> : <>aumentaron ({fmtInt(k.devoluciones.value)} vs. {fmtInt(k.devoluciones.prev)})</>} respecto al periodo anterior.</>);
  const peak = d.series.ventasPorHora.reduce((m, h) => (h.total > m.total ? h : m), { hour: 0, total: 0 });
  if (peak.total > 0) out.push(<>La hora pico de venta fue entre las <B>{peak.hour}:00 y {peak.hour + 1}:00 h</B>.</>);
  return out;
}

function buildAlerts(d: SummaryData): AlertItem[] {
  const k = d.kpis;
  const a = d.alertsData;
  const out: AlertItem[] = [];
  if (k.utilidad.value < 0) out.push({ tone: "red", text: <>Margen global negativo: la utilidad del periodo es <B>{money(k.utilidad.value)}</B>. Revisar costos y política de descuentos.</> });
  if (a.agotados > 0) out.push({ tone: "red", text: <><B>{fmtInt(a.agotados)}</B> productos agotados (existencia en cero).</> });
  if (a.stockCritico > 0) out.push({ tone: "amber", text: <><B>{fmtInt(a.stockCritico)}</B> productos en stock crítico (≤ mínimo){a.criticoEjemplos.length > 0 && <>: {a.criticoEjemplos.join(", ")}</>}.</> });
  if (a.margenNegativoCount > 0) out.push({ tone: "red", text: <><B>{fmtInt(a.margenNegativoCount)}</B> productos vendidos con margen negativo{a.margenNegativoEjemplos.length > 0 && <>: {a.margenNegativoEjemplos.join(", ")}</>}.</> });
  const vals = d.series.ventasPorDia.filter((x) => x.total > 0).map((x) => x.total);
  if (vals.length >= 5) {
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    const sd = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length);
    const low = d.series.ventasPorDia.filter((x) => x.total > 0 && x.total < mean - 1.5 * sd);
    if (low.length > 0) out.push({ tone: "amber", text: <><B>{low.length}</B> día(s) con ventas atípicamente bajas: {low.slice(0, 3).map((x) => fmtDate(x.fecha)).join(", ")}.</> });
  }
  const ops = k.tickets.value + k.cancelaciones.value;
  if (ops > 0 && (k.cancelaciones.value / ops) * 100 > 5) out.push({ tone: "amber", text: <>Cancelaciones elevadas: <B>{fmtPct((k.cancelaciones.value / ops) * 100)}</B> de las operaciones.</> });
  if (k.cancelaciones.value > k.cancelaciones.prev && k.cancelaciones.pct > 20) out.push({ tone: "amber", text: <>Incremento de cancelaciones: <B>+{fmtPct(k.cancelaciones.pct)}</B> vs. periodo anterior.</> });
  if (k.devoluciones.value > k.devoluciones.prev && k.devoluciones.pct > 20) out.push({ tone: "amber", text: <>Incremento de devoluciones: <B>+{fmtPct(k.devoluciones.pct)}</B> vs. periodo anterior.</> });
  if (a.sinMovimiento > 0) out.push({ tone: "amber", text: <><B>{fmtInt(a.sinMovimiento)}</B> productos activos sin movimiento en el periodo{a.sinMovEjemplos.length > 0 && <> (p. ej. {a.sinMovEjemplos.join(", ")})</>}.</> });
  if (a.sobreInventario > 0) out.push({ tone: "amber", text: <>Exceso de inventario en <B>{fmtInt(a.sobreInventario)}</B> productos (existencia &gt; máximo).</> });
  if (a.clientesAltaDevolucion.length > 0) out.push({ tone: "amber", text: <>Clientes con alta frecuencia de devolución: {a.clientesAltaDevolucion.map((c) => `${c.nombre} (${c.devoluciones})`).join(", ")}.</> });
  const sellers = d.series.ventasPorVendedor;
  if (sellers.length >= 3) {
    const avg = sellers.reduce((s, v) => s + v.total, 0) / sellers.length;
    const lows = sellers.filter((s) => s.total < avg * 0.45);
    if (lows.length > 0) out.push({ tone: "amber", text: <>Vendedores con desempeño por debajo del 45% del promedio: {lows.slice(0, 3).map((s) => s.vendedor).join(", ")}.</> });
  }
  if (out.length === 0 && k.ventasNetas.pct > 5) out.push({ tone: "green", text: <>Desempeño saludable: crecimiento de <B>{fmtPct(k.ventasNetas.pct)}</B> en ventas netas sin excepciones operativas relevantes.</> });
  return out;
}

function buildConclusions(d: SummaryData): React.ReactNode[] {
  const k = d.kpis;
  const parts: React.ReactNode[] = [];
  parts.push(
    <>Las ventas {k.ventasNetas.pct >= 0 ? "mantienen una tendencia positiva" : "presentan una contracción"} en el periodo, con {money(k.ventasNetas.value)} netos ({k.ventasNetas.pct >= 0 ? "+" : ""}{fmtPct(k.ventasNetas.pct)} vs. periodo anterior) y una utilidad de {money(k.utilidad.value)} a un margen de {fmtPct(k.margen.value)}.{" "}
      {k.utilidad.pct > k.ventasNetas.pct ? "La utilidad creció por encima de las ventas, señal de una mezcla de productos y descuentos más eficiente." : k.utilidad.pct < k.ventasNetas.pct ? "La utilidad creció por debajo de las ventas; conviene vigilar costos y descuentos." : ""}</>
  );
  parts.push(
    <>Se procesaron {fmtInt(k.tickets.value)} tickets con un valor promedio de {money(k.ticketPromedio.value)} ({k.ticketPromedio.pct >= 0 ? "al alza" : "a la baja"} {fmtPct(Math.abs(k.ticketPromedio.pct))}).{" "}
      Las cancelaciones {k.cancelaciones.value <= k.cancelaciones.prev ? "disminuyeron" : "aumentaron"} y las devoluciones {k.devoluciones.value <= k.devoluciones.prev ? "disminuyeron" : "aumentaron"} respecto al periodo anterior.</>
  );
  if (d.series.ventasPorSucursal.length > 1) {
    const tot = d.series.ventasPorSucursal.reduce((a, b) => a + b.total, 0);
    const top = d.series.ventasPorSucursal[0];
    parts.push(<>La sucursal {top.sucursal} concentra el mayor volumen ({fmtPct(tot > 0 ? (top.total / tot) * 100 : 0)} del total); el desempeño del resto de las plazas ofrece espacio de crecimiento.</>);
  }
  const cats = d.series.ventasPorCategoria;
  if (cats.length > 3) {
    const lows = cats.slice(-2).map((c) => c.categoria);
    parts.push(<>Existe oportunidad de incrementar ventas en categorías de baja rotación ({lows.join(" y ")}), así como de atender los puntos señalados en la sección de alertas.</>);
  }
  return parts;
}

// ============================================================================
// Componente
// ============================================================================
const ExecutiveSummaryReport: React.FC<{ branchId: string; branchLabel: string }> = ({ branchId, branchLabel }) => {
  const { user } = useAuth();

  // ---- Filtros ----
  const [from, setFrom] = useState(isoAgo(29));
  const [to, setTo] = useState(isoToday());
  const [fBranch, setFBranch] = useState<string>(branchId);
  const [fSeller, setFSeller] = useState("");
  const [fCategory, setFCategory] = useState("");
  const [fPay, setFPay] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [fCash, setFCash] = useState("");
  const [fCustomer, setFCustomer] = useState("");
  const [fProduct, setFProduct] = useState("");
  const [fSearch, setFSearch] = useState("");
  const [options, setOptions] = useState<FilterOptions | null>(null);
  const [configOpen, setConfigOpen] = useState(true);

  // ---- Datos ----
  const [data, setData] = useState<SummaryData | null>(null);
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
      const res = await api.get<SummaryData>("/api/admin/reports/executive-summary", {
        params: {
          from, to,
          ...(fBranch !== "all" ? { branchId: fBranch } : {}),
          ...(fSeller ? { sellerId: fSeller } : {}),
          ...(fCategory ? { categoryId: fCategory } : {}),
          ...(fPay ? { paymentMethod: fPay } : {}),
          ...(fStatus ? { status: fStatus } : {}),
          ...(fCash ? { cashSessionId: fCash } : {}),
          ...(fCustomer ? { customer: fCustomer } : {}),
          ...(fProduct ? { product: fProduct } : {}),
          ...(fSearch ? { search: fSearch } : {}),
        },
      });
      setData(res.data);
      setMeta({ folio: buildFolio("RPT-EJEC"), generatedAt: new Date() });
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
    if (fPay) parts.push(`Pago: ${fPay}`);
    if (fStatus) parts.push(`Estado: ${fStatus}`);
    if (fCash) parts.push(`Caja: ${fCash}`);
    if (fCustomer) parts.push(`Cliente: ${fCustomer}`);
    if (fProduct) parts.push(`Producto: ${fProduct}`);
    if (fSearch) parts.push(`Búsqueda: ${fSearch}`);
    return parts.join(" · ");
  }, [periodLabel, branchDisplay, fSeller, fCategory, fPay, fStatus, fCash, fCustomer, fProduct, fSearch, options]);

  const insights = useMemo(() => (data ? buildInsights(data) : []), [data]);
  const alerts = useMemo(() => (data ? buildAlerts(data) : []), [data]);
  const conclusions = useMemo(() => (data ? buildConclusions(data) : []), [data]);

  // ---- Exportaciones ----
  const buildResumenRows = (d: SummaryData) =>
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
        name: "Indicadores", title: `Resumen Ejecutivo · ${periodLabel}`,
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
        name: "Comparativo",
        columns: [
          { header: "Marco temporal", key: "label", width: 34 },
          { header: "Actual", key: "actual", type: "money" },
          { header: "Anterior", key: "anterior", type: "money" },
          { header: "Diferencia", key: "delta", type: "money" },
          { header: "Variación %", key: "pct", type: "number" },
        ],
        rows: data.timeframes.map((t) => ({ ...t, pct: Number(t.pct.toFixed(2)) })),
      },
      {
        name: "Top productos",
        columns: [
          { header: "#", key: "rank", type: "int", width: 6 },
          { header: "Producto", key: "nombre", width: 38 },
          { header: "SKU", key: "sku", width: 16 },
          { header: "Cantidad", key: "cantidad", type: "int" },
          { header: "Importe", key: "importe", type: "money" },
          { header: "Utilidad", key: "utilidad", type: "money" },
        ],
        rows: data.rankings.productos,
        totals: {
          cantidad: data.rankings.productos.reduce((a, r) => a + r.cantidad, 0),
          importe: data.rankings.productos.reduce((a, r) => a + r.importe, 0),
          utilidad: data.rankings.productos.reduce((a, r) => a + r.utilidad, 0),
        },
      },
      {
        name: "Top clientes",
        columns: [
          { header: "#", key: "rank", type: "int", width: 6 },
          { header: "Cliente", key: "nombre", width: 36 },
          { header: "Tickets", key: "tickets", type: "int" },
          { header: "Importe", key: "importe", type: "money" },
        ],
        rows: data.rankings.clientes,
      },
    ];
    exportExcel(`Resumen_Ejecutivo_${from}_${to}`, sheets, {
      Reporte: "Resumen Ejecutivo de Ventas",
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
    exportCsv(`Resumen_Ejecutivo_${from}_${to}`, [
      { header: "Concepto", key: "concepto" },
      { header: "Periodo actual", key: "actual" },
      { header: "Periodo anterior", key: "anterior" },
      { header: "Variación $", key: "varMon" },
      { header: "Variación %", key: "varPct" },
    ], buildResumenRows(data));
  };

  // ---- Panel de configuración (chrome común + campos del módulo) ----
  const configPanel = (
    <ReportConfigPanel
      open={configOpen}
      onToggle={() => setConfigOpen(!configOpen)}
      canCollapse={!!data}
      onGenerate={generate}
      onClear={() => { setFSeller(""); setFCategory(""); setFPay(""); setFStatus(""); setFCash(""); setFCustomer(""); setFProduct(""); setFSearch(""); }}
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
      <ReportField label="Vendedor / Usuario"><ReportSelect value={fSeller} onChange={setFSeller} options={(options?.sellers ?? []).map((s) => ({ value: String(s.id), label: s.name }))} allLabel="Todos" /></ReportField>
      <ReportField label="Categoría"><ReportSelect value={fCategory} onChange={setFCategory} options={(options?.categories ?? []).map((c) => ({ value: String(c.id), label: c.name }))} allLabel="Todas" /></ReportField>
      <ReportField label="Método de pago"><ReportSelect value={fPay} onChange={setFPay} options={(options?.paymentMethods ?? []).map((m) => ({ value: m, label: m }))} allLabel="Todos" /></ReportField>
      <ReportField label="Estado"><ReportSelect value={fStatus} onChange={setFStatus} options={[{ value: "COMPLETADA", label: "Completadas" }, { value: "CANCELADA", label: "Canceladas" }]} allLabel="Todos" /></ReportField>
      <ReportField label="Caja (ID sesión)"><input type="number" min={1} value={fCash} onChange={(e) => setFCash(e.target.value)} placeholder="Todas" /></ReportField>
      <ReportField label="Cliente"><input type="text" maxLength={80} value={fCustomer} onChange={(e) => setFCustomer(e.target.value)} placeholder="Nombre o teléfono" /></ReportField>
      <ReportField label="Producto"><input type="text" maxLength={80} value={fProduct} onChange={(e) => setFProduct(e.target.value)} placeholder="Nombre o SKU" /></ReportField>
      <ReportField label="Buscar por texto"><input type="text" maxLength={80} value={fSearch} onChange={(e) => setFSearch(e.target.value)} placeholder="Folio, producto, cliente…" /></ReportField>
    </ReportConfigPanel>
  );

  // ---- Documento (páginas específicas del módulo) ----
  let doc: ReportDocBundle | undefined;
  if (data && meta) {
    const k = data.kpis;
    const heat: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    for (const c of data.series.heatmap) heat[c.dow][c.hour] = c.value;

    const rankingRows = (rows: any[], metaOf: (r: any) => string): RankingRow[] => {
      const max = rows[0]?.importe || 1;
      return rows.map((r) => ({ rank: r.rank, nombre: r.nombre, valor: money(r.importe), meta: metaOf(r), share: (r.importe / max) * 100 }));
    };
    const resumenRows = RESUMEN_ROWS.map((r) => ({ ...r, v: k[r.key] }));

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
              <div className="erp-cover-kicker">Reporte Gerencial</div>
              <div className="erp-cover-title">Resumen Ejecutivo<br />de Ventas</div>
              <div className="erp-cover-desc">Análisis ejecutivo del desempeño comercial: indicadores clave, comparativos contra periodos anteriores, tendencias, hallazgos automáticos y alertas para la toma de decisiones.</div>
            </div>
            <div className="erp-cover-meta">
              {[
                ["Empresa", COMPANY.legalName],
                ["Reporte", `Resumen Ejecutivo · Versión ${REPORT_VERSION}`],
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
        id: "kpi-fin", toc: "Resumen Ejecutivo",
        render: (page, dm) => (
          <ReportPage meta={dm} page={page}>
            <SectionTitle icon={BarChart3} title="Resumen Ejecutivo — Indicadores financieros" sub={periodLabel} />
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
            <SectionTitle icon={Users} title="Resumen Ejecutivo — Operación y clientes" sub={periodLabel} />
            <div className="erp-kpi-grid big">
              {KPI_OPER.map((def) => (
                <KpiCard key={def.key} icon={def.icon} label={def.label} display={fmtKpi(def.fmt, k[def.key].value)} variation={k[def.key]} higherIsBetter={def.better} />
              ))}
            </div>
            <SectionTitle icon={Award} title="Destacados del periodo" />
            <div className="erp-tops" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
              {[
                ["Sucursal con mayores ventas", data.tops.topSucursal],
                ["Vendedor con mayores ventas", data.tops.topVendedor],
                ["Producto más vendido", data.tops.topProducto],
                ["Categoría más vendida", data.tops.topCategoria],
                ["Método de pago más utilizado", data.tops.metodoPagoPrincipal],
                ["Cliente principal", data.tops.topCliente],
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
      // 4 · COMPARATIVO + TABLA RESUMEN (ReportTable reutilizable)
      {
        id: "comparativo", toc: "Comparativo",
        render: (page, dm) => (
          <ReportPage meta={dm} page={page}>
            <SectionTitle icon={GitCompareArrows} title="Comparativo contra periodos anteriores" sub="Ventas completadas" />
            <ReportTable
              rows={data.timeframes}
              keyOf={(t: any) => t.key}
              columns={[
                { key: "label", header: "Marco temporal", render: (t: any) => <span style={{ fontWeight: 700 }}>{t.label}</span> },
                { key: "actual", header: "Actual", align: "right", render: (t: any) => money(t.actual) },
                { key: "anterior", header: "Anterior", align: "right", render: (t: any) => money(t.anterior) },
                { key: "delta", header: "Diferencia $", align: "right", render: (t: any) => `${t.delta >= 0 ? "+" : ""}${money(t.delta)}` },
                { key: "pct", header: "Variación %", align: "right", render: (t: any) => <span style={{ color: t.pct >= 0 ? "#15803d" : "#b91c1c", fontWeight: 800 }}>{t.pct >= 0 ? "▲ +" : "▼ "}{t.pct.toFixed(1)}%</span> },
                { key: "sem", header: "Semáforo", align: "center", render: (t: any) => <Semaforo pct={t.pct} /> },
              ]}
            />
            <SectionTitle icon={ClipboardCheck} title="Tabla resumen ejecutiva" sub="Periodo vs. periodo anterior equivalente" />
            <ReportTable
              rows={resumenRows}
              keyOf={(r: any) => r.key}
              columns={[
                { key: "label", header: "Concepto", render: (r: any) => <span style={{ fontWeight: 700 }}>{r.label}</span> },
                { key: "actual", header: "Periodo actual", align: "right", render: (r: any) => fmtKpi(r.fmt, r.v.value) },
                { key: "anterior", header: "Periodo anterior", align: "right", render: (r: any) => fmtKpi(r.fmt, r.v.prev) },
                { key: "delta", header: "Variación $", align: "right", render: (r: any) => r.fmt === "money" ? `${r.v.delta >= 0 ? "+" : ""}${money(r.v.delta)}` : `${r.v.delta >= 0 ? "+" : ""}${r.fmt === "pct" ? r.v.delta.toFixed(1) + " pp" : fmtInt(r.v.delta)}` },
                { key: "pct", header: "Variación %", align: "right", render: (r: any) => <span style={{ color: (r.better ? r.v.pct >= 0 : r.v.pct <= 0) ? "#15803d" : "#b91c1c", fontWeight: 800 }}>{r.v.pct >= 0 ? "+" : ""}{r.v.pct.toFixed(1)}%</span> },
                { key: "sem", header: "Semáforo", align: "center", render: (r: any) => <Semaforo pct={r.v.pct} higherIsBetter={r.better} /> },
              ]}
            />
          </ReportPage>
        ),
      },
      // 5 · TENDENCIAS I (evolución diaria)
      {
        id: "tend-1", toc: "Tendencias",
        render: (page, dm) => (
          <ReportPage meta={dm} page={page}>
            <SectionTitle icon={LineIcon} title="Tendencias — Evolución diaria" sub="Cada gráfica responde una pregunta del negocio" />
            <ChartCard question="¿Cómo evolucionaron las ventas día a día?" sub="Ventas brutas por día del periodo" full>
              <TrendArea data={data.series.ventasPorDia} xKey="fecha" yKey="total" name="Ventas" height={165} formatValue={money} formatLabel={(l) => fmtDate(String(l))} />
            </ChartCard>
            <div style={{ height: 11 }} />
            <ChartCard question="¿Cómo se comportó la utilidad diaria?" sub="Utilidad bruta estimada por día (venta − costo)" full>
              <TrendLine data={data.series.utilidadDiaria} xKey="fecha" yKey="utilidad" name="Utilidad" height={150} color={CHART.navy} formatValue={money} formatLabel={(l) => fmtDate(String(l))} />
            </ChartCard>
            <div style={{ height: 11 }} />
            <ChartCard question="¿Cómo varió el ticket promedio por día?" sub="Importe promedio por ticket" full>
              <TrendLine data={data.series.ticketPromedioDiario} xKey="fecha" yKey="promedio" name="Ticket promedio" height={150} color={CHART.blue} formatValue={money} formatLabel={(l) => fmtDate(String(l))} />
            </ChartCard>
          </ReportPage>
        ),
      },
      // 6 · TENDENCIAS II (estructura de la venta)
      {
        id: "tend-2",
        render: (page, dm) => (
          <ReportPage meta={dm} page={page}>
            <SectionTitle icon={BarChart3} title="Tendencias — Estructura de la venta" />
            <div className="erp-charts-grid">
              <ChartCard question="¿En qué horas se concentra la venta?" sub="Ventas por hora del día">
                <VBars data={data.series.ventasPorHora} xKey="hour" yKey="total" name="Ventas" height={158} xInterval={2} formatX={(h) => `${h}h`} formatValue={money} formatLabel={(h) => `${h}:00 h`} />
              </ChartCard>
              <ChartCard question="¿Qué sucursal vende más?" sub="Ventas por sucursal">
                <HBars data={data.series.ventasPorSucursal.slice(0, 6)} categoryKey="sucursal" valueKey="total" name="Ventas" height={158} barSize={14} formatValue={money} />
              </ChartCard>
              <ChartCard question="¿Qué categorías generan más ingreso?" sub="Top 8 categorías por importe">
                <HBars data={data.series.ventasPorCategoria.slice(0, 8)} categoryKey="categoria" valueKey="total" name="Importe" height={158} barSize={11} color={CHART.blue} formatValue={money} />
              </ChartCard>
              <ChartCard question="¿Quiénes son los vendedores líderes?" sub="Top 8 vendedores por importe">
                <HBars data={data.series.ventasPorVendedor.slice(0, 8)} categoryKey="vendedor" valueKey="total" name="Ventas" height={158} barSize={11} formatValue={money} />
              </ChartCard>
            </div>
          </ReportPage>
        ),
      },
      // 7 · TENDENCIAS III (pagos, clientes, productos)
      {
        id: "tend-3",
        render: (page, dm) => (
          <ReportPage meta={dm} page={page}>
            <SectionTitle icon={CreditCard} title="Tendencias — Pagos, clientes y productos" />
            <div className="erp-charts-grid">
              <DonutCard
                question="¿Qué métodos de pago usan los clientes?"
                sub="Participación por importe · segmentos menores se agrupan en «Otros»"
                data={data.series.metodosPago.map((m) => ({ name: m.metodo, value: m.total, color: payColor(m.metodo) }))}
                format={(v) => money(v)}
                centerTitle="Total"
              />
              <DonutCard
                question="¿Atendemos clientes nuevos o recurrentes?"
                sub="Clientes identificados del periodo"
                data={data.series.clientesNuevosVsRecurrentes.map((c, i) => ({ name: c.tipo, value: c.cantidad, color: i === 0 ? CAT[0] : CAT[2] }))}
                format={(v) => fmtInt(v)}
                centerTitle="Clientes"
              />
            </div>
            <div style={{ height: 11 }} />
            <ChartCard question="¿Qué productos impulsan el ingreso?" sub="Top 10 productos por importe" full>
              <HBars data={data.rankings.productos} categoryKey="nombre" valueKey="importe" name="Importe" height={235} yWidth={128} yFontSize={7.5} barSize={12} color={CHART.blue} formatValue={money} />
            </ChartCard>
          </ReportPage>
        ),
      },
      // 8 · TENDENCIAS IV (cancelaciones, devoluciones, mapa de calor)
      {
        id: "tend-4",
        render: (page, dm) => (
          <ReportPage meta={dm} page={page}>
            <SectionTitle icon={XCircle} title="Tendencias — Cancelaciones, devoluciones y actividad" />
            <div className="erp-charts-grid">
              <ChartCard question="¿Cuándo ocurren las cancelaciones?" sub="Cancelaciones por día">
                <VBars data={data.series.cancelacionesPorDia} xKey="fecha" yKey="cantidad" name="Cancelaciones" height={140} allowDecimals={false} yWidth={26} xMinTickGap={24} formatX={shortDay} formatValue={fmtInt} formatLabel={(l) => fmtDate(String(l))} />
              </ChartCard>
              <ChartCard question="¿Cuándo ocurren las devoluciones?" sub="Devoluciones por día">
                <VBars data={data.series.devolucionesPorDia} xKey="fecha" yKey="cantidad" name="Devoluciones" height={140} allowDecimals={false} yWidth={26} xMinTickGap={24} color={CHART.navy} formatX={shortDay} formatValue={fmtInt} formatLabel={(l) => fmtDate(String(l))} />
              </ChartCard>
            </div>
            <SectionTitle icon={CalendarRange} title="Mapa de calor — ¿Qué días y horas concentran la venta?" />
            <Heatmap matrix={heat} rowLabels={DOW} format={(v) => money(v)} />
          </ReportPage>
        ),
      },
      // 9 · HALLAZGOS + ALERTAS
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
      // 10 · RANKINGS
      {
        id: "rankings", toc: "Rankings",
        render: (page, dm) => (
          <ReportPage meta={dm} page={page}>
            <SectionTitle icon={Trophy} title="Rankings del periodo" sub="Top 10 por importe" />
            <div className="erp-rank-grid">
              <RankingCard icon={Package} title="Top productos" rows={rankingRows(data.rankings.productos, (r) => `${fmtInt(r.cantidad)} uds`)} />
              <RankingCard icon={Tag} title="Top categorías" rows={rankingRows(data.rankings.categorias, (r) => `${fmtInt(r.unidades)} uds`)} />
              <RankingCard icon={UserCheck} title="Top vendedores" rows={rankingRows(data.rankings.vendedores, (r) => `${fmtInt(r.tickets)} tickets`)} />
              <RankingCard icon={Store} title="Top sucursales" rows={rankingRows(data.rankings.sucursales, (r) => `${fmtInt(r.tickets)} tickets`)} />
            </div>
          </ReportPage>
        ),
      },
      // 11 · CLIENTES + CONCLUSIONES
      {
        id: "conclusiones", toc: "Conclusiones",
        render: (page, dm) => (
          <ReportPage meta={dm} page={page}>
            <SectionTitle icon={Users} title="Top clientes del periodo" sub="Clientes identificados con mayor compra" />
            <div className="erp-rank-grid">
              <RankingCard icon={Users} title="Top clientes" rows={rankingRows(data.rankings.clientes, (r) => `${fmtInt(r.tickets)} tickets`)} full />
            </div>
            <SectionTitle icon={ClipboardCheck} title="Conclusiones Ejecutivas" sub="Síntesis automática del periodo" />
            <div className="erp-conclusion">
              {conclusions.map((c, i) => <p key={i}>{c}</p>)}
            </div>
          </ReportPage>
        ),
      },
    ];

    doc = {
      docMeta: {
        reportTitle: "Resumen Ejecutivo de Ventas",
        folio: meta.folio,
        branch: branchDisplay,
        period: periodLabel,
        user: userName,
        filtersLabel,
        generatedAt: meta.generatedAt,
      },
      pages,
      filenameBase: "Reporte_Ejecutivo",
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

export default ExecutiveSummaryReport;
