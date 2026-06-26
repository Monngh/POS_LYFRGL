import React from "react";

interface CartAuthorizationModalProps {
  isOpen: boolean;
  cartPin: string;
  cartPinError: string;
  cartPinLoading: boolean;
  onCartPinChange: (val: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
}

const styles: { [key: string]: React.CSSProperties } = {
  modalOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(15, 23, 42, 0.4)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 100001,
  },
  modalCard: {
    width: "380px",
    backgroundColor: "var(--surface)",
    borderRadius: "12px",
    padding: "28px",
    boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    border: "1px solid var(--border)",
  },
  modalTitle: {
    fontSize: "16px",
    fontWeight: "900",
    color: "var(--text)",
    textAlign: "center",
    margin: 0,
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },
  inputGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    textAlign: "left",
  },
  label: {
    fontSize: "11px",
    fontWeight: "700",
    color: "var(--text-secondary)",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },
  modalBtn: {
    flex: 1,
    padding: "10px",
    borderRadius: "6px",
    border: "none",
    fontWeight: "700",
    cursor: "pointer",
    textAlign: "center",
    fontSize: "12px",
    textTransform: "uppercase",
  },
};

export function CartAuthorizationModal({
  isOpen,
  cartPin,
  cartPinError,
  cartPinLoading,
  onCartPinChange,
  onSubmit,
  onCancel,
}: CartAuthorizationModalProps) {
  if (!isOpen) return null;

  return (
    <div style={styles.modalOverlay} className="pos-cashier-modal-overlay pos-cashier-modal-overlay--center">
      <div style={styles.modalCard} className="pos-cashier-modal">
        <h3 style={styles.modalTitle}>Autorización de Gerente/Admin</h3>
        <p style={{ fontSize: "12px", color: "var(--text-muted)", margin: "8px 0 16px 0", textAlign: "center", lineHeight: 1.4 }}>
          Esta operación requiere la autorización de un Administrador o Gerente. Ingrese la contraseña o clave de autorización.
        </p>

        <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div style={styles.inputGroup}>
            <label htmlFor="cartAuthorizationPassword" style={styles.label}>Contraseña de autorización:</label>
            <input
              id="cartAuthorizationPassword"
              autoFocus
              type="password"
              required
              className="input-corporate"
              placeholder="Contraseña o clave"
              value={cartPin}
              onChange={(e) => onCartPinChange(e.target.value)}
              autoComplete="off"
            />
          </div>

          {cartPinError && (
            <p style={{ fontSize: "12px", color: "#dc2626", fontWeight: "600", margin: 0, textAlign: "center" }}>
              {cartPinError}
            </p>
          )}

          <div style={{ display: "flex", gap: "10px", marginTop: "4px" }} className="pos-cashier-modal-actions">
            <button
              type="button"
              onClick={onCancel}
              style={{ ...styles.modalBtn, backgroundColor: "var(--text-muted)", color: "white" }}
            >
              CANCELAR
            </button>
            <button
              type="submit"
              disabled={cartPinLoading || !cartPin}
              style={{
                ...styles.modalBtn,
                backgroundColor: cartPin ? "var(--accent-strong)" : "var(--border-strong)",
                color: "white",
                cursor: cartPin ? "pointer" : "default",
              }}
            >
              {cartPinLoading ? "Validando..." : "AUTORIZAR"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
