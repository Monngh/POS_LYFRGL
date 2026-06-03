import React from "react";
import { Search } from "lucide-react";

// ---------------------------------------------------------------------------
// Helpers de formato (es-MX)
// ---------------------------------------------------------------------------
export const money = (n: number) =>
  `$${Math.round(n).toLocaleString("es-MX", { maximumFractionDigits: 0 })}`;

export const moneyExact = (n: number) =>
  n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });

export const fmtDate = (d: string | Date) =>
  new Date(d).toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit", year: "numeric" });

export const fmtTime = (d: string | Date) =>
  new Date(d).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });

export const fmtDateTime = (d: string | Date) => `${fmtDate(d)} ${fmtTime(d)}`;

// ---------------------------------------------------------------------------
// Impresión profesional: abre una ventana con estilos corporativos e imprime
// ---------------------------------------------------------------------------
export const printHtml = (title: string, bodyHtml: string) => {
  const w = window.open("", "_blank", "width=920,height=720");
  if (!w) {
    alert("Habilite las ventanas emergentes para imprimir el documento.");
    return;
  }
  w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8" />
    <title>${title}</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: 'Segoe UI', Inter, system-ui, sans-serif; color: #0f172a; padding: 32px; }
      .doc-header { display: flex; justify-content: space-between; align-items: flex-start;
        border-bottom: 3px solid #1e3a8a; padding-bottom: 14px; margin-bottom: 20px; }
      .doc-brand { font-size: 20px; font-weight: 800; color: #1e3a8a; }
      .doc-sub { font-size: 12px; color: #64748b; margin-top: 2px; }
      .doc-title { font-size: 13px; font-weight: 700; color: #334155; text-align: right; }
      .doc-meta { font-size: 11px; color: #64748b; text-align: right; margin-top: 4px; }
      h3 { font-size: 14px; color: #1e3a8a; margin: 22px 0 10px; }
      table { width: 100%; border-collapse: collapse; margin-top: 6px; }
      th { background: #f1f5f9; text-align: left; font-size: 11px; text-transform: uppercase;
        letter-spacing: .4px; color: #475569; padding: 8px 10px; border-bottom: 1px solid #e2e8f0; }
      td { font-size: 12px; padding: 8px 10px; border-bottom: 1px solid #f1f5f9; color: #334155; }
      .r { text-align: right; } .c { text-align: center; }
      .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
      .kpi { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 14px; }
      .kpi .l { font-size: 11px; color: #64748b; } .kpi .v { font-size: 18px; font-weight: 800; margin-top: 4px; }
      .foot { margin-top: 28px; border-top: 1px solid #e2e8f0; padding-top: 10px; font-size: 10px; color: #94a3b8; text-align: center; }
      @media print { body { padding: 0; } .kpi, th, td { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    </style></head><body>${bodyHtml}
    <div class="foot">LYFRGL Solutions POS • Documento generado el ${new Date().toLocaleString("es-MX")}</div>
    <script>window.onload=function(){setTimeout(function(){window.print();},120);};</script>
    </body></html>`);
  w.document.close();
};

// ---------------------------------------------------------------------------
// Props comunes que el shell pasa a cada vista
// ---------------------------------------------------------------------------
export interface ViewProps {
  branchId: string;
  refreshToken: number;
}

// ---------------------------------------------------------------------------
// Badge de estado (usa los tokens semánticos ya existentes del POS)
// ---------------------------------------------------------------------------
type Tone = "green" | "red" | "amber" | "blue" | "slate";
const toneMap: Record<Tone, { bg: string; fg: string }> = {
  green: { bg: "#dcfce7", fg: "#15803d" },
  red: { bg: "#fee2e2", fg: "#b91c1c" },
  amber: { bg: "#fef3c7", fg: "#b45309" },
  blue: { bg: "#eff6ff", fg: "#2563eb" },
  slate: { bg: "#f1f5f9", fg: "#475569" },
};

export const Badge: React.FC<{ tone: Tone; children: React.ReactNode }> = ({ tone, children }) => {
  const c = toneMap[tone];
  return (
    <span
      style={{
        backgroundColor: c.bg,
        color: c.fg,
        fontSize: 11,
        fontWeight: 700,
        padding: "3px 9px",
        borderRadius: 999,
        whiteSpace: "nowrap",
        letterSpacing: "0.2px",
      }}
    >
      {children}
    </span>
  );
};

// Mapas de tono por dominio
export const statusTone = (status: string): Tone =>
  status === "COMPLETADA" || status === "ABIERTA" ? "green" : status === "CANCELADA" ? "red" : "slate";

export const roleTone = (role: string): Tone =>
  role === "ADMIN" ? "blue" : role === "GERENTE" ? "amber" : "slate";

export const payTone = (m: string): Tone =>
  m === "EFECTIVO" ? "green" : m === "TARJETA" ? "blue" : m === "MIXTO" ? "amber" : "slate";

// ---------------------------------------------------------------------------
// Barra de filtros
// ---------------------------------------------------------------------------
export const Toolbar: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={ui.toolbar}>{children}</div>
);

export const SearchInput: React.FC<{
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}> = ({ value, onChange, placeholder }) => (
  <div style={ui.searchBox}>
    <Search size={16} color="#94a3b8" />
    <input
      style={ui.searchInput}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder || "Buscar..."}
    />
  </div>
);

export const FilterSelect: React.FC<{
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}> = ({ value, onChange, options }) => (
  <select style={ui.filterSelect} value={value} onChange={(e) => onChange(e.target.value)}>
    {options.map((o) => (
      <option key={o.value} value={o.value}>
        {o.label}
      </option>
    ))}
  </select>
);

// Panel/tarjeta blanca
export const Panel: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({
  children,
  style,
}) => <div style={{ ...ui.panel, ...style }}>{children}</div>;

// Fila de estado (cargando / vacío / error) que ocupa toda la tabla
export const TableState: React.FC<{
  colSpan: number;
  loading?: boolean;
  error?: string | null;
  empty?: boolean;
  emptyText?: string;
}> = ({ colSpan, loading, error, empty, emptyText }) => {
  let content: React.ReactNode = null;
  if (loading) content = "Cargando información...";
  else if (error) content = error;
  else if (empty) content = emptyText || "No hay registros para mostrar.";
  if (content === null) return null;
  return (
    <tr>
      <td
        colSpan={colSpan}
        style={{
          textAlign: "center",
          padding: "32px 16px",
          color: error ? "#b91c1c" : "#94a3b8",
          fontSize: 13,
          fontWeight: 500,
        }}
      >
        {content}
      </td>
    </tr>
  );
};

// Encabezado de cada sección
export const SectionHeader: React.FC<{ title: string; subtitle?: string; right?: React.ReactNode }> = ({
  title,
  subtitle,
  right,
}) => (
  <div style={ui.sectionHeader}>
    <div>
      <h2 style={ui.sectionTitle}>{title}</h2>
      {subtitle && <p style={ui.sectionSubtitle}>{subtitle}</p>}
    </div>
    {right}
  </div>
);

// ---------------------------------------------------------------------------
// Estilos compartidos (paleta azul/navy corporativa)
// ---------------------------------------------------------------------------
export const ui: { [k: string]: React.CSSProperties } = {
  toolbar: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
  },
  searchBox: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    border: "1px solid #e2e8f0",
    borderRadius: 8,
    padding: "0 12px",
    height: 38,
    backgroundColor: "#ffffff",
    minWidth: 240,
    flex: "0 1 320px",
  },
  searchInput: {
    border: "none",
    outline: "none",
    fontSize: 13,
    fontWeight: 500,
    color: "#0f172a",
    width: "100%",
    backgroundColor: "transparent",
    fontFamily: "inherit",
  },
  filterSelect: {
    border: "1px solid #e2e8f0",
    borderRadius: 8,
    height: 38,
    padding: "0 12px",
    fontSize: 13,
    fontWeight: 600,
    color: "#334155",
    backgroundColor: "#ffffff",
    cursor: "pointer",
    fontFamily: "inherit",
    outline: "none",
  },
  panel: {
    backgroundColor: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: 12,
    boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
  },
  sectionHeader: {
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginBottom: 18,
    gap: 16,
    flexWrap: "wrap",
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 800,
    color: "#0f172a",
    letterSpacing: "-0.4px",
  },
  sectionSubtitle: {
    fontSize: 13,
    color: "#64748b",
    marginTop: 3,
  },

  // Tablas
  tableWrap: {
    backgroundColor: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: 12,
    overflow: "hidden",
    boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    textAlign: "left",
  },
  theadRow: {
    backgroundColor: "#f8fafc",
    borderBottom: "1px solid #e2e8f0",
  },
  th: {
    padding: "12px 16px",
    fontSize: 11,
    fontWeight: 700,
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: "0.4px",
    whiteSpace: "nowrap",
  },
  td: {
    padding: "13px 16px",
    fontSize: 13,
    color: "#334155",
    borderBottom: "1px solid #f1f5f9",
    whiteSpace: "nowrap",
  },

  // Botones
  primaryBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    backgroundColor: "#1e3a8a",
    color: "#ffffff",
    border: "none",
    borderRadius: 8,
    padding: "9px 16px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    height: 38,
  },
  ghostBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#ffffff",
    color: "#1e3a8a",
    border: "1px solid #cbd5e1",
    borderRadius: 8,
    padding: "8px 14px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
  },
  linkBtn: {
    background: "none",
    border: "none",
    color: "#2563eb",
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
    padding: 0,
  },

  // Mini-tarjetas de KPI (reportes)
  kpiGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: 16,
  },
  kpiCard: {
    backgroundColor: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: 12,
    padding: "16px 18px",
    boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
  },
  kpiLabel: { fontSize: 12, fontWeight: 600, color: "#64748b" },
  kpiValue: { fontSize: 23, fontWeight: 800, color: "#0f172a", marginTop: 8, letterSpacing: "-0.4px" },

  // Modal
  overlay: {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(15,23,42,0.45)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 200,
    padding: 20,
  },
  modal: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    boxShadow: "0 20px 25px -5px rgba(0,0,0,0.2)",
    width: "100%",
    maxWidth: 460,
    maxHeight: "88vh",
    overflowY: "auto",
  },
  modalHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "18px 22px",
    borderBottom: "1px solid #e2e8f0",
  },
  modalTitle: { fontSize: 16, fontWeight: 800, color: "#0f172a" },
  modalBody: { padding: 22 },
  fieldLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: "0.4px",
    marginBottom: 6,
    display: "block",
  },
  input: {
    width: "100%",
    padding: "10px 12px",
    border: "1px solid #e2e8f0",
    borderRadius: 8,
    fontSize: 14,
    color: "#0f172a",
    outline: "none",
    fontFamily: "inherit",
    backgroundColor: "#ffffff",
  },
};
