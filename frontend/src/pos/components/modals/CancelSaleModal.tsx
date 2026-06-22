import React from "react";

interface CancelSalePreview {
  createdAt: string;
  total: number;
  items: { product: { name: string }; quantity: number }[];
}

interface CancelSaleModalProps {
  isOpen: boolean;
  onClose: () => void;
  cancelInvoice: string;
  cancelPin: string;
  cancelReason: string;
  cancelFieldErrors: Partial<Record<"invoice" | "pin" | "reason", string>>;
  cancelLoading: boolean;
  cancelSalePreview: CancelSalePreview | null;
  onSetField: (field: "invoice" | "pin" | "reason", value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
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

const cancelModal: React.CSSProperties = {
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

const inputGroup: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "6px",
  textAlign: "left",
};

const labelStyle: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: "700",
  color: "#475569",
  textTransform: "uppercase",
  letterSpacing: "0.5px",
};

const fieldError: React.CSSProperties = {
  color: "#b91c1c",
  fontSize: "12px",
  fontWeight: "600",
  marginTop: "5px",
  marginBottom: 0,
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

export default function CancelSaleModal({
  isOpen,
  onClose,
  cancelInvoice,
  cancelPin,
  cancelReason,
  cancelFieldErrors,
  cancelLoading,
  cancelSalePreview,
  onSetField,
  onSubmit,
}: CancelSaleModalProps) {
  if (!isOpen) return null;

  return (
    <div style={modalOverlay} className="pos-cashier-modal-overlay pos-cashier-modal-overlay--center">
      <div style={cancelModal} className="pos-cashier-modal">
        <h3 style={modalTitle}>Cancelación Producto / Venta:</h3>
        <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px", marginTop: "14px" }}>
          <div style={inputGroup}>
            <label htmlFor="cancelInvoice" style={labelStyle}>Folio de Venta (Invoice):</label>
            <input
              id="cancelInvoice"
              type="text"
              required
              className="input-corporate"
              placeholder="V-XXXXXX"
              value={cancelInvoice}
              onChange={(e) => onSetField("invoice", e.target.value)}
            />
            {cancelFieldErrors.invoice && <p style={fieldError}>{cancelFieldErrors.invoice}</p>}
          </div>

          {cancelSalePreview && (
            <div style={{
              backgroundColor: "#f8fafc",
              border: "1px dashed #cbd5e1",
              borderRadius: "6px",
              padding: "10px 12px",
              fontSize: "12px",
              color: "#334155",
              marginTop: "-4px"
            }}>
              <div style={{ fontWeight: "700", marginBottom: "4px", color: "#1e3a8a" }}>
                Resumen de Venta Encontrada:
              </div>
              <div><strong>Fecha:</strong> {new Date(cancelSalePreview.createdAt).toLocaleString()}</div>
              <div><strong>Total:</strong> <span style={{ fontWeight: "700", color: "#b91c1c" }}>${cancelSalePreview.total.toFixed(2)}</span></div>
              <div><strong>Artículos:</strong> {cancelSalePreview.items.reduce((sum: number, item) => sum + item.quantity, 0)} pz</div>
              <div style={{ fontSize: "10px", marginTop: "4px", color: "#64748b", maxHeight: "60px", overflowY: "auto" }}>
                {cancelSalePreview.items.map((it) => `${it.product.name} (x${it.quantity})`).join(", ")}
              </div>
            </div>
          )}

          <div style={inputGroup}>
            <label htmlFor="cancelPin" style={labelStyle}>PIN de Autorización del Gerente:</label>
            <input
              id="cancelPin"
              type="password"
              maxLength={4}
              required
              className="input-corporate"
              placeholder="PIN de 4 dígitos"
              value={cancelPin}
              onChange={(e) => onSetField("pin", e.target.value)}
            />
            {cancelFieldErrors.pin && <p style={fieldError}>{cancelFieldErrors.pin}</p>}
          </div>

          <div style={inputGroup}>
            <label htmlFor="cancelReason" style={labelStyle}>Motivo de Cancelación:</label>
            <input
              id="cancelReason"
              type="text"
              required
              maxLength={100}
              className="input-corporate"
              placeholder="Ej. Producto equivocado, error de cobro"
              value={cancelReason}
              onChange={(e) => onSetField("reason", e.target.value)}
            />
            {cancelFieldErrors.reason && <p style={fieldError}>{cancelFieldErrors.reason}</p>}
          </div>

          <div style={{ display: "flex", gap: "10px", marginTop: "10px" }} className="pos-cashier-modal-actions">
            <button
              type="button"
              onClick={onClose}
              style={{ ...modalBtn, backgroundColor: "#dc2626", color: "white" }}
            >
              VOLVER
            </button>
            <button
              type="submit"
              disabled={cancelLoading}
              style={{ ...modalBtn, backgroundColor: "#059669", color: "white" }}
            >
              {cancelLoading ? "Cancelando..." : "CANCELAR VENTA"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
