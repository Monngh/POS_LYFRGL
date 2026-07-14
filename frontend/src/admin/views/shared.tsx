import React from "react";
import { ChevronDown, ChevronUp, Search } from "lucide-react";
import { validateSearchText } from "../../shared/utils/formValidation";
import { openTicketPrintWindow } from "../../shared/utils/ticketEmailDocument.util";

// ---------------------------------------------------------------------------
// Hook de responsividad compartido: reacciona al ancho del viewport en vivo.
// Úsalo en cualquier vista admin: const isMobile = useMediaQuery("(max-width: 768px)")
// ---------------------------------------------------------------------------
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = React.useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches
  );
  React.useEffect(() => {
    const m = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    setMatches(m.matches);
    m.addEventListener("change", handler);
    return () => m.removeEventListener("change", handler);
  }, [query]);
  return matches;
}

// ---------------------------------------------------------------------------
// Helpers de formato (es-MX)
// ---------------------------------------------------------------------------
export const money = (n: number) => {
  const num = Number(n);
  if (isNaN(num)) return "$0.00";
  return `$${num.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

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
export const printHtml = (
  title: string,
  bodyHtml: string,
  showToast: (message: string, type?: "success" | "error" | "info" | "warning") => void
) => {
  const w = window.open("", "_blank", "width=920,height=720");
  if (!w) {
    const msg = "Habilite las ventanas emergentes para imprimir el documento.";
    showToast(msg, "warning");
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
        letter-spacing: .4px; color: #475569; padding: 8px 10px; border-bottom: 1px solid var(--border); }
      td { font-size: 12px; padding: 8px 10px; border-bottom: 1px solid var(--border-soft); color: #334155; }
      .r { text-align: right; } .c { text-align: center; }
      .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
      .kpi { border: 1px solid var(--border); border-radius: 8px; padding: 12px 14px; }
      .kpi .l { font-size: 11px; color: #64748b; } .kpi .v { font-size: 18px; font-weight: 800; margin-top: 4px; }
      .foot { margin-top: 28px; border-top: 1px solid var(--border); padding-top: 10px; font-size: 10px; color: #94a3b8; text-align: center; }
      @media print { body { padding: 0; } .kpi, th, td { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    </style></head><body>${bodyHtml}
    <div class="foot">LYFRGL Solutions POS • Documento generado el ${new Date().toLocaleString("es-MX")}</div>
    <script>window.onload=function(){setTimeout(function(){window.print();},120);};</script>
    </body></html>`);
  w.document.close();
};

export const printTicketHtml = (
  title: string,
  bodyHtml: string,
  showToast: (message: string, type?: "success" | "error" | "info" | "warning") => void
) => {
  const printed = openTicketPrintWindow(title, bodyHtml);
  if (!printed) {
    const msg = "Habilite las ventanas emergentes para imprimir el comprobante.";
    showToast(msg, "warning");
  }
};

// ---------------------------------------------------------------------------
// Props comunes que el shell pasa a cada vista
// ---------------------------------------------------------------------------
export interface ViewProps {
  branchId: string;
  refreshToken: number;
  // Filtro pre-aplicado al navegar desde otra vista (ej. tarjetas del Dashboard).
  // Cada vista decide qué claves reconoce; debe aplicarse una sola vez al montar.
  initialFilters?: Record<string, any>;
  navigateTo?: (view: string, filter?: Record<string, any>) => void;
}

// ---------------------------------------------------------------------------
// Badge de estado (usa los tokens semánticos ya existentes del POS)
// ---------------------------------------------------------------------------
type Tone = "green" | "red" | "amber" | "blue" | "slate";

