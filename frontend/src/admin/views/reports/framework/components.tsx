import React from "react";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Lightbulb,
  AlertTriangle,
  CheckCircle2,
  type LucideIcon,
} from "lucide-react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { COMPANY, ReportLogo } from "./companyInfo";

// ============================================================================
// Componentes base del sistema de reportes empresariales. Reutilizables por
// todos los reportes (Resumen Ejecutivo, Ventas, Artículos, Existencias, …).
// ============================================================================

// Metadatos compartidos del documento (portada, encabezados y pies).
export interface ReportDocMeta {
  reportTitle: string;
  folio: string;
  branch: string;
  period: string;
  user: string;
  filtersLabel: string;
  generatedAt: Date;
  totalPages: number;
}

// ---------------------------------------------------------------------------
// Página A4 con encabezado corporativo repetido y pie con numeración.
// ---------------------------------------------------------------------------
export const ReportPage: React.FC<{
  meta: ReportDocMeta;
  page: number;
  cover?: boolean;
  children: React.ReactNode;
}> = ({ meta, page, cover, children }) => {
  const d = meta.generatedAt;
  return (
    <section className={`erp-page${cover ? " erp-cover" : ""}`} data-erp-page={page}>
      {cover && <div className="erp-cover-rule" />}
      {!cover && (
        <header className="erp-runhead">
          <div className="erp-runhead-left">
            <ReportLogo size={27} />
            <div>
              <div className="erp-runhead-title">{meta.reportTitle}</div>
              <div className="erp-runhead-sub">{COMPANY.name} · {meta.branch}</div>
            </div>
          </div>
          <div className="erp-runhead-meta">
            Folio: {meta.folio}
            <br />
            Periodo: {meta.period}
          </div>
        </header>
      )}
      {cover ? children : <div className="erp-page-body">{children}</div>}
      <footer className="erp-foot">
        <div className="erp-foot-row">
          <span className="erp-foot-brand">
            <ReportLogo size={11} /> {COMPANY.name}
          </span>
          <span className="erp-foot-filters">Filtros: <strong>{meta.filtersLabel}</strong></span>
          <span>Página <strong>{page}</strong> de <strong>{meta.totalPages}</strong></span>
        </div>
        <div className="erp-foot-row">
          <span>
            Impreso: <strong>{d.toLocaleDateString("es-MX")} {d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}</strong>
            {" · "}Usuario: <strong>{meta.user}</strong>
          </span>
          <span>Sucursal: <strong>{meta.branch}</strong> · Periodo: <strong>{meta.period}</strong></span>
        </div>
      </footer>
    </section>
  );
};

// ---------------------------------------------------------------------------
// Título de sección con icono.
// ---------------------------------------------------------------------------
export const SectionTitle: React.FC<{ icon: LucideIcon; title: string; sub?: string }> = ({ icon: Icon, title, sub }) => (
  <div className="erp-section-title">
    <span className="erp-st-icon"><Icon size={14} /></span>
    {title}
    {sub && <span className="erp-section-sub">{sub}</span>}
  </div>
);

// ---------------------------------------------------------------------------
// Variación (píldora): ▲ verde mejora / ▼ roja empeora / neutra estable.
// ---------------------------------------------------------------------------
export interface KpiVariation { value: number; prev: number; delta: number; pct: number; }

export const DeltaBadge: React.FC<{ variation: KpiVariation; higherIsBetter?: boolean; note?: string }> = ({
  variation,
  higherIsBetter = true,
  note = "vs. periodo anterior",
}) => {
  const pct = variation.pct;
  const flat = Math.abs(pct) < 0.05;
  const improved = higherIsBetter ? pct > 0 : pct < 0;
  const cls = flat ? "flat" : improved ? "up" : "down";
  const Arrow = flat ? Minus : pct > 0 ? TrendingUp : TrendingDown;
  return (
    <div className="erp-kpi-foot">
      <span className={`erp-kpi-pill ${cls}`}>
        <Arrow size={10} />
        {flat ? "0.0%" : `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`}
      </span>
      <span className="erp-kpi-delta-note">{note}</span>
    </div>
  );
};

export const KpiCard: React.FC<{
  icon: LucideIcon;
  label: string;
  display: string;
  variation?: KpiVariation;
  higherIsBetter?: boolean;
}> = ({ icon: Icon, label, display, variation, higherIsBetter = true }) => (
  <div className="erp-kpi">
    <div className="erp-kpi-head">
      <span className="erp-kpi-label">{label}</span>
      <span className="erp-kpi-ico"><Icon size={16} /></span>
    </div>
    <div className="erp-kpi-value">{display}</div>
    {variation && <DeltaBadge variation={variation} higherIsBetter={higherIsBetter} />}
  </div>
);

// ---------------------------------------------------------------------------
// Semáforo de desempeño (verde / ámbar / rojo).
// ---------------------------------------------------------------------------
export const Semaforo: React.FC<{ pct: number; higherIsBetter?: boolean }> = ({ pct, higherIsBetter = true }) => {
  const eff = higherIsBetter ? pct : -pct;
  const tone = eff >= 2 ? "g" : eff <= -2 ? "r" : "a";
  const label = tone === "g" ? "Favorable" : tone === "r" ? "Crítico" : "Estable";
  return (
    <span className={`erp-sem ${tone}`}>
      <span className="d" /> {label}
    </span>
  );
};

