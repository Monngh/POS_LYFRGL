import { useState } from "react";
import { Eye, EyeOff, Banknote } from "lucide-react";

interface HeaderCashInfoProps {
  sessionStats: {
    initialAmount: number;
    expectedAmount: number;
    salesCount: number;
    totalSalesAmount: number;
  } | null;
  onOpenSummary?: () => void;
}

export function HeaderCashInfo({ sessionStats, onOpenSummary }: HeaderCashInfoProps) {
  const [showValues, setShowValues] = useState(false);

  if (!sessionStats) return null;

  const initialAmount = sessionStats.initialAmount ?? 0;
  const expectedAmount = sessionStats.expectedAmount ?? 0;

  return (
    <div className="pos-header-cash-info">
      <div className="pos-header-cash-chip">
        <span className="label">Fondo:</span>
        <span className="value">{showValues ? `$${initialAmount.toFixed(2)}` : "$***.**"}</span>
      </div>
      <div className="pos-header-cash-chip highlighted" onClick={onOpenSummary} style={{ cursor: onOpenSummary ? "pointer" : "default" }} title={onOpenSummary ? "Ver resumen del turno" : ""}>
        <Banknote size={12} />
        <span className="label">En caja:</span>
        <span className="value">{showValues ? `$${expectedAmount.toFixed(2)}` : "$***.**"}</span>
      </div>
      <button 
        type="button" 
        onClick={() => setShowValues(!showValues)}
        className="pos-header-cash-toggle"
        title={showValues ? "Ocultar montos" : "Mostrar montos"}
      >
        {showValues ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
  );
}
