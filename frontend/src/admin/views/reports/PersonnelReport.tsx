import React, { useEffect, useMemo, useState } from "react";
import {
  BarChart3, ClipboardCheck, CreditCard, GitCompareArrows, ListOrdered,
  RotateCcw, ShoppingCart, Tag, TrendingUp, Trophy, Award, AlertTriangle, XCircle,
  UserCheck, Users, DollarSign, Coins,
} from "lucide-react";
import api from "../../../shared/services/api";
import { useAuth } from "../../../auth";
import { money, fmtDate } from "../shared";
import {
  COMPANY, ReportLogo, buildFolio, REPORT_VERSION,
  ReportPage, SectionTitle, KpiCard, Semaforo, InsightsPanel, AlertsPanel,
  ChartCard, DonutCard, RankingCard, ReportField,
  ReportTable, ReportShell, ReportConfigPanel,
  HBars, CAT, CHART,
  fmtInt, fmtPct,
  exportExcel, exportCsv,
  type AlertItem, type RankingRow, type ReportPageDef, type ReportDocBundle, type ExportSheet,
} from "./framework";

// ============================================================================
// REPORTE DE PERSONAL — componente compartido por «Operaciones del vendedor»
// (variant="operaciones") y «Ventas por usuario» (variant="usuario"). Ambos
// consumen el mismo endpoint y heredan la plantilla maestra; solo cambia el
// énfasis (KPIs, columnas del detalle y textos).
// ============================================================================
type Variant = "operaciones" | "usuario";

interface Vary { value: number; prev: number; delta: number; pct: number; }
interface SellerRow {
  userId: number; name: string; role: string; branch: string; ventasCount: number; totalVendido: number;
  descuentos: number; canceladas: number; devolucionesCount: number; devolucionesMonto: number;
  ticketPromedio: number; comision: number; tasaCancelacion: number; tasaDevolucion: number;
}

interface PersonnelData {
  period: { from: string; to: string; prevFrom: string; prevTo: string; days: number };
  kpis: Record<string, Vary>;
  tops: { topVendedor: string; topTickets: string; topComision: string };
  series: {
    ventasPorVendedor: { vendedor: string; total: number; tickets: number }[];
    ticketsPorVendedor: { vendedor: string; tickets: number; total: number }[];
    comisionPorVendedor: { vendedor: string; comision: number; total: number }[];
  };
  rankings: {
    importe: { rank: number; nombre: string; tickets: number; importe: number }[];
    tickets: { rank: number; nombre: string; tickets: number; importe: number }[];
    comision: { rank: number; nombre: string; tickets: number; importe: number }[];
    devoluciones: { rank: number; nombre: string; tickets: number; importe: number }[];
  };
  sellers: SellerRow[];
  sellersMeta: { total: number };
  alertsData: { altaCancelacion: { nombre: string; tasa: number }[]; altaDevolucion: { nombre: string; tasa: number }[]; sinVentas: number };
}

interface FilterOptions { branches: { id: number; name: string }[]; }

const isoToday = () => new Date().toISOString().slice(0, 10);
const isoAgo = (d: number) => new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);
const ROWS_PER_PAGE = 24;

type KpiFmt = "money" | "int" | "pct";
const fmtKpi = (fmt: KpiFmt, v: number) => (fmt === "money" ? money(v) : fmt === "pct" ? fmtPct(v) : fmtInt(v));
const deltaText = (fmt: KpiFmt, d: number) => `${d >= 0 ? "+" : ""}${fmt === "money" ? money(d) : fmt === "pct" ? d.toFixed(1) + " pp" : fmtInt(d)}`;

