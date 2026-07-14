import React, { useState, useEffect, useCallback } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import api from "../../shared/services/api";
import { DataTable } from "../../shared/ui";
import type { Column } from "../../shared/ui";
import {
  ui,
  type ViewProps,
  Toolbar,
  MobileFilterDisclosure,
  SectionHeader,
  useMediaQuery,
  fmtDate,
  fmtTime,
  usePagination,
  Pagination,
} from "./shared";

interface AuditLogRow {
  id: number;
  reportName: string;
  reportType: string;
  filters: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  user: { id: number; name: string; email: string };
  branch: { id: number; name: string } | null;
}

// Mismo shape que consumen ExistenciasReport/SalesReport desde este endpoint.
interface FilterOptions {
  branches: { id: number; name: string }[];
  sellers: { id: number; name: string; role: string }[];
  categories: { id: number; name: string }[];
  paymentMethods: string[];
}

const REPORT_TYPES = [
  { value: "", label: "Todos los tipos" },
  { value: "VENTAS", label: "Ventas" },
  { value: "INVENTARIO", label: "Inventario" },
  { value: "COMPRAS", label: "Compras" },
  { value: "PERSONAL", label: "Personal" },
];

// Flags booleanos que solo se muestran cuando están activos (true) — se omiten si vienen en false.
const BOOLEAN_FLAG_LABELS: Record<string, string> = {
  lowStock: "Solo stock bajo",
  includeInactive: "Incluye inactivos",
  onlyFinal: "Solo categorías finales",
};

const capitalizeFirst = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s);

const titleCaseWords = (s: string) =>
  s
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

// Fallback genérico para claves no listadas en FILTER_LABELS: camelCase → "Texto Legible".
const camelToLabel = (key: string) =>
  key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());

// Diccionario de traducción de filtros técnicos → texto legible en español. Resuelve IDs de
// sucursal/vendedor/categoría contra FilterOptions (de /api/admin/reports/filter-options); si
// options aún no cargó, cae de forma temporal al ID crudo en vez de bloquear el render.
const formatFilterEntry = (key: string, rawValue: unknown, options: FilterOptions | null): string | null => {
  const v = String(rawValue);

  if (key === "from" || key === "to") {
    const d = new Date(v);
    const label = Number.isNaN(d.getTime())
      ? v
      : d.toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit", year: "2-digit" });
    return `${key === "from" ? "Del" : "Al"} ${label}`;
  }

  if (key === "branchId") {
    if (v === "all") return "Todas las sucursales";
    const branch = options?.branches.find((b) => String(b.id) === v);
    return `Sucursal: ${branch?.name ?? `#${v}`}`;
  }

  if (key === "sellerId") {
    const seller = options?.sellers.find((s) => String(s.id) === v);
    return `Vendedor: ${seller?.name ?? `#${v}`}`;
  }

  if (key === "categoryId") {
    const category = options?.categories.find((c) => String(c.id) === v);
    return `Categoría: ${category?.name ?? `#${v}`}`;
  }

  if (key === "cashSessionId") return `Sesión de caja: #${v}`;

  if (key === "search") return `Búsqueda: "${v}"`;
  if (key === "customer") return `Cliente: "${v}"`;
  if (key === "product") return `Producto: "${v}"`;

  if (key === "paymentMethod") return `Método de pago: ${capitalizeFirst(v)}`;
  if (key === "status") return `Estado: ${capitalizeFirst(v)}`;

  if (key === "movementType") return titleCaseWords(v.replace(/_/g, " "));

  if (key in BOOLEAN_FLAG_LABELS) return v === "true" ? BOOLEAN_FLAG_LABELS[key] : null;

  return `${camelToLabel(key)}: ${v}`;
};

const parseFiltros = (raw: string | null, options: FilterOptions | null): string => {
  if (!raw) return "Sin filtros";
  try {
    const obj = JSON.parse(raw);
    const entries = Object.entries(obj).filter(([, v]) => v !== "" && v !== undefined && v !== null);
    if (entries.length === 0) return "Sin filtros";
    const formatted = entries
      .map(([k, v]) => formatFilterEntry(k, v, options))
      .filter((s): s is string => s !== null);
    return formatted.length > 0 ? formatted.join(" | ") : "Sin filtros";
  } catch {
    return raw;
  }
};

