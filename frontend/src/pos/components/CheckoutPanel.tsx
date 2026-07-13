import { useRef, useEffect, useState } from "react";
import { usePosCart } from "../hooks/usePosCart";

interface CheckoutPanelProps {
  cartData: ReturnType<typeof usePosCart>;
  searchData?: any;
  pendingQrSales: any[];
  pendingQrChecking: string | null;
  checkPendingQrStatus: (invoiceNumber: string) => void;
  setPendingCancelFieldErrors: (errors: Partial<Record<"pin" | "reason", string>>) => void;
  setViewingPendingQrSale: (sale: any) => void;
  onOpenCheckout: () => void;
  onParkSale: () => void;
  isSidebarCollapsed?: boolean;
  parkedSales?: any[];
  onRecoverParkedSale?: (sale: any) => void;
  onDeleteParkedSale?: (id: number) => void;
}


export function CheckoutPanel({
  cartData,
  searchData: _searchData,
  pendingQrSales,
  pendingQrChecking,
  checkPendingQrStatus,
  setPendingCancelFieldErrors,
  setViewingPendingQrSale,
  onOpenCheckout,
  onParkSale,
  isSidebarCollapsed: _isSidebarCollapsed,
  parkedSales = [],
  onRecoverParkedSale,
  onDeleteParkedSale,
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
    paymentMethod,
  } = cartData;

  const isEmpty = cart.length === 0;
  const hasDiscount = cartDiscount > 0;

  // Calculadora rápida de cambio
  const quickCashRef = useRef<HTMLInputElement>(null);

  const [isQrExpanded, setIsQrExpanded] = useState(false);
  const [isParkedExpanded, setIsParkedExpanded] = useState(false);

  const parkedListRef = useRef<HTMLDivElement>(null);
  const qrListRef = useRef<HTMLDivElement>(null);

  // Atajos para abrir acordeones y enfocar
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.altKey && e.key.toLowerCase() === "e" && parkedSales.length > 0) {
        e.preventDefault();
        setIsParkedExpanded(prev => {
          const next = !prev;
          if (next) {
            setTimeout(() => {
              parkedListRef.current?.querySelector<HTMLElement>('[tabindex="0"]')?.focus();
            }, 50);
          }
          return next;
        });
      }
      if (e.altKey && e.key.toLowerCase() === "s" && pendingQrSales.length > 0) {
        e.preventDefault();
        setIsQrExpanded(prev => {
          const next = !prev;
          if (next) {
            setTimeout(() => {
              qrListRef.current?.querySelector<HTMLElement>('[tabindex="0"]')?.focus();
            }, 50);
          }
          return next;
        });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [parkedSales.length, pendingQrSales.length]);

  const handleListKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const currentFocus = document.activeElement as HTMLElement;
      if (!currentFocus) return;
      const allItems = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('.pos-checkout-focusable-item[tabindex="0"]'));
      const currentIndex = allItems.indexOf(currentFocus);
      if (currentIndex === -1) return;
      let nextIndex = e.key === "ArrowDown" ? currentIndex + 1 : currentIndex - 1;
      if (nextIndex < 0) nextIndex = 0;
      if (nextIndex >= allItems.length) nextIndex = allItems.length - 1;
      allItems[nextIndex].focus();
    }
  };

  const handleItemKeyDown = (e: React.KeyboardEvent<HTMLDivElement>, sale: any, type: "parked" | "qr") => {
    if (e.target !== e.currentTarget) return;
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    
    if (type === "parked") {
      if (e.key.toLowerCase() === "r" && onRecoverParkedSale) {
        e.preventDefault();
        onRecoverParkedSale(sale);
      } else if (e.key.toLowerCase() === "e" && onDeleteParkedSale) {
        e.preventDefault();
        onDeleteParkedSale(sale.id);
      }
    } else if (type === "qr") {
      if (e.key.toLowerCase() === "r") {
        e.preventDefault();
        const isChecking = pendingQrChecking === sale.invoiceNumber;
        if (!isChecking) checkPendingQrStatus(sale.invoiceNumber);
      } else if (e.key.toLowerCase() === "e") {
        e.preventDefault();
        setPendingCancelFieldErrors({});
        setViewingPendingQrSale(sale);
      }
    }
  };

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

  return (
    <div className="pos-checkout-panel">

      {/* COLUMNA DERECHA: Ventas en Espera (Pausadas) */}
      {parkedSales.length > 0 && (
        <div style={{ flex: isParkedExpanded ? 1 : "none", display: "flex", flexDirection: "column", marginBottom: "8px", minHeight: 0, transition: "flex 0.2s ease-out" }}>
          <button
            type="button"
            onClick={() => setIsParkedExpanded(!isParkedExpanded)}
            style={{
              width: "100%",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              background: "var(--pos-surface-2, #f8fafc)",
              border: "1px solid var(--pos-border, #e2e8f0)",
              borderRadius: "6px",
              padding: "6px 10px",
              cursor: "pointer"
            }}
          >
            <span style={{ fontSize: "11px", fontWeight: "800", color: "#1e3a8a", display: "flex", gap: "6px", alignItems: "center" }}>
              ⏱️ {parkedSales.length} venta{parkedSales.length > 1 ? "s" : ""} en espera (Alt+E)
            </span>
            <span style={{ fontSize: "14px", color: "#1e3a8a", fontWeight: "bold" }}>
              {isParkedExpanded ? "−" : "+"}
            </span>
          </button>
          
          <div style={{
            display: "grid",
            gridTemplateRows: isParkedExpanded ? "1fr" : "0fr",
            transition: "grid-template-rows 0.2s ease-out, margin-top 0.2s ease-out",
            marginTop: isParkedExpanded ? "6px" : 0,
            flex: isParkedExpanded ? 1 : "none",
            minHeight: 0
          }}>
            <div style={{ overflow: "hidden", display: "flex", flexDirection: "column", minHeight: 0 }}>
              <div 
                ref={parkedListRef}
                onKeyDown={handleListKeyDown}
                style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "6px", paddingRight: "4px", paddingBottom: "4px" }}
              >
              {[...parkedSales].reverse().map((sale) => {
                return (
                  <div 
                    key={sale.id} 
                    tabIndex={isParkedExpanded ? 0 : -1}
                    className="pos-checkout-focusable-item"
                    onKeyDown={(e) => handleItemKeyDown(e, sale, "parked")}
                    style={{ 
                    border: "1px solid var(--pos-border, #e2e8f0)", borderRadius: "4px", padding: "8px", 
                    backgroundColor: "white", display: "flex", flexDirection: "column", gap: "8px",
                    outline: "none"
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        <span style={{ fontSize: "12px", fontWeight: "700", color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "160px" }}>
                          {sale.customer ? sale.customer.name : "Venta Anónima"}
                        </span>
                        <span style={{ fontSize: "10px", color: "#64748b" }}>
                          {new Date(sale.createdAt).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <span style={{ fontSize: "13px", fontWeight: "800", color: "#1e3a8a" }}>
                        ${Number(sale.total).toFixed(2)}
                      </span>
                    </div>
                    
                    <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                      <button 
                        onClick={() => onDeleteParkedSale && onDeleteParkedSale(sale.id)}
                        title="Eliminar venta en espera"
                        style={{ position: "relative", background: "transparent", border: "1px solid #ef4444", color: "#ef4444", padding: "4px 8px", borderRadius: "4px", fontSize: "11px", cursor: "pointer", fontWeight: "600" }}
                      >
                        <span className="pos-action-shortcut-pill">E</span>
                        Eliminar
                      </button>
                      <button 
                        onClick={() => onRecoverParkedSale && onRecoverParkedSale(sale)}
                        title="Recuperar"
                        style={{ position: "relative", background: "#2563eb", border: "none", color: "white", padding: "4px 12px", borderRadius: "4px", fontSize: "11px", cursor: "pointer", fontWeight: "700" }}
                      >
                        <span className="pos-action-shortcut-pill">R</span>
                        Recuperar
                      </button>
                    </div>
                  </div>
                );
              })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pagos QR Pendientes */}
      {pendingQrSales.length > 0 && (
        <div style={{ flex: isQrExpanded ? 1 : "none", display: "flex", flexDirection: "column", marginBottom: "8px", minHeight: 0, transition: "flex 0.2s ease-out" }}>
          <button
            type="button"
            onClick={() => setIsQrExpanded(!isQrExpanded)}
            style={{
              width: "100%",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              background: "var(--pos-yellow-soft, #fef3c7)",
              border: "1px solid var(--pos-yellow, #f59e0b)",
              borderRadius: "6px",
              padding: "6px 10px",
              cursor: "pointer"
            }}
          >
            <span style={{ fontSize: "11px", fontWeight: "800", color: "#b45309", display: "flex", gap: "6px", alignItems: "center" }}>
              🔔 {pendingQrSales.length} pago{pendingQrSales.length > 1 ? "s" : ""} pendiente{pendingQrSales.length > 1 ? "s" : ""} (Alt+S)
            </span>
            <span style={{ fontSize: "14px", color: "#b45309", fontWeight: "bold" }}>
              {isQrExpanded ? "−" : "+"}
            </span>
          </button>
          
          <div style={{
            display: "grid",
            gridTemplateRows: isQrExpanded ? "1fr" : "0fr",
            transition: "grid-template-rows 0.2s ease-out, margin-top 0.2s ease-out",
            marginTop: isQrExpanded ? "6px" : 0,
            flex: isQrExpanded ? 1 : "none",
            minHeight: 0
          }}>
            <div style={{ overflow: "hidden", display: "flex", flexDirection: "column", minHeight: 0 }}>
              <div 
                ref={qrListRef}
                onKeyDown={handleListKeyDown}
                style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "6px", paddingRight: "4px", paddingBottom: "4px" }}
              >
              {[...pendingQrSales].reverse().map((sale) => {
                const isChecking = pendingQrChecking === sale.invoiceNumber;
                const isApproved = sale.status === "approved";
                const isRejected = sale.status === "rejected";
                
                const bgColor = isApproved ? "#f0fdf4" : isRejected ? "#fef2f2" : "#fffbeb";
                const borderColor = isApproved ? "#bbf7d0" : isRejected ? "#fecaca" : "#fef08a";
                
                return (
                  <div
                    key={sale.id}
                    tabIndex={isQrExpanded ? 0 : -1}
                    className="pos-checkout-focusable-item"
                    onKeyDown={(e) => handleItemKeyDown(e, sale, "qr")}
                    style={{
                      border: `1px solid ${borderColor}`,
                      backgroundColor: bgColor,
                      borderRadius: "6px",
                      padding: "8px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "6px",
                      fontSize: "12px",
                      outline: "none"
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontWeight: "600", color: "var(--pos-text-2, #475569)" }} title={sale.invoiceNumber}>
                        ...{sale.invoiceNumber.slice(-6)}
                      </span>
                      <span style={{ fontWeight: "700", color: "var(--pos-text, #0f172a)" }}>
                        ${Number(sale.amount).toFixed(2)}
                      </span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
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
                      <div style={{ display: "flex", gap: "4px" }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); setPendingCancelFieldErrors({}); setViewingPendingQrSale(sale); }}
                          title="Ver QR"
                          style={{ position: "relative", padding: "2px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: "700", backgroundColor: "#dbeafe", color: "#1e40af", border: "1px solid #93c5fd", cursor: "pointer" }}
                        >
                          <span className="pos-action-shortcut-pill">E</span>
                          QR
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); checkPendingQrStatus(sale.invoiceNumber); }}
                          disabled={isChecking}
                          title="Verificar"
                          style={{
                            position: "relative", padding: "2px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: "700",
                            backgroundColor: isChecking ? "#e2e8f0" : "#1e40af",
                            color: isChecking ? "#94a3b8" : "white",
                            border: "none", cursor: isChecking ? "not-allowed" : "pointer"
                          }}
                        >
                          <span className="pos-action-shortcut-pill">R</span>
                          {isChecking ? "..." : "Verificar"}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
              </div>
            </div>
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



        {/* Payment Method Indicator & Action Buttons */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
          <span style={{ fontSize: "11px", fontWeight: "700", color: "#64748b", textTransform: "uppercase" }}>
            Método de Pago
          </span>
          <span style={{
            fontSize: "11px", fontWeight: "700", color: "#0f172a", backgroundColor: "#f1f5f9",
            padding: "4px 8px", borderRadius: "6px"
          }}>
            {paymentMethod.replace("_", " ")}
          </span>
        </div>

        {/* Botones de acción */}
        <div className="pos-action-btns">
          <button
            type="button"
            onClick={handleCancelCurrentPurchase}
            className="pos-btn-cancel active-tap"
            data-shortcut-letter="C"
            title="Cancelar compra (Alt+C)"
            style={{ position: "relative" }}
          >
            CANCELAR
            <span className="pos-fkey-badge">Alt+C</span>
          </button>
          <button
            type="button"
            onClick={onParkSale}
            disabled={isEmpty}
            className="pos-btn-park active-tap"
            data-shortcut-letter="W"
            title="Pausar venta (Alt+W)"
            style={{ position: "relative" }}
          >
            PAUSAR
            <span className="pos-fkey-badge">Alt+W</span>
          </button>
          <button
            type="button"
            disabled={isEmpty}
            onClick={onOpenCheckout}
            className="pos-btn-checkout active-tap"
            data-shortcut-key="F4"
            title="Cobrar (F4)"
            style={{ position: "relative" }}
          >
            COBRAR
            <span className="pos-btn-checkout-fkey">F4</span>
          </button>
        </div>
      </div>
    </div>
  );
}
