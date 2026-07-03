import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowDownToLine, ArrowUpFromLine, BarChart3, ClipboardCheck, GitCompareArrows,
  Layers, LineChart as LineIcon, ListOrdered, Package, PackageX, Repeat, Scale,
  TrendingUp, Trophy, Award, AlertTriangle, Boxes,
} from "lucide-react";
import api from "../../../shared/services/api";
import { useAuth } from "../../../auth";
import { fmtDate, fmtDateTime } from "../shared";
import {
  COMPANY, ReportLogo, buildFolio, REPORT_VERSION,
  ReportPage, SectionTitle, KpiCard, Semaforo, InsightsPanel, AlertsPanel,
  ChartCard, DonutCard, RankingCard, ReportField, ReportSelect,
  ReportTable, ReportShell, ReportConfigPanel,
  VBars, CAT, CHART,
  fmtInt, shortDay,
  exportExcel, exportCsv,
  type AlertItem, type RankingRow, type ReportPageDef, type ReportDocBundle, type ExportSheet,
} from "./framework";

// ============================================================================
// REPORTE DE KARDEX (movimientos de inventario) — hereda la plantilla maestra.
// Periodo con comparativo. Resume entradas/salidas, desglosa por tipo de
// movimiento, series diarias, rankings por producto y el detalle de movimientos.
// ============================================================================
interface Vary { value: number; prev: number; delta: number; pct: number; }
interface KxRow { fecha: string; producto: string; sku: string; sucursal: string; tipo: string; tipoRaw: string; cambio: number; saldo: number; usuario: string; motivo: string; }

interface KardexData {
  period: { from: string; to: string; prevFrom: string; prevTo: string; days: number };
  kpis: Record<string, Vary>;
  tops: { tipoPrincipal: string; productoMasMovido: string; diaMasActivo: string };
  series: {
    porDia: { fecha: string; entradas: number; salidas: number }[];
    porTipo: { tipo: string; tipoRaw: string; count: number; unidades: number }[];
  };
  rankings: {
    movimientos: { rank: number; nombre: string; sku: string; movs: number; valor: number }[];
    entradas: { rank: number; nombre: string; sku: string; movs: number; valor: number }[];
    salidas: { rank: number; nombre: string; sku: string; movs: number; valor: number }[];
    tipos: { rank: number; nombre: string; movs: number; valor: number }[];
  };
  entries: KxRow[];
  entriesMeta: { total: number; shown: number; truncated: boolean };
  alertsData: { mermaCount: number; mermaUnidades: number; mermaEjemplos: string[]; ajusteCount: number; ajusteNegativos: number; traspasos: number };
}

interface FilterOptions { branches: { id: number; name: string }[]; }

const isoToday = () => new Date().toISOString().slice(0, 10);
const isoAgo = (d: number) => new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);
const ROWS_PER_PAGE = 22;

const MOV_OPTIONS = [
  { value: "COMPRA", label: "Compras" }, { value: "VENTA", label: "Ventas" }, { value: "DEVOLUCION", label: "Devoluciones" },
  { value: "AJUSTE_INVENTARIO", label: "Ajustes" }, { value: "AJUSTE_MERMA", label: "Mermas" },
  { value: "TRASPASO_ENTRADA", label: "Traspaso entrada" }, { value: "TRASPASO_SALIDA", label: "Traspaso salida" },
];

type KpiDef = { key: string; label: string; icon: any; better: boolean };
const KPIS: KpiDef[] = [
  { key: "movimientos", label: "Movimientos", icon: Repeat, better: true },
  { key: "entradas", label: "Entradas (mov.)", icon: ArrowDownToLine, better: true },
  { key: "salidas", label: "Salidas (mov.)", icon: ArrowUpFromLine, better: true },
  { key: "productosAfectados", label: "Productos Afectados", icon: Package, better: true },
  { key: "entradasUnidades", label: "Unidades Entradas", icon: ArrowDownToLine, better: true },
  { key: "salidasUnidades", label: "Unidades Salidas", icon: ArrowUpFromLine, better: true },
  { key: "unidadesNetas", label: "Unidades Netas", icon: Scale, better: true },
  { key: "mermaUnidades", label: "Unidades en Merma", icon: PackageX, better: false },
];
const RESUMEN_ROWS: { key: string; label: string; better: boolean }[] = [
  { key: "movimientos", label: "Movimientos", better: true },
  { key: "entradas", label: "Entradas (movimientos)", better: true },
  { key: "salidas", label: "Salidas (movimientos)", better: true },
  { key: "entradasUnidades", label: "Unidades entradas", better: true },
  { key: "salidasUnidades", label: "Unidades salidas", better: true },
  { key: "unidadesNetas", label: "Unidades netas", better: true },
  { key: "productosAfectados", label: "Productos afectados", better: true },
  { key: "mermaUnidades", label: "Unidades en merma", better: false },
];

