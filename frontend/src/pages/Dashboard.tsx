import React, { useState, useEffect } from "react";
import "../pos-cashier-responsive.css";
import { useAuth } from "../context/AuthContext";
import {
  PriceLookupModal,
  CancelSaleModal,
  CloseOptionsModal,
  PartialCutSummaryModal,
  TicketViewModal,
  PartialCutReceiptModal,
  CloseCashModal,
  DepositReceiptModal,
  CloseReceiptModal,
  TicketHistoryModal,
  BankDepositModal,
  ReturnsModal,
} from "../components/pos";
import api from "../services/api";
import { useCashSession } from "../hooks/pos/useCashSession";
import { usePosCustomer } from "../hooks/pos/usePosCustomer";
import { usePosCart } from "../hooks/pos/usePosCart";
import { usePosSearch } from "../hooks/pos/usePosSearch";
import {
  printTicketElementById,
  TICKET_PRINT_MEDIA_STYLES,
  ticketPdfFilename,
} from "../utils/ticketEmailDocument.util";
import { generateTicketPdfBase64 } from "../utils/ticketPdf.util";
import AdminDashboard from "./AdminDashboard";
import {
  DECIMAL_INPUT_REGEX,
  handleDecimalInputChange,
} from "../utils/decimalInput";
import {
  normalizeIntegerInput,
  validateInteger,
  validateReference,
} from "../utils/formValidation";
import { 
  LogOut, 
  Store, 
  Users, 
  Plus, 
  Minus, 
  BadgePercent,
  Search,
  Printer,
  XCircle,
  PiggyBank,
  AlertTriangle,
  FileText,
  RotateCcw,
  Mail,
  ArrowLeft,
  MoreVertical
} from "lucide-react";

interface Product {
  id: number;
  sku: string;
  barcode: string;
  name: string;
  description: string;
  costPrice: number;
  sellPrice: number;
  stock: number;
  minStock: number;
  activePromotion?: {
    id: number;
    name: string;
    type: string;
    value: number | null;
    minQuantity: number | null;
    payQuantity: number | null;
    specialPrice: number | null;
  } | null;
}

interface Sale {
  id: number;
  invoiceNumber: string;
  createdAt: string;
  totalAmount: number;
  paymentMethod: string;
  cardType?: string;
  status: string;
  cajero: string;
  refundStatus?: string | null;
}

const validateTextInput = (value: string): string =>
  value
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, "")
    .replace(/[^\p{L}\p{N}\s\-,.]/gu, "");

const validateReasonInput = (value: string): string =>
  value
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, "")
    .replace(/[^a-záéíóúàèìòùäëïöüâêîôûñçA-ZÁÉÍÓÚÀÈÌÒÙÄËÏÖÜÂÊÎÔÛÑÇ0-9\s.,]/g, "");

const validateFolioInput = (value: string): string =>
  value
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, "")
    .replace(/[^a-zA-Z0-9\-]/g, "");

