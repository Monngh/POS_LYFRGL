import React from "react";
import { KeyRound } from "lucide-react";
import { PosModal } from "./shared";

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

  const renderFooter = () => (
    <div style={{ display: "flex", gap: "10px", width: "100%" }}>
      <button
        type="button"
        title="Cancelar"
        onClick={onCancel}
        style={{ ...styles.modalBtn, backgroundColor: "var(--text-muted)", color: "white" }}
      >
        CANCELAR
      </button>
      <button
        type="button"
        title="Autorizar"
        onClick={(e) => onSubmit(e as any)}
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
  );

  return (
    <PosModal
      isOpen={isOpen}
      onClose={onCancel}
      title="Autorización de Gerente"
      subtitle="Esta operación requiere la autorización de un Administrador o Gerente."
      icon={<KeyRound size={24} />}
      iconColor="#d97706"
      size="md"
      footer={renderFooter()}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
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
            onKeyDown={(e) => { if (e.key === "Enter" && cartPin) onSubmit(e as any); }}
            autoComplete="off"
          />
        </div>

        {cartPinError && (
          <p style={{ fontSize: "12px", color: "#dc2626", fontWeight: "600", margin: 0, textAlign: "center" }}>
            {cartPinError}
          </p>
        )}
      </div>
    </PosModal>
  );
}