const B: React.FC<{ children: React.ReactNode }> = ({ children }) => <b>{children}</b>;

function buildInsights(d: KardexData): React.ReactNode[] {
  const k = d.kpis;
  const out: React.ReactNode[] = [];
  const dir = (p: number, up: string, down: string) => (p >= 0 ? up : down);
  out.push(<>Se registraron <B>{fmtInt(k.movimientos.value)}</B> movimientos de inventario ({dir(k.movimientos.pct, "▲", "▼")} {Math.abs(k.movimientos.pct).toFixed(1)}% vs. periodo anterior) sobre <B>{fmtInt(k.productosAfectados.value)}</B> productos.</>);
  out.push(<>Entraron <B>{fmtInt(k.entradasUnidades.value)}</B> unidades y salieron <B>{fmtInt(k.salidasUnidades.value)}</B>, con un flujo neto de <B>{fmtInt(k.unidadesNetas.value)}</B> unidades.</>);
  if (d.series.porTipo.length > 0) {
    const tot = d.series.porTipo.reduce((a, t) => a + t.count, 0);
    const top = d.series.porTipo[0];
    out.push(<>El tipo de movimiento predominante fue <B>{top.tipo}</B>, con el <B>{(tot > 0 ? (top.count / tot) * 100 : 0).toFixed(1)}%</B> de los registros.</>);
  }
  if (d.tops.productoMasMovido !== "—") out.push(<>El producto con más movimientos fue <B>{d.tops.productoMasMovido}</B>.</>);
  if (d.tops.diaMasActivo !== "—") out.push(<>El día de mayor actividad fue <B>{fmtDate(d.tops.diaMasActivo)}</B>.</>);
  if (d.alertsData.mermaUnidades > 0) out.push(<>Se registraron <B>{fmtInt(d.alertsData.mermaUnidades)}</B> unidades en merma ({fmtInt(d.alertsData.mermaCount)} movimientos).</>);
  return out;
}

function buildAlerts(d: KardexData): AlertItem[] {
  const k = d.kpis;
  const a = d.alertsData;
  const out: AlertItem[] = [];
  if (a.mermaUnidades > 0) out.push({ tone: "amber", text: <>Merma registrada: <B>{fmtInt(a.mermaUnidades)}</B> unidades en {fmtInt(a.mermaCount)} movimientos{a.mermaEjemplos.length > 0 && <> ({a.mermaEjemplos.join(", ")})</>}.</> });
  if (a.ajusteNegativos > 0) out.push({ tone: "amber", text: <><B>{fmtInt(a.ajusteNegativos)}</B> ajuste(s) de inventario negativos. Verificar causas de faltantes.</> });
  if (k.mermaUnidades.value > k.mermaUnidades.prev && k.mermaUnidades.prev > 0 && k.mermaUnidades.pct > 20) out.push({ tone: "amber", text: <>Incremento de merma: <B>+{k.mermaUnidades.pct.toFixed(1)}%</B> vs. periodo anterior.</> });
  if (k.unidadesNetas.value < 0) out.push({ tone: "amber", text: <>Flujo neto negativo: salieron <B>{fmtInt(Math.abs(k.unidadesNetas.value))}</B> unidades más de las que entraron en el periodo.</> });
  if (a.traspasos > 0) out.push({ tone: "green", text: <>Se procesaron <B>{fmtInt(a.traspasos)}</B> movimientos de traspaso entre sucursales.</> });
  if (out.length === 0) out.push({ tone: "green", text: <>Sin excepciones relevantes: los movimientos de inventario se encuentran dentro de parámetros normales.</> });
  return out;
}

