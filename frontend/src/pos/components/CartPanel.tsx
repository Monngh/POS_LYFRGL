import { useState, useEffect, useRef } from "react";
import { Minus, Plus, XCircle, Tag, ShoppingCart } from "lucide-react";
import { usePosCart } from "../hooks/usePosCart";
// main tenía una copia local de este cálculo, duplicada del backend, que nunca recibió
// el fix de "no aplicar SpecialPrice si el precio especial es mayor al original" (sí
// aplicado en promotion.service.ts). fix/promos la extrae a un util compartido que ya
// incluye ese resguardo (y de forma más robusta, vía discountCents <= 0) — se adopta
// esa versión para no perpetuar la inconsistencia entre frontend y backend.
import { calculateItemPromotion } from "../utils/promotionPricing";

interface CartPanelProps {
  cartData: ReturnType<typeof usePosCart>;
  onToast: (msg: string, type?: "error" | "success" | "info" | "warning") => void;
}

export function CartPanel({ cartData, onToast: _onToast }: CartPanelProps) {
  const { cart, cartQtyDraft, setCartQtyDraft, updateCartQty, applyCartQty, removeCartItem } = cartData;
  const [selectedIdx, setSelectedIdx] = useState<number>(-1);
  const prevCartLengthRef = useRef(cart.length);

  // Auto-select last added product
  useEffect(() => {
    if (cart.length > prevCartLengthRef.current) {
      setSelectedIdx(cart.length - 1);
    } else if (cart.length === 0) {
      setSelectedIdx(-1);
    } else if (selectedIdx >= cart.length) {
      setSelectedIdx(cart.length - 1);
    }
    prevCartLengthRef.current = cart.length;
  }, [cart.length, selectedIdx]);

  // Window keydown listener for selected cart items
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement;
      if (active && (
        active.tagName === "INPUT" ||
        active.tagName === "TEXTAREA" ||
        active.tagName === "SELECT" ||
        (active as HTMLElement).isContentEditable
      )) {
        return;
      }

      // If a modal overlay is open, ignore global keyboard controls
      const modal = document.querySelector("[data-pos-modal], .pos-cashier-modal-overlay");
      if (modal) return;

      if (cart.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((prev) => {
          const next = prev < cart.length - 1 ? prev + 1 : 0;
          return next;
        });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((prev) => {
          const next = prev > 0 ? prev - 1 : cart.length - 1;
          return next;
        });
      } else if (e.key === "+" || e.key === "Add" || (e.key === "=" && e.shiftKey)) {
        if (selectedIdx >= 0 && selectedIdx < cart.length) {
          e.preventDefault();
          updateCartQty(cart[selectedIdx].product.id, 1);
        }
      } else if (e.key === "-" || e.key === "Subtract") {
        if (selectedIdx >= 0 && selectedIdx < cart.length) {
          e.preventDefault();
          updateCartQty(cart[selectedIdx].product.id, -1);
        }
      } else if (e.key === "Delete" || e.key === "Del" || e.key === "Backspace") {
        if (selectedIdx >= 0 && selectedIdx < cart.length) {
          e.preventDefault();
          const targetItem = cart[selectedIdx];
          removeCartItem(targetItem.product.id);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [cart, selectedIdx, updateCartQty, removeCartItem]);

  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  const hasDiscounts = cart.some((item) => calculateItemPromotion(item).promoApplied);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header del carrito con badge de artículos */}
      <div className="pos-cart-header-bar" style={{ position: "sticky", top: 0, zIndex: 10, backgroundColor: "var(--pos-surface)", borderBottom: "1px solid var(--pos-border)" }}>
        <span className="pos-cart-title">Detalle de venta</span>
        <span className="pos-cart-count-badge">
          {cart.length} {cart.length === 1 ? "producto" : "productos"} · {totalItems} {totalItems === 1 ? "artículo" : "artículos"}
        </span>
      </div>

      {/* Tabla de alta densidad */}
      <div
        className="pos-cart-table-wrapper pos-cashier-cart-scroll"
        style={{ flex: 1, overflowY: "scroll" }}
      >
        <table className="pos-cashier-cart-table">
          <thead>
            <tr>
              <th style={{ position: "sticky", top: 0, zIndex: 5, backgroundColor: "var(--pos-surface)" }}>Código</th>
              <th style={{ position: "sticky", top: 0, zIndex: 5, backgroundColor: "var(--pos-surface)" }}>Producto</th>
              <th style={{ textAlign: "center", position: "sticky", top: 0, zIndex: 5, backgroundColor: "var(--pos-surface)" }}>Cant.</th>
              <th style={{ textAlign: "right", position: "sticky", top: 0, zIndex: 5, backgroundColor: "var(--pos-surface)" }}>Precio</th>
              {hasDiscounts && <th style={{ textAlign: "right", color: "#d97706", position: "sticky", top: 0, zIndex: 5, backgroundColor: "var(--pos-surface)" }}>Dto.</th>}
              <th style={{ textAlign: "right", position: "sticky", top: 0, zIndex: 5, backgroundColor: "var(--pos-surface)" }}>Importe</th>
              <th style={{ width: "28px", position: "sticky", top: 0, zIndex: 5, backgroundColor: "var(--pos-surface)" }} />
            </tr>
          </thead>
          <tbody>
            {cart.length === 0 ? (
              <tr>
                <td colSpan={hasDiscounts ? 7 : 6} style={{ textAlign: "center", padding: "16px 0", color: "var(--pos-text-muted, #94a3b8)", background: "var(--pos-surface-2, #f8fafc)" }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
                    <span style={{ marginBottom: "4px" }}><ShoppingCart size={16} color="#94a3b8" /></span>
                    <span style={{ fontSize: "12px", fontWeight: "500" }}>Sin productos. Escanee o busque.</span>
                  </div>
                </td>
              </tr>
            ) : (
              cart.map((item, idx) => {
                const promoDetails = calculateItemPromotion(item);
                const hasDiscount = promoDetails.discountAmount > 0;
                const subtotal = promoDetails.finalPrice * item.quantity;
                const draftVal = cartQtyDraft[item.product.id];
                const displayQty = draftVal !== undefined ? draftVal : item.quantity;

                return (
                  <tr
                    key={item.product.id}
                    className={`${hasDiscount ? "pos-cart-row-promo" : ""} ${idx === selectedIdx ? "pos-cart-row-selected" : ""}`}
                    onClick={() => setSelectedIdx(idx)}
                    style={{
                      cursor: "pointer",
                      backgroundColor: idx === selectedIdx ? "rgba(37, 99, 235, 0.08)" : undefined,
                      borderLeft: idx === selectedIdx ? "3px solid #2563eb" : "3px solid transparent",
                      transition: "all 0.15s ease-in-out"
                    }}
                  >
                    {/* Código */}
                    <td
                      data-label="Código"
                      style={{ fontSize: "11px", color: "var(--pos-text-muted, #94a3b8)", fontFamily: "monospace" }}
                    >
                      {item.product.sku}
                    </td>

                    {/* Nombre */}
                    <td data-label="Producto" style={{ fontWeight: "600", color: "var(--pos-text, #0f172a)", maxWidth: "160px" }}>
                      <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {item.product.name}
                      </div>
                      {hasDiscount && (
                        <div className="pos-cart-promo-badge">
                          <Tag size={9} />
                          {promoDetails.label}
                        </div>
                      )}
                    </td>

                    {/* Cantidad */}
                    <td data-label="Cant." style={{ textAlign: "center" }}>
                      <div className="pos-qty-control">
                        <button
                          type="button"
                          className="pos-qty-btn"
                          onClick={() => updateCartQty(item.product.id, -1)}
                          title="Disminuir cantidad"
                        >
                          <Minus size={10} />
                        </button>
                        <input
                          type="text"
                          inputMode="numeric"
                          className="pos-qty-input"
                          value={displayQty}
                          onChange={(e) =>
                            setCartQtyDraft((prev: Record<number, string>) => ({
                              ...prev,
                              [item.product.id]: e.target.value,
                            }))
                          }
                          onBlur={() => applyCartQty(item.product.id, Number(cartQtyDraft[item.product.id] ?? item.quantity) || item.quantity)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") applyCartQty(item.product.id, Number(cartQtyDraft[item.product.id] ?? item.quantity) || item.quantity);
                          }}
                          aria-label={`Cantidad de ${item.product.name}`}
                        />
                        <button
                          type="button"
                          className="pos-qty-btn"
                          onClick={() => updateCartQty(item.product.id, 1)}
                          title="Aumentar cantidad"
                        >
                          <Plus size={10} />
                        </button>
                      </div>
                    </td>

                    {/* Precio unitario */}
                    <td data-label="Precio" style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {hasDiscount ? (
                        <div>
                          <span style={{ textDecoration: "line-through", color: "var(--pos-text-muted, #94a3b8)", fontSize: "10px" }}>
                            ${Number(item.product.sellPrice).toFixed(2)}
                          </span>
                          <br />
                          <span style={{ color: "var(--pos-blue)", fontWeight: "700" }}>
                            ${promoDetails.finalPrice.toFixed(2)}
                          </span>
                        </div>
                      ) : (
                        <span>${Number(item.product.sellPrice).toFixed(2)}</span>
                      )}
                    </td>

                    {/* Descuento (solo si hay alguna promo en el carrito) */}
                    {hasDiscounts && (
                      <td data-label="Dto." style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {hasDiscount ? (
                          <span style={{ color: "#d97706", fontWeight: "700" }}>
                            -${promoDetails.discountAmount.toFixed(2)}
                          </span>
                        ) : (
                          <span style={{ color: "var(--pos-text-muted, #94a3b8)" }}>—</span>
                        )}
                      </td>
                    )}

                    {/* Importe */}
                    <td
                      data-label="Importe"
                      style={{
                        textAlign: "right",
                        fontWeight: "700",
                        color: "var(--pos-text, #0f172a)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      ${subtotal.toFixed(2)}
                    </td>

                    {/* Eliminar */}
                    <td style={{ textAlign: "center", padding: "4px", overflow: "visible", position: "relative" }}>
                      <button
                        type="button"
                        className="pos-cart-remove-btn"
                        onClick={() => removeCartItem(item.product.id)}
                        title={`Eliminar ${item.product.name} (Del)`}
                        style={{ position: "relative" }}
                      >
                        <XCircle size={14} />
                        <span className="pos-cart-remove-shortcut">Del</span>
                      </button>
                    </td>

                  </tr>
                );
              })
            )}
            </tbody>
          </table>
      </div>
    </div>
  );
}
