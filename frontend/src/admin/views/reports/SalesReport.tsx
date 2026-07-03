import React, { useEffect, useMemo, useState } from "react";
import {
  BarChart3, CalendarRange, ClipboardCheck, Coins, CreditCard, DollarSign,
  GitCompareArrows, Landmark, LineChart as LineIcon, ListOrdered, Package, Receipt,
  RotateCcw, ShoppingCart, Store, Tag, TrendingUp, Trophy, UserCheck, XCircle,
  Award, AlertTriangle, Gauge, Ban,
} from "lucide-react";
import api from "../../../shared/services/api";
import { useAuth } from "../../../auth";
import { money, fmtDate, fmtDateTime } from "../shared";
import {
  COMPANY, ReportLogo, buildFolio, REPORT_VERSION,
  ReportPage, SectionTitle, KpiCard, Semaforo, InsightsPanel, AlertsPanel,
  ChartCard, DonutCard, RankingCard, ReportField, ReportSelect,
  ReportTable, ReportShell, ReportConfigPanel,
  TrendArea, TrendLine, VBars, HBars, CAT, CHART, payColor,
  fmtInt, fmtPct,
  exportExcel, exportCsv,
  type AlertItem, type RankingRow, type ReportPageDef, type ReportDocBundle, type ExportSheet,
} from "./framework";

// ============================================================================
// REPORTE DE VENTAS (detallado) — primer módulo que HEREDA la plantilla maestra
// del framework. Aporta únicamente: tipos de datos, definición de KPIs, motores
// de análisis y sus páginas A4 (incluido el anexo con el detalle de todas las
// transacciones). Portada / encabezados / pie / impresión / PDF / visor los
// provee el framework (idénticos al Resumen Ejecutivo).
// ============================================================================
interface Vary { value: number; prev: number; delta: number; pct: number; }

interface TxRow {
  id: number; folio: string; fecha: string; sucursal: string; vendedor: string; cliente: string;
  articulos: number; metodo: string; subtotal: number; iva: number; descuento: number; total: number; estado: string;
}

interface SalesData {
  period: { from: string; to: string; prevFrom: string; prevTo: string; days: number };
  kpis: Record<string, Vary>;
  tops: { topVendedor: string; topSucursal: string; metodoPagoPrincipal: string; mejorDia: string };
  series: {
    ventasPorDia: { fecha: string; total: number; tickets: number }[];
    ticketPromedioDiario: { fecha: string; promedio: number }[];
    ventasPorHora: { hour: number; total: number }[];
    metodosPago: { metodo: string; total: number; count: number }[];
    porEstado: { estado: string; count: number; total: number }[];
    ventasPorSucursal: { sucursal: string; total: number; tickets: number }[];
    ventasPorVendedor: { vendedor: string; total: number; tickets: number }[];
  };
  rankings: {
    vendedores: { rank: number; nombre: string; tickets: number; importe: number }[];
    sucursales: { rank: number; nombre: string; tickets: number; importe: number }[];
    dias: { rank: number; nombre: string; tickets: number; importe: number }[];
    metodos: { rank: number; nombre: string; tickets: number; importe: number }[];
  };
  timeframes: { key: string; label: string; actual: number; anterior: number; delta: number; pct: number }[];
  transactions: TxRow[];
  transactionsMeta: { total: number; shown: number; truncated: boolean };
}

interface FilterOptions {
  branches: { id: number; name: string }[];
  sellers: { id: number; name: string; role: string }[];
  categories: { id: number; name: string }[];
  paymentMethods: string[];
}

const isoToday = () => new Date().toISOString().slice(0, 10);
const isoAgo = (d: number) => new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);

type KpiFmt = "money" | "pct" | "int";
const fmtKpi = (fmt: KpiFmt, v: number) => (fmt === "money" ? money(v) : fmt === "pct" ? fmtPct(v) : fmtInt(v));

// Filas por página del anexo de transacciones (denso, A4 con encabezado y pie).
const TX_PER_PAGE = 22;

