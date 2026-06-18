import React, { useState, useEffect, useCallback } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import api from "../../services/api";
import {
  ui,
  type ViewProps,
  Toolbar,
  TableState,
  SectionHeader,
  useMediaQuery,
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

const typeBadgeColor: Record<string, { bg: string; color: string }> = {
  VENTAS:     { bg: "#dbeafe", color: "#1d4ed8" },
  INVENTARIO: { bg: "#d1fae5", color: "#065f46" },
  COMPRAS:    { bg: "#fef9c3", color: "#92400e" },
  PERSONAL:   { bg: "#ede9fe", color: "#5b21b6" },
};

const TypeBadge: React.FC<{ type: string }> = ({ type }) => {
  const c = typeBadgeColor[type] ?? { bg: "#f1f5f9", color: "#334155" };
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
  const isMobile = useMediaQuery("(max-width: 1024px)");
  const [expandedLogs, setExpandedLogs] = useState<Record<number, boolean>>({});
  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [reportType, setReportType] = useState("");
  const [userSearch, setUserSearch] = useState("");

  const toggleExpand = (id: number) => {
    setExpandedLogs((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

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
          <label style={{ fontSize: 12, fontWeight: 600, color: "#1e3a8a" }}>Desde:</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            style={inputStyle}
          />
          <label style={{ fontSize: 12, fontWeight: 600, color: "#1e3a8a" }}>Hasta:</label>
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
              background: "#f3f4f6",
              border: "1px solid #d1d5db",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600,
              color: "#374151",
            }}
          >
            Limpiar filtros
          </button>
        </div>
        <span style={{ marginLeft: "auto", fontSize: 12, color: "#64748b", whiteSpace: "nowrap" }}>
          {visible.length} registro{visible.length !== 1 ? "s" : ""}
        </span>
      </Toolbar>

      {isMobile ? (
        <div style={{ ...ui.tableWrap, overflowX: "auto", overflowY: "auto", maxHeight: "62vh" }}>
          <div style={{ padding: "8px 16px" }}>
            {/* Cabecera de columnas */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "2.5fr 2.5fr 1fr",
              padding: "12px 16px",
              fontWeight: 700,
              fontSize: 11,
              color: "#64748b",
              textTransform: "uppercase",
              letterSpacing: "0.4px"
            }}>
              <div>Fecha</div>
              <div>Reporte</div>
              <div style={{ textAlign: "right", paddingRight: 8 }}>Mas</div>
            </div>

            {loading && (
              <div style={{ textAlign: "center", padding: "32px 16px", color: "#94a3b8", fontSize: 13, fontWeight: 500 }}>
                Cargando información...
              </div>
            )}
            {error && (
              <div style={{ textAlign: "center", padding: "32px 16px", color: "#b91c1c", fontSize: 13, fontWeight: 500 }}>
                {error}
              </div>
            )}
            {!loading && !error && visible.length === 0 && (
              <div style={{ textAlign: "center", padding: "32px 16px", color: "#94a3b8", fontSize: 13, fontWeight: 500 }}>
                No hay registros para mostrar.
              </div>
            )}

            {!loading &&
              !error &&
              visible.map((row) => {
                const isExpanded = expandedLogs[row.id];
                return (
                  <div
                    key={row.id}
                    style={{
                      backgroundColor: "#ffffff",
                      border: "1px solid #e2e8f0",
                      borderRadius: 12,
                      marginBottom: 10,
                      boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
                      overflow: "hidden",
                    }}
                  >
                    {/* Cabecera de tarjeta gris con el nombre del usuario y tipo badge */}
                    <div style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "8px 16px 6px 16px",
                      fontSize: 11,
                      fontWeight: 700,
                      color: "#64748b",
                      borderBottom: "1px solid #f1f5f9",
                      backgroundColor: "#f8fafc",
                      letterSpacing: "0.2px",
                      gap: "12px"
                    }}>
                      <div style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}>
                        <span style={{ color: "#0f172a", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {row.user.name.toUpperCase()}
                        </span>
                        <span style={{ fontSize: 10, color: "#64748b", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 1 }}>
                          {row.user.email}
                        </span>
                      </div>
                      <TypeBadge type={row.reportType} />
                    </div>

                    {/* Fila base */}
                    <div style={{
                      display: "grid",
                      gridTemplateColumns: "2.5fr 2.5fr 1fr",
                      padding: "12px 16px",
                      alignItems: "center",
                    }}>
                      {/* Fecha y Hora */}
                      <div style={{ fontSize: 13, color: "#334155" }}>
                        <div>{fmtDateTime(row.createdAt).split(" ")[0]}</div>
                        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                          {fmtDateTime(row.createdAt).split(" ").slice(1).join(" ")}
                        </div>
                      </div>

                      {/* Nombre de Reporte */}
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>
                        {row.reportName}
                      </div>

                      {/* Botón de Expansión */}
                      <div style={{ display: "flex", justifyContent: "flex-end" }}>
                        <button
                          onClick={() => toggleExpand(row.id)}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: "#ffffff",
                            border: "1px solid #cbd5e1",
                            borderRadius: 8,
                            width: 34,
                            height: 34,
                            cursor: "pointer",
                            color: "#64748b",
                            padding: 0,
                          }}
                          className="active-tap"
                        >
                          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>
                      </div>
                    </div>

                    {/* Contenido desplegable */}
                    {isExpanded && (
                      <div style={{
                        padding: "16px",
                        margin: "0 16px 16px 16px",
                        backgroundColor: "#f8fafc",
                        borderRadius: "8px",
                        border: "1px solid #e2e8f0",
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px",
                      }}>
                        <div style={detailRowStyle}>
                          <span style={detailLabelStyle}>Usuario:</span>
                          <span style={detailValueStyle}>{row.user.name}</span>
                        </div>
                        <div style={detailRowStyle}>
                          <span style={detailLabelStyle}>Sucursal:</span>
                          <span style={detailValueStyle}>{row.branch?.name ?? "—"}</span>
                        </div>
                        <div style={detailRowStyle}>
                          <span style={detailLabelStyle}>Filtros:</span>
                          <span style={{ ...detailValueStyle, wordBreak: "break-all" }}>
                            {parseFiltros(row.filters)}
                          </span>
                        </div>
                        <div style={detailRowStyle}>
                          <span style={detailLabelStyle}>Dirección IP:</span>
                          <span style={{ ...detailValueStyle, fontFamily: "monospace" }}>
                            {row.ipAddress ?? "—"}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      ) : (
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
                    <td style={{ ...ui.td, whiteSpace: "nowrap", color: "#475569" }}>
                      {fmtDateTime(row.createdAt)}
                    </td>
                    <td style={ui.td}>
                      <div style={{ fontWeight: 700, color: "#0f172a" }}>{row.user.name}</div>
                      <div style={{ fontSize: 11, color: "#64748b" }}>{row.user.email}</div>
                    </td>
                    <td style={{ ...ui.td, color: "#64748b" }}>
                      {row.branch?.name ?? <span style={{ color: "#cbd5e1" }}>—</span>}
                    </td>
                    <td style={{ ...ui.td, fontWeight: 600, color: "#1e293b" }}>
                      {row.reportName}
                    </td>
                    <td style={{ ...ui.td, textAlign: "center" }}>
                      <TypeBadge type={row.reportType} />
                    </td>
                    <td style={{ ...ui.td, fontSize: 12, color: "#475569", maxWidth: 240 }}>
                      {parseFiltros(row.filters)}
                    </td>
                    <td
                      style={{
                        ...ui.td,
                        fontFamily: "monospace",
                        fontSize: 12,
                        color: "#64748b",
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
      )}
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

const detailRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-start",
  alignItems: "flex-start",
  gap: "8px",
  fontSize: 13,
  marginBottom: 4,
};

const detailLabelStyle: React.CSSProperties = {
  fontWeight: 700,
  color: "#64748b",
  minWidth: "100px",
  display: "inline-block",
};

const detailValueStyle: React.CSSProperties = {
  fontWeight: 600,
  color: "#334155",
  flex: 1,
};

export default ReportAuditLogView;
