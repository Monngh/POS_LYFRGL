import React, { useEffect, useRef, useState } from "react";
import api from "../../shared/services/api";
import { useAdminData } from "../../shared/hooks";
import { DataTable, ActionModal } from "../../shared/ui";
import type { Column } from "../../shared/ui";
import { Calendar, ChevronDown, ChevronUp, CreditCard, Eye, Printer, X } from "lucide-react"
import {
  type ViewProps,
  Toolbar,
  Badge,
  SectionHeader,
  money,
  fmtDate,
  fmtTime,
  payTone,
  FilterSelect,
  printTicketHtml,
  useMediaQuery,
  usePagination,
  Pagination,
  ui,
} from "./shared";
import { useToast } from "../../shared/context/ToastContext";

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

const detailRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-start",
  alignItems: "center",
  gap: "8px",
  fontSize: 13,
  marginBottom: 6,
};

const detailLabelStyle: React.CSSProperties = {
  fontWeight: 700,
  color: "var(--text-muted)",
  minWidth: "85px",
  display: "inline-block",
};

const detailValueStyle: React.CSSProperties = {
  fontWeight: 600,
  color: "var(--text-secondary)",
};

const dateInputStyle: React.CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: 8,
  height: 38,
  padding: "0 12px",
  fontSize: 13,
  fontWeight: 600,
  color: "var(--text-secondary)",
  backgroundColor: "var(--surface)",
  cursor: "pointer",
  fontFamily: "inherit",
  outline: "none",
  minWidth: 120,
  maxWidth: 160,
  flex: "1 1 auto",
};

