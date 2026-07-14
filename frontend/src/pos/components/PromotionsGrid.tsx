import { useState, useEffect, useRef } from "react";
import { ChevronDown, ChevronUp, Tag } from "lucide-react";
import api from "../../shared/services/api";

interface Promotion {
  id: number;
  name: string;
  description: string;
  promotionType: {
    name: string;
  };
  value: number | null;
  minQuantity: number | null;
  payQuantity: number | null;
  specialPrice: number | null;
  products: {
    product: {
      id: number;
      name: string;
      barcode: string;
      sku: string;
      sellPrice: number;
      stock: number;
    };
  }[];
}

interface PromotionsGridProps {
  cart: any[];
  onAddProduct: (product: any, qty?: number) => void;
  onToast: (msg: string, type?: "error" | "success" | "info" | "warning") => void;
  cartDiscount?: number;
}

export function PromotionsGrid({ cart: _cart, onAddProduct, onToast, cartDiscount = 0 }: PromotionsGridProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPromotions = async () => {
      try {
        const res = await api.get("/api/promotions/active");
        const data = res.data;
        setPromotions(Array.isArray(data) ? data : (data?.promotions || []));
      } catch (err) {
        console.error("Error fetching promotions", err);
        onToast("No se pudieron cargar las promociones activas", "error");
      } finally {
        setLoading(false);
      }
    };
    fetchPromotions();
  }, []);

  const availablePromotions = Array.isArray(promotions) ? promotions : [];

  const getDiscountBadge = (promo: Promotion) => {
    if (promo.promotionType.name === "BuyXPayY" && promo.minQuantity && promo.payQuantity) {
      return `${promo.minQuantity}x${promo.payQuantity}`;
    }
    if (promo.promotionType.name === "Percentage" && promo.value) {
      return `-${promo.value}%`;
    }
    if (promo.promotionType.name === "FixedAmount" && promo.value) {
      return `-$${promo.value}`;
    }
    if (promo.promotionType.name === "SpecialPrice" && promo.specialPrice) {
      return `$${promo.specialPrice} c/u`;
    }
    return "Promo";
  };

  const handlePromoClick = (promo: Promotion) => {
    if (!promo.products || promo.products.length === 0) return;
    const rawProduct = promo.products[0].product;
    
    // Attach activePromotion so the cart can calculate it correctly
    const product = {
      ...rawProduct,
      activePromotion: {
        id: promo.id,
        name: promo.name,
        type: promo.promotionType.name,
        value: promo.value,
        minQuantity: promo.minQuantity,
        payQuantity: promo.payQuantity,
        specialPrice: promo.specialPrice
      }
    };

    // Agregamos la cantidad requerida para la promoción (minQuantity), o 1 por defecto
    const qtyToAdd = promo.minQuantity || 1;
    onAddProduct(product, qtyToAdd);
    onToast(`Promoción ${promo.name} agregada`, "success");
  };

  // Add global keyboard shortcuts Alt+1 to Alt+9, and Alt+P for focusing the grid
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && !e.ctrlKey && !e.shiftKey) {
        const key = e.key.toLowerCase();
        if (key >= "1" && key <= "9") {
          const index = parseInt(key) - 1;
          if (index < availablePromotions.length && !isCollapsed) {
            e.preventDefault();
            handlePromoClick(availablePromotions[index]);
          }
        } else if (key === "p") {
          e.preventDefault();
          setIsCollapsed((prev) => {
            const isFocusing = !prev && document.activeElement && listRef.current?.contains(document.activeElement);
            // If it's closed, open it. If it's open but unfocused, focus it. If it's open and focused, close it.
            if (!prev && !isFocusing) {
              setTimeout(() => {
                const firstItem = listRef.current?.querySelector<HTMLElement>('.pos-checkout-focusable-item');
                if (firstItem) firstItem.focus();
              }, 50);
              return false;
            } else if (prev) {
              setTimeout(() => {
                const firstItem = listRef.current?.querySelector<HTMLElement>('.pos-checkout-focusable-item');
                if (firstItem) firstItem.focus();
              }, 50);
              return false;
            } else {
              return true;
            }
          });
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [availablePromotions, isCollapsed]);

  const handleListKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!listRef.current) return;
    const items = Array.from(listRef.current.querySelectorAll<HTMLElement>('.pos-checkout-focusable-item'));
    if (items.length === 0) return;
    
    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
    
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      let nextIndex = currentIndex + 1;
      if (nextIndex >= items.length) nextIndex = items.length - 1;
      items[nextIndex].focus();
      items[nextIndex].scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      let prevIndex = currentIndex - 1;
      if (prevIndex < 0) prevIndex = 0;
      items[prevIndex].focus();
      items[prevIndex].scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    }
  };

  const handleItemKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, promo: Promotion) => {
    if (e.target !== e.currentTarget) return;
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    
    if (e.key.toLowerCase() === "r" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handlePromoClick(promo);
    }
  };

  return (
    <div className="pos-quick-actions-container" style={{ marginTop: "16px" }}>
      <div 
        className="pos-quick-actions-header" 
        style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <h4 className="pos-sidebar-title" style={{ display: "flex", alignItems: "center" }}>
          PROMOCIONES ACTIVAS
          <span style={{ fontSize: "11px", color: "#94a3b8", fontWeight: "normal", marginLeft: "8px", textTransform: "none", letterSpacing: "normal" }}>
            (Alt+P)
          </span>
        </h4>
        {isCollapsed ? <ChevronDown size={18} color="#64748b" /> : <ChevronUp size={18} color="#64748b" />}
      </div>

      <div style={{
        display: "grid",
        gridTemplateRows: isCollapsed ? "0fr" : "1fr",
        transition: "grid-template-rows 0.2s ease-out, margin-top 0.2s ease-out",
        marginTop: isCollapsed ? 0 : "2px",
      }}>
        <div style={{ overflow: "hidden" }}>
          {loading ? (
            <p style={{ color: "#94a3b8", fontSize: "12px", textAlign: "center", paddingBottom: "12px" }}>Cargando...</p>
          ) : availablePromotions.length > 0 ? (
            <div 
              ref={listRef}
              onKeyDown={handleListKeyDown}
              style={{ display: "flex", overflowX: "auto", gap: "10px", paddingBottom: "8px", paddingTop: "10px", paddingRight: "12px" }}
            >
              {availablePromotions.map((promo, idx) => {
                const badge = getDiscountBadge(promo);
                const shortcutNum = idx < 9 ? idx + 1 : null;
                
                return (
                  <button
                    key={promo.id}
                    className="pos-quick-action-btn active-tap pos-checkout-focusable-item"
                    type="button"
                    tabIndex={isCollapsed ? -1 : 0}
                    onKeyDown={(e) => handleItemKeyDown(e, promo)}
                    onClick={() => handlePromoClick(promo)}
                    style={{ position: "relative", outline: "none", alignItems: "flex-start", padding: "10px", height: "auto", minWidth: "220px", flexShrink: 0 }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", width: "100%", marginBottom: "4px" }}>
                      <div className="pos-quick-action-icon-wrapper" style={{ color: "#d97706", marginBottom: 0 }}>
                        <Tag size={14} />
                      </div>
                      <span style={{ 
                        backgroundColor: "#fef3c7", color: "#b45309", fontSize: "10px", 
                        fontWeight: "800", padding: "2px 6px", borderRadius: "4px" 
                      }}>
                        {badge}
                      </span>
                    </div>
                    
                    <span style={{ fontSize: "12px", fontWeight: "700", textAlign: "left", width: "100%", display: "block" }}>
                      {promo.name}
                    </span>
                    <span style={{ fontSize: "10px", color: "#64748b", textAlign: "left", width: "100%", display: "block", marginTop: "2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {promo.products[0]?.product?.name}
                    </span>

                    {shortcutNum && (
                      <span className="pos-fkey-badge" style={{ position: "absolute", bottom: "8px", right: "8px" }}>
                        Alt+{shortcutNum}
                      </span>
                    )}
                    <span className="pos-action-shortcut-pill">R</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "24px 0",
              color: "#94a3b8",
              backgroundColor: "var(--pos-surface-2, #f8fafc)",
              borderRadius: "8px",
              marginBottom: "4px"
            }}>
              <span style={{ fontSize: "16px", marginBottom: "4px" }}>🛒</span>
              <span style={{ fontSize: "12px", fontWeight: "600" }}>
                {cartDiscount > 0 
                  ? "Todas las promociones disponibles ya están aplicadas" 
                  : "No hay promociones disponibles"}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