// ---- Definición de KPIs (icono, formato y polaridad) ----------------------
type KpiDef = { key: string; label: string; icon: any; fmt: KpiFmt; better: boolean };
const KPI_FIN: KpiDef[] = [
  { key: "ventasBrutas", label: "Ventas Brutas", icon: Receipt, fmt: "money", better: true },
  { key: "ventasNetas", label: "Ventas Netas", icon: DollarSign, fmt: "money", better: true },
  { key: "iva", label: "IVA", icon: Landmark, fmt: "money", better: true },
  { key: "descuentos", label: "Descuentos", icon: Tag, fmt: "money", better: false },
  { key: "ticketPromedio", label: "Ticket Promedio", icon: CreditCard, fmt: "money", better: true },
  { key: "ticketMaximo", label: "Ticket Máximo", icon: Coins, fmt: "money", better: true },
  { key: "ventaPromedioDiaria", label: "Venta Promedio Diaria", icon: Gauge, fmt: "money", better: true },
  { key: "ventaCancelada", label: "Venta Cancelada", icon: Ban, fmt: "money", better: false },
];
const KPI_OPER: KpiDef[] = [
  { key: "tickets", label: "Tickets", icon: ShoppingCart, fmt: "int", better: true },
  { key: "articulosVendidos", label: "Artículos Vendidos", icon: Package, fmt: "int", better: true },
  { key: "cancelaciones", label: "Cancelaciones", icon: XCircle, fmt: "int", better: false },
  { key: "devoluciones", label: "Devoluciones", icon: RotateCcw, fmt: "int", better: false },
  { key: "devolucionesMonto", label: "Monto Devuelto", icon: RotateCcw, fmt: "money", better: false },
];
const RESUMEN_ROWS: { key: string; label: string; fmt: KpiFmt; better: boolean }[] = [
  { key: "ventasBrutas", label: "Ventas Brutas", fmt: "money", better: true },
  { key: "ventasNetas", label: "Ventas Netas (sin IVA)", fmt: "money", better: true },
  { key: "iva", label: "IVA", fmt: "money", better: true },
  { key: "descuentos", label: "Descuentos", fmt: "money", better: false },
  { key: "tickets", label: "Tickets", fmt: "int", better: true },
  { key: "ticketPromedio", label: "Ticket Promedio", fmt: "money", better: true },
  { key: "ticketMaximo", label: "Ticket Máximo", fmt: "money", better: true },
  { key: "articulosVendidos", label: "Artículos Vendidos", fmt: "int", better: true },
  { key: "ventaPromedioDiaria", label: "Venta Promedio Diaria", fmt: "money", better: true },
  { key: "cancelaciones", label: "Cancelaciones", fmt: "int", better: false },
  { key: "ventaCancelada", label: "Venta Cancelada", fmt: "money", better: false },
  { key: "devoluciones", label: "Devoluciones", fmt: "int", better: false },
  { key: "devolucionesMonto", label: "Monto Devuelto", fmt: "money", better: false },
];

// ---- Motores de análisis (100% dinámicos — sin texto fijo) ----------------
const B: React.FC<{ children: React.ReactNode }> = ({ children }) => <b>{children}</b>;

