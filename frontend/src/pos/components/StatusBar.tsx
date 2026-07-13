import { useState, useEffect } from "react";
import { Activity, ShoppingCart, DollarSign, Clock, AlertTriangle } from "lucide-react";

interface StatusBarProps {
  sessionStats: {
    salesCount: number;
    totalSalesAmount: number;
    initialAmount: number;
    expectedAmount: number;
  } | null;
  session: {
    openedAt: string;
    status: string;
  } | null;
  activePaymentMethod?: string | null;
}

const PAYMENT_LABELS: Record<string, { label: string; cls: string }> = {
  EFECTIVO:       { label: "Efectivo",  cls: "cash"  },
  TARJETA:        { label: "Tarjeta",   cls: "card"  },
  STORE_CREDIT:   { label: "Vale",      cls: "mixed" },
  MIXTO:          { label: "Mixto",     cls: "mixed" },
  QR_MERCADOPAGO: { label: "QR",        cls: "qr"   },
};

/** Formatea la hora de apertura (HH:MM am/pm) */
function formatOpenedAt(openedAt: string): string {
  try {
    const d = new Date(openedAt);
    return d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: true });
  } catch {
    return "--:--";
  }
}

/** Calcula duración del turno a partir de openedAt, devuelve { hours, minutes, totalMinutes } */
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

/** Formatea duración como "2h 34m" o "45m" */
function formatDuration(hours: number, minutes: number): string {
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

const LONG_SHIFT_HOURS = 8; // alerta a partir de 8 horas

export function StatusBar({ sessionStats, session, activePaymentMethod }: StatusBarProps) {
  const isOpen = session?.status === "ABIERTA" || session?.status === "active";
  const salesCount = sessionStats?.salesCount ?? 0;
  const totalSales = sessionStats?.totalSalesAmount ?? 0;
  const openedAt = session?.openedAt ? formatOpenedAt(session.openedAt) : "--:--";

  // Timer en vivo del turno
  const [shiftDuration, setShiftDuration] = useState(() =>
    session?.openedAt ? calcShiftDuration(session.openedAt) : { hours: 0, minutes: 0, totalMinutes: 0 }
  );

  useEffect(() => {
    if (!session?.openedAt || !isOpen) return;

    // Actualiza inmediatamente
    setShiftDuration(calcShiftDuration(session.openedAt));

    const interval = setInterval(() => {
      setShiftDuration(calcShiftDuration(session.openedAt));
    }, 30000); // cada 30 segundos es suficiente

    return () => clearInterval(interval);
  }, [session?.openedAt, isOpen]);

  const isLongShift = shiftDuration.hours >= LONG_SHIFT_HOURS;
  const paymentInfo = activePaymentMethod ? PAYMENT_LABELS[activePaymentMethod] : null;

  return (
    <div className="pos-status-bar" role="status" aria-label="Estado del turno">
      {/* Indicador de turno */}
      <div className="pos-status-bar-item">
        <span className={`pos-status-dot ${isOpen ? "green" : "red"}`} />
        <span className="label">Turno</span>
        <span className={`value ${isOpen ? "green" : ""}`}>
          {isOpen ? "ABIERTO" : "CERRADO"}
        </span>
      </div>

      {/* Hora de apertura */}
      <div className="pos-status-bar-item">
        <Clock size={12} />
        <span className="label">Desde</span>
        <span className="value">{openedAt}</span>
      </div>

      {/* Duración del turno Á¢â‚¬â€ con alerta de jornada larga */}
      {isOpen && (
        <div className={`pos-status-bar-item ${isLongShift ? "pos-status-bar-item--alert" : ""}`}>
          {isLongShift ? (
            <AlertTriangle size={12} style={{ color: "#fbbf24" }} />
          ) : (
            <Clock size={12} />
          )}
          <span className="label">Turno</span>
          <span className={`value ${isLongShift ? "amber" : ""}`}>
            {formatDuration(shiftDuration.hours, shiftDuration.minutes)}
          </span>
          {isLongShift && (
            <span className="pos-status-bar-long-shift">Jornada larga</span>
          )}
        </div>
      )}

      {/* Ventas del turno */}
      <div className="pos-status-bar-item">
        <ShoppingCart size={12} />
        <span className="label">Ventas</span>
        <span className="value">{salesCount}</span>
      </div>

      {/* Monto acumulado */}
      <div className="pos-status-bar-item">
        <DollarSign size={12} />
        <span className="label">Acumulado</span>
        <span className="value green">
          ${totalSales.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
        </span>
      </div>

      {/* Método de pago activo */}
      {paymentInfo && (
        <div className="pos-status-bar-item" style={{ marginLeft: "auto" }}>
          <Activity size={12} />
          <span className="label">Pago</span>
          <span className={`pos-payment-mode-chip ${paymentInfo.cls}`}>
            {paymentInfo.label}
          </span>
        </div>
      )}
    </div>
  );
}
