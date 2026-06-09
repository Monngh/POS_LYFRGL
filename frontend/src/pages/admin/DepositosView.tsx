import React, { useEffect, useState, useCallback } from "react";
import api from "../../services/api";
import { ui, type ViewProps, Toolbar, Badge, TableState, SectionHeader, money, fmtDate, fmtTime, payTone, FilterSelect } from "./shared";

const formatCommentsHtml = (comments: string | null): string => {
  if (!comments) return "Sin comentarios";
  const trimmed = comments.trim();
  if (trimmed.startsWith("{")) {
    try {
      const meta = JSON.parse(trimmed);
      let html = '<div style="margin-top: 4px; padding: 8px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 12px; display: inline-block; text-align: left; width: 100%; box-sizing: border-box;">';
      if (meta.userComments) html += `<div style="margin-bottom: 4px;"><strong>Comentario:</strong> ${meta.userComments}</div>`;
      if (meta.convenio && meta.convenio !== "N/A") html += `<div style="margin-bottom: 4px;"><strong>Convenio:</strong> ${meta.convenio}</div>`;
      if (meta.barcode) html += `<div style="margin-bottom: 4px; font-family: monospace;"><strong>Código/Referencia:</strong> ${meta.barcode}</div>`;
      if (meta.expirationDate) html += `<div style="margin-bottom: 4px;"><strong>Expiración:</strong> ${new Date(meta.expirationDate).toLocaleString("es-MX")}</div>`;
      if (meta.ticketUrl) html += `<div style="margin-top: 6px;"><a href="${meta.ticketUrl}" target="_blank" style="color: #2563eb; font-weight: bold; text-decoration: underline;">🖨️ Ver Ticket de Pago</a></div>`;
      html += '</div>';
      return html;
    } catch {
      // Ignorar
    }
  }
  return comments;
};

const renderComments = (comments: string | null) => {
  if (!comments) return "Sin comentarios";
  const trimmed = comments.trim();
  if (trimmed.startsWith("{")) {
    try {
      const meta = JSON.parse(trimmed);
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4, padding: 10, background: "#f8fafc", borderRadius: 6, border: "1px solid #e2e8f0", width: "100%", boxSizing: "border-box" }}>
          {meta.userComments && (
            <div style={{ fontSize: 13, color: "#334155" }}>
              <strong>Comentario:</strong> {meta.userComments}
            </div>
          )}
          {meta.convenio && meta.convenio !== "N/A" && (
            <div style={{ fontSize: 13, color: "#334155" }}>
              <strong>Convenio:</strong> {meta.convenio}
            </div>
          )}
          {meta.barcode && (
            <div style={{ fontSize: 13, color: "#334155", fontFamily: "monospace" }}>
              <strong>Código/Referencia:</strong> {meta.barcode}
            </div>
          )}
          {meta.expirationDate && (
            <div style={{ fontSize: 13, color: "#334155" }}>
              <strong>Expiración:</strong> {new Date(meta.expirationDate).toLocaleString("es-MX")}
            </div>
          )}
          {meta.ticketUrl && (
            <div style={{ marginTop: 6 }}>
              <a
                href={meta.ticketUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  fontSize: 12,
                  color: "#2563eb",
                  fontWeight: "bold",
                  textDecoration: "underline"
                }}
              >
                🖨️ Ver Ticket de Pago
              </a>
            </div>
          )}
        </div>
      );
    } catch (e) {
      // Ignorar
    }
  }
  return comments;
};

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

      // 🔧 CONVERTIR FECHAS DE DD/MM/YYYY a YYYY-MM-DD
      if (from) {
        const [day, month, year] = from.split('/');
        const formattedFrom = `${year}-${month}-${day}`;
        params.from = formattedFrom;
      }

      if (to) {
        const [day, month, year] = to.split('/');
        const formattedTo = `${year}-${month}-${day}`;
        params.to = formattedTo;
      }

      if (account) params.account = account;

      console.log("Fechas enviadas (formato ISO):", { from: params.from, to: params.to });

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
            <span>${formatCommentsHtml(deposit.comments)}</span>
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
        <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ fontSize: "12px", fontWeight: "600", color: "#1e3a8a" }}>Desde:</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            style={{ padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: "6px", fontSize: "14px", flex: "1 1 120px", minWidth: 0, maxWidth: 180 }}
          />
          <label style={{ fontSize: "12px", fontWeight: "600", color: "#1e3a8a" }}>Hasta:</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            style={{ padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: "6px", fontSize: "14px", flex: "1 1 120px", minWidth: 0, maxWidth: 180 }}
          />
          <button
            onClick={() => {
              setFrom("");
              setTo("");
              setAccount("");
            }}
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

      <div className="table-sticky-head" style={{ ...ui.tableWrap, overflowX: "auto", overflowY: "auto", maxHeight: "62vh" }}>
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
              <div style={{ margin: "8px 0" }}>
                <strong>Comentarios:</strong> {renderComments(selectedDeposit.comments)}
              </div>
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
