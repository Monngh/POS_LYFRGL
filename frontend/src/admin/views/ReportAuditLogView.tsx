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

const REPORT_TYPES = [
  { value: "", label: "Todos los tipos" },
  { value: "VENTAS", label: "Ventas" },
  { value: "INVENTARIO", label: "Inventario" },
  { value: "COMPRAS", label: "Compras" },
  { value: "PERSONAL", label: "Personal" },
];

const parseFiltros = (raw: string | null): string => {
  if (!raw) return "Sin filtros";
  try {
    const obj = JSON.parse(raw);
    const entries = Object.entries(obj).filter(([, v]) => v !== "" && v !== undefined);
    if (entries.length === 0) return "Sin filtros";
    return entries
      .map(([k, v]) => {
        if (k === "from" || k === "to") {
          const d = new Date(v as string);
          return `${k === "from" ? "Del" : "Al"} ${d.toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit", year: "2-digit" })}`;
        }
        if (k === "branchId") return `Sucursal: ${v}`;
        return `${k}: ${v}`;
      })
      .join(" | ");
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

  const toggleExpand = (id: number) => setExpandedLogs((p) => ({ ...p, [id]: !p[id] }));

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
      render: (row) => <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{parseFiltros(row.filters)}</span>,
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
          title="Filtros de auditoría"
          activeCount={activeFilterLabels.length}
          summary={filterSummary}
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
        <>
          <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textAlign: "center", padding: "4px 0 10px" }}>
            {visible.length} registro{visible.length !== 1 ? "s" : ""}
          </div>
          <div style={{ overflowY: "auto", maxHeight: "62vh" }}>
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
                <div key={row.id} style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, marginBottom: 10, overflow: "hidden" }}>
                  <button
                    type="button"
                    onClick={() => toggleExpand(row.id)}
                    className="active-tap"
                    style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "11px 13px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}
                  >
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: "block", fontWeight: 700, fontSize: 13.5, color: "var(--text)", overflowWrap: "anywhere" }}>{row.reportName}</span>
                      <span style={{ display: "block", fontSize: 11.5, color: "var(--text-muted)", fontWeight: 600, marginTop: 2 }}>
                        {row.user.name} · {fmtDate(row.createdAt)} {fmtTime(row.createdAt)}
                      </span>
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                      <TypeBadge type={row.reportType} />
                      {isExpanded ? <ChevronUp size={16} color="var(--text-muted)" /> : <ChevronDown size={16} color="var(--text-muted)" />}
                    </span>
                  </button>
                  {isExpanded && (
                    <div style={{ padding: "4px 13px 12px", borderTop: "1px solid var(--surface-3)" }}>
                      {detailRow("Usuario", row.user.email)}
                      {detailRow("Sucursal", row.branch?.name ?? "—")}
                      {detailRow("Dispositivo", parseUserAgent(row.userAgent))}
                      {detailRow("Filtros", parseFiltros(row.filters))}
                      {detailRow("IP", <span style={{ fontFamily: "monospace" }}>{row.ipAddress ?? "—"}</span>)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
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
        <Pagination page={paged.page} pageCount={paged.pageCount} total={paged.total} from={paged.from} to={paged.to} onPage={paged.setPage} itemLabel="registros" />
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
