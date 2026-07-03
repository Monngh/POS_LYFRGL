import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3, Boxes, CalendarRange, ClipboardCheck, Coins, CreditCard, DollarSign,
  Download, FileDown, GitCompareArrows, Landmark, LineChart as LineIcon, Package,
  Printer, Receipt, RotateCcw, Settings2, Sheet, ShoppingCart, Store, Tag,
  TrendingUp, Trophy, UserCheck, UserPlus, Users, XCircle, ZoomIn, ZoomOut,
  ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Award, AlertTriangle,
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import api from "../../../shared/services/api";
import { useAuth } from "../../../auth";
import { money, fmtDate } from "../shared";
import { COMPANY, ReportLogo, buildFolio, REPORT_VERSION } from "./framework/companyInfo";
import {
  ReportPage, SectionTitle, KpiCard, Semaforo, InsightsPanel, AlertsPanel,
  ChartCard, DonutCard, RankingCard, type ReportDocMeta, type AlertItem, type RankingRow,
} from "./framework/components";
import { exportExcel, exportCsv, printReport, downloadPdfFromPages, type ExportSheet } from "./framework/exports";
import "./framework/reportTheme.css";

// ============================================================================
// Tipos de la respuesta del backend
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

// ============================================================================
// Paleta y formato (paleta categórica validada con dataviz — orden fijo)
// ============================================================================
const CAT = ["#2563eb", "#c2410c", "#0d9488", "#be185d", "#7c3aed"];
const OTHER_GRAY = "#94a3b8";
const BLUE = "#2563eb";
const NAVY_SERIES = "#1e4fa3";
const GRID = "#e8eef7";
const TICK = { fontSize: 8, fill: "#5b6b86" } as const;

// El color sigue a la entidad (método de pago), nunca a su posición.
const PAY_ORDER = ["EFECTIVO", "TARJETA", "QR", "MERCADOPAGO", "MIXTO", "CREDITO", "PUNTOS"];
const payColor = (metodo: string): string => {
  const idx = PAY_ORDER.findIndex((m) => metodo.toUpperCase().includes(m));
  if (idx === -1) return OTHER_GRAY;
  return CAT[Math.min(idx, 4) % CAT.length];
};