function buildInsights(d: SalesData): React.ReactNode[] {
  const k = d.kpis;
  const out: React.ReactNode[] = [];
  const dir = (p: number, up: string, down: string) => (p >= 0 ? up : down);
  out.push(<>Las ventas brutas {dir(k.ventasBrutas.pct, "crecieron", "disminuyeron")} <B>{fmtPct(Math.abs(k.ventasBrutas.pct))}</B> respecto al periodo anterior ({money(k.ventasBrutas.value)} vs. {money(k.ventasBrutas.prev)}).</>);
  out.push(<>Se registraron <B>{fmtInt(k.tickets.value)}</B> tickets con un valor promedio de <B>{money(k.ticketPromedio.value)}</B> ({dir(k.ticketPromedio.pct, "al alza", "a la baja")} {fmtPct(Math.abs(k.ticketPromedio.pct))}).</>);
  if (d.tops.mejorDia !== "—") {
    const best = d.series.ventasPorDia.find((x) => x.fecha === d.tops.mejorDia);
    out.push(<>El día de mayor venta fue <B>{fmtDate(d.tops.mejorDia)}</B>{best ? <> con <B>{money(best.total)}</B> en {fmtInt(best.tickets)} tickets</> : null}.</>);
  }
  const payTotal = d.series.metodosPago.reduce((a, m) => a + m.total, 0);
  if (d.series.metodosPago.length > 0 && payTotal > 0) {
    const top = d.series.metodosPago[0];
    out.push(<>El método de pago predominante fue <B>{top.metodo}</B>, con el <B>{fmtPct((top.total / payTotal) * 100)}</B> del importe cobrado.</>);
  }
  if (d.series.ventasPorVendedor.length > 0) {
    const tot = d.series.ventasPorVendedor.reduce((a, v) => a + v.total, 0);
    const top = d.series.ventasPorVendedor[0];
    out.push(<>El vendedor con mayor venta fue <B>{top.vendedor}</B>, aportando el <B>{fmtPct(tot > 0 ? (top.total / tot) * 100 : 0)}</B> de la venta del periodo.</>);
  }
  if (d.series.ventasPorSucursal.length > 1) {
    const tot = d.series.ventasPorSucursal.reduce((a, b) => a + b.total, 0);
    const top = d.series.ventasPorSucursal[0];
    out.push(<>La sucursal con mayor venta fue <B>{top.sucursal}</B>, concentrando el <B>{fmtPct(tot > 0 ? (top.total / tot) * 100 : 0)}</B> del total.</>);
  }
  if (k.ventasBrutas.value > 0) out.push(<>Los descuentos otorgados representan el <B>{fmtPct((k.descuentos.value / k.ventasBrutas.value) * 100)}</B> de las ventas brutas.</>);
  const ops = k.tickets.value + k.cancelaciones.value;
  if (ops > 0) out.push(<>Las cancelaciones representan el <B>{fmtPct((k.cancelaciones.value / ops) * 100)}</B> de las operaciones del periodo.</>);
  const peak = d.series.ventasPorHora.reduce((m, h) => (h.total > m.total ? h : m), { hour: 0, total: 0 });
  if (peak.total > 0) out.push(<>La hora pico de venta se ubicó entre las <B>{peak.hour}:00 y {peak.hour + 1}:00 h</B>.</>);
  return out;
}

function buildAlerts(d: SalesData): AlertItem[] {
  const k = d.kpis;
  const out: AlertItem[] = [];
  if (k.ventasBrutas.pct < -10) out.push({ tone: "red", text: <>Contracción de ventas: las ventas brutas cayeron <B>{fmtPct(Math.abs(k.ventasBrutas.pct))}</B> vs. el periodo anterior.</> });
  const ops = k.tickets.value + k.cancelaciones.value;
  if (ops > 0 && (k.cancelaciones.value / ops) * 100 > 5) out.push({ tone: "amber", text: <>Cancelaciones elevadas: <B>{fmtPct((k.cancelaciones.value / ops) * 100)}</B> de las operaciones ({fmtInt(k.cancelaciones.value)} de {fmtInt(ops)}).</> });
  if (k.cancelaciones.value > k.cancelaciones.prev && k.cancelaciones.pct > 20) out.push({ tone: "amber", text: <>Incremento de cancelaciones: <B>+{fmtPct(k.cancelaciones.pct)}</B> vs. periodo anterior.</> });
  if (k.devoluciones.value > k.devoluciones.prev && k.devoluciones.pct > 20) out.push({ tone: "amber", text: <>Incremento de devoluciones: <B>+{fmtPct(k.devoluciones.pct)}</B> vs. periodo anterior ({money(k.devolucionesMonto.value)} devueltos).</> });
  if (k.ventasBrutas.value > 0 && (k.descuentos.value / k.ventasBrutas.value) * 100 > 15) out.push({ tone: "amber", text: <>Descuentos elevados: <B>{fmtPct((k.descuentos.value / k.ventasBrutas.value) * 100)}</B> de las ventas brutas. Revisar política de precios.</> });
  const vals = d.series.ventasPorDia.filter((x) => x.total > 0).map((x) => x.total);
  if (vals.length >= 5) {
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    const sd = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length);
    const low = d.series.ventasPorDia.filter((x) => x.total > 0 && x.total < mean - 1.5 * sd);
    if (low.length > 0) out.push({ tone: "amber", text: <><B>{low.length}</B> día(s) con ventas atípicamente bajas: {low.slice(0, 3).map((x) => fmtDate(x.fecha)).join(", ")}.</> });
  }
  const sellers = d.series.ventasPorVendedor;
  if (sellers.length >= 3) {
    const avg = sellers.reduce((s, v) => s + v.total, 0) / sellers.length;
    const lows = sellers.filter((s) => s.total < avg * 0.45);
    if (lows.length > 0) out.push({ tone: "amber", text: <>Vendedores por debajo del 45% del promedio: {lows.slice(0, 3).map((s) => s.vendedor).join(", ")}.</> });
  }
  if (d.transactionsMeta.truncated) out.push({ tone: "amber", text: <>El detalle muestra las <B>{fmtInt(d.transactionsMeta.shown)}</B> transacciones más recientes de <B>{fmtInt(d.transactionsMeta.total)}</B>. Acote el periodo o use Excel para el listado completo.</> });
  if (out.length === 0 && k.ventasBrutas.pct > 5) out.push({ tone: "green", text: <>Desempeño saludable: crecimiento de <B>{fmtPct(k.ventasBrutas.pct)}</B> en ventas sin excepciones operativas relevantes.</> });
  return out;
}

