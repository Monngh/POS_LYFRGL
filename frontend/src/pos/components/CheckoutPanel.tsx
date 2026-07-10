import React, { useState, useRef, useEffect } from "react";
import { Banknote, CreditCard, Ticket, ArrowLeftRight, QrCode, Calculator } from "lucide-react";
import { usePosCart } from "../hooks/usePosCart";

interface CheckoutPanelProps {
  cartData: ReturnType<typeof usePosCart>;
  pendingQrSales: any[];
  pendingQrChecking: string | null;
  checkPendingQrStatus: (invoiceNumber: string) => void;
  setPendingCancelFieldErrors: (errors: Partial<Record<"pin" | "reason", string>>) => void;
  setViewingPendingQrSale: (sale: any) => void;
  onOpenCheckout: () => void;
  onParkSale: () => void;
}

const PAYMENT_METHODS = [
  { id: "EFECTIVO",        label: "Efectivo",  icon: Banknote,       cls: "cash"   },
  { id: "TARJETA",         label: "Tarjeta",   icon: CreditCard,     cls: "card"   },
  { id: "STORE_CREDIT",    label: "Vale",      icon: Ticket,         cls: "mixed"  },
  { id: "MIXTO",           label: "Mixto",     icon: ArrowLeftRight, cls: "mixed"  },
  { id: "QR_MERCADOPAGO",  label: "QR",        icon: QrCode,         cls: "qr"     },
] as const;

