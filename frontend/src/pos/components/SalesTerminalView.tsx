import React from "react";
import { Menu, MapPin, User, Clock, LogOut, AlertTriangle, Home, Lock } from "lucide-react";
import { TICKET_PRINT_MEDIA_STYLES } from "../../shared/utils/ticketEmailDocument.util";
import { DECIMAL_INPUT_REGEX, handleDecimalInputChange } from "../../shared/utils/decimalInput";
import { useCashSession } from "../hooks/useCashSession";
import { usePosCart } from "../hooks/usePosCart";
import { usePosSearch } from "../hooks/usePosSearch";
import { usePosCustomer } from "../hooks/usePosCustomer";
import { ProductSearchPanel } from "./ProductSearchPanel";
import { CartPanel } from "./CartPanel";
import { CheckoutPanel } from "./CheckoutPanel";

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
  onToast: (msg: string, type?: "error" | "success" | "info") => void;
  pendingQrSales: any[];
  pendingQrChecking: string | null;
  checkPendingQrStatus: (invoiceNumber: string) => void;
  setPendingCancelFieldErrors: (errors: Partial<Record<"pin" | "reason", string>>) => void;
  setViewingPendingQrSale: (sale: any) => void;
  addPendingQrSale: () => void;
  onGoHome?: () => void;
  onLogout?: () => void;
  onLock?: () => void;
}

