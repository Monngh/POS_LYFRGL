import React from "react";

interface TicketEmailModalProps {
  isOpen: boolean;
  emailInput: string;
  emailError: string;
  emailLoading: boolean;
  onEmailChange: (val: string) => void;
  onSend: () => void;
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
    zIndex: 100002,
  },
  modalCard: {
    width: "420px",
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

export function TicketEmailModal({
  isOpen,
  emailInput,
  emailError,
  emailLoading,
  onEmailChange,
  onSend,
  onCancel,
}: TicketEmailModalProps) {
  if (!isOpen) return null;

  return (
    <div style={styles.modalOverlay} className="pos-cashier-modal-overlay pos-cashier-modal-overlay--center">
      <div
        style={styles.modalCard}
        className="pos-cashier-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={styles.modalTitle}>Enviar ticket por correo</h3>
        <p style={{ fontSize: "13px", color: "var(--text-secondary)", margin: "12px 0 16px 0", lineHeight: 1.5, textAlign: "center" }}>
          Ingrese o confirme el correo electrónico del destinatario. El ticket se enviará como PDF adjunto con el mismo diseño de impresión.
        </p>

        <div style={styles.inputGroup}>
          <label style={styles.label}>Correo electrónico *</label>
          <input
            type="email"
            className="input-corporate"
            placeholder="cliente@correo.com"
            value={emailInput}
            onChange={(e) => onEmailChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !emailLoading && emailInput) onSend();
            }}
            autoFocus
          />
        </div>

        {emailError && (
          <p style={{ fontSize: "12px", color: "#dc2626", fontWeight: 600, margin: 0, textAlign: "center" }}>
            {emailError}
          </p>
        )}

        <div style={{ display: "flex", gap: "10px", marginTop: "4px" }} className="pos-cashier-modal-actions">
          <button
            type="button"
            onClick={onCancel}
            style={{ ...styles.modalBtn, backgroundColor: "var(--text-muted)", color: "white" }}
            disabled={emailLoading}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onSend}
            style={{ ...styles.modalBtn, backgroundColor: "#2563eb", color: "white" }}
            disabled={emailLoading || !emailInput}
          >
            {emailLoading ? "Enviando..." : "Enviar correo"}
          </button>
        </div>
      </div>
    </div>
  );
}