export function CheckoutPanel({
  cartData,
  pendingQrSales,
  pendingQrChecking,
  checkPendingQrStatus,
  setPendingCancelFieldErrors,
  setViewingPendingQrSale,
  onOpenCheckout,
  onParkSale,
}: CheckoutPanelProps) {
  const {
    cart,
    cartSubtotalOriginal,
    cartDiscount,
    cartSubtotal,
    taxBreakdown,
    cartTax,
    cartTotal,
    paymentMethod,
    handleCancelCurrentPurchase,
  } = cartData;

  const isEmpty = cart.length === 0;
  const hasDiscount = cartDiscount > 0;

  // Calculadora rápida de cambio
  const [quickCash, setQuickCash] = useState("");
  const quickCashRef = useRef<HTMLInputElement>(null);
  const quickChange = quickCash !== "" ? (parseFloat(quickCash) || 0) - cartTotal : null;

  // Limpiar la calculadora cuando cambia el carrito o se cancela
  useEffect(() => { setQuickCash(""); }, [cartTotal]);

  // Atajo F3 para enfocar la calculadora
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "F3" && !isEmpty) {
        e.preventDefault();
        quickCashRef.current?.focus();
        quickCashRef.current?.select();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isEmpty]);

  // Encontrar info del método de pago activo
  const activeMethod = PAYMENT_METHODS.find((m) => m.id === paymentMethod);

  return (
    <div className="pos-checkout-panel">

      {/* COLUMNA IZQUIERDA: Pagos QR Pendientes */}
      {pendingQrSales.length > 0 && (
        <div style={{ flex: 1 }} className="pos-cashier-terminal-summary-col">
          <div style={{
            fontSize: "10px",
            fontWeight: "800",
            color: "var(--pos-text-muted, #94a3b8)",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            marginBottom: "6px",
          }}>
            📱 Pagos QR Pendientes
          </div>
          <div className="pos-cashier-inline-table-scroll">
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
              <tbody>
                {pendingQrSales.slice(-3).reverse().map((sale, index) => {
                  const isChecking = pendingQrChecking === sale.invoiceNumber;
                  const isApproved = sale.status === "approved";
                  const isRejected = sale.status === "rejected";
                  const isFirstPending = index === 0 && !isApproved && !isRejected;
                  return (
                    <tr
                      key={sale.id}
                      style={{
                        borderBottom: "1px solid var(--pos-border, #e2e8f0)",
                        backgroundColor: isApproved
                          ? "var(--pos-green-soft, #f0fdf4)"
                          : isRejected
                          ? "var(--pos-red-soft, #fef2f2)"
                          : "transparent",
                      }}
                    >
                      <td style={{ padding: "4px 6px", fontWeight: "600", color: "var(--pos-text-2, #475569)", whiteSpace: "nowrap" }} title={sale.invoiceNumber}>
                        ...{sale.invoiceNumber.slice(-6)}
                      </td>
                      <td style={{ padding: "4px 6px", fontWeight: "700", color: "var(--pos-text, #0f172a)", whiteSpace: "nowrap" }}>
                        ${Number(sale.amount).toFixed(2)}
                      </td>
                      <td style={{ padding: "4px 6px" }}>
                        <span style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          padding: "1px 6px",
                          borderRadius: "8px",
                          fontSize: "10px",
                          fontWeight: "800",
                          backgroundColor: isApproved ? "#dcfce7" : isRejected ? "#fee2e2" : "#ffedd5",
                          color: isApproved ? "#15803d" : isRejected ? "#b91c1c" : "#c2410c",
                        }}>
                          <span style={{ width: "5px", height: "5px", borderRadius: "50%", backgroundColor: isApproved ? "#22c55e" : isRejected ? "#ef4444" : "#f97316" }} />
                          {isApproved ? "Aprobado" : isRejected ? "Rechazado" : "Pendiente"}
                        </span>
                      </td>
                      <td style={{ padding: "4px 6px", textAlign: "right", whiteSpace: "nowrap" }}>
                        <div style={{ display: "inline-flex", gap: "4px" }}>
                          <button
                            onClick={(e) => { e.stopPropagation(); setPendingCancelFieldErrors({}); setViewingPendingQrSale(sale); }}
                            title={isFirstPending ? "Ver QR (Alt+J)" : "Ver QR"}
                            {...(isFirstPending ? { "data-shortcut-letter": "J" } : {})}
                            style={{ padding: "2px 6px", borderRadius: "4px", fontSize: "11px", fontWeight: "700", backgroundColor: "#dbeafe", color: "#1e40af", border: "1px solid #93c5fd", cursor: "pointer" }}
                          >
                            QR
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); checkPendingQrStatus(sale.invoiceNumber); }}
                            disabled={isChecking}
                            title={isFirstPending ? "Verificar pago (Alt+W)" : "Verificar pago"}
                            {...(isFirstPending ? { "data-shortcut-action": "verify-payment", "data-shortcut-letter": "W" } : {})}
                            style={{ padding: "2px 6px", borderRadius: "4px", fontSize: "11px", fontWeight: "700", backgroundColor: isChecking ? "#6b7280" : "#1e40af", color: "white", border: "none", cursor: isChecking ? "default" : "pointer" }}
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
        </div>
      )}

      {/* COLUMNA DERECHA: Total + Resumen + Botones */}
      <div className="pos-totals-col">

        {/* Total gigante siempre visible */}
        <div className={`pos-total-display ${hasDiscount ? "has-discount" : ""}`}>
          <p className="pos-total-display-label">Total a cobrar</p>
          <div className={`pos-total-display-amount ${hasDiscount ? "has-discount" : ""}`}>
            ${cartTotal.toFixed(2)}
          </div>
        </div>

        {/* Indicador de método de pago activo */}
        {activeMethod && (
          <div className={`pos-active-payment-indicator ${activeMethod.cls}`}>
            <activeMethod.icon size={12} />
            <span>Pago: {activeMethod.label}</span>
          </div>
        )}

        {/* ===== CALCULADORA RÁPIDA DE CAMBIO ===== */}
        {!isEmpty && (
          <div className="pos-quick-calc">
            <div className="pos-quick-calc-row">
              <Calculator size={13} className="pos-quick-calc-icon" />
              <label className="pos-quick-calc-label" htmlFor="quick-cash-input">Recibido $</label>
              <input
                id="quick-cash-input"
                ref={quickCashRef}
                type="number"
                min="0"
                step="0.5"
                className="pos-quick-calc-input"
                placeholder="0.00"
                value={quickCash}
                onChange={(e) => setQuickCash(e.target.value)}
                data-shortcut-key="F3"
                title="Calculadora de cambio (F3)"
              />
            </div>
            {quickChange !== null && (
              <div className={`pos-quick-calc-change ${quickChange < 0 ? "insufficient" : ""}`}>
                {quickChange < 0
                  ? `Falta: $${Math.abs(quickChange).toFixed(2)}`
                  : `Cambio: $${quickChange.toFixed(2)}`
                }
              </div>
            )}
          </div>
        )}

        {/* Desglose de totales */}
        <div className="pos-summary-row">
          <span>Subtotal:</span>
          <span className="amount">${cartSubtotalOriginal.toFixed(2)}</span>
        </div>
        {cartDiscount > 0 && (
          <div className="pos-summary-row discount">
            <span>Ahorro promociones:</span>
            <span className="amount">-${cartDiscount.toFixed(2)}</span>
          </div>
        )}
        <div className="pos-summary-row">
          <span>Subtotal neto:</span>
          <span className="amount">${cartSubtotal.toFixed(2)}</span>
        </div>

        {Object.keys(taxBreakdown).length > 0 ? (
          Object.entries(taxBreakdown)
            .filter(([_, taxAmount]) => (taxAmount as number) > 0)
            .map(([taxName, taxAmount]) => (
              <div key={taxName} className="pos-summary-row">
                <span>{taxName}:</span>
                <span className="amount">${(taxAmount as number).toFixed(2)}</span>
              </div>
            ))
        ) : (
          <div className="pos-summary-row">
            <span>Impuestos:</span>
            <span className="amount">${cartTax.toFixed(2)}</span>
          </div>
        )}

        {Math.abs(cartTotal - (cartSubtotal + cartTax)) > 0.01 && (
          <div className="pos-summary-row" style={{ color: cartTotal - (cartSubtotal + cartTax) < 0 ? "#15803d" : "#b91c1c" }}>
            <span>Ajuste redondeo:</span>
            <span className="amount">
              {cartTotal - (cartSubtotal + cartTax) > 0 ? "+" : ""}
              {(cartTotal - (cartSubtotal + cartTax)).toFixed(2)}
            </span>
          </div>
        )}

        <div className="pos-summary-row total-row">
          <span>Total:</span>
          <span className="amount" style={{ color: "var(--pos-blue, #1e40af)" }}>
            ${cartTotal.toFixed(2)}
          </span>
        </div>

        {/* Botones de acción */}
        <div className="pos-action-btns">
          <button
            type="button"
            onClick={handleCancelCurrentPurchase}
            className="pos-btn-cancel active-tap"
            data-shortcut-letter="V"
            title="Cancelar compra (Alt+V)"
          >
            CANCELAR
          </button>
          <button
            type="button"
            onClick={onParkSale}
            disabled={isEmpty}
            className="pos-btn-park active-tap"
            data-shortcut-letter="P"
            title="Pausar venta (Alt+P)"
          >
            PAUSAR
          </button>
          <button
            type="button"
            disabled={isEmpty}
            onClick={onOpenCheckout}
            className="pos-btn-checkout active-tap"
            data-shortcut-key="F4"
            title="Cobrar (F4)"
          >
            COBRAR
            <span className="pos-btn-checkout-fkey">F4</span>
          </button>
        </div>
      </div>
    </div>
  );
}