type KpiDef = { key: string; label: string; icon: any; fmt: KpiFmt; better: boolean };
const KPI_OPER: KpiDef[] = [
  { key: "vendedoresActivos", label: "Vendedores Activos", icon: UserCheck, fmt: "int", better: true },
  { key: "totalVendido", label: "Total Vendido", icon: DollarSign, fmt: "money", better: true },
  { key: "tickets", label: "Ventas (Tickets)", icon: ShoppingCart, fmt: "int", better: true },
  { key: "comision", label: "Comisión Generada", icon: Coins, fmt: "money", better: true },
  { key: "cancelaciones", label: "Cancelaciones", icon: XCircle, fmt: "int", better: false },
  { key: "devoluciones", label: "Devoluciones", icon: RotateCcw, fmt: "int", better: false },
];
const KPI_USER: KpiDef[] = [
  { key: "usuarios", label: "Usuarios", icon: Users, fmt: "int", better: true },
  { key: "totalVendido", label: "Importe Vendido", icon: DollarSign, fmt: "money", better: true },
  { key: "tickets", label: "Tickets", icon: ShoppingCart, fmt: "int", better: true },
  { key: "ticketPromedio", label: "Ticket Promedio", icon: CreditCard, fmt: "money", better: true },
  { key: "descuentos", label: "Descuentos", icon: Tag, fmt: "money", better: false },
  { key: "devoluciones", label: "Devoluciones", icon: RotateCcw, fmt: "int", better: false },
];
const RESUMEN_ROWS: { key: string; label: string; fmt: KpiFmt; better: boolean }[] = [
  { key: "totalVendido", label: "Total Vendido", fmt: "money", better: true },
  { key: "tickets", label: "Tickets", fmt: "int", better: true },
  { key: "ticketPromedio", label: "Ticket Promedio", fmt: "money", better: true },
  { key: "vendedoresActivos", label: "Vendedores Activos", fmt: "int", better: true },
  { key: "comision", label: "Comisión Generada", fmt: "money", better: true },
  { key: "descuentos", label: "Descuentos", fmt: "money", better: false },
  { key: "cancelaciones", label: "Cancelaciones", fmt: "int", better: false },
  { key: "devoluciones", label: "Devoluciones", fmt: "int", better: false },
  { key: "devolucionesMonto", label: "Monto Devuelto", fmt: "money", better: false },
];

const CFG: Record<Variant, { title: string; kicker: string; coverTitle: React.ReactNode; desc: string; folio: string; filename: string; kpis: KpiDef[]; noun: string }> = {
  operaciones: {
    title: "Operaciones del Vendedor", kicker: "Reporte de Personal",
    coverTitle: <>Operaciones<br />del Vendedor</>,
    desc: "Análisis de la actividad de los vendedores en el periodo: ventas, comisión generada, cancelaciones y devoluciones por persona, con variación, rankings, alertas de desempeño y el detalle por vendedor.",
    folio: "RPT-OPV", filename: "Operaciones_Vendedor", kpis: KPI_OPER, noun: "vendedor",
  },
  usuario: {
    title: "Ventas por Usuario", kicker: "Reporte de Personal",
    coverTitle: <>Ventas<br />por Usuario</>,
    desc: "Resumen de ventas por usuario en el periodo: importe vendido, tickets, ticket promedio, descuentos y devoluciones por persona, con variación, rankings, alertas y el detalle por usuario.",
    folio: "RPT-VUS", filename: "Ventas_Usuario", kpis: KPI_USER, noun: "usuario",
  },
};

const B: React.FC<{ children: React.ReactNode }> = ({ children }) => <b>{children}</b>;

function buildInsights(d: PersonnelData, cfg: (typeof CFG)[Variant]): React.ReactNode[] {
  const k = d.kpis;
  const out: React.ReactNode[] = [];
  const dir = (p: number, up: string, down: string) => (p >= 0 ? up : down);
  out.push(<>El importe vendido {dir(k.totalVendido.pct, "creció", "disminuyó")} <B>{fmtPct(Math.abs(k.totalVendido.pct))}</B> respecto al periodo anterior ({money(k.totalVendido.value)} vs. {money(k.totalVendido.prev)}).</>);
  out.push(<>Participaron <B>{fmtInt(k.vendedoresActivos.value)}</B> {cfg.noun}(es) con ventas, procesando <B>{fmtInt(k.tickets.value)}</B> tickets a un promedio de <B>{money(k.ticketPromedio.value)}</B>.</>);
  if (d.series.ventasPorVendedor.length > 0) {
    const tot = d.series.ventasPorVendedor.reduce((a, s) => a + s.total, 0);
    const top = d.series.ventasPorVendedor[0];
    out.push(<>El de mayor venta fue <B>{top.vendedor}</B>, con <B>{money(top.total)}</B> ({fmtPct(tot > 0 ? (top.total / tot) * 100 : 0)} del total).</>);
  }
  if (k.comision.value > 0) out.push(<>La comisión generada en el periodo sumó <B>{money(k.comision.value)}</B>.</>);
  const ops = k.tickets.value + k.cancelaciones.value;
  if (ops > 0) out.push(<>Las cancelaciones representan el <B>{fmtPct((k.cancelaciones.value / ops) * 100)}</B> de las operaciones; las devoluciones fueron <B>{fmtInt(k.devoluciones.value)}</B>.</>);
  if (k.descuentos.value > 0) out.push(<>Los descuentos otorgados por el equipo sumaron <B>{money(k.descuentos.value)}</B>.</>);
  return out;
}

