import React, { useEffect, useRef } from "react";
import { Mail } from "lucide-react";
import { PosModal } from "./shared";

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
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 100);
    }
  }, [isOpen]);

  if (!isOpen) return null;


  const renderFooter = () => (
    <div style={{ display: "flex", gap: "10px", width: "100%" }} className="pos-cashier-modal-actions">
      <button
        type="button"
        data-shortcut="cancel"
        data-shortcut-letter="X"
        title="Cancelar"
        onClick={onCancel}
        style={{ ...styles.modalBtn, backgroundColor: "var(--text-muted)", color: "white" }}
        disabled={emailLoading}
      >
        Cancelar
      </button>
      <button
        type="button"
        data-shortcut="confirm"
        data-shortcut-action="send-email"
        data-shortcut-letter="S"
        title="Enviar correo (Alt+S, Enter)"
        onClick={onSend}
        style={{ ...styles.modalBtn, backgroundColor: "#2563eb", color: "white" }}
        disabled={emailLoading || !emailInput}
      >
        {emailLoading ? "Enviando..." : "Enviar correo"}
      </button>
    </div>
  );

  return (
    <PosModal
      isOpen={isOpen}
      onClose={onCancel}
      title="Enviar ticket por correo"
      subtitle="Ingrese o confirme el correo electrónico del destinatario. El ticket se enviará como PDF adjunto con el mismo diseño de impresión."
      icon={<Mail size={24} />}
      iconColor="#2563eb"
      size="md"
      footer={renderFooter()}
    >
      <div style={styles.inputGroup}>
        <label style={styles.label}>Correo electrónico *</label>
        <input
          ref={inputRef}
          type="email"
          className="input-corporate"
          placeholder="cliente@correo.com"
          value={emailInput}
          onChange={(e) => onEmailChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !emailLoading && emailInput) {
              e.preventDefault();
              onSend();
            }
          }}
          autoFocus
        />
      </div>

      {emailError && (
        <p style={{ fontSize: "12px", color: "#dc2626", fontWeight: 600, margin: "8px 0 0 0", textAlign: "center" }}>
          {emailError}
        </p>
      )}
    </PosModal>
  );
}