export const Badge: React.FC<{ tone: Tone; children: React.ReactNode }> = ({ tone, children }) => {
  const isDark = document.documentElement.classList.contains('theme-dark');
  const toneMap: Record<Tone, { bg: string; fg: string }> = {
    green: { bg: isDark ? "rgba(34,197,94,0.15)"   : "#dcfce7", fg: isDark ? "#22c55e" : "#15803d" },
    red:   { bg: isDark ? "rgba(239,68,68,0.15)"   : "#fee2e2", fg: isDark ? "#f87171" : "#b91c1c" },
    amber: { bg: isDark ? "rgba(245,158,11,0.15)"  : "#fef3c7", fg: isDark ? "#f59e0b" : "#b45309" },
    blue:  { bg: isDark ? "rgba(96,165,250,0.15)"  : "#eff6ff", fg: isDark ? "#60a5fa" : "#2563eb" },
    slate: { bg: isDark ? "rgba(148,163,184,0.12)" : "#f1f5f9", fg: isDark ? "#94a3b8" : "#475569" },
  };
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
  status === "COMPLETADA" || status === "ABIERTA" ? "green" : status === "CANCELADA" || status === "REVOCADO" ? "red" : "slate";

export const roleTone = (role: string): Tone =>
  role === "ADMIN" ? "blue" : role === "GERENTE" ? "amber" : "slate";

export const payTone = (m: string): Tone =>
  m === "EFECTIVO" ? "green" : m === "TARJETA" ? "blue" : m === "MIXTO" ? "amber" : "slate";

// ---------------------------------------------------------------------------
// Barra de filtros
// ---------------------------------------------------------------------------
export const Toolbar: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{ ...ui.toolbar, ...style }}>{children}</div>
);

export const MobileFilterDisclosure: React.FC<{
  id: string;
  title: string;
  activeCount?: number;
  summary?: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}> = ({ id, title, activeCount = 0, summary, isOpen, onToggle, children }) => (
  <div style={ui.mobileFilterBox}>
    <button
      type="button"
      aria-expanded={isOpen}
      aria-controls={id}
      onClick={onToggle}
      style={ui.mobileFilterToggle}
      className="active-tap"
    >
      <span style={ui.mobileFilterTitle}>
        {title}
        {activeCount > 0 ? ` (${activeCount})` : ""}
      </span>
      {isOpen ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
    </button>
    {summary && (
      <div style={ui.mobileFilterSummary}>
        {summary}
      </div>
    )}
    {isOpen && (
      <div id={id} style={ui.mobileFilterContent}>
        {children}
      </div>
    )}
  </div>
);

export const SearchInput: React.FC<{
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  style?: React.CSSProperties;
}> = ({ value, onChange, placeholder, style }) => {
  const error = validateSearchText(value, "La busqueda", { max: 120 });
  return (
    <div style={{ ...ui.searchField, ...style }}>
      <div style={{ ...ui.searchBox, borderColor: error ? "#dc2626" : "#e2e8f0" }}>
        <Search size={16} color="#94a3b8" />
        <input
          style={ui.searchInput}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder || "Buscar..."}
          aria-invalid={Boolean(error)}
        />
      </div>
      {error && <p style={ui.fieldError}>{error}</p>}
    </div>
  );
};

export const FilterSelect: React.FC<{
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: React.ReactNode }[];
  style?: React.CSSProperties;
}> = ({ value, onChange, options, style }) => (
  <select style={{ ...ui.filterSelect, ...style }} value={value} onChange={(e) => onChange(e.target.value)}>
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

// ---------------------------------------------------------------------------
// Paginación de tablas (lado cliente) — 50 registros por página por defecto.
// No elimina el scroll de la tabla: solo acota los registros renderizados y
// añade una barra de navegación. `resetKey` regresa a la página 1 cuando
// cambian los filtros/búsqueda.
// ---------------------------------------------------------------------------
export function usePagination<T>(
  items: T[],
  options?: { pageSize?: number; resetKey?: unknown }
) {
  const pageSize = options?.pageSize ?? 50;
  const resetKey = options?.resetKey;
  const [page, setPage] = React.useState(1);
  React.useEffect(() => {
    setPage(1);
  }, [resetKey]);
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, pageCount);
  const start = (current - 1) * pageSize;
  const pageItems = React.useMemo(() => items.slice(start, start + pageSize), [items, start, pageSize]);
  return {
    page: current,
    setPage,
    pageCount,
    pageSize,
    total,
    pageItems,
    from: total === 0 ? 0 : start + 1,
    to: Math.min(total, start + pageSize),
  };
}

const buildPageList = (page: number, pageCount: number): (number | "…")[] => {
  const out: (number | "…")[] = [];
  for (let p = 1; p <= pageCount; p++) {
    if (p === 1 || p === pageCount || (p >= page - 1 && p <= page + 1)) out.push(p);
    else if (out[out.length - 1] !== "…") out.push("…");
  }
  return out;
};

