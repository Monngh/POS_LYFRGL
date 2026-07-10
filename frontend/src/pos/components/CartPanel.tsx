import React from "react";
import { Minus, Plus, XCircle, Tag } from "lucide-react";
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
  const originalPrice = item.product.sellPrice;
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
      const val = promo.value || 0;
      const discountPerUnit = originalPrice * (val / 100);
      discountAmount = discountPerUnit * quantity;
      finalPrice = originalPrice - discountPerUnit;
    }
  } else if (promo.type === "FixedAmount") {
    if (quantity >= minQty) {
      const val = promo.value || 0;
      discountAmount = val * quantity;
      finalPrice = Math.max(0, originalPrice - val);
    }
  } else if (promo.type === "BuyXPayY") {
    const x = promo.minQuantity || 1;
    const y = promo.payQuantity || 1;
    if (quantity >= x) {
      const groups = Math.floor(quantity / x);
      const remainder = quantity % x;
      const paidUnits = (groups * y) + remainder;
      const lineCost = paidUnits * originalPrice;
      discountAmount = subtotalOriginal - lineCost;
      finalPrice = lineCost / quantity;
    }
  } else if (promo.type === "SpecialPrice") {
    const special = promo.specialPrice || originalPrice;
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
  onToast: (msg: string, type?: "error" | "success" | "info") => void;
}

export function CartPanel({ cartData, onToast: _onToast }: CartPanelProps) {
  const { cart, cartQtyDraft, setCartQtyDraft, updateCartQty, applyCartQty, removeCartItem } = cartData;

  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  const hasDiscounts = cart.some((item) => calculateItemPromotion(item).promoApplied);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header del carrito con badge de artículos */}
      <div className="pos-cart-header-bar">
        <span className="pos-cart-title">Detalle de venta</span>
        <span className="pos-cart-count-badge">
          {totalItems} {totalItems === 1 ? "artículo" : "artículos"}
        </span>
      </div>

      {/* Tabla de alta densidad */}
      <div
        className="pos-cart-table-wrapper pos-cashier-cart-scroll"
        style={{ flex: 1, overflowY: "auto", maxHeight: "38vh" }}
      >
        {cart.length === 0 ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              minHeight: "80px",
              flexDirection: "column",
              gap: "6px",
              color: "var(--pos-text-muted, #94a3b8)",
              fontSize: "12px",
              fontWeight: "600",
              background: "var(--pos-surface-2, #f8fafc)",
            }}
          >
            <span style={{ fontSize: "22px" }}>🛒</span>
            <span>Sin productos. Escanee o busque para agregar.</span>
          </div>
        ) : (
          <table className="pos-cashier-cart-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Producto</th>
                <th style={{ textAlign: "center" }}>Cant.</th>
                <th style={{ textAlign: "right" }}>Precio</th>
                {hasDiscounts && <th style={{ textAlign: "right", color: "#15803d" }}>Dto.</th>}
                <th style={{ textAlign: "right" }}>Importe</th>
                <th style={{ width: "28px" }} />
              </tr>
            </thead>
            <tbody>
              {cart.map((item) => {
                const promoDetails = calculateItemPromotion(item);
                const hasDiscount = promoDetails.discountAmount > 0;
                const subtotal = promoDetails.finalPrice * item.quantity;
                const draftVal = cartQtyDraft[item.product.id];
                const displayQty = draftVal !== undefined ? draftVal : item.quantity;

                return (
                  <tr
                    key={item.product.id}
                    className={hasDiscount ? "pos-cart-row-promo" : ""}
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
                          onClick={() => updateCartQty(item.product.id, item.quantity - 1)}
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
                          onBlur={() => applyCartQty(item.product.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") applyCartQty(item.product.id);
                          }}
                          aria-label={`Cantidad de ${item.product.name}`}
                        />
                        <button
                          type="button"
                          className="pos-qty-btn"
                          onClick={() => updateCartQty(item.product.id, item.quantity + 1)}
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
                            ${item.product.sellPrice.toFixed(2)}
                          </span>
                          <br />
                          <span style={{ color: "#15803d", fontWeight: "700" }}>
                            ${promoDetails.finalPrice.toFixed(2)}
                          </span>
                        </div>
                      ) : (
                        <span>${item.product.sellPrice.toFixed(2)}</span>
                      )}
                    </td>

                    {/* Descuento (solo si hay alguna promo en el carrito) */}
                    {hasDiscounts && (
                      <td data-label="Dto." style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {hasDiscount ? (
                          <span style={{ color: "#15803d", fontWeight: "700" }}>
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
                    <td style={{ textAlign: "center", padding: "4px" }}>
                      <button
                        type="button"
                        className="pos-cart-remove-btn"
                        onClick={() => removeCartItem(item.product.id)}
                        title={`Eliminar ${item.product.name}`}
                      >
                        <XCircle size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
