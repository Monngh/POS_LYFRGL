import React from "react";
import { ClipboardList } from "lucide-react";
import { PosModal } from "./shared";

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
  onClose?: () => void;
  onSave: () => void;
  partialCutLoading: boolean;
  sessionStats: SessionStats | null;
  userName: string | undefined;
}



const summaryRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  fontSize: "13px",
  color: "var(--text-secondary)",
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
  onClose,
  onSave,
  partialCutLoading,
  sessionStats,
  userName,
}: PartialCutSummaryModalProps) {
  if (!isOpen) return null;

  const renderFooter = () => (
    <div style={{ display: "flex", gap: "10px", width: "100%" }} className="pos-cashier-modal-actions">
      <button
        title="Volver"
        onClick={onBack}
        style={{ ...modalBtn, backgroundColor: "var(--text-muted)", color: "white" }}
      >
        VOLVER
      </button>
      <button
        title="Guardar corte"
        disabled={partialCutLoading}
        onClick={onSave}
        style={{ ...modalBtn, backgroundColor: "#2563eb", color: "white" }}
        className="active-tap"
      >
        {partialCutLoading ? "Guardando..." : "GUARDAR CORTE"}
      </button>
    </div>
  );

  return (
    <PosModal
      isOpen={isOpen}
      onClose={onClose || onBack}
      title="Resumen de Corte Parcial"
      icon={<ClipboardList size={24} />}
      iconColor="#3b82f6"
      size="md"
      footer={renderFooter()}
    >
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
          <span style={{ fontWeight: "800", color: "var(--accent-strong)", fontSize: "16px" }}>
            ${sessionStats?.netTotal?.toFixed(2) || "0.00"}
          </span>
        </div>
      </div>
    </PosModal>
  );
}
