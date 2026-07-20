import React from "react";
import { Menu, MapPin, Clock, AlertTriangle, Banknote, CreditCard, ArrowLeftRight, QrCode, ExternalLink, Ticket, XCircle, Store, Sun, Moon } from "lucide-react";
import { HeaderCashInfo } from "./HeaderCashInfo";
import { usePosTheme, togglePosTheme } from "../../shared/hooks/usePosTheme";
import { TICKET_PRINT_MEDIA_STYLES } from "../../shared/utils/ticketEmailDocument.util";
import { DECIMAL_INPUT_REGEX, handleDecimalInputChange } from "../../shared/utils/decimalInput";
import { useCashSession } from "../hooks/useCashSession";
import { usePosCart } from "../hooks/usePosCart";
import { usePosSearch } from "../hooks/usePosSearch";
import { usePosCustomer } from "../hooks/usePosCustomer";
import { ProductSearchPanel } from "./ProductSearchPanel";
import { CustomerCheckoutBar } from "./CustomerCheckoutBar";
import { CartPanel } from "./CartPanel";
import { CheckoutPanel } from "./CheckoutPanel";
import { PromotionsGrid } from "./PromotionsGrid";
import { SalesLayoutView } from "./SalesLayoutView";

import { useParkedSales } from "../hooks/useParkedSales";
import { MixedPaymentModal } from "./modals";
import KeyboardShortcutsManager from "./KeyboardShortcutsManager";
import { useModalInitialFocus } from "../hooks/useModalInitialFocus";
import { GLOBAL_QUICK_ACTIONS, type GlobalQuickActionLetter } from "../constants/posShortcuts";

interface SalesTerminalUser {
  name: string;
  branch?: {
    id?: number;
    name: string;
  };
}

interface SalesTerminalViewProps {
  sessionData: ReturnType<typeof useCashSession>;
  cartData: ReturnType<typeof usePosCart>;
  searchData: ReturnType<typeof usePosSearch>;
  customerData: ReturnType<typeof usePosCustomer>;
  user: SalesTerminalUser | null;
  currentTime?: Date;
  onOpenModal: (modal: string) => void;
  onToast: (msg: string, type?: "error" | "success" | "info" | "warning") => void;
  pendingQrSales: any[];
  pendingQrChecking: string | null;
  checkPendingQrStatus: (invoiceNumber: string) => void;
  setPendingCancelFieldErrors: (errors: Partial<Record<"pin" | "reason", string>>) => void;
  setViewingPendingQrSale: (sale: any) => void;
  addPendingQrSale: () => void;

  onLogout?: () => void;
  onLock?: () => void;
  onReprintTicket?: (saleId: number) => void;
  onStartReturn?: (saleId: number) => void;
}

