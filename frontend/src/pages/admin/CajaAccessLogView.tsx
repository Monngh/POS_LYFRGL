import React, { useState, useEffect, useCallback } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import api from "../../services/api";
import { validateDateRange, validateSearchText } from "../../utils/formValidation";
import {
  ui,
  type ViewProps,
  Toolbar,
  TableState,
  SectionHeader,
  useMediaQuery,
  fmtDate,
  fmtTime,
} from "./shared";

interface AccessLogRow {
  id: number;
  email: string;
  name: string;
  role: string;
  method: string;
  ipAddress: string | null;
  deviceId: string | null;
  createdAt: string;
  user: { id: number; name: string; email: string };
  branch: { id: number; name: string } | null;
}

const fmtDateTime = (iso: string) =>
  new Intl.DateTimeFormat("es-MX", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));

const MethodBadge: React.FC<{ method: string }> = ({ method }) => (
  <span
    style={{
      display: "inline-block",
      padding: "2px 10px",
      borderRadius: 12,
      fontSize: 11,
      fontWeight: 700,
      backgroundColor: method === "PASSWORD" ? "#dbeafe" : "#fef3c7",
      color: method === "PASSWORD" ? "#1d4ed8" : "#92400e",
      whiteSpace: "nowrap",
    }}
  >
    {method}
  </span>
);