// Parseo simple de User-Agent (sin librerías): detección por substring.
// Los registros históricos previos a este campo no tienen userAgent guardado.
const parseUserAgent = (ua: string | null): string => {
  if (!ua) return "—";

  const isMobileUA = /Mobile|Android|iPhone|iPad/i.test(ua);
  const deviceLabel = isMobileUA ? "Móvil" : "Escritorio";

  let browser = "Desconocido";
  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) browser = "Chrome";
  else if (/Firefox\//i.test(ua)) browser = "Firefox";
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = "Safari";

  return `${deviceLabel} - ${browser}`;
};

const fmtDateTime = (iso: string) =>
  new Intl.DateTimeFormat("es-MX", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso));

type TypeKey = "VENTAS" | "INVENTARIO" | "COMPRAS" | "PERSONAL";

const TypeBadge: React.FC<{ type: string }> = ({ type }) => {
  const isDark = document.documentElement.classList.contains("theme-dark");
  const map: Record<TypeKey, { bg: string; color: string }> = {
    VENTAS:     { bg: isDark ? "rgba(96,165,250,0.15)"  : "#dbeafe", color: isDark ? "#60a5fa" : "#1d4ed8" },
    INVENTARIO: { bg: isDark ? "rgba(34,197,94,0.15)"   : "#d1fae5", color: isDark ? "#22c55e" : "#065f46" },
    COMPRAS:    { bg: isDark ? "rgba(245,158,11,0.15)"  : "#fef9c3", color: isDark ? "#f59e0b" : "#92400e" },
    PERSONAL:   { bg: isDark ? "rgba(167,139,250,0.15)" : "#ede9fe", color: isDark ? "#a78bfa" : "#5b21b6" },
  };
  const c = map[type as TypeKey] ?? { bg: "var(--surface-3)", color: "var(--text-secondary)" };
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: 12,
        fontSize: 11,
        fontWeight: 700,
        backgroundColor: c.bg,
        color: c.color,
        whiteSpace: "nowrap",
      }}
    >
      {type}
    </span>
  );
};

