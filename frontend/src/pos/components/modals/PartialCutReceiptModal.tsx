import React from "react";
import { Receipt } from "lucide-react";
import { PosModal } from "./shared";

interface PartialCutReceiptModalProps {
  isOpen: boolean;
  partialCutData: any;
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

export default function PartialCutReceiptModal({
  isOpen,
  partialCutData,
  user,
  onClose,
  onPrint,
  emailButton,
}: PartialCutReceiptModalProps) {
  if (!isOpen || !partialCutData) return null;


  const renderFooter = () => (
    <div style={{ display: "flex", gap: "10px", width: "100%" }} className="pos-cashier-modal-actions no-print" data-no-ticket-print="true">
      <button
        title="Imprimir"
        onClick={onPrint}
        style={{ ...modalBtn, backgroundColor: "#2563eb", color: "white" }}
      >
        IMPRIMIR
      </button>
      {emailButton}
      <button
        title="Cerrar"
        onClick={onClose}
        style={{ ...modalBtn, backgroundColor: "var(--text-muted)", color: "white" }}
      >
        CERRAR
      </button>
    </div>
  );

  return (
    <PosModal
      isOpen={isOpen}
      onClose={onClose}
      title="Comprobante de Corte Parcial"
      subtitle="Corte parcial registrado exitosamente en base de datos."
      icon={<Receipt size={24} />}
      iconColor="#3b82f6"
      size="md"
      footer={renderFooter()}
    >
      <div style={{ display: "flex", justifyContent: "center" }}>
        <div style={ticketContainer} id="partial-cut-thermal-receipt" className="ticket-print pos-paper">
          <div style={{ textAlign: "center", borderBottom: "1px dashed #cbd5e1", paddingBottom: "10px", marginBottom: "10px" }}>
            <strong style={{ fontSize: "14px" }}>LYFRGL POS</strong>
            <p style={{ fontSize: "11px", margin: "2px 0 0 0" }}>SUCURSAL: {user?.branch.name}</p>
            <p style={{ fontSize: "10px", margin: "2px 0 0 0" }}>CORTE PARCIAL #{partialCutData.cutNumber}</p>
            <p style={{ fontSize: "9px", margin: "2px 0 0 0", color: "var(--text-muted)" }}>
              {new Date(partialCutData.createdAt).toLocaleString()}
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "11px" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>CAJERO:</span>
              <strong>{user?.name}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>SESIÓN DE CAJA:</span>
              <strong>#{partialCutData.cashSessionId}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px dashed #cbd5e1", paddingTop: "6px", marginTop: "4px" }}>
              <span>VENTAS BRUTAS:</span>
              <strong>${Number(partialCutData.totalSales).toFixed(2)}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>EFECTIVO:</span>
              <strong>${Number(partialCutData.totalCash).toFixed(2)}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>TARJETA CRÉDITO:</span>
              <strong>${Number(partialCutData.totalCreditCard).toFixed(2)}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>TARJETA DÉBITO:</span>
              <strong>${Number(partialCutData.totalDebitCard).toFixed(2)}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>CANCELACIONES:</span>
              <strong style={{ color: "#dc2626" }}>-${Number(partialCutData.totalRefunds).toFixed(2)}</strong>
            </div>
            {partialCutData.totalReturns !== undefined && (
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>DEVOLUCIONES:</span>
                <strong style={{ color: "#dc2626" }}>-${Number(partialCutData.totalReturns).toFixed(2)}</strong>
              </div>
            )}
          </div>

          <div style={{ marginTop: "14px", paddingTop: "8px", borderTop: "2px solid #0f172a", display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
            <strong>TOTAL NETO:</strong>
            <strong>${Number(partialCutData.netTotal).toFixed(2)} MXN</strong>
          </div>

          <div style={{ textAlign: "center", marginTop: "20px", fontSize: "9px", color: "var(--text-muted)", borderTop: "1px dashed #cbd5e1", paddingTop: "8px" }}>
            <span>*** COMPROBANTE DE CORTE PARCIAL ***</span>
          </div>
        </div>
      </div>
    </PosModal>
  );
}
