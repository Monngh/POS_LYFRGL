import React from "react";
import { X } from "lucide-react";
import { useBodyScrollLock } from "../hooks";

export type ConfirmModalVariant = "danger" | "warning" | "info";

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmModalVariant;
  isConfirming?: boolean;
  confirmDisabled?: boolean;
  closeDisabled?: boolean;
  confirmingLabel?: string;
}

const VARIANT_COLORS: Record<ConfirmModalVariant, { background: string; hover: string; disabled: string; border: string }> = {
  danger: {
    background: "#dc2626",
    hover: "#b91c1c",
    disabled: "#fca5a5",
    border: "#dc2626",
  },
  warning: {
    background: "#dc2626",
    hover: "#b91c1c",
    disabled: "#fca5a5",
    border: "#dc2626",
  },
  info: {
    background: "var(--accent, #2563eb)",
    hover: "var(--accent-strong, #1e3a8a)",
    disabled: "#93c5fd",
    border: "var(--accent, #2563eb)",
  },
};

// Estilos replicados de admin/views/shared.tsx (ui.overlay/modal/modalHeader/modalBody)
// para mantener consistencia visual sin crear una dependencia inversa shared -> admin.
const styles: { [k: string]: React.CSSProperties } = {
  overlay: {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(15,23,42,0.45)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 200,
    padding: 20,
  },
  modal: {
    backgroundColor: "var(--surface)",
    borderRadius: 14,
    boxShadow: "0 20px 25px -5px rgba(0,0,0,0.2)",
    width: "100%",
    maxWidth: 460,
    maxHeight: "88vh",
    overflowY: "hidden",
    display: "flex",
    flexDirection: "column",
  },
  modalHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "18px 22px",
    borderBottom: "1px solid var(--border)",
  },
  modalTitle: { fontSize: 16, fontWeight: 800, color: "var(--text)" },
  modalBody: { padding: 22, overflowY: "auto", flex: 1, minHeight: 0 },
  linkBtn: {
    background: "none",
    border: "none",
    color: "var(--accent)",
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
    padding: 0,
  },
  ghostBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    backgroundColor: "var(--surface)",
    color: "var(--accent-strong)",
    border: "1px solid var(--border-strong)",
    borderRadius: 8,
    padding: "8px 14px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
  },
  primaryBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    color: "#ffffff",
    border: "1px solid transparent",
    borderRadius: 8,
    padding: "9px 16px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    height: 38,
  },
};

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  variant = "warning",
  isConfirming = false,
  confirmDisabled = false,
  closeDisabled = false,
  confirmingLabel = "Procesando...",
}) => {
  useBodyScrollLock(isOpen);
  const [isConfirmHovered, setIsConfirmHovered] = React.useState(false);

  if (!isOpen) return null;

  const isCloseDisabled = closeDisabled || isConfirming;
  const isConfirmDisabled = confirmDisabled || isConfirming;
  const confirmPalette = VARIANT_COLORS[variant];
  const disabledButtonStyle: React.CSSProperties = {
    opacity: 0.6,
    cursor: "not-allowed",
  };
  const disabledPrimaryButtonStyle: React.CSSProperties = {
    backgroundColor: confirmPalette.disabled,
    borderColor: confirmPalette.disabled,
    color: "#ffffff",
    cursor: "not-allowed",
    opacity: 1,
  };
  const activePrimaryButtonStyle: React.CSSProperties = {
    backgroundColor: isConfirmHovered ? confirmPalette.hover : confirmPalette.background,
    borderColor: isConfirmHovered ? confirmPalette.hover : confirmPalette.border,
    color: "#ffffff",
    cursor: "pointer",
  };
  const handleClose = () => {
    if (isCloseDisabled) return;
    onClose();
  };

  return (
    <div style={styles.overlay} onClick={handleClose}>
      <div style={styles.modal} onClick={(event) => event.stopPropagation()}>
        <div style={styles.modalHeader}>
          <span style={styles.modalTitle}>{title}</span>
          <button
            type="button"
            style={{ ...styles.linkBtn, ...(isCloseDisabled ? disabledButtonStyle : {}) }}
            onClick={handleClose}
            aria-label="Cerrar"
            disabled={isCloseDisabled}
          >
            <X size={18} />
          </button>
        </div>
        <div style={styles.modalBody}>
          <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.5, margin: 0, whiteSpace: "pre-line" }}>{message}</p>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 24 }}>
            <button
              type="button"
              style={{ ...styles.ghostBtn, ...(isCloseDisabled ? disabledButtonStyle : {}) }}
              onClick={handleClose}
              disabled={isCloseDisabled}
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              style={{
                ...styles.primaryBtn,
                ...(isConfirmDisabled ? disabledPrimaryButtonStyle : activePrimaryButtonStyle),
              }}
              onClick={onConfirm}
              onMouseEnter={() => {
                if (!isConfirmDisabled) setIsConfirmHovered(true);
              }}
              onMouseLeave={() => setIsConfirmHovered(false)}
              onFocus={() => {
                if (!isConfirmDisabled) setIsConfirmHovered(true);
              }}
              onBlur={() => setIsConfirmHovered(false)}
              disabled={isConfirmDisabled}
            >
              {isConfirming ? confirmingLabel : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
