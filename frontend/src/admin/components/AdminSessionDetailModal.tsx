import React, { useEffect, useState } from "react";
import { X } from "lucide-react";
import api from "../../shared/services/api";
import { ui, Badge, money, fmtDateTime, statusTone, printTicketHtml } from "../views/shared";

interface SessionDetail {
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
  forceCloseReason: string | null;
  payBreakdown: {
    efectivo: number;
    tarjetaCredito: number;
    tarjetaDebito: number;
    mercadoPago: number;
    totalVentas: number;
  };
  movements: {
    id: number;
    date: string;
    type: string;
    description: string;
    amount: number;
    balance: number;
  }[];
}

const sectionLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "var(--text-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.5px",
  marginBottom: 10,
};

const finBox: React.CSSProperties = {
  backgroundColor: "var(--surface-2)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "12px 16px",
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const FinRow: React.FC<{ label: string; value: string; bold?: boolean; color?: string }> = ({
  label,
  value,
  bold,
  color,
}) => (
  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, alignItems: "center" }}>
    <span style={{ color: "var(--text-muted)" }}>{label}</span>
    <span style={{ fontWeight: bold ? 800 : 600, color: color ?? "var(--text)" }}>{value}</span>
  </div>
);

const PayRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
    <span style={{ color: "var(--text-muted)" }}>{label}</span>
    <span style={{ fontWeight: 700, color: "var(--text-secondary)" }}>{value}</span>
  </div>
);

const movTypeColor = (type: string) =>
  type === "VENTA" ? "#15803d" : type === "CANCELACIÓN" ? "#b91c1c" : "#2563eb";

interface AdminSessionDetailModalProps {
  sessionId: number | null;
  onClose: () => void;
}

