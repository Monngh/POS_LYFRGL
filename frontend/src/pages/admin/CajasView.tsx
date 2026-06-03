import React, { useEffect, useState, useCallback } from "react";
import api from "../../services/api";
import {
  ui,
  type ViewProps,
  Toolbar,
  FilterSelect,
  Badge,
  TableState,
  SectionHeader,
  money,
  fmtDate,
  fmtTime,
  statusTone,
} from "./shared";

interface SessionRow {
  id: number;
  branch: string;
  cajero: string;
  openedAt: string;
  closedAt: string | null;
  initialAmount: number;
  cashIn: number;
  cashOut: number;
  expectedAmount: number;
  declaredAmount: number | null;
  difference: number | null;
  salesCount: number;
  status: string;
}

const CajasView: React.FC<ViewProps> = ({ branchId, refreshToken }) => {
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ sessions: SessionRow[] }>("/api/admin/cash-sessions", {
        params: {
          ...(branchId !== "all" ? { branchId } : {}),
          ...(status !== "all" ? { status } : {}),
        },
      });
      setRows(res.data.sessions);
    } catch (err: any) {
      setError(err.response?.data?.message || "No se pudieron cargar las sesiones de caja.");
    } finally {
      setLoading(false);
    }
  }, [branchId, status, refreshToken]);

  useEffect(() => {
    load();
  }, [load]);

  const openCount = rows.filter((r) => r.status === "ABIERTA").length;

  const diffColor = (d: number | null) => (d === null ? "#94a3b8" : d < 0 ? "#b91c1c" : d > 0 ? "#15803d" : "#334155");

  return (
    <div>
      <SectionHeader title="Cajas" subtitle="Turnos y arqueos de caja registrados" />

      <Toolbar>
        <FilterSelect
          value={status}
          onChange={setStatus}
          options={[
            { value: "all", label: "Todos los turnos" },
            { value: "ABIERTA", label: "Abiertas" },
            { value: "CERRADA", label: "Cerradas" },
          ]}
        />
        {openCount > 0 && (
          <span style={{ fontSize: 13, color: "#15803d", fontWeight: 700 }}>{openCount} caja(s) abierta(s)</span>
        )}
        <span style={{ marginLeft: "auto", fontSize: 13, color: "#64748b", fontWeight: 600 }}>
          {rows.length} sesión{rows.length === 1 ? "" : "es"}
        </span>
      </Toolbar>

      <div style={ui.tableWrap}>
        <table style={ui.table}>
          <thead>
            <tr style={ui.theadRow}>
              <th style={ui.th}>#</th>
              <th style={ui.th}>Sucursal</th>
              <th style={ui.th}>Cajero</th>
              <th style={ui.th}>Apertura</th>
              <th style={ui.th}>Cierre</th>
              <th style={{ ...ui.th, textAlign: "right" }}>Fondo</th>
              <th style={{ ...ui.th, textAlign: "center" }}>Ventas</th>
              <th style={{ ...ui.th, textAlign: "right" }}>Esperado</th>
              <th style={{ ...ui.th, textAlign: "right" }}>Declarado</th>
              <th style={{ ...ui.th, textAlign: "right" }}>Diferencia</th>
              <th style={{ ...ui.th, textAlign: "center" }}>Estado</th>
            </tr>
          </thead>
          <tbody>
            <TableState colSpan={11} loading={loading} error={error} empty={!loading && rows.length === 0} />
            {!loading &&
              !error &&
              rows.map((s) => (
                <tr key={s.id}>
                  <td style={{ ...ui.td, fontWeight: 700, color: "#1e3a8a" }}>{s.id}</td>
                  <td style={ui.td}>{s.branch}</td>
                  <td style={ui.td}>{s.cajero}</td>
                  <td style={ui.td}>
                    {fmtDate(s.openedAt)} <span style={{ color: "#94a3b8" }}>{fmtTime(s.openedAt)}</span>
                  </td>
                  <td style={ui.td}>
                    {s.closedAt ? (
                      <>
                        {fmtDate(s.closedAt)} <span style={{ color: "#94a3b8" }}>{fmtTime(s.closedAt)}</span>
                      </>
                    ) : (
                      <span style={{ color: "#94a3b8" }}>—</span>
                    )}
                  </td>
                  <td style={{ ...ui.td, textAlign: "right" }}>{money(s.initialAmount)}</td>
                  <td style={{ ...ui.td, textAlign: "center", fontWeight: 700 }}>{s.salesCount}</td>
                  <td style={{ ...ui.td, textAlign: "right", fontWeight: 700 }}>{money(s.expectedAmount)}</td>
                  <td style={{ ...ui.td, textAlign: "right" }}>
                    {s.declaredAmount !== null ? money(s.declaredAmount) : <span style={{ color: "#94a3b8" }}>—</span>}
                  </td>
                  <td style={{ ...ui.td, textAlign: "right", fontWeight: 800, color: diffColor(s.difference) }}>
                    {s.difference !== null ? money(s.difference) : "—"}
                  </td>
                  <td style={{ ...ui.td, textAlign: "center" }}>
                    <Badge tone={statusTone(s.status)}>{s.status}</Badge>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default CajasView;
