import React, { useEffect, useState, useCallback } from "react";
import { ChevronDown, ChevronUp, Calendar, CreditCard, Eye, X } from "lucide-react";
import api from "../../services/api";
import { validateDateRange } from "../../utils/formValidation";
import {
  ui,
  type ViewProps,
  Toolbar,
  Badge,
  TableState,
  SectionHeader,
  money,
  fmtDate,
  fmtTime,
  payTone,
  FilterSelect,
  printTicketHtml,
  useMediaQuery,
} from "./shared";

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

const renderComments = (raw: string | null | undefined) => {
  if (!raw) return <span>Sin comentarios</span>;
  try {
    const parsed = JSON.parse(raw);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {parsed.convenio && <span><strong>Convenio:</strong> {parsed.convenio}</span>}
        {parsed.barcode && <span><strong>Código de barras:</strong> {parsed.barcode}</span>}
        {parsed.expirationDate && <span><strong>Vence:</strong> {new Date(parsed.expirationDate).toLocaleString('es-MX')}</span>}
        {parsed.ticketUrl && (
          <span><strong>Ticket:</strong>{' '}
            <a href={parsed.ticketUrl} target="_blank" rel="noopener noreferrer">
              Ver ticket
            </a>
          </span>
        )}
        {parsed.userComments && <span><strong>Comentario:</strong> {parsed.userComments}</span>}
      </div>
    );
  } catch {
    return <span>{raw}</span>;
  }
};