function buildConclusions(d: KardexData): React.ReactNode[] {
  const k = d.kpis;
  const parts: React.ReactNode[] = [];
  parts.push(<>El inventario registró {fmtInt(k.movimientos.value)} movimientos en el periodo, con un flujo neto de {fmtInt(k.unidadesNetas.value)} unidades ({k.unidadesNetas.value >= 0 ? "acumulación" : "reducción"} de existencias).</>);
  if (d.series.porTipo.length > 0) parts.push(<>La actividad se concentra en movimientos de tipo {d.series.porTipo[0].tipo}; el detalle por tipo permite auditar el origen de cada cambio de existencia.</>);
  if (d.alertsData.mermaUnidades > 0) parts.push(<>La merma del periodo ({fmtInt(d.alertsData.mermaUnidades)} unidades) representa una pérdida a vigilar; conviene revisar los productos y causas señalados en las alertas.</>);
  return parts;
}

// ============================================================================
const KardexReport: React.FC<{ branchId: string; branchLabel: string }> = ({ branchId, branchLabel }) => {
  const { user } = useAuth();
  const [from, setFrom] = useState(isoAgo(29));
  const [to, setTo] = useState(isoToday());
  const [fBranch, setFBranch] = useState<string>(branchId);
  const [fMov, setFMov] = useState("");
  const [fSearch, setFSearch] = useState("");
  const [options, setOptions] = useState<FilterOptions | null>(null);
  const [configOpen, setConfigOpen] = useState(true);

  const [data, setData] = useState<KardexData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ folio: string; generatedAt: Date } | null>(null);

  useEffect(() => { api.get<FilterOptions>("/api/admin/reports/filter-options").then((r) => setOptions(r.data)).catch(() => {}); }, []);
  useEffect(() => { setFBranch(branchId); }, [branchId]);

  const generate = async () => {
    setLoading(true); setError(null);
    try {
      const res = await api.get<KardexData>("/api/admin/reports/kardex-report", {
        params: { from, to, ...(fBranch !== "all" ? { branchId: fBranch } : {}), ...(fMov ? { movementType: fMov } : {}), ...(fSearch ? { search: fSearch } : {}) },
      });
      setData(res.data);
      setMeta({ folio: buildFolio("RPT-KDX"), generatedAt: new Date() });
      setConfigOpen(false);
    } catch (e: any) { setError(e?.response?.data?.message || "No se pudo generar el reporte."); } finally { setLoading(false); }
  };

  const branchOptions = options?.branches ?? [];
  const branchDisplay = fBranch === "all" ? "Todas las sucursales" : branchOptions.find((b) => String(b.id) === String(fBranch))?.name || branchLabel;
  const periodLabel = `${fmtDate(from)} – ${fmtDate(to)}`;
  const userName = user?.name ?? "—";

  const filtersLabel = useMemo(() => {
    const parts: string[] = [periodLabel, branchDisplay];
    if (fMov) parts.push(`Movimiento: ${MOV_OPTIONS.find((m) => m.value === fMov)?.label ?? fMov}`);
    if (fSearch) parts.push(`Búsqueda: ${fSearch}`);
    return parts.join(" · ");
  }, [periodLabel, branchDisplay, fMov, fSearch]);

  const insights = useMemo(() => (data ? buildInsights(data) : []), [data]);
  const alerts = useMemo(() => (data ? buildAlerts(data) : []), [data]);
  const conclusions = useMemo(() => (data ? buildConclusions(data) : []), [data]);

  const onExcel = () => {
    if (!data || !meta) return;
    const sheets: ExportSheet[] = [
      {
        name: "Indicadores", title: `Kardex · ${periodLabel}`,
        columns: [{ header: "Concepto", key: "concepto", width: 28 }, { header: "Periodo actual", key: "actual", type: "int" }, { header: "Periodo anterior", key: "anterior", type: "int" }, { header: "Variación %", key: "pct", type: "number" }],
        rows: RESUMEN_ROWS.map((r) => ({ concepto: r.label, actual: Math.round(data.kpis[r.key].value), anterior: Math.round(data.kpis[r.key].prev), pct: Number(data.kpis[r.key].pct.toFixed(2)) })),
      },
      {
        name: "Por tipo",
        columns: [{ header: "Tipo", key: "tipo", width: 22 }, { header: "Movimientos", key: "count", type: "int" }, { header: "Unidades", key: "unidades", type: "int" }],
        rows: data.series.porTipo,
      },
      {
        name: "Movimientos",
        columns: [
          { header: "Fecha", key: "fecha", width: 20 }, { header: "Producto", key: "producto", width: 30 }, { header: "SKU", key: "sku", width: 16 },
          { header: "Sucursal", key: "sucursal", width: 18 }, { header: "Tipo", key: "tipo", width: 18 }, { header: "Cambio", key: "cambio", type: "int" },
          { header: "Saldo", key: "saldo", type: "int" }, { header: "Usuario", key: "usuario", width: 18 }, { header: "Motivo", key: "motivo", width: 26 },
        ],
        rows: data.entries.map((e) => ({ ...e, fecha: fmtDateTime(e.fecha) })),
      },
    ];
    exportExcel(`Kardex_${from}_${to}`, sheets, {
      Reporte: "Kardex (movimientos de inventario)", Versión: REPORT_VERSION, Folio: meta.folio, Empresa: COMPANY.legalName,
      Sucursal: branchDisplay, Periodo: periodLabel, "Generado por": userName, "Fecha de generación": meta.generatedAt.toLocaleString("es-MX"), Filtros: filtersLabel,
    });
  };

  const onCsv = () => {
    if (!data) return;
    exportCsv(`Kardex_${from}_${to}`, [
      { header: "Fecha", key: "fecha" }, { header: "Producto", key: "producto" }, { header: "SKU", key: "sku" }, { header: "Sucursal", key: "sucursal" },
      { header: "Tipo", key: "tipo" }, { header: "Cambio", key: "cambio" }, { header: "Saldo", key: "saldo" }, { header: "Usuario", key: "usuario" }, { header: "Motivo", key: "motivo" },
    ], data.entries.map((e) => ({ ...e, fecha: fmtDateTime(e.fecha) })));
  };

  const configPanel = (
    <ReportConfigPanel open={configOpen} onToggle={() => setConfigOpen(!configOpen)} canCollapse={!!data} onGenerate={generate}
      onClear={() => { setFMov(""); setFSearch(""); }} loading={loading} generated={!!data}>
      <ReportField label="Fecha inicial"><input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></ReportField>
      <ReportField label="Fecha final"><input type="date" value={to} min={from} max={isoToday()} onChange={(e) => setTo(e.target.value)} /></ReportField>
      <ReportField label="Sucursal">
        <select value={fBranch} onChange={(e) => setFBranch(e.target.value)}>
          <option value="all">Todas las sucursales</option>
          {branchOptions.map((b) => <option key={b.id} value={String(b.id)}>{b.name}</option>)}
        </select>
      </ReportField>
      <ReportField label="Tipo de movimiento"><ReportSelect value={fMov} onChange={setFMov} options={MOV_OPTIONS} allLabel="Todos" /></ReportField>
      <ReportField label="Buscar producto"><input type="text" maxLength={80} value={fSearch} onChange={(e) => setFSearch(e.target.value)} placeholder="Nombre o SKU" /></ReportField>
    </ReportConfigPanel>
  );

  let doc: ReportDocBundle | undefined;
  if (data && meta) {
    const k = data.kpis;
    const tipoTotal = data.series.porTipo.reduce((a, t) => a + t.count, 0) || 1;
    const resumenRows = RESUMEN_ROWS.map((r) => ({ ...r, v: k[r.key] }));

    const rankMov = (rows: { rank: number; nombre: string; movs: number; valor: number }[], unit: string): RankingRow[] => {
      const max = rows[0]?.valor || 1;
      return rows.map((r) => ({ rank: r.rank, nombre: r.nombre, valor: `${fmtInt(r.valor)} ${unit}`, meta: `${fmtInt(r.movs)} mov.`, share: (r.valor / max) * 100 }));
    };

    const detColumns = [
      { key: "fecha", header: "Fecha", render: (e: KxRow) => fmtDateTime(e.fecha) },
      { key: "producto", header: "Producto", render: (e: KxRow) => <span style={{ fontWeight: 700 }}>{e.producto}</span> },
      { key: "sku", header: "SKU", render: (e: KxRow) => e.sku },
      { key: "sucursal", header: "Sucursal", render: (e: KxRow) => e.sucursal },
      { key: "tipo", header: "Tipo", align: "center" as const, render: (e: KxRow) => e.tipo },
      { key: "cambio", header: "Cambio", align: "right" as const, render: (e: KxRow) => <span style={{ color: e.cambio >= 0 ? "#15803d" : "#b91c1c", fontWeight: 800 }}>{e.cambio >= 0 ? "+" : ""}{fmtInt(e.cambio)}</span> },
      { key: "saldo", header: "Saldo", align: "right" as const, render: (e: KxRow) => fmtInt(e.saldo) },
      { key: "usuario", header: "Usuario", render: (e: KxRow) => e.usuario },
      { key: "motivo", header: "Motivo", render: (e: KxRow) => e.motivo },
    ];

    const chunks: KxRow[][] = [];
    for (let i = 0; i < data.entries.length; i += ROWS_PER_PAGE) chunks.push(data.entries.slice(i, i + ROWS_PER_PAGE));
    const detailPages: ReportPageDef[] = chunks.map((chunk, ci) => {
      const startRow = ci * ROWS_PER_PAGE + 1, endRow = ci * ROWS_PER_PAGE + chunk.length;
      return {
        id: `kx-${ci}`, toc: ci === 0 ? "Detalle de movimientos" : undefined,
        render: (page, dm) => (
          <ReportPage meta={dm} page={page}>
            <SectionTitle icon={ListOrdered} title="Anexo — Detalle de movimientos" sub={`Movimientos ${fmtInt(startRow)}–${fmtInt(endRow)} de ${fmtInt(data.entriesMeta.shown)}${data.entriesMeta.truncated ? ` (de ${fmtInt(data.entriesMeta.total)})` : ""} · más recientes primero`} />
            <ReportTable rows={chunk} keyOf={(_e: KxRow, i: number) => `${startRow}-${i}`} columns={detColumns} />
          </ReportPage>
        ),
      };
    });
    if (detailPages.length === 0) detailPages.push({
      id: "kx-empty", toc: "Detalle de movimientos",
      render: (page, dm) => (<ReportPage meta={dm} page={page}><SectionTitle icon={ListOrdered} title="Anexo — Detalle de movimientos" /><div className="erp-alert-empty">Sin movimientos en el periodo con los filtros seleccionados.</div></ReportPage>),
    });

    const pages: ReportPageDef[] = [
      {
        id: "portada", toc: "Portada",
        render: (page, dm) => (
          <ReportPage meta={dm} page={page} cover>
            <div className="erp-cover-top"><ReportLogo size={58} /><div><div className="erp-cover-brandname">{COMPANY.name}</div><div className="erp-cover-brandtag">{COMPANY.tagline}</div></div></div>
            <div className="erp-cover-band">
              <div className="erp-cover-kicker">Reporte de Inventario</div>
              <div className="erp-cover-title">Kardex de<br />Movimientos</div>
              <div className="erp-cover-desc">Historial de movimientos de inventario del periodo: entradas y salidas, flujo neto de unidades, desglose por tipo de movimiento, rankings por producto, alertas de merma y el detalle completo de cada movimiento.</div>
            </div>
            <div className="erp-cover-meta">
              {[["Empresa", COMPANY.legalName], ["Reporte", `Kardex · Versión ${REPORT_VERSION}`], ["Periodo analizado", periodLabel], ["Sucursal", branchDisplay], ["Generado por", userName], ["Folio", meta.folio], ["Fecha de generación", meta.generatedAt.toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" })], ["Hora", meta.generatedAt.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })]].map(([l, v]) => (
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
            <SectionTitle icon={BarChart3} title="Indicadores de movimiento" sub={periodLabel} />
            <div className="erp-kpi-grid big">{KPIS.map((def) => <KpiCard key={def.key} icon={def.icon} label={def.label} display={fmtInt(k[def.key].value)} variation={k[def.key]} higherIsBetter={def.better} />)}</div>
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
                { key: "actual", header: "Periodo actual", align: "right", render: (r: any) => fmtInt(r.v.value) },
                { key: "anterior", header: "Periodo anterior", align: "right", render: (r: any) => fmtInt(r.v.prev) },
                { key: "delta", header: "Variación", align: "right", render: (r: any) => `${r.v.delta >= 0 ? "+" : ""}${fmtInt(r.v.delta)}` },
                { key: "pct", header: "Variación %", align: "right", render: (r: any) => <span style={{ color: (r.better ? r.v.pct >= 0 : r.v.pct <= 0) ? "#15803d" : "#b91c1c", fontWeight: 800 }}>{r.v.pct >= 0 ? "+" : ""}{r.v.pct.toFixed(1)}%</span> },
                { key: "sem", header: "Semáforo", align: "center", render: (r: any) => <Semaforo pct={r.v.pct} higherIsBetter={r.better} /> },
              ]} />
            <SectionTitle icon={Award} title="Destacados del periodo" />
            <div className="erp-tops" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
              {[["Tipo de movimiento principal", data.tops.tipoPrincipal], ["Producto más movido", data.tops.productoMasMovido], ["Día más activo", data.tops.diaMasActivo !== "—" ? fmtDate(data.tops.diaMasActivo) : "—"]].map(([l, v]) => (
                <div className="erp-top" key={l}><div className="erp-top-label">{l}</div><div className="erp-top-value">{v}</div></div>
              ))}
            </div>
          </ReportPage>
        ),
      },
      {
        id: "flujo", toc: "Flujo diario",
        render: (page, dm) => (
          <ReportPage meta={dm} page={page}>
            <SectionTitle icon={LineIcon} title="Flujo de inventario — Evolución diaria" sub="Unidades por día" />
            <ChartCard question="¿Cuántas unidades entraron por día?" sub="Entradas de inventario por día" full><VBars data={data.series.porDia} xKey="fecha" yKey="entradas" name="Entradas" height={160} allowDecimals={false} yWidth={34} xMinTickGap={24} formatX={shortDay} formatValue={fmtInt} formatLabel={(l) => fmtDate(String(l))} color={CHART.blue} /></ChartCard>
            <div style={{ height: 11 }} />
            <ChartCard question="¿Cuántas unidades salieron por día?" sub="Salidas de inventario por día" full><VBars data={data.series.porDia} xKey="fecha" yKey="salidas" name="Salidas" height={160} allowDecimals={false} yWidth={34} xMinTickGap={24} formatX={shortDay} formatValue={fmtInt} formatLabel={(l) => fmtDate(String(l))} color={CHART.navy} /></ChartCard>
          </ReportPage>
        ),
      },
      {
        id: "tipos", toc: "Por tipo",
        render: (page, dm) => (
          <ReportPage meta={dm} page={page}>
            <SectionTitle icon={Layers} title="Desglose por tipo de movimiento" />
            <div className="erp-charts-grid">
              <DonutCard question="¿Cómo se distribuyen los movimientos?" sub="Participación por número de movimientos" data={data.series.porTipo.map((t, i) => ({ name: t.tipo, value: t.count, color: CAT[i % CAT.length] }))} format={(v) => fmtInt(v)} centerTitle="Movs." />
              <div className="erp-chart-card">
                <div className="erp-chart-q">¿Qué volumen mueve cada tipo?</div>
                <div className="erp-chart-sub">Movimientos y unidades por tipo</div>
                <ReportTable rows={data.series.porTipo} keyOf={(t: any) => t.tipoRaw}
                  columns={[
                    { key: "tipo", header: "Tipo", render: (t: any) => <span style={{ fontWeight: 700 }}>{t.tipo}</span> },
                    { key: "count", header: "Movs.", align: "right", render: (t: any) => fmtInt(t.count) },
                    { key: "part", header: "%", align: "right", render: (t: any) => `${((t.count / tipoTotal) * 100).toFixed(1)}%` },
                    { key: "unidades", header: "Unidades", align: "right", render: (t: any) => fmtInt(t.unidades) },
                  ]} />
              </div>
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
            <SectionTitle icon={AlertTriangle} title="Alertas de inventario" sub="Excepciones que requieren atención" />
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
              <RankingCard icon={Repeat} title="Más movimientos" rows={rankMov(data.rankings.movimientos, "mov")} />
              <RankingCard icon={ArrowDownToLine} title="Más unidades entradas" rows={rankMov(data.rankings.entradas, "uds")} />
              <RankingCard icon={ArrowUpFromLine} title="Más unidades salidas" rows={rankMov(data.rankings.salidas, "uds")} />
              <RankingCard icon={Boxes} title="Por tipo de movimiento" rows={rankMov(data.rankings.tipos, "uds")} />
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
      docMeta: { reportTitle: "Kardex", folio: meta.folio, branch: branchDisplay, period: periodLabel, user: userName, filtersLabel, generatedAt: meta.generatedAt },
      pages, filenameBase: "Kardex", onExcel, onCsv,
    };
  }

  return (
    <ReportShell configPanel={configPanel} ready={!!data && !!meta} loading={loading} error={error} doc={doc}
      emptyText="Configure los filtros y presione «Generar reporte» para obtener la vista previa del documento." />
  );
};

export default KardexReport;