const styles: { [key: string]: React.CSSProperties } = {
  appContainer: { minHeight: "100vh", display: "flex", flexDirection: "column" as const, backgroundColor: "var(--surface-2)" },
  terminalHeader: { height: "56px", backgroundColor: "var(--surface)", borderBottom: "2px solid #3b82f6", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 24px" },
  terminalBackBtn: { width: "38px", height: "38px", borderRadius: "6px", border: "1px solid var(--border-strong)", backgroundColor: "var(--surface)", color: "var(--accent-strong)", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 2px rgba(15,23,42,0.06)" },
  terminalBody: { flex: 1, padding: "20px", display: "flex", flexDirection: "column" as const, gap: "16px" },
  modalOverlay: { position: "fixed" as const, top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(15, 23, 42, 0.4)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 100 },
  checkoutModal: { width: "420px", backgroundColor: "var(--surface)", borderRadius: "12px", padding: "28px", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)", display: "flex", flexDirection: "column" as const, gap: "16px" },
  checkoutTotalBox: { backgroundColor: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "8px", padding: "16px", fontSize: "36px", fontWeight: "800", color: "#dc2626", textAlign: "center" as const },
  payMethodsRow: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" },
  payMethodBtn: { padding: "12px 6px", borderRadius: "6px", border: "1px solid var(--border-strong)", backgroundColor: "var(--surface)", fontSize: "11px", fontWeight: "700", cursor: "pointer", textAlign: "center" as const },
  payMethodActive: { border: "1px solid #2563eb", backgroundColor: "#eff6ff", color: "#1d4ed8" },
  modalBtn: { flex: 1, padding: "10px", borderRadius: "6px", border: "none", fontWeight: "700", cursor: "pointer", textAlign: "center" as const },
  inputGroup: { display: "flex", flexDirection: "column" as const, gap: "6px", textAlign: "left" as const },
  label: { fontSize: "11px", fontWeight: "700", color: "var(--text-secondary)", textTransform: "uppercase" as const, letterSpacing: "0.5px" },
  select: { width: "100%", padding: "10px 12px", borderRadius: "6px", border: "1px solid var(--border-strong)", fontSize: "14px", backgroundColor: "var(--surface)", cursor: "pointer" },
  fieldError: { color: "#b91c1c", fontSize: "12px", fontWeight: "600", marginTop: "5px", marginBottom: 0 },
};

export function SalesTerminalView({
  sessionData: _sessionData,
  cartData,
  searchData,
  customerData,
  user,
  currentTime,
  onToast,
  pendingQrSales,
  pendingQrChecking,
  checkPendingQrStatus,
  setPendingCancelFieldErrors,
  setViewingPendingQrSale,
  addPendingQrSale,
  onGoHome,
  onLogout,
  onLock,
}: SalesTerminalViewProps) {
  const {
    checkoutModalOpen, setCheckoutModalOpen,
    checkoutLoading, checkoutError, checkoutFieldErrors, setCheckoutFieldErrors,
    paymentMethod, setPaymentMethod,
    cashReceived, setCashReceived, calculatedChange,
    cardType, setCardType,
    mixtoCard, setMixtoCard, mixtoCash, setMixtoCash,
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

  const [isSidebarCollapsed, setIsSidebarCollapsed] = React.useState(false);

  const formattedTime = currentTime
    ? currentTime.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: true })
    : "";

  return (
    <div style={styles.appContainer} className="pos-cashier-app">
      <style>{TICKET_PRINT_MEDIA_STYLES}</style>

      {/* Header Terminal — nuevo diseño de Fer */}
      <header className="pos-terminal-navbar">
        <div className="pos-terminal-navbar-left">
          <button
            type="button"
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className="pos-terminal-menu-btn active-tap"
            title={isSidebarCollapsed ? "Mostrar panel" : "Ocultar panel"}
            aria-label="Alternar panel lateral"
          >
            <Menu size={20} />
          </button>
          <span className="pos-terminal-brand-text">POS - Punto de Venta</span>
        </div>

        <div className="pos-terminal-navbar-right">
          <div className="pos-terminal-chip">
            <MapPin size={14} />
            <span>{user?.branch?.name || "Sucursal"}</span>
          </div>
          <div className="pos-terminal-chip">
            <User size={14} />
            <span>Cajero: {user?.name || "—"}</span>
          </div>
          <div className="pos-terminal-chip clock">
            <Clock size={14} />
            <span>{formattedTime}</span>
          </div>
          {onGoHome && (
            <button
              type="button"
              onClick={onGoHome}
              className="pos-terminal-home-btn active-tap"
              title="Ir al inicio"
              aria-label="Ir al dashboard"
            >
              <Home size={16} />
            </button>
          )}
          {onLock && (
            <button
              type="button"
              onClick={onLock}
              className="pos-terminal-lock-btn active-tap"
              title="Bloquear pantalla"
              aria-label="Bloquear sesión"
            >
              <Lock size={16} />
            </button>
          )}
          <button
            type="button"
            onClick={onLogout}
            className="pos-terminal-logout-btn active-tap"
            title="Cerrar Sesión"
            aria-label="Cerrar sesión del cajero"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* Cuerpo Terminal */}
      <div style={styles.terminalBody} className="pos-cashier-terminal-body">
        <ProductSearchPanel
          searchData={searchData}
          customerData={customerData}
          cartData={cartData}
          onToast={onToast}
        />

        <div className="card-premium pos-cashier-cart-card" style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", padding: "20px" }}>
          <h3 className="pos-cashier-cart-mobile-title">Detalle de Productos</h3>
          <CartPanel cartData={cartData} onToast={onToast} />
          <CheckoutPanel
            cartData={cartData}
            pendingQrSales={pendingQrSales}
            pendingQrChecking={pendingQrChecking}
            checkPendingQrStatus={checkPendingQrStatus}
            setPendingCancelFieldErrors={setPendingCancelFieldErrors}
            setViewingPendingQrSale={setViewingPendingQrSale}
            onOpenCheckout={() => setCheckoutModalOpen(true)}
          />
        </div>
      </div>

      {/* COBRO MODAL */}
      {checkoutModalOpen && (
        <div style={styles.modalOverlay} className="pos-cashier-modal-overlay pos-cashier-modal-overlay--center">
          <div style={styles.checkoutModal} className="pos-cashier-modal">
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

            {/* Selector Métodos Pago */}
            <div style={styles.payMethodsRow} className="pos-cashier-pay-methods">
              <button onClick={() => { setPaymentMethod("EFECTIVO"); setCheckoutError(null); setCheckoutFieldErrors({}); }} style={{ ...styles.payMethodBtn, ...(paymentMethod === "EFECTIVO" ? styles.payMethodActive : {}) }}>
                💵 EFECTIVO
              </button>
              <button onClick={() => { setPaymentMethod("TARJETA"); setCheckoutError(null); setCheckoutFieldErrors({}); }} style={{ ...styles.payMethodBtn, ...(paymentMethod === "TARJETA" ? styles.payMethodActive : {}) }}>
                💳 TARJETA
              </button>
              <button onClick={() => { setPaymentMethod("MIXTO"); setCheckoutError(null); setCheckoutFieldErrors({}); }} style={{ ...styles.payMethodBtn, ...(paymentMethod === "MIXTO" ? styles.payMethodActive : {}) }}>
                ⚖️ MIXTO
              </button>
              <button onClick={() => { setPaymentMethod("QR_MERCADOPAGO"); setCheckoutError(null); setCheckoutFieldErrors({}); }} style={{ ...styles.payMethodBtn, ...(paymentMethod === "QR_MERCADOPAGO" ? styles.payMethodActive : {}) }}>
                📱 QR MP
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

            {paymentMethod === "MIXTO" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "14px" }}>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Tipo de Tarjeta:</label>
                  <select value={cardType} onChange={(e) => setCardType(e.target.value as "CREDITO" | "DEBITO")} style={styles.select}>
                    <option value="DEBITO">Débito</option>
                    <option value="CREDITO">Crédito</option>
                  </select>
                </div>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Monto con Tarjeta ($):</label>
                  <input
                    type="text"
                    className="input-corporate"
                    value={mixtoCard}
                    inputMode="decimal"
                    onChange={(e) => {
                      const rawValue = e.target.value.trim();
                      if (rawValue && !DECIMAL_INPUT_REGEX.test(rawValue)) {
                        setCheckoutFieldErrors((prev) => ({ ...prev, mixtoCard: "El monto con tarjeta debe ser un numero valido con maximo 3 decimales." }));
                        return;
                      }
                      handleDecimalInputChange(rawValue, setMixtoCard);
                      setCheckoutFieldErrors((prev) => ({ ...prev, mixtoCard: "" }));
                      setCheckoutError(null);
                    }}
                  />
                  {checkoutFieldErrors.mixtoCard && <p style={styles.fieldError}>{checkoutFieldErrors.mixtoCard}</p>}
                </div>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Monto con Efectivo ($):</label>
                  <input
                    type="text"
                    className="input-corporate"
                    value={mixtoCash}
                    inputMode="decimal"
                    onChange={(e) => {
                      const rawValue = e.target.value.trim();
                      if (rawValue && !DECIMAL_INPUT_REGEX.test(rawValue)) {
                        setCheckoutFieldErrors((prev) => ({ ...prev, mixtoCash: "El monto con efectivo debe ser un numero valido con maximo 3 decimales." }));
                        return;
                      }
                      handleDecimalInputChange(rawValue, setMixtoCash);
                      setCheckoutFieldErrors((prev) => ({ ...prev, mixtoCash: "" }));
                      setCheckoutError(null);
                    }}
                  />
                  {checkoutFieldErrors.mixtoCash && <p style={styles.fieldError}>{checkoutFieldErrors.mixtoCash}</p>}
                </div>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Cambio en Efectivo ($):</label>
                  <input type="text" readOnly className="input-corporate" style={{ backgroundColor: "var(--surface-3)", fontWeight: "700" }} value={`$ ${calculatedChange.toFixed(2)}`} />
                </div>
              </div>
            )}

            {/* Sección de Puntos de Lealtad */}
            {selectedCustomer && (
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: "14px", marginTop: "10px", display: "flex", flexDirection: "column", gap: "8px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <label style={{ ...styles.label, display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", margin: 0 }}>
                    <input
                      type="checkbox"
                      checked={usePoints}
                      onChange={(e) => { setUsePoints(e.target.checked); if (!e.target.checked) setPointsToRedeem(0); }}
                    />
                    <span>¿Usar Puntos?</span>
                  </label>
                  <span style={{ fontSize: "12px", color: "var(--text-muted)", fontWeight: "600" }}>
                    Disponibles: <strong style={{ color: "#166534" }}>{selectedCustomer.points}</strong> pts
                  </span>
                </div>
                {usePoints && (
                  <div style={{ display: "flex", gap: "10px", alignItems: "center", marginTop: "4px" }}>
                    <div style={{ flex: 1 }}>
                      <input
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
                        }}
                      />
                    </div>
                    <span style={{ fontSize: "13px", color: "#059669", fontWeight: "700" }}>
                      Descuento: -${(Math.min(selectedCustomer.points, pointsToRedeem) * 1.0).toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Sección de Facturación CFDI */}
            {selectedCustomer && (
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: "14px", marginTop: "10px", display: "flex", flexDirection: "column", gap: "8px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <label style={{ ...styles.label, display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", margin: 0 }}>
                    <input type="checkbox" checked={invoiceRequested} onChange={(e) => { setInvoiceRequested(e.target.checked); }} />
                    <span>¿Solicitar Factura CFDI?</span>
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
              <button disabled={checkoutLoading} onClick={() => setCheckoutModalOpen(false)} style={{ ...styles.modalBtn, backgroundColor: "#dc2626", color: "white" }}>
                CANCELAR
              </button>
              <button
                disabled={checkoutLoading}
                onClick={handleCheckoutSubmit}
                style={{ ...styles.modalBtn, backgroundColor: "#059669", color: "white", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}
              >
                {checkoutLoading && (
                  <div className="pos-cashier-loading-spinner" style={{ width: "14px", height: "14px", borderWidth: "2px", borderColor: "rgba(255,255,255,0.4)", borderTopColor: "#ffffff", flexShrink: 0 }} />
                )}
                {checkoutLoading ? "PROCESANDO..." : "COBRAR"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL QR MERCADO PAGO */}
      {qrModalOpen && (
        <div style={styles.modalOverlay} className="pos-cashier-modal-overlay pos-cashier-modal-overlay--center">
          <div style={styles.checkoutModal} className="pos-cashier-modal">
            <h3 style={{ textAlign: "center", textTransform: "uppercase", fontSize: "14px", color: "var(--text-secondary)", fontWeight: "700" }}>PAGO QR MERCADO PAGO</h3>
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <p style={{ marginBottom: "10px", fontSize: "14px", color: "var(--text-secondary)" }}>Escanea el siguiente código para pagar <strong>${cartTotal.toFixed(2)}</strong></p>
              {qrUrl ? (
                <>
                  <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrUrl)}`} alt="QR Code" width="200" height="200" loading="lazy" />
                  <div style={{ marginTop: "12px" }}>
                    <a href={qrUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: "12px", color: "#2563eb", textDecoration: "underline", fontWeight: "600", display: "inline-block", padding: "6px 12px", backgroundColor: "var(--surface-3)", borderRadius: "6px" }}>
                      🔗 Abrir enlace de pago / Sandbox
                    </a>
                  </div>
                </>
              ) : (
                <p>Generando QR...</p>
              )}
              <p style={{ marginTop: "12px", fontSize: "12px", color: "var(--text-muted)" }}>Ref: {qrReference}</p>
            </div>
            <div style={{ display: "flex", gap: "10px", marginTop: "24px" }} className="pos-cashier-modal-actions">
              <button disabled={qrChecking} onClick={addPendingQrSale} style={{ ...styles.modalBtn, backgroundColor: "#dc2626", color: "white" }}>
                CERRAR (PAGO PENDIENTE)
              </button>
              <button
                disabled={qrChecking}
                onClick={checkQrStatus}
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
        <div style={styles.modalOverlay} className="pos-cashier-modal-overlay pos-cashier-modal-overlay--center">
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
                <button type="button" onClick={() => { setIsNewCustomerModalOpen(false); setNewCustomerFieldErrors({}); }} style={{ ...styles.modalBtn, backgroundColor: "#dc2626", color: "white" }}>
                  CANCELAR
                </button>
                <button type="submit" disabled={newCustomerLoading} style={{ ...styles.modalBtn, backgroundColor: "#059669", color: "white" }}>
                  {newCustomerLoading ? "Registrando..." : "REGISTRAR Y SELECCIONAR"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
