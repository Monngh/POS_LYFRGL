import React, { useEffect, useMemo, useState } from "react";
import {
  DollarSign, Receipt, Percent, Tag, Package, TrendingUp, ShoppingCart, CreditCard,
  Boxes, UserPlus, Users, XCircle, Undo2, Coins, BarChart3, GitCompareArrows,
  LineChart as LineIcon, ListOrdered, FileDown, Printer, Sheet, Award, ClipboardCheck,
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import api from "../../../shared/services/api";
import { useAuth } from "../../../auth";
import { money, fmtDate } from "../shared";
import { COMPANY, ReportLogo, buildFolio } from "./framework/companyInfo";
import {
  ReportPage, SectionTitle, KpiCard, InsightsPanel, AlertsPanel, ChartCard,
  type AlertItem,
} from "./framework/components";
import { exportExcel, exportCsv, printReport, type ExportSheet } from "./framework/exports";
import "./framework/reportTheme.css";

interface Vary { value: number; prev: number; delta: number; pct: number; }
interface SummaryData {
  period: { from: string; to: string; prevFrom: string; prevTo: string };
  kpis: Record<string, Vary>;
  tops: { topVendedor: string; topSucursal: string; topCategoria: string; topProducto: string; metodoPagoPrincipal: string };
  series: {
    ventasPorDia: { fecha: string; total: number }[];
    ventasPorHora: { hour: number; total: number }[];
    ventasPorSucursal: { sucursal: string; total: number }[];
    ventasPorCategoria: { categoria: string; total: number }[];
    metodosPago: { metodo: string; total: number; count: number }[];
    top20Productos: { rank: number; name: string; sku: string; cantidad: number; importe: number; utilidad: number }[];
    topVendedores: { vendedor: string; total: number; tickets: number }[];
    heatmap: { dow: number; hour: number; value: number }[];
  };
}

const BLUES = ["#1e4fa3", "#2563eb", "#60a5fa", "#0b2a5b", "#3b82f6", "#93c5fd", "#1d4ed8", "#bfdbfe"];
const DOW = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const isoToday = () => new Date().toISOString().slice(0, 10);
const isoAgo = (d: number) => new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);
const fmtInt = (n: number) => Math.round(n).toLocaleString("es-MX");
const fmtPct = (n: number) => `${n.toFixed(1)}%`;
const fmtKpi = (fmt: string, v: number) => (fmt === "money" ? money(v) : fmt === "pct" ? fmtPct(v) : fmtInt(v));

const KPI_DEFS: { key: string; label: string; icon: any; fmt: "money" | "pct" | "int"; better: boolean }[] = [
  { key: "ventasNetas", label: "Ventas Netas", icon: DollarSign, fmt: "money", better: true },
  { key: "ventasBrutas", label: "Ventas Brutas", icon: Receipt, fmt: "money", better: true },
  { key: "iva", label: "IVA", icon: Percent, fmt: "money", better: true },
  { key: "descuentos", label: "Descuentos", icon: Tag, fmt: "money", better: false },
  { key: "costo", label: "Costo", icon: Package, fmt: "money", better: false },
  { key: "utilidad", label: "Utilidad", icon: TrendingUp, fmt: "money", better: true },
  { key: "margen", label: "Margen", icon: Coins, fmt: "pct", better: true },
  { key: "tickets", label: "Tickets", icon: ShoppingCart, fmt: "int", better: true },
  { key: "ticketPromedio", label: "Ticket Promedio", icon: CreditCard, fmt: "money", better: true },
  { key: "articulosVendidos", label: "Artículos Vendidos", icon: Boxes, fmt: "int", better: true },
  { key: "clientesNuevos", label: "Clientes Nuevos", icon: UserPlus, fmt: "int", better: true },
  { key: "clientesRecurrentes", label: "Clientes Recurrentes", icon: Users, fmt: "int", better: true },
  { key: "cancelaciones", label: "Cancelaciones", icon: XCircle, fmt: "int", better: false },
  { key: "devoluciones", label: "Devoluciones", icon: Undo2, fmt: "int", better: false },
];

