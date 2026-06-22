import React, { useState, useEffect } from "react";
import { DECIMAL_INPUT_REGEX, handleDecimalInputChange } from '../../../shared/utils/decimalInput';

interface CloseCashModalProps {
  isOpen: boolean;
  sessionStats: any;
  user: any;
  declaredCash: string;
  declaredCashError: string;
  calculatedDifference: number;
  closingLoading: boolean;
  onDeclaredCashChange: (val: string) => void;
  onDeclaredCashErrorChange: (err: string) => void;
  onClose: () => void;
  onConfirmClose: (pinCode: string) => Promise<void>;
}

const modalOverlay: React.CSSProperties = {
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: "rgba(15, 23, 42, 0.4)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  zIndex: 100,
};

const closeModal: React.CSSProperties = {
  width: "420px",
  backgroundColor: "var(--surface)",
  borderRadius: "12px",
  padding: "28px",
  boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)",
};

const modalTitle: React.CSSProperties = {
  fontSize: "16px",
  fontWeight: "800",
  color: "var(--text)",
  borderBottom: "1px solid var(--border)",
  paddingBottom: "8px",
};

const summaryRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  fontSize: "13px",
  color: "var(--text-secondary)",
};

const inputGroup: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "6px",
  textAlign: "left",
};

const labelStyle: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: "700",
  color: "var(--text-secondary)",
  textTransform: "uppercase",
  letterSpacing: "0.5px",
};

const fieldError: React.CSSProperties = {
  color: "#b91c1c",
  fontSize: "12px",
  fontWeight: "600",
  marginTop: "5px",
  marginBottom: 0,
};

const modalBtn: React.CSSProperties = {
  flex: 1,
  padding: "10px",
  borderRadius: "6px",
  border: "none",
  fontWeight: "700",
  cursor: "pointer",
  textAlign: "center",
};

