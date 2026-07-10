import { Activity, ShoppingCart, DollarSign, Clock } from "lucide-react";

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
  /** Método de pago activo seleccionado en el checkout (opcional) */
  activePaymentMethod?: string | null;
}

const PAYMENT_LABELS: Record<string, { label: string; cls: string }> = {
  EFECTIVO:        { label: "Efectivo",   cls: "cash"   },
  TARJETA:         { label: "Tarjeta",    cls: "card"   },
  STORE_CREDIT:    { label: "Vale",       cls: "mixed"  },
  MIXTO:           { label: "Mixto",      cls: "mixed"  },
  QR_MERCADOPAGO:  { label: "QR",         cls: "qr"     },
};

function formatOpenedAt(openedAt: string): string {
  try {
    const d = new Date(openedAt);
    return d.toLocaleTimeString("es-MX", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return "--:--";
  }
}

export function StatusBar({ sessionStats, session, activePaymentMethod }: StatusBarProps) {
  const isOpen = session?.status === "ABIERTA" || session?.status === "active";
  const salesCount = sessionStats?.salesCount ?? 0;
  const totalSales = sessionStats?.totalSalesAmount ?? 0;
  const openedAt = session?.openedAt ? formatOpenedAt(session.openedAt) : "--:--";

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

      {/* Método de pago activo (solo cuando está seleccionado) */}
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
