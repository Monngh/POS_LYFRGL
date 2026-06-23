import React from "react";
import { usePosCart } from "../hooks/usePosCart";

interface CheckoutPanelProps {
  cartData: ReturnType<typeof usePosCart>;
  pendingQrSales: any[];
  pendingQrChecking: string | null;
  checkPendingQrStatus: (invoiceNumber: string) => void;
  setPendingCancelFieldErrors: (errors: Partial<Record<"pin" | "reason", string>>) => void;
  setViewingPendingQrSale: (sale: any) => void;
  onOpenCheckout: () => void;
}

const styles: { [key: string]: React.CSSProperties } = {
  terminalSummary: { borderTop: "2px solid var(--border)", paddingTop: "16px", marginTop: "auto" },
  summaryRow: { display: "flex", justifyContent: "space-between", fontSize: "13px", color: "var(--text-secondary)" },
  summaryTotal: { borderTop: "1px solid var(--border-strong)", paddingTop: "8px", fontSize: "18px", fontWeight: "800", color: "var(--text)" },
  terminalBtn: { padding: "12px 24px", borderRadius: "6px", border: "none", fontWeight: "700", fontSize: "14px", cursor: "pointer" },
};

export function CheckoutPanel({
  cartData,
  pendingQrSales,
  pendingQrChecking,
  checkPendingQrStatus,
  setPendingCancelFieldErrors,
  setViewingPendingQrSale,
  onOpenCheckout,
}: CheckoutPanelProps) {
  const {
    cart,
    cartSubtotalOriginal,
    cartDiscount,
    cartSubtotal,
    taxBreakdown,
    cartTax,
    cartTotal,
    handleCancelCurrentPurchase,
  } = cartData;

  return (
    <div style={{ ...styles.terminalSummary, display: "flex", gap: "24px", alignItems: "flex-start" }} className="pos-cashier-terminal-summary">

      {/* COLUMNA IZQUIERDA: Pagos QR Pendientes (máx 3, sin scroll) */}
      <div style={{ flex: 1 }} className="pos-cashier-terminal-summary-col">
        {pendingQrSales.length > 0 && (
          <>
            <div style={{ fontSize: "11px", fontWeight: "700", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>
              📱 Pagos QR Pendientes
            </div>
            <div className="pos-cashier-inline-table-scroll">
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                <tbody>
                  {pendingQrSales.slice(-3).reverse().map((sale) => {
                    const isChecking = pendingQrChecking === sale.invoiceNumber;
                    const isApproved = sale.status === "approved";
                    const isRejected = sale.status === "rejected";
                    return (
                      <tr key={sale.id} style={{ borderBottom: "1px solid var(--surface-3)", backgroundColor: isApproved ? "var(--icon-bg-green)" : isRejected ? "var(--icon-bg-red)" : "transparent" }}>
                        <td style={{ padding: "5px 6px", fontWeight: "600", color: "var(--text-secondary)", whiteSpace: "nowrap" }} title={sale.invoiceNumber}>
                          ...{sale.invoiceNumber.slice(-6)}
                        </td>
                        <td style={{ padding: "5px 6px", fontWeight: "700", color: "var(--text)", whiteSpace: "nowrap" }}>
                          ${Number(sale.amount).toFixed(2)}
                        </td>
                        <td style={{ padding: "5px 6px" }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "2px 8px", borderRadius: "10px", fontSize: "11px", fontWeight: "700", backgroundColor: isApproved ? "#dcfce7" : isRejected ? "#fee2e2" : "#ffedd5", color: isApproved ? "#15803d" : isRejected ? "#b91c1c" : "#c2410c" }}>
                            <span style={{ width: "5px", height: "5px", borderRadius: "50%", backgroundColor: isApproved ? "#22c55e" : isRejected ? "#ef4444" : "#f97316" }} />
                            {isApproved ? "Aprobado" : isRejected ? "Rechazado" : "Pendiente"}
                          </span>
                        </td>
                        <td style={{ padding: "5px 6px", textAlign: "right", whiteSpace: "nowrap" }}>
                          <div style={{ display: "inline-flex", gap: "4px" }}>
                            <button
                              onClick={(e) => { e.stopPropagation(); setPendingCancelFieldErrors({}); setViewingPendingQrSale(sale); }}
                              title="Ver QR"
                              style={{ padding: "3px 8px", borderRadius: "4px", fontSize: "12px", fontWeight: "700", backgroundColor: "#dbeafe", color: "#1e40af", border: "1px solid #93c5fd", cursor: "pointer" }}
                            >
                              QR
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); checkPendingQrStatus(sale.invoiceNumber); }}
                              disabled={isChecking}
                              title="Verificar pago — si está aprobado muestra el ticket"
                              style={{ padding: "3px 8px", borderRadius: "4px", fontSize: "12px", fontWeight: "700", backgroundColor: isChecking ? "#6b7280" : "var(--accent-strong)", color: "white", border: "none", cursor: isChecking ? "default" : "pointer" }}
                            >
                              {isChecking ? "..." : "Verificar"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* COLUMNA DERECHA: Resumen de totales + botones debajo */}
      <div style={{ display: "flex", flexDirection: "column", gap: "6px", minWidth: "260px", flexShrink: 0 }} className="pos-cashier-terminal-summary-col">
        <div style={styles.summaryRow}>
          <span>Subtotal Original:</span>
          <span style={{ fontWeight: "600" }}>${cartSubtotalOriginal.toFixed(2)}</span>
        </div>
        {cartDiscount > 0 && (
          <div style={{ ...styles.summaryRow, color: "#059669", fontWeight: "700" }}>
            <span>Ahorro Promociones:</span>
            <span>-${cartDiscount.toFixed(2)}</span>
          </div>
        )}
        <div style={styles.summaryRow}>
          <span>Subtotal Neto:</span>
          <span style={{ fontWeight: "600" }}>${cartSubtotal.toFixed(2)}</span>
        </div>
        {Object.keys(taxBreakdown).length > 0 ? (
          Object.entries(taxBreakdown)
            .filter(([_, taxAmount]) => (taxAmount as number) > 0)
            .map(([taxName, taxAmount]) => (
              <div key={taxName} style={styles.summaryRow}>
                <span>{taxName}:</span>
                <span style={{ fontWeight: "600" }}>${(taxAmount as number).toFixed(2)}</span>
              </div>
            ))
        ) : (
          <div style={styles.summaryRow}>
            <span>Impuestos:</span>
            <span style={{ fontWeight: "600" }}>${cartTax.toFixed(2)}</span>
          </div>
        )}
        {Math.abs(cartTotal - (cartSubtotal + cartTax)) > 0.01 && (
          <div style={styles.summaryRow}>
            <span>Ajuste por Redondeo:</span>
            <span style={{ fontWeight: "600", color: (cartTotal - (cartSubtotal + cartTax)) < 0 ? "#059669" : "#dc2626" }}>
              {cartTotal - (cartSubtotal + cartTax) > 0 ? "+" : ""}{(cartTotal - (cartSubtotal + cartTax)).toFixed(2)}
            </span>
          </div>
        )}
        <div style={{ ...styles.summaryRow, ...styles.summaryTotal }}>
          <span>Total:</span>
          <span style={{ color: "#dc2626", fontWeight: "800" }}>${cartTotal.toFixed(2)}</span>
        </div>
        <div style={{ display: "flex", gap: "10px", marginTop: "10px" }} className="pos-cashier-modal-actions">
          <button
            onClick={handleCancelCurrentPurchase}
            className="active-tap"
            style={{ ...styles.terminalBtn, flex: 1, backgroundColor: "#dc2626", color: "white" }}
          >
            CANCELAR COMPRA
          </button>
          <button
            disabled={cart.length === 0}
            onClick={onOpenCheckout}
            className="active-tap"
            style={{ ...styles.terminalBtn, flex: 1, backgroundColor: "#059669", color: "white" }}
          >
            COBRAR
          </button>
        </div>
      </div>

    </div>
  );
}