export const Pagination: React.FC<{
  page: number;
  pageCount: number;
  total: number;
  from: number;
  to: number;
  onPage: (p: number) => void;
  itemLabel?: string;
}> = ({ page, pageCount, total, from, to, onPage, itemLabel = "registros" }) => {
  if (pageCount <= 1) return null;
  const pages = buildPageList(page, pageCount);
  const navBtn: React.CSSProperties = {
    minWidth: 32,
    height: 32,
    padding: "0 9px",
    border: "1px solid var(--border)",
    borderRadius: 8,
    backgroundColor: "var(--surface)",
    color: "var(--text-secondary)",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
  };
  const disabled: React.CSSProperties = { opacity: 0.45, cursor: "not-allowed" };
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginTop: 14 }}>
      <span style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: 600 }}>
        Mostrando <strong style={{ color: "var(--text-secondary)" }}>{from}–{to}</strong> de{" "}
        <strong style={{ color: "var(--text-secondary)" }}>{total}</strong> {itemLabel}
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <button style={{ ...navBtn, ...(page <= 1 ? disabled : {}) }} onClick={() => page > 1 && onPage(page - 1)} disabled={page <= 1} aria-label="Página anterior" className="active-tap">‹</button>
        {pages.map((p, i) =>
          p === "…" ? (
            <span key={`e${i}`} style={{ color: "var(--text-faint)", fontSize: 13, padding: "0 2px" }}>…</span>
          ) : (
            <button
              key={p}
              onClick={() => onPage(p)}
              className="active-tap"
              style={{ ...navBtn, ...(p === page ? { backgroundColor: "var(--accent)", borderColor: "var(--accent)", color: "#ffffff" } : {}) }}
              aria-current={p === page ? "page" : undefined}
            >
              {p}
            </button>
          )
        )}
        <button style={{ ...navBtn, ...(page >= pageCount ? disabled : {}) }} onClick={() => page < pageCount && onPage(page + 1)} disabled={page >= pageCount} aria-label="Página siguiente" className="active-tap">›</button>
      </div>
    </div>
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
  mobileFilterBox: {
    border: "1px solid var(--border)",
    borderRadius: 10,
    backgroundColor: "var(--surface)",
    marginBottom: 12,
    overflow: "hidden",
    boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
  },
  mobileFilterToggle: {
    width: "100%",
    minHeight: 44,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    border: "none",
    backgroundColor: "var(--surface)",
    color: "var(--text)",
    padding: "10px 12px",
    cursor: "pointer",
    fontFamily: "inherit",
  },
  mobileFilterTitle: {
    fontSize: 13,
    fontWeight: 800,
    color: "var(--text)",
  },
  mobileFilterSummary: {
    padding: "0 12px 10px",
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-muted)",
    lineHeight: 1.35,
  },
  mobileFilterContent: {
    display: "grid",
    gap: 10,
    padding: "0 12px 12px",
    borderTop: "1px solid var(--border-soft)",
  },
  searchField: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    minWidth: 240,
    flex: "0 1 320px",
  },
  searchBox: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "0 12px",
    height: 38,
    backgroundColor: "var(--surface)",
    width: "100%",
  },
  searchInput: {
    border: "none",
    outline: "none",
    fontSize: 13,
    fontWeight: 500,
    color: "var(--text)",
    width: "100%",
    backgroundColor: "transparent",
    fontFamily: "inherit",
  },
  filterSelect: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    height: 38,
    padding: "0 12px",
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-secondary)",
    backgroundColor: "var(--surface)",
    cursor: "pointer",
    fontFamily: "inherit",
    outline: "none",
  },
  panel: {
    backgroundColor: "var(--surface)",
    border: "1px solid var(--border)",
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
    color: "var(--text)",
    letterSpacing: "-0.4px",
  },
  sectionSubtitle: {
    fontSize: 13,
    color: "var(--text-muted)",
    marginTop: 3,
  },

  // Tablas
  tableWrap: {
    backgroundColor: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    overflowX: "auto",
    overflowY: "hidden",
    width: "100%",
    maxWidth: "100%",
    boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
  },
  table: {
    width: "100%",
    minWidth: 700,
    borderCollapse: "collapse",
    textAlign: "left",
  },
  theadRow: {
    backgroundColor: "var(--surface-2)",
    borderBottom: "1px solid var(--border)",
  },
  th: {
    padding: "12px 16px",
    fontSize: 11,
    fontWeight: 700,
    color: "var(--text-muted)",
    textTransform: "uppercase",
    letterSpacing: "0.4px",
    whiteSpace: "normal",
    wordBreak: "break-word",
    overflowWrap: "anywhere",
  },
  td: {
    padding: "13px 16px",
    fontSize: 13,
    color: "var(--text-secondary)",
    borderBottom: "1px solid var(--border-soft)",
    whiteSpace: "normal",
    wordBreak: "break-word",
    overflowWrap: "anywhere",
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
    backgroundColor: "var(--surface)",
    color: "var(--accent-strong)",
    border: "1px solid var(--border-strong)",
    borderRadius: 8,
    padding: "8px 14px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
  },
  linkBtn: {
    background: "none",
    border: "none",
    color: "var(--accent)",
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
    padding: 0,
  },

  // Mini-tarjetas de KPI (reportes)
  kpiGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
    gap: 16,
  },
  kpiCard: {
    backgroundColor: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    padding: "16px 18px",
    boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
    minWidth: 0,
  },
  kpiLabel: { fontSize: 12, fontWeight: 600, color: "var(--text-muted)", overflowWrap: "anywhere" },
  kpiValue: { fontSize: "clamp(18px, 5vw, 23px)", fontWeight: 800, color: "var(--text)", marginTop: 8, letterSpacing: "-0.4px", overflowWrap: "break-word", minWidth: 0 },

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
    backgroundColor: "var(--surface)",
    borderRadius: 14,
    boxShadow: "0 20px 25px -5px rgba(0,0,0,0.2)",
    width: "100%",
    maxWidth: 460,
    maxHeight: "88vh",
    overflowY: "hidden",
    display: "flex",
    flexDirection: "column",
  },
  modalHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "18px 22px",
    borderBottom: "1px solid var(--border)",
  },
  modalTitle: { fontSize: 16, fontWeight: 800, color: "var(--text)" },
  modalBody: { padding: 22, overflowY: "auto", flex: 1, minHeight: 0 },
  fieldLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: "var(--text-secondary)",
    textTransform: "uppercase",
    letterSpacing: "0.4px",
    marginBottom: 6,
    display: "block",
  },
  input: {
    width: "100%",
    padding: "10px 12px",
    border: "1px solid var(--border)",
    borderRadius: 8,
    fontSize: 14,
    color: "var(--text)",
    outline: "none",
    fontFamily: "inherit",
    backgroundColor: "var(--input-bg)",
  },
  fieldError: {
    color: "var(--color-danger)",
    fontSize: 12,
    fontWeight: 600,
    margin: "4px 0 0",
  },
};