function buildConclusions(d: SalesData): React.ReactNode[] {
  const k = d.kpis;
  const parts: React.ReactNode[] = [];
  parts.push(
    <>Las ventas {k.ventasBrutas.pct >= 0 ? "mantienen una tendencia positiva" : "presentan una contracción"} en el periodo, con {money(k.ventasBrutas.value)} brutos ({k.ventasBrutas.pct >= 0 ? "+" : ""}{fmtPct(k.ventasBrutas.pct)} vs. periodo anterior) distribuidos en {fmtInt(k.tickets.value)} tickets a un promedio de {money(k.ticketPromedio.value)}.</>
  );
  parts.push(
    <>El importe cobrado se compone de {money(k.ventasNetas.value)} de venta neta y {money(k.iva.value)} de IVA, con {money(k.descuentos.value)} en descuentos otorgados.{" "}
      Las cancelaciones {k.cancelaciones.value <= k.cancelaciones.prev ? "disminuyeron" : "aumentaron"} y las devoluciones {k.devoluciones.value <= k.devoluciones.prev ? "disminuyeron" : "aumentaron"} respecto al periodo anterior.</>
  );
  if (d.series.ventasPorSucursal.length > 1) {
    const tot = d.series.ventasPorSucursal.reduce((a, b) => a + b.total, 0);
    const top = d.series.ventasPorSucursal[0];
    parts.push(<>La sucursal {top.sucursal} concentra el mayor volumen ({fmtPct(tot > 0 ? (top.total / tot) * 100 : 0)} del total); el resto de las plazas ofrece espacio de crecimiento.</>);
  }
  if (d.tops.mejorDia !== "—") parts.push(<>El mejor día del periodo fue {fmtDate(d.tops.mejorDia)}; conviene replicar las condiciones comerciales de las jornadas de mayor venta y atender los puntos señalados en la sección de alertas.</>);
  return parts;
}

// Estilo de estado en la tabla de transacciones (verde/rojo/ámbar según texto).
const estadoColor = (estado: string): string => {
  const e = estado.toLowerCase();
  if (e.startsWith("complet")) return "#15803d";
  if (e.startsWith("cancel")) return "#b91c1c";
  return "#b45309";
};

