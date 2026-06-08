import React, { useEffect, useState, useCallback } from "react";
import api from "../../services/api";
import { ui, type ViewProps, Toolbar, Badge, TableState, SectionHeader, money, fmtDate, fmtTime, payTone, FilterSelect } from "./shared";

interface DepositRow {
  id: number;
  accountMasked: string;
  accountNumber: string;
  targetName: string;
  amount: number;
  paymentType: string;
  comments: string | null;
  branch: string;
  sessionId: number;
  createdAt: string;
  status: string;
}

const DepositosView: React.FC<ViewProps> = ({ branchId, refreshToken }) => {
  const [rows, setRows] = useState<DepositRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [account, setAccount] = useState<string>("");
  const [accounts, setAccounts] = useState<string[]>([]);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedDeposit, setSelectedDeposit] = useState<any>(null);
  const [confirmingDepositId, setConfirmingDepositId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, any> = branchId !== "all" ? { branchId } : {};
      if (from) params.from = from;
      if (to) params.to = to;
      if (account) params.account = account;

      const res = await api.get<{ deposits: DepositRow[] }>("/api/admin/bank-deposits", { params });
      setRows(res.data.deposits);
    } catch (err: any) {
      setError(err.response?.data?.message || "No se pudieron cargar los depósitos.");
    } finally {
      setLoading(false);
    }
  }, [branchId, refreshToken, from, to, account]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (rows.length > 0 && accounts.length === 0) {
      const uniqueAccounts = [...new Set(rows.map((r) => r.accountNumber))].filter(Boolean);
      setAccounts(uniqueAccounts);
    }
  }, [rows, accounts.length]);

  const confirmDeposit = async (depositId: number) => {
    if (confirmingDepositId === depositId) return;
    setConfirmingDepositId(depositId);
    try {
      await api.post(`/api/sales/deposits/${depositId}/confirm`);
      await load();
    } catch (err) {
      setError("Error al confirmar depósito");
    } finally {
      setConfirmingDepositId(null);
    }
  };

  const openDetail = (deposit: any) => {
    setSelectedDeposit(deposit);
    setDetailOpen(true);
  };

  const closeDetail = () => {
    setDetailOpen(false);
    setSelectedDeposit(null);
  };

  const printDeposit = (deposit: any) => {
    const printWindow = window.open('', '', 'width=800,height=600');

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Depósito #${deposit.id}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          h1 { color: #1e3a8a; font-size: 18px; text-align: center; }
          .section { margin: 20px 0; }
          .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
          .label { font-weight: bold; color: #1e3a8a; }
          .amount { color: #dc2626; font-weight: bold; font-size: 16px; }
          .footer { margin-top: 40px; text-align: center; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <h1>COMPROBANTE DE DEPÓSITO BANCARIO</h1>
        
        <div class="section">
          <div class="row">
            <span class="label">Folio Depósito:</span>
            <span>#${deposit.id}</span>
          </div>
          <div class="row">
            <span class="label">Fecha:</span>
            <span>${new Date(deposit.createdAt).toLocaleString()}</span>
          </div>
        </div>

        <div class="section">
          <div class="row">
            <span class="label">Cuenta Destino:</span>
            <span>${deposit.accountNumber}</span>
          </div>
          <div class="row">
            <span class="label">Beneficiario:</span>
            <span>${deposit.targetName}</span>
          </div>
          <div class="row">
            <span class="label">Sucursal:</span>
            <span>${deposit.branch?.name || deposit.branch || '—'}</span>
          </div>
        </div>

        <div class="section">
          <div class="row">
            <span class="label">Tipo de Transferencia:</span>
            <span>${deposit.paymentType}</span>
          </div>
          <div class="row">
            <span class="label">Referencia:</span>
            <span>${deposit.reference || '—'}</span>
          </div>
          <div class="row">
            <span class="label">Monto:</span>
            <span class="amount">-$${deposit.amount.toFixed(2)}</span>
          </div>
        </div>

        <div class="section">
          <div class="row">
            <span class="label">Estado:</span>
            <span>${deposit.status}</span>
          </div>
          <div class="row">
            <span class="label">Comentarios:</span>
            <span>${deposit.comments || 'Sin comentarios'}</span>
          </div>
        </div>

        <div class="footer">
          <p>Generado: ${new Date().toLocaleString()}</p>
          <p>Este es un comprobante de depósito bancario.</p>
        </div>
      </body>
      </html>
    `;

    printWindow?.document.write(htmlContent);
    printWindow?.document.close();

    setTimeout(() => {
      printWindow?.print();
    }, 250);
  };

  const total = rows.reduce((acc, d) => acc + d.amount, 0);

  return (
    <div>
      <SectionHeader title="Depósitos bancarios" subtitle="Retiros de efectivo de caja depositados a cuentas bancarias" />

      <Toolbar>
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <label style={{ fontSize: "12px", fontWeight: "600", color: "#1e3a8a" }}>Desde:</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            style={{ padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: "6px", fontSize: "14px" }}
          />
          <label style={{ fontSize: "12px", fontWeight: "600", color: "#1e3a8a" }}>Hasta:</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            style={{ padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: "6px", fontSize: "14px" }}
          />
          <button
            onClick={() => { setFrom(""); setTo(""); setAccount(""); }}
            style={{ padding: "8px 12px", background: "#f3f4f6", border: "1px solid #d1d5db", borderRadius: "6px", cursor: "pointer" }}
          >
            Limpiar
          </button>
        </div>

        <FilterSelect
          value={account}
          onChange={(val) => setAccount(val)}
          options={[
            { value: "", label: "Todas las cuentas" },
            ...accounts.map(acc => ({ value: acc, label: acc }))
          ]}
        />

        <span style={{ marginLeft: "auto", fontSize: 13, color: "#334155", fontWeight: 700 }}>
          Total depositado: <span style={{ color: "#1e3a8a", fontWeight: 800 }}>{money(total)}</span>
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
              <th style={{ ...ui.th, width: "80px", textAlign: "center" }}>Confirmado</th>
              <th style={{ ...ui.th, textAlign: "right" }}>Monto</th>
            </tr>
          </thead>
          <tbody>
            <TableState colSpan={8} loading={loading} error={error} empty={!loading && rows.length === 0} emptyText="No hay depósitos bancarios registrados." />
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
                  <td style={{ ...ui.td, textAlign: "center" }}>
                    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "8px" }}>
                      <input
                        type="checkbox"
                        checked={d.status === "COMPLETED" || d.status === "CONFIRMADO"}
                        onChange={() => confirmDeposit(d.id)}
                        disabled={
                          confirmingDepositId === d.id ||
                          d.status === "CANCELLED" ||
                          d.status === "CANCELADO" ||
                          d.status === "COMPLETED" ||
                          d.status === "CONFIRMADO"
                        }
                        style={{
                          cursor:
                            confirmingDepositId === d.id ||
                            d.status === "CANCELLED" ||
                            d.status === "CANCELADO" ||
                            d.status === "COMPLETED" ||
                            d.status === "CONFIRMADO"
                              ? "not-allowed"
                              : "pointer",
                          width: "18px",
                          height: "18px",
                        }}
                      />
                      <button
                        onClick={() => openDetail(d)}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          fontSize: "16px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          padding: 0
                        }}
                        title="Ver detalles"
                      >
                        Ver
                      </button>
                    </div>
                  </td>
                  <td style={{ ...ui.td, textAlign: "right", fontWeight: 800, color: "#b91c1c" }}>-{money(d.amount)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {detailOpen && selectedDeposit && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0,0,0,0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000
        }}>
          <div style={{
            background: "white",
            borderRadius: "8px",
            padding: "24px",
            maxWidth: "600px",
            width: "90%",
            boxShadow: "0 20px 25px rgba(0,0,0,0.15)"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "16px" }}>
              <h2 style={{ margin: 0, fontSize: "18px", color: "#1e3a8a" }}>
                Depósito #{selectedDeposit.id}
              </h2>
              <button
                onClick={closeDetail}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: "24px",
                  cursor: "pointer"
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ marginBottom: "16px", borderBottom: "1px solid #e5e7eb", paddingBottom: "16px" }}>
              <p style={{ margin: "8px 0" }}>
                <strong>Cuenta Destino:</strong> {selectedDeposit.accountNumber}
              </p>
              <p style={{ margin: "8px 0" }}>
                <strong>Beneficiario:</strong> {selectedDeposit.targetName}
              </p>
              <p style={{ margin: "8px 0" }}>
                <strong>Sucursal:</strong> {selectedDeposit.branch?.name || selectedDeposit.branch || "—"}
              </p>
              <p style={{ margin: "8px 0" }}>
                <strong>Tipo:</strong> {selectedDeposit.paymentType}
              </p>
              <p style={{ margin: "8px 0" }}>
                <strong>Referencia:</strong> {selectedDeposit.reference || "—"}
              </p>
            </div>

            <div style={{ marginBottom: "16px", borderBottom: "1px solid #e5e7eb", paddingBottom: "16px" }}>
              <p style={{ margin: "8px 0" }}>
                <strong>Monto:</strong> <span style={{ color: "#dc2626", fontSize: "16px", fontWeight: "bold" }}>
                  -${selectedDeposit.amount.toFixed(2)}
                </span>
              </p>
              <p style={{ margin: "8px 0" }}>
                <strong>Fecha:</strong> {new Date(selectedDeposit.createdAt).toLocaleString()}
              </p>
              <p style={{ margin: "8px 0" }}>
                <strong>Estado:</strong> <span style={{
                  background: selectedDeposit.status === "CONFIRMADO" || selectedDeposit.status === "COMPLETED" ? "#d1fae5" : "#fee2e2",
                  color: selectedDeposit.status === "CONFIRMADO" || selectedDeposit.status === "COMPLETED" ? "#065f46" : "#991b1b",
                  padding: "4px 8px",
                  borderRadius: "4px",
                  fontSize: "12px"
                }}>
                  {selectedDeposit.status}
                </span>
              </p>
              <p style={{ margin: "8px 0" }}>
                <strong>Comentarios:</strong> {selectedDeposit.comments || "Sin comentarios"}
              </p>
            </div>

            <div style={{ display: "flex", gap: "12px" }}>
              <button
                onClick={closeDetail}
                style={{
                  padding: "10px 16px",
                  background: "#f3f4f6",
                  border: "1px solid #d1d5db",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontSize: "14px",
                  fontWeight: "600"
                }}
              >
                Cerrar
              </button>
              <button
                onClick={() => printDeposit(selectedDeposit)}
                style={{
                  padding: "10px 16px",
                  background: "#3b82f6",
                  color: "white",
                  border: "none",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontSize: "14px",
                  fontWeight: "600"
                }}
              >
                Imprimir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DepositosView;