function buildAlerts(d: PersonnelData): AlertItem[] {
  const k = d.kpis;
  const a = d.alertsData;
  const out: AlertItem[] = [];
  if (a.altaCancelacion.length > 0) out.push({ tone: "amber", text: <>Alta tasa de cancelación: {a.altaCancelacion.map((s) => `${s.nombre} (${fmtPct(s.tasa)})`).join(", ")}.</> });
  if (a.altaDevolucion.length > 0) out.push({ tone: "amber", text: <>Alta tasa de devolución: {a.altaDevolucion.map((s) => `${s.nombre} (${fmtPct(s.tasa)})`).join(", ")}.</> });
  const sellers = d.series.ventasPorVendedor;
  if (sellers.length >= 3) {
    const avg = sellers.reduce((s, v) => s + v.total, 0) / sellers.length;
    const lows = sellers.filter((s) => s.total < avg * 0.45);
    if (lows.length > 0) out.push({ tone: "amber", text: <>Desempeño por debajo del 45% del promedio: {lows.slice(0, 3).map((s) => s.vendedor).join(", ")}.</> });
  }
  if (a.sinVentas > 0) out.push({ tone: "amber", text: <><B>{fmtInt(a.sinVentas)}</B> usuario(s) sin ventas en el periodo (con actividad de cancelación o devolución).</> });
  if (out.length === 0 && k.totalVendido.pct > 5) out.push({ tone: "green", text: <>Desempeño saludable del equipo: crecimiento de <B>{fmtPct(k.totalVendido.pct)}</B> en ventas sin excepciones relevantes.</> });
  return out;
}

function buildConclusions(d: PersonnelData): React.ReactNode[] {
  const k = d.kpis;
  const parts: React.ReactNode[] = [];
  parts.push(<>El equipo generó {money(k.totalVendido.value)} en {fmtInt(k.tickets.value)} tickets ({k.totalVendido.pct >= 0 ? "+" : ""}{fmtPct(k.totalVendido.pct)} vs. periodo anterior), con {money(k.comision.value)} de comisión y {fmtInt(k.vendedoresActivos.value)} vendedores activos.</>);
  if (d.series.ventasPorVendedor.length > 1) {
    const tot = d.series.ventasPorVendedor.reduce((a, s) => a + s.total, 0);
    const top = d.series.ventasPorVendedor[0];
    parts.push(<>La venta se concentra en {top.vendedor} ({fmtPct(tot > 0 ? (top.total / tot) * 100 : 0)} del total); equilibrar el desempeño del equipo y capacitar a quienes están por debajo del promedio ampliaría el resultado global.</>);
  }
  parts.push(<>Atender las tasas de cancelación y devolución señaladas en las alertas mejora la calidad de la operación y la satisfacción del cliente.</>);
  return parts;
}

