import React, { useState } from "react";
import { XCircle, Search } from "lucide-react";
import { PosModal, PosStepper } from "./shared";

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
  const [currentStep, setCurrentStep] = useState(0);
  const steps = ["Buscar venta", "Validar venta", "Confirmar"];

  // Limpiar estado cuando se cierra
  React.useEffect(() => {
    if (!isOpen) setCurrentStep(0);
  }, [isOpen]);

  const handleNext = () => {
    if (currentStep === 0 && (!cancelInvoice || cancelFieldErrors.invoice || !cancelSalePreview)) return;
    if (currentStep === 1 && (!cancelReason || cancelFieldErrors.reason)) return;
    setCurrentStep(c => c + 1);
  };

  const handlePrev = () => setCurrentStep(c => Math.max(0, c - 1));

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (currentStep < 2) {
      handleNext();
    } else {
      onSubmit(e);
    }
  };

  const footer = (
    <>
      <button 
        type="button"
        title={currentStep === 0 ? "Cancelar (Esc)" : "Atrás"}
        data-shortcut={currentStep === 0 ? "cancel" : undefined}
        data-shortcut-letter={currentStep === 0 ? "X" : undefined}
        onClick={currentStep === 0 ? onClose : handlePrev} 
        style={{ padding: "10px 24px", borderRadius: "8px", border: "1px solid var(--border)", backgroundColor: "transparent", color: "var(--text)", fontWeight: "600", cursor: "pointer" }}
      >
        {currentStep === 0 ? "Cancelar" : "Atrás"}
      </button>
      <button 
        type="button"
        title={cancelLoading ? "Procesando..." : currentStep === 2 ? "Confirmar cancelación" : "Siguiente"}
        data-shortcut="confirm"
        data-shortcut-letter="C"
        onClick={handleFormSubmit} 
        disabled={
          cancelLoading || 
          (currentStep === 0 && (!cancelInvoice || !cancelSalePreview)) ||
          (currentStep === 1 && !cancelReason) ||
          (currentStep === 2 && (!cancelPin || cancelPin.length < 4))
        } 
        style={{ padding: "10px 24px", borderRadius: "8px", border: "none", backgroundColor: "#2563eb", color: "white", fontWeight: "600", cursor: "pointer", opacity: cancelLoading ? 0.7 : 1 }}
      >
        {cancelLoading ? "Procesando..." : (currentStep === 2 ? "Confirmar Cancelación" : "Siguiente ->")}
      </button>
    </>
  );

  return (
    <PosModal
      isOpen={isOpen}
      onClose={onClose}
      title="Cancelar venta"
      subtitle="Ingresa los datos de la venta para proceder con la cancelación."
      icon={<XCircle size={24} />}
      iconColor="#dc2626"
      size="lg"
      footer={footer}
    >
      <PosStepper steps={steps} currentStep={currentStep} />
      
      <form onSubmit={handleFormSubmit} style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
        
        {/* PASO 1: BUSCAR VENTA */}
        {currentStep === 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <label style={{ fontSize: "12px", fontWeight: "700", color: "var(--text-secondary)", textTransform: "uppercase" }}>
                Folio de Venta (Invoice)
              </label>
              <input
                type="text"
                required
                style={{ width: "100%", padding: "12px 16px", borderRadius: "8px", border: "1px solid var(--border)", backgroundColor: "var(--surface-2)", color: "var(--text)", fontSize: "14px", outline: "none" }}
                placeholder="Ej. V-607245285"
                value={cancelInvoice}
                onChange={(e) => onSetField("invoice", e.target.value)}
                autoFocus
              />
              {cancelFieldErrors.invoice && <p style={{ color: "#dc2626", fontSize: "12px", margin: 0, fontWeight: "600" }}>{cancelFieldErrors.invoice}</p>}
            </div>

            <div style={{ backgroundColor: "#eff6ff", borderRadius: "8px", padding: "16px", display: "flex", gap: "12px", alignItems: "flex-start" }}>
              <div style={{ color: "#2563eb", marginTop: "2px" }}><Search size={16} /></div>
              <div>
                <p style={{ margin: 0, fontSize: "13px", fontWeight: "600", color: "#1e3a8a" }}>Importante</p>
                <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "#3b82f6" }}>Solo se pueden cancelar ventas del mismo día y que no hayan sido facturadas.</p>
              </div>
            </div>

            {cancelSalePreview && (
              <div style={{ marginTop: "8px", padding: "16px", border: "1px solid #93c5fd", backgroundColor: "#f8fafc", borderRadius: "8px" }}>
                <p style={{ margin: "0 0 8px 0", fontSize: "13px", fontWeight: "700", color: "#2563eb" }}>Venta encontrada:</p>
                <div style={{ fontSize: "13px", color: "var(--text)", display: "flex", justifyContent: "space-between" }}>
                  <span>{new Date(cancelSalePreview.createdAt).toLocaleString()}</span>
                  <span style={{ fontWeight: "800" }}>${cancelSalePreview.total.toFixed(2)}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* PASO 2: VALIDAR VENTA */}
        {currentStep === 1 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {cancelSalePreview && (
              <div style={{ padding: "16px", backgroundColor: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "8px" }}>
                <div style={{ fontSize: "14px", fontWeight: "700", color: "var(--text)", marginBottom: "8px" }}>Resumen de Artículos</div>
                <div style={{ maxHeight: "150px", overflowY: "auto", fontSize: "13px", color: "var(--text-secondary)", display: "flex", flexDirection: "column", gap: "6px" }}>
                  {cancelSalePreview.items.map((it, idx) => (
                    <div key={idx} style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>{it.product.name}</span>
                      <span>x{it.quantity}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "8px" }}>
              <label style={{ fontSize: "12px", fontWeight: "700", color: "var(--text-secondary)", textTransform: "uppercase" }}>
                Motivo de Cancelación
              </label>
              <input
                type="text"
                required
                maxLength={100}
                style={{ width: "100%", padding: "12px 16px", borderRadius: "8px", border: "1px solid var(--border)", backgroundColor: "var(--surface-2)", color: "var(--text)", fontSize: "14px", outline: "none" }}
                placeholder="Ej. Producto equivocado, error de cobro"
                value={cancelReason}
                onChange={(e) => onSetField("reason", e.target.value)}
                autoFocus
              />
              {cancelFieldErrors.reason && <p style={{ color: "#dc2626", fontSize: "12px", margin: 0, fontWeight: "600" }}>{cancelFieldErrors.reason}</p>}
            </div>
          </div>
        )}

        {/* PASO 3: CONFIRMAR */}
        {currentStep === 2 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px", alignItems: "center", padding: "20px 0" }}>
            <div style={{ width: "48px", height: "48px", borderRadius: "50%", backgroundColor: "#fee2e2", display: "flex", alignItems: "center", justifyContent: "center", color: "#dc2626", marginBottom: "8px" }}>
              <XCircle size={24} />
            </div>
            <h4 style={{ margin: 0, fontSize: "16px", fontWeight: "700", color: "var(--text)" }}>Autorización Requerida</h4>
            <p style={{ margin: 0, fontSize: "14px", color: "var(--text-secondary)", textAlign: "center" }}>
              Ingresa el PIN de 4 dígitos del gerente en turno para autorizar la cancelación de esta venta.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px", width: "100%", maxWidth: "300px", marginTop: "16px" }}>
              <input
                type="password"
                maxLength={4}
                required
                style={{ width: "100%", padding: "16px", borderRadius: "8px", border: "1px solid var(--border)", backgroundColor: "var(--surface-2)", color: "var(--text)", fontSize: "24px", textAlign: "center", letterSpacing: "8px", outline: "none" }}
                placeholder="••••"
                value={cancelPin}
                onChange={(e) => onSetField("pin", e.target.value)}
                autoFocus
              />
              {cancelFieldErrors.pin && <p style={{ color: "#dc2626", fontSize: "12px", margin: 0, fontWeight: "600", textAlign: "center" }}>{cancelFieldErrors.pin}</p>}
            </div>
          </div>
        )}
        
        {/* Hidden submit button to allow Enter key submission */}
        <button type="submit" style={{ display: "none" }} />
      </form>
    </PosModal>
  );
}
