import { ClipboardList } from "lucide-react";

interface CashSession {
  id: number;
  branchId: number;
  userId: number;
  openedAt: string;
  closedAt: string | null;
  initialAmount: number;
  expectedAmount: number;
  declaredAmount: number | null;
  difference: number | null;
  cashIn: number;
  cashOut: number;
  status: string;
}

interface CashInfoPanelProps {
  session: CashSession | null;
  sessionStats: {
    initialAmount: number;
    expectedAmount: number;
    salesCount: number;
    totalSalesAmount: number;
  } | null;
}

export function CashInfoPanel({ session, sessionStats }: CashInfoPanelProps) {
  const initialAmount = sessionStats?.initialAmount ?? 0;
  const expectedAmount = sessionStats?.expectedAmount ?? 0;
  const salesCount = sessionStats?.salesCount ?? 0;

  const isBoxOpen = session?.status === "ABIERTA" || session?.status === "active";

  return (
    <div className="pos-cash-info-container">
      <div className="pos-cash-info-header">
        <div className="pos-cash-info-title-row">
          <ClipboardList size={14} className="pos-cash-info-title-icon" />
          <h4 className="pos-sidebar-title">INFORMACIÓN DE CAJA</h4>
        </div>
      </div>

      <div className="pos-cash-info-rows">
        {/* Estado de caja */}
        <div className="pos-cash-info-row">
          <span className="pos-info-row-label">Estado de caja</span>
          <span className={`pos-status-badge ${isBoxOpen ? "open" : "closed"}`}>
            {isBoxOpen ? "ABIERTA" : "CERRADA"}
          </span>
        </div>

        {/* Fondo inicial */}
        <div className="pos-cash-info-row">
          <span className="pos-info-row-label">Fondo inicial</span>
          <span className="pos-info-row-value font-mono">
            ${initialAmount.toFixed(2)}
          </span>
        </div>

        {/* Ventas realizadas */}
        <div className="pos-cash-info-row">
          <span className="pos-info-row-label">Ventas realizadas</span>
          <span className="pos-info-row-value">
            {salesCount} {salesCount === 1 ? "venta" : "ventas"}
          </span>
        </div>

        {/* Efectivo esperado */}
        <div className="pos-cash-info-row">
          <span className="pos-info-row-label">Efectivo esperado</span>
          <span className="pos-info-row-value font-mono">
            ${expectedAmount.toFixed(2)}
          </span>
        </div>

        {/* Efectivo en caja */}
        <div className="pos-cash-info-row highlighted">
          <span className="pos-info-row-label">Efectivo en caja</span>
          <span className="pos-info-row-value font-mono success">
            ${expectedAmount.toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );
}
