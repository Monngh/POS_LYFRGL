import React from "react";
import { Minus, Plus, XCircle } from "lucide-react";
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

const styles: { [key: string]: React.CSSProperties } = {
  table: { width: "100%", borderCollapse: "collapse" as const, textAlign: "left" as const },
  tableHeaderRow: { borderBottom: "2px solid #e2e8f0" },
  th: { padding: "10px 12px", fontSize: "11px", fontWeight: "700", color: "#475569", textTransform: "uppercase" as const },
  tableRow: { borderBottom: "1px solid #f1f5f9" },
  td: { padding: "12px", fontSize: "13px", color: "#334155" },
  qtyContainer: { display: "flex", alignItems: "center", border: "1px solid #cbd5e1", borderRadius: "4px", width: "fit-content", overflow: "hidden" },
  qtyBtn: { width: "28px", height: "28px", border: "none", backgroundColor: "#f1f5f9", cursor: "pointer", display: "flex", justifyContent: "center", alignItems: "center" },
  qtyInput: { padding: "0 12px", fontSize: "13px", fontWeight: "700", width: "40px", textAlign: "center" as const, border: "none", outline: "none", backgroundColor: "transparent" },
};

export function CartPanel({ cartData, onToast }: CartPanelProps) {
  const { cart, cartQtyDraft, setCartQtyDraft, updateCartQty, applyCartQty, removeCartItem } = cartData;

  return (
    <div style={{ flex: 1, overflowY: "auto", maxHeight: "40vh" }} className="pos-cashier-cart-scroll">
      <table style={styles.table} className="pos-cashier-cart-table">
        <thead>
          <tr style={styles.tableHeaderRow}>
            <th style={styles.th}>Código</th>
            <th style={styles.th}>Producto</th>
            <th style={styles.th}>Cantidad</th>
            <th style={styles.th}>Precio</th>
            <th style={styles.th}>Importe</th>
            <th style={styles.th}></th>
          </tr>
        </thead>
        <tbody>
          {cart.map((item) => {
            const promoDetails = calculateItemPromotion(item);
            const hasDiscount = promoDetails.discountAmount > 0;
            const promoApplied = promoDetails.promoApplied ?? hasDiscount;
            return (
              <tr key={item.product.id} style={styles.tableRow}>
                <td style={styles.td}>{item.product.sku}</td>
                <td style={{ ...styles.td, fontWeight: "600" }}>
                  <div>{item.product.name}</div>
                  {item.product.activePromotion && promoApplied && (
                    <span style={{ fontSize: "10px", backgroundColor: "#dbeafe", color: "#1e40af", padding: "2px 6px", borderRadius: "4px", fontWeight: "700", marginTop: "4px", display: "inline-block" }}>
                      🏷️ {item.product.activePromotion.name}
                    </span>
                  )}
                  {item.product.activePromotion && !promoApplied && (
                    <span style={{ fontSize: "9px", backgroundColor: "#f1f5f9", color: "#94a3b8", padding: "2px 6px", borderRadius: "4px", fontWeight: "600", marginTop: "4px", display: "inline-block" }}>
                      🏷️ {item.product.activePromotion.name} (mín. {item.product.activePromotion.minQuantity || 1})
                    </span>
                  )}
                </td>
                <td style={styles.td}>
                  <div style={styles.qtyContainer}>
                    <button onClick={() => updateCartQty(item.product.id, -1)} style={styles.qtyBtn}>
                      <Minus size={12} />
                    </button>
                    <input
                      type="text"
                      inputMode="numeric"
                      style={styles.qtyInput}
                      value={cartQtyDraft[item.product.id] ?? String(item.quantity)}
                      onFocus={() => setCartQtyDraft((prev) => ({ ...prev, [item.product.id]: String(item.quantity) }))}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, "");
                        if (digits === "") {
                          setCartQtyDraft((prev) => ({ ...prev, [item.product.id]: digits }));
                          return;
                        }
                        const parsed = parseInt(digits, 10);
                        const maxStock = item.product.stock;
                        if (parsed > maxStock) {
                          onToast(`Solo hay ${maxStock} piezas en stock.`);
                          setCartQtyDraft((prev) => ({ ...prev, [item.product.id]: String(maxStock) }));
                          return;
                        }
                        setCartQtyDraft((prev) => ({ ...prev, [item.product.id]: digits }));
                      }}
                      onBlur={() => {
                        const raw = cartQtyDraft[item.product.id] ?? String(item.quantity);
                        const parsed = parseInt(raw, 10);
                        const minQty = Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
                        const finalQty = Math.min(minQty, item.product.stock);
                        setCartQtyDraft((prev) => {
                          const next = { ...prev };
                          delete next[item.product.id];
                          return next;
                        });
                        applyCartQty(item.product.id, finalQty);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "ArrowUp") {
                          e.preventDefault();
                          setCartQtyDraft((prev) => { const next = { ...prev }; delete next[item.product.id]; return next; });
                          updateCartQty(item.product.id, 1);
                        } else if (e.key === "ArrowDown") {
                          e.preventDefault();
                          setCartQtyDraft((prev) => { const next = { ...prev }; delete next[item.product.id]; return next; });
                          updateCartQty(item.product.id, -1);
                        } else if (e.key === "Enter") {
                          e.currentTarget.blur();
                        }
                      }}
                    />
                    <button onClick={() => updateCartQty(item.product.id, 1)} style={styles.qtyBtn}>
                      <Plus size={12} />
                    </button>
                  </div>
                </td>
                <td style={styles.td}>
                  {hasDiscount ? (
                    <>
                      <span style={{ textDecoration: "line-through", color: "#94a3b8", marginRight: "6px", fontSize: "12px" }}>
                        ${item.product.sellPrice.toFixed(2)}
                      </span>
                      <span style={{ color: "#059669", fontWeight: "700" }}>
                        ${(promoDetails.finalPrice).toFixed(2)}
                      </span>
                    </>
                  ) : (
                    `$${item.product.sellPrice.toFixed(2)}`
                  )}
                </td>
                <td style={{ ...styles.td, fontWeight: "700" }}>
                  {hasDiscount ? (
                    <>
                      <div style={{ textDecoration: "line-through", color: "#94a3b8", fontSize: "11px", fontWeight: "400" }}>
                        ${(item.product.sellPrice * item.quantity).toFixed(2)}
                      </div>
                      <div style={{ color: "#059669" }}>
                        ${(promoDetails.finalPrice * item.quantity).toFixed(2)}
                      </div>
                      <div style={{ fontSize: "10px", color: "#059669", fontWeight: "600" }}>
                        Ahorro: -${promoDetails.discountAmount.toFixed(2)}
                      </div>
                    </>
                  ) : (
                    `$${(item.product.sellPrice * item.quantity).toFixed(2)}`
                  )}
                </td>
                <td style={styles.td}>
                  <button onClick={() => removeCartItem(item.product.id)} style={{ border: "none", background: "none", cursor: "pointer" }}>
                    <XCircle size={18} color="#dc2626" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