// ---------------------------------------------------------------------------
// Panel de insights (hallazgos automáticos).
// ---------------------------------------------------------------------------
export const InsightsPanel: React.FC<{ title?: string; items: React.ReactNode[] }> = ({ title = "Hallazgos del periodo", items }) => (
  <div className="erp-panel">
    <div className="erp-panel-head"><Lightbulb size={13} /> {title}</div>
    <div className="erp-list">
      {items.map((t, i) => (
        <div className="erp-list-item" key={i}>
          <span className="erp-dot" />
          <span>{t}</span>
        </div>
      ))}
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Panel de alertas del negocio.
// ---------------------------------------------------------------------------
export interface AlertItem { tone: "red" | "amber" | "green"; text: React.ReactNode; }

export const AlertsPanel: React.FC<{ title?: string; items: AlertItem[] }> = ({ title = "Alertas del negocio", items }) => (
  <div className="erp-panel">
    <div className="erp-panel-head"><AlertTriangle size={13} /> {title}</div>
    {items.length === 0 ? (
      <div className="erp-alert-empty">
        Sin excepciones relevantes en el periodo. La operación se encuentra dentro de parámetros normales.
      </div>
    ) : (
      <div style={{ padding: "3px 12px 8px" }}>
        {items.map((a, i) => (
          <div className={`erp-alert-item ${a.tone}`} key={i}>
            {a.tone === "green" ? (
              <CheckCircle2 size={13} style={{ flexShrink: 0, marginTop: 1 }} />
            ) : (
              <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
            )}
            <span>{a.text}</span>
          </div>
        ))}
      </div>
    )}
  </div>
);

// ---------------------------------------------------------------------------
// Tarjeta contenedora de gráfica — cada gráfica responde una pregunta.
// ---------------------------------------------------------------------------
export const ChartCard: React.FC<{ question: string; sub?: string; full?: boolean; children: React.ReactNode }> = ({
  question,
  sub,
  full,
  children,
}) => (
  <div className={`erp-chart-card${full ? " full" : ""}`}>
    <div className="erp-chart-q">{question}</div>
    {sub && <div className="erp-chart-sub">{sub}</div>}
    {children}
  </div>
);

// ---------------------------------------------------------------------------
// Dona con leyenda lateral propia. Las etiquetas viven FUERA del lienzo de la
// gráfica (lista HTML), por lo que nunca se cortan ni se enciman; si hay más
// segmentos que `maxSlices`, el excedente se agrupa automáticamente en «Otros».
// ---------------------------------------------------------------------------
export interface DonutSlice { name: string; value: number; color: string; }

export const DonutCard: React.FC<{
  question: string;
  sub?: string;
  data: DonutSlice[];
  format: (v: number) => string;
  centerTitle?: string;
  maxSlices?: number;
  full?: boolean;
}> = ({ question, sub, data, format, centerTitle = "Total", maxSlices = 5, full }) => {
  const sorted = [...data].filter((d) => d.value > 0).sort((a, b) => b.value - a.value);
  let slices = sorted;
  if (sorted.length > maxSlices) {
    const kept = sorted.slice(0, maxSlices - 1);
    const rest = sorted.slice(maxSlices - 1);
    slices = [...kept, { name: "Otros", value: rest.reduce((a, s) => a + s.value, 0), color: "#94a3b8" }];
  }
  const total = slices.reduce((a, s) => a + s.value, 0);

  return (
    <div className={`erp-chart-card${full ? " full" : ""}`}>
      <div className="erp-chart-q">{question}</div>
      {sub && <div className="erp-chart-sub">{sub}</div>}
      <div className="erp-donut">
        <div className="erp-donut-plot">
          {total > 0 && (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
                <Pie
                  data={slices}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius="62%"
                  outerRadius="96%"
                  stroke="#ffffff"
                  strokeWidth={2}
                  isAnimationActive={false}
                >
                  {slices.map((s, i) => <Cell key={i} fill={s.color} />)}
                </Pie>
                <Tooltip formatter={(v: any, n: any) => [format(Number(v)), n]} />
              </PieChart>
            </ResponsiveContainer>
          )}
          <div className="erp-donut-center">
            <span className="t">{centerTitle}</span>
            <span className="v">{total > 0 ? format(total) : "—"}</span>
          </div>
        </div>
        {total > 0 ? (
          <div className="erp-donut-legend">
            {slices.map((s) => (
              <div className="erp-donut-row" key={s.name}>
                <span className="erp-donut-swatch" style={{ background: s.color }} />
                <span className="erp-donut-name" title={s.name}>{s.name}</span>
                <span className="erp-donut-pct">{((s.value / total) * 100).toFixed(1)}%</span>
                <span className="erp-donut-val">{format(s.value)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="erp-donut-empty">Sin datos en el periodo.</div>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Tarjeta de ranking (Top N) con barra de participación relativa.
// ---------------------------------------------------------------------------
export interface RankingRow { rank: number; nombre: string; valor: string; meta?: string; share: number; }

export const RankingCard: React.FC<{ icon: LucideIcon; title: string; rows: RankingRow[]; full?: boolean }> = ({
  icon: Icon,
  title,
  rows,
  full,
}) => (
  <div className="erp-rank-card" style={full ? { gridColumn: "1 / -1" } : undefined}>
    <div className="erp-rank-head"><Icon size={13} /> {title}</div>
    {rows.length === 0 ? (
      <div className="erp-alert-empty">Sin datos en el periodo.</div>
    ) : (
      rows.map((r) => (
        <div className="erp-rank-row" key={r.rank}>
          <span className="erp-rank-num">{r.rank}</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span className="erp-rank-name" style={{ display: "block" }}>{r.nombre}</span>
            <span className="erp-rank-bar"><span style={{ width: `${Math.max(2, Math.min(100, r.share))}%` }} /></span>
          </span>
          {r.meta && <span className="erp-rank-meta">{r.meta}</span>}
          <span className="erp-rank-val">{r.valor}</span>
        </div>
      ))
    )}
  </div>
);
