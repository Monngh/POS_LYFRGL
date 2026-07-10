import { Printer, RotateCcw, Receipt } from "lucide-react";

interface Sale {
  id: number;
  invoiceNumber: string;
  createdAt: string;
  totalAmount: number;
  paymentMethod: string;
  status: string;
}

interface RecentSalesPanelProps {
  recentSales: Sale[];
  onReprintTicket: (saleId: number) => void;
  onStartReturn: (saleId: number) => void;
}

const PAYMENT_SHORT: Record<string, string> = {
  EFECTIVO:       "Efvo",
  TARJETA:        "Tarj",
  STORE_CREDIT:   "Vale",
  MIXTO:          "Mix",
  QR_MERCADOPAGO: "QR",
};

function formatTime(createdAt: string): string {
  try {
    return new Date(createdAt).toLocaleTimeString("es-MX", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return "--:--";
  }
}

export function RecentSalesPanel({ recentSales, onReprintTicket, onStartReturn }: RecentSalesPanelProps) {
  const visible = recentSales.slice(0, 5);

  return (
    <div className="pos-recent-sales-panel">
      <div className="pos-quick-actions-header" style={{ marginBottom: "6px" }}>
        <h4 className="pos-sidebar-title">
          <Receipt size={11} style={{ marginRight: "4px", verticalAlign: "middle" }} />
          ÚLTIMAS VENTAS
        </h4>
      </div>

      {visible.length === 0 ? (
        <p className="pos-recent-sales-empty">Sin ventas en este turno aún.</p>
      ) : (
        <div className="pos-recent-sales-list">
          {visible.map((sale) => {
            const isCancelled = sale.status === "CANCELADA" || sale.status === "ANULADA";
            return (
              <div key={sale.id} className={`pos-recent-sale-row ${isCancelled ? "cancelled" : ""}`}>
                {/* Folio + hora */}
                <div className="pos-recent-sale-meta">
                  <span className="pos-recent-sale-folio" title={sale.invoiceNumber}>
                    #{sale.invoiceNumber.slice(-6)}
                  </span>
                  <span className="pos-recent-sale-time">{formatTime(sale.createdAt)}</span>
                </div>

                {/* Monto + método */}
                <div className="pos-recent-sale-amount-row">
                  <span className="pos-recent-sale-amount">
                    ${Number(sale.totalAmount).toFixed(2)}
                  </span>
                  <span className="pos-recent-sale-method">
                    {PAYMENT_SHORT[sale.paymentMethod] ?? sale.paymentMethod}
                  </span>
                </div>

                {/* Acciones */}
                {!isCancelled && (
                  <div className="pos-recent-sale-actions">
                    <button
                      type="button"
                      className="pos-recent-sale-btn reprint"
                      onClick={() => onReprintTicket(sale.id)}
                      title="Reimprimir ticket"
                    >
                      <Printer size={11} />
                    </button>
                    <button
                      type="button"
                      className="pos-recent-sale-btn return"
                      onClick={() => onStartReturn(sale.id)}
                      title="Iniciar devolución"
                    >
                      <RotateCcw size={11} />
                    </button>
                  </div>
                )}
                {isCancelled && (
                  <span className="pos-recent-sale-cancelled-badge">CANCELADA</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
