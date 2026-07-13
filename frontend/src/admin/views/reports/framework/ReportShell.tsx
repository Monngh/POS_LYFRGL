import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  BarChart3, ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
  Download, FileDown, Printer, Settings2, Sheet, ZoomIn, ZoomOut,
} from "lucide-react";
import { printReport, downloadReportPdf } from "./exports";
import type { ReportDocMeta } from "./components";

export interface ReportPageDef {
  id: string;
  toc?: string;
  render: (page: number, meta: ReportDocMeta) => React.ReactNode;
}

export interface ReportDocBundle {
  docMeta: Omit<ReportDocMeta, "totalPages">;
  pages: ReportPageDef[];
  filenameBase: string;
  onExcel?: () => void;
  onCsv?: () => void;
}

const A4_PX = 794;

export const ReportConfigPanel: React.FC<{
  open: boolean;
  onToggle?: () => void;
  canCollapse?: boolean;
  onGenerate: () => void;
  onClear?: () => void;
  loading?: boolean;
  generated?: boolean;
  children: React.ReactNode;
}> = ({ open, onToggle, canCollapse, onGenerate, onClear, loading, generated, children }) => (
  <div className="erp-config erp-no-print">
    <div className={`erp-config-head${open ? " open" : ""}`}>
      <div className="erp-config-title">
        <span className="ico"><Settings2 size={16} /></span>
        Configuración del reporte
      </div>
      {canCollapse && onToggle && (
        <button className="erp-btn erp-btn-ghost erp-btn-icon" onClick={onToggle} title={open ? "Contraer" : "Expandir"}>
          {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>
      )}
    </div>
    {open && (
      <>
        <div className="erp-config-grid">{children}</div>
        <div className="erp-config-actions">
          {onClear && <button className="erp-btn erp-btn-ghost" onClick={onClear}>Limpiar filtros</button>}
          <button className="erp-btn erp-btn-primary" onClick={onGenerate} disabled={loading}>
            <BarChart3 size={15} /> {loading ? "Generando…" : generated ? "Regenerar reporte" : "Generar reporte"}
          </button>
        </div>
      </>
    )}
  </div>
);

export const ReportShell: React.FC<{
  configPanel: React.ReactNode;
  ready: boolean;
  loading?: boolean;
  error?: string | null;
  emptyText?: string;
  doc?: ReportDocBundle;
}> = ({ configPanel, ready, loading, error, emptyText, doc }) => {
  const [zoom, setZoom] = useState(1);
  const [manualZoom, setManualZoom] = useState(false);
  const [current, setCurrent] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const folio = doc?.docMeta.folio;

  const fitZoom = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;
    const style = getComputedStyle(container);
    const paddingLeft = parseFloat(style.paddingLeft) || 0;
    const paddingRight = parseFloat(style.paddingRight) || 0;
    const availableWidth = container.clientWidth - paddingLeft - paddingRight;
    if (availableWidth <= 0) return;
    const ideal = availableWidth / A4_PX;
    const clamped = Math.min(1, Math.max(0.35, ideal));
    setZoom(Math.round(clamped * 100) / 100);
  }, []);

  useEffect(() => {
    if (!folio) return;
    setManualZoom(false);
    setCurrent(0);
    scrollRef.current?.scrollTo({ top: 0 });
    fitZoom();
  }, [folio, fitZoom]);

  useEffect(() => {
    if (!ready || manualZoom) return;
    const onResize = () => fitZoom();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [ready, manualZoom, fitZoom]);

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

  const goPage = (i: number, total: number) => {
    const idx = Math.max(0, Math.min(total - 1, i));
    setCurrent(idx);
    pageRefs.current[idx]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const onDownloadPdf = async () => {
    if (downloading || !doc) return;
    setDownloading(true);
    try {
      await downloadReportPdf(`${doc.filenameBase}_${new Date().toISOString().slice(0, 10)}`);
    } catch {
      printReport();
    } finally {
      setDownloading(false);
    }
  };

  if (error) return <div className="erp-doc" style={{ padding: 0, margin: 0, width: "100%" }}>{configPanel}<div className="erp-empty" style={{ color: "#b91c1c" }}>{error}</div></div>;

  if (!ready || !doc) {
    return (
      <div className="erp-doc" style={{ padding: 0, margin: 0, width: "100%" }}>
        {configPanel}
        <div className="erp-empty">
          {loading
            ? "Generando el reporte…"
            : emptyText ?? "Configure los filtros y presione «Generar reporte» para obtener la vista previa del documento."}
        </div>
      </div>
    );
  }

  const { pages } = doc;
  const docMeta: ReportDocMeta = { ...doc.docMeta, totalPages: pages.length };
  const tocEntries = pages
    .map((p, i) => ({ label: p.toc, index: i }))
    .filter((p): p is { label: string; index: number } => !!p.label);
  const activeToc = [...tocEntries].reverse().find((t) => t.index <= current)?.index ?? 0;

  const zoomStep = (dir: 1 | -1) => {
    setManualZoom(true);
    setZoom((z) => Math.min(1.4, Math.max(0.55, +(z + dir * 0.1).toFixed(2))));
  };

  return (
    <div className="erp-doc" style={{ padding: 0, margin: 0, width: "100%" }}>
      {configPanel}

      {/* Barra de la vista previa */}
      <div className="erp-previewbar erp-no-print">
        <button className="erp-btn erp-btn-ghost erp-btn-icon" onClick={() => zoomStep(-1)} title="Alejar"><ZoomOut size={15} /></button>
        <span style={{ fontSize: 12, fontWeight: 800, color: "var(--text-secondary)", minWidth: 42, textAlign: "center" }}>{Math.round(zoom * 100)}%</span>
        <button className="erp-btn erp-btn-ghost erp-btn-icon" onClick={() => zoomStep(1)} title="Acercar"><ZoomIn size={15} /></button>
        <div className="sep" />
        <button className="erp-btn erp-btn-ghost erp-btn-icon" onClick={() => goPage(current - 1, pages.length)} title="Página anterior"><ChevronLeft size={15} /></button>
        <span className="erp-pageind">Página {current + 1} de {pages.length}</span>
        <button className="erp-btn erp-btn-ghost erp-btn-icon" onClick={() => goPage(current + 1, pages.length)} title="Página siguiente"><ChevronRight size={15} /></button>
        <div className="erp-previewbar-actions">
          <button className="erp-btn erp-btn-primary" onClick={onDownloadPdf} disabled={downloading} title="Descargar el documento como PDF vectorial">
            <Download size={15} /> {downloading ? "Generando PDF…" : "Descargar PDF"}
          </button>
          <button className="erp-btn erp-btn-ghost" onClick={printReport} title="Enviar el mismo documento a la impresora"><Printer size={15} /> Imprimir</button>
          {doc.onExcel && <button className="erp-btn erp-btn-ghost" onClick={doc.onExcel}><Sheet size={15} /> Excel</button>}
          {doc.onCsv && <button className="erp-btn erp-btn-ghost" onClick={doc.onCsv}><FileDown size={15} /> CSV</button>}
        </div>
      </div>

      <div className="erp-shell" style={{ padding: 0 }}>
        {tocEntries.length > 0 && (
          <nav className="erp-toc erp-no-print">
            <div className="erp-toc-title">Contenido del reporte</div>
            {tocEntries.map((t, n) => (
              <button key={t.index} className={`erp-toc-item${t.index === activeToc ? " active" : ""}`} onClick={() => goPage(t.index, pages.length)}>
                <span className="erp-toc-num">{n + 1}</span>
                {t.label}
              </button>
            ))}
          </nav>
        )}

        <div className="erp-main" style={{ padding: 0 }}>
          <div
            className="erp-doc-scroll"
            ref={scrollRef}
            onScroll={onDocScroll}
            style={{
              overflowY: "auto",
              touchAction: "pan-y",
              padding: 0,
            }}
          >
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