export interface SearchableProduct {
  sku: string;
  name: string;
  barcode?: string;
}

export const normalizeProductSearchText = (value: string): string => {
  if (!value) return "";
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
};

export const matchesProductSearch = (product: SearchableProduct, query: string): boolean => {
  const normalizedQuery = normalizeProductSearchText(query);
  if (!normalizedQuery) return true;

  const terms = normalizedQuery.split(/\s+/).filter(Boolean);
  const searchableText = normalizeProductSearchText(
    `${product.sku} ${product.barcode ?? ""} ${product.name}`
  );

  return terms.every((term) => searchableText.includes(term));
};

export const filterProductsBySearch = <T extends SearchableProduct>(
  products: T[],
  query: string
): T[] => {
  const normalizedQuery = normalizeProductSearchText(query);
  if (!normalizedQuery) return products;

  const matchingProducts = products.filter((product) => matchesProductSearch(product, query));

  return matchingProducts.sort((a, b) => {
    const q = normalizedQuery;
    const aSku = normalizeProductSearchText(a.sku);
    const bSku = normalizeProductSearchText(b.sku);
    const aBar = a.barcode ? normalizeProductSearchText(a.barcode) : "";
    const bBar = b.barcode ? normalizeProductSearchText(b.barcode) : "";
    const aName = normalizeProductSearchText(a.name);
    const bName = normalizeProductSearchText(b.name);

    // 1. Coincidencia exacta de SKU o código de barras
    const aExactSkuOrBar = aSku === q || aBar === q;
    const bExactSkuOrBar = bSku === q || bBar === q;
    if (aExactSkuOrBar && !bExactSkuOrBar) return -1;
    if (!aExactSkuOrBar && bExactSkuOrBar) return 1;

    // 2. Coincidencia exacta del nombre
    const aExactName = aName === q;
    const bExactName = bName === q;
    if (aExactName && !bExactName) return -1;
    if (!aExactName && bExactName) return 1;

    // 3. Nombre inicia con la búsqueda (completa o primer término)
    const aStartsWith = aName.startsWith(q);
    const bStartsWith = bName.startsWith(q);
    if (aStartsWith && !bStartsWith) return -1;
    if (!aStartsWith && bStartsWith) return 1;

    return 0;
  });
};