// ============================================================================
// Componente
// ============================================================================
const SalesReport: React.FC<{ branchId: string; branchLabel: string }> = ({ branchId, branchLabel }) => {
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
  const [data, setData] = useState<SalesData | null>(null);
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
      const res = await api.get<SalesData>("/api/admin/reports/sales-report", {
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
      setMeta({ folio: buildFolio("RPT-VTA"), generatedAt: new Date() });
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
  const buildResumenRows = (d: SalesData) =>
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
        name: "Indicadores", title: `Reporte de Ventas · ${periodLabel}`,
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
        name: "Transacciones",
        columns: [
          { header: "Folio", key: "folio", width: 16 },
          { header: "Fecha", key: "fecha", width: 20 },
          { header: "Sucursal", key: "sucursal", width: 18 },
          { header: "Vendedor", key: "vendedor", width: 20 },
          { header: "Cliente", key: "cliente", width: 24 },
          { header: "Artículos", key: "articulos", type: "int" },
          { header: "Método", key: "metodo", width: 14 },
          { header: "Subtotal", key: "subtotal", type: "money" },
          { header: "IVA", key: "iva", type: "money" },
          { header: "Descuento", key: "descuento", type: "money" },
          { header: "Total", key: "total", type: "money" },
          { header: "Estado", key: "estado", width: 14 },
        ],
        rows: data.transactions.map((t) => ({ ...t, fecha: fmtDateTime(t.fecha) })),
        totals: {
          subtotal: data.transactions.reduce((a, t) => a + t.subtotal, 0),
          iva: data.transactions.reduce((a, t) => a + t.iva, 0),
          descuento: data.transactions.reduce((a, t) => a + t.descuento, 0),
          total: data.transactions.reduce((a, t) => a + t.total, 0),
        },
      },
      {
        name: "Métodos de pago",
        columns: [
          { header: "Método", key: "metodo", width: 18 },
          { header: "Operaciones", key: "count", type: "int" },
          { header: "Importe", key: "total", type: "money" },
        ],
        rows: data.series.metodosPago,
      },
      {
        name: "Por vendedor",
        columns: [
          { header: "Vendedor", key: "vendedor", width: 28 },
          { header: "Tickets", key: "tickets", type: "int" },
          { header: "Importe", key: "total", type: "money" },
        ],
        rows: data.series.ventasPorVendedor,
      },
    ];
    exportExcel(`Reporte_Ventas_${from}_${to}`, sheets, {
      Reporte: "Reporte de Ventas",
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
    exportCsv(`Reporte_Ventas_${from}_${to}`, [
      { header: "Folio", key: "folio" },
      { header: "Fecha", key: "fecha" },
      { header: "Sucursal", key: "sucursal" },
      { header: "Vendedor", key: "vendedor" },
      { header: "Cliente", key: "cliente" },
      { header: "Artículos", key: "articulos" },
      { header: "Método", key: "metodo" },
      { header: "Subtotal", key: "subtotal" },
      { header: "IVA", key: "iva" },
      { header: "Descuento", key: "descuento" },
      { header: "Total", key: "total" },
      { header: "Estado", key: "estado" },
    ], data.transactions.map((t) => ({ ...t, fecha: fmtDateTime(t.fecha) })));
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

    const rankingRows = (rows: { rank: number; nombre: string; importe: number; tickets: number }[], label: (r: any) => string): RankingRow[] => {
      const max = rows[0]?.importe || 1;
      return rows.map((r) => ({ rank: r.rank, nombre: r.nombre, valor: money(r.importe), meta: label(r), share: (r.importe / max) * 100 }));
    };
    const resumenRows = RESUMEN_ROWS.map((r) => ({ ...r, v: k[r.key] }));

    // Totales del listado de transacciones (para el pie de la última página).
    const txTotals = {
      subtotal: data.transactions.reduce((a, t) => a + t.subtotal, 0),
      iva: data.transactions.reduce((a, t) => a + t.iva, 0),
      total: data.transactions.reduce((a, t) => a + t.total, 0),
      articulos: data.transactions.reduce((a, t) => a + t.articulos, 0),
    };

    const txColumns = [
      { key: "folio", header: "Folio", render: (t: TxRow) => <span style={{ fontWeight: 700 }}>{t.folio}</span> },
      { key: "fecha", header: "Fecha", render: (t: TxRow) => fmtDateTime(t.fecha) },
      { key: "cliente", header: "Cliente", render: (t: TxRow) => t.cliente },
      { key: "vendedor", header: "Vendedor", render: (t: TxRow) => t.vendedor },
      { key: "metodo", header: "Método", align: "center" as const, render: (t: TxRow) => t.metodo },
      { key: "articulos", header: "Art.", align: "center" as const, render: (t: TxRow) => fmtInt(t.articulos) },
      { key: "subtotal", header: "Subtotal", align: "right" as const, render: (t: TxRow) => money(t.subtotal) },
      { key: "iva", header: "IVA", align: "right" as const, render: (t: TxRow) => money(t.iva) },
      { key: "total", header: "Total", align: "right" as const, render: (t: TxRow) => <span style={{ fontWeight: 700 }}>{money(t.total)}</span> },
      { key: "estado", header: "Estado", align: "center" as const, render: (t: TxRow) => <span style={{ color: estadoColor(t.estado), fontWeight: 800 }}>{t.estado}</span> },
    ];

    // Anexo — detalle de transacciones paginado.
    const txChunks: TxRow[][] = [];
    for (let i = 0; i < data.transactions.length; i += TX_PER_PAGE) txChunks.push(data.transactions.slice(i, i + TX_PER_PAGE));
    const txPages: ReportPageDef[] = txChunks.map((chunk, ci) => {
      const startRow = ci * TX_PER_PAGE + 1;
      const endRow = ci * TX_PER_PAGE + chunk.length;
      const isLast = ci === txChunks.length - 1;
      return {
        id: `tx-${ci}`,
        toc: ci === 0 ? "Detalle de transacciones" : undefined,
        render: (page, dm) => (
          <ReportPage meta={dm} page={page}>
            <SectionTitle
              icon={ListOrdered}
              title="Anexo — Detalle de transacciones"
              sub={`Registros ${fmtInt(startRow)}–${fmtInt(endRow)} de ${fmtInt(data.transactionsMeta.shown)}${data.transactionsMeta.truncated ? ` (de ${fmtInt(data.transactionsMeta.total)} totales)` : ""}`}
            />
            <ReportTable
              rows={chunk}
              keyOf={(t: TxRow) => t.id}
              columns={txColumns}
              total={isLast ? {
                fecha: `${fmtInt(data.transactionsMeta.shown)} transacciones`,
                articulos: fmtInt(txTotals.articulos),
                subtotal: money(txTotals.subtotal),
                iva: money(txTotals.iva),
                total: money(txTotals.total),
              } : undefined}
              totalLabel="TOTALES"
              totalSpan={1}
            />
          </ReportPage>
        ),
      };
    });
    if (txPages.length === 0) {
      txPages.push({
        id: "tx-empty",
        toc: "Detalle de transacciones",
        render: (page, dm) => (
          <ReportPage meta={dm} page={page}>
            <SectionTitle icon={ListOrdered} title="Anexo — Detalle de transacciones" />
            <div className="erp-alert-empty">Sin transacciones en el periodo con los filtros seleccionados.</div>
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
              <div className="erp-cover-kicker">Reporte Operativo</div>
              <div className="erp-cover-title">Reporte<br />de Ventas</div>
              <div className="erp-cover-desc">Análisis detallado de las ventas del periodo: indicadores clave con variación, comparativos, tendencias, hallazgos automáticos, rankings y el detalle completo de las transacciones registradas.</div>
            </div>
            <div className="erp-cover-meta">
              {[
                ["Empresa", COMPANY.legalName],
                ["Reporte", `Reporte de Ventas · Versión ${REPORT_VERSION}`],
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
            <SectionTitle icon={BarChart3} title="Indicadores de venta — Financieros" sub={periodLabel} />
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
            <SectionTitle icon={ShoppingCart} title="Indicadores de venta — Operación" sub={periodLabel} />
            <div className="erp-kpi-grid big">
              {KPI_OPER.map((def) => (
                <KpiCard key={def.key} icon={def.icon} label={def.label} display={fmtKpi(def.fmt, k[def.key].value)} variation={k[def.key]} higherIsBetter={def.better} />
              ))}
            </div>
            <SectionTitle icon={Award} title="Destacados del periodo" />
            <div className="erp-tops" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
              {[
                ["Vendedor con mayores ventas", data.tops.topVendedor],
                ["Sucursal con mayores ventas", data.tops.topSucursal],
                ["Método de pago más utilizado", data.tops.metodoPagoPrincipal],
                ["Día de mayor venta", data.tops.mejorDia !== "—" ? fmtDate(data.tops.mejorDia) : "—"],
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
      // 4 · COMPARATIVO + TABLA RESUMEN
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
            <SectionTitle icon={ClipboardCheck} title="Tabla resumen de ventas" sub="Periodo vs. periodo anterior equivalente" />
            <ReportTable
              rows={resumenRows}
              keyOf={(r: any) => r.key}
              columns={[
                { key: "label", header: "Concepto", render: (r: any) => <span style={{ fontWeight: 700 }}>{r.label}</span> },
                { key: "actual", header: "Periodo actual", align: "right", render: (r: any) => fmtKpi(r.fmt, r.v.value) },
                { key: "anterior", header: "Periodo anterior", align: "right", render: (r: any) => fmtKpi(r.fmt, r.v.prev) },
                { key: "delta", header: "Variación $", align: "right", render: (r: any) => r.fmt === "money" ? `${r.v.delta >= 0 ? "+" : ""}${money(r.v.delta)}` : `${r.v.delta >= 0 ? "+" : ""}${fmtInt(r.v.delta)}` },
                { key: "pct", header: "Variación %", align: "right", render: (r: any) => <span style={{ color: (r.better ? r.v.pct >= 0 : r.v.pct <= 0) ? "#15803d" : "#b91c1c", fontWeight: 800 }}>{r.v.pct >= 0 ? "+" : ""}{r.v.pct.toFixed(1)}%</span> },
                { key: "sem", header: "Semáforo", align: "center", render: (r: any) => <Semaforo pct={r.v.pct} higherIsBetter={r.better} /> },
              ]}
            />
          </ReportPage>
        ),
      },
      // 5 · TENDENCIAS I
      {
        id: "tend-1", toc: "Tendencias",
        render: (page, dm) => (
          <ReportPage meta={dm} page={page}>
            <SectionTitle icon={LineIcon} title="Tendencias — Evolución diaria" sub="Cada gráfica responde una pregunta del negocio" />
            <ChartCard question="¿Cómo evolucionaron las ventas día a día?" sub="Ventas brutas por día del periodo" full>
              <TrendArea data={data.series.ventasPorDia} xKey="fecha" yKey="total" name="Ventas" height={165} formatValue={money} formatLabel={(l) => fmtDate(String(l))} />
            </ChartCard>
            <div style={{ height: 11 }} />
            <ChartCard question="¿Cómo varió el ticket promedio por día?" sub="Importe promedio por ticket" full>
              <TrendLine data={data.series.ticketPromedioDiario} xKey="fecha" yKey="promedio" name="Ticket promedio" height={150} color={CHART.blue} formatValue={money} formatLabel={(l) => fmtDate(String(l))} />
            </ChartCard>
            <div style={{ height: 11 }} />
            <ChartCard question="¿En qué horas se concentra la venta?" sub="Ventas por hora del día" full>
              <VBars data={data.series.ventasPorHora} xKey="hour" yKey="total" name="Ventas" height={150} xInterval={1} formatX={(h) => `${h}h`} formatValue={money} formatLabel={(h) => `${h}:00 h`} />
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
              <DonutCard
                question="¿Qué métodos de pago usan los clientes?"
                sub="Participación por importe · segmentos menores se agrupan en «Otros»"
                data={data.series.metodosPago.map((m) => ({ name: m.metodo, value: m.total, color: payColor(m.metodo) }))}
                format={(v) => money(v)}
                centerTitle="Total"
              />
              <DonutCard
                question="¿Cómo se reparten las operaciones por estado?"
                sub="Completadas, canceladas y devoluciones (por importe)"
                data={data.series.porEstado.map((e, i) => ({ name: e.estado, value: e.total, color: [CAT[2], "#b91c1c", "#b45309"][i] ?? CAT[0] }))}
                format={(v) => money(v)}
                centerTitle="Importe"
              />
              <ChartCard question="¿Qué sucursal vende más?" sub="Ventas por sucursal">
                <HBars data={data.series.ventasPorSucursal.slice(0, 6)} categoryKey="sucursal" valueKey="total" name="Ventas" height={158} barSize={14} formatValue={money} />
              </ChartCard>
              <ChartCard question="¿Quiénes son los vendedores líderes?" sub="Top 8 vendedores por importe">
                <HBars data={data.series.ventasPorVendedor.slice(0, 8)} categoryKey="vendedor" valueKey="total" name="Ventas" height={158} barSize={11} color={CHART.blue} formatValue={money} />
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
            <SectionTitle icon={Trophy} title="Rankings del periodo" sub="Top 10 por importe" />
            <div className="erp-rank-grid">
              <RankingCard icon={UserCheck} title="Top vendedores" rows={rankingRows(data.rankings.vendedores, (r) => `${fmtInt(r.tickets)} tickets`)} />
              <RankingCard icon={Store} title="Top sucursales" rows={rankingRows(data.rankings.sucursales, (r) => `${fmtInt(r.tickets)} tickets`)} />
              <RankingCard icon={CalendarRange} title="Mejores días" rows={rankingRows(data.rankings.dias.map((d) => ({ ...d, nombre: fmtDate(d.nombre) })), (r) => `${fmtInt(r.tickets)} tickets`)} />
              <RankingCard icon={CreditCard} title="Métodos de pago" rows={rankingRows(data.rankings.metodos, (r) => `${fmtInt(r.tickets)} ops`)} />
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
      // 10..N · ANEXO — DETALLE DE TRANSACCIONES
      ...txPages,
    ];

    doc = {
      docMeta: {
        reportTitle: "Reporte de Ventas",
        folio: meta.folio,
        branch: branchDisplay,
        period: periodLabel,
        user: userName,
        filtersLabel,
        generatedAt: meta.generatedAt,
      },
      pages,
      filenameBase: "Reporte_Ventas",
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

export default SalesReport;
