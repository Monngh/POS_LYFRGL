import { Clock, RefreshCw, Printer } from "lucide-react";

interface RecentSalesPanelProps {
  recentSales: any[];
  onReprintTicket: (saleId: number) => void;
  onStartReturn: (saleId: number) => void;
}

export function RecentSalesPanel({ recentSales, onReprintTicket, onStartReturn }: RecentSalesPanelProps) {
  return (
    <div className="pos-cash-info-container" style={{ marginTop: "12px" }}>
      <div className="pos-cash-info-header">
        <div className="pos-cash-info-title-row">
          <Clock size={14} className="pos-cash-info-title-icon" />
          <h4 className="pos-sidebar-title">ÚLTIMAS VENTAS</h4>
        </div>
      </div>
      <div className="pos-cash-info-rows" style={{ gap: "8px" }}>
        {recentSales.slice(0, 5).map((sale) => (
          <div key={sale.id} className="pos-cash-info-row" style={{ flexDirection: "column", alignItems: "flex-start", gap: "4px", borderBottom: "1px solid var(--pos-border)", paddingBottom: "6px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
              <span className="pos-info-row-label font-mono" style={{ fontSize: "10px" }}>
                Folio: {sale.invoiceNumber}
              </span>
              <span className="pos-info-row-value font-mono success" style={{ fontSize: "12px" }}>
                ${Number(sale.totalAmount || sale.total || 0).toFixed(2)}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", width: "100%", marginTop: "4px" }}>
              <span style={{ fontSize: "10px", color: "var(--pos-text-muted)" }}>
                {new Date(sale.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
              <div style={{ display: "flex", gap: "4px" }}>
                <button
                  type="button"
                  title="Reimprimir Ticket"
                  onClick={() => onReprintTicket(sale.id)}
                  style={{ background: "none", border: "1px solid var(--pos-border)", borderRadius: "4px", padding: "2px 6px", cursor: "pointer", color: "var(--pos-text)", display: "flex", alignItems: "center", justifyContent: "center" }}
                >
                  <Printer size={10} />
                </button>
                <button
                  type="button"
                  title="Iniciar Devolución"
                  onClick={() => onStartReturn(sale.id)}
                  style={{ background: "none", border: "1px solid var(--pos-border)", borderRadius: "4px", padding: "2px 6px", cursor: "pointer", color: "var(--pos-text)", display: "flex", alignItems: "center", justifyContent: "center" }}
                >
                  <RefreshCw size={10} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
