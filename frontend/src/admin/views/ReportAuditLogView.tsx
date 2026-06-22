import React, { useState, useEffect, useCallback } from "react";
import api from "../../shared/services/api";
import {
  ui,
  type ViewProps,
  Toolbar,
  TableState,
  SectionHeader,
} from "./shared";

interface AuditLogRow {
  id: number;
  reportName: string;
  reportType: string;
  filters: string | null;
  ipAddress: string | null;
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
      }}
    >
      {type}
    </span>
  );
};

const ReportAuditLogView: React.FC<ViewProps> = ({ refreshToken }) => {
  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [reportType, setReportType] = useState("");
  const [userSearch, setUserSearch] = useState("");

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

  return (
    <div>
      <SectionHeader
        title="Auditoría de Reportes"
        subtitle="Historial de consultas y descargas de reportes"
      />

      <Toolbar>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--accent-strong)" }}>Desde:</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            style={inputStyle}
          />
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--accent-strong)" }}>Hasta:</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            style={inputStyle}
          />
          <select
            value={reportType}
            onChange={(e) => setReportType(e.target.value)}
            style={{ ...inputStyle, cursor: "pointer" }}
          >
            {REPORT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Buscar usuario..."
            value={userSearch}
            onChange={(e) => setUserSearch(e.target.value)}
            style={{ ...inputStyle, minWidth: 160 }}
          />
          <button
            onClick={clearFilters}
            style={{
              padding: "8px 14px",
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600,
              color: "var(--text-secondary)",
            }}
          >
            Limpiar filtros
          </button>
        </div>
        <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
          {visible.length} registro{visible.length !== 1 ? "s" : ""}
        </span>
      </Toolbar>

      <div
        className="table-sticky-head"
        style={{ ...ui.tableWrap, overflowX: "auto", overflowY: "auto", maxHeight: "62vh" }}
      >
        <table style={ui.table}>
          <thead>
            <tr style={ui.theadRow}>
              <th style={ui.th}>Fecha / Hora</th>
              <th style={ui.th}>Usuario</th>
              <th style={ui.th}>Sucursal</th>
              <th style={ui.th}>Reporte</th>
              <th style={{ ...ui.th, textAlign: "center" }}>Tipo</th>
              <th style={ui.th}>Filtros aplicados</th>
              <th style={{ ...ui.th, fontFamily: "monospace" }}>IP</th>
            </tr>
          </thead>
          <tbody>
            <TableState
              colSpan={7}
              loading={loading}
              error={error}
              empty={!loading && visible.length === 0}
              emptyText="No hay registros de auditoría para los filtros seleccionados."
            />
            {!loading &&
              !error &&
              visible.map((row) => (
                <tr key={row.id}>
                  <td style={{ ...ui.td, whiteSpace: "nowrap", color: "var(--text-secondary)" }}>
                    {fmtDateTime(row.createdAt)}
                  </td>
                  <td style={ui.td}>
                    <div style={{ fontWeight: 700, color: "var(--text)" }}>{row.user.name}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{row.user.email}</div>
                  </td>
                  <td style={{ ...ui.td, color: "var(--text-muted)" }}>
                    {row.branch?.name ?? <span style={{ color: "#cbd5e1" }}>—</span>}
                  </td>
                  <td style={{ ...ui.td, fontWeight: 600, color: "var(--text)" }}>
                    {row.reportName}
                  </td>
                  <td style={{ ...ui.td, textAlign: "center" }}>
                    <TypeBadge type={row.reportType} />
                  </td>
                  <td style={{ ...ui.td, fontSize: 12, color: "var(--text-secondary)", maxWidth: 240 }}>
                    {parseFiltros(row.filters)}
                  </td>
                  <td
                    style={{
                      ...ui.td,
                      fontFamily: "monospace",
                      fontSize: 12,
                      color: "var(--text-muted)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {row.ipAddress ?? "—"}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const inputStyle: React.CSSProperties = {
  padding: "8px 12px",
  border: "1px solid #d1d5db",
  borderRadius: 6,
  fontSize: 13,
  flex: "1 1 120px",
  minWidth: 0,
  maxWidth: 180,
  fontFamily: "inherit",
};

export default ReportAuditLogView;
