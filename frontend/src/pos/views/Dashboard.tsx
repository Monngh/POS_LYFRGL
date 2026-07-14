import React, { useState, useEffect, useCallback, useRef } from "react";
import { Navigate } from "react-router-dom";
import "../../pos-cashier-responsive.css";
import "../../pos-modern.css";
import { useAuth } from "../../auth";
import { useLockScreen } from "../hooks/useLockScreen";
import { LockScreen } from "../components/LockScreen";
import {
  AperturaView,
  SalesTerminalView,
  PriceLookupModal,
  CancelSaleModal,
  PartialCutSummaryModal,
  TicketViewModal,
  PartialCutReceiptModal,
  CloseCashModal,
  DepositReceiptModal,
  CloseReceiptModal,
  TicketHistoryModal,
  BankDepositModal,
  ReturnsModal,
  CartAuthorizationModal,
  TicketEmailModal,
  ShiftSummaryModal,
} from "../components";
import api from "../../shared/services/api";
import { useCashSession } from "../hooks/useCashSession";
import { usePosCustomer } from "../hooks/usePosCustomer";
import { usePosCart } from "../hooks/usePosCart";
import { usePosSearch } from "../hooks/usePosSearch";
import { useModalInitialFocus } from "../hooks/useModalInitialFocus";
import { printTicketElementById, ticketPdfFilename } from "../../shared/utils/ticketEmailDocument.util";
import { generateTicketPdfBase64 } from "../../shared/utils/ticketPdf.util";
import {
  normalizeIntegerInput,
  validateInteger,
  validateReference,
} from "../../shared/utils/formValidation";
import { Printer, AlertTriangle, Mail, CreditCard, Trash2, X, RefreshCw, RefreshCcw, ExternalLink } from "lucide-react";



const validateTextInput = (value: string): string =>
  value
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, "")
    .replace(/[^\p{L}\p{N}\s\-,.]/gu, "");

const validateReasonInput = (value: string): string =>
  value
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, "")
    .replace(/[^a-záéíóúàèìòùäëïöüâêîôûñçA-ZÁÉÓÚÀÈÌÒÙÄËÖÜÂÊÎÔÛÑÇ0-9\s.,]/g, "");

const validateFolioInput = (value: string): string =>
  value
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, "")
    .replace(/[^a-zA-Z0-9\-]/g, "");

const Dashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const {
    isLocked,
    lock,
    unlock,
    unlockError,
    unlockLoading,
    setUnlockError,
  } = useLockScreen({ user });

  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Vistas del Cajero: "apertura" | "sales-terminal"
  const [view, setView] = useState<"apertura" | "sales-terminal">("sales-terminal");
  // Bloqueo: el turno de caja del usuario está abierto en otro equipo
  const [cajaLockedByOtherDevice, setCajaLockedByOtherDevice] = useState(false);
  const [loading, setLoading] = useState(true);



  // Modales de Acción Rápida: null | "price-lookup" | "ticket-history" | "cancel-sale" | "close-cash" | "bank-deposit" | "close-options" | "partial-cut-summary" | "partial-cut-receipt"
  const [activeModal, setActiveModal] = useState<string | null>(null);


  // Estados para alertas personalizadas y cobro (Fase 3.5)
  const [toast, setToast] = useState<{ message: string; type: "error" | "success" | "info" | "warning" } | null>(null);

  const showToast = useCallback((message: string, type: "error" | "success" | "info" | "warning" = "error") => {
    setToast({ message, type });
  }, []);

  const sessionData = useCashSession({
    user,
    onToast: showToast,
    onSetView: setView,
    onSetLoading: setLoading,
    onSetCajaLockedByOtherDevice: setCajaLockedByOtherDevice,
    onSetActiveModal: setActiveModal,
  });
  const {
    session,
    sessionStats,
    lastClosedStats,
    setLastClosedStats,
    forcedCloseData,
    clearForcedClose,
    partialCutLoading,
    partialCutData,
    setPartialCutData,
    declaredCash,
    setDeclaredCash,
    declaredCashError,
    setDeclaredCashError,
    closingLoading,
    calculatedDifference,
    blockedByOtherTab,
    blockedSession,
    handleClaimSessionHere,
    loadDashboardData,
    handleCloseShift,
    handleSavePartialCut,
  } = sessionData;

  const customerData = usePosCustomer({ onToast: showToast, view });
  const {
    selectedCustomer,
    setSelectedCustomer,
    setCustomerSearch,
    setCustomerSearchResults,
    setIsCustomerDropdownOpen,
    setIsNewCustomerModalOpen,
    setNewCustomerError,
  } = customerData;

  const [selectedSale, setSelectedSale] = useState<any>(null);
  const [depositTab, setDepositTab] = useState<"registrar" | "buscar">("registrar");
  const [initialReturnFolio, setInitialReturnFolio] = useState<string | null>(null);

  const cartData = usePosCart({
    user,
    selectedCustomer,
    onToast: showToast,
    onSetSelectedSale: setSelectedSale,
    onSetSelectedCustomer: setSelectedCustomer,
    onSetActiveModal: setActiveModal,
    onCancelSale: resetCurrentSaleAndReturnToDashboard,
  });
  const {
    cart,
    setCart,
    showDraftConfirm,
    setShowDraftConfirm,
    DRAFT_KEY,
    loadDraft,
    setPendingCartAction,
    cartPin,
    setCartPin,
    cartPinError,
    setCartPinError,
    cartPinLoading,
    setSimulationData,
    setCheckoutModalOpen,
    setCheckoutError,
    paymentMethod,
    setPaymentMethod,
    setCashReceived,
    setMixtoCash,
    setMixtoCard,
    setCardType,
    clearCartAndDraft,
    setQrModalOpen,
    setQrUrl,
    setQrReference,
    cartTotal,
    qrUrl,
    qrReference,
    isQrExpired,
    setUsePoints,
    setPointsToRedeem,
    setInvoiceRequested,
    handleCartPinSubmit,
    addProductToCart,
  } = cartData;

  const draftModalRef = useModalInitialFocus(showDraftConfirm, {
    preferSelector: '[data-shortcut="confirm"]',
  });

  const searchData = usePosSearch({
    view,
    activeModal,
    onProductFound: addProductToCart,
  });
  const {
    lookupQuery,
    setLookupQuery,
    lookupCategory,
    setLookupCategory,
    lookupResults,
    handleLookupSearch,
    handleLookupKeyDown,
    lookupSelectionIndex,
    setLookupSelectionIndex,
    resetLookup,
    resetSearch,
  } = searchData;

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
  }

  const handleLogoutClick = () => {
    if (session && session.status === "ABIERTA" && user?.role === "CAJERO") {
      showToast("No puede cerrar sesión si tiene un turno de caja activo. Por favor realice su Cierre de Caja primero.", "error");
      return;
    }
    logout();
  };


  const handleReprintRecentSale = async (saleId: number) => {
    try {
      const res = await api.get(`/api/sales/detail?id=${saleId}`);
      setSelectedSale({
        ...res.data.sale,
        isNewSale: false
      });
      setActiveModal("ticket-view");
    } catch (e: any) {
      showToast(e.response?.data?.message || "Error al recuperar los detalles de la venta.", "error");
    }
  };

  const handleStartReturnFromRecent = (saleId: number) => {
    const sale = sessionData.recentSales?.find((s: any) => s.id === saleId);
    if (sale) {
      setInitialReturnFolio(sale.invoiceNumber);
      setActiveModal("returns");
    } else {
      showToast("No se pudo encontrar el folio de la venta seleccionada.", "error");
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
    const isWarning = toast.type === "warning";
    const bg = isError ? "#fef2f2" : isSuccess ? "#f0fdf4" : isWarning ? "#fffbeb" : "#f0f9ff";
    const border = isError ? "#fca5a5" : isSuccess ? "#bbf7d0" : isWarning ? "#fde68a" : "#bae6fd";
    const textColor = isError ? "#991b1b" : isSuccess ? "#166534" : isWarning ? "#92400e" : "#075985";
    
    return (
      <div 
        className="toast-premium"
        style={{
          position: "fixed",
          bottom: "80px",
          left: "90px",
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

  // ---------------------------------------------------------------------------
  // 4. TERMINAL DE VENTAS (Mockup 5)
  // ---------------------------------------------------------------------------


  // Envío de ticket por correo
  const [ticketEmailModalOpen, setTicketEmailModalOpen] = useState(false);
  const [ticketEmailInput, setTicketEmailInput] = useState("");
  const [ticketEmailError, setTicketEmailError] = useState("");
  const [ticketEmailLoading, setTicketEmailLoading] = useState(false);
  const [ticketEmailSubject, setTicketEmailSubject] = useState("");
  const [ticketEmailElementId, setTicketEmailElementId] = useState<string | null>(null);
  const [ticketEmailHtml, setTicketEmailHtml] = useState<string | null>(null);


  // Función auxiliar eliminada por desuso en refactorización


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
      showToast("Habilite las ventanas emergentes para imprimir el ticket.", "warning");
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
      }, { skipGlobalErrorToast: true });
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


  const renderTicketEmailButton = (emailConfig: {
    subject: string;
    elementId?: string;
    htmlContent?: string;
    defaultEmail?: string | null;
  }) => (
    <button
      type="button"
      data-shortcut-action="send-email"
      data-shortcut-letter="S"
      title="Enviar por Correo (Alt+S)"
      onClick={() => openTicketEmailModal(emailConfig)}
      style={{ padding: "10px 24px", borderRadius: "8px", border: "1px solid var(--border)", backgroundColor: "transparent", color: "var(--text)", fontWeight: "600", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}
    >
      <Mail size={16} /> Enviar por Correo
      <span style={{ fontSize: "9px", backgroundColor: "rgba(0,0,0,0.08)", color: "var(--text-secondary)", padding: "1px 4px", borderRadius: "3px", fontWeight: "800", lineHeight: 1, marginLeft: "2px" }}>Alt+S</span>
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
    <>
      <button
        title="Cerrar (Esc)"
        data-shortcut="cancel"
        data-shortcut-letter="X"
        onClick={options.onClose}
        style={{ padding: "10px 24px", borderRadius: "8px", border: "1px solid var(--border)", backgroundColor: "transparent", color: "var(--text)", fontWeight: "600", cursor: "pointer" }}
      >
        {options.closeLabel || "Cerrar"}
      </button>
      {renderTicketEmailButton(options.emailConfig)}
      <button
        title="Imprimir (Alt+C)"
        data-shortcut="confirm"
        data-shortcut-letter="C"
        onClick={options.onPrint}
        style={{ padding: "10px 24px", borderRadius: "8px", border: "none", backgroundColor: "#2563eb", color: "white", fontWeight: "600", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}
      >
        <Printer size={16} /> {options.printLabel || "Imprimir"}
      </button>
    </>
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
        const sale = res.data.sale;
        
        if (sale.status === "CANCELED" || sale.status === "CANCELADA") {
          setCancelFieldErrors(prev => ({ ...prev, invoice: "Esta venta ya fue cancelada en su totalidad." }));
          setCancelSalePreview(null);
        } else if (sale.status === "BILLED" || sale.status === "FACTURADA") {
          setCancelFieldErrors(prev => ({ ...prev, invoice: "Las ventas facturadas no se pueden cancelar por este medio." }));
          setCancelSalePreview(null);
        } else if (sale.returns && sale.returns.length > 0) {
          setCancelFieldErrors(prev => ({ ...prev, invoice: "Venta con devoluciones parciales. Use el módulo de devoluciones." }));
          setCancelSalePreview(null);
        } else if (new Date(sale.createdAt).toDateString() !== new Date().toDateString()) {
          setCancelFieldErrors(prev => ({ ...prev, invoice: "Solo se pueden cancelar ventas del mismo día." }));
          setCancelSalePreview(null);
        } else {
          // Limpiar error de invoice si era válido
          setCancelFieldErrors(prev => { 
            const n = { ...prev }; 
            delete n.invoice;
            return n; 
          });
          setCancelSalePreview(sale);
        }
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
    const reasonError = validateReference(cancelReason, "El motivo", { required: true, max: 100 });
    if (reasonError) errors.reason = reasonError;
    return errors;
  };

  const setCancelField = (field: "invoice" | "pin" | "reason", value: string) => {
    const nextValue =
      field === "pin" ? normalizeIntegerInput(value).slice(0, 4) :
      field === "invoice" ? validateFolioInput(value) :
      field === "reason" ? validateReasonInput(value).slice(0, 100) :
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
            : validateReference(nextValue, "El motivo", { required: true, max: 100 });
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
    } catch {
      // Manejado por el interceptor global de errores (api.ts) — mismo mensaje.
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

  const pendingCancelPinInputRef = useRef<HTMLInputElement>(null);
  const pendingCancelReasonInputRef = useRef<HTMLInputElement>(null);

  // Focus PIN Gerente when viewingPendingQrSale opens
  useEffect(() => {
    if (viewingPendingQrSale && viewingPendingQrSale.status !== "approved") {
      const timer = setTimeout(() => {
        pendingCancelPinInputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [viewingPendingQrSale]);

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
    } catch {
      // Manejado por el interceptor global de errores (api.ts) — mismo mensaje.
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
    } catch {
      // Manejado por el interceptor global de errores (api.ts) — mismo mensaje.
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
        setPendingCartAction(null);
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
  // Modal bloqueante de cierre forzado — se muestra en todas las vistas del POS
  // ---------------------------------------------------------------------------
  const forcedCloseModal = forcedCloseData ? (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.78)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 9999,
      }}
    >
      <div
        style={{
          backgroundColor: "var(--surface)",
          borderRadius: "12px",
          padding: "36px 32px",
          maxWidth: "420px",
          width: "90%",
          boxShadow: "0 20px 40px rgba(0,0,0,0.35)",
          textAlign: "center",
        }}
      >
        <div style={{ marginBottom: "16px", display: "flex", justifyContent: "center" }}>
          <div style={{ width: "64px", height: "64px", borderRadius: "50%", backgroundColor: "#fef2f2", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <AlertTriangle size={32} color="#ef4444" />
          </div>
        </div>
        <h2
          style={{
            fontSize: "20px",
            fontWeight: "800",
            color: "var(--text)",
            marginBottom: "10px",
          }}
        >
          Sesión de caja cerrada
        </h2>
        <p style={{ fontSize: "14px", color: "var(--text-secondary)", marginBottom: "20px" }}>
          Un administrador ha cerrado tu sesión de caja.
        </p>
        <div
          style={{
            backgroundColor: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            padding: "14px 16px",
            marginBottom: "28px",
            textAlign: "left",
          }}
        >
          <span style={{ fontSize: "12px", fontWeight: "700", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.4px" }}>
            Motivo
          </span>
          <p
            style={{
              fontSize: "14px",
              color: "var(--text)",
              fontWeight: "600",
              marginTop: "6px",
              wordBreak: "break-word",
            }}
          >
            {forcedCloseData.reason}
          </p>
        </div>
        <button
          onClick={() => {
            clearForcedClose();
            logout();
          }}
          style={{
            width: "100%",
            padding: "12px",
            backgroundColor: "var(--accent)",
            color: "#ffffff",
            border: "none",
            borderRadius: "8px",
            fontSize: "15px",
            fontWeight: "700",
            cursor: "pointer",
          }}
        >
          Aceptar
        </button>
      </div>
    </div>
  ) : null;

  // ---------------------------------------------------------------------------
  // RENDER PANTALLA DE CARGA
  // ---------------------------------------------------------------------------
  if (loading) {
    return (
      <>
        <div style={styles.loadingScreen}>
          <div style={styles.spinner} />
          <p style={{ fontWeight: "600", color: "var(--text-muted)", marginTop: "12px" }}>Cargando terminal de ventas...</p>
        </div>
        {forcedCloseModal}
      </>
    );
  }

  // ===========================================================================
  // RENDER A: PANEL ADMINISTRATIVO CENTRAL (Dashboard de métricas)
  // ===========================================================================
  if (user && (user.role === "ADMIN" || user.role === "GERENTE")) {
    return <Navigate to="/admin" replace />;
  }

  // ===========================================================================
  // RENDER BLOQUEO: TURNO DE CAJA ABIERTO EN OTRO EQUIPO
  // ===========================================================================
  if (cajaLockedByOtherDevice) {
    return (
      <>
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
        {forcedCloseModal}
      </>
    );
  }

  // ===========================================================================
  // RENDER BLOQUEO: TURNO DE CAJA ABIERTO EN OTRA PESTAÑA DEL MISMO DISPOSITIVO
  // ===========================================================================
  if (blockedByOtherTab && blockedSession) {
    return (
      <>
        <div id="tab-conflict-screen" style={styles.conflictScreen}>
          <div style={styles.conflictCardWide}>
            <div style={styles.conflictIconContainer}>
              <AlertTriangle size={36} color="#f97316" />
            </div>
            <h2 style={styles.conflictTitle}>Caja abierta en otra pestaña</h2>
            <p style={styles.conflictTextWide}>
              Ya existe una sesión de caja abierta en otra pestaña de este mismo navegador. Solo puede usar la sesión en una pestaña a la vez.
            </p>
            <p style={styles.conflictTextWide}>
              Si desea continuar en esta pestaña, presione <strong>Usar aquí</strong>. La otra pestaña dejará de poder operar la caja.
            </p>
            <div style={styles.conflictActionRow}>
              <button
                type="button"
                onClick={handleClaimSessionHere}
                className="btn-primary active-tap"
                style={styles.conflictButton}
              >
                Usar aquí
              </button>
              <button
                type="button"
                onClick={logout}
                className="btn-secondary active-tap"
                style={styles.conflictSecondaryButton}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
        {forcedCloseModal}
      </>
    );
  }

  // ===========================================================================
  // RENDER B: APERTURA DE CAJA OBLIGATORIA (Mockup 8)
  // ===========================================================================
  if (view === "apertura") {
    return (
      <>
        <AperturaView
          sessionData={sessionData}
          user={user}
          currentTime={currentTime}
          onLogout={handleLogoutClick}
        />

        {renderToast()}
        {forcedCloseModal}
      </>
    );
  }

  // ===========================================================================
  // RENDER D: TERMINAL DE VENTAS (Mockup 5)
  // ===========================================================================
  return (
    <>
      <SalesTerminalView
        sessionData={sessionData}
        cartData={cartData}
        searchData={searchData}
        customerData={customerData}
        user={user}
        currentTime={currentTime}
        onOpenModal={setActiveModal}
        onToast={showToast}
        pendingQrSales={pendingQrSales}
        pendingQrChecking={pendingQrChecking}
        checkPendingQrStatus={checkPendingQrStatus}
        setPendingCancelFieldErrors={setPendingCancelFieldErrors}
        setViewingPendingQrSale={setViewingPendingQrSale}
        addPendingQrSale={addPendingQrSale}
        onLogout={handleLogoutClick}
        onLock={lock}
        onReprintTicket={handleReprintRecentSale}
        onStartReturn={handleStartReturnFromRecent}
      />
      {/* ========================================================================= */}
      {/* CAPA DE MODALES GLOBALES DE ACCIONES RÁPIDAS */}
      {/* ========================================================================= */}

      {/* MODAL 1: CONSULTAR PRECIO / LOOKUP (Mockup 6) */}
      <PriceLookupModal
        isOpen={activeModal === "price-lookup"}
        onClose={handleCloseLookup}
        lookupQuery={lookupQuery}
        onQueryChange={(v) => setLookupQuery(validateTextInput(v))}
        lookupCategory={lookupCategory}
        onCategoryChange={(val) => {
          setLookupCategory(val);
          handleLookupSearch(undefined, val);
        }}
        lookupResults={lookupResults}
        onLookupKeyDown={handleLookupKeyDown}
        lookupSelectionIndex={lookupSelectionIndex}
        setLookupSelectionIndex={setLookupSelectionIndex}
      />

      {/* MODAL: AUTORIZACIÓN PIN GERENTE/ADMIN PARA CARRITO (Fase 3.0) */}
      <CartAuthorizationModal
        isOpen={activeModal === "cart-pin-auth"}
        cartPin={cartPin}
        cartPinError={cartPinError}
        cartPinLoading={cartPinLoading}
        onCartPinChange={(val) => {
          setCartPin(val);
          if (cartPinError) setCartPinError("");
        }}
        onSubmit={handleCartPinSubmit}
        onCancel={() => {
          setPendingCartAction(null);
          setCartPin("");
          setCartPinError("");
          setActiveModal(null);
        }}
      />

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

      {/* MODAL: RESUMEN DE TURNO */}
      <ShiftSummaryModal
        isOpen={activeModal === "shift-summary"}
        onClose={() => setActiveModal(null)}
        sessionStats={sessionStats}
        session={session}
        activePaymentMethod={paymentMethod as string | null}
      />

      {/* MODAL 3: TICKET IMPRESO/PDF (Mockup 3) */}
      <TicketViewModal
        isOpen={activeModal === "ticket-view" && !!selectedSale}
        selectedSale={selectedSale}
        user={user}
        onClose={handleCloseTicket}
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


      {/* MODAL: CORTE PARCIAL (Resumen) */}
      <PartialCutSummaryModal
        isOpen={activeModal === "partial-cut-summary"}
        onBack={() => setActiveModal(null)}
        onClose={() => setActiveModal(null)}
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
          if (!printed) showToast("Habilite las ventanas emergentes para imprimir el comprobante.", "warning");
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
        onClose={() => {
          setActiveModal(null);
          setDepositTab("registrar");
        }}
        user={user}
        sessionStats={sessionStats}
        onOpenDepositReceipt={(deposit) => {
          setLastDeposit(deposit);
          setActiveModal("deposit-receipt");
          loadDashboardData();
        }}
        onToast={showToast}
        onActionComplete={loadDashboardData}
        initialTab={depositTab}
        onTabChange={setDepositTab}
      />

      {/* MODAL: COMPROBANTE DE RETIRO/DEPÓSITO BANCARIO (Fase 3.0) */}
      <DepositReceiptModal
        isOpen={activeModal === "deposit-receipt" && !!lastDeposit}
        lastDeposit={lastDeposit}
        user={user}
        onClose={() => setActiveModal("bank-deposit")}
        onPrint={() => {
          const printed = printTicketElementById(`Comprobante de Retiro #${lastDeposit?.id}`, "deposit-thermal-receipt");
          if (!printed) showToast("Habilite las ventanas emergentes para imprimir el comprobante.", "warning");
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
            <h3 style={{ textAlign: "center", textTransform: "uppercase", fontSize: "14px", color: "var(--text-secondary)", fontWeight: "700" }}>PAGO QR MERCADO PAGO</h3>
            
            <div style={{ textAlign: "center", padding: "12px 0" }}>
               <p style={{ marginBottom: "10px", fontSize: "13px", color: "var(--text-secondary)" }}>
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
                         backgroundColor: "var(--surface-3)", 
                         borderRadius: "6px" 
                       }}
                     >
                       <ExternalLink size={12} style={{ marginRight: "4px", verticalAlign: "middle" }} /> Abrir enlace de pago / Sandbox
                     </a>
                   </div>
                 </>
               ) : (
                 <p style={{ fontSize: "12px", color: "var(--text-muted)" }}>Código QR no disponible.</p>
               )}
               <p style={{ marginTop: "10px", fontSize: "11px", color: "var(--text-muted)" }}>Folio: {viewingPendingQrSale.invoiceNumber}</p>
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
                <div style={{ fontSize: "11px", fontWeight: "700", color: "#dc2626", textTransform: "uppercase", display: "flex", alignItems: "center", gap: "4px" }}>
                  <AlertTriangle size={12} /> Cancelar Venta (Revertir Stock)
                </div>
                
                <div style={{ display: "flex", gap: "8px" }}>
                  <div style={{ flex: 1 }}>
                    <input
                      ref={pendingCancelPinInputRef}
                      type="password"
                      placeholder="PIN Gerente"
                      maxLength={4}
                      value={pendingCancelPin}
                      onChange={(e) => handlePendingCancelPinChange(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          pendingCancelReasonInputRef.current?.focus();
                        }
                      }}
                      className="input-corporate"
                      style={{ padding: "6px 10px", fontSize: "12px" }}
                    />
                    {pendingCancelFieldErrors.pin && <p style={styles.fieldError}>{pendingCancelFieldErrors.pin}</p>}
                  </div>
                  <div style={{ flex: 2 }}>
                    <input
                      ref={pendingCancelReasonInputRef}
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
                      className="btn-qr-outline-blue"
                      data-shortcut-letter="O"
                      title="Pagar con otro método (Alt+O)"
                      style={{
                        flex: 1,
                        padding: "10px 8px",
                        borderRadius: "6px",
                        fontWeight: "700",
                        fontSize: "10px",
                        cursor: pendingCancelLoading ? "default" : "pointer"
                      }}
                    >
                      <CreditCard size={14} />
                      <span>PAGAR CON OTRO MÉTODO</span>
                      <span style={{ fontSize: "8px", backgroundColor: "rgba(59,130,246,0.12)", padding: "1px 3px", borderRadius: "3px", fontWeight: "800" }}>Alt+O</span>
                    </button>
                    <button
                      onClick={() => handlePendingQrCancel("cancel_def")}
                      disabled={pendingCancelLoading}
                      className="btn-qr-outline-red"
                      data-shortcut-letter="D"
                      title="Cancelar definitivamente (Alt+D)"
                      style={{
                        flex: 1,
                        padding: "10px 8px",
                        borderRadius: "6px",
                        fontWeight: "700",
                        fontSize: "10px",
                        cursor: pendingCancelLoading ? "default" : "pointer"
                      }}
                    >
                      <Trash2 size={14} />
                      <span>CANCELAR DEFINITIVAMENTE</span>
                      <span style={{ fontSize: "8px", backgroundColor: "rgba(220,38,38,0.12)", padding: "1px 3px", borderRadius: "3px", fontWeight: "800" }}>Alt+D</span>
                    </button>
                  </div>
              </div>
            )}

            <div style={{ display: "flex", gap: "10px", marginTop: "14px", borderTop: "1px solid var(--surface-3)", paddingTop: "12px" }}>
              <button
                onClick={() => {
                  setViewingPendingQrSale(null);
                  setPendingCancelPin("");
                  setPendingCancelReason("");
                  setPendingCancelFieldErrors({});
                }}
                className="btn-qr-outline-gray"
                data-shortcut="cancel"
                data-shortcut-letter="X"
                title="Cerrar (Esc)"
                style={{ flex: 1, padding: "10px 8px", borderRadius: "6px", fontWeight: "700", fontSize: "11px", cursor: "pointer" }}
              >
                <X size={14} />
                <span>CERRAR</span>
                <span style={{ fontSize: "8px", backgroundColor: "rgba(100,116,139,0.12)", padding: "1px 3px", borderRadius: "3px", fontWeight: "800" }}>Esc</span>
              </button>
              {isQrExpired(viewingPendingQrSale) && viewingPendingQrSale.status !== "approved" && viewingPendingQrSale.status !== "rejected" ? (
                <button
                  onClick={() => handleRegenerateQr(viewingPendingQrSale)}
                  className="btn-qr-outline-blue"
                  data-shortcut-letter="G"
                  title="Generar nuevo QR (Alt+G)"
                  style={{ flex: 1, padding: "10px 8px", borderRadius: "6px", fontWeight: "700", fontSize: "11px", cursor: "pointer" }}
                >
                  <RefreshCcw size={14} />
                  <span>GENERAR NUEVO QR</span>
                  <span style={{ fontSize: "8px", backgroundColor: "rgba(37,99,235,0.12)", padding: "1px 3px", borderRadius: "3px", fontWeight: "800" }}>Alt+G</span>
                </button>
              ) : (
                viewingPendingQrSale.status !== "approved" && (
                  <button
                    onClick={() => checkPendingQrStatus(viewingPendingQrSale.invoiceNumber)}
                    className="btn-qr-outline-green"
                    data-shortcut-action="verify-payment"
                    data-shortcut-letter="W"
                    title="Verificar estado (Alt+W)"
                    style={{ flex: 1, padding: "10px 8px", borderRadius: "6px", fontWeight: "700", fontSize: "11px", cursor: "pointer" }}
                  >
                    <RefreshCw size={14} />
                    <span>VERIFICAR ESTADO</span>
                    <span style={{ fontSize: "8px", backgroundColor: "rgba(5,150,105,0.12)", padding: "1px 3px", borderRadius: "3px", fontWeight: "800" }}>Alt+W</span>
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
          if (!printed) showToast("Habilite las ventanas emergentes para imprimir el comprobante.", "warning");
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
        onClose={() => {
          setActiveModal(null);
          setInitialReturnFolio(null);
        }}
        user={user}
        onReturnCompleted={loadDashboardData}
        onToast={showToast}
        onOpenEmailModal={openTicketEmailModal}
        initialFolio={initialReturnFolio}
      />

            {/* MODAL: CONFIRMACIÓN DE BORRADOR DE VENTA */}
      {showDraftConfirm && (
        <div style={styles.modalOverlay} className="pos-cashier-modal-overlay pos-cashier-modal-overlay--center" data-pos-modal>
          <div ref={draftModalRef} style={{ ...styles.cancelModal, width: "400px" }} className="pos-cashier-modal" tabIndex={-1}>
            <h3 style={styles.modalTitle}>Venta en borrador encontrada</h3>
            <p style={{ fontSize: "13px", color: "var(--text-secondary)", margin: "12px 0 20px 0", textAlign: "center", lineHeight: "1.5" }}>
              Existe una venta en borrador con <strong>{cart.length > 0 ? cart.length : loadDraft().length} producto(s)</strong> en el carrito.
              ¿Desea continuar con la venta guardada o iniciar una nueva?
            </p>
            <div style={{ display: "flex", gap: "10px" }} data-pos-modal-footer>
              <button
                data-shortcut="cancel"
                data-shortcut-letter="X"
                title="Nueva venta (Esc)"
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
                data-shortcut="confirm"
                data-shortcut-letter="C"
                title="Continuar borrador (Enter, Alt+C)"
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
      {forcedCloseModal}
      <TicketEmailModal
        isOpen={ticketEmailModalOpen}
        emailInput={ticketEmailInput}
        emailError={ticketEmailError}
        emailLoading={ticketEmailLoading}
        onEmailChange={(val) => {
          setTicketEmailInput(val);
          if (ticketEmailError) setTicketEmailError("");
        }}
        onSend={handleSendTicketEmail}
        onCancel={() => {
          setTicketEmailModalOpen(false);
          setTicketEmailError("");
        }}
      />

      {renderToast()}
      {isLocked && (
        <LockScreen
          user={user}
          unlock={unlock}
          unlockError={unlockError}
          setUnlockError={setUnlockError}
          unlockLoading={unlockLoading}
        />
      )}
    </>
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
    backgroundColor: "var(--surface-2)",
  },
  spinner: {
    width: "40px",
    height: "40px",
    borderRadius: "50%",
    border: "3px solid var(--border-strong)",
    borderTop: "3px solid var(--accent-strong)",
    animation: "spin 1s linear infinite",
  },
  appContainer: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column" as const,
    backgroundColor: "var(--surface-2)",
  },
  navbar: {
    height: "64px",
    backgroundColor: "var(--accent-strong)", // Azul corporativo maqueta
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
    backgroundColor: "var(--surface)",
    borderRight: "1px solid var(--border)",
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
    backgroundColor: "var(--accent-strong)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarIcon: {
    width: "48px",
    height: "48px",
    borderRadius: "50%",
    backgroundColor: "var(--surface-3)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    border: "1px solid var(--border-strong)",
  },
  profileName: {
    fontSize: "14px",
    fontWeight: "700",
    color: "var(--text)",
  },
  profileBranch: {
    fontSize: "12px",
    color: "var(--text-muted)",
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
    backgroundColor: "var(--surface)",
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
    color: "var(--text-muted)",
    letterSpacing: "0.5px",
    textTransform: "uppercase" as const,
  },
  sectionSubtitle: {
    fontSize: "12px",
    fontWeight: "700",
    color: "var(--text-secondary)",
    letterSpacing: "0.5px",
    marginBottom: "10px",
  },
  actionsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: "16px",
  },
  actionBtn: {
    backgroundColor: "var(--surface)",
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
    color: "var(--accent-strong)",
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
    borderBottom: "2px solid var(--border)",
  },
  th: {
    padding: "10px 12px",
    fontSize: "11px",
    fontWeight: "700",
    color: "var(--text-secondary)",
    textTransform: "uppercase" as const,
  },
  tableRow: {
    borderBottom: "1px solid var(--surface-3)",
  },
  td: {
    padding: "12px",
    fontSize: "13px",
    color: "var(--text-secondary)",
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
    backgroundColor: "var(--surface)",
    border: "1px solid #3b82f6",
    borderRadius: "12px",
    padding: "36px",
    boxShadow: "0 10px 15px -3px rgba(0,0,0,0.05)",
    textAlign: "center" as const,
  },
  cardMainTitle: {
    fontSize: "20px",
    fontWeight: "800",
    color: "var(--accent-strong)",
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
    color: "var(--text-secondary)",
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
    backgroundColor: "var(--surface)",
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
    border: "1px solid var(--border-strong)",
    backgroundColor: "var(--surface)",
    color: "var(--accent-strong)",
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
    backgroundColor: "var(--surface)",
    border: "1px solid var(--border-strong)",
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
    borderBottom: "1px solid var(--surface-3)",
    fontSize: "14px",
  },
  qtyContainer: {
    display: "flex",
    alignItems: "center",
    border: "1px solid var(--border-strong)",
    borderRadius: "4px",
    width: "fit-content",
    overflow: "hidden",
  },
  qtyBtn: {
    width: "28px",
    height: "28px",
    border: "none",
    backgroundColor: "var(--surface-3)",
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
    borderTop: "2px solid var(--border)",
    paddingTop: "16px",
    marginTop: "auto",
  },
  summaryRow: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: "13px",
    color: "var(--text-secondary)",
  },
  summaryTotal: {
    borderTop: "1px solid var(--border-strong)",
    paddingTop: "8px",
    fontSize: "18px",
    fontWeight: "800",
    color: "var(--text)",
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
    backgroundColor: "var(--surface)",
    borderRadius: "12px",
    padding: "28px",
    boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)",
    display: "flex",
    flexDirection: "column" as const,
    gap: "16px",
  },
  checkoutTotalBox: {
    backgroundColor: "var(--surface-2)",
    border: "1px solid var(--border)",
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
    border: "1px solid var(--border-strong)",
    backgroundColor: "var(--surface)",
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
    backgroundColor: "var(--surface)",
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
    color: "var(--text)",
    borderBottom: "1px solid var(--border)",
    paddingBottom: "8px",
  },
  cancelModal: {
    width: "420px",
    backgroundColor: "var(--surface)",
    borderRadius: "12px",
    padding: "28px",
    boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)",
  },
  closeModal: {
    width: "420px",
    backgroundColor: "var(--surface)",
    borderRadius: "12px",
    padding: "28px",
    boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)",
  },
  depositModal: {
    width: "700px",
    maxWidth: "95vw",
    backgroundColor: "var(--surface)",
    borderRadius: "12px",
    padding: "28px",
    boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)",
  },
  historyModal: {
    width: "520px",
    maxWidth: "95vw",
    backgroundColor: "var(--surface)",
    borderRadius: "12px",
    padding: "24px",
    boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)",
  },
  ticketModal: {
    width: "calc(80mm + 48px)",
    maxWidth: "95vw",
    backgroundColor: "var(--surface)",
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
    backgroundColor: "var(--surface)",
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
    backgroundColor: "var(--surface-2)",
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
    backgroundColor: "var(--surface)",
    borderRadius: "16px",
    padding: "48px 32px 36px 32px",
    boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.05), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
    textAlign: "center",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    border: "1px solid var(--surface-3)",
  },
  conflictCardWide: {
    width: "560px",
    maxWidth: "100%",
    backgroundColor: "var(--surface)",
    borderRadius: "16px",
    padding: "48px 32px 36px 32px",
    boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.05), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
    textAlign: "center",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    border: "1px solid var(--surface-3)",
  },
  conflictTextWide: {
    color: "var(--text-secondary)",
    fontSize: "14px",
    lineHeight: "1.8",
    margin: "0 0 32px 0",
    fontFamily: "'Inter', sans-serif",
    maxWidth: "520px",
  },
  conflictActionRow: {
    display: "flex",
    gap: "12px",
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
    flexWrap: "wrap",
  },
  conflictButton: {
    flex: 1,
    width: "auto",
    minWidth: "180px",
    maxWidth: "240px",
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
  conflictSecondaryButton: {
    flex: 1,
    width: "auto",
    minWidth: "180px",
    maxWidth: "240px",
    padding: "14px 20px",
    fontSize: "15px",
    fontWeight: "600",
    borderRadius: "10px",
    backgroundColor: "transparent",
    color: "#111827",
    border: "1px solid #d1d5db",
    cursor: "pointer",
    transition: "background-color 0.2s, transform 0.1s",
    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.08)",
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
    color: "var(--text)",
    fontSize: "22px",
    fontWeight: "700",
    margin: "0 0 16px 0",
    fontFamily: "'Outfit', 'Inter', sans-serif",
    letterSpacing: "-0.5px",
  },
  conflictText: {
    color: "var(--text-secondary)",
    fontSize: "14px",
    lineHeight: "1.6",
    margin: "0 0 32px 0",
    fontFamily: "'Inter', sans-serif",
    maxWidth: "340px",
  },
  
  select: {
    width: "100%",
    padding: "10px 14px",
    borderRadius: "6px",
    border: "1px solid var(--border-strong)",
    backgroundColor: "var(--surface)",
    color: "var(--text)",
    fontSize: "14px",
    fontWeight: "500",
    outline: "none",
  },
};
export default Dashboard;
