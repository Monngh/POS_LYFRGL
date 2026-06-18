import React from "react";

interface DepositReceiptModalProps {
  isOpen: boolean;
  lastDeposit: any;
  user: any;
  syncingDepositId: number | null;
  onClose: () => void;
  onPrint: () => void;
  onSync: (depositId: number) => void;
  emailButton: React.ReactNode;
}

const modalOverlay: React.CSSProperties = {
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: "rgba(15, 23, 42, 0.4)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  zIndex: 100,
};

const ticketModal: React.CSSProperties = {
  width: "calc(80mm + 48px)",
  maxWidth: "95vw",
  backgroundColor: "#ffffff",
  borderRadius: "12px",
  padding: "24px",
  boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)",
};

const modalTitle: React.CSSProperties = {
  fontSize: "16px",
  fontWeight: "800",
  color: "#0f172a",
  borderBottom: "1px solid #e2e8f0",
  paddingBottom: "8px",
};

const ticketContainer: React.CSSProperties = {
  boxSizing: "border-box",
  width: "80mm",
  maxWidth: "80mm",
  margin: "0 auto",
  padding: "10px 12px",
  border: "1px solid #d4d4d4",
  borderRadius: "4px",
  backgroundColor: "#ffffff",
  color: "#111111",
  fontFamily: '"Courier New", monospace',
  fontSize: "10px",
  lineHeight: "1.25",
  maxHeight: "55vh",
  overflowY: "auto",
};

const modalBtn: React.CSSProperties = {
  flex: 1,
  padding: "10px",
  borderRadius: "6px",
  border: "none",
  fontWeight: "700",
  cursor: "pointer",
  textAlign: "center",
};

