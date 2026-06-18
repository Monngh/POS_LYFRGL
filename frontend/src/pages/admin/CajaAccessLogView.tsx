import React, { useState, useEffect, useCallback } from "react";
import api from "../../services/api";
import {
  ui,
  type ViewProps,
  Toolbar,
  TableState,
  SectionHeader,
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
      backgroundColor: "#dbeafe",
      color: "#1d4ed8",
      whiteSpace: "nowrap",
    }}
  >
    {method}
  </span>
);

const CajaAccessLogView: React.FC<ViewProps> = ({ refreshToken }) => {
  const [rows, setRows] = useState<AccessLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [userSearch, setUserSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {};
      if (from) params.from = from;
      if (to) params.to = to;
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

      <Toolbar>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--accent-strong)" }}>Desde:</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={inputStyle} />
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--accent-strong)" }}>Hasta:</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={inputStyle} />
          <input
            type="text"
            placeholder="Buscar cajero..."
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

export default CajaAccessLogView;
