import React from "react";
import { Clock, ShoppingCart, DollarSign, Activity } from "lucide-react";

interface ShiftSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionStats: any;
  session: any;
  activePaymentMethod: string | null;
}

/** Calcula duración del turno a partir de openedAt */
function calcShiftDuration(openedAt: string): { hours: number; minutes: number; totalMinutes: number } {
  try {
    const start = new Date(openedAt).getTime();
    const now = Date.now();
    const diffMs = Math.max(0, now - start);
    const totalMinutes = Math.floor(diffMs / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return { hours, minutes, totalMinutes };
  } catch {
    return { hours: 0, minutes: 0, totalMinutes: 0 };
  }
}

const PAYMENT_LABELS: Record<string, { label: string; cls: string }> = {
  EFECTIVO:       { label: "Efectivo",  cls: "cash"  },
  TARJETA:        { label: "Tarjeta",   cls: "card"  },
  STORE_CREDIT:   { label: "Vale",      cls: "mixed" },
  MIXTO:          { label: "Mixto",     cls: "mixed" },
  QR_MERCADOPAGO: { label: "QR",        cls: "qr"   },
};

export function ShiftSummaryModal({ isOpen, onClose, sessionStats, session, activePaymentMethod }: ShiftSummaryModalProps) {
  const [shiftDuration, setShiftDuration] = React.useState({ hours: 0, minutes: 0, totalMinutes: 0 });

  React.useEffect(() => {
    if (!isOpen || !session?.openedAt) return;
    setShiftDuration(calcShiftDuration(session.openedAt));
    const interval = setInterval(() => {
      setShiftDuration(calcShiftDuration(session.openedAt));
    }, 30000);
    return () => clearInterval(interval);
  }, [isOpen, session?.openedAt]);

  if (!isOpen) return null;

  const salesCount = sessionStats?.salesCount ?? 0;
  const totalSales = sessionStats?.totalSalesAmount ?? 0;
  const paymentInfo = activePaymentMethod ? PAYMENT_LABELS[activePaymentMethod] : null;

  return (
    <div className="pos-modal-overlay" onMouseDown={onClose} style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(15, 23, 42, 0.4)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 100 }}>
      <div className="pos-modal-content card-premium" style={{ width: "320px", padding: "24px", backgroundColor: "var(--surface)", borderRadius: "8px" }} onMouseDown={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "700", color: "var(--text)" }}>Resumen del Turno</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "20px", color: "var(--text-muted)" }}>&times;</button>
        </div>
        
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "12px", backgroundColor: "var(--surface-2)", borderRadius: "6px" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "var(--text-secondary)", fontWeight: 600 }}>
              <Clock size={14} /> Tiempo transcurrido
            </span>
            <strong style={{ fontSize: "14px", color: "var(--text)" }}>{shiftDuration.hours}h {shiftDuration.minutes}m</strong>
          </div>
          
          <div style={{ display: "flex", justifyContent: "space-between", padding: "12px", backgroundColor: "var(--surface-2)", borderRadius: "6px" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "var(--text-secondary)", fontWeight: 600 }}>
              <ShoppingCart size={14} /> Ventas realizadas
            </span>
            <strong style={{ fontSize: "14px", color: "var(--text)" }}>{salesCount}</strong>
          </div>
          
          <div style={{ display: "flex", justifyContent: "space-between", padding: "12px", backgroundColor: "var(--surface-2)", borderRadius: "6px" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "var(--text-secondary)", fontWeight: 600 }}>
              <DollarSign size={14} /> Acumulado
            </span>
            <strong style={{ fontSize: "14px", color: "var(--accent-strong)" }}>${totalSales.toLocaleString("es-MX", { minimumFractionDigits: 2 })}</strong>
          </div>
          
          {paymentInfo && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px", backgroundColor: "var(--surface-2)", borderRadius: "6px" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "var(--text-secondary)", fontWeight: 600 }}>
                <Activity size={14} /> Método actual
              </span>
              <span className={`pos-payment-mode-chip ${paymentInfo.cls}`}>
                {paymentInfo.label}
              </span>
            </div>
          )}
        </div>
        
        <button
          onClick={onClose}
          style={{ width: "100%", padding: "12px", marginTop: "24px", backgroundColor: "var(--border)", color: "var(--text)", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: "700", textTransform: "uppercase" }}
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}