const buildInsights = (d: SummaryData): string[] => {
  const k = d.kpis;
  const out: string[] = [];
  const dir = (p: number) => (p >= 0 ? "crecieron" : "disminuyeron");
  out.push(`Las ventas netas <b>${dir(k.ventasNetas.pct)} ${fmtPct(Math.abs(k.ventasNetas.pct))}</b> respecto al periodo anterior (${money(k.ventasNetas.value)} vs. ${money(k.ventasNetas.prev)}).`);
  out.push(`El ticket promedio ${k.ticketPromedio.pct >= 0 ? "subió" : "bajó"} <b>${fmtPct(Math.abs(k.ticketPromedio.pct))}</b>, ubicándose en ${money(k.ticketPromedio.value)}.`);
  out.push(`La utilidad ${k.utilidad.pct >= 0 ? "aumentó" : "se redujo"} <b>${fmtPct(Math.abs(k.utilidad.pct))}</b> con un margen de <b>${fmtPct(k.margen.value)}</b>.`);
  out.push(`El método de pago más utilizado fue <b>${d.tops.metodoPagoPrincipal}</b>.`);
  out.push(`El producto más vendido fue <b>${d.tops.topProducto}</b>.`);
  out.push(`La sucursal con mayor venta fue <b>${d.tops.topSucursal}</b>; el mejor vendedor, <b>${d.tops.topVendedor}</b>.`);
  const ticketsTotal = k.tickets.value + k.cancelaciones.value;
  const devPct = ticketsTotal > 0 ? (k.devoluciones.value / ticketsTotal) * 100 : 0;
  out.push(`Las devoluciones representan el <b>${fmtPct(devPct)}</b> de las operaciones del periodo.`);
  return out;
};

const buildAlerts = (d: SummaryData): AlertItem[] => {
  const k = d.kpis;
  const out: AlertItem[] = [];
  if (k.ventasNetas.value === 0) out.push({ tone: "amber", text: "No se registraron ventas en el periodo seleccionado." });
  if (k.margen.value < 0 || k.utilidad.value < 0) out.push({ tone: "red", text: `<b>Margen negativo:</b> la utilidad del periodo es ${money(k.utilidad.value)} (margen ${fmtPct(k.margen.value)}). Revisar costos y descuentos.` });
  const ticketsTotal = k.tickets.value + k.cancelaciones.value;
  const cancPct = ticketsTotal > 0 ? (k.cancelaciones.value / ticketsTotal) * 100 : 0;
  if (cancPct > 5) out.push({ tone: "amber", text: `<b>Cancelaciones elevadas:</b> ${fmtInt(k.cancelaciones.value)} operaciones canceladas (${fmtPct(cancPct)} del total).` });
  const devPct = ticketsTotal > 0 ? (k.devoluciones.value / ticketsTotal) * 100 : 0;
  if (devPct > 3) out.push({ tone: "amber", text: `<b>Devoluciones por encima de lo normal:</b> ${fmtPct(devPct)} de las operaciones.` });
  if (k.ventasNetas.pct < -10) out.push({ tone: "red", text: `<b>Caída de ventas:</b> las ventas netas bajaron ${fmtPct(Math.abs(k.ventasNetas.pct))} contra el periodo anterior.` });
  if (k.descuentos.pct > 25) out.push({ tone: "amber", text: `<b>Descuentos en aumento:</b> +${fmtPct(k.descuentos.pct)} vs. periodo anterior; vigilar impacto en margen.` });
  if (out.length === 0 && k.ventasNetas.pct > 10) out.push({ tone: "green", text: `<b>Desempeño positivo:</b> crecimiento de ventas de ${fmtPct(k.ventasNetas.pct)} con margen saludable de ${fmtPct(k.margen.value)}.` });
  return out;
};