const DOW = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const isoToday = () => new Date().toISOString().slice(0, 10);
const isoAgo = (d: number) => new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);
const fmtInt = (n: number) => Math.round(n).toLocaleString("es-MX");
const fmtPct = (n: number) => `${n.toFixed(1)}%`;
const kMoney = (v: number) => (Math.abs(v) >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v.toFixed(0)}`);
const shortDay = (s: string) => s.slice(5).replace("-", "/");

// ============================================================================
// Definición de KPIs (icono, formato y polaridad)
// ============================================================================
type KpiFmt = "money" | "pct" | "int";
const fmtKpi = (fmt: KpiFmt, v: number) => (fmt === "money" ? money(v) : fmt === "pct" ? fmtPct(v) : fmtInt(v));

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

// ============================================================================
// Motores de análisis (100% dinámicos — sin texto fijo)
// ============================================================================
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

  // Días de venta atípicamente baja (media − 1.5σ sobre días con venta)
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
// Componente principal
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

  // ---- Vista previa ----
  const [zoom, setZoom] = useState(1);
  const [manualZoom, setManualZoom] = useState(false);
  const [current, setCurrent] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    api.get<FilterOptions>("/api/admin/reports/filter-options").then((r) => setOptions(r.data)).catch(() => {});
  }, []);
  useEffect(() => { setFBranch(branchId); }, [branchId]);

  // Zoom automático al ancho disponible (responsive 1024–1920); el usuario
  // puede fijarlo manualmente con los botones +/− hasta regenerar.
  const fitZoom = useCallback(() => {
    const w = scrollRef.current?.clientWidth ?? 0;
    if (w > 0) setZoom(Math.min(1, Math.max(0.55, Math.floor(((w - 44) / 794) * 100) / 100)));
  }, []);
  useEffect(() => {
    if (!data || manualZoom || capturing) return;
    fitZoom();
    const onResize = () => fitZoom();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [data, manualZoom, capturing, fitZoom]);

  // Página visible según el scroll del visor (resalta el índice lateral).
  const onDocScroll = () => {
    const cont = scrollRef.current;
    if (!cont) return;
    const top = cont.getBoundingClientRect().top;
    let idx = 0;
    pageRefs.current.forEach((el, i) => {
      if (el && el.getBoundingClientRect().top - top <= 150) idx = i;
    });
    setCurrent(idx);
  };

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
      setCurrent(0);
      setManualZoom(false);
      scrollRef.current?.scrollTo({ top: 0 });
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

  // ---- Descarga directa de PDF (alta resolución, mismo diseño) ----
  const onDownloadPdf = async () => {
    if (downloading) return;
    setDownloading(true);
    const prevZoom = zoom;
    const prevManual = manualZoom;
    // Captura a escala real (zoom 1) y sin sombras de página.
    setManualZoom(true);
    setZoom(1);
    setCapturing(true);
    await new Promise((r) => setTimeout(r, 450));
    try {
      const els = pageRefs.current
        .map((w) => (w?.querySelector(".erp-page") as HTMLElement | null))
        .filter((x): x is HTMLElement => !!x);
      await downloadPdfFromPages(els, `Reporte_Ejecutivo_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch {
      setError(null); // la impresión nativa queda como alternativa
    } finally {
      setCapturing(false);
      setZoom(prevZoom);
      setManualZoom(prevManual);
      setDownloading(false);
    }
  };

  // ---- Navegación de páginas ----
  const goPage = (i: number, total: number) => {
    const idx = Math.max(0, Math.min(total - 1, i));
    setCurrent(idx);
    pageRefs.current[idx]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // ==========================================================================
  // Render
  // ==========================================================================
  const sel = (v: string, set: (s: string) => void, opts: { value: string; label: string }[], all: string) => (
    <select value={v} onChange={(e) => set(e.target.value)}>
      <option value="">{all}</option>
      {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );

  const configPanel = (
    <div className="erp-config erp-no-print">
      <div className={`erp-config-head${configOpen ? " open" : ""}`}>
        <div className="erp-config-title">
          <span className="ico"><Settings2 size={16} /></span>
          Configuración del reporte
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {data && (
            <button className="erp-btn erp-btn-ghost erp-btn-icon" onClick={() => setConfigOpen(!configOpen)} title={configOpen ? "Contraer" : "Expandir"}>
              {configOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>
          )}
        </div>
      </div>
      {configOpen && (
        <>
          <div className="erp-config-grid">
            <div className="erp-field"><label>Fecha inicial</label><input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></div>
            <div className="erp-field"><label>Fecha final</label><input type="date" value={to} min={from} max={isoToday()} onChange={(e) => setTo(e.target.value)} /></div>
            <div className="erp-field"><label>Sucursal</label>
              <select value={fBranch} onChange={(e) => setFBranch(e.target.value)}>
                <option value="all">Todas las sucursales</option>
                {branchOptions.map((b) => <option key={b.id} value={String(b.id)}>{b.name}</option>)}
              </select>
            </div>
            <div className="erp-field"><label>Vendedor / Usuario</label>
              {sel(fSeller, setFSeller, (options?.sellers ?? []).map((s) => ({ value: String(s.id), label: s.name })), "Todos")}
            </div>
            <div className="erp-field"><label>Categoría</label>
              {sel(fCategory, setFCategory, (options?.categories ?? []).map((c) => ({ value: String(c.id), label: c.name })), "Todas")}
            </div>
            <div className="erp-field"><label>Método de pago</label>
              {sel(fPay, setFPay, (options?.paymentMethods ?? []).map((m) => ({ value: m, label: m })), "Todos")}
            </div>
            <div className="erp-field"><label>Estado</label>
              {sel(fStatus, setFStatus, [{ value: "COMPLETADA", label: "Completadas" }, { value: "CANCELADA", label: "Canceladas" }], "Todos")}
            </div>
            <div className="erp-field"><label>Caja (ID sesión)</label><input type="number" min={1} value={fCash} onChange={(e) => setFCash(e.target.value)} placeholder="Todas" /></div>
            <div className="erp-field"><label>Cliente</label><input type="text" maxLength={80} value={fCustomer} onChange={(e) => setFCustomer(e.target.value)} placeholder="Nombre o teléfono" /></div>
            <div className="erp-field"><label>Producto</label><input type="text" maxLength={80} value={fProduct} onChange={(e) => setFProduct(e.target.value)} placeholder="Nombre o SKU" /></div>
            <div className="erp-field"><label>Buscar por texto</label><input type="text" maxLength={80} value={fSearch} onChange={(e) => setFSearch(e.target.value)} placeholder="Folio, producto, cliente…" /></div>
          </div>
          <div className="erp-config-actions">
            <button
              className="erp-btn erp-btn-ghost"
              onClick={() => { setFSeller(""); setFCategory(""); setFPay(""); setFStatus(""); setFCash(""); setFCustomer(""); setFProduct(""); setFSearch(""); }}
            >
              Limpiar filtros
            </button>
            <button className="erp-btn erp-btn-primary" onClick={generate} disabled={loading}>
              <BarChart3 size={15} /> {loading ? "Generando…" : data ? "Regenerar reporte" : "Generar reporte"}
            </button>
          </div>
        </>
      )}
    </div>
  );

  if (error) return <div>{configPanel}<div className="erp-empty" style={{ color: "#b91c1c" }}>{error}</div></div>;
  if (!data || !meta) {
    return (
      <div>
        {configPanel}
        <div className="erp-empty">
          {loading ? "Generando el resumen ejecutivo…" : "Configure los filtros y presione «Generar reporte» para obtener la vista previa del documento."}
        </div>
      </div>
    );
  }

  // ---- Documento ----
  const k = data.kpis;
  const heat: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  let heatMax = 0;
  for (const c of data.series.heatmap) { heat[c.dow][c.hour] = c.value; if (c.value > heatMax) heatMax = c.value; }
  const heatColor = (v: number) => (v <= 0 ? "#f1f5f9" : `rgba(37, 99, 235, ${(0.12 + 0.88 * (v / (heatMax || 1))).toFixed(3)})`);

  const rankingRows = (rows: { rank: number; nombre: string; importe: number }[], meta2?: (r: any) => string): RankingRow[] => {
    const max = rows[0]?.importe || 1;
    return rows.map((r: any) => ({ rank: r.rank, nombre: r.nombre, valor: money(r.importe), meta: meta2 ? meta2(r) : undefined, share: (r.importe / max) * 100 }));
  };

  interface PageDef { id: string; toc?: string; render: (page: number, docMeta: ReportDocMeta) => React.ReactNode; }
  const pages: PageDef[] = [
    // ------------------------------------------------ 1 · PORTADA
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
    // ------------------------------------------------ 2 · KPIs FINANCIEROS
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
    // ------------------------------------------------ 3 · KPIs OPERACIÓN + DESTACADOS
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
    // ------------------------------------------------ 4 · COMPARATIVO
    {
      id: "comparativo", toc: "Comparativo",
      render: (page, dm) => (
        <ReportPage meta={dm} page={page}>
          <SectionTitle icon={GitCompareArrows} title="Comparativo contra periodos anteriores" sub="Ventas completadas" />
          <table className="erp-table">
            <thead>
              <tr>
                <th>Marco temporal</th><th className="r">Actual</th><th className="r">Anterior</th>
                <th className="r">Diferencia $</th><th className="r">Variación %</th><th className="c">Semáforo</th>
              </tr>
            </thead>
            <tbody>
              {data.timeframes.map((t) => (
                <tr key={t.key}>
                  <td style={{ fontWeight: 700 }}>{t.label}</td>
                  <td className="r">{money(t.actual)}</td>
                  <td className="r">{money(t.anterior)}</td>
                  <td className="r">{t.delta >= 0 ? "+" : ""}{money(t.delta)}</td>
                  <td className="r" style={{ color: t.pct >= 0 ? "#15803d" : "#b91c1c", fontWeight: 800 }}>{t.pct >= 0 ? "▲ +" : "▼ "}{t.pct.toFixed(1)}%</td>
                  <td className="c"><Semaforo pct={t.pct} /></td>
                </tr>
              ))}
            </tbody>
          </table>

          <SectionTitle icon={ClipboardCheck} title="Tabla resumen ejecutiva" sub="Periodo vs. periodo anterior equivalente" />
          <table className="erp-table">
            <thead>
              <tr>
                <th>Concepto</th><th className="r">Periodo actual</th><th className="r">Periodo anterior</th>
                <th className="r">Variación $</th><th className="r">Variación %</th><th className="c">Semáforo</th>
              </tr>
            </thead>
            <tbody>
              {RESUMEN_ROWS.map((r) => {
                const v = k[r.key];
                return (
                  <tr key={r.key}>
                    <td style={{ fontWeight: 700 }}>{r.label}</td>
                    <td className="r">{fmtKpi(r.fmt, v.value)}</td>
                    <td className="r">{fmtKpi(r.fmt, v.prev)}</td>
                    <td className="r">{r.fmt === "money" ? `${v.delta >= 0 ? "+" : ""}${money(v.delta)}` : `${v.delta >= 0 ? "+" : ""}${r.fmt === "pct" ? v.delta.toFixed(1) + " pp" : fmtInt(v.delta)}`}</td>
                    <td className="r" style={{ color: (r.better ? v.pct >= 0 : v.pct <= 0) ? "#15803d" : "#b91c1c", fontWeight: 800 }}>{v.pct >= 0 ? "+" : ""}{v.pct.toFixed(1)}%</td>
                    <td className="c"><Semaforo pct={v.pct} higherIsBetter={r.better} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ReportPage>
      ),
    },
    // ------------------------------------------------ 5 · TENDENCIAS I
    {
      id: "tend-1", toc: "Tendencias",
      render: (page, dm) => (
        <ReportPage meta={dm} page={page}>
          <SectionTitle icon={LineIcon} title="Tendencias — Evolución diaria" sub="Cada gráfica responde una pregunta del negocio" />
          <ChartCard question="¿Cómo evolucionaron las ventas día a día?" sub="Ventas brutas por día del periodo" full>
            <ResponsiveContainer width="100%" height={165}>
              <AreaChart data={data.series.ventasPorDia} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gVentas" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={BLUE} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={BLUE} stopOpacity={0.04} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                <XAxis dataKey="fecha" tick={TICK} tickFormatter={shortDay} minTickGap={20} axisLine={false} tickLine={false} />
                <YAxis tick={TICK} tickFormatter={kMoney} width={40} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v: any) => [money(Number(v)), "Ventas"]} labelFormatter={(l) => fmtDate(String(l))} />
                <Area type="monotone" dataKey="total" stroke={BLUE} strokeWidth={2} fill="url(#gVentas)" dot={false} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>
          <div style={{ height: 11 }} />
          <ChartCard question="¿Cómo se comportó la utilidad diaria?" sub="Utilidad bruta estimada por día (venta − costo)" full>
            <ResponsiveContainer width="100%" height={150}>
              <LineChart data={data.series.utilidadDiaria} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                <XAxis dataKey="fecha" tick={TICK} tickFormatter={shortDay} minTickGap={20} axisLine={false} tickLine={false} />
                <YAxis tick={TICK} tickFormatter={kMoney} width={40} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v: any) => [money(Number(v)), "Utilidad"]} labelFormatter={(l) => fmtDate(String(l))} />
                <Line type="monotone" dataKey="utilidad" stroke={NAVY_SERIES} strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
          <div style={{ height: 11 }} />
          <ChartCard question="¿Cómo varió el ticket promedio por día?" sub="Importe promedio por ticket" full>
            <ResponsiveContainer width="100%" height={150}>
              <LineChart data={data.series.ticketPromedioDiario} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                <XAxis dataKey="fecha" tick={TICK} tickFormatter={shortDay} minTickGap={20} axisLine={false} tickLine={false} />
                <YAxis tick={TICK} tickFormatter={kMoney} width={40} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v: any) => [money(Number(v)), "Ticket promedio"]} labelFormatter={(l) => fmtDate(String(l))} />
                <Line type="monotone" dataKey="promedio" stroke={BLUE} strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </ReportPage>
      ),
    },
    // ------------------------------------------------ 6 · TENDENCIAS II
    {
      id: "tend-2",
      render: (page, dm) => (
        <ReportPage meta={dm} page={page}>
          <SectionTitle icon={BarChart3} title="Tendencias — Estructura de la venta" />
          <div className="erp-charts-grid">
            <ChartCard question="¿En qué horas se concentra la venta?" sub="Ventas por hora del día">
              <ResponsiveContainer width="100%" height={158}>
                <BarChart data={data.series.ventasPorHora} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                  <XAxis dataKey="hour" tick={TICK} tickFormatter={(h) => `${h}h`} interval={2} axisLine={false} tickLine={false} />
                  <YAxis tick={TICK} tickFormatter={kMoney} width={38} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v: any) => [money(Number(v)), "Ventas"]} labelFormatter={(h) => `${h}:00 h`} />
                  <Bar dataKey="total" fill={BLUE} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard question="¿Qué sucursal vende más?" sub="Ventas por sucursal">
              <ResponsiveContainer width="100%" height={158}>
                <BarChart data={data.series.ventasPorSucursal.slice(0, 6)} layout="vertical" margin={{ top: 2, right: 12, left: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
                  <XAxis type="number" tick={TICK} tickFormatter={kMoney} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="sucursal" tick={{ ...TICK, fontSize: 8 }} width={86} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v: any) => [money(Number(v)), "Ventas"]} />
                  <Bar dataKey="total" fill={NAVY_SERIES} radius={[0, 3, 3, 0]} barSize={14} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard question="¿Qué categorías generan más ingreso?" sub="Top 8 categorías por importe">
              <ResponsiveContainer width="100%" height={158}>
                <BarChart data={data.series.ventasPorCategoria.slice(0, 8)} layout="vertical" margin={{ top: 2, right: 12, left: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
                  <XAxis type="number" tick={TICK} tickFormatter={kMoney} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="categoria" tick={{ ...TICK, fontSize: 8 }} width={86} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v: any) => [money(Number(v)), "Importe"]} />
                  <Bar dataKey="total" fill={BLUE} radius={[0, 3, 3, 0]} barSize={11} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard question="¿Quiénes son los vendedores líderes?" sub="Top 8 vendedores por importe">
              <ResponsiveContainer width="100%" height={158}>
                <BarChart data={data.series.ventasPorVendedor.slice(0, 8)} layout="vertical" margin={{ top: 2, right: 12, left: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
                  <XAxis type="number" tick={TICK} tickFormatter={kMoney} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="vendedor" tick={{ ...TICK, fontSize: 8 }} width={86} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v: any) => [money(Number(v)), "Ventas"]} />
                  <Bar dataKey="total" fill={NAVY_SERIES} radius={[0, 3, 3, 0]} barSize={11} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        </ReportPage>
      ),
    },
    // ------------------------------------------------ 7 · TENDENCIAS III
    {
      id: "tend-3",
      render: (page, dm) => {
        return (
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
              <ResponsiveContainer width="100%" height={235}>
                <BarChart data={data.rankings.productos} layout="vertical" margin={{ top: 2, right: 14, left: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
                  <XAxis type="number" tick={TICK} tickFormatter={kMoney} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="nombre" tick={{ ...TICK, fontSize: 7.5 }} width={128} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v: any) => [money(Number(v)), "Importe"]} />
                  <Bar dataKey="importe" fill={BLUE} radius={[0, 3, 3, 0]} barSize={12} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </ReportPage>
        );
      },
    },
    // ------------------------------------------------ 8 · TENDENCIAS IV
    {
      id: "tend-4",
      render: (page, dm) => (
        <ReportPage meta={dm} page={page}>
          <SectionTitle icon={XCircle} title="Tendencias — Cancelaciones, devoluciones y actividad" />
          <div className="erp-charts-grid">
            <ChartCard question="¿Cuándo ocurren las cancelaciones?" sub="Cancelaciones por día">
              <ResponsiveContainer width="100%" height={140}>
                <BarChart data={data.series.cancelacionesPorDia} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                  <XAxis dataKey="fecha" tick={TICK} tickFormatter={shortDay} minTickGap={24} axisLine={false} tickLine={false} />
                  <YAxis tick={TICK} allowDecimals={false} width={26} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v: any) => [fmtInt(Number(v)), "Cancelaciones"]} labelFormatter={(l) => fmtDate(String(l))} />
                  <Bar dataKey="cantidad" fill={BLUE} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard question="¿Cuándo ocurren las devoluciones?" sub="Devoluciones por día">
              <ResponsiveContainer width="100%" height={140}>
                <BarChart data={data.series.devolucionesPorDia} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                  <XAxis dataKey="fecha" tick={TICK} tickFormatter={shortDay} minTickGap={24} axisLine={false} tickLine={false} />
                  <YAxis tick={TICK} allowDecimals={false} width={26} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v: any) => [fmtInt(Number(v)), "Devoluciones"]} labelFormatter={(l) => fmtDate(String(l))} />
                  <Bar dataKey="cantidad" fill={NAVY_SERIES} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
          <SectionTitle icon={CalendarRange} title="Mapa de calor — ¿Qué días y horas concentran la venta?" />
          <div className="erp-heat">
            <div />
            {Array.from({ length: 24 }, (_, h) => (
              <div className="erp-heat-axis" key={h} style={{ justifyContent: "center" }}>{h % 2 === 0 ? h : ""}</div>
            ))}
            {heat.map((row, dow) => (
              <React.Fragment key={dow}>
                <div className="erp-heat-axis">{DOW[dow]}</div>
                {row.map((v, h) => (
                  <div className="erp-heat-cell" key={h} style={{ background: heatColor(v) }} title={`${DOW[dow]} ${h}:00 — ${money(v)}`} />
                ))}
              </React.Fragment>
            ))}
          </div>
          <div className="erp-heat-legend">
            Menor
            {[0.12, 0.34, 0.56, 0.78, 1].map((a) => (
              <span className="step" key={a} style={{ background: `rgba(37,99,235,${a})` }} />
            ))}
            Mayor venta
          </div>
        </ReportPage>
      ),
    },
    // ------------------------------------------------ 9 · HALLAZGOS + ALERTAS
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
    // ------------------------------------------------ 10 · RANKINGS
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
    // ------------------------------------------------ 11 · CLIENTES + CONCLUSIONES
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

  const docMeta: ReportDocMeta = {
    reportTitle: "Resumen Ejecutivo de Ventas",
    folio: meta.folio,
    branch: branchDisplay,
    period: periodLabel,
    user: userName,
    filtersLabel,
    generatedAt: meta.generatedAt,
    totalPages: pages.length,
  };

  const tocEntries = pages
    .map((p, i) => ({ label: p.toc, index: i }))
    .filter((p): p is { label: string; index: number } => !!p.label);
  const activeToc = [...tocEntries].reverse().find((t) => t.index <= current)?.index ?? 0;

  return (
    <div className={`erp-doc${capturing ? " erp-capturing" : ""}`}>
      {configPanel}

      {/* Barra de la vista previa */}
      <div className="erp-previewbar erp-no-print">
        <button className="erp-btn erp-btn-ghost erp-btn-icon" onClick={() => { setManualZoom(true); setZoom((z) => Math.max(0.55, +(z - 0.1).toFixed(2))); }} title="Alejar"><ZoomOut size={15} /></button>
        <span style={{ fontSize: 12, fontWeight: 800, color: "var(--text-secondary)", minWidth: 42, textAlign: "center" }}>{Math.round(zoom * 100)}%</span>
        <button className="erp-btn erp-btn-ghost erp-btn-icon" onClick={() => { setManualZoom(true); setZoom((z) => Math.min(1.4, +(z + 0.1).toFixed(2))); }} title="Acercar"><ZoomIn size={15} /></button>
        <div className="sep" />
        <button className="erp-btn erp-btn-ghost erp-btn-icon" onClick={() => goPage(current - 1, pages.length)} title="Página anterior"><ChevronLeft size={15} /></button>
        <span className="erp-pageind">Página {current + 1} de {pages.length}</span>
        <button className="erp-btn erp-btn-ghost erp-btn-icon" onClick={() => goPage(current + 1, pages.length)} title="Página siguiente"><ChevronRight size={15} /></button>
        <div className="erp-toolbar-actions" style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="erp-btn erp-btn-primary" onClick={onDownloadPdf} disabled={downloading}>
            <Download size={15} /> {downloading ? "Generando PDF…" : "Descargar PDF"}
          </button>
          <button className="erp-btn erp-btn-ghost" onClick={printReport} title="Imprimir o guardar como PDF con texto seleccionable"><Printer size={15} /> Imprimir</button>
          <button className="erp-btn erp-btn-ghost" onClick={onExcel}><Sheet size={15} /> Excel</button>
          <button className="erp-btn erp-btn-ghost" onClick={onCsv}><FileDown size={15} /> CSV</button>
        </div>
      </div>

      <div className="erp-shell">
        {/* Índice lateral */}
        <nav className="erp-toc erp-no-print">
          <div className="erp-toc-title">Contenido del reporte</div>
          {tocEntries.map((t, n) => (
            <button key={t.index} className={`erp-toc-item${t.index === activeToc ? " active" : ""}`} onClick={() => goPage(t.index, pages.length)}>
              <span className="erp-toc-num">{n + 1}</span>
              {t.label}
            </button>
          ))}
        </nav>

        {/* Documento — visor con scroll vertical propio */}
        <div className="erp-main">
          <div className="erp-doc-scroll" ref={scrollRef} onScroll={onDocScroll}>
            <div className="erp-zoom" style={{ zoom } as React.CSSProperties}>
              {pages.map((p, i) => (
                <div key={p.id} ref={(el) => { pageRefs.current[i] = el; }}>
                  {p.render(i + 1, docMeta)}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExecutiveSummaryReport;