// ============================================================================
const PersonnelReport: React.FC<{ variant: Variant; branchId: string; branchLabel: string }> = ({ variant, branchId, branchLabel }) => {
  const { user } = useAuth();
  const cfg = CFG[variant];

  const [from, setFrom] = useState(isoAgo(29));
  const [to, setTo] = useState(isoToday());
  const [fBranch, setFBranch] = useState<string>(branchId);
  const [options, setOptions] = useState<FilterOptions | null>(null);
  const [configOpen, setConfigOpen] = useState(true);

  const [data, setData] = useState<PersonnelData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ folio: string; generatedAt: Date } | null>(null);

  useEffect(() => { api.get<FilterOptions>("/api/admin/reports/filter-options").then((r) => setOptions(r.data)).catch(() => {}); }, []);
  useEffect(() => { setFBranch(branchId); }, [branchId]);
  // Reinicia al cambiar de reporte (operaciones ↔ usuario).
  useEffect(() => { setData(null); setMeta(null); setConfigOpen(true); }, [variant]);

  const generate = async () => {
    setLoading(true); setError(null);
    try {
      const res = await api.get<PersonnelData>("/api/admin/reports/personnel-report", {
        params: { from, to, ...(fBranch !== "all" ? { branchId: fBranch } : {}) },
      });
      setData(res.data);
      setMeta({ folio: buildFolio(cfg.folio), generatedAt: new Date() });
      setConfigOpen(false);
    } catch (e: any) { setError(e?.response?.data?.message || "No se pudo generar el reporte."); } finally { setLoading(false); }
  };

  const branchOptions = options?.branches ?? [];
  const branchDisplay = fBranch === "all" ? "Todas las sucursales" : branchOptions.find((b) => String(b.id) === String(fBranch))?.name || branchLabel;
  const periodLabel = `${fmtDate(from)} – ${fmtDate(to)}`;
  const userName = user?.name ?? "—";
  const filtersLabel = useMemo(() => [periodLabel, branchDisplay].join(" · "), [periodLabel, branchDisplay]);

  const insights = useMemo(() => (data ? buildInsights(data, cfg) : []), [data, cfg]);
  const alerts = useMemo(() => (data ? buildAlerts(data) : []), [data]);
  const conclusions = useMemo(() => (data ? buildConclusions(data) : []), [data]);

  const onExcel = () => {
    if (!data || !meta) return;
    const sheets: ExportSheet[] = [
      {
        name: "Indicadores", title: `${cfg.title} · ${periodLabel}`,
        columns: [{ header: "Concepto", key: "concepto", width: 26 }, { header: "Periodo actual", key: "actual", type: "number" }, { header: "Periodo anterior", key: "anterior", type: "number" }, { header: "Variación %", key: "pct", type: "number" }],
        rows: RESUMEN_ROWS.map((r) => ({ concepto: r.label, actual: r.fmt === "int" ? Math.round(data.kpis[r.key].value) : Number(data.kpis[r.key].value.toFixed(2)), anterior: r.fmt === "int" ? Math.round(data.kpis[r.key].prev) : Number(data.kpis[r.key].prev.toFixed(2)), pct: Number(data.kpis[r.key].pct.toFixed(2)) })),
      },
      {
        name: variant === "operaciones" ? "Vendedores" : "Usuarios",
        columns: [
          { header: variant === "operaciones" ? "Vendedor" : "Usuario", key: "name", width: 26 }, { header: "Rol", key: "role", width: 12 }, { header: "Sucursal", key: "branch", width: 18 },
          { header: "Tickets", key: "ventasCount", type: "int" }, { header: "Total vendido", key: "totalVendido", type: "money" }, { header: "Ticket prom.", key: "ticketPromedio", type: "money" },
          { header: "Descuentos", key: "descuentos", type: "money" }, { header: "Comisión", key: "comision", type: "money" }, { header: "Cancelaciones", key: "canceladas", type: "int" },
          { header: "Devoluciones", key: "devolucionesCount", type: "int" }, { header: "Monto devuelto", key: "devolucionesMonto", type: "money" },
        ],
        rows: data.sellers,
        totals: { ventasCount: data.sellers.reduce((a, s) => a + s.ventasCount, 0), totalVendido: data.sellers.reduce((a, s) => a + s.totalVendido, 0), comision: data.sellers.reduce((a, s) => a + s.comision, 0), descuentos: data.sellers.reduce((a, s) => a + s.descuentos, 0) },
      },
    ];
    exportExcel(`${cfg.filename}_${from}_${to}`, sheets, {
      Reporte: cfg.title, Versión: REPORT_VERSION, Folio: meta.folio, Empresa: COMPANY.legalName,
      Sucursal: branchDisplay, Periodo: periodLabel, "Generado por": userName, "Fecha de generación": meta.generatedAt.toLocaleString("es-MX"), Filtros: filtersLabel,
    });
  };

  const onCsv = () => {
    if (!data) return;
    exportCsv(`${cfg.filename}_${from}_${to}`, [
      { header: variant === "operaciones" ? "Vendedor" : "Usuario", key: "name" }, { header: "Rol", key: "role" }, { header: "Sucursal", key: "branch" },
      { header: "Tickets", key: "ventasCount" }, { header: "Total vendido", key: "totalVendido" }, { header: "Ticket promedio", key: "ticketPromedio" },
      { header: "Descuentos", key: "descuentos" }, { header: "Comisión", key: "comision" }, { header: "Cancelaciones", key: "canceladas" }, { header: "Devoluciones", key: "devolucionesCount" },
    ], data.sellers);
  };

  const configPanel = (
    <ReportConfigPanel open={configOpen} onToggle={() => setConfigOpen(!configOpen)} canCollapse={!!data} onGenerate={generate} loading={loading} generated={!!data}>
      <ReportField label="Fecha inicial"><input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></ReportField>
      <ReportField label="Fecha final"><input type="date" value={to} min={from} max={isoToday()} onChange={(e) => setTo(e.target.value)} /></ReportField>
      <ReportField label="Sucursal">
        <select value={fBranch} onChange={(e) => setFBranch(e.target.value)}>
          <option value="all">Todas las sucursales</option>
          {branchOptions.map((b) => <option key={b.id} value={String(b.id)}>{b.name}</option>)}
        </select>
      </ReportField>
    </ReportConfigPanel>
  );

  let doc: ReportDocBundle | undefined;
  if (data && meta) {
    const k = data.kpis;
    const resumenRows = RESUMEN_ROWS.map((r) => ({ ...r, v: k[r.key] }));

    const rankMoney = (rows: { rank: number; nombre: string; tickets: number; importe: number }[], label: (r: any) => string): RankingRow[] => {
      const max = rows[0]?.importe || 1;
      return rows.map((r) => ({ rank: r.rank, nombre: r.nombre, valor: money(r.importe), meta: label(r), share: (r.importe / max) * 100 }));
    };
    const rankTickets = (rows: { rank: number; nombre: string; tickets: number; importe: number }[]): RankingRow[] => {
      const max = rows[0]?.tickets || 1;
      return rows.map((r) => ({ rank: r.rank, nombre: r.nombre, valor: `${fmtInt(r.tickets)} tickets`, meta: money(r.importe), share: (r.tickets / max) * 100 }));
    };

    const detColumns = variant === "operaciones"
      ? [
          { key: "name", header: "Vendedor", render: (s: SellerRow) => <span style={{ fontWeight: 700 }}>{s.name}</span> },
          { key: "role", header: "Rol", align: "center" as const, render: (s: SellerRow) => s.role },
          { key: "branch", header: "Sucursal", render: (s: SellerRow) => s.branch },
          { key: "ventasCount", header: "Ventas", align: "center" as const, render: (s: SellerRow) => fmtInt(s.ventasCount) },
          { key: "canceladas", header: "Cancel.", align: "center" as const, render: (s: SellerRow) => <span style={{ color: s.canceladas > 0 ? "#b45309" : undefined }}>{fmtInt(s.canceladas)}</span> },
          { key: "devolucionesCount", header: "Devol.", align: "center" as const, render: (s: SellerRow) => fmtInt(s.devolucionesCount) },
          { key: "totalVendido", header: "Total vendido", align: "right" as const, render: (s: SellerRow) => <span style={{ fontWeight: 700 }}>{money(s.totalVendido)}</span> },
          { key: "comision", header: "Comisión", align: "right" as const, render: (s: SellerRow) => money(s.comision) },
        ]
      : [
          { key: "name", header: "Usuario", render: (s: SellerRow) => <span style={{ fontWeight: 700 }}>{s.name}</span> },
          { key: "role", header: "Rol", align: "center" as const, render: (s: SellerRow) => s.role },
          { key: "branch", header: "Sucursal", render: (s: SellerRow) => s.branch },
          { key: "ventasCount", header: "Tickets", align: "center" as const, render: (s: SellerRow) => fmtInt(s.ventasCount) },
          { key: "totalVendido", header: "Importe", align: "right" as const, render: (s: SellerRow) => <span style={{ fontWeight: 700 }}>{money(s.totalVendido)}</span> },
          { key: "ticketPromedio", header: "Ticket prom.", align: "right" as const, render: (s: SellerRow) => money(s.ticketPromedio) },
          { key: "descuentos", header: "Descuentos", align: "right" as const, render: (s: SellerRow) => money(s.descuentos) },
          { key: "canceladas", header: "Cancel.", align: "center" as const, render: (s: SellerRow) => fmtInt(s.canceladas) },
          { key: "devolucionesCount", header: "Devol.", align: "center" as const, render: (s: SellerRow) => fmtInt(s.devolucionesCount) },
        ];
    const detTotals = variant === "operaciones"
      ? { ventasCount: fmtInt(data.sellers.reduce((a, s) => a + s.ventasCount, 0)), totalVendido: money(data.sellers.reduce((a, s) => a + s.totalVendido, 0)), comision: money(data.sellers.reduce((a, s) => a + s.comision, 0)) }
      : { ventasCount: fmtInt(data.sellers.reduce((a, s) => a + s.ventasCount, 0)), totalVendido: money(data.sellers.reduce((a, s) => a + s.totalVendido, 0)), descuentos: money(data.sellers.reduce((a, s) => a + s.descuentos, 0)) };

    const chunks: SellerRow[][] = [];
    for (let i = 0; i < data.sellers.length; i += ROWS_PER_PAGE) chunks.push(data.sellers.slice(i, i + ROWS_PER_PAGE));
    const detailPages: ReportPageDef[] = chunks.map((chunk, ci) => {
      const isLast = ci === chunks.length - 1;
      return {
        id: `sel-${ci}`, toc: ci === 0 ? "Detalle por persona" : undefined,
        render: (page, dm) => (
          <ReportPage meta={dm} page={page}>
            <SectionTitle icon={ListOrdered} title={`Anexo — Detalle por ${cfg.noun}`} sub={`${fmtInt(data.sellersMeta.total)} ${cfg.noun}(es) · ordenados por importe vendido`} />
            <ReportTable rows={chunk} keyOf={(s: SellerRow) => s.userId} columns={detColumns}
              total={isLast ? { ...detTotals, role: `${fmtInt(data.sellersMeta.total)}` } : undefined} totalLabel="TOTALES" totalSpan={1} />
          </ReportPage>
        ),
      };
    });
    if (detailPages.length === 0) detailPages.push({
      id: "sel-empty", toc: "Detalle por persona",
      render: (page, dm) => (<ReportPage meta={dm} page={page}><SectionTitle icon={ListOrdered} title={`Anexo — Detalle por ${cfg.noun}`} /><div className="erp-alert-empty">Sin actividad de personal en el periodo con los filtros seleccionados.</div></ReportPage>),
    });

    const pages: ReportPageDef[] = [
      {
        id: "portada", toc: "Portada",
        render: (page, dm) => (
          <ReportPage meta={dm} page={page} cover>
            <div className="erp-cover-top"><ReportLogo size={58} /><div><div className="erp-cover-brandname">{COMPANY.name}</div><div className="erp-cover-brandtag">{COMPANY.tagline}</div></div></div>
            <div className="erp-cover-band">
              <div className="erp-cover-kicker">{cfg.kicker}</div>
              <div className="erp-cover-title">{cfg.coverTitle}</div>
              <div className="erp-cover-desc">{cfg.desc}</div>
            </div>
            <div className="erp-cover-meta">
              {[["Empresa", COMPANY.legalName], ["Reporte", `${cfg.title} · Versión ${REPORT_VERSION}`], ["Periodo analizado", periodLabel], ["Sucursal", branchDisplay], ["Generado por", userName], ["Folio", meta.folio], ["Fecha de generación", meta.generatedAt.toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" })], ["Hora", meta.generatedAt.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })]].map(([l, v]) => (
                <div className="erp-cover-meta-item" key={l}><div className="erp-cover-meta-label">{l}</div><div className="erp-cover-meta-value">{v}</div></div>
              ))}
            </div>
          </ReportPage>
        ),
      },
      {
        id: "kpis", toc: "Indicadores",
        render: (page, dm) => (
          <ReportPage meta={dm} page={page}>
            <SectionTitle icon={BarChart3} title={`Indicadores — ${cfg.title}`} sub={periodLabel} />
            <div className="erp-kpi-grid big">{cfg.kpis.map((def) => <KpiCard key={def.key} icon={def.icon} label={def.label} display={fmtKpi(def.fmt, k[def.key].value)} variation={k[def.key]} higherIsBetter={def.better} />)}</div>
            <SectionTitle icon={Award} title="Destacados del periodo" />
            <div className="erp-tops" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
              {[["Mayor venta", data.tops.topVendedor], ["Más tickets", data.tops.topTickets], ["Mayor comisión", data.tops.topComision]].map(([l, v]) => (
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
            <SectionTitle icon={BarChart3} title="Estructura del desempeño del equipo" />
            <div className="erp-charts-grid">
              <ChartCard question="¿Quién vende más?" sub="Top 8 por importe"><HBars data={data.series.ventasPorVendedor.slice(0, 8)} categoryKey="vendedor" valueKey="total" name="Ventas" height={165} yWidth={100} yFontSize={7.5} barSize={12} color={CHART.blue} formatValue={money} /></ChartCard>
              <ChartCard question="¿Quién procesa más tickets?" sub="Top 8 por número de tickets"><HBars data={data.series.ticketsPorVendedor.slice(0, 8)} categoryKey="vendedor" valueKey="tickets" name="Tickets" height={165} yWidth={100} yFontSize={7.5} barSize={12} color={CHART.navy} formatValue={fmtInt} formatX={fmtInt} /></ChartCard>
              <ChartCard question="¿Quién genera más comisión?" sub="Top 8 por comisión"><HBars data={data.series.comisionPorVendedor.slice(0, 8)} categoryKey="vendedor" valueKey="comision" name="Comisión" height={165} yWidth={100} yFontSize={7.5} barSize={12} formatValue={money} /></ChartCard>
              <DonutCard question="¿Cómo se reparte la venta del equipo?" sub="Participación por importe · menores en «Otros»" data={data.series.ventasPorVendedor.map((s, i) => ({ name: s.vendedor, value: s.total, color: CAT[i % CAT.length] }))} format={(v) => money(v)} centerTitle="Total" />
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
            <SectionTitle icon={AlertTriangle} title="Alertas de desempeño" sub="Excepciones que requieren atención" />
            <AlertsPanel items={alerts} />
          </ReportPage>
        ),
      },
      {
        id: "rankings", toc: "Rankings",
        render: (page, dm) => (
          <ReportPage meta={dm} page={page}>
            <SectionTitle icon={Trophy} title="Rankings del periodo" sub="Top 10" />
            <div className="erp-rank-grid">
              <RankingCard icon={DollarSign} title="Mayor venta" rows={rankMoney(data.rankings.importe, (r) => `${fmtInt(r.tickets)} tickets`)} />
              <RankingCard icon={ShoppingCart} title="Más tickets" rows={rankTickets(data.rankings.tickets)} />
              <RankingCard icon={Coins} title="Mayor comisión" rows={rankMoney(data.rankings.comision, (r) => `${fmtInt(r.tickets)} tickets`)} />
              <RankingCard icon={RotateCcw} title="Más devoluciones" rows={rankMoney(data.rankings.devoluciones, (r) => `${fmtInt(r.tickets)} devol.`)} />
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
      docMeta: { reportTitle: cfg.title, folio: meta.folio, branch: branchDisplay, period: periodLabel, user: userName, filtersLabel, generatedAt: meta.generatedAt },
      pages, filenameBase: cfg.filename, onExcel, onCsv,
    };
  }

  return (
    <ReportShell configPanel={configPanel} ready={!!data && !!meta} loading={loading} error={error} doc={doc}
      emptyText="Configure los filtros y presione «Generar reporte» para obtener la vista previa del documento." />
  );
};

export default PersonnelReport;
