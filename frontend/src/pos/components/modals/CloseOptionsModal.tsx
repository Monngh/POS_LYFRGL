import React from "react";

interface CloseOptionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPartialCut: () => void;
  onCloseCash: () => void;
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
  backgroundColor: "var(--surface)",
  borderRadius: "12px",
  padding: "28px",
  boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)",
};

const modalTitle: React.CSSProperties = {
  fontSize: "16px",
  fontWeight: "800",
  color: "var(--text)",
  borderBottom: "1px solid var(--border)",
  paddingBottom: "8px",
};

export default function CloseOptionsModal({
  isOpen,
  onClose,
  onPartialCut,
  onCloseCash,
}: CloseOptionsModalProps) {
  if (!isOpen) return null;

  return (
    <div style={modalOverlay} className="pos-cashier-modal-overlay pos-cashier-modal-overlay--center">
      <div style={{ ...closeModal, width: "400px" }} className="pos-cashier-modal">
        <h3 style={modalTitle}>Cierre de Caja</h3>
        <p style={{ fontSize: "13px", color: "var(--text-muted)", margin: "8px 0 20px 0", textAlign: "center", lineHeight: "1.5" }}>
          Seleccione la operación de caja que desea realizar:
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", width: "100%" }}>
          <button
            onClick={onPartialCut}
            style={{
              padding: "14px",
              borderRadius: "8px",
              border: "1px solid #3b82f6",
              backgroundColor: "#eff6ff",
              color: "var(--accent-strong)",
              fontWeight: "700",
              cursor: "pointer",
              fontSize: "14px",
              transition: "all 0.15s ease",
              textAlign: "center"
            }}
            className="active-tap"
          >
            Corte Parcial (Cut de Caja)
          </button>
          <button
            onClick={onCloseCash}
            style={{
              padding: "14px",
              borderRadius: "8px",
              border: "none",
              backgroundColor: "#dc2626",
              color: "white",
              fontWeight: "700",
              cursor: "pointer",
              fontSize: "14px",
              transition: "all 0.15s ease",
              textAlign: "center"
            }}
            className="active-tap"
          >
            Cierre de Turno (Final)
          </button>
          <button
            onClick={onClose}
            style={{
              padding: "10px",
              borderRadius: "6px",
              border: "1px solid var(--border-strong)",
              backgroundColor: "var(--surface)",
              color: "var(--text-muted)",
              fontWeight: "700",
              cursor: "pointer",
              fontSize: "12px",
              textAlign: "center",
              marginTop: "8px"
            }}
          >
            CANCELAR
          </button>
        </div>
      </div>
    </div>
  );
}
