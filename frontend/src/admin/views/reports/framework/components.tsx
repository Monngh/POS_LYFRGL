import React from "react";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Lightbulb,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react";
import { COMPANY, ReportLogo } from "./companyInfo";

// ---------------------------------------------------------------------------
// Página A4 con encabezado corporativo repetido y pie con numeración.
// ---------------------------------------------------------------------------
export const ReportPage: React.FC<{
  reportTitle: string;
  meta: { folio: string; branch: string; period: string };
  page: number;
  totalPages: number;
  footerUser: string;
  footerFilters?: string;
  cover?: boolean;
  landscape?: boolean;
  children: React.ReactNode;
}> = ({ reportTitle, meta, page, totalPages, footerUser, footerFilters, cover, landscape, children }) => (
  <section className={`erp-page${cover ? " erp-cover" : ""}${landscape ? " landscape" : ""}`}>
    {!cover && (
      <header className="erp-runhead">
        <div className="erp-runhead-left">
          <ReportLogo size={26} />
          <div>
            <div className="erp-runhead-title">{reportTitle}</div>
            <div className="erp-runhead-sub">{COMPANY.name} · {meta.branch}</div>
          </div>
        </div>
        <div className="erp-runhead-meta">
          Folio: {meta.folio}
          <br />
          {meta.period}
        </div>
      </header>
    )}
    {cover ? children : <div className="erp-page-body">{children}</div>}
    <footer className="erp-foot">
      <div>
        <span className="erp-foot-brand">{COMPANY.name}</span>
        {footerFilters ? <> · Filtros: <strong>{footerFilters}</strong></> : null}
      </div>
      <div>
        Generó: <strong>{footerUser}</strong> · {meta.branch} · Página {page} de {totalPages}
      </div>
    </footer>
  </section>
);

// ---------------------------------------------------------------------------
// Título de sección con icono.
// ---------------------------------------------------------------------------
export const SectionTitle: React.FC<{ icon: LucideIcon; title: string; sub?: string }> = ({ icon: Icon, title, sub }) => (
  <div className="erp-section-title">
    <span className="erp-st-icon"><Icon size={15} /></span>
    {title}
    {sub && <span className="erp-section-sub">{sub}</span>}
  </div>
);

// ---------------------------------------------------------------------------
// Tarjeta KPI con variación contra periodo anterior.
// ---------------------------------------------------------------------------
export interface KpiVariation { value: number; prev: number; delta: number; pct: number; }
export const KpiCard: React.FC<{
  icon: LucideIcon;
  label: string;
  display: string;
  variation: KpiVariation;
  higherIsBetter?: boolean;
}> = ({ icon: Icon, label, display, variation, higherIsBetter = true }) => {
  const pct = variation.pct;
  const flat = Math.abs(pct) < 0.05;
  const improved = higherIsBetter ? pct > 0 : pct < 0;
  const cls = flat ? "flat" : improved ? "up" : "down";
  const Arrow = flat ? Minus : pct > 0 ? TrendingUp : TrendingDown;
  return (
    <div className="erp-kpi">
      <div className="erp-kpi-head">
        <span className="erp-kpi-ico"><Icon size={14} /></span>
        <span className="erp-kpi-label">{label}</span>
      </div>
      <div className="erp-kpi-value">{display}</div>
      <div>
        <span className={`erp-kpi-delta ${cls}`}>
          <Arrow size={11} />
          {flat ? "0%" : `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`}
        </span>
        <span className="erp-kpi-delta-note"> vs. periodo ant.</span>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Panel de lista (insights).
// ---------------------------------------------------------------------------
export const InsightsPanel: React.FC<{ items: string[] }> = ({ items }) => (
  <div className="erp-panel">
    <div className="erp-panel-head"><Lightbulb size={14} /> Insights automáticos</div>
    <div className="erp-list">
      {items.map((t, i) => (
        <div className="erp-list-item" key={i}>
          <span className="erp-dot" />
          <span dangerouslySetInnerHTML={{ __html: t }} />
        </div>
      ))}
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Panel de alertas / excepciones.
// ---------------------------------------------------------------------------
export interface AlertItem { tone: "red" | "amber" | "green"; text: string; }
export const AlertsPanel: React.FC<{ items: AlertItem[] }> = ({ items }) => (
  <div className="erp-panel">
    <div className="erp-panel-head"><AlertTriangle size={14} /> Alertas y excepciones</div>
    {items.length === 0 ? (
      <div className="erp-alert-empty">Sin excepciones relevantes en el periodo. Operación dentro de parámetros normales.</div>
    ) : (
      <div style={{ padding: "4px 12px 9px" }}>
        {items.map((a, i) => (
          <div className={`erp-alert-item ${a.tone}`} key={i}>
            <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            <span dangerouslySetInnerHTML={{ __html: a.text }} />
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
