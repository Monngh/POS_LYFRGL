import React, { useEffect, useRef, useState } from "react";
import { AlertTriangle, Info, X } from "lucide-react";
import { useBodyScrollLock } from "../hooks/useBodyScrollLock";

export type ConfirmModalVariant = "danger" | "warning" | "info";

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmModalVariant;
  /** Deshabilita los botones y muestra un estado de progreso mientras se ejecuta la acción. */
  loading?: boolean;
  /** Texto del botón de confirmación mientras `loading` es true. */
  loadingLabel?: string;
  /**
   * Confirmación de alto riesgo: obliga a escribir esta palabra/frase exacta
   * (p. ej. el nombre del registro o «ELIMINAR») para habilitar el botón.
   */
  requireText?: string;
  /** Deshabilita solo el botón de confirmar (p. ej. una validación externa aún no cumplida). */
  confirmDisabled?: boolean;
}

const VARIANTS: Record<ConfirmModalVariant, { color: string; tint: string; Icon: React.ComponentType<{ size?: number }> }> = {
  danger: { color: "#dc2626", tint: "rgba(220,38,38,0.12)", Icon: AlertTriangle },
  warning: { color: "#d97706", tint: "rgba(217,119,6,0.12)", Icon: AlertTriangle },
  info: { color: "#2563eb", tint: "rgba(37,99,235,0.12)", Icon: Info },
};

// Estilos replicados de admin/views/shared.tsx (ui.overlay/modal/…) para mantener
// consistencia visual sin crear una dependencia inversa shared -> admin.
const styles: { [k: string]: React.CSSProperties } = {
  overlay: {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(15,23,42,0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 400,
    padding: 20,
    backdropFilter: "blur(1px)",
  },
  modal: {
    backgroundColor: "var(--surface)",
    borderRadius: 14,
    boxShadow: "0 24px 48px -12px rgba(0,0,0,0.35)",
    width: "100%",
    maxWidth: 440,
    maxHeight: "88vh",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    border: "1px solid var(--border)",
  },
  body: { padding: "22px 24px 20px" },
  head: { display: "flex", alignItems: "flex-start", gap: 14 },
  iconBadge: {
    flexShrink: 0,
    width: 42,
    height: 42,
    borderRadius: 11,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 16.5, fontWeight: 800, color: "var(--text)", lineHeight: 1.3 },
  message: { fontSize: 13.5, color: "var(--text-secondary)", lineHeight: 1.55, margin: "6px 0 0", whiteSpace: "pre-line" },
  closeBtn: {
    background: "none",
    border: "none",
    color: "var(--text-faint)",
    cursor: "pointer",
    padding: 4,
    marginLeft: "auto",
    display: "inline-flex",
    borderRadius: 6,
  },
  requireLabel: {
    fontSize: 12,
    fontWeight: 700,
    color: "var(--text-secondary)",
    display: "block",
    margin: "18px 0 6px",
  },
  input: {
    width: "100%",
    padding: "10px 12px",
    border: "1px solid var(--border)",
    borderRadius: 8,
    fontSize: 14,
    color: "var(--text)",
    outline: "none",
    fontFamily: "inherit",
    backgroundColor: "var(--input-bg)",
  },
  footer: { display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 22 },
  ghostBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    backgroundColor: "var(--surface)",
    color: "var(--text-secondary)",
    border: "1px solid var(--border-strong)",
    borderRadius: 8,
    padding: "9px 16px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  confirmBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    color: "#ffffff",
    border: "none",
    borderRadius: 8,
    padding: "9px 18px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    height: 38,
    minWidth: 120,
    fontFamily: "inherit",
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
  loading = false,
  loadingLabel = "Procesando…",
  requireText,
  confirmDisabled = false,
}) => {
  const [typed, setTyped] = useState("");
  const confirmRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const needsText = Boolean(requireText && requireText.trim());
  const textOk = !needsText || typed.trim().toLowerCase() === requireText!.trim().toLowerCase();
  const canConfirm = !loading && textOk && !confirmDisabled;

  useBodyScrollLock(isOpen);

  useEffect(() => {
    if (!isOpen) {
      setTyped("");
      return;
    }
    const focusTimer = window.setTimeout(() => {
      if (needsText) inputRef.current?.focus();
      else confirmRef.current?.focus();
    }, 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) {
        e.preventDefault();
        onClose();
      } else if (e.key === "Enter" && canConfirm && !needsText) {
        e.preventDefault();
        onConfirm();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", onKey);
    };
  }, [isOpen, loading, canConfirm, needsText, onClose, onConfirm]);

  if (!isOpen) return null;

  const v = VARIANTS[variant];
  const Icon = v.Icon;

  // El modal se monta a nivel de app (fuera del contenedor con `.theme-dark`),
  // por lo que re-aplicamos la clase del tema a su propio overlay para que los
  // tokens (--surface, --text, …) resuelvan a los valores del modo activo.
  const isDark =
    (typeof document !== "undefined" && document.querySelector(".theme-dark") !== null) ||
    (typeof localStorage !== "undefined" && localStorage.getItem("fmb_pos_theme") === "dark");

  return (
    <div style={styles.overlay} className={isDark ? "theme-dark" : undefined} onClick={() => !loading && onClose()}>
      <div
        style={styles.modal}
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
      >
        <div style={styles.body}>
          <div style={styles.head}>
            <span style={{ ...styles.iconBadge, backgroundColor: v.tint, color: v.color }}>
              <Icon size={22} />
            </span>
            <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
              <div style={styles.title}>{title}</div>
              <p style={styles.message}>{message}</p>
            </div>
            <button type="button" style={styles.closeBtn} onClick={onClose} disabled={loading} aria-label="Cerrar">
              <X size={18} />
            </button>
          </div>

          {needsText && (
            <>
              <label style={styles.requireLabel}>
                Para continuar, escribe <span style={{ color: v.color }}>«{requireText}»</span>
              </label>
              <input
                ref={inputRef}
                style={{ ...styles.input, borderColor: typed && !textOk ? "#fca5a5" : "var(--border)" }}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={requireText}
                disabled={loading}
                autoComplete="off"
                spellCheck={false}
              />
            </>
          )}

          <div style={styles.footer}>
            <button type="button" style={styles.ghostBtn} onClick={onClose} disabled={loading} className="active-tap">
              {cancelLabel}
            </button>
            <button
              ref={confirmRef}
              type="button"
              style={{
                ...styles.confirmBtn,
                backgroundColor: v.color,
                opacity: canConfirm ? 1 : 0.55,
                cursor: canConfirm ? "pointer" : "not-allowed",
              }}
              onClick={() => canConfirm && onConfirm()}
              disabled={!canConfirm}
              className="active-tap"
            >
              {loading ? loadingLabel : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