const Dashboard: React.FC = () => {
  const { user, logout } = useAuth();

  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);
  
  // Vistas del Cajero: "dashboard" | "apertura" | "sales-terminal"
  const [view, setView] = useState<"dashboard" | "apertura" | "sales-terminal">("dashboard");
  // Bloqueo: el turno de caja del usuario está abierto en otro equipo
  const [cajaLockedByOtherDevice, setCajaLockedByOtherDevice] = useState(false);
  const [loading, setLoading] = useState(true);

  // Estado para filas expandidas en tablas responsive
  const [expandedSalesRows, setExpandedSalesRows] = useState<Set<number>>(new Set());
  const [expandedDepositRows, setExpandedDepositRows] = useState<Set<number>>(new Set());
  const [openDashboardTableMenu, setOpenDashboardTableMenu] = useState<string | null>(null);
  const [dashboardTicketLoadingId, setDashboardTicketLoadingId] = useState<number | null>(null);

  // Modales de Acción Rápida: null | "price-lookup" | "ticket-history" | "cancel-sale" | "close-cash" | "bank-deposit" | "close-options" | "partial-cut-summary" | "partial-cut-receipt"
  const [activeModal, setActiveModal] = useState<string | null>(null);


  // Estados para alertas personalizadas y cobro (Fase 3.5)
  const [toast, setToast] = useState<{ message: string; type: "error" | "success" | "info" } | null>(null);

  const showToast = (message: string, type: "error" | "success" | "info" = "error") => {
    setToast({ message, type });
  };

  const {
    session,
    sessionStats,
    lastClosedStats,
    setLastClosedStats,
    recentSales,
    recentDeposits,
    initialFund,
    setInitialFund,
    initialFundError,
    setInitialFundError,
    openingLoading,
    partialCutLoading,
    partialCutData,
    setPartialCutData,
    declaredCash,
    setDeclaredCash,
    declaredCashError,
    setDeclaredCashError,
    closingLoading,
    calculatedDifference,
    loadDashboardData,
    handleOpenCash,
    handleCloseShift,
    handleSavePartialCut,
  } = useCashSession({
    user,
    onToast: showToast,
    onSetView: setView,
    onSetLoading: setLoading,
    onSetCajaLockedByOtherDevice: setCajaLockedByOtherDevice,
    onSetActiveModal: setActiveModal,
  });

  const {
    selectedCustomer,
    setSelectedCustomer,
    customerSearch,
    setCustomerSearch,
    customerSearchError,
    customerSearchResults,
    setCustomerSearchResults,
    isCustomerDropdownOpen,
    setIsCustomerDropdownOpen,
    isNewCustomerModalOpen,
    setIsNewCustomerModalOpen,
    newCustomerForm,
    setNewCustomerForm,
    setNewCustomerField,
    newCustomerFieldErrors,
    setNewCustomerFieldErrors,
    newCustomerLoading,
    newCustomerError,
    setNewCustomerError,
    handleRegisterCustomerSubmit,
  } = usePosCustomer({ onToast: showToast, view });

  const [selectedSale, setSelectedSale] = useState<any>(null);

  const {
    cart,
    setCart,
    showDraftConfirm,
    setShowDraftConfirm,
    cartQtyDraft,
    setCartQtyDraft,
    DRAFT_KEY,
    setPendingCartAction,
    cartPin,
    setCartPin,
    cartPinError,
    setCartPinError,
    cartPinLoading,
    setSimulationData,
    checkoutModalOpen,
    setCheckoutModalOpen,
    checkoutLoading,
    checkoutError,
    setCheckoutError,
    checkoutFieldErrors,
    setCheckoutFieldErrors,
    paymentMethod,
    setPaymentMethod,
    cashReceived,
    setCashReceived,
    mixtoCash,
    setMixtoCash,
    mixtoCard,
    setMixtoCard,
    cardType,
    setCardType,
    pointsToRedeem,
    setPointsToRedeem,
    usePoints,
    setUsePoints,
    invoiceRequested,
    setInvoiceRequested,
    qrModalOpen,
    setQrModalOpen,
    qrUrl,
    setQrUrl,
    qrReference,
    setQrReference,
    qrChecking,
    cartSubtotalOriginal,
    cartDiscount,
    cartSubtotal,
    cartTax,
    cartTotal,
    taxBreakdown,
    pointsDiscount,
    calculatedChange,
    loadDraft,
    clearCartAndDraft,
    addProductToCart,
    updateCartQty,
    applyCartQty,
    removeCartItem,
    handleCancelCurrentPurchase,
    handleCartPinSubmit,
    handleCheckoutSubmit,
    checkQrStatus,
    isQrExpired,
  } = usePosCart({
    user,
    selectedCustomer,
    onToast: showToast,
    onSetSelectedSale: setSelectedSale,
    onSetSelectedCustomer: setSelectedCustomer,
    onSetActiveModal: setActiveModal,
    onCancelSale: resetCurrentSaleAndReturnToDashboard,
  });

  const {
    lookupQuery,
    setLookupQuery,
    lookupResults,
    barcodeSearch,
    setBarcodeSearch,
    barcodeSearchError,
    searchResults,
    setSearchResults,
    handleLookupKeyDown,
    handleProductBarcodeSearch,
    resetLookup,
    resetSearch,
  } = usePosSearch({
    view,
    activeModal,
    onProductFound: addProductToCart,
  });

  function resetCurrentSaleAndReturnToDashboard() {
    clearCartAndDraft();
    resetSearch();
    setSimulationData(null);
    setCheckoutError(null);
    setCheckoutModalOpen(false);
    setSelectedCustomer(null);
    setCustomerSearch("");
    setCustomerSearchResults([]);
    setIsCustomerDropdownOpen(false);
    setIsNewCustomerModalOpen(false);
    setNewCustomerError(null);
    setUsePoints(false);
    setPointsToRedeem(0);
    setPaymentMethod("EFECTIVO");
    setCashReceived("");
    setMixtoCash("");
    setMixtoCard("");
    setCardType("DEBITO");
    setQrModalOpen(false);
    setQrUrl("");
    setQrReference("");
    setCartPin("");
    setCartPinError("");
    setPendingCartAction(null);
    setActiveModal(null);
    setView("dashboard");
  }

  const handleLogoutClick = () => {
    if (session && session.status === "ABIERTA" && user?.role === "CAJERO") {
      showToast("No puede cerrar sesión si tiene un turno de caja activo. Por favor realice su Cierre de Caja primero.", "error");
      return;
    }
    logout();
  };

  // Funciones helper para toggle filas expandidas en tablas responsive
  const toggleSalesRow = (saleId: number) => {
    setExpandedSalesRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(saleId)) {
        newSet.delete(saleId);
      } else {
        newSet.add(saleId);
      }
      return newSet;
    });
  };

  const toggleDepositRow = (depositId: number) => {
    setExpandedDepositRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(depositId)) {
        newSet.delete(depositId);
      } else {
        newSet.add(depositId);
      }
      return newSet;
    });
  };

  const handleOpenDashboardSaleTicket = async (sale: Sale) => {
    if (dashboardTicketLoadingId !== null) return;

    setOpenDashboardTableMenu(null);
    setDashboardTicketLoadingId(sale.id);
    try {
      const res = await api.get(`/api/sales/detail?id=${sale.id}`);
      setSelectedSale({
        ...res.data.sale,
        refundStatus: sale.refundStatus,
        isNewSale: false
      });
      setActiveModal("ticket-view");
    } catch (e: any) {
      showToast(e.response?.data?.message || "Error al recuperar los detalles de la venta.", "error");
    } finally {
      setDashboardTicketLoadingId(null);
    }
  };

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Componente de notificación flotante Toast (Fase 3.5)
  const renderToast = () => {
    if (!toast) return null;
    const isError = toast.type === "error";
    const isSuccess = toast.type === "success";
    const bg = isError ? "#fef2f2" : isSuccess ? "#f0fdf4" : "#f0f9ff";
    const border = isError ? "#fca5a5" : isSuccess ? "#bbf7d0" : "#bae6fd";
    const textColor = isError ? "#991b1b" : isSuccess ? "#166534" : "#075985";
    
    return (
      <div 
        className="toast-premium"
        style={{
          position: "fixed",
          bottom: "24px",
          right: "24px",
          backgroundColor: bg,
          border: `1px solid ${border}`,
          borderRadius: "10px",
          padding: "16px 20px",
          boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)",
          color: textColor,
          display: "flex",
          alignItems: "center",
          gap: "10px",
          zIndex: 99999,
          maxWidth: "360px",
          fontWeight: "600",
          fontSize: "14px"
        }}
      >
        <AlertTriangle size={18} color={textColor} />
        <span>{toast.message}</span>
      </div>
    );
  };

  const renderDashboardTicketLoading = () => {
    if (dashboardTicketLoadingId === null) return null;

    return (
      <div className="pos-cashier-loading-overlay">
        <div className="pos-cashier-loading-box">
          <div className="pos-cashier-loading-spinner" />
          <span>Cargando operación...</span>
        </div>
      </div>
    );
  };

  // ---------------------------------------------------------------------------
  // 4. TERMINAL DE VENTAS (Mockup 5)
  // ---------------------------------------------------------------------------

  const renderCartAuthorizationModal = () => {
    if (activeModal !== "cart-pin-auth") return null;

    return (
      <div style={styles.modalOverlay} className="pos-cashier-modal-overlay pos-cashier-modal-overlay--center">
        <div style={{ ...styles.cancelModal, width: "380px" }} className="pos-cashier-modal">
          <h3 style={styles.modalTitle}>Autorización de Gerente/Admin</h3>
          <p style={{ fontSize: "12px", color: "#64748b", margin: "8px 0 16px 0", textAlign: "center" }}>
            Esta operación requiere la autorización de un Administrador o Gerente. Ingrese la contraseña o clave de autorización.
          </p>

          <form onSubmit={handleCartPinSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={styles.inputGroup}>
              <label htmlFor="cartAuthorizationPassword" style={styles.label}>Contraseña de autorización:</label>
              <input
                id="cartAuthorizationPassword"
                autoFocus
                type="password"
                required
                className="input-corporate"
                placeholder="Contraseña o clave"
                value={cartPin}
                onChange={(e) => {
                  setCartPin(e.target.value);
                  if (cartPinError) setCartPinError("");
                }}
                autoComplete="off"
              />
            </div>

            {cartPinError && (
              <p style={{ fontSize: "12px", color: "#dc2626", fontWeight: "600", margin: 0, textAlign: "center" }}>
                {cartPinError}
              </p>
            )}

            <div style={{ display: "flex", gap: "10px", marginTop: "4px" }} className="pos-cashier-modal-actions">
              <button
                type="button"
                onClick={() => {
                  setPendingCartAction(null);
                  setCartPin("");
                  setCartPinError("");
                  setActiveModal(null);
                }}
                style={{ ...styles.modalBtn, backgroundColor: "#64748b", color: "white" }}
              >
                CANCELAR
              </button>
              <button
                type="submit"
                disabled={cartPinLoading || !cartPin}
                style={{
                  ...styles.modalBtn,
                  backgroundColor: cartPin ? "#1e3a8a" : "#cbd5e1",
                  color: "white",
                  cursor: cartPin ? "pointer" : "default",
                }}
              >
                {cartPinLoading ? "Validando..." : "AUTORIZAR"}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  // Envío de ticket por correo
  const [ticketEmailModalOpen, setTicketEmailModalOpen] = useState(false);
  const [ticketEmailInput, setTicketEmailInput] = useState("");
  const [ticketEmailError, setTicketEmailError] = useState("");
  const [ticketEmailLoading, setTicketEmailLoading] = useState(false);
  const [ticketEmailSubject, setTicketEmailSubject] = useState("");
  const [ticketEmailElementId, setTicketEmailElementId] = useState<string | null>(null);
  const [ticketEmailHtml, setTicketEmailHtml] = useState<string | null>(null);


  // Función auxiliar para calcular las promociones de una línea del carrito
  const calculateItemPromotion = (item: { product: Product; quantity: number }) => {
    const promo = item.product.activePromotion;
    const originalPrice = item.product.sellPrice;
    const quantity = item.quantity;
    const subtotalOriginal = originalPrice * quantity;

    if (!promo) {
      return { finalPrice: originalPrice, discountAmount: 0, label: "" };
    }

    let discountAmount = 0;
    let finalPrice = originalPrice;

    // Verificar minQuantity para TODOS los tipos de promoción
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

    return {
      finalPrice,
      discountAmount,
      label: promoApplied ? promo.name : "",
      promoApplied,
    };
  };

  // ---------------------------------------------------------------------------
  // 5. MODAL COBRO (Mockup 4)
  // ---------------------------------------------------------------------------

  // ---------------------------------------------------------------------------
  // 6. TICKET DE VENTA (Mockup 3)
  // ---------------------------------------------------------------------------
  const handlePrintTicket = () => {
    const title = selectedSale?.invoiceNumber ? `Ticket ${selectedSale.invoiceNumber}` : "Ticket";
    const printed = printTicketElementById(title, "print-area");
    if (!printed) {
      alert("Habilite las ventanas emergentes para imprimir el ticket.");
    }
  };

  const isValidTicketEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const openTicketEmailModal = (config: {
    subject: string;
    elementId?: string;
    htmlContent?: string;
    defaultEmail?: string | null;
  }) => {
    setTicketEmailSubject(config.subject);
    setTicketEmailElementId(config.elementId || null);
    setTicketEmailHtml(config.htmlContent || null);
    setTicketEmailInput(config.defaultEmail?.trim() || "");
    setTicketEmailError("");
    setTicketEmailModalOpen(true);
  };

  const handleSendTicketEmail = async () => {
    const email = ticketEmailInput.trim();
    if (!email) {
      setTicketEmailError("Ingrese un correo electrónico.");
      return;
    }
    if (!isValidTicketEmail(email)) {
      setTicketEmailError("Formato de correo electrónico inválido (ej: usuario@empresa.com).");
      return;
    }

    setTicketEmailLoading(true);
    setTicketEmailError("");
    try {
      const pdfBase64 = await generateTicketPdfBase64({
        elementId: ticketEmailElementId || undefined,
        innerHtml: ticketEmailHtml || undefined,
      });

      const res = await api.post("/api/sales/send-ticket-email", {
        email,
        subject: ticketEmailSubject,
        pdfBase64,
        pdfFilename: ticketPdfFilename(ticketEmailSubject),
      });
      showToast(res.data.message, "success");
      setTicketEmailModalOpen(false);
    } catch (err: any) {
      const msg =
        (err.response?.status === 413
          ? "El comprobante es demasiado grande para enviar. Intente de nuevo o contacte al administrador."
          : null) ||
        err.response?.data?.message ||
        err.message ||
        "Error al enviar el ticket por correo.";
      setTicketEmailError(msg);
      showToast(msg, "error");
    } finally {
      setTicketEmailLoading(false);
    }
  };

  const renderTicketEmailModal = () => {
    if (!ticketEmailModalOpen) return null;
    return (
      <div style={{ ...styles.modalOverlay, zIndex: 100000 }} className="pos-cashier-modal-overlay pos-cashier-modal-overlay--center">
        <div
          style={{ ...styles.cancelModal, width: "420px" }}
          className="pos-cashier-modal"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 style={styles.modalTitle}>Enviar ticket por correo</h3>
          <p style={{ fontSize: "13px", color: "#475569", margin: "12px 0 16px 0", lineHeight: 1.5 }}>
            Ingrese o confirme el correo electrónico del destinatario. El ticket se enviará como PDF adjunto con el mismo diseño de impresión.
          </p>
          <div style={styles.inputGroup}>
            <label style={styles.label}>Correo electrónico *</label>
            <input
              type="email"
              className="input-corporate"
              placeholder="cliente@correo.com"
              value={ticketEmailInput}
              onChange={(e) => {
                setTicketEmailInput(e.target.value);
                if (ticketEmailError) setTicketEmailError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !ticketEmailLoading) handleSendTicketEmail();
              }}
              autoFocus
            />
          </div>
          {ticketEmailError && (
            <p style={{ fontSize: "12px", color: "#dc2626", fontWeight: 600, marginBottom: "12px" }}>
              {ticketEmailError}
            </p>
          )}
          <div style={{ display: "flex", gap: "10px" }} className="pos-cashier-modal-actions">
            <button
              onClick={() => {
                setTicketEmailModalOpen(false);
                setTicketEmailError("");
              }}
              style={{ ...styles.modalBtn, backgroundColor: "#64748b", color: "white" }}
              disabled={ticketEmailLoading}
            >
              Cancelar
            </button>
            <button
              onClick={handleSendTicketEmail}
              style={{ ...styles.modalBtn, backgroundColor: "#2563eb", color: "white" }}
              disabled={ticketEmailLoading}
            >
              {ticketEmailLoading ? "Enviando..." : "Enviar correo"}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderTicketEmailButton = (emailConfig: {
    subject: string;
    elementId?: string;
    htmlContent?: string;
    defaultEmail?: string | null;
  }) => (
    <button
      onClick={() => openTicketEmailModal(emailConfig)}
      style={{ ...styles.modalBtn, backgroundColor: "#2563eb", color: "white" }}
    >
      <Mail size={16} /> ENVIAR
    </button>
  );

  const renderTicketActionButtons = (options: {
    onClose: () => void;
    closeLabel?: string;
    onPrint: () => void;
    printLabel?: string;
    emailConfig: {
      subject: string;
      elementId?: string;
      htmlContent?: string;
      defaultEmail?: string | null;
    };
  }) => (
    <div style={{ display: "flex", gap: "10px", marginTop: "20px" }} className="pos-cashier-modal-actions no-print" data-no-ticket-print="true">
      <button onClick={options.onClose} style={{ ...styles.modalBtn, backgroundColor: "#dc2626", color: "white" }}>
        {options.closeLabel || "CERRAR"}
      </button>
      {renderTicketEmailButton(options.emailConfig)}
      <button onClick={options.onPrint} style={{ ...styles.modalBtn, backgroundColor: "#059669", color: "white" }}>
        <Printer size={16} /> {options.printLabel || "IMPRIMIR"}
      </button>
    </div>
  );

  const handleCloseTicket = () => {
    const wasNewSale = selectedSale?.isNewSale;
    const fromPendingQrId = selectedSale?.fromPendingQrId;
    setSelectedSale(null);
    setActiveModal(null);
    // Si el ticket venía de un QR pendiente, eliminar el registro de la lista al cerrar
    if (fromPendingQrId) {
      setPendingQrSales(prev => {
        const updated = prev.filter(sale => sale.id !== fromPendingQrId);
        localStorage.setItem(QR_KEY, JSON.stringify(updated));
        return updated;
      });
    }
    if (wasNewSale) {
      setView("sales-terminal");
      clearCartAndDraft();
      setPaymentMethod("EFECTIVO");
      setCashReceived("");
      setMixtoCash("");
      setMixtoCard("");
    }
    loadDashboardData();
  };

  const handleCloseLookup = () => {
    setActiveModal(null);
    resetLookup();
  };

  // ---------------------------------------------------------------------------
  // 7. SOLICITUD DE CANCELACIÓN (Mockup 1)
  // ---------------------------------------------------------------------------
  const [cancelInvoice, setCancelInvoice] = useState("");
  const [cancelPin, setCancelPin] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [cancelFieldErrors, setCancelFieldErrors] = useState<Partial<Record<"invoice" | "pin" | "reason", string>>>({});
  const [cancelLoading, setCancelLoading] = useState(false);

  // Estado para previsualización de ticket a cancelar (Fase 3.8)
  const [cancelSalePreview, setCancelSalePreview] = useState<any>(null);

  // Efecto para previsualizar la venta que se solicita cancelar
  useEffect(() => {
    const invoice = cancelInvoice.trim();
    if (!invoice || invoice.length < 5) {
      setCancelSalePreview(null);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await api.get(`/api/sales/detail?invoiceNumber=${invoice}`);
        setCancelSalePreview(res.data.sale);
      } catch (err) {
        setCancelSalePreview(null);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [cancelInvoice]);

  const validateCancelFields = () => {
    const errors: Partial<Record<"invoice" | "pin" | "reason", string>> = {};
    const invoiceError = validateReference(cancelInvoice, "El folio de venta", { required: true, max: 40 });
    if (invoiceError) errors.invoice = invoiceError;
    const pinError = validateInteger(cancelPin, "El PIN", { min: 0 });
    if (pinError || cancelPin.length !== 4) errors.pin = "El PIN debe contener 4 digitos.";
    const reasonError = validateReference(cancelReason, "El motivo", { required: true, max: 180 });
    if (reasonError) errors.reason = reasonError;
    return errors;
  };

  const setCancelField = (field: "invoice" | "pin" | "reason", value: string) => {
    const nextValue =
      field === "pin" ? normalizeIntegerInput(value).slice(0, 4) :
      field === "invoice" ? validateFolioInput(value) :
      field === "reason" ? validateReasonInput(value) :
      value;
    if (field === "invoice") setCancelInvoice(nextValue);
    if (field === "pin") setCancelPin(nextValue);
    if (field === "reason") setCancelReason(nextValue);
    setCancelFieldErrors((prev) => {
      const next = { ...prev };
      const error =
        field === "invoice"
          ? validateReference(nextValue, "El folio de venta", { required: true, max: 40 })
          : field === "pin"
            ? (validateInteger(nextValue, "El PIN", { min: 0 }) || nextValue.length !== 4 ? "El PIN debe contener 4 digitos." : undefined)
            : validateReference(nextValue, "El motivo", { required: true, max: 180 });
      if (error) next[field] = error;
      else delete next[field];
      return next;
    });
  };

  const handleCancelSaleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors = validateCancelFields();
    if (Object.keys(errors).length > 0) {
      setCancelFieldErrors(errors);
      return;
    }
    setCancelLoading(true);
    try {
      const res = await api.post("/api/sales/authorize-cancel", {
        invoiceNumber: cancelInvoice,
        pinCode: cancelPin,
        reason: cancelReason,
      });
      showToast(res.data.message, "success");
      handleCloseModal_cancelSale();
      await loadDashboardData();
    } catch (err: any) {
      showToast(err.response?.data?.message || "Error de autorización o folio inválido.");
    } finally {
      setCancelLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // LIMPIEZA DE ESTADO AL CERRAR MODALES (NO VENTAS)
  // ---------------------------------------------------------------------------
  const handleCloseModal_cancelSale = () => {
    setActiveModal(null);
    setCancelInvoice("");
    setCancelPin("");
    setCancelReason("");
    setCancelFieldErrors({});
    setCancelSalePreview(null);
  };

  const handleCloseModal_closeCash = () => {
    setActiveModal(null);
    setDeclaredCash("");
    setDeclaredCashError("");
    if (lastClosedStats) {
      setLastClosedStats(null);
      logout();
    }
  };

  const handleCloseModal_partialCut = () => {
    setActiveModal(null);
    setPartialCutData(null);
  };

  // Handler para el botón "Nueva Venta" con confirmación de borrador
  const handleNuevaVenta = () => {
    const draft = loadDraft();
    if (draft.length > 0 && cart.length === 0) {
      // Hay borrador guardado pero el carrito actual está vacío, restaurar
      setCart(draft);
      setView("sales-terminal");
    } else if (draft.length > 0 || cart.length > 0) {
      // Hay borrador/carrito activo, preguntar
      setShowDraftConfirm(true);
    } else {
      setView("sales-terminal");
    }
  };

  // ---------------------------------------------------------------------------
  // 9. DEPOSITOS BANCARIOS (Resguardo de Efectivo)
  // ---------------------------------------------------------------------------
  const [lastDeposit, setLastDeposit] = useState<any>(null);

  const handleSyncDepositForReceipt = async (id: number): Promise<void> => {
    try {
      const res = await api.post(`/api/sales/deposits/${id}/sync`);
      showToast(res.data.message || "Depósito sincronizado.", "success");
      if (lastDeposit?.id === id) {
        setLastDeposit(res.data.deposit);
      }
      await loadDashboardData();
    } catch (err: any) {
      showToast(err.response?.data?.message || "Error al sincronizar el depósito.");
    }
  };

  // ---------------------------------------------------------------------------
  // 9.5 PAGOS PENDIENTES QR MERCADO PAGO
  // ---------------------------------------------------------------------------
  const QR_KEY = user?.id ? `pendingQrSales_${user.id}` : "pendingQrSales";
  const [pendingQrSales, setPendingQrSales] = useState<any[]>(() => {
    const saved = localStorage.getItem(QR_KEY);
    return saved ? JSON.parse(saved) : [];
  });
  const [pendingQrChecking, setPendingQrChecking] = useState<string | null>(null);
  const [viewingPendingQrSale, setViewingPendingQrSale] = useState<any | null>(null);
  const [pendingCancelPin, setPendingCancelPin] = useState("");
  const [pendingCancelReason, setPendingCancelReason] = useState("");
  const [pendingCancelFieldErrors, setPendingCancelFieldErrors] = useState<Partial<Record<"pin" | "reason", string>>>({});
  const [pendingCancelLoading, setPendingCancelLoading] = useState(false);

  // Sincronizar pagos QR pendientes cuando cambie el usuario autenticado
  useEffect(() => {
    if (user?.id) {
      const saved = localStorage.getItem(`pendingQrSales_${user.id}`);
      setPendingQrSales(saved ? JSON.parse(saved) : []);
    } else {
      setPendingQrSales([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const addPendingQrSale = () => {
    if (!qrReference) return;
    
    const newPending = {
      id: Date.now(),
      invoiceNumber: qrReference,
      amount: cartTotal,
      date: new Date().toISOString(),
      qrUrl: qrUrl,
      items: [...cart],
      customer: selectedCustomer,
      status: "pending"
    };
    
    setPendingQrSales(prev => {
      const updated = [...prev, newPending];
      localStorage.setItem(QR_KEY, JSON.stringify(updated));
      return updated;
    });
    
    // Limpiar el carrito de compras
    setCart([]);
    setSelectedCustomer(null);
    setUsePoints(false);
    setPointsToRedeem(0);
    setInvoiceRequested(false);
    setCashReceived("");
    setPaymentMethod("EFECTIVO");
    setQrModalOpen(false);
  };

  const handleRegenerateQr = async (sale: any) => {
    try {
      const res = await api.post("/api/sales/retry-qr", {
        invoiceNumber: sale.invoiceNumber
      });

      if (res.data.success) {
        const updatedSale = {
          ...sale,
          qrUrl: res.data.initPoint,
          qrExpiresAt: res.data.expiresAt,
          status: "pending"
        };

        setPendingQrSales(prev => {
          const updated = prev.map(s => s.invoiceNumber === sale.invoiceNumber ? updatedSale : s);
          localStorage.setItem("pendingQrSales", JSON.stringify(updated));
          return updated;
        });

        setViewingPendingQrSale(updatedSale);
        showToast("El QR anterior venció. Se ha generado un nuevo código QR.", "success");
      } else {
        showToast("No se pudo regenerar el código QR.");
      }
    } catch (err: any) {
      showToast("Error al regenerar el QR: " + (err.response?.data?.message || err.message));
    }
  };

  const checkPendingQrStatus = async (invoiceNumber: string) => {
    const salePending = pendingQrSales.find(s => s.invoiceNumber === invoiceNumber);
    if (isQrExpired(salePending)) {
      showToast("El código QR ha expirado. Por favor genera un nuevo código QR.");
      return;
    }
    setPendingQrChecking(invoiceNumber);
    try {
      const res = await api.get(`/api/mercadopago/status/${invoiceNumber}`);
      
      if (res.data.status === "approved") {
        await api.post("/api/sales/confirm-qr", {
          invoiceNumber,
          paymentId: res.data.paymentId || `mock-${Date.now()}`
        });

        // Obtener el objeto completo del sale pendiente para mostrar el ticket
        const salePending = pendingQrSales.find(s => s.invoiceNumber === invoiceNumber);

        // Cerrar el modal de QR si estaba abierto
        setViewingPendingQrSale(null);
        setPendingCancelPin("");
        setPendingCancelReason("");
        setPendingCancelFieldErrors({});

        // Mostrar directamente el ticket de impresión
        if (salePending) {
          try {
            const saleDetailRes = await api.get(`/api/sales/detail?invoiceNumber=${invoiceNumber}`);
            setSelectedSale({
              ...saleDetailRes.data.sale,
              isNewSale: false,          // No limpiar carrito al cerrar
              fromPendingQrId: salePending.id  // Para eliminar de la lista al cerrar el ticket
            });
          } catch {
            setSelectedSale({
              invoiceNumber: salePending.invoiceNumber,
              items: salePending.items,
              total: salePending.amount,
              paymentMethod: "QR_MERCADOPAGO",
              cashReceived: 0,
              changeGiven: 0,
              createdAt: salePending.date,
              isNewSale: false,
              fromPendingQrId: salePending.id
            });
          }
          setActiveModal("ticket-view");
        }

        showToast(`¡Pago de Venta ${invoiceNumber} aprobado!`, "success");
        await loadDashboardData();
      } else if (res.data.status === "rejected") {
        setPendingQrSales(prev => {
          const updated = prev.map(sale => 
            sale.invoiceNumber === invoiceNumber 
              ? { ...sale, status: "rejected" } 
              : sale
          );
          localStorage.setItem(QR_KEY, JSON.stringify(updated));
          return updated;
        });

        if (viewingPendingQrSale?.invoiceNumber === invoiceNumber) {
          setViewingPendingQrSale((prev: any) => prev ? { ...prev, status: "rejected" } : null);
        }

        showToast(`Pago de Venta ${invoiceNumber} rechazado.`);
      } else {
        showToast(`Venta ${invoiceNumber} sigue pendiente. Estado: ${res.data.status}`);
      }
    } catch (err: any) {
      showToast("Error al verificar: " + (err.response?.data?.message || err.message));
    } finally {
      setPendingQrChecking(null);
    }
  };

  const validatePendingCancelFields = () => {
    const errors: Partial<Record<"pin" | "reason", string>> = {};
    const pinError = validateInteger(pendingCancelPin, "El PIN", { min: 0 });
    if (pinError || pendingCancelPin.length !== 4) errors.pin = "El PIN debe contener 4 digitos.";
    const reasonError = validateReference(pendingCancelReason, "El motivo", { required: true, max: 180 });
    if (reasonError) errors.reason = reasonError;
    return errors;
  };

  const handlePendingCancelPinChange = (rawValue: string) => {
    const value = normalizeIntegerInput(rawValue).slice(0, 4);
    setPendingCancelPin(value);
    setPendingCancelFieldErrors((prev) => ({
      ...prev,
      pin:
        rawValue !== value
          ? "El PIN debe contener 4 digitos."
          : value.length === 4
            ? undefined
            : "El PIN debe contener 4 digitos.",
    }));
  };

  const handlePendingCancelReasonChange = (value: string) => {
    const filtered = validateReasonInput(value);
    setPendingCancelReason(filtered);
    setPendingCancelFieldErrors((prev) => ({
      ...prev,
      reason: validateReference(filtered, "El motivo", { required: true, max: 180 }),
    }));
  };

  const handlePendingQrCancel = async (actionType: "other_method" | "cancel_def" = "cancel_def") => {
    if (!viewingPendingQrSale) return;
    const errors = validatePendingCancelFields();
    setPendingCancelFieldErrors(errors);
    if (Object.values(errors).some(Boolean)) return;

    setPendingCancelLoading(true);
    try {
      const res = await api.post("/api/sales/authorize-cancel", {
        invoiceNumber: viewingPendingQrSale.invoiceNumber,
        pinCode: pendingCancelPin,
        reason: pendingCancelReason.trim(),
      });

      showToast(res.data.message, "success");
      setPendingQrSales(prev => {
        const updated = prev.filter(sale => sale.id !== viewingPendingQrSale.id);
        localStorage.setItem(QR_KEY, JSON.stringify(updated));
        return updated;
      });

      if (actionType === "other_method") {
        // Restaurar productos, importes y cliente
        setCart(viewingPendingQrSale.items || []);
        setSelectedCustomer(viewingPendingQrSale.customer || null);

        // Reabrir el modal de cobro y volver a la terminal de ventas
        setView("sales-terminal");
        setCheckoutModalOpen(true);
      } else {
        // Cancelar definitivamente: limpiar el carrito y volver al dashboard
        setCart([]);
        setSelectedCustomer(null);
        setView("dashboard");
      }

      setViewingPendingQrSale(null);
      setPendingCancelPin("");
      setPendingCancelReason("");
      setPendingCancelFieldErrors({});
      await loadDashboardData();
    } catch (err: any) {
      showToast(err.response?.data?.message || "Error al cancelar la venta.");
    } finally {
      setPendingCancelLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // RENDER PANTALLA DE CARGA
  // ---------------------------------------------------------------------------
  if (loading) {
    return (
      <div style={styles.loadingScreen}>
        <div style={styles.spinner} />
        <p style={{ fontWeight: "600", color: "#64748b", marginTop: "12px" }}>Cargando terminal de ventas...</p>
      </div>
    );
  }

  // ===========================================================================
  // RENDER A: PANEL ADMINISTRATIVO CENTRAL (Dashboard de métricas)
  // ===========================================================================
  if (user && (user.role === "ADMIN" || user.role === "GERENTE")) {
    return <AdminDashboard />;
  }

  // ===========================================================================
  // RENDER BLOQUEO: TURNO DE CAJA ABIERTO EN OTRO EQUIPO
  // ===========================================================================
  if (cajaLockedByOtherDevice) {
    return (
      <div id="device-conflict-screen" style={styles.conflictScreen}>
        <div style={styles.conflictCard}>
          <div style={styles.conflictIconContainer}>
            <AlertTriangle size={36} color="#ef4444" />
          </div>
          <h2 style={styles.conflictTitle}>Caja abierta en otro dispositivo</h2>
          <p style={styles.conflictText}>
            El turno/caja ya se encuentra abierto en otra computadora. Cierre el turno en esa caja para poder abrir uno nuevo.
          </p>
          <button
            id="conflict-back-button"
            onClick={logout}
            className="btn-primary active-tap"
            style={styles.conflictButton}
          >
            Regresar al Login
          </button>
        </div>
      </div>
    );
  }

  // ===========================================================================
  // RENDER B: APERTURA DE CAJA OBLIGATORIA (Mockup 8)
  // ===========================================================================
  if (view === "apertura") {
    return (
      <div style={styles.appContainer} className="pos-cashier-app">
        {/* Navbar */}
        <header style={styles.navbar} className="pos-cashier-navbar">
          <div style={styles.navBrand}>
            <Store size={22} color="#ffffff" />
            <span style={styles.brandText} className="pos-cashier-brand-text">LYFRGL POS</span>
          </div>
          <button onClick={handleLogoutClick} style={styles.logoutBtn} className="active-tap pos-cashier-logout-btn">
            <LogOut size={16} /> Salir
          </button>
        </header>

        <div style={styles.mainLayout} className="pos-cashier-main-layout">
          {/* Sidebar */}
          <aside style={styles.sidebar} className="pos-cashier-sidebar">
            <div style={styles.sidebarProfile} className="pos-cashier-sidebar-profile">
              <div style={styles.avatarIcon}>
                <Users size={24} color="#475569" />
              </div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <h4 style={styles.profileName}>
                  {user?.name}
                  <span style={{ fontSize: "11px", fontWeight: "normal", color: "#64748b", marginLeft: "8px", display: "inline-block" }}>
                    {currentTime.toLocaleDateString()} {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </h4>
                <p style={styles.profileBranch}>{user?.branch.name}</p>
              </div>
            </div>
          </aside>

          {/* Formulario Apertura Caja */}
          <div style={styles.contentArea} className="pos-cashier-content">
            <div style={styles.aperturaCard} className="pos-cashier-apertura-card">
              <h3 style={styles.cardMainTitle}>APERTURA DE CAJA</h3>
              <p style={{ fontSize: "14px", color: "#64748b", marginBottom: "20px" }}>Establezca el fondo de caja inicial para comenzar el turno.</p>
              
              <div style={styles.inputGroup}>
                <label style={styles.label}>FONDO INICIAL ($)</label>
                <input
                  type="text"
                  className="input-corporate"
                  style={{ fontSize: "20px", fontWeight: "700", textAlign: "center", padding: "12px" }}
                  value={initialFund}
                  inputMode="decimal"
                  onChange={(e) => {
                    const rawValue = e.target.value.trim();
                    if (rawValue && !DECIMAL_INPUT_REGEX.test(rawValue)) {
                      setInitialFundError("El fondo inicial debe ser un monto valido con maximo 3 decimales.");
                      return;
                    }
                    handleDecimalInputChange(rawValue, (value) => {
                    setInitialFund(value);
                    setInitialFundError("");
                    });
                  }}
                />
                {initialFundError && <p style={styles.fieldError}>{initialFundError}</p>}
              </div>

              <button
                onClick={handleOpenCash}
                disabled={openingLoading}
                className="btn-primary active-tap"
                style={{ ...styles.submitBtn, width: "100%", marginTop: "24px" }}
              >
                {openingLoading ? "Abriendo Caja..." : "ABRIR TURNO ➜"}
              </button>
            </div>
          </div>
        </div>
        {renderDashboardTicketLoading()}
        {renderToast()}
      </div>
    );
  }

  // ===========================================================================
  // RENDER C: TERMINAL DE VENTAS DEDICADA (Mockup 5)
  // ===========================================================================
  if (view === "sales-terminal") {
    return (
      <div style={styles.appContainer} className="pos-cashier-app">
        <style>{TICKET_PRINT_MEDIA_STYLES}</style>
        {/* Header Venta */}
        <header style={styles.terminalHeader} className="pos-cashier-terminal-header">
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <button
              type="button"
              onClick={handleCancelCurrentPurchase}
              className="active-tap"
              style={styles.terminalBackBtn}
              title="Regresar al menu principal"
              aria-label="Regresar al menu principal del cajero"
            >
              <ArrowLeft size={20} />
            </button>
            <Store size={22} color="#1e3a8a" />
            <h2 style={{ fontSize: "18px", fontWeight: "800", color: "#0f172a" }}>
              Venta - Ticket #{(sessionStats?.salesCount !== undefined) ? sessionStats.salesCount + 1 : 1}
            </h2>
          </div>
          <div style={{ fontSize: "14px", fontWeight: "600", color: "#475569" }}>
            Cajero: <span style={{ color: "#1e3a8a" }}>{user?.name.split(" ")[0]}</span>
          </div>
        </header>

        {/* Cuerpo Venta */}
        <div style={styles.terminalBody} className="pos-cashier-terminal-body">
          {/* Búsqueda de Productos */}
          {/* Búsqueda de Productos y Clientes */}
          <div className="card-premium" style={styles.terminalSearchArea}>
            <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }} className="pos-cashier-search-row">
              {/* Buscador de Productos */}
              <form onSubmit={handleProductBarcodeSearch} style={{ flex: "1 1 50%", display: "flex", gap: "10px", margin: 0 }} className="pos-cashier-search-form">
                <div style={{ flex: 1, position: "relative" }}>
                  <Search size={18} color="#94a3b8" style={{ position: "absolute", left: "12px", top: "12px" }} />
                  <input
                    type="text"
                    className="input-corporate"
                    style={{ paddingLeft: "38px" }}
                    placeholder="Ingrese código o nombre del producto..."
                    value={barcodeSearch}
                    onChange={(e) => setBarcodeSearch(validateTextInput(e.target.value))}
                  />
                  {barcodeSearchError && <p style={styles.fieldError}>{barcodeSearchError}</p>}
                </div>
                <button type="submit" className="btn-primary">
                  Buscar
                </button>
              </form>

              {/* Buscador y Lealtad de Clientes */}
              <div style={{ flex: "1 1 40%", display: "flex", gap: "10px", position: "relative" }} className="pos-cashier-customer-search">
                {selectedCustomer ? (
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    backgroundColor: "#f0fdf4",
                    border: "1px solid #bbf7d0",
                    borderRadius: "6px",
                    padding: "8px 12px",
                    width: "100%",
                    fontSize: "13px"
                  }} className="pos-cashier-customer-selected">
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontWeight: "700", color: "#166534" }}>👤 {selectedCustomer.name}</span>
                      <span style={{ color: "#475569" }}>({selectedCustomer.phone})</span>
                      <span style={{
                        backgroundColor: "#dcfce7",
                        color: "#15803d",
                        padding: "2px 6px",
                        borderRadius: "4px",
                        fontWeight: "700"
                      }}>
                        ⭐ {selectedCustomer.points} pts
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCustomer(null);
                        setUsePoints(false);
                        setPointsToRedeem(0);
                        setInvoiceRequested(false);
                        showToast("Cliente removido del carrito.", "info");
                      }}
                      style={{
                        border: "none",
                        background: "transparent",
                        color: "#991b1b",
                        cursor: "pointer",
                        fontWeight: "700"
                      }}
                    >
                      Quitar
                    </button>
                  </div>
                ) : (
                  <>
                    <div style={{ flex: 1, position: "relative" }}>
                      <span style={{ position: "absolute", left: "12px", top: "12px", fontSize: "14px" }}>👤</span>
                      <input
                        type="text"
                        className="input-corporate"
                        style={{ paddingLeft: "38px" }}
                        placeholder="Buscar cliente por teléfono o nombre..."
                        value={customerSearch}
                        onChange={(e) => setCustomerSearch(validateTextInput(e.target.value))}
                        onFocus={() => {
                          if (customerSearch.trim().length > 0) {
                            setIsCustomerDropdownOpen(true);
                          }
                        }}
                      />
                      {customerSearchError && <p style={styles.fieldError}>{customerSearchError}</p>}
                    </div>
                    <button
                      type="button"
                      className="btn-primary"
                      style={{ backgroundColor: "#0f172a" }}
                      onClick={() => {
                        setNewCustomerError(null);
                        setNewCustomerFieldErrors({});
                        setNewCustomerForm({ name: "", phone: "", email: "" });
                        setIsNewCustomerModalOpen(true);
                      }}
                    >
                      + Nuevo
                    </button>
                  </>
                )}

                {/* Dropdown de búsqueda de clientes */}
                {isCustomerDropdownOpen && customerSearchResults.length > 0 && (
                  <div style={{
                    ...styles.searchResultsDropdown,
                    left: 0,
                    right: 0,
                    top: "100%",
                    marginTop: "4px",
                    zIndex: 110
                  }}>
                    {customerSearchResults.map((c) => (
                      <div
                        key={c.id}
                        onClick={() => {
                          setSelectedCustomer(c);
                          setCustomerSearch("");
                          setCustomerSearchResults([]);
                          setIsCustomerDropdownOpen(false);
                        }}
                        style={{
                          ...styles.dropdownItem,
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center"
                        }}
                      >
                        <div style={{ display: "flex", flexDirection: "column" }}>
                          <span style={{ fontWeight: "700", color: "#1e293b" }}>{c.name}</span>
                          <span style={{ fontSize: "12px", color: "#64748b" }}>📞 {c.phone}</span>
                        </div>
                        <span style={{
                          backgroundColor: "#f1f5f9",
                          color: "#334155",
                          padding: "2px 6px",
                          borderRadius: "4px",
                          fontWeight: "700",
                          fontSize: "12px"
                        }}>
                          ⭐ {c.points} pts
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Dropdown vacío (No coincidencia => Sugerir registro) */}
                {isCustomerDropdownOpen && customerSearch.trim().length > 0 && customerSearchResults.length === 0 && (
                  <div style={{
                    ...styles.searchResultsDropdown,
                    left: 0,
                    right: 0,
                    top: "100%",
                    marginTop: "4px",
                    padding: "12px",
                    textAlign: "center" as const,
                    zIndex: 110
                  }}>
                    <span style={{ fontSize: "13px", color: "#64748b", display: "block", marginBottom: "8px" }}>
                      No se encontró ningún cliente
                    </span>
                    <button
                      type="button"
                      className="btn-primary"
                      style={{ fontSize: "12px", padding: "6px 12px", width: "100%", backgroundColor: "#0f172a" }}
                      onClick={() => {
                        setNewCustomerError(null);
                        setNewCustomerFieldErrors({});
                        setNewCustomerForm({ name: "", phone: customerSearch.replace(/\D/g, ""), email: "" });
                        setIsNewCustomerModalOpen(true);
                        setIsCustomerDropdownOpen(false);
                      }}
                    >
                      + Registrar "{customerSearch}" como Nuevo Cliente
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Dropdown de búsqueda multi-producto */}
            {searchResults.length > 0 && (
              <div style={styles.searchResultsDropdown}>
                {searchResults.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => {
                      addProductToCart(p);
                      setSearchResults([]);
                      setBarcodeSearch("");
                    }}
                    style={styles.dropdownItem}
                  >
                    <span>{p.name}</span>
                    <span style={{ fontWeight: "700", color: "#0d9488" }}>${p.sellPrice.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Carrito de Productos */}
          <div className="card-premium pos-cashier-cart-card" style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", padding: "20px" }}>
            <h3 className="pos-cashier-cart-mobile-title">Detalle de Productos</h3>
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
                            <span style={{
                              fontSize: "10px",
                              backgroundColor: "#dbeafe",
                              color: "#1e40af",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              fontWeight: "700",
                              marginTop: "4px",
                              display: "inline-block"
                            }}>
                              🏷️ {item.product.activePromotion.name}
                            </span>
                          )}
                          {item.product.activePromotion && !promoApplied && (
                            <span style={{
                              fontSize: "9px",
                              backgroundColor: "#f1f5f9",
                              color: "#94a3b8",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              fontWeight: "600",
                              marginTop: "4px",
                              display: "inline-block"
                            }}>
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
                              onFocus={() =>
                                setCartQtyDraft((prev) => ({
                                  ...prev,
                                  [item.product.id]: String(item.quantity),
                                }))
                              }
                              onChange={(e) => {
                                const digits = e.target.value.replace(/\D/g, "");
                                if (digits === "") {
                                  setCartQtyDraft((prev) => ({
                                    ...prev,
                                    [item.product.id]: digits,
                                  }));
                                  return;
                                }
                                const parsed = parseInt(digits, 10);
                                const maxStock = item.product.stock;
                                if (parsed > maxStock) {
                                  showToast(`Solo hay ${maxStock} piezas en stock.`);
                                  setCartQtyDraft((prev) => ({
                                    ...prev,
                                    [item.product.id]: String(maxStock),
                                  }));
                                  return;
                                }
                                setCartQtyDraft((prev) => ({
                                  ...prev,
                                  [item.product.id]: digits,
                                }));
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
                                  setCartQtyDraft((prev) => {
                                    const next = { ...prev };
                                    delete next[item.product.id];
                                    return next;
                                  });
                                  updateCartQty(item.product.id, 1);
                                } else if (e.key === "ArrowDown") {
                                  e.preventDefault();
                                  setCartQtyDraft((prev) => {
                                    const next = { ...prev };
                                    delete next[item.product.id];
                                    return next;
                                  });
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
 
            {/* Totales y Controles Cobro — layout 2 columnas */}
            <div style={{ ...styles.terminalSummary, display: "flex", gap: "24px", alignItems: "flex-start" }} className="pos-cashier-terminal-summary">

              {/* COLUMNA IZQUIERDA: Pagos QR Pendientes (máx 3, sin scroll) */}
              <div style={{ flex: 1 }} className="pos-cashier-terminal-summary-col">
                {pendingQrSales.length > 0 && (
                  <>
                    <div style={{ fontSize: "11px", fontWeight: "700", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>
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
                            <tr key={sale.id} style={{ borderBottom: "1px solid #f1f5f9", backgroundColor: isApproved ? "#f0fdf4" : isRejected ? "#fef2f2" : "transparent" }}>
                              <td style={{ padding: "5px 6px", fontWeight: "600", color: "#334155", whiteSpace: "nowrap" }} title={sale.invoiceNumber}>
                                ...{sale.invoiceNumber.slice(-6)}
                              </td>
                              <td style={{ padding: "5px 6px", fontWeight: "700", color: "#0f172a", whiteSpace: "nowrap" }}>
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
                                  <button onClick={(e) => { e.stopPropagation(); setPendingCancelFieldErrors({}); setViewingPendingQrSale(sale); }} title="Ver QR"
                                    style={{ padding: "3px 8px", borderRadius: "4px", fontSize: "12px", fontWeight: "700", backgroundColor: "#dbeafe", color: "#1e40af", border: "1px solid #93c5fd", cursor: "pointer" }}>
                                    QR
                                  </button>
                                  <button onClick={(e) => { e.stopPropagation(); checkPendingQrStatus(sale.invoiceNumber); }} disabled={isChecking} title="Verificar pago — si está aprobado muestra el ticket"
                                    style={{ padding: "3px 8px", borderRadius: "4px", fontSize: "12px", fontWeight: "700", backgroundColor: isChecking ? "#6b7280" : "#1e3a8a", color: "white", border: "none", cursor: isChecking ? "default" : "pointer" }}>
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
                  Object.entries(taxBreakdown).map(([taxName, taxAmount]) => (
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
                    onClick={() => setCheckoutModalOpen(true)}
                    className="active-tap"
                    style={{ ...styles.terminalBtn, flex: 1, backgroundColor: "#059669", color: "white" }}
                  >
                    COBRAR
                  </button>
                </div>
              </div>

            </div>
          </div>
        </div>


        {/* COBRO MODAL (Mockup 4) */}
        {checkoutModalOpen && (
          <div style={styles.modalOverlay} className="pos-cashier-modal-overlay pos-cashier-modal-overlay--center">
            <div style={styles.checkoutModal} className="pos-cashier-modal">
              <h3 style={{ textAlign: "center", textTransform: "uppercase", fontSize: "14px", color: "#475569", fontWeight: "700" }}>COBRO</h3>
              <div style={styles.checkoutTotalBox} className="pos-cashier-checkout-total">
                $ {(cartTotal - pointsDiscount).toFixed(2)}
              </div>

              {pointsDiscount > 0 && (
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "13px",
                  color: "#059669",
                  fontWeight: "700",
                  padding: "0 4px",
                  marginTop: "-8px"
                }}>
                  <span>Descuento de Puntos:</span>
                  <span>-${pointsDiscount.toFixed(2)} MXN</span>
                </div>
              )}

              {/* Selector Métodos Pago */}
              <div style={styles.payMethodsRow} className="pos-cashier-pay-methods">
                <button
                  onClick={() => {
                    setPaymentMethod("EFECTIVO");
                    setCheckoutError(null);
                    setCheckoutFieldErrors({});
                  }}
                  style={{ ...styles.payMethodBtn, ...(paymentMethod === "EFECTIVO" ? styles.payMethodActive : {}) }}
                >
                  💵 EFECTIVO
                </button>
                <button
                  onClick={() => {
                    setPaymentMethod("TARJETA");
                    setCheckoutError(null);
                    setCheckoutFieldErrors({});
                  }}
                  style={{ ...styles.payMethodBtn, ...(paymentMethod === "TARJETA" ? styles.payMethodActive : {}) }}
                >
                  💳 TARJETA
                </button>
                <button
                  onClick={() => {
                    setPaymentMethod("MIXTO");
                    setCheckoutError(null);
                    setCheckoutFieldErrors({});
                  }}
                  style={{ ...styles.payMethodBtn, ...(paymentMethod === "MIXTO" ? styles.payMethodActive : {}) }}
                >
                  ⚖️ MIXTO
                </button>
                <button
                  onClick={() => { setPaymentMethod("QR_MERCADOPAGO"); setCheckoutError(null); setCheckoutFieldErrors({}); }}
                  style={{ ...styles.payMethodBtn, ...(paymentMethod === "QR_MERCADOPAGO" ? styles.payMethodActive : {}) }}
                >
                  📱 QR MP
                </button>
              </div>

              {/* Inputs de Cobro según método */}
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
                    <input
                      type="text"
                      readOnly
                      className="input-corporate"
                      style={{ backgroundColor: "#f1f5f9", fontWeight: "700", color: "#0f172a" }}
                      value={`$ ${calculatedChange.toFixed(2)}`}
                    />
                  </div>
                </div>
              )}

              {paymentMethod === "TARJETA" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginTop: "14px" }}>
                  <div style={styles.inputGroup}>
                    <label style={styles.label}>Tipo de Tarjeta:</label>
                    <select
                      value={cardType}
                      onChange={(e) => setCardType(e.target.value as "CREDITO" | "DEBITO")}
                      style={styles.select}
                    >
                      <option value="DEBITO">Débito</option>
                      <option value="CREDITO">Crédito</option>
                    </select>
                  </div>
                  <div style={{ padding: "10px 0", textAlign: "center", color: "#64748b" }}>
                    <p>Solicite que inserte la tarjeta en la terminal bancaria.</p>
                    <p style={{ fontWeight: "600", color: "#1e3a8a", marginTop: "8px" }}>NIP requerido en terminal física.</p>
                  </div>
                </div>
              )}

              {paymentMethod === "MIXTO" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "14px" }}>
                  <div style={styles.inputGroup}>
                    <label style={styles.label}>Tipo de Tarjeta:</label>
                    <select
                      value={cardType}
                      onChange={(e) => setCardType(e.target.value as "CREDITO" | "DEBITO")}
                      style={styles.select}
                    >
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
                    <input
                      type="text"
                      readOnly
                      className="input-corporate"
                      style={{ backgroundColor: "#f1f5f9", fontWeight: "700" }}
                      value={`$ ${calculatedChange.toFixed(2)}`}
                    />
                  </div>
                </div>
              )}

              {/* Sección de Puntos de Lealtad (Fase 3.7) */}
              {selectedCustomer && (
                <div style={{
                  borderTop: "1px solid #e2e8f0",
                  paddingTop: "14px",
                  marginTop: "10px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px"
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <label style={{ ...styles.label, display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", margin: 0 }}>
                      <input
                        type="checkbox"
                        checked={usePoints}
                        onChange={(e) => {
                          setUsePoints(e.target.checked);
                          if (!e.target.checked) setPointsToRedeem(0);
                        }}
                      />
                      <span>¿Usar Puntos?</span>
                    </label>
                    <span style={{ fontSize: "12px", color: "#64748b", fontWeight: "600" }}>
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
                              showToast(`El canje máximo es de ${maxVal} puntos.`, "info");
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
                <div style={{
                  borderTop: "1px solid #e2e8f0",
                  paddingTop: "14px",
                  marginTop: "10px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px"
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <label style={{ ...styles.label, display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", margin: 0 }}>
                      <input
                        type="checkbox"
                        checked={invoiceRequested}
                        onChange={(e) => {
                          setInvoiceRequested(e.target.checked);
                        }}
                      />
                      <span>¿Solicitar Factura CFDI?</span>
                    </label>
                    <span style={{ fontSize: "11px", color: "#64748b", fontWeight: "600" }}>
                      Se enviará al correo registrado
                    </span>
                  </div>
                </div>
              )}

              {checkoutError && (
                <div style={{
                  backgroundColor: "#fef2f2",
                  border: "1px solid #fca5a5",
                  color: "#b91c1c",
                  padding: "10px 12px",
                  borderRadius: "6px",
                  fontSize: "13px",
                  fontWeight: "600",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  marginTop: "16px"
                }}>
                  <AlertTriangle size={16} color="#b91c1c" />
                  <span>{checkoutError}</span>
                </div>
              )}

              {checkoutLoading && (
                <div style={{
                  backgroundColor: "#eff6ff",
                  border: "1px solid #93c5fd",
                  color: "#1d4ed8",
                  padding: "10px 12px",
                  borderRadius: "6px",
                  fontSize: "13px",
                  fontWeight: "600",
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  marginTop: "16px"
                }}>
                  <div className="pos-cashier-loading-spinner" style={{ width: "16px", height: "16px", borderWidth: "2px", flexShrink: 0 }} />
                  <span>Procesando el cobro... Si la venta incluye facturación o puntos puede tardar un poco más. No cierre esta ventana.</span>
                </div>
              )}

              {/* Botones de Cobro */}
              <div style={{ display: "flex", gap: "10px", marginTop: "24px" }} className="pos-cashier-modal-actions">
                <button
                  disabled={checkoutLoading}
                  onClick={() => setCheckoutModalOpen(false)}
                  style={{ ...styles.modalBtn, backgroundColor: "#dc2626", color: "white" }}
                >
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
              <h3 style={{ textAlign: "center", textTransform: "uppercase", fontSize: "14px", color: "#475569", fontWeight: "700" }}>PAGO QR MERCADO PAGO</h3>
              <div style={{ textAlign: "center", padding: "20px 0" }}>
                 <p style={{marginBottom: "10px", fontSize: "14px", color: "#475569"}}>Escanea el siguiente código para pagar <strong>${cartTotal.toFixed(2)}</strong></p>
                 {qrUrl ? (
                   <>
                     <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrUrl)}`} alt="QR Code" width="200" height="200" loading="lazy" />
                     <div style={{ marginTop: "12px" }}>
                       <a 
                         href={qrUrl} 
                         target="_blank" 
                         rel="noopener noreferrer" 
                         style={{ 
                           fontSize: "12px", 
                           color: "#2563eb", 
                           textDecoration: "underline", 
                           fontWeight: "600", 
                           display: "inline-block", 
                           padding: "6px 12px", 
                           backgroundColor: "#f1f5f9", 
                           borderRadius: "6px" 
                         }}
                       >
                         🔗 Abrir enlace de pago / Sandbox
                       </a>
                     </div>
                   </>
                 ) : (
                   <p>Generando QR...</p>
                 )}
                 <p style={{ marginTop: "12px", fontSize: "12px", color: "#64748b" }}>Ref: {qrReference}</p>
              </div>
              <div style={{ display: "flex", gap: "10px", marginTop: "24px" }} className="pos-cashier-modal-actions">
                <button
                  disabled={qrChecking}
                  onClick={addPendingQrSale}
                  style={{ ...styles.modalBtn, backgroundColor: "#dc2626", color: "white" }}
                >
                  CERRAR (PAGO PENDIENTE)
                </button>
                <button
                  disabled={qrChecking}
                  onClick={checkQrStatus}
                  style={{ ...styles.modalBtn, backgroundColor: "#059669", color: "white", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}
                >
                  {qrChecking && (
                    <div className="pos-cashier-loading-spinner" style={{ width: "14px", height: "14px", borderWidth: "2px", borderColor: "rgba(255,255,255,0.4)", borderTopColor: "#ffffff", flexShrink: 0 }} />
                  )}
                  {qrChecking ? "VERIFICANDO..." : "VERIFICAR ESTADO"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL: REGISTRO RÁPIDO DE CLIENTE (Fase 3.6) */}
        {isNewCustomerModalOpen && (
          <div style={styles.modalOverlay} className="pos-cashier-modal-overlay pos-cashier-modal-overlay--center">
            <div style={styles.checkoutModal} className="pos-cashier-modal">
              <h3 style={{ textAlign: "center", textTransform: "uppercase", fontSize: "14px", color: "#475569", fontWeight: "700" }}>
                REGISTRO RÁPIDO DE CLIENTE
              </h3>
              <form onSubmit={handleRegisterCustomerSubmit} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Nombre Completo *</label>
                  <input
                    type="text"
                    required
                    className="input-corporate"
                    placeholder="Ej. Juan Pérez"
                    value={newCustomerForm.name}
                    onChange={(e) => setNewCustomerField("name")(e.target.value)}
                  />
                  {newCustomerFieldErrors.name && <p style={styles.fieldError}>{newCustomerFieldErrors.name}</p>}
                </div>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Teléfono (10 dígitos) *</label>
                  <input
                    type="text"
                    required
                    className="input-corporate"
                    placeholder="Ej. 5551234567"
                    value={newCustomerForm.phone}
                    onChange={(e) => setNewCustomerField("phone")(e.target.value)}
                  />
                  {newCustomerFieldErrors.phone && <p style={styles.fieldError}>{newCustomerFieldErrors.phone}</p>}
                </div>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Correo Electrónico (Opcional)</label>
                  <input
                    type="email"
                    className="input-corporate"
                    placeholder="Ej. cliente@correo.com"
                    value={newCustomerForm.email}
                    onChange={(e) => setNewCustomerField("email")(e.target.value)}
                  />
                  {newCustomerFieldErrors.email && <p style={styles.fieldError}>{newCustomerFieldErrors.email}</p>}
                </div>

                {newCustomerError && (
                  <div style={{
                    backgroundColor: "#fef2f2",
                    border: "1px solid #fca5a5",
                    color: "#b91c1c",
                    padding: "10px 12px",
                    borderRadius: "6px",
                    fontSize: "13px",
                    fontWeight: "600",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px"
                  }}>
                    <AlertTriangle size={16} color="#b91c1c" />
                    <span>{newCustomerError}</span>
                  </div>
                )}

                <div style={{ display: "flex", gap: "10px", marginTop: "16px" }} className="pos-cashier-modal-actions">
                  <button
                    type="button"
                    onClick={() => { setIsNewCustomerModalOpen(false); setNewCustomerFieldErrors({}); }}
                    style={{ ...styles.modalBtn, backgroundColor: "#dc2626", color: "white" }}
                  >
                    CANCELAR
                  </button>
                  <button
                    type="submit"
                    disabled={newCustomerLoading}
                    style={{ ...styles.modalBtn, backgroundColor: "#059669", color: "white" }}
                  >
                    {newCustomerLoading ? "Registrando..." : "REGISTRAR Y SELECCIONAR"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL: AUTORIZACIÓN PIN GERENTE/ADMIN PARA CARRITO (Fase 3.0) */}
        {renderCartAuthorizationModal()}

        {/* MODAL 3: TICKET IMPRESO/PDF (Mockup 3) */}
        {activeModal === "ticket-view" && selectedSale && (
          <div style={{ ...styles.modalOverlay, zIndex: ticketEmailModalOpen ? 9998 : 100 }} className="pos-cashier-modal-overlay pos-cashier-modal-overlay--center">
            <div style={styles.ticketModal} className="pos-cashier-modal">
              <div id="print-area" style={styles.ticketContainer} className="ticket-print">
                {selectedSale.status === "CANCELADA" && (
                  <div style={{
                    textAlign: "center",
                    color: "#dc2626",
                    fontWeight: "900",
                    fontSize: "16px",
                    border: "2px solid #dc2626",
                    padding: "4px",
                    marginBottom: "12px",
                    borderRadius: "4px",
                    textTransform: "uppercase"
                  }}>
                    *** CANCELADO ***
                  </div>
                )}
                {selectedSale.totalRefunded > 0 && Number(selectedSale.totalRefunded).toFixed(2) === Number(selectedSale.total).toFixed(2) && (
                  <div style={{
                    textAlign: "center",
                    color: "#dc2626",
                    fontWeight: "900",
                    fontSize: "15px",
                    border: "2px solid #dc2626",
                    padding: "4px",
                    marginBottom: "12px",
                    borderRadius: "4px",
                    textTransform: "uppercase",
                    backgroundColor: "#fef2f2"
                  }}>
                    *** DEVOLUCIÓN TOTAL ***
                  </div>
                )}
                {selectedSale.totalRefunded > 0 && Number(selectedSale.totalRefunded).toFixed(2) !== Number(selectedSale.total).toFixed(2) && (
                  <div style={{
                    textAlign: "center",
                    color: "#d97706",
                    fontWeight: "900",
                    fontSize: "14px",
                    border: "2px solid #d97706",
                    padding: "4px",
                    marginBottom: "12px",
                    borderRadius: "4px",
                    textTransform: "uppercase",
                    backgroundColor: "#fffbeb"
                  }}>
                    *** DEVOLUCIÓN PARCIAL ***
                  </div>
                )}
                <div style={{ textAlign: "center", marginBottom: "14px" }}>
                  <h4 style={{ textTransform: "uppercase", fontWeight: "800", margin: "0 0 4px 0", fontSize: "14px" }}>LYFRGL</h4>
                  <p style={{ fontSize: "11px", color: "#475569" }}>SUCURSAL: {user?.branch.name}</p>
                  {user?.branch?.phone && <p style={{ fontSize: "10px", color: "#64748b" }}>TEL: {user.branch.phone}</p>}
                  {user?.branch?.address && <p style={{ fontSize: "10px", color: "#64748b" }}>{user.branch.address}</p>}
                </div>

                <div style={{ borderBottom: "1px dashed #cbd5e1", paddingBottom: "8px", marginBottom: "8px", fontSize: "11px" }}>
                  <p><strong>Folio:</strong> {selectedSale.invoiceNumber}</p>
                  <p><strong>Fecha:</strong> {new Date(selectedSale.createdAt).toLocaleDateString()}</p>
                  <p><strong>Hora:</strong> {new Date(selectedSale.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                  <p><strong>Cajero:</strong> {user?.name}</p>
                  <p><strong>Artículos:</strong> {selectedSale.items.reduce((sum: number, item: any) => sum + item.quantity, 0)}</p>
                </div>

                <table style={{ width: "100%", fontSize: "10px", borderCollapse: "collapse", marginBottom: "8px", tableLayout: "fixed" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px dashed #111111" }}>
                      <th style={{ textAlign: "left", paddingBottom: "4px", width: "12%" }}>Cant</th>
                      <th style={{ textAlign: "left", paddingBottom: "4px", width: "43%" }}>Descripción</th>
                      <th style={{ textAlign: "right", paddingBottom: "4px", width: "20%" }}>P. Unit</th>
                      <th style={{ textAlign: "right", paddingBottom: "4px", width: "25%" }}>Importe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedSale.items.map((item: any, idx: number) => {
                      const promoDetails = selectedSale.isNewSale === false
                        ? {
                            finalPrice: Number(item.product.sellPrice) - (Number(item.discountAmount || 0) / item.quantity),
                            discountAmount: Number(item.discountAmount || 0),
                            label: item.product.activePromotion?.name || ""
                          }
                        : calculateItemPromotion(item);
                      const hasDiscount = promoDetails.discountAmount > 0;
                      return (
                        <tr key={idx}>
                          <td style={{ textAlign: "left", padding: "4px 2px 4px 0", whiteSpace: "nowrap" }}>{item.quantity}</td>
                          <td style={{ padding: "4px 4px 4px 0" }}>
                            <div>{item.product.name}</div>
                            {item.product.activePromotion && (
                              <div style={{ fontSize: "9px", color: "#1e40af", fontWeight: "600" }}>
                                ({item.product.activePromotion.name})
                              </div>
                            )}
                            {item.returnedQuantity > 0 && (
                              <div style={{ fontSize: "9px", color: "#dc2626", fontWeight: "700", marginTop: "2px" }}>
                                ↳ Devuelto: {item.returnedQuantity} ud{item.returnedQuantity > 1 ? 's' : ''}
                              </div>
                            )}
                            {(item.taxes || item.taxDetail) && (item.taxes?.length > 0 || item.taxDetail?.length > 0) && (
                              <div style={{ fontSize: "9px", color: "#64748b", fontStyle: "italic", marginTop: "2px" }}>
                                {(item.taxes || item.taxDetail).map((t: any) => `${t.name}: $${Number(t.amount).toFixed(2)}`).join(" | ")}
                              </div>
                            )}
                          </td>
                          <td style={{ textAlign: "right", padding: "4px 4px 4px 0", whiteSpace: "nowrap" }}>
                            ${Number(item.product.sellPrice).toFixed(2)}
                          </td>
                          <td style={{ textAlign: "right", padding: "4px 0", whiteSpace: "nowrap" }}>
                            {hasDiscount ? (
                              <>
                                <span style={{ textDecoration: "line-through", color: "#94a3b8", marginRight: "4px", fontSize: "10px" }}>
                                  ${(item.product.sellPrice * item.quantity).toFixed(2)}
                                </span>
                                <span>
                                  ${(promoDetails.finalPrice * item.quantity).toFixed(2)}
                                </span>
                              </>
                            ) : (
                              `$${(item.product.sellPrice * item.quantity).toFixed(2)}`
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                <div style={{ borderTop: "1px dashed #cbd5e1", paddingTop: "8px", display: "flex", flexDirection: "column", gap: "4px", fontSize: "11px" }}>
                  {selectedSale.discountAmount > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", color: "#059669", fontWeight: "700" }}>
                      <span>Descuento Promos:</span>
                      <span>-${Number(selectedSale.discountAmount).toFixed(2)}</span>
                    </div>
                  )}
                  {selectedSale.pointsDiscount > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", color: "#059669", fontWeight: "700" }}>
                      <span>Descuento Puntos:</span>
                      <span>-${Number(selectedSale.pointsDiscount).toFixed(2)}</span>
                    </div>
                  )}
                  {((Number(selectedSale.discountAmount || 0) + Number(selectedSale.pointsDiscount || 0)) > 0) && (
                    <div style={{ display: "flex", justifyContent: "space-between", color: "#166534", fontWeight: "800", backgroundColor: "#f0fdf4", padding: "4px 6px", borderRadius: "4px", margin: "2px 0" }}>
                      <span>¡TU AHORRO TOTAL!:</span>
                      <span>${(Number(selectedSale.discountAmount || 0) + Number(selectedSale.pointsDiscount || 0)).toFixed(2)}</span>
                    </div>
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Subtotal:</span>
                    <span>${selectedSale.subtotal.toFixed(2)}</span>
                  </div>
                  {selectedSale.taxBreakdown && selectedSale.taxBreakdown.length > 0 ? (
                    selectedSale.taxBreakdown.map((tb: any, i: number) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between" }}>
                        <span>{tb.name}:</span>
                        <span>${Number(tb.amount).toFixed(2)}</span>
                      </div>
                    ))
                  ) : (
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>IVA (16%):</span>
                      <span>${selectedSale.tax.toFixed(2)}</span>
                    </div>
                  )}
                  {selectedSale.taxBreakdown && selectedSale.taxBreakdown.length > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", fontStyle: "italic", color: "#64748b" }}>
                      <span>Total Impuestos:</span>
                      <span>${selectedSale.tax.toFixed(2)}</span>
                    </div>
                  )}
                  {selectedSale.totalRefunded > 0 && (
                    <>
                      <div style={{ display: "flex", justifyContent: "space-between", color: "#dc2626", fontWeight: "700", borderTop: "1px dashed #dc2626", paddingTop: "4px", marginTop: "4px" }}>
                        <span>Total Devuelto:</span>
                        <span>-${Number(selectedSale.totalRefunded).toFixed(2)}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", color: "#0f172a", fontWeight: "800", backgroundColor: "#fef2f2", padding: "4px 6px", borderRadius: "4px", margin: "2px 0" }}>
                        <span>Neto Final:</span>
                        <span>${(Number(selectedSale.total) - Number(selectedSale.totalRefunded)).toFixed(2)}</span>
                      </div>
                    </>
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "800", fontSize: "12px" }}>
                    <span>TOTAL:</span>
                    <span>${selectedSale.total.toFixed(2)}</span>
                  </div>
                </div>

                <div style={{ borderTop: "1px solid #cbd5e1", marginTop: "8px", paddingTop: "8px", fontSize: "11px" }}>
                  <p>
                    <strong>Método de pago:</strong> {selectedSale.paymentMethod}
                    {selectedSale.cardType && ` (${selectedSale.cardType})`}
                  </p>
                  {selectedSale.paymentMethod === "EFECTIVO" && (
                    <>
                      <p><strong>Pagó con:</strong> ${selectedSale.cashReceived.toFixed(2)}</p>
                      <p><strong>Cambio:</strong> ${selectedSale.changeGiven.toFixed(2)}</p>
                    </>
                  )}
                  {selectedSale.paymentMethod === "MIXTO" && (
                    <>
                      <p><strong>Efectivo:</strong> ${selectedSale.cashReceived.toFixed(2)}</p>
                      <p><strong>Tarjeta:</strong> ${(selectedSale.total - (selectedSale.cashReceived - selectedSale.changeGiven)).toFixed(2)}</p>
                      <p><strong>Cambio:</strong> ${selectedSale.changeGiven.toFixed(2)}</p>
                    </>
                  )}
                  {selectedSale.customerName && (
                    <div style={{ borderTop: "1px dashed #cbd5e1", marginTop: "6px", paddingTop: "6px", fontSize: "10px" }}>
                      <p><strong>Cliente:</strong> {selectedSale.customerName}</p>
                      {selectedSale.pointsEarned > 0 && <p><strong>Puntos Ganados:</strong> +{selectedSale.pointsEarned}</p>}
                      {selectedSale.pointsRedeemed > 0 && <p><strong>Puntos Canjeados:</strong> -{selectedSale.pointsRedeemed} (-${Number(selectedSale.pointsDiscount).toFixed(2)} MXN)</p>}
                      <p><strong>Saldo Nuevo:</strong> {selectedSale.customerPoints} pts</p>
                    </div>
                  )}
                </div>

                <div style={{ borderTop: "1px dashed #cbd5e1", marginTop: "12px", paddingTop: "8px", fontSize: "9px", textAlign: "center", color: "#64748b", lineHeight: "1.4", display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <p>Portal de Autofacturación:</p>
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(window.location.origin + "/autofacturacion")}`}
                    alt="QR Facturación"
                    style={{ width: "100px", height: "100px", marginTop: "6px", marginBottom: "6px" }}
                  />
                  <p style={{ fontWeight: "700", wordBreak: "break-all" }}>{window.location.origin + "/autofacturacion"}</p>
                  <p>Escanea el código QR para facturar tu compra</p>
                </div>

                <div style={{ textAlign: "center", marginTop: "20px", fontSize: "10px", color: "#64748b" }}>
                  <p>¡GRACIAS POR SU COMPRA!</p>
                  <p>REGRESE PRONTO</p>
                  <p style={{ marginTop: "12px", fontSize: "9px", fontWeight: "600", fontStyle: "italic", borderTop: "1px dashed #cbd5e1", paddingTop: "8px" }}>
                    Para devoluciones y cancelaciones, es indispensable presentar este ticket original.
                  </p>
                </div>
              </div>

              {renderTicketActionButtons({
                onClose: handleCloseTicket,
                closeLabel: "CERRAR TICKET",
                onPrint: handlePrintTicket,
                emailConfig: {
                  subject: `Ticket de venta ${selectedSale.invoiceNumber}`,
                  elementId: "print-area",
                  defaultEmail: selectedSale.customerEmail || null,
                },
              })}
            </div>
          </div>
        )}

        {/* MODAL: VER QR DE PAGO PENDIENTE (también disponible en terminal de ventas) */}
        {viewingPendingQrSale && (
          <div style={{ ...styles.modalOverlay, zIndex: 9999 }} className="pos-cashier-modal-overlay pos-cashier-modal-overlay--center">
            <div style={styles.checkoutModal} className="pos-cashier-modal">
              <h3 style={{ textAlign: "center", textTransform: "uppercase", fontSize: "14px", color: "#475569", fontWeight: "700" }}>PAGO QR MERCADO PAGO</h3>

              <div style={{ textAlign: "center", padding: "12px 0" }}>
                <p style={{ marginBottom: "10px", fontSize: "13px", color: "#475569" }}>
                  Escanea el código QR para pagar la venta{" "}
                  <strong>${Number(viewingPendingQrSale.amount).toFixed(2)}</strong>
                </p>
                {viewingPendingQrSale.qrUrl ? (
                  <>
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(viewingPendingQrSale.qrUrl)}`}
                      alt="QR Code"
                      width="180"
                      height="180"
                      style={{ borderRadius: "8px", border: "1px solid #e2e8f0" }}
                    />
                    <div style={{ marginTop: "10px" }}>
                      <a
                        href={viewingPendingQrSale.qrUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          fontSize: "12px",
                          color: "#2563eb",
                          textDecoration: "underline",
                          fontWeight: "600",
                          display: "inline-block",
                          padding: "6px 12px",
                          backgroundColor: "#f1f5f9",
                          borderRadius: "6px"
                        }}
                      >
                        🔗 Abrir enlace de pago / Sandbox
                      </a>
                    </div>
                  </>
                ) : (
                  <p style={{ fontSize: "12px", color: "#64748b" }}>Código QR no disponible.</p>
                )}
                <p style={{ marginTop: "10px", fontSize: "11px", color: "#64748b" }}>Folio: {viewingPendingQrSale.invoiceNumber}</p>
                <p style={{ marginTop: "4px", fontSize: "12px", fontWeight: "700",
                  color: viewingPendingQrSale.status === "approved" ? "#15803d" : viewingPendingQrSale.status === "rejected" ? "#b91c1c" : "#c2410c"
                }}>
                  Estado: {viewingPendingQrSale.status === "approved" ? "✅ Aprobado" : viewingPendingQrSale.status === "rejected" ? "❌ Rechazado" : "⏳ Pendiente"}
                </p>
              </div>

              {/* Formulario de Cancelación con PIN si la venta sigue pendiente */}
              {viewingPendingQrSale.status !== "approved" && (
                <div style={{
                  borderTop: "1px dashed #e2e8f0",
                  paddingTop: "12px",
                  marginTop: "8px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px"
                }}>
                  <div style={{ fontSize: "11px", fontWeight: "700", color: "#dc2626", textTransform: "uppercase" }}>
                    ⚠️ Cancelar Venta (Revertir Stock)
                  </div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <div style={{ flex: 1 }}>
                      <input
                        type="password"
                        placeholder="PIN Gerente"
                        maxLength={4}
                        value={pendingCancelPin}
                        onChange={(e) => handlePendingCancelPinChange(e.target.value)}
                        className="input-corporate"
                        style={{ padding: "6px 10px", fontSize: "12px", width: "100%" }}
                      />
                      {pendingCancelFieldErrors.pin && <p style={styles.fieldError}>{pendingCancelFieldErrors.pin}</p>}
                    </div>
                    <div style={{ flex: 2 }}>
                      <input
                        type="text"
                        placeholder="Motivo de cancelación"
                        value={pendingCancelReason}
                        onChange={(e) => handlePendingCancelReasonChange(e.target.value)}
                        className="input-corporate"
                        style={{ padding: "6px 10px", fontSize: "12px", width: "100%" }}
                      />
                      {pendingCancelFieldErrors.reason && <p style={styles.fieldError}>{pendingCancelFieldErrors.reason}</p>}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "10px" }}>
                    <button
                      onClick={() => handlePendingQrCancel("other_method")}
                      disabled={pendingCancelLoading}
                      style={{
                        flex: 1,
                        padding: "10px 8px",
                        borderRadius: "6px",
                        border: "none",
                        backgroundColor: "#598ffbff",
                        color: "white",
                        fontWeight: "700",
                        fontSize: "11px",
                        cursor: pendingCancelLoading ? "default" : "pointer"
                      }}
                    >
                      PAGAR CON OTRO MÉTODO
                    </button>
                    <button
                      onClick={() => handlePendingQrCancel("cancel_def")}
                      disabled={pendingCancelLoading}
                      style={{
                        flex: 1,
                        padding: "10px 8px",
                        borderRadius: "6px",
                        border: "none",
                        backgroundColor: "#dc2626",
                        color: "white",
                        fontWeight: "700",
                        fontSize: "11px",
                        cursor: pendingCancelLoading ? "default" : "pointer"
                      }}
                    >
                      CANCELAR DEFINITIVAMENTE
                    </button>
                  </div>
                </div>
              )}

              <div style={{ display: "flex", gap: "10px", marginTop: "14px", borderTop: "1px solid #f1f5f9", paddingTop: "12px" }}>
                <button
                  onClick={() => {
                    setViewingPendingQrSale(null);
                    setPendingCancelPin("");
                    setPendingCancelReason("");
                    setPendingCancelFieldErrors({});
                  }}
                  style={{ ...styles.modalBtn, backgroundColor: "#64748b", color: "white" }}
                >
                  CERRAR
                </button>
                {isQrExpired(viewingPendingQrSale) && viewingPendingQrSale.status !== "approved" && viewingPendingQrSale.status !== "rejected" ? (
                  <button
                    onClick={() => handleRegenerateQr(viewingPendingQrSale)}
                    style={{ ...styles.modalBtn, backgroundColor: "#2563eb", color: "white" }}
                  >
                    🔄 GENERAR NUEVO QR
                  </button>
                ) : (
                  viewingPendingQrSale.status !== "approved" && (
                    <button
                      onClick={() => checkPendingQrStatus(viewingPendingQrSale.invoiceNumber)}
                      disabled={pendingQrChecking === viewingPendingQrSale.invoiceNumber}
                      style={{ ...styles.modalBtn, backgroundColor: "#059669", color: "white" }}
                    >
                      {pendingQrChecking === viewingPendingQrSale.invoiceNumber ? "VERIFICANDO..." : "VERIFICAR ESTADO"}
                    </button>
                  )
                )}
              </div>
            </div>
          </div>
        )}

        {renderTicketEmailModal()}
      </div>
    );
  }

  // ===========================================================================
  // RENDER D: DASHBOARD PRINCIPAL DEL CAJERO (Mockup 7)
  // ===========================================================================
  return (
    <div style={styles.appContainer} className="pos-cashier-app">
      <style>{TICKET_PRINT_MEDIA_STYLES}</style>
      {/* Navbar */}
      <header style={styles.navbar} className="pos-cashier-navbar">
        <div style={styles.navBrand}>
          <Store size={22} color="#ffffff" />
          <span style={styles.brandText} className="pos-cashier-brand-text">POS - PUNTO DE VENTA</span>
        </div>
        <button onClick={handleLogoutClick} style={styles.logoutBtn} className="active-tap pos-cashier-logout-btn">
          <LogOut size={16} /> Cerrar Sesión
        </button>
      </header>

      <div style={styles.mainLayout} className="pos-cashier-main-layout">
        {/* Sidebar */}
        <aside style={styles.sidebar} className="pos-cashier-sidebar">
          <div style={styles.sidebarProfile} className="pos-cashier-sidebar-profile">
            <div style={styles.avatarCircle}>
              <Users size={22} color="#ffffff" />
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <h4 style={styles.profileName}>
                {user?.name}
                <span style={{ fontSize: "11px", fontWeight: "normal", color: "#64748b", marginLeft: "8px", display: "inline-block" }}>
                  {currentTime.toLocaleDateString()} {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </h4>
              <p style={styles.profileBranch}>{user?.branch.name}</p>
            </div>
          </div>
        </aside>

        {/* Content Area */}
        <div style={styles.contentArea} className="pos-cashier-content">
          {/* Alerta de Límite de Efectivo en Caja Chica (Fase 3.0) */}
          {sessionStats && sessionStats.expectedAmount > 5000 && (
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              backgroundColor: "#fffbeb",
              border: "1px solid #fef3c7",
              borderRadius: "8px",
              padding: "12px 16px",
              marginBottom: "16px",
              color: "#b45309"
            }} className="pos-cashier-cash-alert">
              <AlertTriangle size={20} color="#d97706" />
              <div style={{ flex: 1 }}>
                <strong style={{ fontSize: "14px", fontWeight: "700" }}>⚠️ Alerta de Efectivo en Caja Chica</strong>
                <p style={{ fontSize: "12px", margin: "2px 0 0 0", color: "#b45309" }}>
                  El efectivo actual en caja (${sessionStats.expectedAmount.toFixed(2)} MXN) supera el límite establecido de $5,000.00 MXN. 
                  Por favor, registre un <strong>Depósito Bancario (Cash Drop)</strong> para retirar el excedente.
                </p>
              </div>
              <button 
                onClick={() => setActiveModal("bank-deposit")}
                style={{
                  backgroundColor: "#d97706",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "4px",
                  padding: "6px 12px",
                  fontSize: "12px",
                  fontWeight: "700",
                  cursor: "pointer",
                  transition: "background-color 0.15s ease"
                }}
                className="active-tap pos-cashier-cash-alert-btn"
              >
                DEPOSITAR AHORA
              </button>
            </div>
          )}

          {/* Tarjetas Superiores Estatus (Mockup 7) */}
          <div style={styles.statsGrid} className="pos-cashier-stats-grid">
            <div style={styles.statusCard}>
              <span style={styles.cardHeaderLabel}>CAJA ESTATUS</span>
              <h3 style={{ fontSize: "20px", fontWeight: "800", color: "#059669", marginTop: "4px" }}>ABIERTA</h3>
            </div>
            <div style={styles.statusCard}>
              <span style={styles.cardHeaderLabel}>TOTAL VENDIDO</span>
              <h3 style={{ fontSize: "20px", fontWeight: "800", color: "#0f172a", marginTop: "4px" }}>
                ${sessionStats?.totalSalesAmount.toFixed(2) || "0.00"}
              </h3>
            </div>
            <div style={styles.statusCard}>
              <span style={styles.cardHeaderLabel}>VENTAS REALIZADAS</span>
              <h3 style={{ fontSize: "20px", fontWeight: "800", color: "#0f172a", marginTop: "4px" }}>
                {sessionStats?.salesCount || 0} ventas
              </h3>
            </div>
            <div style={styles.statusCard}>
              <span style={styles.cardHeaderLabel}>FONDO INICIAL</span>
              <h3 style={{ fontSize: "20px", fontWeight: "800", color: "#475569", marginTop: "4px" }}>
                ${sessionStats?.initialAmount.toFixed(2) || "0.00"}
              </h3>
            </div>
            <div style={styles.statusCard}>
              <span style={styles.cardHeaderLabel}>EFECTIVO ESPERADO</span>
              <h3 style={{ fontSize: "20px", fontWeight: "800", color: "#1e3a8a", marginTop: "4px" }}>
                ${sessionStats?.expectedAmount.toFixed(2) || "0.00"}
              </h3>
            </div>
            <div style={styles.statusCard}>
              <span style={styles.cardHeaderLabel}>TURNO INICIADO</span>
              <h3 style={{ fontSize: "16px", fontWeight: "800", color: "#475569", marginTop: "6px" }}>
                {session?.openedAt ? new Date(session.openedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "8:00 am"}
              </h3>
            </div>
          </div>

          {/* ACCIONES RÁPIDAS (Mockup 7) */}
          <div style={{ marginTop: "24px" }}>
            <h4 style={styles.sectionSubtitle}>ACCIONES RÁPIDAS</h4>
            <div style={styles.actionsGrid} className="pos-cashier-actions-grid">
              <button onClick={handleNuevaVenta} style={styles.actionBtn} className="active-tap pos-cashier-action-btn">
                <BadgePercent size={28} color="#1e3a8a" />
                <span>Nueva Venta</span>
              </button>
              <button onClick={() => setActiveModal("price-lookup")} style={styles.actionBtn} className="active-tap pos-cashier-action-btn">
                <Search size={28} color="#1e3a8a" />
                <span>Consultar precio</span>
              </button>
              <button onClick={() => setActiveModal("ticket-history")} style={styles.actionBtn} className="active-tap pos-cashier-action-btn">
                <Printer size={28} color="#1e3a8a" />
                <span>Reimprimir ticket</span>
              </button>
              <button onClick={() => setActiveModal("cancel-sale")} style={styles.actionBtn} className="active-tap pos-cashier-action-btn">
                <XCircle size={28} color="#1e3a8a" />
                <span>Solicitar Cancelación</span>
              </button>
              <button onClick={() => setActiveModal("close-options")} style={styles.actionBtn} className="active-tap pos-cashier-action-btn">
                <Store size={28} color="#dc2626" />
                <span>Cerrar Caja</span>
              </button>
              <button onClick={() => setActiveModal("bank-deposit")} style={styles.actionBtn} className="active-tap pos-cashier-action-btn">
                <PiggyBank size={28} color="#0d9488" />
                <span>Depósito Banco</span>
              </button>
              <button onClick={() => setActiveModal("returns")} style={styles.actionBtn} className="active-tap pos-cashier-action-btn">
                <RotateCcw size={28} color="#dc2626" />
                <span>Devoluciones</span>
              </button>
              <button onClick={() => window.open("/autofacturacion", "_blank")} style={styles.actionBtn} className="active-tap pos-cashier-action-btn">
                <FileText size={28} color="#0d9488" />
                <span>Autofacturación</span>
              </button>
            </div>
          </div>

          {/* Tablas Inferiores (Mockup 7) */}
          <div style={styles.tablesGrid} className="pos-cashier-tables-grid">
            {/* Últimas Ventas */}
            <div className="card-premium pos-cashier-table-card" style={styles.tableCard}>
              <h4 style={styles.tableCardTitle}>ÚLTIMAS VENTAS</h4>
              <div style={{ overflowY: "auto", flex: 1, marginTop: "12px" }} className="pos-cashier-table-scroll pos-cashier-table-scroll--dashboard-sales">
                <table style={styles.table}>
                  <thead>
                    <tr style={styles.tableHeaderRow}>
                      <th style={styles.th}>FOLIO</th>
                      <th style={styles.th}>HORA</th>
                      <th style={styles.th}>TOTAL</th>
                      <th style={styles.th}>PAGO</th>
                      <th style={styles.th}>CAJERO</th>
                      <th style={styles.th}>ESTADO</th>
                      <th style={styles.th} className="pos-cashier-responsive-menu-head">MAS</th>
                      <th style={styles.th}>ACCIÓN</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentSales.map((sale) => {
                      const isExpanded = expandedSalesRows.has(sale.id);
                      return (
                        <React.Fragment key={sale.id}>
                          <tr 
                            style={styles.tableRow}
                            className={isExpanded ? "pos-cashier-table-row-expanded" : ""}
                          >
                            <td data-label="Folio" style={{ ...styles.td, fontWeight: "600" }}>{sale.invoiceNumber}</td>
                            <td data-label="Hora" style={styles.td}>
                              {new Date(sale.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </td>
                            <td data-label="Total" style={{ ...styles.td, fontWeight: "700" }}>${sale.totalAmount.toFixed(2)}</td>
                            <td data-label="Pago" style={styles.td}>{sale.paymentMethod}</td>
                            <td data-label="Cajero" style={styles.td}>{sale.cajero}</td>
                            <td data-label="Estado" style={styles.td}>
                              <span style={{
                                color: sale.status === "CANCELADA" ? "#dc2626" : "#059669",
                                fontWeight: "700",
                                fontSize: "12px"
                              }}>
                                {sale.status === "CANCELADA" ? "Cancelado" : "Activo"}
                              </span>
                            </td>
                            <td data-label="Acción" style={styles.td}>
                              <button
                                onClick={() => handleOpenDashboardSaleTicket(sale)}
                                disabled={dashboardTicketLoadingId === sale.id}
                                style={{ ...styles.actionLink, opacity: dashboardTicketLoadingId === sale.id ? 0.65 : 1 }}
                              >
                                Ver Ticket v
                              </button>
                              <button
                                onClick={() => toggleSalesRow(sale.id)}
                                className="pos-cashier-table-expand-btn"
                              >
                                {isExpanded ? "Ocultar detalles" : "Ver detalles"}
                              </button>
                            </td>
                            <td style={styles.td} className="pos-cashier-responsive-menu-cell">
                              <button
                                type="button"
                                className="pos-cashier-kebab-btn"
                                aria-label="Opciones de venta"
                                onClick={() => setOpenDashboardTableMenu(openDashboardTableMenu === `sale-${sale.id}` ? null : `sale-${sale.id}`)}
                              >
                                <MoreVertical size={18} />
                              </button>
                              {openDashboardTableMenu === `sale-${sale.id}` && (
                                <div className="pos-cashier-row-menu">
                                  <button
                                    type="button"
                                    disabled={dashboardTicketLoadingId === sale.id}
                                    onClick={() => handleOpenDashboardSaleTicket(sale)}
                                  >
                                    Ver Ticket
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      toggleSalesRow(sale.id);
                                      setOpenDashboardTableMenu(null);
                                    }}
                                  >
                                    {isExpanded ? "Ocultar detalles" : "Ver mas detalles"}
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                          {/* Fila de detalles adicionales para responsive */}
                          <tr className="pos-cashier-table-details-row">
                            <td colSpan={8} style={{ padding: 0 }}>
                              <div className="pos-cashier-table-details">
                                <div className="pos-cashier-table-details-content">
                                  <span className="pos-cashier-table-details-label">PAGO:</span>
                                  <span className="pos-cashier-table-details-value">{sale.paymentMethod}</span>
                                </div>
                                <div className="pos-cashier-table-details-content">
                                  <span className="pos-cashier-table-details-label">CAJERO:</span>
                                  <span className="pos-cashier-table-details-value">{sale.cajero}</span>
                                </div>
                                <div className="pos-cashier-table-details-content pos-cashier-sale-status-detail">
                                  <span className="pos-cashier-table-details-label">ESTADO:</span>
                                  <span className="pos-cashier-table-details-value">{sale.status === "CANCELADA" ? "Cancelado" : "Activo"}</span>
                                </div>
                                <div className="pos-cashier-table-details-content">
                                  <span className="pos-cashier-table-details-label">ACCIÓN:</span>
                                  <span className="pos-cashier-table-details-value">
                                    <button
                                      onClick={async () => {
                                        try {
                                          const res = await api.get(`/api/sales/detail?id=${sale.id}`);
                                          setSelectedSale({
                                            ...res.data.sale,
                                            refundStatus: sale.refundStatus,
                                            isNewSale: false
                                          });
                                          setActiveModal("ticket-view");
                                        } catch (e: any) {
                                          showToast(e.response?.data?.message || "Error al recuperar los detalles de la venta.", "error");
                                        }
                                      }}
                                      style={styles.actionLink}
                                    >
                                      Ver Ticket v
                                    </button>
                                  </span>
                                </div>
                                <button
                                  onClick={() => toggleSalesRow(sale.id)}
                                  className="pos-cashier-table-expand-btn"
                                >
                                  {isExpanded ? "▲ Ocultar detalles" : "▼ Ver detalles"}
                                </button>
                              </div>
                            </td>
                          </tr>
                        </React.Fragment>
                      );
                    })}
                    {recentSales.length === 0 && (
                      <tr>
                        <td colSpan={7} style={{ textAlign: "center", padding: "24px 12px", color: "#64748b", fontSize: "13px" }}>
                          Aún no tienes ventas registradas en este turno.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Solicitudes de Cancelación / Historial de depósitos */}
            <div className="card-premium pos-cashier-table-card" style={styles.tableCard}>
              <h4 style={styles.tableCardTitle}>HISTORIAL DE DEPÓSITOS BANCARIOS</h4>
              <div style={{ overflowY: "auto", flex: 1, marginTop: "12px" }} className="pos-cashier-table-scroll pos-cashier-table-scroll--deposits pos-cashier-table-scroll--dashboard-deposits">
                <table style={styles.table}>
                  <thead>
                    <tr style={styles.tableHeaderRow}>
                      <th style={styles.th}>CUENTA TARGET</th>
                      <th style={styles.th}>BENEFICIARIO</th>
                      <th style={styles.th}>MONTO</th>
                      <th style={styles.th} className="pos-cashier-responsive-menu-head">MAS</th>
                      <th style={styles.th}>ESTADO</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentDeposits.map((dep) => {
                      const isExpanded = expandedDepositRows.has(dep.id);
                      return (
                        <React.Fragment key={dep.id}>
                          <tr 
                            style={styles.tableRow}
                            className={isExpanded ? "pos-cashier-table-row-expanded" : ""}
                          >
                            <td data-label="Cuenta" style={styles.td}>**** **** **** {dep.accountNumber.slice(-4)}</td>
                            <td data-label="Beneficiario" style={styles.td}>{dep.targetName}</td>
                            <td data-label="Monto" style={{ ...styles.td, fontWeight: "700", color: "#dc2626" }}>-${dep.amount.toFixed(2)}</td>
                            <td data-label="Estado" style={styles.td}>
                              <span style={styles.badgeSuccess}>Exitoso</span>
                              <button
                                onClick={() => toggleDepositRow(dep.id)}
                                className="pos-cashier-table-expand-btn"
                              >
                                {isExpanded ? "Ocultar detalles" : "Ver detalles"}
                              </button>
                            </td>
                            <td style={styles.td} className="pos-cashier-responsive-menu-cell">
                              <button
                                type="button"
                                className="pos-cashier-kebab-btn"
                                aria-label="Opciones de deposito"
                                onClick={() => setOpenDashboardTableMenu(openDashboardTableMenu === `deposit-${dep.id}` ? null : `deposit-${dep.id}`)}
                              >
                                <MoreVertical size={18} />
                              </button>
                              {openDashboardTableMenu === `deposit-${dep.id}` && (
                                <div className="pos-cashier-row-menu">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      toggleDepositRow(dep.id);
                                      setOpenDashboardTableMenu(null);
                                    }}
                                  >
                                    {isExpanded ? "Ocultar detalles" : "Ver mas detalles"}
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                          {/* Fila de detalles adicionales para responsive */}
                          <tr className="pos-cashier-table-details-row">
                            <td colSpan={5} style={{ padding: 0 }}>
                              <div className="pos-cashier-table-details">
                                <div className="pos-cashier-table-details-content">
                                  <span className="pos-cashier-table-details-label">ESTADO:</span>
                                  <span className="pos-cashier-table-details-value">Exitoso</span>
                                </div>
                                <button
                                  onClick={() => toggleDepositRow(dep.id)}
                                  className="pos-cashier-table-expand-btn"
                                >
                                  {isExpanded ? "▲ Ocultar detalles" : "▼ Ver detalles"}
                                </button>
                              </div>
                            </td>
                          </tr>
                        </React.Fragment>
                      );
                    })}
                    {recentDeposits.length === 0 && (
                      <tr>
                        <td colSpan={5} style={{ textAlign: "center", padding: "20px", color: "#64748b" }}>
                          No hay depósitos bancarios registrados en este turno.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* CAPA DE MODALES GLOBALES DE ACCIONES RÁPIDAS */}
      {/* ========================================================================= */}

      {/* MODAL 1: CONSULTAR PRECIO / LOOKUP (Mockup 6) */}
      <PriceLookupModal
        isOpen={activeModal === "price-lookup"}
        onClose={handleCloseLookup}
        lookupQuery={lookupQuery}
        onQueryChange={(v) => setLookupQuery(validateTextInput(v))}
        lookupResults={lookupResults}
        onLookupKeyDown={handleLookupKeyDown}
      />

      {/* MODAL: AUTORIZACIÓN PIN GERENTE/ADMIN PARA CARRITO (Fase 3.0) */}
      {renderCartAuthorizationModal()}

      {/* MODAL 2: SOLICITAR CANCELACIÓN CON PIN DE ADMIN (Mockup 1) */}
      <CancelSaleModal
        isOpen={activeModal === "cancel-sale"}
        onClose={handleCloseModal_cancelSale}
        cancelInvoice={cancelInvoice}
        cancelPin={cancelPin}
        cancelReason={cancelReason}
        cancelFieldErrors={cancelFieldErrors}
        cancelLoading={cancelLoading}
        cancelSalePreview={cancelSalePreview}
        onSetField={setCancelField}
        onSubmit={handleCancelSaleSubmit}
      />

      {/* MODAL 3: TICKET IMPRESO/PDF (Mockup 3) */}
      <TicketViewModal
        isOpen={activeModal === "ticket-view" && !!selectedSale}
        selectedSale={selectedSale}
        user={user}
        ticketEmailModalOpen={ticketEmailModalOpen}
        onClose={handleCloseTicket}
        onPrint={handlePrintTicket}
        actionButtons={selectedSale ? renderTicketActionButtons({
          onClose: handleCloseTicket,
          closeLabel: "CERRAR TICKET",
          onPrint: handlePrintTicket,
          emailConfig: {
            subject: `Ticket de venta ${selectedSale.invoiceNumber}`,
            elementId: "print-area",
            defaultEmail: selectedSale.customerEmail || null,
          },
        }) : null}
      />

      {/* MODAL: OPCIONES DE CIERRE DE CAJA */}
      <CloseOptionsModal
        isOpen={activeModal === "close-options"}
        onClose={() => setActiveModal(null)}
        onPartialCut={() => setActiveModal("partial-cut-summary")}
        onCloseCash={() => setActiveModal("close-cash")}
      />

      {/* MODAL: CORTE PARCIAL (Resumen) */}
      <PartialCutSummaryModal
        isOpen={activeModal === "partial-cut-summary"}
        onBack={() => setActiveModal("close-options")}
        onSave={handleSavePartialCut}
        partialCutLoading={partialCutLoading}
        sessionStats={sessionStats}
        userName={user?.name}
      />

      {/* MODAL: COMPROBANTE DE CORTE PARCIAL */}
      <PartialCutReceiptModal
        isOpen={activeModal === "partial-cut-receipt" && !!partialCutData}
        partialCutData={partialCutData}
        user={user}
        onClose={handleCloseModal_partialCut}
        onPrint={() => {
          const printed = printTicketElementById(`Corte Parcial #${partialCutData?.cutNumber}`, "partial-cut-thermal-receipt");
          if (!printed) alert("Habilite las ventanas emergentes para imprimir el comprobante.");
        }}
        emailButton={partialCutData ? renderTicketEmailButton({
          subject: `Corte parcial #${partialCutData.cutNumber}`,
          elementId: "partial-cut-thermal-receipt",
        }) : null}
      />

      {/* MODAL 4: CIERRE DE CAJA / ARQUEO (Mockup 2) */}
      <CloseCashModal
        isOpen={activeModal === "close-cash"}
        sessionStats={sessionStats}
        user={user}
        declaredCash={declaredCash}
        declaredCashError={declaredCashError}
        calculatedDifference={calculatedDifference}
        closingLoading={closingLoading}
        onDeclaredCashChange={setDeclaredCash}
        onDeclaredCashErrorChange={setDeclaredCashError}
        onClose={handleCloseModal_closeCash}
        onConfirmClose={handleCloseShift}
      />

      {/* MODAL 5: DEPOSITO BANCARIO (Resguardo de Efectivo) */}
      <BankDepositModal
        isOpen={activeModal === "bank-deposit"}
        onClose={() => setActiveModal(null)}
        user={user}
        sessionStats={sessionStats}
        onOpenDepositReceipt={(deposit) => {
          setLastDeposit(deposit);
          setActiveModal("deposit-receipt");
          loadDashboardData();
        }}
        onToast={showToast}
        onActionComplete={loadDashboardData}
      />

      {/* MODAL: COMPROBANTE DE RETIRO/DEPÓSITO BANCARIO (Fase 3.0) */}
      <DepositReceiptModal
        isOpen={activeModal === "deposit-receipt" && !!lastDeposit}
        lastDeposit={lastDeposit}
        user={user}
        onClose={() => setActiveModal(null)}
        onPrint={() => {
          const printed = printTicketElementById(`Comprobante de Retiro #${lastDeposit?.id}`, "deposit-thermal-receipt");
          if (!printed) alert("Habilite las ventanas emergentes para imprimir el comprobante.");
        }}
        onSync={handleSyncDepositForReceipt}
        emailButton={lastDeposit ? renderTicketEmailButton({
          subject: `Comprobante de retiro #${lastDeposit.id}`,
          elementId: "deposit-thermal-receipt",
        }) : null}
      />

      {/* MODAL: VER QR DE PAGO PENDIENTE Y CONTROL DE CANCELACIÓN */}
      {viewingPendingQrSale && (
        <div style={{ ...styles.modalOverlay, zIndex: 9999 }} className="pos-cashier-modal-overlay pos-cashier-modal-overlay--center">
          <div style={styles.checkoutModal} className="pos-cashier-modal">
            <h3 style={{ textAlign: "center", textTransform: "uppercase", fontSize: "14px", color: "#475569", fontWeight: "700" }}>PAGO QR MERCADO PAGO</h3>
            
            <div style={{ textAlign: "center", padding: "12px 0" }}>
               <p style={{ marginBottom: "10px", fontSize: "13px", color: "#475569" }}>
                 Escanea el siguiente código para pagar la venta <strong>${Number(viewingPendingQrSale.amount).toFixed(2)}</strong>
               </p>
               {viewingPendingQrSale.qrUrl ? (
                 <>
                   <img
                     src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(viewingPendingQrSale.qrUrl)}`}
                     alt="QR Code"
                     width="180"
                     height="180"
                     loading="lazy"
                   />
                   <div style={{ marginTop: "10px" }}>
                     <a 
                       href={viewingPendingQrSale.qrUrl} 
                       target="_blank" 
                       rel="noopener noreferrer" 
                       style={{ 
                         fontSize: "12px", 
                         color: "#2563eb", 
                         textDecoration: "underline", 
                         fontWeight: "600", 
                         display: "inline-block", 
                         padding: "6px 12px", 
                         backgroundColor: "#f1f5f9", 
                         borderRadius: "6px" 
                       }}
                     >
                       🔗 Abrir enlace de pago / Sandbox
                     </a>
                   </div>
                 </>
               ) : (
                 <p style={{ fontSize: "12px", color: "#64748b" }}>Código QR no disponible.</p>
               )}
               <p style={{ marginTop: "10px", fontSize: "11px", color: "#64748b" }}>Folio: {viewingPendingQrSale.invoiceNumber}</p>
            </div>

            {/* Formulario de Cancelación con PIN si la venta sigue pendiente */}
            {viewingPendingQrSale.status !== "approved" && (
              <div style={{
                borderTop: "1px dashed #e2e8f0",
                paddingTop: "12px",
                marginTop: "8px",
                display: "flex",
                flexDirection: "column",
                gap: "10px"
              }}>
                <div style={{ fontSize: "11px", fontWeight: "700", color: "#dc2626", textTransform: "uppercase" }}>
                  ⚠️ Cancelar Venta (Revertir Stock)
                </div>
                
                <div style={{ display: "flex", gap: "8px" }}>
                  <div style={{ flex: 1 }}>
                    <input
                      type="password"
                      placeholder="PIN Gerente"
                      maxLength={4}
                      value={pendingCancelPin}
                      onChange={(e) => handlePendingCancelPinChange(e.target.value)}
                      className="input-corporate"
                      style={{ padding: "6px 10px", fontSize: "12px" }}
                    />
                    {pendingCancelFieldErrors.pin && <p style={styles.fieldError}>{pendingCancelFieldErrors.pin}</p>}
                  </div>
                  <div style={{ flex: 2 }}>
                    <input
                      type="text"
                      placeholder="Motivo de cancelación"
                      value={pendingCancelReason}
                      onChange={(e) => handlePendingCancelReasonChange(e.target.value)}
                      className="input-corporate"
                      style={{ padding: "6px 10px", fontSize: "12px" }}
                    />
                    {pendingCancelFieldErrors.reason && <p style={styles.fieldError}>{pendingCancelFieldErrors.reason}</p>}
                  </div>
                </div>

                  <div style={{ display: "flex", gap: "10px" }}>
                    <button
                      onClick={() => handlePendingQrCancel("other_method")}
                      disabled={pendingCancelLoading}
                      style={{
                        flex: 1,
                        padding: "10px 8px",
                        borderRadius: "6px",
                        border: "none",
                        backgroundColor: "#598ffbff",
                        color: "white",
                        fontWeight: "700",
                        fontSize: "11px",
                        cursor: pendingCancelLoading ? "default" : "pointer"
                      }}
                    >
                      PAGAR CON OTRO MÉTODO
                    </button>
                    <button
                      onClick={() => handlePendingQrCancel("cancel_def")}
                      disabled={pendingCancelLoading}
                      style={{
                        flex: 1,
                        padding: "10px 8px",
                        borderRadius: "6px",
                        border: "none",
                        backgroundColor: "#dc2626",
                        color: "white",
                        fontWeight: "700",
                        fontSize: "11px",
                        cursor: pendingCancelLoading ? "default" : "pointer"
                      }}
                    >
                      CANCELAR DEFINITIVAMENTE
                    </button>
                  </div>
              </div>
            )}

            <div style={{ display: "flex", gap: "10px", marginTop: "14px", borderTop: "1px solid #f1f5f9", paddingTop: "12px" }}>
              <button
                onClick={() => {
                  setViewingPendingQrSale(null);
                  setPendingCancelPin("");
                  setPendingCancelReason("");
                  setPendingCancelFieldErrors({});
                }}
                style={{ ...styles.modalBtn, backgroundColor: "#64748b", color: "white" }}
              >
                CERRAR
              </button>
              {isQrExpired(viewingPendingQrSale) && viewingPendingQrSale.status !== "approved" && viewingPendingQrSale.status !== "rejected" ? (
                <button
                  onClick={() => handleRegenerateQr(viewingPendingQrSale)}
                  style={{ ...styles.modalBtn, backgroundColor: "#2563eb", color: "white" }}
                >
                  🔄 GENERAR NUEVO QR
                </button>
              ) : (
                viewingPendingQrSale.status !== "approved" && (
                  <button
                    onClick={() => checkPendingQrStatus(viewingPendingQrSale.invoiceNumber)}
                    style={{ ...styles.modalBtn, backgroundColor: "#059669", color: "white" }}
                  >
                    VERIFICAR ESTADO
                  </button>
                )
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: COMPROBANTE DE CIERRE DE CAJA / Z-CUT */}
      <CloseReceiptModal
        isOpen={activeModal === "close-receipt" && !!lastClosedStats}
        lastClosedStats={lastClosedStats}
        user={user}
        onClose={handleCloseModal_closeCash}
        onPrint={() => {
          const printed = printTicketElementById(`Corte Z - Sesion #${lastClosedStats?.session?.id}`, "close-thermal-receipt");
          if (!printed) alert("Habilite las ventanas emergentes para imprimir el comprobante.");
        }}
        emailButton={lastClosedStats ? renderTicketEmailButton({
          subject: `Corte Z - Sesión #${lastClosedStats.session?.id}`,
          elementId: "close-thermal-receipt",
        }) : null}
      />

      {/* REIMPRIMIR TICKET MODAL */}
      <TicketHistoryModal
        isOpen={activeModal === "ticket-history"}
        onClose={() => setActiveModal(null)}
        onSelectSale={(sale) => {
          setSelectedSale(sale);
          setActiveModal("ticket-view");
        }}
      />

            {/* MODAL: MÓDULO DE DEVOLUCIONES */}
      <ReturnsModal
        isOpen={activeModal === "returns"}
        onClose={() => setActiveModal(null)}
        user={user}
        onReturnCompleted={loadDashboardData}
        onToast={showToast}
        onOpenEmailModal={openTicketEmailModal}
      />

            {/* MODAL: CONFIRMACIÓN DE BORRADOR DE VENTA */}
      {showDraftConfirm && (
        <div style={styles.modalOverlay} className="pos-cashier-modal-overlay pos-cashier-modal-overlay--center">
          <div style={{ ...styles.cancelModal, width: "400px" }} className="pos-cashier-modal">
            <h3 style={styles.modalTitle}>Venta en borrador encontrada</h3>
            <p style={{ fontSize: "13px", color: "#475569", margin: "12px 0 20px 0", textAlign: "center", lineHeight: "1.5" }}>
              Existe una venta en borrador con <strong>{cart.length > 0 ? cart.length : loadDraft().length} producto(s)</strong> en el carrito.
              ¿Desea continuar con la venta guardada o iniciar una nueva?
            </p>
            <div style={{ display: "flex", gap: "10px" }}>
              <button
                onClick={() => {
                  // Descartar borrador e iniciar nueva venta
                  setCart([]);
                  localStorage.removeItem(DRAFT_KEY);
                  setShowDraftConfirm(false);
                  setView("sales-terminal");
                }}
                style={{ ...styles.modalBtn, backgroundColor: "#dc2626", color: "white" }}
              >
                NUEVA VENTA
              </button>
              <button
                onClick={() => {
                  // Restaurar borrador y continuar
                  const draft = loadDraft();
                  if (draft.length > 0 && cart.length === 0) {
                    setCart(draft);
                  }
                  setShowDraftConfirm(false);
                  setView("sales-terminal");
                }}
                style={{ ...styles.modalBtn, backgroundColor: "#059669", color: "white" }}
              >
                CONTINUAR BORRADOR
              </button>
            </div>
          </div>
        </div>
      )}
      {renderTicketEmailModal()}
      {renderDashboardTicketLoading()}
      {renderToast()}
    </div>
  );
};

// Estilos premium que calcan la estética y estructura de todas las maquetas (1 a 8)
const styles: { [key: string]: React.CSSProperties } = {
  loadingScreen: {
    display: "flex",
    flexDirection: "column" as const,
    justifyContent: "center",
    alignItems: "center",
    minHeight: "100vh",
    backgroundColor: "#f8fafc",
  },
  spinner: {
    width: "40px",
    height: "40px",
    borderRadius: "50%",
    border: "3px solid #cbd5e1",
    borderTop: "3px solid #1e3a8a",
    animation: "spin 1s linear infinite",
  },
  appContainer: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column" as const,
    backgroundColor: "#f8fafc",
  },
  navbar: {
    height: "64px",
    backgroundColor: "#1e3a8a", // Azul corporativo maqueta
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "0 24px",
    boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
  },
  navBrand: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },
  brandText: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: "16px",
    letterSpacing: "-0.3px",
  },
  logoutBtn: {
    backgroundColor: "transparent",
    border: "1px solid #93c5fd",
    color: "#ffffff",
    padding: "6px 12px",
    borderRadius: "4px",
    fontSize: "13px",
    fontWeight: "600",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    transition: "all 0.15s ease",
  },
  mainLayout: {
    display: "flex",
    flex: 1,
  },
  sidebar: {
    width: "250px",
    backgroundColor: "#ffffff",
    borderRight: "1px solid #e2e8f0",
    padding: "24px",
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
  },
  sidebarProfile: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    textAlign: "center" as const,
    gap: "8px",
  },
  avatarCircle: {
    width: "48px",
    height: "48px",
    borderRadius: "50%",
    backgroundColor: "#1e3a8a",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarIcon: {
    width: "48px",
    height: "48px",
    borderRadius: "50%",
    backgroundColor: "#f1f5f9",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    border: "1px solid #cbd5e1",
  },
  profileName: {
    fontSize: "14px",
    fontWeight: "700",
    color: "#0f172a",
  },
  profileBranch: {
    fontSize: "12px",
    color: "#64748b",
  },
  contentArea: {
    flex: 1,
    padding: "24px",
    overflowY: "auto" as const,
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(6, 1fr)",
    gap: "14px",
  },
  statusCard: {
    backgroundColor: "#ffffff",
    border: "1px solid #3b82f6", // Contorno azul maquetas
    borderRadius: "6px",
    padding: "16px 12px",
    boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
    display: "flex",
    flexDirection: "column" as const,
  },
  cardHeaderLabel: {
    fontSize: "9px",
    fontWeight: "700",
    color: "#64748b",
    letterSpacing: "0.5px",
    textTransform: "uppercase" as const,
  },
  sectionSubtitle: {
    fontSize: "12px",
    fontWeight: "700",
    color: "#475569",
    letterSpacing: "0.5px",
    marginBottom: "10px",
  },
  actionsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: "16px",
  },
  actionBtn: {
    backgroundColor: "#ffffff",
    border: "1px solid #3b82f6",
    borderRadius: "8px",
    padding: "20px 10px",
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: "10px",
    cursor: "pointer",
    fontSize: "12px",
    fontWeight: "700",
    color: "#1e3a8a",
    boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
    transition: "all 0.15s ease",
  },
  tablesGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "20px",
    marginTop: "24px",
  },
  tableCard: {
    padding: "20px",
    height: "360px",
    display: "flex",
    flexDirection: "column" as const,
  },
  tableCardTitle: {
    fontSize: "11px",
    fontWeight: "800",
    color: "#ffffff",
    backgroundColor: "#3b82f6", // Cabecera azul maquetas
    padding: "8px 12px",
    borderRadius: "4px",
    letterSpacing: "0.5px",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse" as const,
    textAlign: "left" as const,
  },
  fieldError: {
    color: "#b91c1c",
    fontSize: "12px",
    fontWeight: "600",
    marginTop: "5px",
    marginBottom: 0,
  },
  tableHeaderRow: {
    borderBottom: "2px solid #e2e8f0",
  },
  th: {
    padding: "10px 12px",
    fontSize: "11px",
    fontWeight: "700",
    color: "#475569",
    textTransform: "uppercase" as const,
  },
  tableRow: {
    borderBottom: "1px solid #f1f5f9",
  },
  td: {
    padding: "12px",
    fontSize: "13px",
    color: "#334155",
  },
  actionLink: {
    background: "none",
    border: "none",
    color: "#2563eb",
    fontWeight: "600",
    fontSize: "12px",
    cursor: "pointer",
  },
  badgeSuccess: {
    backgroundColor: "#dcfce7",
    color: "#15803d",
    fontSize: "10px",
    fontWeight: "700",
    padding: "2px 6px",
    borderRadius: "4px",
  },
  badgeDanger: {
    backgroundColor: "#fee2e2",
    color: "#b91c1c",
    fontSize: "10px",
    fontWeight: "700",
    padding: "2px 6px",
    borderRadius: "4px",
  },
  badgeWarning: {
    backgroundColor: "#fef3c7",
    color: "#b45309",
    fontSize: "10px",
    fontWeight: "700",
    padding: "2px 6px",
    borderRadius: "4px",
  },
  aperturaCard: {
    maxWidth: "400px",
    margin: "80px auto",
    backgroundColor: "#ffffff",
    border: "1px solid #3b82f6",
    borderRadius: "12px",
    padding: "36px",
    boxShadow: "0 10px 15px -3px rgba(0,0,0,0.05)",
    textAlign: "center" as const,
  },
  cardMainTitle: {
    fontSize: "20px",
    fontWeight: "800",
    color: "#1e3a8a",
    letterSpacing: "-0.5px",
    marginBottom: "8px",
  },
  inputGroup: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "6px",
    textAlign: "left" as const,
  },
  label: {
    fontSize: "11px",
    fontWeight: "700",
    color: "#475569",
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
  },
  submitBtn: {
    backgroundColor: "#2563eb",
    color: "#ffffff",
    border: "none",
    padding: "12px",
    borderRadius: "6px",
    fontWeight: "700",
    cursor: "pointer",
    boxShadow: "0 4px 6px rgba(37,99,235,0.15)",
  },

  // Estilos de la Terminal de Ventas
  terminalHeader: {
    height: "56px",
    backgroundColor: "#ffffff",
    borderBottom: "2px solid #3b82f6",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "0 24px",
  },
  terminalBackBtn: {
    width: "38px",
    height: "38px",
    borderRadius: "6px",
    border: "1px solid #cbd5e1",
    backgroundColor: "#ffffff",
    color: "#1e3a8a",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 1px 2px rgba(15,23,42,0.06)",
  },
  terminalBody: {
    flex: 1,
    padding: "20px",
    display: "flex",
    flexDirection: "column" as const,
    gap: "16px",
  },
  terminalSearchArea: {
    padding: "16px",
    position: "relative" as const,
  },
  searchResultsDropdown: {
    position: "absolute" as const,
    top: "100%",
    left: "16px",
    right: "16px",
    backgroundColor: "#ffffff",
    border: "1px solid #cbd5e1",
    borderRadius: "6px",
    boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)",
    zIndex: 50,
    maxHeight: "200px",
    overflowY: "auto" as const,
  },
  dropdownItem: {
    padding: "12px 16px",
    display: "flex",
    justifyContent: "space-between",
    cursor: "pointer",
    borderBottom: "1px solid #f1f5f9",
    fontSize: "14px",
  },
  qtyContainer: {
    display: "flex",
    alignItems: "center",
    border: "1px solid #cbd5e1",
    borderRadius: "4px",
    width: "fit-content",
    overflow: "hidden",
  },
  qtyBtn: {
    width: "28px",
    height: "28px",
    border: "none",
    backgroundColor: "#f1f5f9",
    cursor: "pointer",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
  },
  qtyText: {
    padding: "0 12px",
    fontSize: "13px",
    fontWeight: "700",
  },
  qtyInput: {
    padding: "0 12px",
    fontSize: "13px",
    fontWeight: "700",
    width: "40px",
    textAlign: "center",
    border: "none",
    outline: "none",
    backgroundColor: "transparent",
  },
  terminalSummary: {
    borderTop: "2px solid #e2e8f0",
    paddingTop: "16px",
    marginTop: "auto",
  },
  summaryRow: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: "13px",
    color: "#475569",
  },
  summaryTotal: {
    borderTop: "1px solid #cbd5e1",
    paddingTop: "8px",
    fontSize: "18px",
    fontWeight: "800",
    color: "#0f172a",
  },
  terminalBtn: {
    padding: "12px 24px",
    borderRadius: "6px",
    border: "none",
    fontWeight: "700",
    fontSize: "14px",
    cursor: "pointer",
  },

  // Modales
  modalOverlay: {
    position: "fixed" as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(15, 23, 42, 0.4)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 100,
  },
  checkoutModal: {
    width: "420px",
    backgroundColor: "#ffffff",
    borderRadius: "12px",
    padding: "28px",
    boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)",
    display: "flex",
    flexDirection: "column" as const,
    gap: "16px",
  },
  checkoutTotalBox: {
    backgroundColor: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: "8px",
    padding: "16px",
    fontSize: "36px",
    fontWeight: "800",
    color: "#dc2626", // Total grande rojo del mockup
    textAlign: "center" as const,
  },
  payMethodsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: "8px",
  },
  payMethodBtn: {
    padding: "12px 6px",
    borderRadius: "6px",
    border: "1px solid #cbd5e1",
    backgroundColor: "#ffffff",
    fontSize: "11px",
    fontWeight: "700",
    cursor: "pointer",
    textAlign: "center" as const,
  },
  payMethodActive: {
    border: "1px solid #2563eb",
    backgroundColor: "#eff6ff",
    color: "#1d4ed8",
  },
  modalBtn: {
    flex: 1,
    padding: "10px",
    borderRadius: "6px",
    border: "none",
    fontWeight: "700",
    cursor: "pointer",
    textAlign: "center" as const,
  },
  lookupModal: {
    width: "480px",
    backgroundColor: "#ffffff",
    borderRadius: "12px",
    padding: "24px",
    boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)",
    display: "flex",
    flexDirection: "column" as const,
    gap: "14px",
  },
  modalTitle: {
    fontSize: "16px",
    fontWeight: "800",
    color: "#0f172a",
    borderBottom: "1px solid #e2e8f0",
    paddingBottom: "8px",
  },
  cancelModal: {
    width: "420px",
    backgroundColor: "#ffffff",
    borderRadius: "12px",
    padding: "28px",
    boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)",
  },
  closeModal: {
    width: "420px",
    backgroundColor: "#ffffff",
    borderRadius: "12px",
    padding: "28px",
    boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)",
  },
  depositModal: {
    width: "700px",
    maxWidth: "95vw",
    backgroundColor: "#ffffff",
    borderRadius: "12px",
    padding: "28px",
    boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)",
  },
  historyModal: {
    width: "520px",
    maxWidth: "95vw",
    backgroundColor: "#ffffff",
    borderRadius: "12px",
    padding: "24px",
    boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)",
  },
  ticketModal: {
    width: "calc(80mm + 48px)",
    maxWidth: "95vw",
    backgroundColor: "#ffffff",
    borderRadius: "12px",
    padding: "24px",
    boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)",
  },
  ticketContainer: {
    boxSizing: "border-box",
    width: "80mm",
    maxWidth: "80mm",
    margin: "0 auto",
    padding: "10px 12px",
    border: "1px solid #d4d4d4",
    borderRadius: "4px",
    backgroundColor: "#ffffff",
    color: "#111111",
    fontFamily: '"Courier New", monospace',
    fontSize: "10px",
    lineHeight: "1.25",
    maxHeight: "55vh",
    overflowY: "auto",
  },
  conflictScreen: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    minHeight: "100vh",
    width: "100vw",
    backgroundColor: "#f8fafc",
    padding: "20px",
    boxSizing: "border-box",
    position: "fixed",
    top: 0,
    left: 0,
    zIndex: 9999,
  },
  conflictCard: {
    width: "440px",
    maxWidth: "100%",
    backgroundColor: "#ffffff",
    borderRadius: "16px",
    padding: "48px 32px 36px 32px",
    boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.05), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
    textAlign: "center",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    border: "1px solid #f1f5f9",
  },
  conflictIconContainer: {
    width: "72px",
    height: "72px",
    borderRadius: "50%",
    backgroundColor: "#fef2f2",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: "28px",
  },
  conflictTitle: {
    color: "#0f172a",
    fontSize: "22px",
    fontWeight: "700",
    margin: "0 0 16px 0",
    fontFamily: "'Outfit', 'Inter', sans-serif",
    letterSpacing: "-0.5px",
  },
  conflictText: {
    color: "#475569",
    fontSize: "14px",
    lineHeight: "1.6",
    margin: "0 0 32px 0",
    fontFamily: "'Inter', sans-serif",
    maxWidth: "340px",
  },
  conflictButton: {
    width: "100%",
    padding: "14px 20px",
    fontSize: "15px",
    fontWeight: "600",
    borderRadius: "10px",
    backgroundColor: "#598ffbff",
    color: "#ffffff",
    border: "none",
    cursor: "pointer",
    transition: "background-color 0.2s, transform 0.1s",
    boxShadow: "0 4px 6px -1px rgba(89, 143, 251, 0.2)",
  },
  select: {
    width: "100%",
    padding: "10px 14px",
    borderRadius: "6px",
    border: "1px solid #cbd5e1",
    backgroundColor: "#ffffff",
    color: "#0f172a",
    fontSize: "14px",
    fontWeight: "500",
    outline: "none",
  },
};
export default Dashboard;
