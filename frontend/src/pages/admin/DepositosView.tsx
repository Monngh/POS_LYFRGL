import React, { useEffect, useRef, useState } from "react";
import api from "../../services/api";
import { useAdminData } from "../../hooks";
import { DataTable, ActionModal } from "../../components/common";
import type { Column } from "../../components/common";
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
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [account, setAccount] = useState<string>("");
  const [accounts, setAccounts] = useState<string[]>([]);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedDeposit, setSelectedDeposit] = useState<any>(null);
  const [confirmingDepositId, setConfirmingDepositId] = useState<number | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const filterParams: Record<string, unknown> = {};
  if (branchId !== "all") filterParams.branchId = branchId;
  if (from) filterParams.from = from;
  if (to) filterParams.to = to;
  if (account) filterParams.account = account;

  const { data, loading, error: loadError, refetch } = useAdminData<{ deposits: DepositRow[] }>(
    "/api/admin/bank-deposits",
    { params: filterParams }
  );
  const rows = data?.deposits ?? [];

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
      const uniqueAccounts = [...new Set(rows.map((r) => r.accountNumber))].filter(Boolean);
      setAccounts(uniqueAccounts);
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

    printTicketHtml(`Deposito #${deposit.id}`, body);
  };

  const total = rows.reduce((acc, d) => acc + d.amount, 0);

  const columns: Column<DepositRow>[] = [
    {
      key: "createdAt",
      header: "Fecha",
      render: (d) => (
        <>{fmtDate(d.createdAt)} <span style={{ color: "#94a3b8" }}>{fmtTime(d.createdAt)}</span></>
      ),
    },
    {
      key: "accountMasked",
      header: "Cuenta Destino",
      render: (d) => (
        <span style={{ fontFamily: "monospace", color: "#475569" }}>{d.accountMasked}</span>
      ),
    },
    {
      key: "targetName",
      header: "Beneficiario",
      render: (d) => (
        <span style={{ fontWeight: 600, color: "#0f172a", whiteSpace: "normal" }}>{d.targetName}</span>
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
      render: (d) => <span style={{ color: "#64748b" }}>#{d.sessionId}</span>,
    },
    {
      key: "status",
      header: "Confirmado",
      align: "center",
      width: "80px",
      render: (d) => (
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
              padding: 0,
            }}
            title="Ver detalles"
          >
            Ver
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

      <div className="table-sticky-head">
        <DataTable
          columns={columns}
          data={rows}
          loading={loading}
          error={loadError || mutationError}
          emptyMessage="No hay depósitos bancarios registrados."
          keyExtractor={(d) => d.id}
        />
      </div>

      <ActionModal
        isOpen={detailOpen && !!selectedDeposit}
        onClose={closeDetail}
        title={`Depósito #${selectedDeposit?.id ?? ""}`}
        footer={
          <>
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
              }}
            >
              Cerrar
            </button>
            <button
              onClick={() => selectedDeposit && printDeposit(selectedDeposit)}
              style={{
                padding: "10px 16px",
                background: "#3b82f6",
                color: "white",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "14px",
                fontWeight: "600",
              }}
            >
              Imprimir
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