export default function DepositReceiptModal({
  isOpen,
  lastDeposit,
  user,
  syncingDepositId,
  onClose,
  onPrint,
  onSync,
  emailButton,
}: DepositReceiptModalProps) {
  if (!isOpen || !lastDeposit) return null;

  let mpMeta: any = null;
  if (lastDeposit.paymentType?.startsWith("MERCADOPAGO_")) {
    try {
      mpMeta = JSON.parse(lastDeposit.comments);
    } catch (e) {}
  }

  return (
    <div style={modalOverlay} className="pos-cashier-modal-overlay pos-cashier-modal-overlay--center">
      <div style={ticketModal} className="pos-cashier-modal">
        <h3 style={modalTitle}>Comprobante de Retiro</h3>
        <p style={{ fontSize: "11px", color: "#64748b", margin: "4px 0 16px 0", textAlign: "center" }}>
          Depósito bancario registrado exitosamente en base de datos.
        </p>

        <div style={ticketContainer} id="deposit-thermal-receipt" className="ticket-print">
          <div style={{ textAlign: "center", borderBottom: "1px dashed #cbd5e1", paddingBottom: "10px", marginBottom: "10px" }}>
            <strong style={{ fontSize: "14px" }}>LYFRGL POS</strong>
            <p style={{ fontSize: "11px", margin: "2px 0 0 0" }}>{user?.branch.name}</p>
            <p style={{ fontSize: "9px", margin: "2px 0 0 0", color: "#64748b" }}>
              {new Date(lastDeposit.createdAt).toLocaleString()}
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "11px" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>TIPO MOV:</span>
              <strong>RETIRO DE CAJA (DEPÓSITO)</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>ID RETIRO:</span>
              <strong>#{lastDeposit.id}</strong>
            </div>

            {lastDeposit.paymentType?.startsWith("MERCADOPAGO_") ? (
              <>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>MÉTODO RETIRO:</span>
                  <strong>{lastDeposit.paymentType.replace("MERCADOPAGO_", "")} (Mercado Pago)</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>REFERENCIA MP:</span>
                  <strong>{lastDeposit.accountNumber}</strong>
                </div>
                {mpMeta && mpMeta.convenio && mpMeta.convenio !== "N/A" && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>CONVENIO:</span>
                    <strong>{mpMeta.convenio}</strong>
                  </div>
                )}
                {mpMeta && mpMeta.expirationDate && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>EXPIRA:</span>
                    <strong>{new Date(mpMeta.expirationDate).toLocaleDateString()}</strong>
                  </div>
                )}
                {mpMeta && mpMeta.barcode && mpMeta.barcode !== "N/A" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px", borderTop: "1px dashed #cbd5e1", paddingTop: "4px", marginTop: "2px" }}>
                    <span style={{ color: "#64748b" }}>CÓDIGO DE BARRAS:</span>
                    <strong style={{ fontSize: "10px", wordBreak: "break-all" }}>{mpMeta.barcode}</strong>
                  </div>
                )}
                {mpMeta && mpMeta.ticketUrl && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px", borderTop: "1px dashed #cbd5e1", paddingTop: "4px", marginTop: "2px" }} className="no-print">
                    <span style={{ color: "#64748b" }}>TICKET DIGITAL:</span>
                    <a
                      href={mpMeta.ticketUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "#2563eb", textDecoration: "underline", wordBreak: "break-all", fontSize: "10px", fontWeight: "bold" }}
                    >
                      Ver Instrucciones de Pago
                    </a>
                  </div>
                )}
                {mpMeta && mpMeta.userComments && (
                  <div style={{ borderTop: "1px dashed #cbd5e1", paddingTop: "6px", marginTop: "4px" }}>
                    <span>REF/COMENTARIOS:</span>
                    <p style={{ margin: "2px 0 0 0", fontSize: "10px", fontStyle: "italic", color: "#475569" }}>
                      {mpMeta.userComments}
                    </p>
                  </div>
                )}
              </>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>CUENTA DESTINO:</span>
                  <strong>**** **** **** {lastDeposit.accountNumber.slice(-4)}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>BENEFICIARIO:</span>
                  <strong style={{ textAlign: "right" }}>{lastDeposit.targetName}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>MÉTODO DE RETIRO:</span>
                  <strong>{lastDeposit.paymentType}</strong>
                </div>
                {lastDeposit.comments && (
                  <div style={{ borderTop: "1px dashed #cbd5e1", paddingTop: "6px", marginTop: "4px" }}>
                    <span>REF/COMENTARIOS:</span>
                    <p style={{ margin: "2px 0 0 0", fontSize: "10px", fontStyle: "italic", color: "#475569" }}>
                      {lastDeposit.comments}
                    </p>
                  </div>
                )}
              </>
            )}

            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>SESIÓN DE CAJA:</span>
              <strong>#{lastDeposit.sessionId || lastDeposit.cashSessionId}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>CAJERO:</span>
              <strong>{lastDeposit.userName || user?.name}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>REFERENCIA:</span>
              <strong>{lastDeposit.reference || "N/A"}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>ESTADO:</span>
              <strong style={{ color: lastDeposit.status === "CANCELLED" ? "#b91c1c" : lastDeposit.status === "PENDING" ? "#d97706" : "inherit" }}>
                {lastDeposit.status === "CANCELLED" ? "CANCELADO" : lastDeposit.status === "PENDING" ? "PENDIENTE" : (lastDeposit.status || "COMPLETED")}
              </strong>
            </div>
            {lastDeposit.status === "CANCELLED" && lastDeposit.cancelledAt && (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", color: "#b91c1c" }}>
                  <span>CANCELADO EL:</span>
                  <strong>{new Date(lastDeposit.cancelledAt).toLocaleString()}</strong>
                </div>
                {lastDeposit.cancelReason && (
                  <div style={{ borderTop: "1px dashed #fca5a5", paddingTop: "4px", marginTop: "2px", color: "#b91c1c" }}>
                    <span>MOTIVO CANCELACIÓN:</span>
                    <p style={{ margin: "2px 0 0 0", fontSize: "10px", fontStyle: "italic" }}>
                      {lastDeposit.cancelReason}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>

          <div style={{ marginTop: "14px", paddingTop: "8px", borderTop: "2px solid #0f172a", display: "flex", justifyContent: "space-between", fontSize: "14px" }}>
            <strong>TOTAL RETIRADO:</strong>
            <strong>${Number(lastDeposit.amount).toFixed(2)} MXN</strong>
          </div>

          <div style={{ textAlign: "center", marginTop: "20px", fontSize: "9px", color: "#64748b", borderTop: "1px dashed #cbd5e1", paddingTop: "8px" }}>
            <span>*** COMPROBANTE DE MOVIMIENTO INTERNO ***</span>
          </div>
        </div>

        <div style={{ display: "flex", gap: "10px", marginTop: "20px" }} className="pos-cashier-modal-actions no-print" data-no-ticket-print="true">
          <button
            onClick={onPrint}
            style={{ ...modalBtn, backgroundColor: "#1e3a8a", color: "white" }}
          >
            IMPRIMIR
          </button>
          {emailButton}
          {lastDeposit.status === "PENDING" && lastDeposit.paymentType?.startsWith("MERCADOPAGO_") && (
            <button
              type="button"
              onClick={() => onSync(lastDeposit.id)}
              disabled={syncingDepositId === lastDeposit.id}
              style={{
                ...modalBtn,
                backgroundColor: "#2563eb",
                color: "white",
                opacity: syncingDepositId === lastDeposit.id ? 0.7 : 1,
                cursor: syncingDepositId === lastDeposit.id ? "not-allowed" : "pointer",
              }}
            >
              {syncingDepositId === lastDeposit.id ? "SINCRONIZANDO..." : "VERIFICAR PAGO"}
            </button>
          )}
          <button onClick={onClose} style={{ ...modalBtn, backgroundColor: "#059669", color: "white" }}>
            CERRAR
          </button>
        </div>
      </div>
    </div>
  );
}