const DepositosView: React.FC<ViewProps> = ({ branchId, refreshToken }) => {
  const isMobile = useMediaQuery("(max-width: 1024px)");
  const [expandedDeposits, setExpandedDeposits] = useState<Record<number, boolean>>({});
  const toggleExpand = (id: number) => {
    setExpandedDeposits((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

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
  const dateError = from && to ? validateDateRange(from, to) : undefined;

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
    if (!window.confirm("¿Confirmas que este deposito fue verificado?")) return;
    setConfirmingDepositId(depositId);
    try {
      await api.post(`/api/sales/deposits/${depositId}/confirm`);
      await load();
    } catch (error: any) {
      console.error("Error confirmando depósito:", error?.response?.status, error?.response?.data);
      setError(error?.response?.data?.message || "Error al confirmar depósito");
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
    const safe = (value: unknown) =>
      String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    const branchName = deposit.branch?.name || deposit.branch || "N/A";
    const body = `
      <div>
        <div class="ticket-header">
          <span class="ticket-store">LYFRGL POS</span>
          <span class="ticket-muted">Sucursal: ${safe(branchName)}</span>
          <span class="ticket-operation">DEPOSITO / RETIRO</span>
        </div>
        <div class="ticket-section">
          <div class="ticket-row"><span>Folio:</span><span class="ticket-value">#${deposit.id}</span></div>
          <div class="ticket-row"><span>Fecha:</span><span class="ticket-value">${safe(new Date(deposit.createdAt).toLocaleString())}</span></div>
          <div class="ticket-row"><span>Cuenta destino:</span><span class="ticket-value">${safe(deposit.accountNumber)}</span></div>
          <div class="ticket-row"><span>Beneficiario:</span><span class="ticket-value">${safe(deposit.targetName)}</span></div>
          <div class="ticket-row"><span>Tipo:</span><span class="ticket-value">${safe(deposit.paymentType)}</span></div>
          <div class="ticket-row"><span>Referencia:</span><span class="ticket-value">${safe(deposit.reference || "N/A")}</span></div>
          <div class="ticket-row"><span>Estado:</span><span class="ticket-value">${safe(deposit.status)}</span></div>
          <div class="ticket-row"><span>Comentarios:</span><span class="ticket-value">${(() => {
        if (!deposit.comments) return "Sin comentarios";
        try {
          const p = JSON.parse(deposit.comments);
          const parts: string[] = [];
          if (p.convenio) parts.push(`Convenio: ${safe(p.convenio)}`);
          if (p.barcode) parts.push(`Código: ${safe(p.barcode)}`);
          if (p.expirationDate) parts.push(`Vence: ${new Date(p.expirationDate).toLocaleString('es-MX')}`);
          if (p.ticketUrl) parts.push(`Ticket: ${safe(p.ticketUrl)}`);
          if (p.userComments) parts.push(`Comentario: ${safe(p.userComments)}`);
          return parts.length ? parts.join(' | ') : "Sin comentarios";
        } catch {
          return safe(deposit.comments);
        }
      })()}</span></div>
          <div class="ticket-row ticket-total"><span>Monto:</span><span>-$${Number(deposit.amount).toFixed(2)}</span></div>
        </div>
        <div class="ticket-footer">
          <p>COMPROBANTE DE DEPOSITO BANCARIO</p>
          <p>Generado: ${safe(new Date().toLocaleString())}</p>
        </div>
      </div>
    `;

    printTicketHtml(`Deposito #${deposit.id}`, body);
  };

  const total = rows.reduce((acc, d) => acc + d.amount, 0);

  return (
    <div>
      <SectionHeader title="Depósitos bancarios" subtitle="Retiros de efectivo de caja depositados a cuentas bancarias" />

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
                minWidth: 0
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
                minWidth: 0
              }}
            />
          </div>

          {/* Filtro de cuenta con botón limpiar integrado */}
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            backgroundColor: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: "8px",
            padding: "4px 8px",
            minHeight: "42px"
          }}>
            <select
              style={{
                flex: 1,
                border: "none",
                background: "transparent",
                padding: "8px 4px",
                fontSize: 13,
                fontWeight: 500,
                color: "#0f172a",
                outline: "none",
                fontFamily: "inherit",
                minWidth: 0,
                appearance: "auto"
              }}
              value={account}
              onChange={(e) => setAccount(e.target.value)}
            >
              <option value="">Todas las cuentas</option>
              {accounts.map(acc => (
                <option key={acc} value={acc}>{acc}</option>
              ))}
            </select>
            {account && (
              <button
                onClick={() => setAccount("")}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "#e2e8f0",
                  border: "none",
                  borderRadius: "50%",
                  width: 24,
                  height: 24,
                  cursor: "pointer",
                  color: "#64748b",
                  padding: 0,
                  flexShrink: 0
                }}
                className="active-tap"
                title="Limpiar filtro de cuenta"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Botón Limpiar todo */}
          <button
            onClick={() => {
              setFrom("");
              setTo("");
              setAccount("");
            }}
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
            Limpiar todos los filtros
          </button>
          {dateError && <span style={{ color: "#b91c1c", fontSize: 12, fontWeight: 600 }}>{dateError}</span>}
          <div style={{
            fontSize: 13,
            color: "var(--text-secondary)",
            fontWeight: 700,
            textAlign: "center",
            paddingTop: 4,
            borderTop: "1px solid var(--border)"
          }}>
            Total depositado: <span style={{ color: "var(--accent-strong)", fontWeight: 800 }}>{money(total)}</span>
          </div>
        </div>
      ) : (
        <Toolbar>
          <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ fontSize: "12px", fontWeight: "600", color: "var(--accent-strong)" }}>Desde:</label>
            <input
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => setFrom(e.target.value)}
              style={{ padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: "6px", fontSize: "14px", flex: "1 1 120px", minWidth: 0, maxWidth: 180 }}
            />
            <label style={{ fontSize: "12px", fontWeight: "600", color: "var(--accent-strong)" }}>Hasta:</label>
            <input
              type="date"
              value={to}
              min={from || undefined}
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
              className="active-tap"
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

          <span style={{ marginLeft: "auto", fontSize: 13, color: "var(--text-secondary)", fontWeight: 700 }}>
            Total depositado: <span style={{ color: "var(--accent-strong)", fontWeight: 800 }}>{money(total)}</span>
          </span>
        </Toolbar>
      )}

      {isMobile ? (
        <div style={{ overflowY: "auto", maxHeight: "62vh", padding: "8px 4px" }}>
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
          {!loading && !error && rows.length === 0 && (
            <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--text-faint)", fontSize: 13, fontWeight: 500 }}>
              No hay depósitos bancarios registrados.
            </div>
          )}

          {!loading &&
            !error &&
            rows.map((d) => {
              const isExpanded = expandedDeposits[d.id];
              return (
                <div
                  key={d.id}
                  style={{
                    backgroundColor: "var(--surface)",
                    border: "1px solid var(--surface-3)",
                    borderRadius: 16,
                    marginBottom: 12,
                    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)",
                    overflow: "hidden",
                  }}
                >
                  <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "8px 14px",
                    fontSize: 10,
                    fontWeight: 700,
                    color: "var(--text-muted)",
                    borderBottom: "1px solid var(--surface-3)",
                    backgroundColor: "var(--surface-2)",
                    letterSpacing: "0.2px",
                    textTransform: "uppercase"
                  }}>
                    <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "45%" }}>{d.branch}</span>
                    <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "45%" }}>{d.paymentType}</span>
                  </div>

                  <div style={{ padding: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                          <button
                            onClick={() => openDetail(d)}
                            style={{
                              background: "none",
                              border: "none",
                              color: "#2563eb",
                              fontWeight: 700,
                              cursor: "pointer",
                              padding: 0,
                              fontSize: 14,
                              textAlign: "left",
                              wordBreak: "break-word"
                            }}
                            className="active-tap"
                          >
                            Depósito #{d.id}
                          </button>
                          <span style={{ fontSize: 15, fontWeight: 800, color: "#b91c1c", whiteSpace: "nowrap" }}>
                            -{money(d.amount)}
                          </span>
                        </div>

                        <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 6, fontWeight: 600, wordBreak: "break-word" }}>
                          {d.targetName}
                        </div>

                        {/* Fecha - MEJORADA como en Compras */}
                        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>
                          <Calendar size={13} color="#2563eb" />
                          <span>{fmtDate(d.createdAt)} {fmtTime(d.createdAt)}</span>
                        </div>

                        {/* Cuenta - CON wordBreak */}
                        <div style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          fontSize: 12,
                          color: "var(--text-secondary)",
                          wordBreak: "break-all"
                        }}>
                          <CreditCard size={13} color="#2563eb" style={{ flexShrink: 0 }} />
                          <span>Cuenta: <span style={{ fontFamily: "monospace" }}>{d.accountMasked}</span></span>
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", alignSelf: "center", flexShrink: 0 }}>
                        <button
                          onClick={() => toggleExpand(d.id)}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: "var(--surface)",
                            border: "1px solid var(--border-strong)",
                            borderRadius: 8,
                            width: 34,
                            height: 34,
                            cursor: "pointer",
                            color: "#2563eb",
                            padding: 0,
                          }}
                          className="active-tap"
                        >
                          {isExpanded ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
                        </button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--surface-3)" }}>
                        <div style={{ marginBottom: 10 }}>
                          <button
                            onClick={() => openDetail(d)}
                            style={{
                              background: "none",
                              border: "none",
                              color: "#2563eb",
                              fontWeight: 700,
                              cursor: "pointer",
                              padding: 0,
                              fontSize: 12,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                            }}
                            className="active-tap"
                          >
                            <Eye size={14} /> Ver detalle completo
                          </button>
                        </div>

                        <div style={{
                          backgroundColor: "var(--surface-2)",
                          borderRadius: 10,
                          border: "1px solid var(--border)",
                          padding: 12,
                        }}>
                          <h4 style={{ fontSize: 12, fontWeight: 800, color: "var(--text)", marginBottom: 8 }}>Datos del Depósito</h4>
                          <div style={{ ...detailRowStyle, fontSize: 12 }}>
                            <span style={detailLabelStyle}>Folio Dep:</span>
                            <span style={detailValueStyle}>#{d.id}</span>
                          </div>
                          <div style={{ ...detailRowStyle, fontSize: 12 }}>
                            <span style={detailLabelStyle}>Sesión:</span>
                            <span style={detailValueStyle}>#{d.sessionId}</span>
                          </div>
                          <div style={{ ...detailRowStyle, fontSize: 12 }}>
                            <span style={detailLabelStyle}>Cuenta Nro:</span>
                            <span style={{ ...detailValueStyle, fontFamily: "monospace", wordBreak: "break-all", fontSize: 11 }}>{d.accountNumber}</span>
                          </div>

                          <h4 style={{ fontSize: 12, fontWeight: 800, color: "var(--text)", marginTop: 12, marginBottom: 8 }}>Estado y Confirmación</h4>
                          <div style={{ ...detailRowStyle, fontSize: 12 }}>
                            <span style={detailLabelStyle}>Estado:</span>
                            <span style={detailValueStyle}>
                              <Badge tone={d.status === "CONFIRMADO" || d.status === "COMPLETED" ? "green" : "red"}>{d.status}</Badge>
                            </span>
                          </div>

                          <div style={{ ...detailRowStyle, fontSize: 12, marginTop: 6 }}>
                            <span style={detailLabelStyle}>Confirmado:</span>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
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
                                  width: "16px",
                                  height: "16px",
                                }}
                              />
                              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                                {d.status === "COMPLETED" || d.status === "CONFIRMADO" ? "Confirmado" : "Pendiente de confirmar"}
                              </span>
                            </span>
                          </div>

                          {d.comments && (
                            <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
                              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 4 }}>
                                Comentarios:
                              </div>
                              <div style={{ fontSize: 12, color: "var(--text-secondary)", wordBreak: "break-word" }}>{renderComments(d.comments)}</div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      ) : (
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
                    <td style={ui.td}>{fmtDate(d.createdAt)} <span style={{ color: "var(--text-faint)" }}>{fmtTime(d.createdAt)}</span></td>
                    <td style={{ ...ui.td, fontFamily: "monospace", color: "var(--text-secondary)" }}>{d.accountMasked}</td>
                    <td style={{ ...ui.td, fontWeight: 600, color: "var(--text)", whiteSpace: "normal" }}>{d.targetName}</td>
                    <td style={ui.td}>{d.branch}</td>
                    <td style={{ ...ui.td, textAlign: "center" }}>
                      <Badge tone={payTone(d.paymentType)}>{d.paymentType}</Badge>
                    </td>
                    <td style={{ ...ui.td, textAlign: "center", color: "var(--text-muted)" }}>#{d.sessionId}</td>
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
                            fontSize: "14px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: 0,
                            color: "#2563eb",
                            fontWeight: 600
                          }}
                          className="active-tap"
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
      )}

      {/* Modal de detalle - MEJORADO con mejor diseño */}
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
          zIndex: 1000,
          padding: "16px"
        }}>
          <div style={{
            background: "white",
            borderRadius: "12px",
            padding: isMobile ? "20px" : "24px",
            maxWidth: "600px",
            width: "100%",
            maxHeight: "90vh",
            overflowY: "auto",
            boxShadow: "0 20px 25px rgba(0,0,0,0.15)"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "16px", alignItems: "center" }}>
              <h2 style={{ margin: 0, fontSize: isMobile ? "16px" : "18px", color: "var(--accent-strong)" }}>
                Depósito #{selectedDeposit.id}
              </h2>
              <button
                onClick={closeDetail}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "#64748b",
                  padding: "4px"
                }}
                className="active-tap"
              >
                <X size={isMobile ? 20 : 24} />
              </button>
            </div>

            <div style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
              gap: "12px",
              marginBottom: "16px",
              paddingBottom: "16px",
              borderBottom: "1px solid #e5e7eb"
            }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.4px" }}>
                  Cuenta Destino
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", marginTop: 3, wordBreak: "break-all" }}>
                  {selectedDeposit.accountNumber}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.4px" }}>
                  Beneficiario
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", marginTop: 3, wordBreak: "break-word" }}>
                  {selectedDeposit.targetName}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.4px" }}>
                  Sucursal
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", marginTop: 3 }}>
                  {selectedDeposit.branch?.name || selectedDeposit.branch || "—"}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.4px" }}>
                  Tipo
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", marginTop: 3 }}>
                  {selectedDeposit.paymentType}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.4px" }}>
                  Referencia
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", marginTop: 3 }}>
                  {selectedDeposit.reference || "—"}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.4px" }}>
                  Fecha
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", marginTop: 3 }}>
                  {new Date(selectedDeposit.createdAt).toLocaleString()}
                </div>
              </div>
            </div>

            <div style={{
              marginBottom: "16px",
              paddingBottom: "16px",
              borderBottom: "1px solid #e5e7eb"
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>Monto</span>
                <span style={{ fontSize: isMobile ? "20px" : "24px", fontWeight: 800, color: "#dc2626" }}>
                  -{money(selectedDeposit.amount)}
                </span>
              </div>
              <div style={{ marginTop: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.4px" }}>
                  Estado
                </span>
                <div style={{ marginTop: 3 }}>
                  <Badge tone={selectedDeposit.status === "CONFIRMADO" || selectedDeposit.status === "COMPLETED" ? "green" : "red"}>
                    {selectedDeposit.status}
                  </Badge>
                </div>
              </div>
            </div>

            {selectedDeposit.comments && (
              <div style={{ marginBottom: "16px", paddingBottom: "16px", borderBottom: "1px solid #e5e7eb" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.4px" }}>
                  Comentarios
                </div>
                <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4, wordBreak: "break-word" }}>
                  {renderComments(selectedDeposit.comments)}
                </div>
              </div>
            )}

            <div style={{
              display: "flex",
              gap: "12px",
              flexDirection: isMobile ? "column" : "row"
            }}>
              <button
                onClick={closeDetail}
                style={{
                  padding: "10px 16px",
                  background: "#f3f4f6",
                  border: "1px solid #d1d5db",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontSize: "14px",
                  fontWeight: "600",
                  flex: isMobile ? 1 : "auto"
                }}
                className="active-tap"
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
                  fontWeight: "600",
                  flex: isMobile ? 1 : "auto"
                }}
                className="active-tap"
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

const detailRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-start",
  alignItems: "center",
  gap: "6px",
  marginBottom: 4,
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
  fontSize: "inherit",
  wordBreak: "break-word",
};

export default DepositosView;