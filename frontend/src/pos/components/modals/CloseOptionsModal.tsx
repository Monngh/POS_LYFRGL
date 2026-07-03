import { Lock } from "lucide-react";
import { PosModal } from "./shared";

interface CloseOptionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPartialCut: () => void;
  onCloseCash: () => void;
}



export default function CloseOptionsModal({
  isOpen,
  onClose,
  onPartialCut,
  onCloseCash,
}: CloseOptionsModalProps) {
  if (!isOpen) return null;

  const renderFooter = () => (
    <div style={{ display: "flex", width: "100%" }}>
      <button
        data-shortcut="cancel"
        data-shortcut-letter="X"
        title="Cancelar"
        onClick={onClose}
        style={{
          padding: "10px",
          borderRadius: "6px",
          border: "none",
          backgroundColor: "var(--text-muted)",
          color: "white",
          fontWeight: "700",
          cursor: "pointer",
          fontSize: "12px",
          textAlign: "center",
          flex: 1
        }}
      >
        CANCELAR
      </button>
    </div>
  );

  return (
    <PosModal
      isOpen={isOpen}
      onClose={onClose}
      title="Opciones de Cierre"
      subtitle="Seleccione la operación de caja que desea realizar:"
      icon={<Lock size={24} />}
      iconColor="#dc2626"
      size="md"
      footer={renderFooter()}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "12px", width: "100%", marginTop: "14px" }}>
        <button
          data-shortcut-letter="P"
          title="Corte Parcial"
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
          data-shortcut-key="F8"
          title="Cierre de Turno (F8)"
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
      </div>
    </PosModal>
  );
}