const ReportAuditLogView: React.FC<ViewProps> = ({ refreshToken }) => {
  const isMobile = useMediaQuery("(max-width: 1024px)");
  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [reportType, setReportType] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [expandedLogs, setExpandedLogs] = useState<Record<number, boolean>>({});
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [options, setOptions] = useState<FilterOptions | null>(null);

  const toggleExpand = (id: number) => setExpandedLogs((p) => ({ ...p, [id]: !p[id] }));

  useEffect(() => {
    api.get<FilterOptions>("/api/admin/reports/filter-options").then((r) => setOptions(r.data)).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {};
      if (from) params.from = from;
      if (to) params.to = to;
      if (reportType) params.reportType = reportType;

      const res = await api.get<{ logs: AuditLogRow[] }>("/api/admin/reports/audit-logs", { params });
      setRows(res.data.logs);
    } catch (err: any) {
      setError(err.response?.data?.message || "No se pudieron cargar los logs de auditoría.");
    } finally {
      setLoading(false);
    }
  }, [from, to, reportType, refreshToken]);

  useEffect(() => {
    load();
  }, [load]);

  const clearFilters = () => {
    setFrom("");
    setTo("");
    setReportType("");
    setUserSearch("");
  };

  const visible = userSearch.trim()
    ? rows.filter((r) =>
        r.user.name.toLowerCase().includes(userSearch.toLowerCase()) ||
        r.user.email.toLowerCase().includes(userSearch.toLowerCase())
      )
    : rows;

  // Calcula cuántas filas caben en pantalla según la altura disponible
  // (mismo patrón usado en ClientesView/ProveedoresView).
  const [dynPageSize, setDynPageSize] = useState(10);
  useEffect(() => {
    const ROW_H = 50;
    const FIXED = 314;
    const compute = () =>
      setDynPageSize(Math.max(5, Math.floor((window.innerHeight - FIXED) / ROW_H)));
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);

  const paged = usePagination(visible, {
    resetKey: `${from}|${to}|${reportType}|${userSearch}`,
    pageSize: dynPageSize,
  });

  const activeFilterLabels = [
    reportType ? REPORT_TYPES.find((t) => t.value === reportType)?.label ?? null : null,
    from ? `Desde ${from}` : null,
    to ? `Hasta ${to}` : null,
    userSearch.trim() ? "Búsqueda de usuario" : null,
  ].filter((label): label is string => Boolean(label));
  const filterSummary = activeFilterLabels.length > 0 ? activeFilterLabels.join(", ") : "Sin filtros activos";

  // ----------------------------- Detalle (móvil) ----------------------------
  const detailRow = (label: string, value: React.ReactNode) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "6px 0", borderBottom: "1px solid var(--surface-3)" }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.3px", flexShrink: 0 }}>
        {label}
      </span>
      <span style={{ fontSize: 12.5, color: "var(--text-secondary)", textAlign: "right", overflowWrap: "anywhere" }}>{value}</span>
    </div>
  );

  const columns: Column<AuditLogRow>[] = [
    {
      key: "createdAt",
      header: "Fecha / Hora",
      render: (row) => <span style={{ color: "var(--text-secondary)" }}>{fmtDateTime(row.createdAt)}</span>,
    },
    {
      key: "user",
      header: "Usuario",
      render: (row) => (
        <div>
          <div style={{ fontWeight: 700, color: "var(--text)" }}>{row.user.name}</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{row.user.email}</div>
        </div>
      ),
    },
    {
      key: "branch",
      header: "Sucursal",
      render: (row) => row.branch?.name ?? <span style={{ color: "var(--text-faint)" }}>—</span>,
    },
    {
      key: "reportName",
      header: "Reporte",
      render: (row) => <span style={{ fontWeight: 600, color: "var(--text)" }}>{row.reportName}</span>,
    },
    {
      key: "reportType",
      header: "Tipo",
      align: "center",
      render: (row) => <TypeBadge type={row.reportType} />,
    },
    {
      key: "userAgent",
      header: "Dispositivo",
      render: (row) => <span style={{ color: "var(--text-secondary)" }}>{parseUserAgent(row.userAgent)}</span>,
    },
    {
      key: "filters",
      header: "Filtros aplicados",
      render: (row) => <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{parseFiltros(row.filters, options)}</span>,
    },
    {
      key: "ipAddress",
      header: "IP",
      render: (row) => <span style={{ fontFamily: "monospace", fontSize: 12, color: "var(--text-muted)" }}>{row.ipAddress ?? "—"}</span>,
    },
  ];

  return (
    <div>
      <SectionHeader
        title="Auditoría de Reportes"
        subtitle="Historial de consultas y descargas de reportes"
      />

      {/* ============================== FILTROS ============================== */}
      {isMobile ? (
        <MobileFilterDisclosure
          id="report-audit-mobile-filters"
          title="Filtros"
          activeCount={activeFilterLabels.length}
          summary={
            <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {filterSummary}
            </span>
          }
          isOpen={filtersOpen}
          onToggle={() => setFiltersOpen((current) => !current)}
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 calc(50% - 5px)", minWidth: 130 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: "var(--accent-strong)" }}>Desde:</label>
              <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} style={{ ...inputStyle, flex: "none", maxWidth: "100%", padding: "6px 8px" }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 calc(50% - 5px)", minWidth: 130 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: "var(--accent-strong)" }}>Hasta:</label>
              <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} style={{ ...inputStyle, flex: "none", maxWidth: "100%", padding: "6px 8px" }} />
            </div>
            <select value={reportType} onChange={(e) => setReportType(e.target.value)} style={{ ...inputStyle, flex: "1 1 100%", maxWidth: "100%", cursor: "pointer", padding: "6px 8px" }}>
              {REPORT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <input type="text" placeholder="Buscar usuario..." value={userSearch} onChange={(e) => setUserSearch(e.target.value)} style={{ ...inputStyle, flex: "1 1 100%", maxWidth: "100%", padding: "6px 8px" }} />
            <button onClick={clearFilters} style={{ ...ui.ghostBtn, flex: "1 1 100%", justifyContent: "center", padding: "6px 8px", fontSize: 12 }} className="active-tap">
              Limpiar filtros
            </button>
          </div>
        </MobileFilterDisclosure>
      ) : (
        <Toolbar>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--accent-strong)" }}>Desde:</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={inputStyle} />
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--accent-strong)" }}>Hasta:</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={inputStyle} />
            <select value={reportType} onChange={(e) => setReportType(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
              {REPORT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <input type="text" placeholder="Buscar usuario..." value={userSearch} onChange={(e) => setUserSearch(e.target.value)} style={{ ...inputStyle, minWidth: 160 }} />
            <button onClick={clearFilters} style={{ ...ui.ghostBtn }} className="active-tap">
              Limpiar filtros
            </button>
          </div>
          <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
            {visible.length} registro{visible.length !== 1 ? "s" : ""}
          </span>
        </Toolbar>
      )}

      {/* ============================== MÓVIL: tarjetas/acordeón ============================== */}
      {isMobile ? (
        <div style={{ padding: "8px 16px" }}>
          {loading && (
            <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--text-faint)", fontSize: 13, fontWeight: 500 }}>Cargando información...</div>
          )}
          {error && (
            <div style={{ textAlign: "center", padding: "32px 16px", color: "#b91c1c", fontSize: 13, fontWeight: 500 }}>{error}</div>
          )}
          {!loading && !error && paged.total === 0 && (
            <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--text-faint)", fontSize: 13, fontWeight: 500 }}>
              No hay registros de auditoría para los filtros seleccionados.
            </div>
          )}
          {!loading && !error && paged.pageItems.map((row) => {
            const isExpanded = expandedLogs[row.id];
            return (
              <div key={row.id} style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, marginBottom: 10, boxShadow: "0 1px 2px rgba(0,0,0,0.02)", overflow: "hidden" }}>
                
                {/* Header: Fecha y Tipo */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 16px 6px 16px", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", borderBottom: "1px solid var(--border-soft)", backgroundColor: "var(--surface-2)", letterSpacing: "0.2px" }}>
                  <span>{fmtDate(row.createdAt)} {fmtTime(row.createdAt)}</span>
                  <TypeBadge type={row.reportType} />
                </div>

                {/* Fila principal */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", wordBreak: "break-word", overflowWrap: "anywhere", whiteSpace: "normal" }}>
                      {row.reportName}
                    </div>
                    <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>
                      Usuario: <strong>{row.user.name}</strong>
                    </div>
                  </div>
                  
                  {/* Chevron Button estandarizado */}
                  <div style={{ display: "flex", alignItems: "center", alignSelf: "center" }}>
                    <button onClick={() => toggleExpand(row.id)} className="active-tap" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", backgroundColor: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: 8, width: 38, height: 38, cursor: "pointer", color: "var(--accent)", padding: 0 }}>
                      {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </button>
                  </div>
                </div>

                {/* Expanded Content Premium */}
                {isExpanded && (
                  <div style={{ padding: "16px", margin: "0 16px 16px 16px", backgroundColor: "var(--surface-2)", borderRadius: "12px", border: "1px solid var(--border)" }}>
                    {detailRow("Usuario", row.user.email)}
                    {detailRow("Sucursal", row.branch?.name ?? "—")}
                    {detailRow("Dispositivo", parseUserAgent(row.userAgent))}
                    {detailRow("Filtros", parseFiltros(row.filters, options))}
                    {detailRow("IP", <span style={{ fontFamily: "monospace" }}>{row.ipAddress ?? "—"}</span>)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* ============================== ESCRITORIO: tabla ============================== */
        <DataTable
          columns={columns}
          data={paged.pageItems}
          loading={loading}
          error={error}
          emptyMessage="No hay registros de auditoría para los filtros seleccionados."
          keyExtractor={(row) => row.id}
          height="calc(100vh - 275px)"
        />
      )}

      {!loading && !error && (
        <div style={{ padding: isMobile ? "0 16px 16px" : "0", marginTop: isMobile ? -6 : 0 }}>
          <Pagination page={paged.page} pageCount={paged.pageCount} total={paged.total} from={paged.from} to={paged.to} onPage={paged.setPage} itemLabel="registros" />
        </div>
      )}
    </div>
  );
};

const inputStyle: React.CSSProperties = {
  padding: "8px 12px",
  border: "1px solid var(--border-strong)",
  borderRadius: 6,
  fontSize: 13,
  flex: "1 1 120px",
  minWidth: 0,
  maxWidth: 180,
  fontFamily: "inherit",
  backgroundColor: "var(--input-bg)",
  color: "var(--text)",
};

export default ReportAuditLogView;