// Ventana de detalle de caja invocada desde EmpleadosView; estructura visual clonada de
// CajasView.tsx (modal "Detalle de Caja") — se mantiene independiente para no arriesgar
// regresiones en esa vista. z-index explícito por encima del modal de empleado (ActionModal, 1000).
const AdminSessionDetailModal: React.FC<AdminSessionDetailModalProps> = ({ sessionId, onClose }) => {
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sessionId == null) {
      setDetail(null);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setDetail(null);
    setError(null);
    api
      .get<{
        session: Omit<SessionDetail, "payBreakdown" | "movements">;
        payBreakdown: SessionDetail["payBreakdown"];
        movements: SessionDetail["movements"];
      }>(`/api/admin/cash-sessions/${sessionId}`)
      .then((res) => {
        if (!cancelled) {
          setDetail({ ...res.data.session, payBreakdown: res.data.payBreakdown, movements: res.data.movements });
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.response?.data?.message || "No se pudieron cargar los detalles de la sesión.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const printCashReport = () => {
    if (!detail) return;

    const d = detail;
    const diffColor = d.difference === null ? "#94a3b8" : d.difference >= 0 ? "#15803d" : "#b91c1c";
    const diffStr =
      d.difference !== null
        ? `${d.difference >= 0 ? "+" : ""}$${d.difference.toFixed(2)}`
        : "—";

    const body = `
      <div>
        <div class="ticket-header">
          <span class="ticket-store">LYFRGL POS</span>
          <span class="ticket-muted">Sucursal: ${d.branch}</span>
          <span class="ticket-operation">ARQUEO DE CAJA</span>
        </div>
        <div class="ticket-section">
          <div class="ticket-row"><span>Folio:</span><span class="ticket-value">Caja #${d.id}</span></div>
          <div class="ticket-row"><span>Cajero:</span><span class="ticket-value">${d.cajero}</span></div>
          <div class="ticket-row"><span>Estado:</span><span class="ticket-value">${d.status}</span></div>
          <div class="ticket-row"><span>Apertura:</span><span class="ticket-value">${fmtDateTime(d.openedAt)}</span></div>
          ${d.closedAt ? `<div class="ticket-row"><span>Cierre:</span><span class="ticket-value">${fmtDateTime(d.closedAt)}</span></div>` : ""}
        </div>
        <div class="ticket-section">
          <div class="ticket-row"><span>Fondo inicial:</span><span class="ticket-value">$${d.initialAmount.toFixed(2)}</span></div>
          <div class="ticket-row"><span>Ventas efectivo:</span><span class="ticket-value">$${d.cashIn.toFixed(2)}</span></div>
          <div class="ticket-row"><span>Depositos/salidas:</span><span class="ticket-value">-$${d.cashOut.toFixed(2)}</span></div>
          <div class="ticket-row"><span>Efectivo esperado:</span><span class="ticket-value">$${d.expectedAmount.toFixed(2)}</span></div>
          <div class="ticket-row"><span>Declarado:</span><span class="ticket-value">${d.declaredAmount !== null ? "$" + d.declaredAmount.toFixed(2) : "N/A"}</span></div>
          <div class="ticket-row ticket-total"><span>Diferencia:</span><span style="color:${diffColor}">${diffStr}</span></div>
        </div>
        <div class="ticket-section">
          <div class="ticket-row"><span>Efectivo:</span><span class="ticket-value">$${d.payBreakdown.efectivo.toFixed(2)}</span></div>
          <div class="ticket-row"><span>T. credito:</span><span class="ticket-value">$${d.payBreakdown.tarjetaCredito.toFixed(2)}</span></div>
          <div class="ticket-row"><span>T. debito:</span><span class="ticket-value">$${d.payBreakdown.tarjetaDebito.toFixed(2)}</span></div>
          <div class="ticket-row"><span>MercadoPago:</span><span class="ticket-value">$${d.payBreakdown.mercadoPago.toFixed(2)}</span></div>
          <div class="ticket-row ticket-total"><span>Total ventas:</span><span>$${d.payBreakdown.totalVentas.toFixed(2)}</span></div>
        </div>
        <div class="ticket-section">
          <div style="font-weight:800;margin-bottom:4px;">MOVIMIENTOS (${d.movements.length})</div>
          ${d.movements
        .map(
          (m) => `
                <div style="border-top:1px dashed #cbd5e1;padding-top:4px;margin-top:4px;">
                  <div class="ticket-row"><span>${fmtDateTime(m.date)}</span><span class="ticket-value">${m.type}</span></div>
                  <div style="font-size:9px;margin-bottom:3px;">${m.description}</div>
                  <div class="ticket-row"><span>Monto:</span><span class="ticket-value" style="color:${m.amount >= 0 ? "#15803d" : "#b91c1c"}">${m.amount >= 0 ? "+" : ""}$${m.amount.toFixed(2)}</span></div>
                  <div class="ticket-row"><span>Saldo:</span><span class="ticket-value">$${m.balance.toFixed(2)}</span></div>
                </div>`
        )
        .join("")}
        </div>
        <div class="ticket-footer">
          <p>COMPROBANTE DE ARQUEO</p>
          <p>Documento generado el ${new Date().toLocaleString("es-MX")}</p>
        </div>
      </div>
    `;

    printTicketHtml(`Arqueo Caja #${d.id}`, body);
  };

  if (sessionId == null) return null;

  return (
    <div
      style={{ ...ui.overlay, zIndex: 1100 }}
      onClick={onClose}
    >
      <div
        style={{ ...ui.modal, maxWidth: 750, width: "100%", maxHeight: "90vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ ...ui.modalHeader, gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={ui.modalTitle}>Caja #{detail?.id ?? "…"}</span>
            {detail && (
              <span style={{ marginLeft: 10, fontSize: 13, color: "var(--text-muted)" }}>
                Cajero: <strong>{detail.cajero}</strong> | Sucursal: <strong>{detail.branch}</strong>
              </span>
            )}
          </div>
          {detail && <Badge tone={statusTone(detail.status)}>{detail.status}</Badge>}
          <button style={ui.ghostBtn} onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={ui.modalBody}>
          {loading && (
            <p style={{ textAlign: "center", color: "var(--text-faint)", padding: "24px 0", fontSize: 13 }}>
              Cargando detalles...
            </p>
          )}
          {error && (
            <p style={{ color: "var(--color-danger)", fontSize: 13, padding: "8px 0" }}>{error}</p>
          )}

          {!loading && !error && detail && (
            <>
              {/* Apertura */}
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>
                Apertura: {fmtDateTime(detail.openedAt)}
                {detail.closedAt && <> &nbsp;·&nbsp; Cierre: {fmtDateTime(detail.closedAt)}</>}
                {detail.forceCloseReason && (
                  <span style={{ color: "var(--color-danger)", marginLeft: 8 }}>
                    ⚠ Cierre forzado: {detail.forceCloseReason}
                  </span>
                )}
              </p>

              {/* Desglose financiero */}
              <p style={sectionLabel}>Desglose financiero</p>
              <div style={finBox}>
                <FinRow label="Monto inicial (fondo):" value={money(detail.initialAmount)} />
                <FinRow label="+ Ventas (efectivo neto):" value={money(detail.cashIn)} />
                <FinRow label="– Depósitos (salidas):" value={money(detail.cashOut)} />
                <div style={{ borderTop: "1px solid var(--border)", margin: "8px 0" }} />
                <FinRow label="= Esperado (teórico):" value={money(detail.expectedAmount)} bold />
                <div style={{ borderTop: "1px dashed var(--border-strong)", margin: "8px 0" }} />
                <FinRow
                  label="Declarado (contado):"
                  value={detail.declaredAmount !== null ? money(detail.declaredAmount) : "—"}
                />
                <FinRow
                  label="Diferencia:"
                  value={
                    detail.difference !== null
                      ? (detail.difference >= 0 ? `+${money(detail.difference)}` : money(detail.difference))
                      : "—"
                  }
                  bold
                  color={
                    detail.difference === null
                      ? "var(--text-faint)"
                      : detail.difference >= 0
                        ? "var(--color-success)"
                        : "var(--color-danger)"
                  }
                />
              </div>

              {/* Desglose por método de pago */}
              <p style={{ ...sectionLabel, marginTop: 18 }}>Por método de pago (ventas completadas)</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 24px", marginBottom: 6 }}>
                <PayRow label="Efectivo" value={money(detail.payBreakdown.efectivo)} />
                <PayRow label="Tarjeta crédito" value={money(detail.payBreakdown.tarjetaCredito)} />
                <PayRow label="Tarjeta débito" value={money(detail.payBreakdown.tarjetaDebito)} />
                <PayRow label="MercadoPago QR" value={money(detail.payBreakdown.mercadoPago)} />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", fontSize: 13, fontWeight: 700, color: "var(--text)", paddingTop: 6, borderTop: "1px solid var(--border-soft)" }}>
                Total ventas: {money(detail.payBreakdown.totalVentas)}
              </div>

              {/* Tabla de movimientos */}
              <p style={{ ...sectionLabel, marginTop: 18 }}>Últimos movimientos ({detail.movements.length})</p>
              {detail.movements.length === 0 ? (
                <p style={{ fontSize: 13, color: "var(--text-faint)", textAlign: "center", padding: "12px 0" }}>
                  Sin movimientos registrados.
                </p>
              ) : (
                <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflowX: "auto", overflowY: "hidden", maxWidth: "100%" }}>
                  <table style={{ ...ui.table, fontSize: 12 }}>
                    <thead>
                      <tr style={ui.theadRow}>
                        <th style={{ ...ui.th, fontSize: 10 }}>Fecha / hora</th>
                        <th style={{ ...ui.th, fontSize: 10 }}>Tipo</th>
                        <th style={{ ...ui.th, fontSize: 10 }}>Descripción</th>
                        <th style={{ ...ui.th, fontSize: 10, textAlign: "right" }}>Monto</th>
                        <th style={{ ...ui.th, fontSize: 10, textAlign: "right" }}>Saldo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.movements.map((m) => (
                        <tr key={m.id}>
                          <td style={{ ...ui.td, fontSize: 12 }}>{fmtDateTime(m.date)}</td>
                          <td style={{ ...ui.td, fontSize: 12 }}>
                            <span style={{ color: movTypeColor(m.type), fontWeight: 700 }}>{m.type}</span>
                          </td>
                          <td style={{ ...ui.td, fontSize: 12, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }}>
                            {m.description}
                          </td>
                          <td style={{ ...ui.td, fontSize: 12, textAlign: "right", fontWeight: 700, color: m.amount >= 0 ? "#15803d" : "#b91c1c" }}>
                            {m.amount >= 0 ? "+" : ""}{money(m.amount)}
                          </td>
                          <td style={{ ...ui.td, fontSize: 12, textAlign: "right", color: "var(--text-secondary)" }}>
                            {money(m.balance)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "14px 22px",
            borderTop: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <button style={ui.ghostBtn} onClick={onClose}>
            Cerrar
          </button>
          <button
            style={{ ...ui.primaryBtn, backgroundColor: "#2563eb" }}
            onClick={printCashReport}
            disabled={loading || !detail}
            title="Imprimir arqueo de esta caja"
          >
            Imprimir
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminSessionDetailModal;
