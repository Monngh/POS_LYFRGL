import React from "react";
import { Receipt } from "lucide-react";
import { PosModal } from "./shared";

interface CloseReceiptModalProps {
  isOpen: boolean;
  lastClosedStats: any;
  user: any;
  onClose: () => void;
  onPrint: () => void;
  emailButton: React.ReactNode;
}



const ticketContainer: React.CSSProperties = {
  boxSizing: "border-box",
  width: "80mm",
  maxWidth: "80mm",
  margin: "0 auto",
  padding: "10px 12px",
  border: "1px solid #d4d4d4",
  borderRadius: "4px",
  backgroundColor: "var(--surface)",
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

export default function CloseReceiptModal({
  isOpen,
  lastClosedStats,
  user,
  onClose,
  onPrint,
  emailButton,
}: CloseReceiptModalProps) {
  if (!isOpen || !lastClosedStats) return null;

  const renderFooter = () => (
    <div style={{ display: "flex", gap: "10px", width: "100%" }} className="pos-cashier-modal-actions no-print" data-no-ticket-print="true">
      <button
        title="Imprimir (Alt+C)"
        data-shortcut="confirm"
        data-shortcut-letter="C"
        onClick={onPrint}
        style={{ ...modalBtn, backgroundColor: "var(--accent-strong)", color: "white" }}
      >
        IMPRIMIR
      </button>
      {emailButton}
      <button
        title="Cerrar (Esc)"
        data-shortcut="cancel"
        data-shortcut-letter="X"
        onClick={onClose}
        style={{ ...modalBtn, backgroundColor: "#059669", color: "white" }}
      >
        SALIR
      </button>
    </div>
  );

  return (
    <PosModal
      isOpen={isOpen}
      onClose={onClose}
      title="Cierre de Turno"
      subtitle="Corte Z generado exitosamente."
      icon={<Receipt size={24} />}
      iconColor="#059669"
      size="md"
      footer={renderFooter()}
    >
      <div style={{ display: "flex", justifyContent: "center" }}>
        <div style={ticketContainer} id="close-thermal-receipt" className="ticket-print pos-paper">
          <div style={{ textAlign: "center", borderBottom: "1px dashed #cbd5e1", paddingBottom: "10px", marginBottom: "10px" }}>
            <strong style={{ fontSize: "14px" }}>LYFRGL POS</strong>
            <p style={{ fontSize: "11px", margin: "2px 0 0 0" }}>{lastClosedStats.session?.branch?.name || user?.branch?.name}</p>
            <p style={{ fontSize: "12px", fontWeight: "700", margin: "4px 0 0 0" }}>*** CORTE Z (CIERRE DE CAJA) ***</p>
            <p style={{ fontSize: "9px", margin: "2px 0 0 0", color: "var(--text-muted)" }}>
              Fecha Cierre: {lastClosedStats.session?.closedAt ? new Date(lastClosedStats.session.closedAt).toLocaleString() : new Date().toLocaleString()}
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "11px" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>CAJERO:</span>
              <strong>{lastClosedStats.session?.user?.name || user?.name}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>SUCURSAL:</span>
              <strong>{lastClosedStats.session?.branch?.name || user?.branch?.name}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>ID SESIÓN:</span>
              <strong>#{lastClosedStats.session?.id}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>HORA APERTURA:</span>
              <strong>{lastClosedStats.session?.openedAt ? new Date(lastClosedStats.session.openedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Á¢â‚¬â€"}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>HORA CIERRE:</span>
              <strong>{lastClosedStats.session?.closedAt ? new Date(lastClosedStats.session.closedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Á¢â‚¬â€"}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>ESTADO:</span>
              <strong>{lastClosedStats.session?.status}</strong>
            </div>

            <div className="dashed" style={{ borderTop: "1px dashed #cbd5e1", margin: "6px 0" }} />

            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>FONDO INICIAL:</span>
              <strong>${Number(lastClosedStats.initialAmount || 0).toFixed(2)}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>VENTAS EFECTIVO (+):</span>
              <strong>${Number(lastClosedStats.cashTotal || 0).toFixed(2)}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>RETIROS CAJA (-):</span>
              <strong style={{ color: "#dc2626" }}>-${Number(lastClosedStats.cashOut || 0).toFixed(2)}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>CANCELACIONES EFE (-):</span>
              <strong style={{ color: "#dc2626" }}>-${Number(lastClosedStats.cancelledCashTotal || 0).toFixed(2)}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>DEVOLUCIONES EFE (-):</span>
              <strong style={{ color: "#dc2626" }}>-${Number(lastClosedStats.returnedCashTotal || 0).toFixed(2)}</strong>
            </div>

            <div className="dashed" style={{ borderTop: "1px dashed #cbd5e1", margin: "6px 0" }} />

            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>EFECTIVO ESPERADO:</span>
              <strong>${Number(lastClosedStats.expectedAmount || 0).toFixed(2)}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>EFECTIVO DECLARADO:</span>
              <strong>${Number(lastClosedStats.declaredAmount || 0).toFixed(2)}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>DIFERENCIA:</span>
              <strong style={{ color: (lastClosedStats.difference || 0) < 0 ? "#dc2626" : "#059669" }}>
                ${Number(lastClosedStats.difference || 0).toFixed(2)}
              </strong>
            </div>

            <div className="dashed" style={{ borderTop: "1px dashed #cbd5e1", margin: "6px 0" }} />

            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>VENTAS TARJETA DEB:</span>
              <strong>${Number(lastClosedStats.debitCardTotal || 0).toFixed(2)}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>VENTAS TARJETA CRE:</span>
              <strong>${Number(lastClosedStats.creditCardTotal || 0).toFixed(2)}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>TOTAL CANCELACIONES:</span>
              <strong>${Number(lastClosedStats.totalRefunds || 0).toFixed(2)}</strong>
            </div>
            {lastClosedStats.totalReturnsAmount !== undefined && (
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>TOTAL DEVOLUCIONES:</span>
                <strong style={{ color: "#dc2626" }}>-${Number(lastClosedStats.totalReturnsAmount).toFixed(2)}</strong>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>TRANS. COMPLETADAS:</span>
              <strong>{lastClosedStats.salesCount}</strong>
            </div>
          </div>

          <div style={{ textAlign: "center", marginTop: "20px", fontSize: "9px", color: "var(--text-muted)", borderTop: "1px dashed #cbd5e1", paddingTop: "8px" }}>
            <span>*** GRACIAS POR SU JORNADA ***</span>
          </div>
        </div>
      </div>
    </PosModal>
  );
}