const buildConclusions = (d: SummaryData): string => {
  const k = d.kpis;
  const trend = k.ventasNetas.pct >= 0 ? "una tendencia positiva" : "una contracción";
  return (
    `Durante el periodo analizado, el negocio mostró ${trend} en ventas netas (${fmtPct(k.ventasNetas.pct)}), ` +
    `alcanzando ${money(k.ventasNetas.value)} con una utilidad de ${money(k.utilidad.value)} y un margen de ${fmtPct(k.margen.value)}. ` +
    `Se procesaron ${fmtInt(k.tickets.value)} tickets con un valor promedio de ${money(k.ticketPromedio.value)}. ` +
    `La operación se concentró en la sucursal ${d.tops.topSucursal} y en la categoría ${d.tops.topCategoria}, con ${d.tops.metodoPagoPrincipal} como método de pago predominante. ` +
    (k.utilidad.value < 0 || k.ventasNetas.pct < -10
      ? `Se recomienda atención inmediata a los indicadores marcados en la sección de alertas para revertir el deterioro observado.`
      : `Los indicadores se mantienen dentro de parámetros saludables; se recomienda sostener la estrategia comercial y vigilar el nivel de descuentos.`)
  );
};

const ExecutiveSummaryReport: React.FC<{ branchId: string; branchLabel: string }> = ({ branchId, branchLabel }) => {
  const { user } = useAuth();
  const [from, setFrom] = useState(isoAgo(29));
  const [to, setTo] = useState(isoToday());
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ folio: string; generatedAt: Date } | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<SummaryData>("/api/admin/reports/executive-summary", {
        params: { from, to, ...(branchId !== "all" ? { branchId } : {}) },
      });
      setData(res.data);
      setMeta({ folio: buildFolio("RPT-RESUMEN"), generatedAt: new Date() });
    } catch (e: any) {
      setError(e?.response?.data?.message || "No se pudo generar el reporte.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const periodLabel = `${fmtDate(from)} – ${fmtDate(to)}`;
  const userName = user?.name ?? "—";
  const filtersLabel = `${periodLabel} · ${branchLabel}`;

  const insights = useMemo(() => (data ? buildInsights(data) : []), [data]);
  const alerts = useMemo(() => (data ? buildAlerts(data) : []), [data]);

  const onExcel = () => {
    if (!data) return;
    const indicadores: ExportSheet = {
      name: "Indicadores",
      title: `Resumen Ejecutivo · ${periodLabel}`,
      columns: [
        { header: "Indicador", key: "k" },
        { header: "Periodo actual", key: "cur", type: "number" },
        { header: "Periodo anterior", key: "prev", type: "number" },
        { header: "Variación %", key: "pct", type: "number" },
      ],
      rows: KPI_DEFS.map((def) => ({
        k: def.label,
        cur: data.kpis[def.key].value,
        prev: data.kpis[def.key].prev,
        pct: Number(data.kpis[def.key].pct.toFixed(2)),
      })),
    };
    const productos: ExportSheet = {
      name: "Top 20 productos",
      title: "Top 20 productos por importe",
      columns: [
        { header: "#", key: "rank", type: "int", width: 6 },
        { header: "Producto", key: "name", width: 38 },
        { header: "SKU", key: "sku", width: 16 },
        { header: "Cantidad", key: "cantidad", type: "int" },
        { header: "Importe", key: "importe", type: "money" },
        { header: "Utilidad", key: "utilidad", type: "money" },
      ],
      rows: data.series.top20Productos,
      totals: {
        cantidad: data.series.top20Productos.reduce((a, r) => a + r.cantidad, 0),
        importe: data.series.top20Productos.reduce((a, r) => a + r.importe, 0),
        utilidad: data.series.top20Productos.reduce((a, r) => a + r.utilidad, 0),
      },
    };
    exportExcel(`Resumen_Ejecutivo_${from}_${to}`, [indicadores, productos], {
      Reporte: "Resumen Ejecutivo",
      Sucursal: branchLabel,
      Periodo: periodLabel,
      "Generado por": userName,
      Fecha: meta ? meta.generatedAt.toLocaleString("es-MX") : "",
      Folio: meta?.folio ?? "",
    });
  };

  const onCsv = () => {
    if (!data) return;
    exportCsv(
      `Resumen_Ejecutivo_TopProductos_${from}_${to}`,
      [
        { header: "#", key: "rank" },
        { header: "Producto", key: "name" },
        { header: "SKU", key: "sku" },
        { header: "Cantidad", key: "cantidad" },
        { header: "Importe", key: "importe" },
        { header: "Utilidad", key: "utilidad" },
      ],
      data.series.top20Productos,
    );
  };

  // ---- Toolbar (no se imprime) ----
  const toolbar = (
    <div className="erp-toolbar erp-no-print">
      <div className="erp-field">
        <label>Fecha inicial</label>
        <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
      </div>
      <div className="erp-field">
        <label>Fecha final</label>
        <input type="date" value={to} min={from} max={isoToday()} onChange={(e) => setTo(e.target.value)} />
      </div>
      <button className="erp-btn erp-btn-primary" onClick={load} disabled={loading}>
        <BarChart3 size={15} /> {loading ? "Generando..." : "Generar"}
      </button>
      <div className="erp-toolbar-actions">
        <button className="erp-btn erp-btn-ghost" onClick={printReport} disabled={!data}><Printer size={15} /> PDF</button>
        <button className="erp-btn erp-btn-ghost" onClick={onExcel} disabled={!data}><Sheet size={15} /> Excel</button>
        <button className="erp-btn erp-btn-ghost" onClick={onCsv} disabled={!data}><FileDown size={15} /> CSV</button>
      </div>
    </div>
  );

  if (error) return (<div>{toolbar}<div style={{ padding: 24, color: "#b91c1c", fontWeight: 600 }}>{error}</div></div>);
  if (!data || !meta) return (<div>{toolbar}<div style={{ padding: 24, color: "var(--text-muted)" }}>Generando resumen ejecutivo…</div></div>);

  const TOTAL_PAGES = 5;
  const pageMeta = { folio: meta.folio, branch: branchLabel, period: periodLabel };
  const pageProps = (page: number) => ({
    reportTitle: "Resumen Ejecutivo",
    meta: pageMeta,
    page,
    totalPages: TOTAL_PAGES,
    footerUser: userName,
    footerFilters: filtersLabel,
  });

  // Heatmap matriz [dow][hour]
  const heat: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  let heatMax = 0;
  for (const c of data.series.heatmap) { heat[c.dow][c.hour] = c.value; if (c.value > heatMax) heatMax = c.value; }
  const heatColor = (v: number) => (v <= 0 ? "#f1f5f9" : `rgba(37,99,235,${0.12 + 0.88 * (v / (heatMax || 1))})`);

  const k = data.kpis;
  const compRows = [
    { label: "Ventas Netas", fmt: "money" as const, key: "ventasNetas" },
    { label: "Utilidad", fmt: "money" as const, key: "utilidad" },
    { label: "Margen", fmt: "pct" as const, key: "margen" },
    { label: "Tickets", fmt: "int" as const, key: "tickets" },
    { label: "Ticket Promedio", fmt: "money" as const, key: "ticketPromedio" },
    { label: "Artículos Vendidos", fmt: "int" as const, key: "articulosVendidos" },
  ];

  return (
    <div>
      {toolbar}
      <div className="erp-doc">
        {/* ============================== PÁGINA 1 — PORTADA ============================== */}
        <ReportPage {...pageProps(1)} cover>
          <div className="erp-cover-top">
            <ReportLogo size={60} />
            <div>
              <div style={{ fontSize: 18, fontWeight: 900, color: "#0b2a5b" }}>{COMPANY.name}</div>
              <div style={{ fontSize: 11, color: "#5b6b86", fontWeight: 600 }}>{COMPANY.tagline}</div>
            </div>
          </div>

          <div className="erp-cover-band">
            <div className="erp-cover-kicker">Reporte Ejecutivo</div>
            <div className="erp-cover-title">Resumen<br />Ejecutivo</div>
            <div className="erp-cover-desc">
              Indicadores globales del negocio, comparativos contra el periodo anterior, tendencias,
              insights automáticos y alertas para la toma de decisiones gerenciales.
            </div>
          </div>

          <div className="erp-cover-meta">
            {[
              ["Empresa", COMPANY.legalName],
              ["Reporte", "Resumen Ejecutivo de Ventas"],
              ["Fecha de generación", meta.generatedAt.toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" })],
              ["Hora", meta.generatedAt.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })],
              ["Generado por", userName],
              ["Sucursal", branchLabel],
              ["Periodo", periodLabel],
              ["Folio", meta.folio],
            ].map(([label, value]) => (
              <div className="erp-cover-meta-item" key={label}>
                <div className="erp-cover-meta-label">{label}</div>
                <div className="erp-cover-meta-value">{value}</div>
              </div>
            ))}
          </div>
        </ReportPage>

        {/* ============================== PÁGINA 2 — KPIs ============================== */}
        <ReportPage {...pageProps(2)}>
          <SectionTitle icon={BarChart3} title="Indicadores clave (KPIs)" sub={periodLabel} />
          <div className="erp-kpi-grid">
            {KPI_DEFS.map((def) => (
              <KpiCard
                key={def.key}
                icon={def.icon}
                label={def.label}
                display={fmtKpi(def.fmt, data.kpis[def.key].value)}
                variation={data.kpis[def.key]}
                higherIsBetter={def.better}
              />
            ))}
          </div>

          <SectionTitle icon={Award} title="Destacados del periodo" />
          <div className="erp-tops">
            {[
              ["Top sucursal", data.tops.topSucursal],
              ["Top vendedor", data.tops.topVendedor],
              ["Top categoría", data.tops.topCategoria],
              ["Top producto", data.tops.topProducto],
              ["Método de pago", data.tops.metodoPagoPrincipal],
            ].map(([l, v]) => (
              <div className="erp-top" key={l}>
                <div className="erp-top-label">{l}</div>
                <div className="erp-top-value">{v}</div>
              </div>
            ))}
          </div>
        </ReportPage>

        {/* ============================== PÁGINA 3 — COMPARATIVO + ANÁLISIS ============================== */}
        <ReportPage {...pageProps(3)}>
          <SectionTitle icon={GitCompareArrows} title="Comparativo contra periodo anterior" />
          <table className="erp-table">
            <thead>
              <tr>
                <th>Indicador</th>
                <th className="r">Periodo actual</th>
                <th className="r">Periodo anterior</th>
                <th className="r">Diferencia</th>
                <th className="r">Variación %</th>
              </tr>
            </thead>
            <tbody>
              {compRows.map((r) => {
                const v = k[r.key];
                const fmt = (x: number) => (r.fmt === "money" ? money(x) : r.fmt === "pct" ? fmtPct(x) : fmtInt(x));
                const pos = v.pct >= 0;
                return (
                  <tr key={r.key}>
                    <td>{r.label}</td>
                    <td className="r">{fmt(v.value)}</td>
                    <td className="r">{fmt(v.prev)}</td>
                    <td className="r">{fmt(v.delta)}</td>
                    <td className="r" style={{ color: pos ? "#15803d" : "#b91c1c", fontWeight: 800 }}>
                      {pos ? "+" : ""}{v.pct.toFixed(1)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <SectionTitle icon={LineIcon} title="Análisis del periodo" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <InsightsPanel items={insights} />
            <AlertsPanel items={alerts} />
          </div>
        </ReportPage>

        {/* ============================== PÁGINA 4 — TENDENCIAS ============================== */}
        <ReportPage {...pageProps(4)}>
          <SectionTitle icon={LineIcon} title="Tendencias" sub="Cada gráfica responde una pregunta del negocio" />
          <ChartCard question="¿Cómo evolucionaron las ventas día a día?" full>
            <ResponsiveContainer width="100%" height={150}>
              <LineChart data={data.series.ventasPorDia} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e8eef7" />
                <XAxis dataKey="fecha" tick={{ fontSize: 8 }} tickFormatter={(s) => s.slice(5)} minTickGap={18} />
                <YAxis tick={{ fontSize: 8 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} width={38} />
                <Tooltip formatter={(v: any) => money(Number(v))} labelFormatter={(l) => fmtDate(l)} />
                <Line type="monotone" dataKey="total" stroke="#1e4fa3" strokeWidth={2} dot={false} name="Ventas" />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <div className="erp-charts-grid" style={{ marginTop: 12 }}>
            <ChartCard question="¿Qué métodos de pago usan los clientes?">
              <ResponsiveContainer width="100%" height={150}>
                <PieChart>
                  <Pie data={data.series.metodosPago} dataKey="total" nameKey="metodo" cx="50%" cy="50%" outerRadius={58} label={(e: any) => e.metodo}>
                    {data.series.metodosPago.map((_, i) => <Cell key={i} fill={BLUES[i % BLUES.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => money(Number(v))} />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard question="¿Qué sucursal vende más?">
              <ResponsiveContainer width="100%" height={150}>
                <BarChart data={data.series.ventasPorSucursal.slice(0, 8)} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e8eef7" />
                  <XAxis dataKey="sucursal" tick={{ fontSize: 8 }} interval={0} />
                  <YAxis tick={{ fontSize: 8 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} width={38} />
                  <Tooltip formatter={(v: any) => money(Number(v))} />
                  <Bar dataKey="total" fill="#2563eb" radius={[3, 3, 0, 0]} name="Ventas" />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard question="¿Qué categorías generan más ingreso?">
              <ResponsiveContainer width="100%" height={150}>
                <BarChart data={data.series.ventasPorCategoria.slice(0, 8)} layout="vertical" margin={{ top: 4, right: 10, left: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e8eef7" />
                  <XAxis type="number" tick={{ fontSize: 8 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="categoria" tick={{ fontSize: 8 }} width={78} />
                  <Tooltip formatter={(v: any) => money(Number(v))} />
                  <Bar dataKey="total" fill="#1e4fa3" radius={[0, 3, 3, 0]} name="Ingreso" />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard question="¿En qué horas se concentra la venta?">
              <ResponsiveContainer width="100%" height={150}>
                <AreaChart data={data.series.ventasPorHora} margin={{ top: 6, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="erpHora" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#2563eb" stopOpacity={0.55} />
                      <stop offset="100%" stopColor="#2563eb" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e8eef7" />
                  <XAxis dataKey="hour" tick={{ fontSize: 8 }} tickFormatter={(h) => `${h}h`} interval={2} />
                  <YAxis tick={{ fontSize: 8 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} width={38} />
                  <Tooltip formatter={(v: any) => money(Number(v))} labelFormatter={(h) => `${h}:00 h`} />
                  <Area type="monotone" dataKey="total" stroke="#2563eb" strokeWidth={2} fill="url(#erpHora)" name="Ventas" />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        </ReportPage>

        {/* ============================== PÁGINA 5 — DETALLE + CONCLUSIONES ============================== */}
        <ReportPage {...pageProps(5)}>
          <SectionTitle icon={ListOrdered} title="Top 20 productos por importe" />
          <table className="erp-table">
            <thead>
              <tr>
                <th className="c">#</th><th>Producto</th><th>SKU</th>
                <th className="c">Cantidad</th><th className="r">Importe</th><th className="r">Utilidad</th>
              </tr>
            </thead>
            <tbody>
              {data.series.top20Productos.map((p) => (
                <tr key={p.rank}>
                  <td className="c">{p.rank}</td>
                  <td>{p.name}</td>
                  <td>{p.sku}</td>
                  <td className="c">{fmtInt(p.cantidad)}</td>
                  <td className="r">{money(p.importe)}</td>
                  <td className="r">{money(p.utilidad)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}>TOTAL</td>
                <td className="r">{fmtInt(data.series.top20Productos.reduce((a, r) => a + r.cantidad, 0))}</td>
                <td className="r">{money(data.series.top20Productos.reduce((a, r) => a + r.importe, 0))}</td>
                <td className="r">{money(data.series.top20Productos.reduce((a, r) => a + r.utilidad, 0))}</td>
              </tr>
            </tfoot>
          </table>

          <SectionTitle icon={BarChart3} title="Mapa de calor — ventas por hora y día" />
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

          <SectionTitle icon={ClipboardCheck} title="Conclusiones del reporte" />
          <div style={{ fontSize: 12, lineHeight: 1.65, color: "#0f172a", textAlign: "justify", background: "#f7f9fc", border: "1px solid #d8e1f0", borderRadius: 10, padding: "12px 14px" }}>
            {buildConclusions(data)}
          </div>
        </ReportPage>
      </div>
    </div>
  );
};

export default ExecutiveSummaryReport;