const styles: { [key: string]: React.CSSProperties } = {
  appContainer: { height: "100vh", display: "flex", flexDirection: "column" as const, backgroundColor: "var(--surface-2)", overflow: "hidden" },
  terminalHeader: { height: "56px", backgroundColor: "var(--surface)", borderBottom: "2px solid #3b82f6", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 24px" },
  terminalBackBtn: { width: "38px", height: "38px", borderRadius: "6px", border: "1px solid var(--border-strong)", backgroundColor: "var(--surface)", color: "var(--accent-strong)", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 2px rgba(15,23,42,0.06)" },
  terminalBody: { flex: 1, padding: "20px", display: "flex", flexDirection: "column" as const, gap: "16px" },
  modalOverlay: { position: "fixed" as const, top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(15, 23, 42, 0.4)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 100 },
  checkoutModal: { backgroundColor: "var(--surface)", padding: "24px", borderRadius: "8px", width: "450px", border: "1px solid var(--border)", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)", display: "flex", flexDirection: "column" as const, gap: "16px" },
  checkoutTotalBox: { backgroundColor: "var(--surface-2)", border: "1px solid var(--border)", padding: "16px", borderRadius: "6px", fontSize: "32px", fontWeight: "900", color: "var(--accent-strong)", textAlign: "center" as const, fontFamily: "monospace" },
  inputGroup: { display: "flex", flexDirection: "column" as const, gap: "6px" },
  label: { fontSize: "12px", fontWeight: "700", color: "var(--text-secondary)" },
  inputRow: { display: "flex", border: "1px solid var(--border-strong)", borderRadius: "4px", overflow: "hidden", backgroundColor: "var(--surface)" },
  inputPrefix: { padding: "8px 12px", backgroundColor: "var(--surface-3)", borderRight: "1px solid var(--border-strong)", color: "var(--text-muted)", fontSize: "14px", fontWeight: "700" },
  input: { border: "none", outline: "none", padding: "8px 12px", fontSize: "14px", color: "var(--text)", flex: 1, backgroundColor: "transparent" },
  paymentMethodsGrid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px" },
  paymentMethodBtn: { padding: "12px 6px", border: "1px solid var(--border-strong)", borderRadius: "6px", cursor: "pointer", fontSize: "11px", fontWeight: "700", display: "flex", flexDirection: "column" as const, alignItems: "center", gap: "6px", backgroundColor: "var(--surface)", color: "var(--text-muted)", transition: "all 0.15s ease", position: "relative" as const },
  paymentMethodBtnActive: { border: "1px solid var(--accent)", backgroundColor: "var(--accent-soft)", color: "var(--accent)" },
  cardTypesGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" },
  cardTypeBtn: { padding: "8px", border: "1px solid var(--border-strong)", borderRadius: "4px", cursor: "pointer", fontSize: "12px", fontWeight: "700", textAlign: "center" as const, backgroundColor: "var(--surface)", color: "var(--text-muted)", transition: "all 0.15s ease" },
  cardTypeBtnActive: { border: "1px solid #3b82f6", backgroundColor: "rgba(59, 130, 246, 0.05)", color: "#1e3a8a" },
  checkoutSummary: { borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)", padding: "12px 0", display: "flex", flexDirection: "column" as const, gap: "6px" },
  summaryRow: { display: "flex", justifyContent: "space-between", fontSize: "13px", color: "var(--text-secondary)" },
  modalBtn: { flex: 1, border: "none", padding: "12px", borderRadius: "6px", fontWeight: "700", fontSize: "12px", cursor: "pointer", transition: "all 0.15s ease", textTransform: "uppercase" as const, display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" },
  fieldError: { fontSize: "11px", color: "#dc2626", fontWeight: "700", margin: "2px 0 0 0" },
  select: { width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid var(--border-strong)", backgroundColor: "var(--surface)", color: "var(--text)", fontSize: "14px", outline: "none", cursor: "pointer" },
};

export function SalesTerminalView({
  sessionData,
  cartData,
  searchData,
  customerData,
  user,
  currentTime,
  onOpenModal,
  onToast,
  pendingQrSales,
  pendingQrChecking,
  checkPendingQrStatus,
  setPendingCancelFieldErrors,
  setViewingPendingQrSale,
  addPendingQrSale,

  onLock,
  onReprintTicket,
  onStartReturn,
}: SalesTerminalViewProps) {
  const theme = usePosTheme();
  const { session, sessionStats, recentSales } = sessionData;
  const {
    checkoutModalOpen, setCheckoutModalOpen,
    checkoutLoading, checkoutError, checkoutFieldErrors, setCheckoutFieldErrors,
    paymentMethod, setPaymentMethod,
    cashReceived, setCashReceived, calculatedChange,
    cardType, setCardType,
    storeCreditCode, setStoreCreditCode,
    pointsToRedeem, setPointsToRedeem,
    usePoints, setUsePoints,
    invoiceRequested, setInvoiceRequested,
    cartTotal, pointsDiscount,
    qrModalOpen, qrUrl, qrReference, qrChecking,
    checkQrStatus,
    setCheckoutError,
    handleCheckoutSubmit,
  } = cartData;

  const {
    selectedCustomer,
    isNewCustomerModalOpen, setIsNewCustomerModalOpen,
    newCustomerForm, setNewCustomerField, newCustomerFieldErrors,
    newCustomerLoading, newCustomerError,
    handleRegisterCustomerSubmit, setNewCustomerFieldErrors,
  } = customerData;

  const [isSidebarCollapsed, setIsSidebarCollapsed] = React.useState(() => {
    return typeof window !== "undefined" ? window.innerWidth <= 1024 : false;
  });
  const [isPromotionsModalOpen, setIsPromotionsModalOpen] = React.useState(false);
  const [isMobileHeaderModalOpen, setIsMobileHeaderModalOpen] = React.useState(false);

  const { parkedSales, fetchParkedSales, parkSale, deleteParkedSale } = useParkedSales(user?.branch?.id);
  const [mixedModalOpen, setMixedModalOpen] = React.useState(false);
  const checkoutModalRef = useModalInitialFocus(checkoutModalOpen, { preferSelector: `[data-method-btn="${paymentMethod}"]` });

  // Cobro en dos fases: primero elegir método con flechas, Enter confirma y da foco al input/botón, luego Enter cobra
  const [checkoutPhase, setCheckoutPhase] = React.useState<"select-method" | "fill-fields">("select-method");
  React.useEffect(() => { if (checkoutModalOpen) setCheckoutPhase("select-method"); }, [checkoutModalOpen]);

  const pointsInputRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (usePoints) {
      setTimeout(() => {
        pointsInputRef.current?.focus();
        pointsInputRef.current?.select();
      }, 80);
    }
  }, [usePoints]);

  const handleGlobalQuickAction = (actionId: string) => {
    if (actionId === "autofacturacion") {
      window.open("/autofacturacion", "_blank");
      return;
    }
    onOpenModal(actionId);
  };

  React.useEffect(() => {
    if (user?.branch?.id) {
      fetchParkedSales();
    }
  }, [user?.branch?.id, fetchParkedSales]);

  const handleParkSale = async () => {
    try {
      const cartDataStr = JSON.stringify(cartData.cart);
      const customerId = customerData.selectedCustomer?.id || null;
      await parkSale(customerId, cartDataStr, cartData.cartTotal);
      cartData.setCart([]);
      if (customerData.setSelectedCustomer) {
         customerData.setSelectedCustomer(null);
      }
      cartData.setCheckoutModalOpen(false);
      onToast("Venta pausada exitosamente", "success");
    } catch(err: any) {
      onToast(err.message || "Error al pausar la venta", "error");
    }
  };

  const formattedTime = currentTime
    ? currentTime.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: true })
    : "";

  const handleCheckoutModalKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const activeElement = document.activeElement;
    const isEditing = activeElement && (activeElement.tagName === "INPUT" || activeElement.tagName === "TEXTAREA" || (activeElement as HTMLElement).isContentEditable);
    if (isEditing && e.key !== "Escape" && e.key !== "Enter") {
      return;
    }

    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      const active = document.activeElement;
      if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || (active as HTMLElement).isContentEditable)) return;
      e.preventDefault();
      // Solo cambiar método en fase de selección
      if (checkoutPhase === "select-method") {
        const methods = ["EFECTIVO", "TARJETA", "STORE_CREDIT", "MIXTO", "QR_MERCADOPAGO"];
        const idx = methods.indexOf(paymentMethod as string);
        if (idx === -1) return;
        const next = e.key === "ArrowRight" ? Math.min(idx + 1, methods.length - 1) : Math.max(idx - 1, 0);
        setPaymentMethod(methods[next] as any);
        // Focus the button
        setTimeout(() => {
          const btn = checkoutModalRef.current?.querySelector<HTMLElement>(`[data-method-btn="${methods[next]}"]`);
          if (btn) btn.focus();
        }, 50);
      }
      return;
    }

    if (e.altKey && e.key >= "1" && e.key <= "5") {
      e.preventDefault();
      const methods = ["EFECTIVO", "TARJETA", "STORE_CREDIT", "MIXTO", "QR_MERCADOPAGO"];
      const index = parseInt(e.key) - 1;
      const selectedMethod = methods[index] as any;
      setPaymentMethod(selectedMethod);
      setCheckoutPhase("fill-fields");

      setTimeout(() => {
        const modal = checkoutModalRef.current;
        if (modal) {
          const firstInput = modal.querySelector<HTMLElement>(
            'input:not([readonly]):not([disabled]), select:not([disabled])'
          );
          if (firstInput) {
            firstInput.focus();
            if (firstInput instanceof HTMLInputElement) {
              firstInput.select();
            }
          } else if (selectedMethod === "MIXTO") {
            setMixedModalOpen(true);
          }
        }
      }, 50);
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      setCheckoutModalOpen(false);
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();

      if (checkoutPhase === "select-method") {
        // Avanzar a la fase de llenado: dar foco al primer input del panel de pago
        setCheckoutPhase("fill-fields");
        const modal = checkoutModalRef.current;
        if (modal) {
          const firstInput = modal.querySelector<HTMLElement>(
            'input:not([readonly]):not([disabled]), select:not([disabled])'
          );
          if (firstInput) {
            firstInput.focus();
            if (firstInput instanceof HTMLInputElement) {
              firstInput.select();
            }
          } else if (paymentMethod === "QR_MERCADOPAGO" || paymentMethod === "MIXTO") {
            // Para métodos sin input extra, disparar directo
            if (paymentMethod === "MIXTO") { setMixedModalOpen(true); }
            else { handleCheckoutSubmit(); }
          } else if (paymentMethod === "TARJETA") {
            handleCheckoutSubmit();
          }
        }
        return;
      }

      const active = document.activeElement;
      const isTyping = active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || (active as HTMLElement).isContentEditable);

      // Si es la fase fill-fields
      if (isTyping) {
        if (paymentMethod === "EFECTIVO" && active instanceof HTMLInputElement) {
          const val = Number(active.value) || 0;
          const netTotal = cartTotal - pointsDiscount;
          if (val < netTotal) {
            setCheckoutFieldErrors((prev) => ({
              ...prev,
              cashReceived: "El efectivo recibido es menor al total a pagar."
            }));
            active.focus();
            active.select();
            return;
          }
        } else if (paymentMethod === "STORE_CREDIT" && active instanceof HTMLInputElement) {
          if (!active.value.trim()) {
            setCheckoutFieldErrors((prev) => ({
              ...prev,
              storeCreditCode: "El código de vale es requerido."
            }));
            active.focus();
            return;
          }
        }
      }
      if (paymentMethod === "MIXTO") {
        setMixedModalOpen(true);
      } else {
        handleCheckoutSubmit();
      }
    }
  };

  return (
    <div style={styles.appContainer} className="pos-cashier-app" data-pos-view="sales-terminal">
      <KeyboardShortcutsManager onToast={onToast} />
      <div className="pos-shortcut-registry" aria-hidden="true">
        {(Object.entries(GLOBAL_QUICK_ACTIONS) as [GlobalQuickActionLetter, string][]).map(([letter, actionId]) => (
          <button
            key={letter}
            type="button"
            tabIndex={-1}
            data-shortcut-global={letter}
            onClick={() => handleGlobalQuickAction(actionId)}
          />
        ))}
      </div>
      <style>{TICKET_PRINT_MEDIA_STYLES}</style>

      {/* Header Terminal — Light mode corporativo */}
      <header className="pos-terminal-navbar">
        <div className="pos-terminal-navbar-left">
          {/* Toggle sidebar */}
          <button
            type="button"
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className="pos-terminal-menu-btn active-tap"
            data-shortcut-key="F7"
            title={isSidebarCollapsed ? "Mostrar panel (F7)" : "Ocultar panel (F7)"}
            aria-label="Alternar panel lateral"
          >
            <Menu size={18} />
            <span className="pos-fkey-badge">F7</span>
          </button>
          <span className="pos-terminal-brand-text">POS</span>

          {/* Sucursal */}
          <div className="pos-terminal-chip hide-on-mobile">
            <MapPin size={12} />
            <span>{user?.branch?.name || "Sucursal"}</span>
          </div>

          {/* Modal Detalles Header Móvil */}
          {isMobileHeaderModalOpen && (
            <div
              className="pos-modal-overlay active-tap"
              onClick={() => setIsMobileHeaderModalOpen(false)}
              style={{ zIndex: 9999 }}
            >
              <div
                className="pos-mobile-session-card card-premium"
                onClick={(e) => e.stopPropagation()}
                style={{
                  width: "min(92vw, 600px)",
                  padding: "0",
                  overflow: "hidden",
                  borderRadius: "12px",
                }}
              >
                {/* Header de la card */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", borderBottom: "1px solid var(--pos-border)" }}>
                  <h3 style={{ margin: 0, fontSize: "14px", fontWeight: "800", color: "var(--pos-text)", textTransform: "uppercase", letterSpacing: "0.4px" }}>Resumen de Sesión</h3>
                  <button onClick={() => setIsMobileHeaderModalOpen(false)} style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--pos-text-muted)", display: "flex", alignItems: "center" }}>
                    <XCircle size={20} />
                  </button>
                </div>

                {/* Body dividido en 2 columnas */}
                <div style={{ display: "flex", flexDirection: "row", gap: 0 }}>

                  {/* Columna 1: Cajero */}
                  <div style={{ flex: 1, padding: "16px 18px", borderRight: "1px solid var(--pos-border)", display: "flex", flexDirection: "column", gap: "12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <div className="pos-terminal-avatar" style={{ width: "36px", height: "36px", fontSize: "14px", flexShrink: 0 }}>
                        {(user?.name || "C").charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: "800", fontSize: "13px", color: "var(--pos-text)" }}>{user?.name || "Cajero"}</div>
                        <div style={{ fontSize: "10px", color: "var(--pos-text-muted)", fontWeight: "600" }}>{user?.branch?.name || "Sucursal"}</div>
                      </div>
                    </div>

                    <div
                      className={`pos-terminal-session-badge active-tap ${session?.status === "ABIERTA" || session?.status === "active" ? "open" : "closed"}`}
                      style={{ cursor: "pointer", alignSelf: "flex-start", fontSize: "11px", padding: "3px 10px" }}
                      onClick={() => { setIsMobileHeaderModalOpen(false); onOpenModal("shift-summary"); }}
                    >
                      {session?.status === "ABIERTA" || session?.status === "active" ? "CAJA ABIERTA" : "CAJA CERRADA"}
                    </div>

                    {sessionStats && (
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px", padding: "6px 8px", background: "var(--pos-surface-2)", borderRadius: "6px", border: "1px solid var(--pos-border)" }}>
                          <span style={{ color: "var(--pos-text-muted)", fontWeight: "600" }}>Fondo inicial:</span>
                          <span style={{ fontWeight: "700", color: "var(--pos-text)", fontVariantNumeric: "tabular-nums" }}>$***.**</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px", padding: "6px 8px", background: "var(--pos-green-soft)", borderRadius: "6px", border: "1px solid rgba(21,128,61,0.2)" }}>
                          <span style={{ color: "var(--pos-green)", fontWeight: "600" }}>En caja:</span>
                          <span style={{ fontWeight: "800", color: "var(--pos-green)", fontVariantNumeric: "tabular-nums" }}>$***.**</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Columna 2: Resumen de turno */}
                  <div style={{ flex: 1, padding: "16px 18px", display: "flex", flexDirection: "column", gap: "10px" }}>
                    <div style={{ fontSize: "10px", fontWeight: "800", color: "var(--pos-text-muted)", textTransform: "uppercase", letterSpacing: "0.4px" }}>Turno actual</div>

                    {sessionStats ? (
                      <>
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px", padding: "6px 8px", background: "var(--pos-surface-2)", borderRadius: "6px", border: "1px solid var(--pos-border)" }}>
                            <span style={{ color: "var(--pos-text-muted)", fontWeight: "600" }}>Ventas:</span>
                            <span style={{ fontWeight: "800", color: "var(--pos-blue)", fontVariantNumeric: "tabular-nums" }}>{sessionStats.salesCount}</span>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px", padding: "6px 8px", background: "var(--pos-blue-soft)", borderRadius: "6px", border: "1px solid var(--pos-blue-light)" }}>
                            <span style={{ color: "var(--pos-blue)", fontWeight: "600" }}>Total vendido:</span>
                            <span style={{ fontWeight: "800", color: "var(--pos-blue)", fontVariantNumeric: "tabular-nums" }}>$***.**</span>
                          </div>
                        </div>

                        <button
                          className="pos-btn-pause"
                          onClick={() => { setIsMobileHeaderModalOpen(false); onOpenModal("shift-summary"); }}
                          style={{ marginTop: "auto", fontSize: "11px", padding: "8px 10px" }}
                        >
                          Ver resumen completo
                        </button>
                      </>
                    ) : (
                      <div style={{ color: "var(--pos-text-muted)", fontSize: "12px", textAlign: "center", paddingTop: "16px" }}>Sin datos de sesión</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Botón de detalles solo móvil */}
          <button
            type="button"
            className="pos-terminal-menu-btn active-tap show-on-mobile"
            onClick={() => setIsMobileHeaderModalOpen(true)}
            style={{ marginLeft: "auto" }}
            aria-label="Ver detalles de caja"
          >
            <Clock size={16} />
          </button>
        </div>

        {/* Centro: en tablet/móvil solo muestra el badge de estado (click abre modal).
            En desktop/laptop muestra todo: cajero + estado + cash info */}
        <div className="pos-terminal-navbar-center hide-on-mobile">
          {/* Solo el badge — visible en tablet/móvil al hacer click */}
          <div
            className={`pos-terminal-session-badge active-tap pos-session-badge-tablet-only ${
              session?.status === "ABIERTA" || session?.status === "active" ? "open" : "closed"
            }`}
            style={{ cursor: "pointer", userSelect: "none" }}
            onClick={() => setIsMobileHeaderModalOpen(true)}
            title="Ver detalles de caja"
          >
            {session?.status === "ABIERTA" || session?.status === "active" ? "CAJA ABIERTA" : "CAJA CERRADA"}
          </div>

          {/* Resto de info — visible solo en laptop/desktop */}
          <div className="pos-navbar-center-full">
            <div className="pos-terminal-user-btn">
              <div className="pos-terminal-avatar">
                {(user?.name || "C").charAt(0).toUpperCase()}
              </div>
              <span className="pos-terminal-user-name">{user?.name || "Cajero"}</span>
            </div>

            {/* Estado de caja + Totales inline */}
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginLeft: "16px" }}>
              <div 
                className={`pos-terminal-session-badge active-tap ${
                  session?.status === "ABIERTA" || session?.status === "active" ? "open" : "closed"
                }`}
                style={{ cursor: "pointer", userSelect: "none" }}
                onClick={() => onOpenModal("shift-summary")}
                title="Ver detalles de caja"
              >
                {session?.status === "ABIERTA" || session?.status === "active" ? "CAJA ABIERTA" : "CAJA CERRADA"}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <HeaderCashInfo sessionStats={sessionStats} onOpenSummary={() => onOpenModal("shift-summary")} />
                
                {sessionStats && sessionStats.salesCount > 0 && (
                  <div className="pos-terminal-chip sales-count" style={{ display: "flex", alignItems: "center", height: "28px" }}>
                    {sessionStats.salesCount} {sessionStats.salesCount === 1 ? "venta" : "ventas"}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="pos-terminal-navbar-right">
          {/* Toggle modo claro/oscuro */}
          <button
            type="button"
            onClick={togglePosTheme}
            className="pos-terminal-menu-btn active-tap hide-on-mobile"
            title={theme === "dark" ? "Modo claro" : "Modo oscuro"}
            aria-label={theme === "dark" ? "Activar modo claro" : "Activar modo oscuro"}
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          {/* Reloj */}
          <div className="pos-terminal-chip clock">
            <Clock size={12} />
            <span>{formattedTime}</span>
          </div>
        </div>
      </header>

      {/* Subheader móvil: cajero + estado de caja (solo visible en tablet/móvil) */}
      <div className="pos-mobile-subheader">
        <div className="pos-mobile-subheader-user">
          <div className="pos-terminal-avatar" style={{ width: "22px", height: "22px", fontSize: "10px" }}>
            {(user?.name || "C").charAt(0).toUpperCase()}
          </div>
          <span className="pos-mobile-subheader-user-name">{user?.name || "Cajero"}</span>
        </div>
        <div
          className={`pos-terminal-session-badge active-tap ${
            session?.status === "ABIERTA" || session?.status === "active" ? "open" : "closed"
          }`}
          style={{ fontSize: "10px", padding: "2px 8px" }}
          onClick={() => onOpenModal("shift-summary")}
        >
          {session?.status === "ABIERTA" || session?.status === "active" ? "CAJA ABIERTA" : "CAJA CERRADA"}
        </div>
      </div>

      {/* Cuerpo Terminal */}
      <SalesLayoutView
        recentSales={recentSales}
        onOpenModal={(modal) => {
          setIsSidebarCollapsed(true);
          if (modal === "promotions") {
            setIsPromotionsModalOpen(true);
          } else {
            onOpenModal(modal);
          }
        }}
        onLock={() => {
          setIsSidebarCollapsed(true);
          if (onLock) onLock();
        }}
        onReprintTicket={onReprintTicket}
        onStartReturn={onStartReturn}
        isSidebarCollapsed={isSidebarCollapsed}
        setIsSidebarCollapsed={setIsSidebarCollapsed}
        cartData={cartData}
        onToast={onToast}
      >
        <div className="pos-main-layout-container">
          
          <div className="pos-cart-col">
            <div className="card-premium" style={{ display: "flex", flexWrap: "wrap", gap: "16px", flexShrink: 0, alignItems: "center", padding: "12px 16px", minHeight: "44px" }}>
              <div style={{ flex: "1 1 200px", minWidth: "200px" }}>
                <ProductSearchPanel
                  searchData={searchData}
                  cartData={cartData}
                />
              </div>
              <div style={{ width: "1px", backgroundColor: "var(--border-strong)", height: "28px" }} className="hide-on-mobile" />
              <div style={{ flex: "1 1 250px", minWidth: "250px" }}>
                <div style={{ width: "100%" }}>
                  <CustomerCheckoutBar customerData={customerData} cartData={cartData} onToast={onToast} />
                </div>
              </div>
            </div>

            <div className="card-premium pos-cashier-cart-card" style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", padding: "14px", gap: "10px" }}>
              <CartPanel cartData={cartData} onToast={onToast} />
              <div className="hide-on-mobile">
                <PromotionsGrid cart={cartData.cart} onAddProduct={cartData.addProductToCart} onToast={onToast} cartDiscount={cartData.cartDiscount} />
              </div>
            </div>
          </div>

          <div className="card-premium pos-checkout-col">
            <CheckoutPanel
              cartData={cartData}
              searchData={searchData}
              pendingQrSales={pendingQrSales}
              pendingQrChecking={pendingQrChecking}
              checkPendingQrStatus={checkPendingQrStatus}
              setPendingCancelFieldErrors={setPendingCancelFieldErrors}
              setViewingPendingQrSale={setViewingPendingQrSale}
              onOpenCheckout={() => setCheckoutModalOpen(true)}
              onParkSale={handleParkSale}
              parkedSales={parkedSales}
              onRecoverParkedSale={async (sale) => {
                try {
                  const parsedCart = JSON.parse(sale.cartData);
                  cartData.setCart(parsedCart);
                  if (sale.customer && customerData.setSelectedCustomer) {
                    customerData.setSelectedCustomer(sale.customer as any);
                  } else if (customerData.setSelectedCustomer) {
                    customerData.setSelectedCustomer(null);
                  }
                  await deleteParkedSale(sale.id);
                  onToast("Venta recuperada", "success");
                } catch(e: any) {
                  onToast(e.message, "error");
                }
              }}
              onDeleteParkedSale={async (id) => {
                try {
                  await deleteParkedSale(id);
                  onToast("Venta en espera eliminada", "success");
                } catch(e: any) {
                  onToast(e.message, "error");
                }
              }}
            />
          </div>
        </div>
      </SalesLayoutView>


      <MixedPaymentModal
        isOpen={mixedModalOpen}
        onClose={() => setMixedModalOpen(false)}
        totalToPay={cartTotal - (usePoints ? pointsDiscount : 0)}
        onConfirm={(payments, totalCash) => {
          setMixedModalOpen(false);
          handleCheckoutSubmit(payments, totalCash);
        }}
      />

      {/* COBRO MODAL */}
      {checkoutModalOpen && (
        <div style={styles.modalOverlay} className="pos-cashier-modal-overlay pos-cashier-modal-overlay--center" data-pos-modal>
          <div ref={checkoutModalRef} style={styles.checkoutModal} className="pos-cashier-modal" onKeyDown={handleCheckoutModalKeyDown} tabIndex={-1}>
            <h3 style={{ textAlign: "center", textTransform: "uppercase", fontSize: "14px", color: "var(--text-secondary)", fontWeight: "700" }}>COBRO</h3>
            <div style={styles.checkoutTotalBox} className="pos-cashier-checkout-total">
              $ {(cartTotal - pointsDiscount).toFixed(2)}
            </div>

            {pointsDiscount > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: "#059669", fontWeight: "700", padding: "0 4px", marginTop: "-8px" }}>
                <span>Descuento de Puntos:</span>
                <span>-${pointsDiscount.toFixed(2)} MXN</span>
              </div>
            )}

            <div style={{ ...styles.paymentMethodsGrid, gridTemplateColumns: "repeat(5, 1fr)" }} className="pos-cashier-pay-methods">
              <button
                type="button"
                data-method-btn="EFECTIVO"
                onClick={() => { setPaymentMethod("EFECTIVO"); setCheckoutError(null); setCheckoutFieldErrors({}); }}
                style={{ ...styles.paymentMethodBtn, ...(paymentMethod === "EFECTIVO" ? styles.paymentMethodBtnActive : {}) }}
              >
                <Banknote size={20} />
                <span>EFECTIVO</span>
                <span className="pos-fkey-badge" style={{ position: "absolute", bottom: "-4px", right: "-4px", fontSize: "8px", padding: "1px 3px" }}>Alt+1</span>
              </button>
              <button
                type="button"
                data-method-btn="TARJETA"
                onClick={() => { setPaymentMethod("TARJETA"); setCheckoutError(null); setCheckoutFieldErrors({}); }}
                style={{ ...styles.paymentMethodBtn, ...(paymentMethod === "TARJETA" ? styles.paymentMethodBtnActive : {}) }}
              >
                <CreditCard size={20} />
                <span>TARJETA</span>
                <span className="pos-fkey-badge" style={{ position: "absolute", bottom: "-4px", right: "-4px", fontSize: "8px", padding: "1px 3px" }}>Alt+2</span>
              </button>
              <button
                type="button"
                data-method-btn="STORE_CREDIT"
                onClick={() => { setPaymentMethod("STORE_CREDIT"); setCheckoutError(null); setCheckoutFieldErrors({}); }}
                style={{ ...styles.paymentMethodBtn, ...(paymentMethod === "STORE_CREDIT" ? styles.paymentMethodBtnActive : {}) }}
              >
                <Ticket size={20} />
                <span>VALE</span>
                <span className="pos-fkey-badge" style={{ position: "absolute", bottom: "-4px", right: "-4px", fontSize: "8px", padding: "1px 3px" }}>Alt+3</span>
              </button>
              <button
                type="button"
                data-method-btn="MIXTO"
                onClick={() => { setPaymentMethod("MIXTO"); setCheckoutError(null); setCheckoutFieldErrors({}); }}
                style={{ ...styles.paymentMethodBtn, ...(paymentMethod === "MIXTO" ? styles.paymentMethodBtnActive : {}) }}
              >
                <ArrowLeftRight size={20} />
                <span>MIXTO</span>
                <span className="pos-fkey-badge" style={{ position: "absolute", bottom: "-4px", right: "-4px", fontSize: "8px", padding: "1px 3px" }}>Alt+4</span>
              </button>
              <button
                type="button"
                data-method-btn="QR_MERCADOPAGO"
                onClick={() => { setPaymentMethod("QR_MERCADOPAGO"); setCheckoutError(null); setCheckoutFieldErrors({}); }}
                style={{ ...styles.paymentMethodBtn, ...(paymentMethod === "QR_MERCADOPAGO" ? styles.paymentMethodBtnActive : {}) }}
              >
                <QrCode size={20} />
                <span>QR MP</span>
                <span className="pos-fkey-badge" style={{ position: "absolute", bottom: "-4px", right: "-4px", fontSize: "8px", padding: "1px 3px" }}>Alt+5</span>
              </button>
            </div>

            {paymentMethod === "EFECTIVO" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginTop: "14px" }}>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Pagó Con:</label>
                  <input
                    type="text"
                    className="input-corporate"
                    placeholder="Ingrese cantidad recibida"
                    value={cashReceived}
                    inputMode="decimal"
                    onChange={(e) => {
                      const rawValue = e.target.value.trim();
                      if (rawValue && !DECIMAL_INPUT_REGEX.test(rawValue)) {
                        setCheckoutFieldErrors((prev) => ({ ...prev, cashReceived: "El monto recibido debe ser un numero valido con maximo 3 decimales." }));
                        return;
                      }
                      handleDecimalInputChange(rawValue, setCashReceived);
                      setCheckoutFieldErrors((prev) => ({ ...prev, cashReceived: "" }));
                      setCheckoutError(null);
                    }}
                  />
                  {checkoutFieldErrors.cashReceived && <p style={styles.fieldError}>{checkoutFieldErrors.cashReceived}</p>}
                </div>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Su Cambio:</label>
                  <input type="text" readOnly className="input-corporate" style={{ backgroundColor: "var(--surface-3)", fontWeight: "700", color: "var(--text)" }} value={`$ ${calculatedChange.toFixed(2)}`} />
                </div>
              </div>
            )}

            {paymentMethod === "TARJETA" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginTop: "14px" }}>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Tipo de Tarjeta:</label>
                  <select value={cardType} onChange={(e) => setCardType(e.target.value as "CREDITO" | "DEBITO")} style={styles.select}>
                    <option value="DEBITO">Débito</option>
                    <option value="CREDITO">Crédito</option>
                  </select>
                </div>
                <div style={{ padding: "10px 0", textAlign: "center", color: "var(--text-muted)" }}>
                  <p>Solicite que inserte la tarjeta en la terminal bancaria.</p>
                  <p style={{ fontWeight: "600", color: "var(--accent-strong)", marginTop: "8px" }}>NIP requerido en terminal física.</p>
                </div>
              </div>
            )}

            {paymentMethod === "STORE_CREDIT" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginTop: "14px" }}>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Código de Vale:</label>
                  <input
                    type="text"
                    className="input-corporate"
                    placeholder="Ej. VALE-123456"
                    value={storeCreditCode}
                    onChange={(e) => {
                      setStoreCreditCode(e.target.value.toUpperCase());
                      setCheckoutFieldErrors((prev) => ({ ...prev, storeCreditCode: "" }));
                      setCheckoutError(null);
                    }}
                  />
                  {checkoutFieldErrors.storeCreditCode && <p style={styles.fieldError}>{checkoutFieldErrors.storeCreditCode}</p>}
                </div>
              </div>
            )}

            {paymentMethod === "MIXTO" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "14px" }}>
                <p style={{ color: "var(--text-muted)", fontSize: "14px", textAlign: "center", marginBottom: "8px" }}>
                  Configura múltiples métodos de pago (Efectivo, Tarjeta, Saldo a Favor) para cubrir el total de la compra.
                </p>
                <button
                  type="button"
                  title="Configurar pagos mixtos"
                  onClick={() => setMixedModalOpen(true)}
                  style={{ ...styles.modalBtn, backgroundColor: "#2563eb", color: "white" }}
                >
                  Configurar Pagos Mixtos
                </button>
              </div>
            )}

            {/* Sección de Puntos de Lealtad */}
            {selectedCustomer && (
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: "14px", marginTop: "10px", display: "flex", flexDirection: "column", gap: "8px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <label style={{ ...styles.label, display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", margin: 0 }} data-shortcut-letter="B" title="Usar puntos (Alt+B)">
                    <input
                      type="checkbox"
                      checked={usePoints}
                      onChange={(e) => {
                        setUsePoints(e.target.checked);
                        if (!e.target.checked) {
                          setPointsToRedeem(0);
                          setCheckoutFieldErrors((prev) => {
                            const next = { ...prev };
                            delete next.pointsToRedeem;
                            return next;
                          });
                        }
                      }}
                    />
                    <span>¿Usar Puntos? <span style={{ fontSize: "9px", backgroundColor: "rgba(0,0,0,0.08)", color: "var(--text-secondary)", padding: "1px 4px", borderRadius: "3px", fontWeight: "800", marginLeft: "4px" }}>Alt+B</span></span>
                  </label>
                  <span style={{ fontSize: "12px", color: "var(--text-muted)", fontWeight: "600" }}>
                    Disponibles: <strong style={{ color: "#166534" }}>{selectedCustomer.points}</strong> pts
                  </span>
                </div>
                {usePoints && (
                  <>
                    <div style={{ display: "flex", gap: "10px", alignItems: "center", marginTop: "4px" }}>
                      <div style={{ flex: 1 }}>
                        <input
                          ref={pointsInputRef}
                          type="number"
                          min={0}
                          max={Math.min(selectedCustomer.points, Math.floor(cartTotal))}
                          className="input-corporate"
                          placeholder="Puntos a canjear"
                          value={pointsToRedeem || ""}
                          onChange={(e) => {
                            const val = Math.max(0, parseInt(e.target.value) || 0);
                            const maxVal = Math.min(selectedCustomer.points, Math.floor(cartTotal));
                            if (val > maxVal) {
                              setPointsToRedeem(maxVal);
                              onToast(`El canje máximo es de ${maxVal} puntos.`, "info");
                            } else {
                              setPointsToRedeem(val);
                            }
                            setCheckoutError(null);
                            setCheckoutFieldErrors((prev) => {
                              const next = { ...prev };
                              delete next.pointsToRedeem;
                              return next;
                            });
                          }}
                        />
                      </div>
                      <span style={{ fontSize: "13px", color: "#059669", fontWeight: "700" }}>
                        Descuento: -${(Math.min(selectedCustomer.points, pointsToRedeem) * 1.0).toFixed(2)}
                      </span>
                    </div>
                    {checkoutFieldErrors.pointsToRedeem && (
                      <p style={styles.fieldError}>{checkoutFieldErrors.pointsToRedeem}</p>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Sección de Facturación CFDI */}
            {selectedCustomer && (
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: "14px", marginTop: "10px", display: "flex", flexDirection: "column", gap: "8px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <label style={{ ...styles.label, display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", margin: 0 }} data-shortcut-letter="F" title="Solicitar factura (Alt+F)">
                    <input type="checkbox" checked={invoiceRequested} onChange={(e) => { setInvoiceRequested(e.target.checked); }} />
                    <span>¿Solicitar Factura CFDI? <span style={{ fontSize: "9px", backgroundColor: "rgba(0,0,0,0.08)", color: "var(--text-secondary)", padding: "1px 4px", borderRadius: "3px", fontWeight: "800", marginLeft: "4px" }}>Alt+F</span></span>
                  </label>
                  <span style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: "600" }}>Se enviará al correo registrado</span>
                </div>
              </div>
            )}

            {checkoutError && (
              <div style={{ backgroundColor: "#fef2f2", border: "1px solid #fca5a5", color: "#b91c1c", padding: "10px 12px", borderRadius: "6px", fontSize: "13px", fontWeight: "600", display: "flex", alignItems: "center", gap: "8px", marginTop: "16px" }}>
                <AlertTriangle size={16} color="#b91c1c" />
                <span>{checkoutError}</span>
              </div>
            )}

            {checkoutLoading && (
              <div style={{ backgroundColor: "#eff6ff", border: "1px solid #93c5fd", color: "#1d4ed8", padding: "10px 12px", borderRadius: "6px", fontSize: "13px", fontWeight: "600", display: "flex", alignItems: "center", gap: "10px", marginTop: "16px" }}>
                <div className="pos-cashier-loading-spinner" style={{ width: "16px", height: "16px", borderWidth: "2px", flexShrink: 0 }} />
                <span>Procesando el cobro... Si la venta incluye facturación o puntos puede tardar un poco más. No cierre esta ventana.</span>
              </div>
            )}

            <div style={{ display: "flex", gap: "10px", marginTop: "24px" }} className="pos-cashier-modal-actions">
              <button title="Cancelar (X)" data-shortcut="cancel" data-shortcut-letter="X" disabled={checkoutLoading} onClick={() => setCheckoutModalOpen(false)} style={{ ...styles.modalBtn, backgroundColor: "#dc2626", color: "white" }}>
                CANCELAR
              </button>
              <button
                title="Cobrar (Alt+C)"
                data-shortcut="confirm"
                data-shortcut-letter="C"
                disabled={checkoutLoading}
                onClick={() => {
                  if (paymentMethod === "MIXTO") {
                    setMixedModalOpen(true);
                  } else {
                    handleCheckoutSubmit();
                  }
                }}
                style={{ ...styles.modalBtn, backgroundColor: "#059669", color: "white", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}
              >
                {checkoutLoading && (
                  <div className="pos-cashier-loading-spinner" style={{ width: "14px", height: "14px", borderWidth: "2px", borderColor: "rgba(255,255,255,0.4)", borderTopColor: "#ffffff", flexShrink: 0 }} />
                )}
                {checkoutLoading ? "PROCESANDO..." : paymentMethod === "MIXTO" ? "CONFIGURAR PAGOS" : "COBRAR"}
                <span style={{ fontSize: "9px", backgroundColor: "rgba(255,255,255,0.2)", color: "white", padding: "1px 4px", borderRadius: "3px", fontWeight: "800", marginLeft: "2px" }}>Alt+C</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL QR MERCADO PAGO */}
      {qrModalOpen && (
        <div style={styles.modalOverlay} className="pos-cashier-modal-overlay pos-cashier-modal-overlay--center" data-pos-modal>
          <div style={styles.checkoutModal} className="pos-cashier-modal">
            <h3 style={{ textAlign: "center", textTransform: "uppercase", fontSize: "14px", color: "var(--text-secondary)", fontWeight: "700" }}>PAGO QR MERCADO PAGO</h3>
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <p style={{ marginBottom: "10px", fontSize: "14px", color: "var(--text-secondary)" }}>Escanea el siguiente código para pagar <strong>${cartTotal.toFixed(2)}</strong></p>
              {qrUrl ? (
                <>
                  <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrUrl)}`} alt="QR Code" width="200" height="200" loading="lazy" />
                  <div style={{ marginTop: "12px" }}>
                    <a href={qrUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: "12px", color: "var(--accent)", textDecoration: "none", fontWeight: "600", display: "inline-flex", alignItems: "center", gap: "6px", padding: "8px 12px", backgroundColor: "var(--surface-3)", borderRadius: "6px", border: "1px solid var(--border-strong)" }}>
                      <ExternalLink size={14} />
                      <span>Abrir enlace de pago / Sandbox</span>
                    </a>
                  </div>
                </>
              ) : (
                <p>Generando QR...</p>
              )}
              <p style={{ marginTop: "12px", fontSize: "12px", color: "var(--text-muted)" }}>Ref: {qrReference}</p>
            </div>
            <div style={{ display: "flex", gap: "10px", marginTop: "24px" }} className="pos-cashier-modal-actions">
                <button disabled={qrChecking} onClick={addPendingQrSale} data-shortcut="cancel" data-shortcut-letter="X" style={{ ...styles.modalBtn, backgroundColor: "#dc2626", color: "white" }}>
                  CERRAR (PAGO PENDIENTE)
                </button>
                <button
                  disabled={qrChecking}
                  onClick={checkQrStatus}
                  data-shortcut="confirm"
                  data-shortcut-action="verify-payment"
                  data-shortcut-letter="W"
                  // eslint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus
                  title="Verificar estado (Alt+W, Enter)"
                  style={{ ...styles.modalBtn, backgroundColor: "#059669", color: "white", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}
                >
                  {qrChecking && <div className="pos-cashier-loading-spinner" style={{ width: "14px", height: "14px", borderWidth: "2px", borderColor: "rgba(255,255,255,0.4)", borderTopColor: "#ffffff", flexShrink: 0 }} />}
                  {qrChecking ? "VERIFICANDO..." : "VERIFICAR ESTADO"}
                </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: REGISTRO RÁPIDO DE CLIENTE */}
      {isNewCustomerModalOpen && (
        <div style={styles.modalOverlay} className="pos-cashier-modal-overlay pos-cashier-modal-overlay--center" data-pos-modal>
          <div style={styles.checkoutModal} className="pos-cashier-modal">
            <h3 style={{ textAlign: "center", textTransform: "uppercase", fontSize: "14px", color: "var(--text-secondary)", fontWeight: "700" }}>
              REGISTRO RÁPIDO DE CLIENTE
            </h3>
            <form onSubmit={handleRegisterCustomerSubmit} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Nombre Completo *</label>
                <input type="text" required className="input-corporate" placeholder="Ej. Juan Pérez" value={newCustomerForm.name} onChange={(e) => setNewCustomerField("name")(e.target.value)} />
                {newCustomerFieldErrors.name && <p style={styles.fieldError}>{newCustomerFieldErrors.name}</p>}
              </div>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Teléfono (10 dígitos) *</label>
                <input type="text" required className="input-corporate" placeholder="Ej. 5551234567" value={newCustomerForm.phone} onChange={(e) => setNewCustomerField("phone")(e.target.value)} />
                {newCustomerFieldErrors.phone && <p style={styles.fieldError}>{newCustomerFieldErrors.phone}</p>}
              </div>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Correo Electrónico (Opcional)</label>
                <input type="email" className="input-corporate" placeholder="Ej. cliente@correo.com" value={newCustomerForm.email} onChange={(e) => setNewCustomerField("email")(e.target.value)} />
                {newCustomerFieldErrors.email && <p style={styles.fieldError}>{newCustomerFieldErrors.email}</p>}
              </div>

              {newCustomerError && (
                <div style={{ backgroundColor: "#fef2f2", border: "1px solid #fca5a5", color: "#b91c1c", padding: "10px 12px", borderRadius: "6px", fontSize: "13px", fontWeight: "600", display: "flex", alignItems: "center", gap: "8px" }}>
                  <AlertTriangle size={16} color="#b91c1c" />
                  <span>{newCustomerError}</span>
                </div>
              )}

              <div style={{ display: "flex", gap: "10px", marginTop: "16px" }} className="pos-cashier-modal-actions">
              <button title="Cancelar (X)" data-shortcut="cancel" data-shortcut-letter="X" type="button" onClick={() => { setIsNewCustomerModalOpen(false); setNewCustomerFieldErrors({}); }} style={{ ...styles.modalBtn, backgroundColor: "#dc2626", color: "white" }}>
                CANCELAR
              </button>
              <button title="Registrar y seleccionar (R)" data-shortcut="confirm" data-shortcut-letter="R" type="submit" disabled={newCustomerLoading} style={{ ...styles.modalBtn, backgroundColor: "#059669", color: "white" }}>
                  {newCustomerLoading ? "Registrando..." : "REGISTRAR Y SELECCIONAR"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* MODAL: PROMOCIONES ACTIVAS */}
      {isPromotionsModalOpen && (
        <div style={styles.modalOverlay} className="pos-cashier-modal-overlay pos-cashier-modal-overlay--center" data-pos-modal onClick={() => setIsPromotionsModalOpen(false)}>
          <div style={{ ...styles.checkoutModal, width: "650px", maxWidth: "90vw" }} className="pos-cashier-modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ textAlign: "center", textTransform: "uppercase", fontSize: "14px", color: "var(--text-secondary)", fontWeight: "700", display: "flex", justifyContent: "space-between", alignItems: "center", margin: "0 0 16px 0" }}>
              PROMOCIONES ACTIVAS
              <button title="Cerrar (X)" type="button" onClick={() => setIsPromotionsModalOpen(false)} style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "4px" }}>
                <XCircle size={20} />
              </button>
            </h3>
            
            <div style={{ maxHeight: "60vh", overflowY: "auto", margin: "-10px -10px", padding: "10px" }}>
              <PromotionsGrid cart={cartData.cart} onAddProduct={cartData.addProductToCart} onToast={onToast} cartDiscount={cartData.cartDiscount} />
            </div>

            <div style={{ display: "flex", gap: "10px", marginTop: "16px" }} className="pos-cashier-modal-actions">
              <button title="Cerrar (X)" data-shortcut="cancel" data-shortcut-letter="X" type="button" onClick={() => setIsPromotionsModalOpen(false)} style={{ ...styles.modalBtn, backgroundColor: "#dc2626", color: "white" }}>
                CERRAR
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