export default function CloseCashModal({
  isOpen,
  sessionStats,
  user,
  declaredCash,
  declaredCashError,
  calculatedDifference,
  closingLoading,
  onDeclaredCashChange,
  onDeclaredCashErrorChange,
  onClose,
  onConfirmClose,
}: CloseCashModalProps) {
  const [closePin, setClosePin] = useState("");
  const [closePinError, setClosePinError] = useState("");

  useEffect(() => {
    if (!isOpen) {
      setClosePin("");
      setClosePinError("");
    }
  }, [isOpen]);

  const handleConfirm = async () => {
    try {
      await onConfirmClose(closePin.trim());
      setClosePin("");
      setClosePinError("");
    } catch (err: any) {
      const code = err.response?.data?.code;
      const msg = err.response?.data?.message || "PIN incorrecto.";
      if (code === "PIN_INVALIDO" || code === "PIN_REQUERIDO") {
        setClosePinError(msg);
        setClosePin("");
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div style={modalOverlay} className="pos-cashier-modal-overlay pos-cashier-modal-overlay--center">
      <div style={closeModal} className="pos-cashier-modal">
        <h3 style={modalTitle}>Cierre de caja:</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "14px" }}>
          <div style={summaryRow}>
            <span>Vendedor:</span>
            <span style={{ fontWeight: "700" }}>{user?.name}</span>
          </div>
          <div style={summaryRow}>
            <span>Fondo Inicial:</span>
            <span style={{ fontWeight: "600" }}>${sessionStats?.initialAmount.toFixed(2)}</span>
          </div>
          <div style={summaryRow}>
            <span>Ventas Acumuladas:</span>
            <span style={{ fontWeight: "600" }}>${sessionStats?.cashIn.toFixed(2)}</span>
          </div>
          <div style={summaryRow}>
            <span>Depósitos/Retiros:</span>
            <span style={{ fontWeight: "600", color: "#dc2626" }}>-${sessionStats?.cashOut.toFixed(2)}</span>
          </div>
          <div style={summaryRow}>
            <span>Ventas Tarjeta Débito:</span>
            <span style={{ fontWeight: "600", color: "#0d9488" }}>${sessionStats?.debitCardTotal?.toFixed(2) || "0.00"}</span>
          </div>
          <div style={summaryRow}>
            <span>Ventas Tarjeta Crédito:</span>
            <span style={{ fontWeight: "600", color: "#0d9488" }}>${sessionStats?.creditCardTotal?.toFixed(2) || "0.00"}</span>
          </div>
          <div style={summaryRow}>
            <span>&nbsp;&nbsp;&nbsp;↳ Pendientes (Resguardo):</span>
            <span style={{ fontWeight: "600", color: "#d97706" }}>${sessionStats?.pendingDeposits?.toFixed(2) || "0.00"}</span>
          </div>
          <div style={summaryRow}>
            <span>&nbsp;&nbsp;&nbsp;↳ Confirmados:</span>
            <span style={{ fontWeight: "600", color: "#059669" }}>${sessionStats?.confirmedDeposits?.toFixed(2) || "0.00"}</span>
          </div>
          <div style={summaryRow}>
            <span>&nbsp;&nbsp;&nbsp;↳ Cancelados (Revertidos):</span>
            <span style={{ fontWeight: "600", color: "#b91c1c" }}>${sessionStats?.cancelledDeposits?.toFixed(2) || "0.00"}</span>
          </div>
          <div style={summaryRow}>
            <span>Reembolsos (x{sessionStats?.refundedSalesCount || 0}):</span>
            <span style={{ fontWeight: "600", color: "var(--text-muted)" }}>${sessionStats?.refundedAmount?.toFixed(2) || "0.00"}</span>
          </div>
          <div style={summaryRow}>
            <span>Devoluciones de Producto (-):</span>
            <span style={{ fontWeight: "600", color: "#dc2626" }}>${sessionStats?.totalReturnsAmount?.toFixed(2) || "0.00"}</span>
          </div>
          <div style={{ ...summaryRow, borderBottom: "1px dashed #cbd5e1", paddingBottom: "10px" }}>
            <span>Efectivo Esperado en Caja:</span>
            <span style={{ fontWeight: "800", color: "var(--accent-strong)" }}>${sessionStats?.expectedAmount.toFixed(2)}</span>
          </div>

          <div style={inputGroup}>
            <label style={labelStyle}>Efectivo Contado (Físico en Caja):</label>
            <input
              type="text"
              className="input-corporate"
              style={{ fontSize: "16px", fontWeight: "700", textAlign: "center" }}
              placeholder="Ingrese el conteo físico"
              value={declaredCash}
              inputMode="decimal"
              onChange={(e) => {
                const rawValue = e.target.value.trim();
                if (rawValue && !DECIMAL_INPUT_REGEX.test(rawValue)) {
                  onDeclaredCashErrorChange("El efectivo contado debe ser un monto valido con maximo 3 decimales.");
                  return;
                }
                handleDecimalInputChange(rawValue, (value) => {
                  onDeclaredCashChange(value);
                  onDeclaredCashErrorChange("");
                });
              }}
            />
            {declaredCashError && <p style={fieldError}>{declaredCashError}</p>}
          </div>

          <div style={inputGroup}>
            <label style={labelStyle}>PIN de autorización (Gerente/Admin):</label>
            <input
              type="password"
              maxLength={4}
              placeholder="••••"
              value={closePin}
              onChange={e => {
                setClosePin(e.target.value.replace(/\D/g, ""));
                setClosePinError("");
              }}
              className="input-corporate"
              style={{ fontSize: "16px", fontWeight: "700", textAlign: "center" }}
            />
            {closePinError && <p style={fieldError}>{closePinError}</p>}
          </div>

          <div style={summaryRow}>
            <span>Diferencia (Sobrante/Faltante):</span>
            <span style={{ fontWeight: "800", color: calculatedDifference < 0 ? "#dc2626" : "#059669" }}>
              ${calculatedDifference.toFixed(2)}
            </span>
          </div>

          <div style={{ display: "flex", gap: "10px", marginTop: "14px" }} className="pos-cashier-modal-actions">
            <button onClick={onClose} style={{ ...modalBtn, backgroundColor: "#dc2626", color: "white" }}>
              CANCELAR
            </button>
            <button
              disabled={closingLoading}
              onClick={handleConfirm}
              style={{ ...modalBtn, backgroundColor: "#059669", color: "white" }}
            >
              {closingLoading ? "Cerrando..." : "CERRAR TURNO"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