const CajaAccessLogView: React.FC<ViewProps> = ({ refreshToken }) => {
  const isMobile = useMediaQuery("(max-width: 1024px)");
  const [expandedLogs, setExpandedLogs] = useState<Record<number, boolean>>({});
  const [rows, setRows] = useState<AccessLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const dateError = from && to ? validateDateRange(from, to) : undefined;
  const userSearchError = validateSearchText(userSearch, "La busqueda de usuario", { max: 120 });

  const toggleExpand = (id: number) => {
    setExpandedLogs((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Carga de datos corregida con balanceo de Zona Horaria Local -> UTC
  const load = useCallback(async () => {
    const invalidRange = from && to ? validateDateRange(from, to) : undefined;
    if (invalidRange) {
      setRows([]);
      setError(invalidRange);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {};

      // Ajustamos los límites de tiempo basados en la zona horaria del usuario
      if (from) {
        const localFrom = new Date(`${from}T00:00:00`);
        params.from = localFrom.toISOString();
      }
      if (to) {
        const localTo = new Date(`${to}T23:59:59.999`);
        params.to = localTo.toISOString();
      }

      const res = await api.get<{ logs: AccessLogRow[] }>("/api/admin/security/cashier-access", { params });
      setRows(res.data.logs);
    } catch (err: any) {
      setError(err.response?.data?.message || "No se pudieron cargar los accesos de caja.");
    } finally {
      setLoading(false);
    }
  }, [from, to, refreshToken]);

  useEffect(() => {
    load();
  }, [load]);

  const clearFilters = () => {
    setFrom("");
    setTo("");
    setUserSearch("");
  };

  const visible = userSearch.trim()
    ? rows.filter(
      (r) =>
        r.user.name.toLowerCase().includes(userSearch.toLowerCase()) ||
        r.user.email.toLowerCase().includes(userSearch.toLowerCase())
    )
    : rows;

  return (
    <div>
      <SectionHeader
        title="Accesos de Caja"
        subtitle="Historial de inicios de sesión de cajeros en las terminales"
      />

      {isMobile ? (
        /* Filtros móvil */
        <div style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          marginBottom: 16,
          padding: "12px",
          backgroundColor: "var(--surface-2)",
          borderRadius: 12,
          border: "1px solid var(--border)"
        }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--accent-strong)" }}>Desde:</label>
            <input
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => setFrom(e.target.value)}
              style={{
                ...ui.input,
                padding: "6px 10px",
                fontSize: 13,
                flex: 1,
                minWidth: 0,
                ...(dateError ? { borderColor: "#ef4444" } : {})
              }}
            />
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--accent-strong)" }}>Hasta:</label>
            <input
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
              style={{
                ...ui.input,
                padding: "6px 10px",
                fontSize: 13,
                flex: 1,
                minWidth: 0,
                ...(dateError ? { borderColor: "#ef4444" } : {})
              }}
            />
          </div>
          <div>
            <input
              type="text"
              placeholder="Buscar cajero..."
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              maxLength={120}
              style={{
                ...ui.input,
                padding: "6px 10px",
                fontSize: 13,
                width: "100%"
              }}
            />
          </div>
          <button
            onClick={clearFilters}
            style={{
              ...ui.ghostBtn,
              padding: "8px 14px",
              fontSize: 13,
              backgroundColor: "#f1f5f9",
              border: "1px solid #e2e8f0",
              borderRadius: "8px",
              color: "#64748b",
              fontWeight: 600,
              width: "100%"
            }}
            className="active-tap"
          >
            Limpiar filtros
          </button>
          {(dateError || userSearchError) && (
            <span style={{ color: "#b91c1c", fontSize: 12, fontWeight: 600 }}>
              {dateError || userSearchError}
            </span>
          )}
          <div style={{
            fontSize: 12,
            color: "var(--text-muted)",
            fontWeight: 600,
            textAlign: "center",
            paddingTop: 4,
            borderTop: "1px solid var(--border)"
          }}>
            {visible.length} registro{visible.length !== 1 ? "s" : ""}
          </div>
        </div>
      ) : (
        <Toolbar>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--accent-strong)" }}>Desde:</label>
            <input
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => setFrom(e.target.value)}
              style={{ ...inputStyle, ...(dateError ? { borderColor: "#ef4444" } : {}) }}
            />
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--accent-strong)" }}>Hasta:</label>
            <input
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
              style={{ ...inputStyle, ...(dateError ? { borderColor: "#ef4444" } : {}) }}
            />
            <input
              type="text"
              placeholder="Buscar cajero..."
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              maxLength={120}
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
              className="active-tap"
            >
              Limpiar filtros
            </button>
          </div>
          <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
            {visible.length} registro{visible.length !== 1 ? "s" : ""}
          </span>
        </Toolbar>
      )}

      {isMobile ? (
        <div style={{ overflowY: "auto", maxHeight: "62vh", padding: "8px 4px" }}>
          <div style={{
            display: "grid",
            gridTemplateColumns: "1.8fr 1.8fr 1.2fr",
            padding: "10px 12px",
            fontWeight: 700,
            fontSize: 10,
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.3px",
          }}>
            <div>Fecha</div>
            <div>Sucursal</div>
            <div style={{ textAlign: "right" }}>Acción</div>
          </div>

          {loading && (
            <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--text-faint)", fontSize: 13, fontWeight: 500 }}>
              Cargando información...
            </div>
          )}
          {error && (
            <div style={{ textAlign: "center", padding: "32px 16px", color: "#b91c1c", fontSize: 13, fontWeight: 500 }}>
              {error}
            </div>
          )}
          {!loading && !error && visible.length === 0 && (
            <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--text-faint)", fontSize: 13, fontWeight: 500 }}>
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
                    backgroundColor: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    marginBottom: 10,
                    boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
                    overflow: "hidden",
                  }}
                >
                  <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "6px 12px 5px 12px",
                    fontSize: 10,
                    fontWeight: 700,
                    color: "var(--text-muted)",
                    borderBottom: "1px solid var(--surface-3)",
                    backgroundColor: "var(--surface-2)",
                    letterSpacing: "0.2px",
                    textTransform: "uppercase"
                  }}>
                    <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "55%" }}>
                      {row.user.name}
                    </span>
                    <MethodBadge method={row.method} />
                  </div>

                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "1.8fr 1.8fr 1.2fr",
                    padding: "10px 12px",
                    alignItems: "center",
                    gap: "4px"
                  }}>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                      <div>{fmtDate(row.createdAt)}</div>
                      <div style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 1 }}>
                        {fmtTime(row.createdAt)}
                      </div>
                    </div>

                    <div style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: "var(--text-secondary)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis"
                    }}>
                      {row.branch?.name ?? "—"}
                    </div>

                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      <button
                        onClick={() => toggleExpand(row.id)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: "var(--surface)",
                          border: "1px solid var(--border-strong)",
                          borderRadius: 6,
                          width: 30,
                          height: 30,
                          cursor: "pointer",
                          color: "var(--text-muted)",
                          padding: 0,
                        }}
                        className="active-tap"
                      >
                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div style={{
                      padding: "12px",
                      margin: "0 12px 12px 12px",
                      backgroundColor: "var(--surface-2)",
                      borderRadius: "8px",
                      border: "1px solid var(--border)",
                      display: "grid",
                      gridTemplateColumns: "1fr",
                      gap: "6px",
                      textAlign: "left",
                    }}>
                      <div style={detailRowStyle}>
                        <span style={detailLabelStyle}>Cajero:</span>
                        <span style={detailValueStyle}>{row.user.name} ({row.user.email})</span>
                      </div>
                      <div style={detailRowStyle}>
                        <span style={detailLabelStyle}>Sucursal:</span>
                        <span style={detailValueStyle}>{row.branch?.name ?? "—"}</span>
                      </div>
                      <div style={detailRowStyle}>
                        <span style={detailLabelStyle}>Método:</span>
                        <span style={detailValueStyle}>{row.method}</span>
                      </div>
                      <div style={detailRowStyle}>
                        <span style={detailLabelStyle}>Dispositivo:</span>
                        <span style={{ ...detailValueStyle, fontFamily: "monospace", fontSize: 11, wordBreak: "break-all" }}>
                          {row.deviceId ?? "—"}
                        </span>
                      </div>
                      <div style={detailRowStyle}>
                        <span style={detailLabelStyle}>Dirección IP:</span>
                        <span style={{ ...detailValueStyle, fontFamily: "monospace", fontSize: 11 }}>
                          {row.ipAddress ?? "—"}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
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
                <th style={ui.th}>Cajero</th>
                <th style={ui.th}>Sucursal</th>
                <th style={{ ...ui.th, textAlign: "center" }}>Método</th>
                <th style={ui.th}>Dispositivo</th>
                <th style={{ ...ui.th, fontFamily: "monospace" }}>IP</th>
              </tr>
            </thead>
            <tbody>
              <TableState
                colSpan={6}
                loading={loading}
                error={error}
                empty={!loading && visible.length === 0}
                emptyText="No hay accesos de caja para los filtros seleccionados."
              />
              {!loading &&
                !error &&
                visible.map((row) => (
                  <tr key={row.id}>
                    <td style={{ ...ui.td, whiteSpace: "nowrap", color: "var(--text-secondary)" }}>{fmtDateTime(row.createdAt)}</td>
                    <td style={ui.td}>
                      <div style={{ fontWeight: 700, color: "var(--text)" }}>{row.user.name}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{row.user.email}</div>
                    </td>
                    <td style={{ ...ui.td, color: "var(--text-muted)" }}>
                      {row.branch?.name ?? <span style={{ color: "var(--border-strong)" }}>—</span>}
                    </td>
                    <td style={{ ...ui.td, textAlign: "center" }}>
                      <MethodBadge method={row.method} />
                    </td>
                    <td style={{ ...ui.td, fontFamily: "monospace", fontSize: 11, color: "var(--text-muted)" }}>
                      {row.deviceId ? `${row.deviceId.slice(0, 12)}…` : "—"}
                    </td>
                    <td style={{ ...ui.td, fontFamily: "monospace", fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
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
  backgroundColor: "var(--surface)",
  color: "var(--text-secondary)",
  outline: "none",
};

const detailRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-start",
  alignItems: "flex-start",
  gap: "6px",
  fontSize: 12,
  marginBottom: 3,
};

const detailLabelStyle: React.CSSProperties = {
  fontWeight: 700,
  color: "var(--text-muted)",
  minWidth: "70px",
  display: "inline-block",
  fontSize: "inherit",
};

const detailValueStyle: React.CSSProperties = {
  fontWeight: 600,
  color: "var(--text-secondary)",
  flex: 1,
  fontSize: "inherit",
  wordBreak: "break-word",
};
export default CajaAccessLogView;