const DepositosView: React.FC<ViewProps> = ({ branchId, refreshToken }) => {
  const { showToast } = useToast();
  const isMobile = useMediaQuery("(max-width: 1024px)");
  const [expandedDeposits, setExpandedDeposits] = useState<Record<number, boolean>>({});

  const toggleExpand = (id: number) => {
    setExpandedDeposits((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [account, setAccount] = useState<string>("");
  const [paymentType, setPaymentType] = useState<string>("");
  const [accounts, setAccounts] = useState<{ accountNumber: string; accountMasked: string; targetName: string }[]>([]);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedDeposit, setSelectedDeposit] = useState<any>(null);
  const [confirmingDepositId, setConfirmingDepositId] = useState<number | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const filterParams: Record<string, unknown> = {};
  if (branchId !== "all") filterParams.branchId = branchId;
  if (from) filterParams.from = from;
  if (to) filterParams.to = to;
  if (account) filterParams.account = account;
  if (paymentType) filterParams.paymentType = paymentType;

  const { data, loading, error: loadError, refetch } = useAdminData<{ deposits: DepositRow[] }>(
    "/api/admin/bank-deposits",
    { params: filterParams }
  );
  const rows = data?.deposits ?? [];
  const paged = usePagination(rows, { resetKey: `${branchId}|${from}|${to}|${account}|${paymentType}` });

  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    refetch();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshToken]);

  useEffect(() => {
    if (rows.length > 0 && accounts.length === 0) {
      const uniqueMap = new Map<string, { accountNumber: string; accountMasked: string; targetName: string }>();
      rows.forEach((r) => {
        if (r.accountNumber && !uniqueMap.has(r.accountNumber)) {
          uniqueMap.set(r.accountNumber, {
            accountNumber: r.accountNumber,
            accountMasked: r.accountMasked,
            targetName: r.targetName,
          });
        }
      });
      setAccounts(Array.from(uniqueMap.values()));
    }
  }, [rows, accounts.length]);

  const confirmDeposit = async (depositId: number) => {
    if (confirmingDepositId === depositId) return;
    setConfirmingDepositId(depositId);
    setMutationError(null);
    try {
      await api.post(`/api/sales/deposits/${depositId}/confirm`);
      await refetch();
    } catch (err: any) {
      console.error("Error confirmando depósito:", err?.response?.status, err?.response?.data);
      setMutationError(err?.response?.data?.message || "Error al confirmar depósito");
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

    printTicketHtml(`Deposito #${deposit.id}`, body, showToast);
  };

  const total = rows.reduce((acc, d) => acc + d.amount, 0);

  const columns: Column<DepositRow>[] = [
    {
      key: "createdAt",
      header: "Fecha",
      render: (d) => (
        <>{fmtDate(d.createdAt)} <span style={{ color: "var(--text-faint)" }}>{fmtTime(d.createdAt)}</span></>
      ),
    },
    {
      key: "accountMasked",
      header: "Cuenta Destino",
      render: (d) => (
        <span style={{ fontFamily: "monospace", color: "var(--text-secondary)" }}>{d.accountMasked}</span>
      ),
    },
    {
      key: "targetName",
      header: "Beneficiario",
      render: (d) => (
        <span style={{ fontWeight: 600, color: "var(--text)", whiteSpace: "normal" }}>{d.targetName}</span>
      ),
    },
    {
      key: "branch",
      header: "Sucursal",
    },
    {
      key: "paymentType",
      header: "Tipo",
      align: "center",
      render: (d) => <Badge tone={payTone(d.paymentType)}>{d.paymentType}</Badge>,
    },
    {
      key: "sessionId",
      header: "Sesión",
      align: "center",
      render: (d) => <span style={{ color: "var(--text-muted)" }}>#{d.sessionId}</span>,
    },
    {
      key: "status",
      header: "Confirmado",
      align: "center",
      width: "90px",
      render: (d) => (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
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
          <button
            onClick={() => openDetail(d)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: "11px",
              color: "var(--accent)",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
              gap: "4px"
            }}
            title="Ver detalles"
          >
            <Eye size={12} />
            <span>Ver</span>
          </button>
        </div>
      ),
    },
    {
      key: "amount",
      header: "Monto",
      align: "right",
      render: (d) => (
        <span style={{ fontWeight: 800, color: "#b91c1c" }}>-{money(d.amount)}</span>
      ),
    },
  ];

  return (
    <div>
      <SectionHeader title="Depósitos bancarios" subtitle="Retiros de efectivo de caja depositados a cuentas bancarias" />

      <Toolbar>
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          style={dateInputStyle}
          title="Desde"
        />
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          style={dateInputStyle}
          title="Hasta"
        />
        <FilterSelect
          value={account}
          onChange={(val) => setAccount(val)}
          style={{
            fontFamily: "monospace",
            fontSize: isMobile ? "12px" : "13px",
            maxWidth: "100%",
            width: isMobile ? "100%" : "280px",
            height: isMobile ? "34px" : "38px",
          }}
          options={[
            { value: "", label: "Todas las cuentas" },
            ...accounts.map(acc => {
              // Format the options with monospace padding so columns are defined and clear
              const paddedName = acc.targetName.slice(0, 15).padEnd(15, "\u00A0");
              const shortMask = acc.accountMasked.replace(/[\s*]/g, "");
              const displayMask = `****${shortMask.slice(-4)}`;
              return { value: acc.accountNumber, label: `${paddedName} ${displayMask}` };
            })
          ]}
        />
        <FilterSelect
          value={paymentType}
          onChange={(val) => setPaymentType(val)}
          style={{
            fontSize: isMobile ? "12px" : "13px",
            maxWidth: "100%",
            width: isMobile ? "100%" : "180px",
            height: isMobile ? "34px" : "38px",
          }}
          options={[
            { value: "", label: "Todos los tipos" },
            { value: "EFECTIVO", label: "Efectivo" },
            { value: "MERCADOPAGO_BBVA", label: "BBVA Bancomer" },
            { value: "MERCADOPAGO_CITIBANAMEX", label: "Citibanamex" },
            { value: "MERCADOPAGO_SANTANDER", label: "Santander" },
            { value: "MERCADOPAGO_OXXO", label: "OXXO" },
            { value: "MERCADOPAGO_7ELEVEN", label: "7-Eleven" },
          ]}
        />
        {(from || to || account || paymentType) && (
          <button
            onClick={() => {
              setFrom("");
              setTo("");
              setAccount("");
              setPaymentType("");
            }}
            style={{ ...ui.ghostBtn, fontSize: 12, padding: "5px 10px", height: 32 }}
          >
            Limpiar filtros
          </button>
        )}

        <span style={{ marginLeft: isMobile ? "0" : "auto", fontSize: 13, color: "var(--text-secondary)", fontWeight: 700 }}>
          Total depositado: <span style={{ color: "var(--accent-strong)", fontWeight: 800 }}>{money(total)}</span>
        </span>
      </Toolbar>

      {isMobile ? (
        <div style={{ overflowY: "auto", maxHeight: "62vh", padding: "8px 4px" }}>
          {loading && (
            <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--text-faint)", fontSize: 13, fontWeight: 500 }}>
              Cargando información...
            </div>
          )}
          {loadError && (
            <div style={{ textAlign: "center", padding: "32px 16px", color: "#b91c1c", fontSize: 13, fontWeight: 500 }}>
              {loadError}
            </div>
          )}
          {!loading && !loadError && rows.length === 0 && (
            <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--text-faint)", fontSize: 13, fontWeight: 500 }}>
              No hay depósitos bancarios registrados.
            </div>
          )}

          {!loading &&
            !loadError &&
            paged.pageItems.map((d) => {
              const isExpanded = expandedDeposits[d.id];
              return (
                <div
                  key={d.id}
                  style={{
                    backgroundColor: "var(--surface)",
                    border: "1px solid var(--border-soft)",
                    borderRadius: 16,
                    marginBottom: 12,
                    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)",
                    overflow: "hidden",
                  }}
                >
                  {/* Cuerpo principal — sin header de sucursal/tipo */}
                  <div style={{ padding: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                      <div style={{ flex: 1 }}>
                        {/* ID de Depósito y Monto */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                          <button
                            onClick={() => openDetail(d)}
                            style={{
                              background: "none",
                              border: "none",
                              color: "var(--accent)",
                              fontWeight: 700,
                              cursor: "pointer",
                              padding: 0,
                              fontSize: 16,
                              textAlign: "left",
                            }}
                            className="active-tap"
                          >
                            Depósito #{d.id}
                          </button>
                          <span style={{ fontSize: 16, fontWeight: 800, color: "#b91c1c" }}>
                            -{money(d.amount)}
                          </span>
                        </div>

                        {/* Beneficiario */}
                        <div style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 8, fontWeight: 600 }}>
                          {d.targetName}
                        </div>

                        {/* Fecha */}
                        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-secondary)", marginBottom: 6 }}>
                          <Calendar size={14} color="#2563eb" />
                          <span>{fmtDate(d.createdAt)} {fmtTime(d.createdAt)}</span>
                        </div>

                        {/* Cuenta Destino */}
                        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-secondary)" }}>
                          <CreditCard size={14} color="#2563eb" />
                          <span>Cuenta: <span style={{ fontFamily: "monospace" }}>{d.accountMasked}</span></span>
                        </div>
                      </div>

                      {/* Chevron Button */}
                      <div style={{ display: "flex", alignItems: "center", alignSelf: "center" }}>
                        <button
                          onClick={() => toggleExpand(d.id)}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: "var(--surface)",
                            border: "1px solid var(--border-strong)",
                            borderRadius: 8,
                            width: 38,
                            height: 38,
                            cursor: "pointer",
                            color: "var(--accent)",
                            padding: 0,
                          }}
                          className="active-tap"
                        >
                          {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                        </button>
                      </div>
                    </div>

                    {/* Detalle expandible */}
                    {isExpanded && (
                      <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border-soft)" }}>
                        {/* Botón Ver Detalle */}
                        <div style={{ marginBottom: 12 }}>
                          <button
                            onClick={() => openDetail(d)}
                            style={{
                              background: "none",
                              border: "none",
                              color: "var(--accent)",
                              fontWeight: 700,
                              cursor: "pointer",
                              padding: 0,
                              fontSize: 13,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                            }}
                            className="active-tap"
                          >
                            <Eye size={15} /> Ver detalle completo
                          </button>
                        </div>

                        {/* Contenedor de datos faltantes */}
                        <div style={{
                          backgroundColor: "var(--surface-2)",
                          borderRadius: 12,
                          border: "1px solid var(--border)",
                          padding: 16,
                        }}>
                          {/* Datos del Depósito */}
                          <h4 style={{ fontSize: 13, fontWeight: 800, color: "var(--text)", marginBottom: 10 }}>Datos del Depósito</h4>
                          {/* Sucursal y Tipo aquí en el detalle expandido */}
                          <div style={detailRowStyle}>
                            <span style={detailLabelStyle}>Sucursal:</span>
                            <span style={detailValueStyle}>{d.branch}</span>
                          </div>
                          <div style={detailRowStyle}>
                            <span style={detailLabelStyle}>Tipo:</span>
                            <span style={detailValueStyle}>{d.paymentType}</span>
                          </div>
                          <div style={detailRowStyle}>
                            <span style={detailLabelStyle}>Folio Dep:</span>
                            <span style={detailValueStyle}>#{d.id}</span>
                          </div>
                          <div style={detailRowStyle}>
                            <span style={detailLabelStyle}>Sesión:</span>
                            <span style={detailValueStyle}>#{d.sessionId}</span>
                          </div>
                          <div style={detailRowStyle}>
                            <span style={detailLabelStyle}>Cuenta Nro:</span>
                            <span style={{ ...detailValueStyle, fontFamily: "monospace" }}>{d.accountNumber}</span>
                          </div>

                          {/* Estado y Confirmación */}
                          <h4 style={{ fontSize: 13, fontWeight: 800, color: "var(--text)", marginTop: 16, marginBottom: 10 }}>Estado y Confirmación</h4>
                          <div style={detailRowStyle}>
                            <span style={detailLabelStyle}>Estado:</span>
                            <span style={detailValueStyle}>
                              <Badge tone={d.status === "CONFIRMADO" || d.status === "COMPLETED" ? "green" : "red"}>{d.status}</Badge>
                            </span>
                          </div>

                          <div style={{ ...detailRowStyle, marginTop: 8, alignItems: 'flex-start' }}>
                            <span style={detailLabelStyle}>Confirmado:</span>
                            <span style={{ display: "inline-flex", flexDirection: 'column', alignItems: "center", gap: 8 }}>
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
                              <span style={{ fontSize: 11, color: "var(--text-muted)", textAlign: 'center' }}>
                                {d.status === "COMPLETED" || d.status === "CONFIRMADO" ? "Confirmado" : "Pendiente"}
                              </span>
                            </span>
                          </div>

                          {/* Comentarios si existen */}
                          {d.comments && (
                            <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 4 }}>Comentarios:</div>
                              <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{renderComments(d.comments)}</div>
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
        <div className="table-sticky-head">
          <style>{`
            .table-sticky-head table {
              width: 100%;
            }
            .table-sticky-head thead th {
              position: sticky;
              top: 0;
              z-index: 1;
              background: var(--surface-2);
            }
            /* Permite que el scrollbar vertical se superponga (overlay) para que las filas ocupen el 100% del ancho */
            .table-sticky-head > div {
              overflow-y: overlay !important;
            }
            /* Estilos premium para los scrollbars del contenedor de la tabla */
            .table-sticky-head > div::-webkit-scrollbar {
              width: 8px;
              height: 8px;
            }
            .table-sticky-head > div::-webkit-scrollbar-track {
              background: transparent;
            }
            .table-sticky-head > div::-webkit-scrollbar-thumb {
              background: var(--border-strong);
              border-radius: 4px;
            }
            .table-sticky-head > div::-webkit-scrollbar-thumb:hover {
              background: var(--accent);
            }
          `}</style>
          <DataTable
            columns={columns}
            data={paged.pageItems}
            loading={loading}
            error={loadError || mutationError}
            emptyMessage="No hay depósitos bancarios registrados."
            keyExtractor={(d) => d.id}
            height="calc(100vh - 275px)"
          />
        </div>
      )}

      {!loading && !loadError && (
        <Pagination page={paged.page} pageCount={paged.pageCount} total={paged.total} from={paged.from} to={paged.to} onPage={paged.setPage} itemLabel="depósitos" />
      )}

      <ActionModal
        isOpen={detailOpen && !!selectedDeposit}
        onClose={closeDetail}
        title={`Depósito #${selectedDeposit?.id ?? ""}`}
        footer={
          <>
            <button
              onClick={closeDetail}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                padding: isMobile ? "0" : "10px 16px",
                width: isMobile ? 38 : "auto",
                height: isMobile ? 38 : "auto",
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "14px",
                fontWeight: "600",
                color: "var(--text)",
              }}
              title="Cerrar"
            >
              <X size={15} />
              {!isMobile && <span>Cerrar</span>}
            </button>
            <button
              onClick={() => selectedDeposit && printDeposit(selectedDeposit)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                padding: isMobile ? "0" : "10px 16px",
                width: isMobile ? 38 : "auto",
                height: isMobile ? 38 : "auto",
                background: "#3b82f6",
                color: "white",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "14px",
                fontWeight: "600",
              }}
              title="Imprimir"
            >
              <Printer size={15} />
              {!isMobile && <span>Imprimir</span>}
            </button>
          </>
        }
      >
        {selectedDeposit && (
          <>
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
                <strong>Monto:</strong>{" "}
                <span style={{ color: "#dc2626", fontSize: "16px", fontWeight: "bold" }}>
                  -${selectedDeposit.amount.toFixed(2)}
                </span>
              </p>
              <p style={{ margin: "8px 0" }}>
                <strong>Fecha:</strong> {new Date(selectedDeposit.createdAt).toLocaleString()}
              </p>
              <p style={{ margin: "8px 0" }}>
                <strong>Estado:</strong>{" "}
                <span
                  style={{
                    background:
                      selectedDeposit.status === "CONFIRMADO" || selectedDeposit.status === "COMPLETED"
                        ? "#d1fae5"
                        : "#fee2e2",
                    color:
                      selectedDeposit.status === "CONFIRMADO" || selectedDeposit.status === "COMPLETED"
                        ? "#065f46"
                        : "#991b1b",
                    padding: "4px 8px",
                    borderRadius: "4px",
                    fontSize: "12px",
                  }}
                >
                  {selectedDeposit.status}
                </span>
              </p>
              <p style={{ margin: "8px 0" }}>
                <strong>Comentarios:</strong> {renderComments(selectedDeposit.comments)}
              </p>
            </div>
          </>
        )}
      </ActionModal>
    </div>
  );
};

export default DepositosView;