import React from "react";

interface SessionStats {
  totalSalesAmount?: number;
  cashTotal?: number;
  creditCardTotal?: number;
  debitCardTotal?: number;
  totalRefunds?: number;
  totalReturnsAmount?: number;
  netTotal?: number;
}

interface PartialCutSummaryModalProps {
  isOpen: boolean;
  onBack: () => void;
  onSave: () => void;
  partialCutLoading: boolean;
  sessionStats: SessionStats | null;
  userName: string | undefined;
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

const closeModal: React.CSSProperties = {
  width: "420px",
  backgroundColor: "#ffffff",
  borderRadius: "12px",
  padding: "28px",
  boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)",
};

const modalTitle: React.CSSProperties = {
  fontSize: "16px",
  fontWeight: "800",
  color: "#0f172a",
  borderBottom: "1px solid #e2e8f0",
  paddingBottom: "8px",
};

const summaryRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  fontSize: "13px",
  color: "#475569",
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

export default function PartialCutSummaryModal({
  isOpen,
  onBack,
  onSave,
  partialCutLoading,
  sessionStats,
  userName,
}: PartialCutSummaryModalProps) {
  if (!isOpen) return null;

  return (
    <div style={modalOverlay} className="pos-cashier-modal-overlay pos-cashier-modal-overlay--center">
      <div style={closeModal} className="pos-cashier-modal">
        <h3 style={modalTitle}>Resumen de Corte Parcial:</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "14px" }}>
          <div style={summaryRow}>
            <span>Vendedor:</span>
            <span style={{ fontWeight: "700" }}>{userName}</span>
          </div>
          <div style={summaryRow}>
            <span>Total Ventas Brutas:</span>
            <span style={{ fontWeight: "600" }}>${sessionStats?.totalSalesAmount?.toFixed(2) || "0.00"}</span>
          </div>
          <div style={summaryRow}>
            <span>Total Efectivo:</span>
            <span style={{ fontWeight: "600", color: "#059669" }}>${sessionStats?.cashTotal?.toFixed(2) || "0.00"}</span>
          </div>
          <div style={summaryRow}>
            <span>Total Tarjeta Crédito:</span>
            <span style={{ fontWeight: "600", color: "#0d9488" }}>${sessionStats?.creditCardTotal?.toFixed(2) || "0.00"}</span>
          </div>
          <div style={summaryRow}>
            <span>Total Tarjeta Débito:</span>
            <span style={{ fontWeight: "600", color: "#0d9488" }}>${sessionStats?.debitCardTotal?.toFixed(2) || "0.00"}</span>
          </div>
          <div style={summaryRow}>
            <span>Cancelaciones:</span>
            <span style={{ fontWeight: "600", color: "#dc2626" }}>${sessionStats?.totalRefunds?.toFixed(2) || "0.00"}</span>
          </div>
          <div style={summaryRow}>
            <span>Devoluciones:</span>
            <span style={{ fontWeight: "600", color: "#dc2626" }}>${sessionStats?.totalReturnsAmount?.toFixed(2) || "0.00"}</span>
          </div>
          <div style={{ ...summaryRow, borderTop: "1px dashed #cbd5e1", paddingTop: "10px", paddingBottom: "10px" }}>
            <span>Total Neto:</span>
            <span style={{ fontWeight: "800", color: "#1e3a8a", fontSize: "16px" }}>
              ${sessionStats?.netTotal?.toFixed(2) || "0.00"}
            </span>
          </div>

          <div style={{ display: "flex", gap: "10px", marginTop: "14px" }} className="pos-cashier-modal-actions">
            <button
              onClick={onBack}
              style={{ ...modalBtn, backgroundColor: "#dc2626", color: "white" }}
            >
              VOLVER
            </button>
            <button
              disabled={partialCutLoading}
              onClick={onSave}
              style={{ ...modalBtn, backgroundColor: "#059669", color: "white" }}
              className="active-tap"
            >
              {partialCutLoading ? "Guardando..." : "GUARDAR CORTE"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
