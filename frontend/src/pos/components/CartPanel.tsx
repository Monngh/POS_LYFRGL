import { useState, useEffect, useRef } from "react";
import { Minus, Plus, XCircle, Tag, ShoppingCart } from "lucide-react";
import { usePosCart } from "../hooks/usePosCart";

interface ActivePromotion {
  id: number;
  name: string;
  type: string;
  value: number | null;
  minQuantity: number | null;
  payQuantity: number | null;
  specialPrice: number | null;
}

interface Product {
  id: number;
  sku: string;
  name: string;
  sellPrice: number;
  stock: number;
  activePromotion?: ActivePromotion | null;
}

interface CartItem {
  product: Product;
  quantity: number;
}

const calculateItemPromotion = (item: CartItem) => {
  const promo = item.product.activePromotion;
  const originalPrice = Number(item.product.sellPrice);
  const quantity = item.quantity;
  const subtotalOriginal = originalPrice * quantity;

  if (!promo) {
    return { finalPrice: originalPrice, discountAmount: 0, label: "", promoApplied: false };
  }

  let discountAmount = 0;
  let finalPrice = originalPrice;
  const minQty = promo.minQuantity || 1;

  if (promo.type === "Percentage") {
    if (quantity >= minQty) {
      const val = Number(promo.value) || 0;
      const discountPerUnit = originalPrice * (val / 100);
      discountAmount = discountPerUnit * quantity;
      finalPrice = originalPrice - discountPerUnit;
    }
  } else if (promo.type === "FixedAmount") {
    if (quantity >= minQty) {
      const val = Number(promo.value) || 0;
      discountAmount = val * quantity;
      finalPrice = Math.max(0, originalPrice - val);
    }
  } else if (promo.type === "BuyXPayY") {
    const x = Number(promo.minQuantity) || 1;
    const y = Number(promo.payQuantity) || 1;
    if (quantity >= x) {
      const groups = Math.floor(quantity / x);
      const remainder = quantity % x;
      const paidUnits = (groups * y) + remainder;
      const lineCost = paidUnits * originalPrice;
      discountAmount = subtotalOriginal - lineCost;
      finalPrice = lineCost / quantity;
    }
  } else if (promo.type === "SpecialPrice") {
    const special = Number(promo.specialPrice) || originalPrice;
    if (quantity >= minQty) {
      finalPrice = special;
      discountAmount = (originalPrice - special) * quantity;
    }
  }

  const promoApplied = discountAmount > 0;
  return { finalPrice, discountAmount, label: promoApplied ? promo.name : "", promoApplied };
};

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
              <th style={{ position: "sticky", top: 0, zIndex: 5, backgroundColor: "var(--pos-surface)" }}>Producto</th>
              <th style={{ textAlign: "center", position: "sticky", top: 0, zIndex: 5, backgroundColor: "var(--pos-surface)" }}>Cant.</th>
              <th style={{ textAlign: "right", position: "sticky", top: 0, zIndex: 5, backgroundColor: "var(--pos-surface)" }}>Precio</th>
              <th style={{ textAlign: "right", position: "sticky", top: 0, zIndex: 5, backgroundColor: "var(--pos-surface)" }}>Importe</th>
              <th style={{ width: "28px", position: "sticky", top: 0, zIndex: 5, backgroundColor: "var(--pos-surface)" }} />
            </tr>
          </thead>
          <tbody>
            {cart.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: "center", padding: "16px 0", color: "var(--pos-text-muted, #94a3b8)", background: "var(--pos-surface-2, #f8fafc)" }}>
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
                    <td data-label="Precio" style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                      {hasDiscount ? (
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "1px" }}>
                          <span style={{ textDecoration: "line-through", color: "var(--pos-text-muted, #94a3b8)", fontSize: "10px", lineHeight: 1 }}>
                            ${Number(item.product.sellPrice).toFixed(2)}
                          </span>
                          <span style={{ color: "#1e40af", fontWeight: "700", fontSize: "12px", lineHeight: 1 }}>
                            ${promoDetails.finalPrice.toFixed(2)}
                          </span>
                        </div>
                      ) : (
                        <span>${Number(item.product.sellPrice).toFixed(2)}</span>
                      )}
                    </td>

                    {/* Importe (con descuento si aplica) */}
                    <td
                      data-label="Importe"
                      style={{
                        textAlign: "right",
                        fontWeight: "700",
                        color: hasDiscount ? "#d97706" : "var(--pos-text, #0f172a)",
                        fontVariantNumeric: "tabular-nums",
                        whiteSpace: "nowrap",
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
