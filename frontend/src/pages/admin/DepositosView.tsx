import React, { useEffect, useState, useCallback } from "react";
import api from "../../services/api";
import { ui, type ViewProps, Toolbar, Badge, TableState, SectionHeader, money, fmtDate, fmtTime, payTone } from "./shared";

interface DepositRow {
  id: number;
  accountMasked: string;
  targetName: string;
  amount: number;
  paymentType: string;
  comments: string | null;
  branch: string;
  sessionId: number;
  createdAt: string;
}

const DepositosView: React.FC<ViewProps> = ({ branchId, refreshToken }) => {
  const [rows, setRows] = useState<DepositRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ deposits: DepositRow[] }>("/api/admin/bank-deposits", {
        params: branchId !== "all" ? { branchId } : {},
      });
      setRows(res.data.deposits);
    } catch (err: any) {
      setError(err.response?.data?.message || "No se pudieron cargar los depósitos.");
    } finally {
      setLoading(false);
    }
  }, [branchId, refreshToken]);

  useEffect(() => {
    load();
  }, [load]);

  const total = rows.reduce((acc, d) => acc + d.amount, 0);

  return (
    <div>
      <SectionHeader title="Depósitos bancarios" subtitle="Retiros de efectivo de caja depositados a cuentas bancarias" />

      <Toolbar>
        <span style={{ fontSize: 13, color: "#334155", fontWeight: 700 }}>
          Total depositado: <span style={{ color: "#1e3a8a", fontWeight: 800 }}>{money(total)}</span>
        </span>
        <span style={{ marginLeft: "auto", fontSize: 13, color: "#64748b", fontWeight: 600 }}>
          {rows.length} depósito{rows.length === 1 ? "" : "s"}
        </span>
      </Toolbar>

      <div style={ui.tableWrap}>
        <table style={ui.table}>
          <thead>
            <tr style={ui.theadRow}>
              <th style={ui.th}>Fecha</th>
              <th style={ui.th}>Cuenta destino</th>
              <th style={ui.th}>Beneficiario</th>
              <th style={ui.th}>Sucursal</th>
              <th style={{ ...ui.th, textAlign: "center" }}>Tipo</th>
              <th style={{ ...ui.th, textAlign: "center" }}>Sesión</th>
              <th style={{ ...ui.th, textAlign: "right" }}>Monto</th>
            </tr>
          </thead>
          <tbody>
            <TableState colSpan={7} loading={loading} error={error} empty={!loading && rows.length === 0} emptyText="No hay depósitos bancarios registrados." />
            {!loading &&
              !error &&
              rows.map((d) => (
                <tr key={d.id}>
                  <td style={ui.td}>{fmtDate(d.createdAt)} <span style={{ color: "#94a3b8" }}>{fmtTime(d.createdAt)}</span></td>
                  <td style={{ ...ui.td, fontFamily: "monospace", color: "#475569" }}>{d.accountMasked}</td>
                  <td style={{ ...ui.td, fontWeight: 600, color: "#0f172a", whiteSpace: "normal" }}>{d.targetName}</td>
                  <td style={ui.td}>{d.branch}</td>
                  <td style={{ ...ui.td, textAlign: "center" }}>
                    <Badge tone={payTone(d.paymentType)}>{d.paymentType}</Badge>
                  </td>
                  <td style={{ ...ui.td, textAlign: "center", color: "#64748b" }}>#{d.sessionId}</td>
                  <td style={{ ...ui.td, textAlign: "right", fontWeight: 800, color: "#b91c1c" }}>-{money(d.amount)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DepositosView;
