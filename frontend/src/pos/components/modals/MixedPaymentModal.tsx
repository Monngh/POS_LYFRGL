import { useState, useEffect, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { CreditCard, Banknote, HelpCircle, X, CheckCircle2 } from "lucide-react";
import { PosModal } from "./shared";
import { validateStoreCredit } from "../../../facturacion/facturacion.service";
import { useModalInitialFocus } from "../../hooks/useModalInitialFocus";

interface PaymentEntry {
  id: string;
  method: "EFECTIVO" | "TARJETA" | "STORE_CREDIT";
  amount: number;
  reference?: string; // Para STORE_CREDIT o Referencia manual
}

interface MixedPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  totalToPay: number;
  onConfirm: (payments: PaymentEntry[], totalCashReceived: number) => void;
}

export default function MixedPaymentModal({
  isOpen,
  onClose,
  totalToPay,
  onConfirm,
}: MixedPaymentModalProps) {
  const [payments, setPayments] = useState<PaymentEntry[]>([]);
  const [currentAmount, setCurrentAmount] = useState<string>("");
  const [currentMethod, setCurrentMethod] = useState<"EFECTIVO" | "TARJETA" | "STORE_CREDIT">("EFECTIVO");
  const [currentReference, setCurrentReference] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  // Reset when opening
  useEffect(() => {
    if (isOpen) {
      setPayments([]);
      setCurrentAmount("");
      setCurrentMethod("EFECTIVO");
      setCurrentReference("");
      setError(null);
    }
  }, [isOpen]);

  const totalAdded = payments.reduce((sum, p) => sum + p.amount, 0);
  const remaining = Math.max(0, totalToPay - totalAdded);
  const change = Math.max(0, totalAdded - totalToPay);

  // Pre-fill remaining amount when it changes
  useEffect(() => {
    if (remaining > 0 && currentAmount === "") {
      setCurrentAmount(remaining.toFixed(2));
    }
  }, [remaining, currentAmount]);

  const [addingPayment, setAddingPayment] = useState(false);
  const keyboardContainerRef = useModalInitialFocus(isOpen, {
    preferSelector: 'input[type="number"], input[inputmode="decimal"]',
  });

  const handleAddPayment = async () => {
    if (addingPayment) return;
    const val = parseFloat(currentAmount);
    if (isNaN(val) || val <= 0) {
      setError("Ingresa un monto válido mayor a 0.");
      return;
    }
    const codeClean = currentReference.trim().toUpperCase();
    if (currentMethod === "STORE_CREDIT" && !codeClean) {
      setError("Debes ingresar el código del saldo a favor.");
      return;
    }
    if (currentMethod !== "EFECTIVO" && val > remaining) {
      setError("Solo el efectivo puede generar cambio.");
      return;
    }

    if (currentMethod === "STORE_CREDIT") {
      const isAlreadyAdded = payments.some(p => p.method === "STORE_CREDIT" && p.reference === codeClean);
      if (isAlreadyAdded) {
        setError("Este vale ya fue agregado a la lista de pagos.");
        return;
      }

      setAddingPayment(true);
      setError(null);
      try {
        const res = await validateStoreCredit(codeClean);
        const sc = res.data;
        if (sc.remaining < val) {
          setError(`El vale solo tiene $${sc.remaining.toFixed(2)} de saldo disponible.`);
          setAddingPayment(false);
          return;
        }
      } catch (err: any) {
        setError(err.response?.data?.message || "El vale ingresado no es válido o no tiene saldo.");
        setAddingPayment(false);
        return;
      } finally {
        setAddingPayment(false);
      }
    }

    setPayments(prev => [
      ...prev,
      {
        id: Math.random().toString(36).substr(2, 9),
        method: currentMethod,
        amount: val,
        reference: currentMethod === "STORE_CREDIT" ? codeClean : undefined,
      }
    ]);
    
    setCurrentAmount("");
    setCurrentReference("");
    setError(null);
  };

  const removePayment = (id: string) => {
    setPayments(prev => prev.filter(p => p.id !== id));
  };

  const handleConfirm = () => {
    if (totalAdded < totalToPay) {
      setError("El total de los pagos no cubre el monto a pagar.");
      return;
    }
    // Calculate how much cash was received
    const totalCash = payments.filter(p => p.method === "EFECTIVO").reduce((sum, p) => sum + p.amount, 0);
    onConfirm(payments, totalCash);
  };

  const formatCurrency = (val: number) => `$${val.toFixed(2)}`;

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const order = ["EFECTIVO", "TARJETA", "STORE_CREDIT"] as const;
      const idx = order.indexOf(currentMethod);
      const next = e.key === "ArrowRight" ? Math.min(idx + 1, order.length - 1) : Math.max(idx - 1, 0);
      setCurrentMethod(order[next]);
      return;
    }

    if (e.key === "Enter") {
      const active = document.activeElement;
      if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || (active as HTMLElement).isContentEditable)) return;
      e.preventDefault();
      e.stopPropagation();
      handleAddPayment();
      return;
    }
  };

  const footer = (
    <>
      <button
        title="Cancelar (X)"
        data-shortcut="cancel"
        data-shortcut-letter="X"
        onClick={onClose} 
        style={{ padding: "10px 24px", borderRadius: "8px", border: "1px solid #cbd5e1", backgroundColor: "transparent", color: "var(--text)", fontWeight: "600", cursor: "pointer" }}
      >
        Cancelar
      </button>
      <button 
        title="Procesar Cobro (C)"
        data-shortcut="confirm"
        data-shortcut-letter="C"
        onClick={handleConfirm}
        disabled={totalAdded < totalToPay}
        style={{ 
          padding: "10px 24px", 
          borderRadius: "8px", 
          border: "none", 
          backgroundColor: totalAdded >= totalToPay ? "#10b981" : "#cbd5e1", 
          color: totalAdded >= totalToPay ? "#fff" : "#94a3b8", 
          fontWeight: "600", 
          cursor: totalAdded >= totalToPay ? "pointer" : "not-allowed",
          display: "flex",
          alignItems: "center",
          gap: "8px"
        }}
      >
        <CheckCircle2 size={18} /> Procesar Cobro Mixto
      </button>
    </>
  );

  return (
    <PosModal
      isOpen={isOpen}
      onClose={onClose}
      title="Cobro Mixto (Pago Dividido)"
      subtitle="Combina múltiples métodos de pago para cubrir el total del ticket."
      icon={<HelpCircle size={24} />}
      iconColor="#3b82f6"
      size="md"
      footer={footer}
    >
      <div ref={keyboardContainerRef} style={{ display: "flex", gap: "24px", padding: "16px 0" }} onKeyDown={handleKeyDown} tabIndex={-1}>
        
        {/* Left column: Add payments */}
        <div style={{ flex: "1 1 50%" }}>
          <div style={{ padding: "16px", backgroundColor: "var(--surface)", borderRadius: "12px", border: "1px solid var(--border)" }}>
            <h3 style={{ margin: "0 0 16px 0", fontSize: "16px", fontWeight: "600" }}>Agregar Pago</h3>
            
            <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
              <button
                onClick={() => setCurrentMethod("EFECTIVO")}
                style={{ flex: 1, padding: "8px", borderRadius: "6px", border: `1px solid ${currentMethod === "EFECTIVO" ? "#2563eb" : "var(--border)"}`, backgroundColor: currentMethod === "EFECTIVO" ? "#eff6ff" : "var(--surface-2)", color: currentMethod === "EFECTIVO" ? "#2563eb" : "var(--text)", fontWeight: "600", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}
              >
                <Banknote size={20} /> Efectivo
              </button>
              <button
                onClick={() => setCurrentMethod("TARJETA")}
                style={{ flex: 1, padding: "8px", borderRadius: "6px", border: `1px solid ${currentMethod === "TARJETA" ? "#2563eb" : "var(--border)"}`, backgroundColor: currentMethod === "TARJETA" ? "#eff6ff" : "var(--surface-2)", color: currentMethod === "TARJETA" ? "#2563eb" : "var(--text)", fontWeight: "600", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}
              >
                <CreditCard size={20} /> Tarjeta
              </button>
              <button
                onClick={() => setCurrentMethod("STORE_CREDIT")}
                style={{ flex: 1, padding: "8px", borderRadius: "6px", border: `1px solid ${currentMethod === "STORE_CREDIT" ? "#2563eb" : "var(--border)"}`, backgroundColor: currentMethod === "STORE_CREDIT" ? "#eff6ff" : "var(--surface-2)", color: currentMethod === "STORE_CREDIT" ? "#2563eb" : "var(--text)", fontWeight: "600", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", fontSize: "12px", textAlign: "center" }}
              >
                <HelpCircle size={20} /> Saldo Favor
              </button>
            </div>

            {currentMethod === "STORE_CREDIT" && (
              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", fontSize: "12px", color: "var(--text-muted)", marginBottom: "4px" }}>Código del Vale</label>
                <input
                  type="text"
                  value={currentReference}
                  onChange={(e) => setCurrentReference(e.target.value.toUpperCase())}
                  placeholder="Ej. VALE-12345"
                  style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid var(--border)", backgroundColor: "var(--surface-2)", color: "var(--text)", fontSize: "14px", outline: "none" }}
                />
              </div>
            )}

            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", fontSize: "12px", color: "var(--text-muted)", marginBottom: "4px" }}>Monto a Cobrar</label>
              <input
                type="number"
                value={currentAmount}
                onChange={(e) => setCurrentAmount(e.target.value)}
                placeholder="0.00"
                step="0.01"
                min="0"
                style={{ width: "100%", padding: "12px", borderRadius: "6px", border: "1px solid var(--border)", backgroundColor: "var(--surface-2)", color: "var(--text)", fontSize: "20px", fontWeight: "bold", textAlign: "right", outline: "none" }}
              />
            </div>

            {error && <div style={{ color: "var(--error)", fontSize: "13px", marginBottom: "12px", backgroundColor: "var(--error-light)", padding: "8px", borderRadius: "6px" }}>{error}</div>}

            <button
              onClick={handleAddPayment}
              style={{ width: "100%", padding: "12px", borderRadius: "6px", border: "none", backgroundColor: "#2563eb", color: "#fff", fontWeight: "600", cursor: "pointer" }}
            >
              Agregar Pago
            </button>
          </div>
        </div>

        {/* Right column: Summary */}
        <div style={{ flex: "1 1 50%", display: "flex", flexDirection: "column", gap: "16px" }}>
          
          <div style={{ padding: "16px", backgroundColor: "var(--surface-2)", borderRadius: "12px", border: "1px solid var(--border)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
              <span style={{ color: "var(--text-muted)" }}>Total del Ticket:</span>
              <span style={{ fontWeight: "bold", fontSize: "18px" }}>{formatCurrency(totalToPay)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
              <span style={{ color: "var(--success)" }}>Pagado:</span>
              <span style={{ fontWeight: "bold", color: "var(--success)" }}>{formatCurrency(totalAdded)}</span>
            </div>
            
            <div style={{ height: "1px", backgroundColor: "var(--border)", margin: "12px 0" }}></div>
            
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: remaining > 0 ? "var(--error)" : "var(--text-muted)" }}>Faltante:</span>
              <span style={{ fontWeight: "bold", color: remaining > 0 ? "var(--error)" : "var(--text-muted)", fontSize: "20px" }}>{formatCurrency(remaining)}</span>
            </div>
            
            {change > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: "12px", padding: "8px", backgroundColor: "var(--success-light)", borderRadius: "6px" }}>
                <span style={{ color: "var(--success-dark)", fontWeight: "600" }}>Cambio a Devolver:</span>
                <span style={{ fontWeight: "bold", color: "var(--success-dark)", fontSize: "20px" }}>{formatCurrency(change)}</span>
              </div>
            )}
          </div>

          <div style={{ flex: 1, padding: "16px", backgroundColor: "var(--surface)", borderRadius: "12px", border: "1px solid var(--border)", display: "flex", flexDirection: "column" }}>
            <h3 style={{ margin: "0 0 12px 0", fontSize: "14px", fontWeight: "600", color: "var(--text-muted)" }}>Pagos Registrados</h3>
            
            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px" }}>
              {payments.length === 0 ? (
                <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "20px 0", fontSize: "13px" }}>
                  Aún no has agregado pagos.
                </div>
              ) : (
                payments.map(p => (
                  <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px", backgroundColor: "var(--surface-2)", borderRadius: "6px", border: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <span style={{ fontWeight: "600", fontSize: "14px" }}>{p.method}</span>
                      {p.reference && <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Ref: {p.reference}</span>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <span style={{ fontWeight: "bold" }}>{formatCurrency(p.amount)}</span>
                      <button onClick={() => removePayment(p.id)} style={{ background: "transparent", border: "none", color: "var(--error)", cursor: "pointer", padding: "4px" }}>
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

      </div>
    </PosModal>
  );
}
