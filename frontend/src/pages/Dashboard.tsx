import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import api from "../services/api";
import AdminDashboard from "./AdminDashboard";
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
  Delete,
  KeyRound,
  AlertTriangle,
  FileText
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

interface CashSession {
  id: number;
  branchId: number;
  userId: number;
  openedAt: string;
  closedAt: string | null;
  initialAmount: number;
  expectedAmount: number;
  declaredAmount: number | null;
  difference: number | null;
  cashIn: number;
  cashOut: number;
  status: string;
}

const Dashboard: React.FC = () => {
  const { user, logout } = useAuth();
  
  // Vistas del Cajero: "dashboard" | "apertura" | "sales-terminal"
  const [view, setView] = useState<"dashboard" | "apertura" | "sales-terminal">("dashboard");
  const [session, setSession] = useState<CashSession | null>(null);
  const [sessionStats, setSessionStats] = useState<any>(null);
  const [lastClosedStats, setLastClosedStats] = useState<any>(null);
  const [recentSales, setRecentSales] = useState<Sale[]>([]);
  const [recentDeposits, setRecentDeposits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modales de Acción Rápida: null | "price-lookup" | "ticket-history" | "cancel-sale" | "close-cash" | "bank-deposit" | "close-options" | "partial-cut-summary" | "partial-cut-receipt"
  const [activeModal, setActiveModal] = useState<string | null>(null);

  // Pestañas del modal de depósito (Resguardo de Efectivo)
  const [depTab, setDepTab] = useState<"registrar" | "buscar">("registrar");
  // Filtros de búsqueda
  const [searchDepRef, setSearchDepRef] = useState("");
  const [searchDepStatus, setSearchDepStatus] = useState("ALL");
  const [searchDepUser, setSearchDepUser] = useState("");
  const [searchDepDateFrom, setSearchDepDateFrom] = useState("");
  const [searchDepDateTo, setSearchDepDateTo] = useState("");
  const [depSearchResults, setDepSearchResults] = useState<any[]>([]);
  const [depSearchLoading, setDepSearchLoading] = useState(false);
  const [cashiers, setCashiers] = useState<any[]>([]);
  // Cancelación de depósitos
  const [cancellingDep, setCancellingDep] = useState<any | null>(null);
  const [depCancelReason, setDepCancelReason] = useState("");
  const [depCancelPin, setDepCancelPin] = useState("");
  const [depCancelLoading, setDepCancelLoading] = useState(false);

  // Estados para alertas personalizadas y cobro (Fase 3.5)
  const [toast, setToast] = useState<{ message: string; type: "error" | "success" | "info" } | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const showToast = (message: string, type: "error" | "success" | "info" = "error") => {
    setToast({ message, type });
  };

  const handleLogoutClick = () => {
    if (session && session.status === "ABIERTA" && user?.role === "CAJERO") {
      showToast("No puede cerrar sesión si tiene un turno de caja activo. Por favor realice su Cierre de Caja primero.", "error");
      return;
    }
    logout();
  };

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Estados para Corte Parcial
  const [partialCutLoading, setPartialCutLoading] = useState(false);
  const [partialCutData, setPartialCutData] = useState<any>(null);

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

  // ---------------------------------------------------------------------------
  // 1. CARGA DE DATOS DE SESIÓN Y VISTA INICIAL
  // ---------------------------------------------------------------------------
  const checkSessionStatus = async () => {
    if (!user) return;
    
    // Si es Administrador, va directo al Dashboard admin
    if (user.role === "ADMIN") {
      setLoading(false);
      return;
    }

    try {
      const resStatus = await api.get("/api/cash-session/status");
      if (resStatus.data.isOpen) {
        setSession(resStatus.data.session);
        setView("dashboard");
        await loadDashboardData();
      } else {
        setSession(null);
        setView("apertura");
      }
    } catch (err) {
      console.error("Error al validar sesión de caja:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadDashboardData = async () => {
    try {
      const [resStats, resSales, resDeposits] = await Promise.all([
        api.get("/api/cash-session/stats"),
        api.get("/api/sales/recent"),
        api.get("/api/sales/deposits").catch(() => ({ data: { deposits: [] } }))
      ]);
      setSessionStats(resStats.data.stats);
      setRecentSales(resSales.data.sales);
      setRecentDeposits(resDeposits.data.deposits || []);
    } catch (err) {
      console.error("Error al cargar datos del Dashboard:", err);
    }
  };

  useEffect(() => {
    checkSessionStatus();
  }, [user]);

  // ---------------------------------------------------------------------------
  // 2. APERTURA DE CAJA (Mockup 8)
  // ---------------------------------------------------------------------------
  const [initialFund, setInitialFund] = useState("500.00");
  const [openingLoading, setOpeningLoading] = useState(false);

  const handleOpenCash = async () => {
    if (isNaN(Number(initialFund)) || Number(initialFund) < 0) {
      showToast("Por favor ingrese un monto inicial válido.");
      return;
    }
    setOpeningLoading(true);
    try {
      const res = await api.post("/api/cash-session/open", {
        initialAmount: Number(initialFund)
      });
      setSession(res.data.session);
      setView("dashboard");
      await loadDashboardData();
    } catch (err: any) {
      showToast(err.response?.data?.message || "Error al abrir la caja registradora.");
    } finally {
      setOpeningLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // 3. CONSULTAR PRECIO / LOOKUP (Mockup 6)
  // ---------------------------------------------------------------------------
  const [lookupQuery, setLookupQuery] = useState("");
  const [lookupResults, setLookupResults] = useState<Product[]>([]);
  const lastLookupQueryRef = React.useRef("___RESET___");

  const handleLookupSearch = async (forceQuery?: string) => {
    const query = (forceQuery !== undefined ? forceQuery : lookupQuery).trim();
    if (query === lastLookupQueryRef.current) return;
    lastLookupQueryRef.current = query;
    try {
      const res = await api.get(`/api/products/search?query=${query}`);
      setLookupResults(res.data.products);
    } catch (err) {
      console.error("Error al buscar productos:", err);
    }
  };

  const handleLookupKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleLookupSearch();
    }
  };

  useEffect(() => {
    if (activeModal === "price-lookup") {
      const query = lookupQuery.trim();
      const delayDebounce = setTimeout(() => {
        handleLookupSearch(query);
      }, 50);
      return () => clearTimeout(delayDebounce);
    } else {
      lastLookupQueryRef.current = "___RESET___";
    }
  }, [lookupQuery, activeModal]);

  // ---------------------------------------------------------------------------
  // 4. TERMINAL DE VENTAS (Mockup 5)
  // ---------------------------------------------------------------------------
  // Restaurar borrador de venta desde localStorage al montar
  const DRAFT_KEY = "pos_sale_draft";
  const loadDraft = (): { product: Product; quantity: number }[] => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch { /* ignore */ }
    return [];
  };

  const [cart, setCart] = useState<{ product: Product; quantity: number }[]>(loadDraft);
  const [barcodeSearch, setBarcodeSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [selectedSale, setSelectedSale] = useState<any>(null); // Guardar venta tras cobro para ticket
  const lastSearchQueryRef = React.useRef("");
  const [showDraftConfirm, setShowDraftConfirm] = useState(false);

  // Estados para autorización de PIN en modificaciones de carrito (Fase 3.0)
  const [pendingCartAction, setPendingCartAction] = useState<{
    type: "update" | "remove" | "cancel";
    prodId?: number;
    change?: number;
  } | null>(null);
  const [cartPin, setCartPin] = useState("");
  const [cartPinError, setCartPinError] = useState("");
  const [cartPinLoading, setCartPinLoading] = useState(false);

  // Interfaces y Estados para Clientes y Lealtad (Fase 3.6/3.7)
  interface Customer {
    id: number;
    name: string;
    phone: string;
    email?: string;
    points: number;
  }

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerSearchResults, setCustomerSearchResults] = useState<Customer[]>([]);
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
  const [isNewCustomerModalOpen, setIsNewCustomerModalOpen] = useState(false);
  const [newCustomerForm, setNewCustomerForm] = useState({ name: "", phone: "", email: "" });
  const [newCustomerLoading, setNewCustomerLoading] = useState(false);
  const [newCustomerError, setNewCustomerError] = useState<string | null>(null);

  // Puntos a redimir en el cobro
  const [pointsToRedeem, setPointsToRedeem] = useState<number>(0);
  const [usePoints, setUsePoints] = useState<boolean>(false);

  // Estados para búsqueda de tickets en reimpresión (Fase 3.8)
  const [ticketSearch, setTicketSearch] = useState("");
  const [filteredSales, setFilteredSales] = useState<Sale[]>([]);

  // Efecto para buscar y filtrar tickets de venta para reimpresión
  useEffect(() => {
    if (activeModal !== "ticket-history") return;
    const query = ticketSearch.trim();

    const timer = setTimeout(async () => {
      try {
        const res = await api.get(`/api/sales/recent?search=${query}`);
        setFilteredSales(res.data.sales || []);
      } catch (err) {
        console.error("Error al buscar tickets:", err);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [ticketSearch, activeModal]);

  // Efecto de búsqueda predictiva para Clientes en la caja
  useEffect(() => {
    if (view !== "sales-terminal") return;
    const query = customerSearch.trim();
    if (!query) {
      setCustomerSearchResults([]);
      setIsCustomerDropdownOpen(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await api.get(`/api/sales/customers/search?query=${query}`);
        setCustomerSearchResults(res.data.customers || []);
        setIsCustomerDropdownOpen(true);
      } catch (err) {
        console.error("Error al buscar clientes:", err);
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [customerSearch, view]);

  const handleRegisterCustomerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { name, phone, email } = newCustomerForm;
    if (!name.trim() || !phone.trim()) {
      setNewCustomerError("El nombre y el teléfono son obligatorios.");
      return;
    }
    setNewCustomerLoading(true);
    setNewCustomerError(null);
    try {
      const res = await api.post("/api/sales/customers", {
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined
      });
      setSelectedCustomer(res.data.customer);
      setCustomerSearch("");
      setCustomerSearchResults([]);
      setIsCustomerDropdownOpen(false);
      setIsNewCustomerModalOpen(false);
      setNewCustomerForm({ name: "", phone: "", email: "" });
      showToast("Cliente registrado y seleccionado.", "success");
    } catch (err: any) {
      setNewCustomerError(err.response?.data?.message || "Error al registrar cliente.");
    } finally {
      setNewCustomerLoading(false);
    }
  };

  const handleProductBarcodeSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = barcodeSearch.trim();
    if (!query) return;
    if (query === lastSearchQueryRef.current) return;
    lastSearchQueryRef.current = query;
    try {
      const res = await api.get(`/api/products/search?query=${query}`);
      const list: Product[] = res.data.products;
      if (list.length === 1) {
        // Añadir directamente
        addProductToCart(list[0]);
        setBarcodeSearch("");
        setSearchResults([]);
        lastSearchQueryRef.current = "";
      } else {
        setSearchResults(list);
      }
    } catch (err) {
      console.error("Error al buscar producto:", err);
    }
  };

  // Búsqueda automática al escribir en la terminal de ventas
  useEffect(() => {
    if (view !== "sales-terminal") return;
    const query = barcodeSearch.trim();
    if (!query) {
      setSearchResults([]);
      lastSearchQueryRef.current = "";
      return;
    }

    const timer = setTimeout(async () => {
      if (query === lastSearchQueryRef.current) return;
      lastSearchQueryRef.current = query;
      try {
        const res = await api.get(`/api/products/search?query=${query}`);
        const list: Product[] = res.data.products;
        if (list.length === 1) {
          addProductToCart(list[0]);
          setBarcodeSearch("");
          setSearchResults([]);
          lastSearchQueryRef.current = "";
        } else {
          setSearchResults(list);
        }
      } catch (err) {
        console.error("Error al buscar producto automáticamente:", err);
      }
    }, 50);

    return () => clearTimeout(timer);
  }, [barcodeSearch, view]);

  // Persistir borrador de venta en localStorage cada vez que cambie el carrito
  useEffect(() => {
    if (cart.length > 0) {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(cart));
    } else {
      localStorage.removeItem(DRAFT_KEY);
    }
  }, [cart]);

  const addProductToCart = (prod: Product) => {
    if (prod.stock <= 0) {
      showToast("No hay existencias de este producto en la sucursal.");
      return;
    }
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === prod.id);
      if (existing) {
        if (existing.quantity >= prod.stock) {
          showToast(`Límite alcanzado. Solo hay ${prod.stock} piezas disponibles.`);
          return prev;
        }
        return prev.map((item) =>
          item.product.id === prod.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { product: prod, quantity: 1 }];
    });
  };

  const updateCartQty = (prodId: number, change: number) => {
    if (change < 0) {
      // Reducción requiere PIN del Administrador/Gerente (Fase 3.0)
      setCartPin("");
      setCartPinError("");
      setPendingCartAction({ type: "update", prodId, change });
      setActiveModal("cart-pin-auth");
      return;
    }

    setCart((prev) =>
      prev
        .map((item) => {
          if (item.product.id === prodId) {
            const nextQty = item.quantity + change;
            if (nextQty > item.product.stock) {
              showToast(`Solo hay ${item.product.stock} piezas en stock.`);
              return item;
            }
            return nextQty > 0 ? { ...item, quantity: nextQty } : null;
          }
          return item;
        })
        .filter((item): item is { product: Product; quantity: number } => item !== null)
    );
  };

  const removeCartItem = (prodId: number) => {
    // Eliminación requiere PIN del Administrador/Gerente (Fase 3.0)
    setCartPin("");
    setCartPinError("");
    setPendingCartAction({ type: "remove", prodId });
    setActiveModal("cart-pin-auth");
  };

  const applyAuthorizedCartAction = () => {
    if (!pendingCartAction) return;
    const { type, prodId, change } = pendingCartAction;

    if (type === "update" && prodId !== undefined && change !== undefined) {
      setCart((prev) =>
        prev
          .map((item) => {
            if (item.product.id === prodId) {
              const nextQty = item.quantity + change;
              return nextQty > 0 ? { ...item, quantity: nextQty } : null;
            }
            return item;
          })
          .filter((item): item is { product: Product; quantity: number } => item !== null)
      );
    } else if (type === "remove" && prodId !== undefined) {
      setCart((prev) => prev.filter((item) => item.product.id !== prodId));
    } else if (type === "cancel") {
      setCart([]);
      localStorage.removeItem(DRAFT_KEY);
      setView("dashboard");
    }
    setPendingCartAction(null);
    setActiveModal(null);
  };

  const handleCartPinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cartPin || cartPin.length < 4) {
      setCartPinError("Ingrese un código PIN completo de 4 dígitos.");
      return;
    }
    setCartPinLoading(true);
    setCartPinError("");
    try {
      const res = await api.post("/api/auth/verify-pin", { pinCode: cartPin });
      if (res.data.valid) {
        applyAuthorizedCartAction();
      } else {
        setCartPinError("PIN de autorización incorrecto.");
      }
    } catch (err: any) {
      setCartPinError(err.response?.data?.message || "PIN incorrecto o sin privilegios de Gerente/Admin.");
    } finally {
      setCartPinLoading(false);
    }
  };

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

    if (promo.type === "Percentage") {
      const val = promo.value || 0;
      const discountPerUnit = originalPrice * (val / 100);
      discountAmount = discountPerUnit * quantity;
      finalPrice = originalPrice - discountPerUnit;
    } else if (promo.type === "FixedAmount") {
      const val = promo.value || 0;
      discountAmount = val * quantity;
      finalPrice = Math.max(0, originalPrice - val);
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
      const minQty = promo.minQuantity || 1;
      const special = promo.specialPrice || originalPrice;
      if (quantity >= minQty) {
        finalPrice = special;
        discountAmount = (originalPrice - special) * quantity;
      }
    }

    return {
      finalPrice,
      discountAmount,
      label: promo.name,
    };
  };

  const cartCalculations = cart.reduce((summary, item) => {
    const { finalPrice, discountAmount } = calculateItemPromotion(item);
    const subtotalOriginal = item.product.sellPrice * item.quantity;
    const subtotalFinal = finalPrice * item.quantity;

    summary.subtotalOriginal += subtotalOriginal;
    summary.discountTotal += discountAmount;
    summary.subtotalFinal += subtotalFinal;
    return summary;
  }, { subtotalOriginal: 0, discountTotal: 0, subtotalFinal: 0 });

  const cartSubtotal = cartCalculations.subtotalFinal; // El subtotal final con descuentos para aplicar IVA
  const cartDiscount = cartCalculations.discountTotal;
  const cartSubtotalOriginal = cartCalculations.subtotalOriginal;
  const cartTax = cartSubtotal * 0.16; // 16% IVA
  const cartTotal = cartSubtotal + cartTax;

  // ---------------------------------------------------------------------------
  // 5. MODAL COBRO (Mockup 4)
  // ---------------------------------------------------------------------------
  const [paymentMethod, setPaymentMethod] = useState<"EFECTIVO" | "TARJETA" | "MIXTO" | "QR_MERCADOPAGO">("EFECTIVO");
  const [cashReceived, setCashReceived] = useState("");
  // Campos para pago mixto
  const [mixtoCash, setMixtoCash] = useState("");
  const [mixtoCard, setMixtoCard] = useState("");
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [cardType, setCardType] = useState<"CREDITO" | "DEBITO">("DEBITO");

  // Estados QR MercadoPago
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [qrUrl, setQrUrl] = useState("");
  const [qrReference, setQrReference] = useState("");
  const [qrChecking, setQrChecking] = useState(false);

  const checkQrStatus = async () => {
    setQrChecking(true);
    try {
      const res = await api.get(`/api/mercadopago/status/${qrReference}`);
      if (res.data.status === "approved") {
        await api.post("/api/sales/confirm-qr", {
          invoiceNumber: qrReference,
          paymentId: res.data.paymentId || `mock-${Date.now()}`
        });
        alert("Pago aprobado exitosamente.");
        setQrModalOpen(false);
        setCart([]);
        setPaymentMethod("EFECTIVO");
        setActiveModal("ticket-view");
      } else if (res.data.status === "rejected") {
        alert("Pago rechazado.");
      } else {
        alert("El pago aún no ha sido completado. Estado: " + res.data.status);
      }
    } catch(err) {
      alert("Error al verificar pago.");
    } finally {
      setQrChecking(false);
    }
  };

  // Cambio reactivo
  const pointsDiscount = (usePoints && selectedCustomer) ? Math.min(selectedCustomer.points, pointsToRedeem) : 0;
  const netTotalToPay = Math.max(0, cartTotal - pointsDiscount);

  const parsedReceived = Number(cashReceived) || 0;
  const calculatedChange = paymentMethod === "EFECTIVO" 
    ? (parsedReceived >= netTotalToPay ? parsedReceived - netTotalToPay : 0)
    : paymentMethod === "MIXTO"
    ? (Number(mixtoCard) <= netTotalToPay && Number(mixtoCash) >= (netTotalToPay - Number(mixtoCard)) ? Number(mixtoCash) - (netTotalToPay - Number(mixtoCard)) : 0)
    : 0;

  const handleCheckoutSubmit = async () => {
    if (paymentMethod === "EFECTIVO" && parsedReceived < netTotalToPay) {
      setCheckoutError("El efectivo recibido es menor al total a pagar.");
      return;
    }
    if (paymentMethod === "MIXTO") {
      const mCash = Number(mixtoCash) || 0;
      const mCard = Number(mixtoCard) || 0;
      if (mCard <= 0 || mCash <= 0) {
        setCheckoutError("En un pago mixto, tanto el monto de tarjeta como el de efectivo deben ser mayores a cero. Si solo usa un método, seleccione Efectivo o Tarjeta.");
        return;
      }
      if (mCard > netTotalToPay) {
        setCheckoutError("El monto pagado con tarjeta no puede ser mayor al total de la compra.");
        return;
      }
      if (mCash + mCard < netTotalToPay) {
        setCheckoutError("La suma de efectivo y tarjeta es menor al total a pagar.");
        return;
      }
    }

    if (paymentMethod === "QR_MERCADOPAGO") {
      setCheckoutLoading(true);
      try {
        const itemsPayload = cart.map((c) => ({
          id: c.product.id,
          name: c.product.name,
          quantity: c.quantity,
        }));

        const res = await api.post("/api/sales", {
          items: itemsPayload,
          paymentMethod: "QR_MERCADOPAGO",
          cashReceived: 0,
          changeGiven: 0,
          discountAmount: 0,
        });

        const saleInvoice = res.data.invoiceNumber;
        
        // Generar QR
        const qrRes = await api.post("/api/mercadopago/qr-preference", {
          title: "Venta " + saleInvoice,
          totalAmount: cartTotal,
          externalReference: saleInvoice
        });

        setSelectedSale({
          invoiceNumber: saleInvoice,
          items: [...cart],
          subtotal: cartSubtotal,
          tax: cartTax,
          total: cartTotal,
          paymentMethod: "QR_MERCADOPAGO",
          cashReceived: 0,
          changeGiven: 0,
          createdAt: new Date().toISOString(),
        });

        setQrUrl(qrRes.data.initPoint);
        setQrReference(saleInvoice);
        setCheckoutModalOpen(false);
        setQrModalOpen(true);
      } catch(err: any) {
        alert(err.response?.data?.message || "Error al procesar pago QR");
      } finally {
        setCheckoutLoading(false);
      }
      return;
    }

    setCheckoutLoading(true);
    try {
      const itemsPayload = cart.map((c) => ({
        id: c.product.id,
        name: c.product.name,
        quantity: c.quantity,
      }));

      const res = await api.post("/api/sales", {
        items: itemsPayload,
        paymentMethod,
        cardType: (paymentMethod === "TARJETA" || paymentMethod === "MIXTO") ? cardType : undefined,
        cashReceived: paymentMethod === "EFECTIVO" ? parsedReceived : paymentMethod === "MIXTO" ? Number(mixtoCash) : 0,
        changeGiven: calculatedChange,
        discountAmount: cartDiscount,
        customerId: selectedCustomer ? selectedCustomer.id : undefined,
        pointsRedeemed: (usePoints && selectedCustomer) ? pointsToRedeem : undefined,
      });

      // Guardar info para imprimir ticket
      setSelectedSale({
        invoiceNumber: res.data.invoiceNumber,
        items: [...cart],
        subtotal: cartSubtotal,
        discountAmount: cartDiscount,
        subtotalOriginal: cartSubtotalOriginal,
        tax: cartTax,
        total: cartTotal,
        paymentMethod,
        cardType: (paymentMethod === "TARJETA" || paymentMethod === "MIXTO") ? cardType : undefined,
        cashReceived: paymentMethod === "EFECTIVO" ? parsedReceived : paymentMethod === "MIXTO" ? Number(mixtoCash) : 0,
        changeGiven: calculatedChange,
        createdAt: new Date().toISOString(),
        isNewSale: true,
        status: "COMPLETADA",
        // Datos de lealtad retornados por el backend
        pointsEarned: res.data.pointsEarned || 0,
        pointsRedeemed: res.data.pointsRedeemed || 0,
        pointsDiscount: res.data.pointsDiscount || 0,
        customerPoints: res.data.customerPoints || 0,
        customerName: res.data.customerName || null,
      });

      // Limpiar carrito, borrador, cliente seleccionado y cerrar cobro
      setCart([]);
      localStorage.removeItem(DRAFT_KEY);
      setSelectedCustomer(null);
      setUsePoints(false);
      setPointsToRedeem(0);
      setCheckoutModalOpen(false);
      setPaymentMethod("EFECTIVO");
      setCashReceived("");
      setMixtoCash("");
      setMixtoCard("");
      setActiveModal("ticket-view"); // Mostrar el ticket inmediatamente
    } catch (err: any) {
      setCheckoutError(err.response?.data?.message || "Error al completar el cobro.");
    } finally {
      setCheckoutLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // 6. TICKET DE VENTA (Mockup 3)
  // ---------------------------------------------------------------------------
  const handlePrintTicket = () => {
    window.print();
  };

  const handleCloseTicket = () => {
    const wasNewSale = selectedSale?.isNewSale;
    setSelectedSale(null);
    setActiveModal(null);
    if (wasNewSale) {
      setView("sales-terminal");
      setCart([]);
      localStorage.removeItem(DRAFT_KEY);
      setPaymentMethod("EFECTIVO");
      setCashReceived("");
      setMixtoCash("");
      setMixtoCard("");
    }
    loadDashboardData(); // Recargar estadísticas de caja para actualizar el contador de tickets
  };

  const handleCloseLookup = () => {
    setActiveModal(null);
    setLookupQuery("");
    setLookupResults([]);
    lastLookupQueryRef.current = "___RESET___";
  };

  // ---------------------------------------------------------------------------
  // 7. SOLICITUD DE CANCELACIÓN (Mockup 1)
  // ---------------------------------------------------------------------------
  const [cancelInvoice, setCancelInvoice] = useState("");
  const [cancelPin, setCancelPin] = useState("");
  const [cancelReason, setCancelReason] = useState("");
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

  const handleCancelSaleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancelInvoice || !cancelPin || !cancelReason) {
      showToast("Por favor complete todos los campos.");
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
    setCancelSalePreview(null);
  };

  const handleCloseModal_closeCash = () => {
    setActiveModal(null);
    setDeclaredCash("");
    if (lastClosedStats) {
      setLastClosedStats(null);
      logout();
    }
  };

  const handleCloseModal_partialCut = () => {
    setActiveModal(null);
    setPartialCutData(null);
  };

  const handleCloseModal_bankDeposit = () => {
    setActiveModal(null);
    setDepAccount("");
    setDepName("");
    setDepAmount("");
    setDepComments("");
  };

  const handleCloseModal_ticketHistory = () => {
    setActiveModal(null);
    setTicketSearch("");
    setFilteredSales([]);
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
  // 8. CIERRE DE CAJA Y CORTE PARCIAL (Mockup 2)
  // ---------------------------------------------------------------------------
  const [declaredCash, setDeclaredCash] = useState("");
  const [closingLoading, setClosingLoading] = useState(false);

  const calculatedDifference = sessionStats
    ? (Number(declaredCash) || 0) - sessionStats.expectedAmount
    : 0;

  const handleCloseShift = async () => {
    if (!declaredCash || isNaN(Number(declaredCash))) {
      showToast("Por favor ingrese el efectivo contado en la caja.");
      return;
    }
    setClosingLoading(true);
    try {
      const res = await api.post("/api/cash-session/close", {
        declaredAmount: Number(declaredCash)
      });
      showToast("Turno cerrado con éxito. Generando reporte de arqueo...", "success");
      setLastClosedStats(res.data.stats);
      setSession(null);
      setActiveModal("close-receipt");
      setDeclaredCash("");
    } catch (err: any) {
      showToast(err.response?.data?.message || "Error al cerrar turno.");
    } finally {
      setClosingLoading(false);
    }
  };

  const handleSavePartialCut = async () => {
    setPartialCutLoading(true);
    try {
      const res = await api.post("/api/cash-session/cut");
      setPartialCutData(res.data.cut);
      setActiveModal("partial-cut-receipt");
      await loadDashboardData();
    } catch (err: any) {
      showToast(err.response?.data?.message || "Error al registrar el corte de caja.");
    } finally {
      setPartialCutLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // 9. DEPOSITOS BANCARIOS (Resguardo de Efectivo)
  // ---------------------------------------------------------------------------
  const [depAccount, setDepAccount] = useState("");
  const [depName, setDepName] = useState("");
  const [depAmount, setDepAmount] = useState("");
  const [depComments, setDepComments] = useState("");
  const [depLoading, setDepLoading] = useState(false);
  const [lastDeposit, setLastDeposit] = useState<any>(null);

  const handleDepositSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (depAccount.length !== 16 || isNaN(Number(depAccount))) {
      showToast("El número de cuenta debe tener exactamente 16 dígitos.");
      return;
    }
    if (!depName || !depAmount || isNaN(Number(depAmount))) {
      showToast("Por favor complete los campos obligatorios.");
      return;
    }

    setDepLoading(true);
    try {
      const res = await api.post("/api/sales/bank-deposit", {
        accountNumber: depAccount,
        targetName: depName,
        amount: Number(depAmount),
        paymentType: "EFECTIVO", // Forzamos EFECTIVO
        comments: depComments
      });
      
      setLastDeposit(res.data.deposit);
      setDepAccount("");
      setDepName("");
      setDepAmount("");
      setDepComments("");
      
      await loadDashboardData();
      setActiveModal("deposit-receipt");
    } catch (err: any) {
      showToast(err.response?.data?.message || "Error al procesar el depósito.");
    } finally {
      setDepLoading(false);
    }
  };

  const fetchCashiers = async () => {
    if (!user) return;
    try {
      const branchId = user.branch?.id;
      const res = await api.get(`/api/auth/cashiers/${branchId}`);
      setCashiers(res.data.cashiers || []);
    } catch (err) {
      console.error("Error al cargar cajeros:", err);
    }
  };

  const handleSearchDeposits = async () => {
    setDepSearchLoading(true);
    try {
      const params: any = {};
      if (searchDepRef) params.reference = searchDepRef;
      if (searchDepStatus && searchDepStatus !== "ALL") params.status = searchDepStatus;
      if (searchDepUser) params.userId = searchDepUser;
      if (searchDepDateFrom) params.dateFrom = searchDepDateFrom;
      if (searchDepDateTo) params.dateTo = searchDepDateTo;

      const res = await api.get("/api/sales/deposits/search", { params });
      setDepSearchResults(res.data.deposits || []);
    } catch (err: any) {
      console.error("Error al buscar depósitos:", err);
    } finally {
      setDepSearchLoading(false);
    }
  };

  const handleCancelDepositSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancellingDep) return;
    if (!depCancelPin || !depCancelReason) {
      alert("El PIN y el motivo de cancelación son obligatorios.");
      return;
    }
    setDepCancelLoading(true);
    try {
      const res = await api.post(`/api/sales/deposits/${cancellingDep.id}/cancel`, {
        pinCode: depCancelPin,
        reason: depCancelReason
      });
      alert(res.data.message || "Depósito cancelado exitosamente.");
      setCancellingDep(null);
      setDepCancelPin("");
      setDepCancelReason("");
      await handleSearchDeposits();
      await loadDashboardData();
    } catch (err: any) {
      alert(err.response?.data?.message || "Error al cancelar el depósito.");
    } finally {
      setDepCancelLoading(false);
    }
  };

  useEffect(() => {
    if (activeModal === "bank-deposit") {
      setDepTab("registrar");
      setCancellingDep(null);
      setDepCancelPin("");
      setDepCancelReason("");
      fetchCashiers();
      handleSearchDeposits();
    }
  }, [activeModal]);

  useEffect(() => {
    if (activeModal === "bank-deposit") {
      const delayDebounce = setTimeout(() => {
        handleSearchDeposits();
      }, 300);
      return () => clearTimeout(delayDebounce);
    }
  }, [searchDepRef, searchDepStatus, searchDepUser, searchDepDateFrom, searchDepDateTo]);

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
  if (user && user.role === "ADMIN") {
    return <AdminDashboard />;
  }

  // ===========================================================================
  // RENDER B: APERTURA DE CAJA OBLIGATORIA (Mockup 8)
  // ===========================================================================
  if (view === "apertura") {
    return (
      <div style={styles.appContainer}>
        {/* Navbar */}
        <header style={styles.navbar}>
          <div style={styles.navBrand}>
            <Store size={22} color="#ffffff" />
            <span style={styles.brandText}>LYFRGL POS</span>
          </div>
          <button onClick={handleLogoutClick} style={styles.logoutBtn} className="active-tap">
            <LogOut size={16} /> Salir
          </button>
        </header>

        <div style={styles.mainLayout}>
          {/* Sidebar */}
          <aside style={styles.sidebar}>
            <div style={styles.sidebarProfile}>
              <div style={styles.avatarIcon}>
                <Users size={24} color="#475569" />
              </div>
              <h4 style={styles.profileName}>{user?.name}</h4>
              <p style={styles.profileBranch}>{user?.branch.name}</p>
            </div>
          </aside>

          {/* Formulario Apertura Caja */}
          <div style={styles.contentArea}>
            <div style={styles.aperturaCard}>
              <h3 style={styles.cardMainTitle}>APERTURA DE CAJA</h3>
              <p style={{ fontSize: "14px", color: "#64748b", marginBottom: "20px" }}>Establezca el fondo de caja inicial para comenzar el turno.</p>
              
              <div style={styles.inputGroup}>
                <label style={styles.label}>FONDO INICIAL ($)</label>
                <input
                  type="text"
                  className="input-corporate"
                  style={{ fontSize: "20px", fontWeight: "700", textAlign: "center", padding: "12px" }}
                  value={initialFund}
                  onChange={(e) => setInitialFund(e.target.value)}
                />
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
        {renderToast()}
      </div>
    );
  }

  // ===========================================================================
  // RENDER C: TERMINAL DE VENTAS DEDICADA (Mockup 5)
  // ===========================================================================
  if (view === "sales-terminal") {
    return (
      <div style={styles.appContainer}>
        {/* Header Venta */}
        <header style={styles.terminalHeader}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
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
        <div style={styles.terminalBody}>
          {/* Búsqueda de Productos */}
          {/* Búsqueda de Productos y Clientes */}
          <div className="card-premium" style={styles.terminalSearchArea}>
            <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
              {/* Buscador de Productos */}
              <form onSubmit={handleProductBarcodeSearch} style={{ flex: "1 1 50%", display: "flex", gap: "10px", margin: 0 }}>
                <div style={{ flex: 1, position: "relative" }}>
                  <Search size={18} color="#94a3b8" style={{ position: "absolute", left: "12px", top: "12px" }} />
                  <input
                    type="text"
                    className="input-corporate"
                    style={{ paddingLeft: "38px" }}
                    placeholder="Ingrese código o nombre del producto..."
                    value={barcodeSearch}
                    onChange={(e) => setBarcodeSearch(e.target.value)}
                  />
                </div>
                <button type="submit" className="btn-primary">
                  Buscar
                </button>
              </form>

              {/* Buscador y Lealtad de Clientes */}
              <div style={{ flex: "1 1 40%", display: "flex", gap: "10px", position: "relative" }}>
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
                  }}>
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
                        onChange={(e) => setCustomerSearch(e.target.value)}
                        onFocus={() => {
                          if (customerSearch.trim().length > 0) {
                            setIsCustomerDropdownOpen(true);
                          }
                        }}
                      />
                    </div>
                    <button
                      type="button"
                      className="btn-primary"
                      style={{ backgroundColor: "#0f172a" }}
                      onClick={() => {
                        setNewCustomerError(null);
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
          <div className="card-premium" style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", padding: "20px" }}>
            <div style={{ flex: 1, overflowY: "auto" }}>
              <table style={styles.table}>
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
                    return (
                      <tr key={item.product.id} style={styles.tableRow}>
                        <td style={styles.td}>{item.product.sku}</td>
                        <td style={{ ...styles.td, fontWeight: "600" }}>
                          <div>{item.product.name}</div>
                          {item.product.activePromotion && (
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
                        </td>
                        <td style={styles.td}>
                          <div style={styles.qtyContainer}>
                            <button onClick={() => updateCartQty(item.product.id, -1)} style={styles.qtyBtn}>
                              <Minus size={12} />
                            </button>
                            <span style={styles.qtyText}>{item.quantity}</span>
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
 
            {/* Totales y Controles Cobro */}
            <div style={styles.terminalSummary}>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", width: "260px", marginLeft: "auto" }}>
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
                <div style={styles.summaryRow}>
                  <span>IVA (16%):</span>
                  <span style={{ fontWeight: "600" }}>${cartTax.toFixed(2)}</span>
                </div>
                <div style={{ ...styles.summaryRow, ...styles.summaryTotal }}>
                  <span>Total:</span>
                  <span style={{ color: "#dc2626", fontWeight: "800" }}>${cartTotal.toFixed(2)}</span>
                </div>
              </div>
 
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: "20px" }}>
                <button
                  onClick={() => {
                    if (cart.length === 0) {
                      setView("dashboard");
                    } else {
                      setCartPin("");
                      setCartPinError("");
                      setPendingCartAction({ type: "cancel" });
                      setActiveModal("cart-pin-auth");
                    }
                  }}
                  className="active-tap"
                  style={{ ...styles.terminalBtn, backgroundColor: "#dc2626", color: "white" }}
                >
                  CANCELAR COMPRA
                </button>
                <button
                  disabled={cart.length === 0}
                  onClick={() => setCheckoutModalOpen(true)}
                  className="active-tap"
                  style={{ ...styles.terminalBtn, backgroundColor: "#059669", color: "white" }}
                >
                  COBRAR
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* COBRO MODAL (Mockup 4) */}
        {checkoutModalOpen && (
          <div style={styles.modalOverlay}>
            <div style={styles.checkoutModal}>
              <h3 style={{ textAlign: "center", textTransform: "uppercase", fontSize: "14px", color: "#475569", fontWeight: "700" }}>COBRO</h3>
              <div style={styles.checkoutTotalBox}>
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
              <div style={styles.payMethodsRow}>
                <button
                  onClick={() => {
                    setPaymentMethod("EFECTIVO");
                    setCheckoutError(null);
                  }}
                  style={{ ...styles.payMethodBtn, ...(paymentMethod === "EFECTIVO" ? styles.payMethodActive : {}) }}
                >
                  💵 EFECTIVO
                </button>
                <button
                  onClick={() => {
                    setPaymentMethod("TARJETA");
                    setCheckoutError(null);
                  }}
                  style={{ ...styles.payMethodBtn, ...(paymentMethod === "TARJETA" ? styles.payMethodActive : {}) }}
                >
                  💳 TARJETA
                </button>
                <button
                  onClick={() => {
                    setPaymentMethod("MIXTO");
                    setCheckoutError(null);
                  }}
                  style={{ ...styles.payMethodBtn, ...(paymentMethod === "MIXTO" ? styles.payMethodActive : {}) }}
                >
                  ⚖️ MIXTO
                </button>
                <button
                  onClick={() => setPaymentMethod("QR_MERCADOPAGO")}
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
                      onChange={(e) => {
                        setCashReceived(e.target.value);
                        setCheckoutError(null);
                      }}
                    />
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
                      onChange={(e) => {
                        setMixtoCard(e.target.value);
                        setCheckoutError(null);
                      }}
                    />
                  </div>
                  <div style={styles.inputGroup}>
                    <label style={styles.label}>Monto con Efectivo ($):</label>
                    <input
                      type="text"
                      className="input-corporate"
                      value={mixtoCash}
                      onChange={(e) => {
                        setMixtoCash(e.target.value);
                        setCheckoutError(null);
                      }}
                    />
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

              {/* Botones de Cobro */}
              <div style={{ display: "flex", gap: "10px", marginTop: "24px" }}>
                <button
                  onClick={() => setCheckoutModalOpen(false)}
                  style={{ ...styles.modalBtn, backgroundColor: "#dc2626", color: "white" }}
                >
                  CANCELAR
                </button>
                <button
                  disabled={checkoutLoading}
                  onClick={handleCheckoutSubmit}
                  style={{ ...styles.modalBtn, backgroundColor: "#059669", color: "white" }}
                >
                  {checkoutLoading ? "Procesando..." : "COBRAR"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL QR MERCADO PAGO */}
        {qrModalOpen && (
          <div style={styles.modalOverlay}>
            <div style={styles.checkoutModal}>
              <h3 style={{ textAlign: "center", textTransform: "uppercase", fontSize: "14px", color: "#475569", fontWeight: "700" }}>PAGO QR MERCADO PAGO</h3>
              <div style={{ textAlign: "center", padding: "20px 0" }}>
                 <p style={{marginBottom: "10px", fontSize: "14px", color: "#475569"}}>Escanea el siguiente código para pagar <strong>${cartTotal.toFixed(2)}</strong></p>
                 {qrUrl ? (
                   <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrUrl)}`} alt="QR Code" width="200" height="200" />
                 ) : (
                   <p>Generando QR...</p>
                 )}
                 <p style={{ marginTop: "12px", fontSize: "12px", color: "#64748b" }}>Ref: {qrReference}</p>
              </div>
              <div style={{ display: "flex", gap: "10px", marginTop: "24px" }}>
                <button
                  onClick={() => setQrModalOpen(false)}
                  style={{ ...styles.modalBtn, backgroundColor: "#dc2626", color: "white" }}
                >
                  CERRAR (PAGO PENDIENTE)
                </button>
                <button
                  disabled={qrChecking}
                  onClick={checkQrStatus}
                  style={{ ...styles.modalBtn, backgroundColor: "#059669", color: "white" }}
                >
                  {qrChecking ? "VERIFICANDO..." : "VERIFICAR ESTADO"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL: REGISTRO RÁPIDO DE CLIENTE (Fase 3.6) */}
        {isNewCustomerModalOpen && (
          <div style={styles.modalOverlay}>
            <div style={styles.checkoutModal}>
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
                    onChange={(e) => setNewCustomerForm(prev => ({ ...prev, name: e.target.value }))}
                  />
                </div>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Teléfono (10 dígitos) *</label>
                  <input
                    type="text"
                    required
                    className="input-corporate"
                    placeholder="Ej. 5551234567"
                    value={newCustomerForm.phone}
                    onChange={(e) => setNewCustomerForm(prev => ({ ...prev, phone: e.target.value.replace(/\D/g, "") }))}
                  />
                </div>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Correo Electrónico (Opcional)</label>
                  <input
                    type="email"
                    className="input-corporate"
                    placeholder="Ej. cliente@correo.com"
                    value={newCustomerForm.email}
                    onChange={(e) => setNewCustomerForm(prev => ({ ...prev, email: e.target.value }))}
                  />
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

                <div style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
                  <button
                    type="button"
                    onClick={() => setIsNewCustomerModalOpen(false)}
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
        {activeModal === "cart-pin-auth" && (
          <div style={styles.modalOverlay}>
            <div style={{ ...styles.cancelModal, width: "360px" }}>
              <h3 style={styles.modalTitle}>Autorización de Gerente/Admin</h3>
              <p style={{ fontSize: "12px", color: "#64748b", margin: "8px 0 16px 0", textAlign: "center" }}>
                Esta operación requiere la autorización de un Administrador o Gerente. Por favor, introduzca su PIN.
              </p>
              
              <form onSubmit={handleCartPinSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {/* PIN Dots Row */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
                  <div style={{ display: "flex", gap: "12px", height: "16px", alignItems: "center" }}>
                    {[0, 1, 2, 3].map((index) => (
                      <div
                        key={index}
                        style={{
                          width: "12px",
                          height: "12px",
                          borderRadius: "50%",
                          backgroundColor: cartPin.length > index ? "#1e3a8a" : "#cbd5e1",
                        }}
                      />
                    ))}
                  </div>
                  {cartPinError && (
                    <p style={{ fontSize: "12px", color: "#dc2626", fontWeight: "600", marginTop: "4px", textAlign: "center" }}>
                      {cartPinError}
                    </p>
                  )}
                </div>

                {/* PIN Pad */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
                  {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((num) => (
                    <button
                      key={num}
                      type="button"
                      style={{
                        height: "48px",
                        borderRadius: "6px",
                        border: "1px solid #e2e8f0",
                        backgroundColor: "#ffffff",
                        fontSize: "16px",
                        fontWeight: "700",
                        color: "#334155",
                        cursor: "pointer",
                      }}
                      onClick={() => {
                        if (cartPin.length < 4) {
                          setCartPin((prev) => prev + num);
                        }
                      }}
                      className="active-tap"
                    >
                      {num}
                    </button>
                  ))}
                  <button
                    type="button"
                    style={{
                      height: "48px",
                      borderRadius: "6px",
                      border: "1px solid #e2e8f0",
                      backgroundColor: "#f1f5f9",
                      color: "#64748b",
                      cursor: "pointer",
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                    onClick={() => setCartPin((prev) => prev.slice(0, -1))}
                    className="active-tap"
                  >
                    <Delete size={20} />
                  </button>
                  <button
                    type="button"
                    style={{
                      height: "48px",
                      borderRadius: "6px",
                      border: "1px solid #e2e8f0",
                      backgroundColor: "#ffffff",
                      fontSize: "16px",
                      fontWeight: "700",
                      color: "#334155",
                      cursor: "pointer",
                    }}
                    onClick={() => {
                      if (cartPin.length < 4) {
                        setCartPin((prev) => prev + "0");
                      }
                    }}
                    className="active-tap"
                  >
                    0
                  </button>
                  <button
                    type="submit"
                    disabled={cartPinLoading || cartPin.length < 4}
                    style={{
                      height: "48px",
                      borderRadius: "6px",
                      border: "none",
                      backgroundColor: cartPin.length === 4 ? "#1e3a8a" : "#cbd5e1",
                      color: "#ffffff",
                      cursor: cartPin.length === 4 ? "pointer" : "default",
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                    className="active-tap"
                  >
                    {cartPinLoading ? "..." : <KeyRound size={20} />}
                  </button>
                </div>

                {/* Botón Cancelar */}
                <button
                  type="button"
                  onClick={() => {
                    setPendingCartAction(null);
                    setActiveModal(null);
                  }}
                  style={{
                    padding: "10px",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    backgroundColor: "#ffffff",
                    color: "#64748b",
                    fontWeight: "700",
                    cursor: "pointer",
                  }}
                >
                  CANCELAR
                </button>
              </form>
            </div>
          </div>
        )}

        {/* MODAL 3: TICKET IMPRESO/PDF (Mockup 3) */}
        {activeModal === "ticket-view" && selectedSale && (
          <div style={styles.modalOverlay}>
            <div style={styles.ticketModal}>
              <div id="print-area" style={styles.ticketContainer}>
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
                <div style={{ textAlign: "center", marginBottom: "14px" }}>
                  <h4 style={{ textTransform: "uppercase", fontWeight: "800" }}>LYFRGL</h4>
                  <p style={{ fontSize: "11px", color: "#475569" }}>SUCURSAL: {user?.branch.name}</p>
                  <p style={{ fontSize: "10px", color: "#64748b" }}>TEL: 772 100 2000</p>
                </div>

                <div style={{ borderBottom: "1px dashed #cbd5e1", paddingBottom: "8px", marginBottom: "8px", fontSize: "11px" }}>
                  <p><strong>Folio:</strong> {selectedSale.invoiceNumber}</p>
                  <p><strong>Fecha:</strong> {new Date(selectedSale.createdAt).toLocaleDateString()}</p>
                  <p><strong>Hora:</strong> {new Date(selectedSale.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                  <p><strong>Cajero:</strong> {user?.name}</p>
                  <p><strong>Artículos:</strong> {selectedSale.items.reduce((sum: number, item: any) => sum + item.quantity, 0)}</p>
                </div>

                <table style={{ width: "100%", fontSize: "11px", borderCollapse: "collapse", marginBottom: "8px" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #cbd5e1" }}>
                      <th style={{ textAlign: "left", paddingBottom: "4px" }}>Producto</th>
                      <th style={{ textAlign: "center", paddingBottom: "4px" }}>Cant</th>
                      <th style={{ textAlign: "right", paddingBottom: "4px" }}>Importe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedSale.items.map((item: any, idx: number) => {
                      const promoDetails = calculateItemPromotion(item);
                      const hasDiscount = promoDetails.discountAmount > 0;
                      return (
                        <tr key={idx}>
                          <td style={{ padding: "4px 0" }}>
                            <div>{item.product.name}</div>
                            {item.product.activePromotion && (
                              <span style={{ fontSize: "9px", color: "#1e40af", fontWeight: "600" }}>
                                ({item.product.activePromotion.name})
                              </span>
                            )}
                          </td>
                          <td style={{ textAlign: "center", padding: "4px 0" }}>{item.quantity}</td>
                          <td style={{ textAlign: "right", padding: "4px 0" }}>
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
                      <span>AHORRO:</span>
                      <span>-${Number(selectedSale.discountAmount).toFixed(2)}</span>
                    </div>
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Subtotal:</span>
                    <span>${selectedSale.subtotal.toFixed(2)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>IVA (16%):</span>
                    <span>${selectedSale.tax.toFixed(2)}</span>
                  </div>
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

                <div style={{ borderTop: "1px dashed #cbd5e1", marginTop: "12px", paddingTop: "8px", fontSize: "9px", textAlign: "center", color: "#64748b", lineHeight: "1.4" }}>
                  <p>Portal de Autofacturación:</p>
                  <p style={{ fontWeight: "700" }}>http://localhost:5173/autofacturacion</p>
                  <p>Factura con tu folio de compra</p>
                </div>

                <div style={{ textAlign: "center", marginTop: "20px", fontSize: "10px", color: "#64748b" }}>
                  <p>¡GRACIAS POR SU COMPRA!</p>
                  <p>REGRESE PRONTO</p>
                </div>
              </div>

              <div style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
                <button onClick={handleCloseTicket} style={{ ...styles.modalBtn, backgroundColor: "#dc2626", color: "white" }}>
                  CERRAR TICKET
                </button>
                <button onClick={handlePrintTicket} style={{ ...styles.modalBtn, backgroundColor: "#059669", color: "white" }}>
                  <Printer size={16} /> IMPRIMIR
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ===========================================================================
  // RENDER D: DASHBOARD PRINCIPAL DEL CAJERO (Mockup 7)
  // ===========================================================================
  return (
    <div style={styles.appContainer}>
      {/* Navbar */}
      <header style={styles.navbar}>
        <div style={styles.navBrand}>
          <Store size={22} color="#ffffff" />
          <span style={styles.brandText}>POS - PUNTO DE VENTA</span>
        </div>
        <button onClick={handleLogoutClick} style={styles.logoutBtn} className="active-tap">
          <LogOut size={16} /> Cerrar Sesión
        </button>
      </header>

      <div style={styles.mainLayout}>
        {/* Sidebar */}
        <aside style={styles.sidebar}>
          <div style={styles.sidebarProfile}>
            <div style={styles.avatarCircle}>
              <Users size={22} color="#ffffff" />
            </div>
            <h4 style={styles.profileName}>{user?.name}</h4>
            <p style={styles.profileBranch}>{user?.branch.name}</p>
          </div>

          <a
            href="/autofacturacion"
            target="_blank"
            rel="noreferrer"
            style={{
              marginTop: "auto",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 14px",
              borderRadius: "8px",
              border: "1px solid #cbd5e1",
              backgroundColor: "#f8fafc",
              color: "#334155",
              textDecoration: "none",
              fontSize: "12px",
              fontWeight: "600",
              width: "100%",
              justifyContent: "center",
              cursor: "pointer",
              transition: "background-color 0.2s",
            }}
            onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#f1f5f9")}
            onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "#f8fafc")}
          >
            <FileText size={14} color="#0d9488" />
            Autofacturación
          </a>
        </aside>

        {/* Content Area */}
        <div style={styles.contentArea}>
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
            }}>
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
                className="active-tap"
              >
                DEPOSITAR AHORA
              </button>
            </div>
          )}

          {/* Tarjetas Superiores Estatus (Mockup 7) */}
          <div style={styles.statsGrid}>
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
            <div style={styles.actionsGrid}>
              <button onClick={handleNuevaVenta} style={styles.actionBtn} className="active-tap">
                <BadgePercent size={28} color="#1e3a8a" />
                <span>Nueva Venta</span>
              </button>
              <button onClick={() => setActiveModal("price-lookup")} style={styles.actionBtn} className="active-tap">
                <Search size={28} color="#1e3a8a" />
                <span>Consultar precio</span>
              </button>
              <button onClick={() => setActiveModal("ticket-history")} style={styles.actionBtn} className="active-tap">
                <Printer size={28} color="#1e3a8a" />
                <span>Reimprimir ticket</span>
              </button>
              <button onClick={() => setActiveModal("cancel-sale")} style={styles.actionBtn} className="active-tap">
                <XCircle size={28} color="#1e3a8a" />
                <span>Solicitar Cancelación</span>
              </button>
              <button onClick={() => setActiveModal("close-options")} style={styles.actionBtn} className="active-tap">
                <Store size={28} color="#dc2626" />
                <span>Cerrar Caja</span>
              </button>
              <button onClick={() => setActiveModal("bank-deposit")} style={styles.actionBtn} className="active-tap">
                <PiggyBank size={28} color="#0d9488" />
                <span>Depósito Banco</span>
              </button>
            </div>
          </div>

          {/* Tablas Inferiores (Mockup 7) */}
          <div style={styles.tablesGrid}>
            {/* Últimas Ventas */}
            <div className="card-premium" style={styles.tableCard}>
              <h4 style={styles.tableCardTitle}>ÚLTIMAS VENTAS</h4>
              <div style={{ overflowY: "auto", flex: 1, marginTop: "12px" }}>
                <table style={styles.table}>
                  <thead>
                    <tr style={styles.tableHeaderRow}>
                      <th style={styles.th}>FOLIO</th>
                      <th style={styles.th}>HORA</th>
                      <th style={styles.th}>TOTAL</th>
                      <th style={styles.th}>PAGO</th>
                      <th style={styles.th}>CAJERO</th>
                      <th style={styles.th}>ESTADO</th>
                      <th style={styles.th}>ACCIÓN</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentSales.map((sale) => (
                      <tr key={sale.id} style={styles.tableRow}>
                        <td style={{ ...styles.td, fontWeight: "600" }}>{sale.invoiceNumber}</td>
                        <td style={styles.td}>
                          {new Date(sale.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td style={{ ...styles.td, fontWeight: "700" }}>${sale.totalAmount.toFixed(2)}</td>
                        <td style={styles.td}>{sale.paymentMethod}</td>
                        <td style={styles.td}>{sale.cajero}</td>
                        <td style={styles.td}>
                          <span style={{
                            color: sale.status === "CANCELADA" ? "#dc2626" : "#059669",
                            fontWeight: "700",
                            fontSize: "12px"
                          }}>
                            {sale.status === "CANCELADA" ? "Cancelado" : "Activo"}
                          </span>
                        </td>
                        <td style={styles.td}>
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
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Solicitudes de Cancelación / Historial de depósitos */}
            <div className="card-premium" style={styles.tableCard}>
              <h4 style={styles.tableCardTitle}>HISTORIAL DE DEPÓSITOS BANCARIOS</h4>
              <div style={{ overflowY: "auto", flex: 1, marginTop: "12px" }}>
                <table style={styles.table}>
                  <thead>
                    <tr style={styles.tableHeaderRow}>
                      <th style={styles.th}>CUENTA TARGET</th>
                      <th style={styles.th}>BENEFICIARIO</th>
                      <th style={styles.th}>MONTO</th>
                      <th style={styles.th}>ESTADO</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentDeposits.map((dep) => (
                      <tr key={dep.id} style={styles.tableRow}>
                        <td style={styles.td}>**** **** **** {dep.accountNumber.slice(-4)}</td>
                        <td style={styles.td}>{dep.targetName}</td>
                        <td style={{ ...styles.td, fontWeight: "700", color: "#dc2626" }}>-${dep.amount.toFixed(2)}</td>
                        <td style={styles.td}>
                          <span style={styles.badgeSuccess}>Exitoso</span>
                        </td>
                      </tr>
                    ))}
                    {recentDeposits.length === 0 && (
                      <tr>
                        <td colSpan={4} style={{ textAlign: "center", padding: "20px", color: "#64748b" }}>
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
      {activeModal === "price-lookup" && (
        <div style={styles.modalOverlay}>
          <div style={styles.lookupModal}>
            <h3 style={styles.modalTitle}>Búsqueda de productos:</h3>
            <div style={styles.inputGroup}>
              <label style={styles.label}>Buscar:</label>
              <input
                type="text"
                className="input-corporate"
                placeholder="Nombre o id del producto"
                value={lookupQuery}
                onKeyDown={handleLookupKeyDown}
                onChange={(e) => setLookupQuery(e.target.value)}
              />
            </div>

            <div style={{ maxHeight: "240px", overflowY: "auto", marginTop: "14px", border: "1px solid #e2e8f0", borderRadius: "6px" }}>
              <table style={styles.table}>
                <thead>
                  <tr style={styles.tableHeaderRow}>
                    <th style={styles.th}>Producto</th>
                    <th style={styles.th}>Precio</th>
                    <th style={styles.th}>Existencia</th>
                  </tr>
                </thead>
                <tbody>
                  {lookupResults.map((p) => (
                    <tr key={p.id} style={styles.tableRow}>
                      <td style={styles.td}>{p.name}</td>
                      <td style={styles.td}>${p.sellPrice.toFixed(2)}</td>
                      <td style={styles.td}>{p.stock}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
              <button onClick={handleCloseLookup} style={{ ...styles.modalBtn, backgroundColor: "#dc2626", color: "white" }}>
                CANCELAR
              </button>
              <button onClick={handleCloseLookup} style={{ ...styles.modalBtn, backgroundColor: "#059669", color: "white" }}>
                ACEPTAR
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: AUTORIZACIÓN PIN GERENTE/ADMIN PARA CARRITO (Fase 3.0) */}
      {activeModal === "cart-pin-auth" && (
        <div style={styles.modalOverlay}>
          <div style={{ ...styles.cancelModal, width: "360px" }}>
            <h3 style={styles.modalTitle}>Autorización de Gerente/Admin</h3>
            <p style={{ fontSize: "12px", color: "#64748b", margin: "8px 0 16px 0", textAlign: "center" }}>
              Esta operación requiere la autorización de un Administrador o Gerente. Por favor, introduzca su PIN.
            </p>
            
            <form onSubmit={handleCartPinSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {/* PIN Dots Row */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
                <div style={{ display: "flex", gap: "12px", height: "16px", alignItems: "center" }}>
                  {[0, 1, 2, 3].map((index) => (
                    <div
                      key={index}
                      style={{
                        width: "12px",
                        height: "12px",
                        borderRadius: "50%",
                        backgroundColor: cartPin.length > index ? "#1e3a8a" : "#cbd5e1",
                      }}
                    />
                  ))}
                </div>
                {cartPinError && (
                  <p style={{ fontSize: "12px", color: "#dc2626", fontWeight: "600", marginTop: "4px", textAlign: "center" }}>
                    {cartPinError}
                  </p>
                )}
              </div>

              {/* PIN Pad */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
                {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((num) => (
                  <button
                    key={num}
                    type="button"
                    style={{
                      height: "48px",
                      borderRadius: "6px",
                      border: "1px solid #e2e8f0",
                      backgroundColor: "#ffffff",
                      fontSize: "16px",
                      fontWeight: "700",
                      color: "#334155",
                      cursor: "pointer",
                    }}
                    onClick={() => {
                      if (cartPin.length < 4) {
                        setCartPin((prev) => prev + num);
                      }
                    }}
                    className="active-tap"
                  >
                    {num}
                  </button>
                ))}
                <button
                  type="button"
                  style={{
                    height: "48px",
                    borderRadius: "6px",
                    border: "1px solid #e2e8f0",
                    backgroundColor: "#f1f5f9",
                    color: "#64748b",
                    cursor: "pointer",
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                  onClick={() => setCartPin((prev) => prev.slice(0, -1))}
                  className="active-tap"
                >
                  <Delete size={20} />
                </button>
                <button
                  type="button"
                  style={{
                    height: "48px",
                    borderRadius: "6px",
                    border: "1px solid #e2e8f0",
                    backgroundColor: "#ffffff",
                    fontSize: "16px",
                    fontWeight: "700",
                    color: "#334155",
                    cursor: "pointer",
                  }}
                  onClick={() => {
                    if (cartPin.length < 4) {
                      setCartPin((prev) => prev + "0");
                    }
                  }}
                  className="active-tap"
                >
                  0
                </button>
                <button
                  type="submit"
                  disabled={cartPinLoading || cartPin.length < 4}
                  style={{
                    height: "48px",
                    borderRadius: "6px",
                    border: "none",
                    backgroundColor: cartPin.length === 4 ? "#1e3a8a" : "#cbd5e1",
                    color: "#ffffff",
                    cursor: cartPin.length === 4 ? "pointer" : "default",
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                  className="active-tap"
                >
                  {cartPinLoading ? "..." : <KeyRound size={20} />}
                </button>
              </div>

              {/* Botón Cancelar */}
              <button
                type="button"
                onClick={() => {
                  setPendingCartAction(null);
                  setActiveModal(null);
                }}
                style={{
                  padding: "10px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  backgroundColor: "#ffffff",
                  color: "#64748b",
                  fontWeight: "700",
                  cursor: "pointer",
                }}
              >
                CANCELAR
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: SOLICITAR CANCELACIÓN CON PIN DE ADMIN (Mockup 1) */}
      {activeModal === "cancel-sale" && (
        <div style={styles.modalOverlay}>
          <div style={styles.cancelModal}>
            <h3 style={styles.modalTitle}>Cancelación Producto / Venta:</h3>
            <form onSubmit={handleCancelSaleSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px", marginTop: "14px" }}>
              <div style={styles.inputGroup}>
                <label htmlFor="cancelInvoice" style={styles.label}>Folio de Venta (Invoice):</label>
                <input
                  id="cancelInvoice"
                  type="text"
                  required
                  className="input-corporate"
                  placeholder="V-XXXXXX"
                  value={cancelInvoice}
                  onChange={(e) => setCancelInvoice(e.target.value)}
                />
              </div>

              {cancelSalePreview && (
                <div style={{
                  backgroundColor: "#f8fafc",
                  border: "1px dashed #cbd5e1",
                  borderRadius: "6px",
                  padding: "10px 12px",
                  fontSize: "12px",
                  color: "#334155",
                  marginTop: "-4px"
                }}>
                  <div style={{ fontWeight: "700", marginBottom: "4px", color: "#1e3a8a" }}>
                    Resumen de Venta Encontrada:
                  </div>
                  <div><strong>Fecha:</strong> {new Date(cancelSalePreview.createdAt).toLocaleString()}</div>
                  <div><strong>Total:</strong> <span style={{ fontWeight: "700", color: "#b91c1c" }}>${cancelSalePreview.total.toFixed(2)}</span></div>
                  <div><strong>Artículos:</strong> {cancelSalePreview.items.reduce((sum: number, item: any) => sum + item.quantity, 0)} pz</div>
                  <div style={{ fontSize: "10px", marginTop: "4px", color: "#64748b", maxHeight: "60px", overflowY: "auto" }}>
                    {cancelSalePreview.items.map((it: any) => `${it.product.name} (x${it.quantity})`).join(", ")}
                  </div>
                </div>
              )}

              <div style={styles.inputGroup}>
                <label htmlFor="cancelPin" style={styles.label}>PIN de Autorización del Gerente:</label>
                <input
                  id="cancelPin"
                  type="password"
                  maxLength={4}
                  required
                  className="input-corporate"
                  placeholder="PIN de 4 dígitos"
                  value={cancelPin}
                  onChange={(e) => setCancelPin(e.target.value)}
                />
              </div>

              <div style={styles.inputGroup}>
                <label htmlFor="cancelReason" style={styles.label}>Motivo de Cancelación:</label>
                <input
                  id="cancelReason"
                  type="text"
                  required
                  className="input-corporate"
                  placeholder="Ej. Producto equivocado, error de cobro"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                />
              </div>

              <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
                <button
                  type="button"
                  onClick={handleCloseModal_cancelSale}
                  style={{ ...styles.modalBtn, backgroundColor: "#dc2626", color: "white" }}
                >
                  VOLVER
                </button>
                <button
                  type="submit"
                  disabled={cancelLoading}
                  style={{ ...styles.modalBtn, backgroundColor: "#059669", color: "white" }}
                >
                  {cancelLoading ? "Cancelando..." : "CANCELAR VENTA"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: TICKET IMPRESO/PDF (Mockup 3) */}
      {activeModal === "ticket-view" && selectedSale && (
        <div style={styles.modalOverlay}>
          <div style={styles.ticketModal}>
            <div id="print-area" style={styles.ticketContainer}>
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
              <div style={{ textAlign: "center", marginBottom: "14px" }}>
                <h4 style={{ textTransform: "uppercase", fontWeight: "800" }}>LYFRGL</h4>
                <p style={{ fontSize: "11px", color: "#475569" }}>SUCURSAL: {user?.branch.name}</p>
                <p style={{ fontSize: "10px", color: "#64748b" }}>TEL: 772 100 2000</p>
              </div>

              <div style={{ borderBottom: "1px dashed #cbd5e1", paddingBottom: "8px", marginBottom: "8px", fontSize: "11px" }}>
                <p><strong>Folio:</strong> {selectedSale.invoiceNumber}</p>
                <p><strong>Fecha:</strong> {new Date(selectedSale.createdAt).toLocaleDateString()}</p>
                <p><strong>Hora:</strong> {new Date(selectedSale.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                <p><strong>Cajero:</strong> {user?.name}</p>
                <p><strong>Artículos:</strong> {selectedSale.items.reduce((sum: number, item: any) => sum + item.quantity, 0)}</p>
              </div>

              {selectedSale.status === "CANCELADA" && (
                <div style={{ textAlign: "center", padding: "6px", borderTop: "2px dashed #dc2626", borderBottom: "2px dashed #dc2626", marginBottom: "10px", color: "#dc2626", fontWeight: "bold" }}>
                  <h4 style={{ margin: 0, fontSize: "14px" }}>*** CANCELADO ***</h4>
                  {selectedSale.refundStatus && (
                    <p style={{ margin: "4px 0 0 0", fontSize: "10px" }}>
                      REEMBOLSO {selectedSale.refundStatus === "APPROVED" ? "REALIZADO" : "PENDIENTE"}
                    </p>
                  )}
                </div>
              )}

              <table style={{ width: "100%", fontSize: "11px", borderCollapse: "collapse", marginBottom: "8px" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #cbd5e1" }}>
                    <th style={{ textAlign: "left", paddingBottom: "4px" }}>Producto</th>
                    <th style={{ textAlign: "center", paddingBottom: "4px" }}>Cant</th>
                    <th style={{ textAlign: "right", paddingBottom: "4px" }}>Importe</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedSale.items.map((item: any, idx: number) => (
                    <tr key={idx}>
                      <td style={{ padding: "4px 0" }}>{item.product.name}</td>
                      <td style={{ textAlign: "center", padding: "4px 0" }}>{item.quantity}</td>
                      <td style={{ textAlign: "right", padding: "4px 0" }}>
                        ${(item.product.sellPrice * item.quantity).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ borderTop: "1px dashed #cbd5e1", paddingTop: "8px", display: "flex", flexDirection: "column", gap: "4px", fontSize: "11px" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Subtotal:</span>
                  <span>${selectedSale.subtotal.toFixed(2)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>IVA (16%):</span>
                  <span>${selectedSale.tax.toFixed(2)}</span>
                </div>
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

              <div style={{ borderTop: "1px dashed #cbd5e1", marginTop: "12px", paddingTop: "8px", fontSize: "9px", textAlign: "center", color: "#64748b", lineHeight: "1.4" }}>
                <p>Portal de Autofacturación:</p>
                <p style={{ fontWeight: "700" }}>http://localhost:5173/autofacturacion</p>
                <p>Factura con tu folio de compra</p>
              </div>

              <div style={{ textAlign: "center", marginTop: "20px", fontSize: "10px", color: "#64748b" }}>
                <p>¡GRACIAS POR SU COMPRA!</p>
                <p>REGRESE PRONTO</p>
              </div>
            </div>

            <div style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
              <button onClick={handleCloseTicket} style={{ ...styles.modalBtn, backgroundColor: "#dc2626", color: "white" }}>
                CERRAR TICKET
              </button>
              <button onClick={handlePrintTicket} style={{ ...styles.modalBtn, backgroundColor: "#059669", color: "white" }}>
                <Printer size={16} /> IMPRIMIR
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: OPCIONES DE CIERRE DE CAJA */}
      {activeModal === "close-options" && (
        <div style={styles.modalOverlay}>
          <div style={{ ...styles.closeModal, width: "400px" }}>
            <h3 style={styles.modalTitle}>Cierre de Caja</h3>
            <p style={{ fontSize: "13px", color: "#64748b", margin: "8px 0 20px 0", textAlign: "center", lineHeight: "1.5" }}>
              Seleccione la operación de caja que desea realizar:
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", width: "100%" }}>
              <button
                onClick={() => setActiveModal("partial-cut-summary")}
                style={{
                  padding: "14px",
                  borderRadius: "8px",
                  border: "1px solid #3b82f6",
                  backgroundColor: "#eff6ff",
                  color: "#1e3a8a",
                  fontWeight: "700",
                  cursor: "pointer",
                  fontSize: "14px",
                  transition: "all 0.15s ease",
                  textAlign: "center"
                }}
                className="active-tap"
              >
                Corte Parcial (Cut de Caja)
              </button>
              <button
                onClick={() => setActiveModal("close-cash")}
                style={{
                  padding: "14px",
                  borderRadius: "8px",
                  border: "none",
                  backgroundColor: "#dc2626",
                  color: "white",
                  fontWeight: "700",
                  cursor: "pointer",
                  fontSize: "14px",
                  transition: "all 0.15s ease",
                  textAlign: "center"
                }}
                className="active-tap"
              >
                Cierre de Turno (Final)
              </button>
              <button
                onClick={() => setActiveModal(null)}
                style={{
                  padding: "10px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  backgroundColor: "#ffffff",
                  color: "#64748b",
                  fontWeight: "700",
                  cursor: "pointer",
                  fontSize: "12px",
                  textAlign: "center",
                  marginTop: "8px"
                }}
              >
                CANCELAR
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CORTE PARCIAL (Resumen) */}
      {activeModal === "partial-cut-summary" && (
        <div style={styles.modalOverlay}>
          <div style={styles.closeModal}>
            <h3 style={styles.modalTitle}>Resumen de Corte Parcial:</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "14px" }}>
              <div style={styles.summaryRow}>
                <span>Vendedor:</span>
                <span style={{ fontWeight: "700" }}>{user?.name}</span>
              </div>
              <div style={styles.summaryRow}>
                <span>Total Ventas Brutas:</span>
                <span style={{ fontWeight: "600" }}>${sessionStats?.totalSalesAmount?.toFixed(2) || "0.00"}</span>
              </div>
              <div style={styles.summaryRow}>
                <span>Total Efectivo:</span>
                <span style={{ fontWeight: "600", color: "#059669" }}>${sessionStats?.cashTotal?.toFixed(2) || "0.00"}</span>
              </div>
              <div style={styles.summaryRow}>
                <span>Total Tarjeta Crédito:</span>
                <span style={{ fontWeight: "600", color: "#0d9488" }}>${sessionStats?.creditCardTotal?.toFixed(2) || "0.00"}</span>
              </div>
              <div style={styles.summaryRow}>
                <span>Total Tarjeta Débito:</span>
                <span style={{ fontWeight: "600", color: "#0d9488" }}>${sessionStats?.debitCardTotal?.toFixed(2) || "0.00"}</span>
              </div>
              <div style={styles.summaryRow}>
                <span>Cancelaciones:</span>
                <span style={{ fontWeight: "600", color: "#dc2626" }}>${sessionStats?.totalRefunds?.toFixed(2) || "0.00"}</span>
              </div>
              <div style={{ ...styles.summaryRow, borderTop: "1px dashed #cbd5e1", paddingTop: "10px", paddingBottom: "10px" }}>
                <span>Total Neto:</span>
                <span style={{ fontWeight: "800", color: "#1e3a8a", fontSize: "16px" }}>
                  ${sessionStats?.netTotal?.toFixed(2) || "0.00"}
                </span>
              </div>

              <div style={{ display: "flex", gap: "10px", marginTop: "14px" }}>
                <button 
                  onClick={() => setActiveModal("close-options")} 
                  style={{ ...styles.modalBtn, backgroundColor: "#dc2626", color: "white" }}
                >
                  VOLVER
                </button>
                <button
                  disabled={partialCutLoading}
                  onClick={handleSavePartialCut}
                  style={{ ...styles.modalBtn, backgroundColor: "#059669", color: "white" }}
                  className="active-tap"
                >
                  {partialCutLoading ? "Guardando..." : "GUARDAR CORTE"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: COMPROBANTE DE CORTE PARCIAL */}
      {activeModal === "partial-cut-receipt" && partialCutData && (
        <div style={styles.modalOverlay}>
          <div style={styles.ticketModal}>
            <h3 style={styles.modalTitle}>Comprobante de Corte Parcial</h3>
            <p style={{ fontSize: "11px", color: "#64748b", margin: "4px 0 16px 0", textAlign: "center" }}>
              Corte parcial registrado exitosamente en base de datos.
            </p>
            
            <div style={styles.ticketContainer} id="partial-cut-thermal-receipt">
              <div style={{ textAlign: "center", borderBottom: "1px dashed #cbd5e1", paddingBottom: "10px", marginBottom: "10px" }}>
                <strong style={{ fontSize: "14px" }}>LYFRGL POS</strong>
                <p style={{ fontSize: "11px", margin: "2px 0 0 0" }}>SUCURSAL: {user?.branch.name}</p>
                <p style={{ fontSize: "10px", margin: "2px 0 0 0" }}>CORTE PARCIAL #{partialCutData.cutNumber}</p>
                <p style={{ fontSize: "9px", margin: "2px 0 0 0", color: "#64748b" }}>
                  {new Date(partialCutData.createdAt).toLocaleString()}
                </p>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "11px" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>CAJERO:</span>
                  <strong>{user?.name}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>SESIÓN DE CAJA:</span>
                  <strong>#{partialCutData.cashSessionId}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px dashed #cbd5e1", paddingTop: "6px", marginTop: "4px" }}>
                  <span>VENTAS BRUTAS:</span>
                  <strong>${Number(partialCutData.totalSales).toFixed(2)}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>EFECTIVO:</span>
                  <strong>${Number(partialCutData.totalCash).toFixed(2)}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>TARJETA CRÉDITO:</span>
                  <strong>${Number(partialCutData.totalCreditCard).toFixed(2)}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>TARJETA DÉBITO:</span>
                  <strong>${Number(partialCutData.totalDebitCard).toFixed(2)}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>CANCELACIONES:</span>
                  <strong style={{ color: "#dc2626" }}>-${Number(partialCutData.totalRefunds).toFixed(2)}</strong>
                </div>
              </div>

              <div style={{ marginTop: "14px", paddingTop: "8px", borderTop: "2px solid #0f172a", display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
                <strong>TOTAL NETO:</strong>
                <strong>${Number(partialCutData.netTotal).toFixed(2)} MXN</strong>
              </div>

              <div style={{ textAlign: "center", marginTop: "20px", fontSize: "9px", color: "#64748b", borderTop: "1px dashed #cbd5e1", paddingTop: "8px" }}>
                <span>*** COMPROBANTE DE CORTE PARCIAL ***</span>
              </div>
            </div>

            <div style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
              <button 
                onClick={() => {
                  const printContents = document.getElementById("partial-cut-thermal-receipt")?.innerHTML;
                  if (printContents) {
                    const printWindow = window.open("", "_blank");
                    if (printWindow) {
                      printWindow.document.write(`
                        <html>
                          <head>
                            <title>Corte Parcial #${partialCutData.cutNumber}</title>
                            <style>
                              body { font-family: monospace; padding: 20px; width: 300px; margin: 0 auto; }
                              table { width: 100%; border-collapse: collapse; }
                              th, td { text-align: left; padding: 4px; }
                              .dashed { border-top: 1px dashed #000; margin: 10px 0; }
                              .total { font-weight: bold; font-size: 14px; border-top: 2px solid #000; padding-top: 5px; }
                              .center { text-align: center; }
                            </style>
                          </head>
                          <body>
                            ${printContents}
                            <script>window.print(); window.close();</script>
                          </body>
                        </html>
                      `);
                      printWindow.document.close();
                    }
                  }
                }} 
                style={{ ...styles.modalBtn, backgroundColor: "#1e3a8a", color: "white" }}
              >
                IMPRIMIR
              </button>
              <button onClick={handleCloseModal_partialCut} style={{ ...styles.modalBtn, backgroundColor: "#059669", color: "white" }}>
                CERRAR
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: CIERRE DE CAJA / ARQUEO (Mockup 2) */}
      {activeModal === "close-cash" && (
        <div style={styles.modalOverlay}>
          <div style={styles.closeModal}>
            <h3 style={styles.modalTitle}>Cierre de caja:</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "14px" }}>
              <div style={styles.summaryRow}>
                <span>Vendedor:</span>
                <span style={{ fontWeight: "700" }}>{user?.name}</span>
              </div>
              <div style={styles.summaryRow}>
                <span>Fondo Inicial:</span>
                <span style={{ fontWeight: "600" }}>${sessionStats?.initialAmount.toFixed(2)}</span>
              </div>
              <div style={styles.summaryRow}>
                <span>Ventas Acumuladas:</span>
                <span style={{ fontWeight: "600" }}>${sessionStats?.cashIn.toFixed(2)}</span>
              </div>
              <div style={styles.summaryRow}>
                <span>Depósitos/Retiros:</span>
                <span style={{ fontWeight: "600", color: "#dc2626" }}>-${sessionStats?.cashOut.toFixed(2)}</span>
              </div>
              <div style={styles.summaryRow}>
                <span>Ventas Tarjeta Débito:</span>
                <span style={{ fontWeight: "600", color: "#0d9488" }}>${sessionStats?.debitCardTotal?.toFixed(2) || "0.00"}</span>
              </div>
              <div style={styles.summaryRow}>
                <span>Ventas Tarjeta Crédito:</span>
                <span style={{ fontWeight: "600", color: "#0d9488" }}>${sessionStats?.creditCardTotal?.toFixed(2) || "0.00"}</span>
              </div>
              <div style={styles.summaryRow}>
                <span>&nbsp;&nbsp;&nbsp;↳ Pendientes (Resguardo):</span>
                <span style={{ fontWeight: "600", color: "#d97706" }}>${sessionStats?.pendingDeposits?.toFixed(2) || "0.00"}</span>
              </div>
              <div style={styles.summaryRow}>
                <span>&nbsp;&nbsp;&nbsp;↳ Confirmados:</span>
                <span style={{ fontWeight: "600", color: "#059669" }}>${sessionStats?.confirmedDeposits?.toFixed(2) || "0.00"}</span>
              </div>
              <div style={styles.summaryRow}>
                <span>&nbsp;&nbsp;&nbsp;↳ Cancelados (Revertidos):</span>
                <span style={{ fontWeight: "600", color: "#b91c1c" }}>${sessionStats?.cancelledDeposits?.toFixed(2) || "0.00"}</span>
              </div>
              <div style={styles.summaryRow}>
                <span>Reembolsos (x{sessionStats?.refundedSalesCount || 0}):</span>
                <span style={{ fontWeight: "600", color: "#64748b" }}>${sessionStats?.refundedAmount?.toFixed(2) || "0.00"}</span>
              </div>
              <div style={{ ...styles.summaryRow, borderBottom: "1px dashed #cbd5e1", paddingBottom: "10px" }}>
                <span>Efectivo Esperado en Caja:</span>
                <span style={{ fontWeight: "800", color: "#1e3a8a" }}>${sessionStats?.expectedAmount.toFixed(2)}</span>
              </div>

              <div style={styles.inputGroup}>
                <label style={styles.label}>Efectivo Contado (Físico en Caja):</label>
                <input
                  type="text"
                  className="input-corporate"
                  style={{ fontSize: "16px", fontWeight: "700", textAlign: "center" }}
                  placeholder="Ingrese el conteo físico"
                  value={declaredCash}
                  onChange={(e) => setDeclaredCash(e.target.value)}
                />
              </div>

              <div style={styles.summaryRow}>
                <span>Diferencia (Sobrante/Faltante):</span>
                <span style={{ fontWeight: "800", color: calculatedDifference < 0 ? "#dc2626" : "#059669" }}>
                  ${calculatedDifference.toFixed(2)}
                </span>
              </div>

              <div style={{ display: "flex", gap: "10px", marginTop: "14px" }}>
                <button onClick={handleCloseModal_closeCash} style={{ ...styles.modalBtn, backgroundColor: "#dc2626", color: "white" }}>
                  CANCELAR
                </button>
                <button
                  disabled={closingLoading}
                  onClick={handleCloseShift}
                  style={{ ...styles.modalBtn, backgroundColor: "#059669", color: "white" }}
                >
                  {closingLoading ? "Cerrando..." : "CERRAR TURNO"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: DEPOSITO BANCARIO (Resguardo de Efectivo) */}
      {activeModal === "bank-deposit" && (
        <div style={styles.modalOverlay}>
          <div style={styles.depositModal}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #cbd5e1", paddingBottom: "8px", marginBottom: "14px" }}>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "800", color: "#0f172a" }}>
                Resguardo de Efectivo (Cash Deposit)
              </h3>
              <button 
                onClick={() => setActiveModal(null)} 
                style={{ background: "none", border: "none", color: "#94a3b8", fontSize: "20px", cursor: "pointer", fontWeight: "bold" }}
              >
                &times;
              </button>
            </div>
            
            <div style={{ backgroundColor: "#e0f2fe", border: "1px solid #bae6fd", borderRadius: "8px", padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "13px", color: "#0369a1", fontWeight: "600", marginTop: "12px", marginBottom: "14px" }}>
              <span>Efectivo disponible en caja:</span>
              <span style={{ fontSize: "15px", fontWeight: "800" }}>${sessionStats?.expectedAmount?.toFixed(2) || "0.00"}</span>
            </div>

            {cancellingDep ? (
              <div style={{ padding: "16px", border: "1px solid #fca5a5", borderRadius: "8px", backgroundColor: "#fff5f5", display: "flex", flexDirection: "column", gap: "14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#991b1b" }}>
                  <AlertTriangle size={20} />
                  <strong style={{ fontSize: "14px" }}>Confirmar Cancelación de Resguardo</strong>
                </div>
                <p style={{ fontSize: "12px", color: "#7f1d1d", margin: 0 }}>
                  Se requiere la validación mediante el PIN de un Gerente o Administrador. El monto de <strong>${Number(cancellingDep.amount).toFixed(2)} MXN</strong> se restará de las salidas de efectivo del turno actual (reversión de cashOut).
                </p>
                <form onSubmit={handleCancelDepositSubmit} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div style={styles.inputGroup}>
                    <label style={styles.label}>PIN de Autorización del Gerente:</label>
                    <input
                      type="password"
                      maxLength={4}
                      required
                      className="input-corporate"
                      placeholder="Ej. ****"
                      value={depCancelPin}
                      onChange={(e) => setDepCancelPin(e.target.value)}
                    />
                  </div>
                  <div style={styles.inputGroup}>
                    <label style={styles.label}>Motivo de Cancelación:</label>
                    <input
                      type="text"
                      required
                      className="input-corporate"
                      placeholder="Motivo detallado de la cancelación"
                      value={depCancelReason}
                      onChange={(e) => setDepCancelReason(e.target.value)}
                    />
                  </div>
                  <div style={{ display: "flex", gap: "10px", marginTop: "6px" }}>
                    <button
                      type="button"
                      onClick={() => {
                        setCancellingDep(null);
                        setDepCancelPin("");
                        setDepCancelReason("");
                      }}
                      style={{ ...styles.modalBtn, backgroundColor: "#64748b", color: "white" }}
                    >
                      VOLVER AL HISTORIAL
                    </button>
                    <button
                      type="submit"
                      disabled={depCancelLoading}
                      style={{ ...styles.modalBtn, backgroundColor: "#dc2626", color: "white" }}
                    >
                      {depCancelLoading ? "Cancelando..." : "CANCELAR RESGUARDO"}
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <>
                {/* Selector de pestañas */}
                <div style={{ display: "flex", borderBottom: "2px solid #e2e8f0", marginBottom: "16px" }}>
                  <button
                    type="button"
                    onClick={() => setDepTab("registrar")}
                    style={{
                      flex: 1,
                      padding: "10px",
                      border: "none",
                      borderBottom: depTab === "registrar" ? "3px solid #2563eb" : "none",
                      backgroundColor: "transparent",
                      fontWeight: "700",
                      color: depTab === "registrar" ? "#2563eb" : "#64748b",
                      cursor: "pointer"
                    }}
                  >
                    REGISTRAR RESGUARDO
                  </button>
                  <button
                    type="button"
                    onClick={() => setDepTab("buscar")}
                    style={{
                      flex: 1,
                      padding: "10px",
                      border: "none",
                      borderBottom: depTab === "buscar" ? "3px solid #2563eb" : "none",
                      backgroundColor: "transparent",
                      fontWeight: "700",
                      color: depTab === "buscar" ? "#2563eb" : "#64748b",
                      cursor: "pointer"
                    }}
                  >
                    BUSCAR / HISTORIAL
                  </button>
                </div>

                {depTab === "registrar" ? (
                  <form onSubmit={handleDepositSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                    
                    {/* Tarjeta de Datos Calculados */}
                    <div style={{ border: "1px solid #e2e8f0", borderRadius: "8px", padding: "12px", backgroundColor: "#f8fafc", marginBottom: "4px" }}>
                      <h4 style={{ fontSize: "11px", fontWeight: "700", color: "#475569", textTransform: "uppercase", marginBottom: "8px", borderBottom: "1px solid #e2e8f0", paddingBottom: "4px" }}>
                        Información Operativa
                      </h4>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", fontSize: "11px" }}>
                        <div>
                          <span style={{ color: "#64748b" }}>Referencia Estimada:</span>
                          <strong style={{ display: "block", color: "#0f172a", marginTop: "2px" }}>DEP-{new Date().toISOString().slice(0, 10).replace(/-/g, "")}-[SIG]</strong>
                        </div>
                        <div>
                          <span style={{ color: "#64748b" }}>Estado del Registro:</span>
                          <strong style={{ display: "block", color: "#059669", marginTop: "2px" }}>COMPLETED (Salida Física)</strong>
                        </div>
                        <div>
                          <span style={{ color: "#64748b" }}>Fecha de Registro:</span>
                          <strong style={{ display: "block", color: "#0f172a", marginTop: "2px" }}>{new Date().toLocaleDateString()}</strong>
                        </div>
                        <div>
                          <span style={{ color: "#64748b" }}>Método de Retiro:</span>
                          <strong style={{ display: "block", color: "#0f172a", marginTop: "2px" }}>Efectivo en Caja Chica</strong>
                        </div>
                      </div>
                    </div>

                    <div style={styles.inputGroup}>
                      <label style={styles.label}>Número de Cuenta Target (16 dígitos):</label>
                      <input
                        type="text"
                        maxLength={16}
                        required
                        className="input-corporate"
                        placeholder="Ej. 1234567890123456"
                        value={depAccount}
                        onChange={(e) => setDepAccount(e.target.value)}
                      />
                    </div>

                    <div style={styles.inputGroup}>
                      <label style={styles.label}>Nombre del Beneficiario:</label>
                      <input
                        type="text"
                        required
                        className="input-corporate"
                        placeholder="Nombre de la persona o banco"
                        value={depName}
                        onChange={(e) => setDepName(e.target.value)}
                      />
                    </div>

                    <div style={styles.inputGroup}>
                      <label style={styles.label}>Monto a Retirar y Depositar ($):</label>
                      <input
                        type="text"
                        required
                        className="input-corporate"
                        placeholder="Monto a retirar en efectivo"
                        value={depAmount}
                        onChange={(e) => setDepAmount(e.target.value)}
                      />
                    </div>

                    <div style={styles.inputGroup}>
                      <label style={styles.label}>Comentarios / Referencia:</label>
                      <input
                        type="text"
                        className="input-corporate"
                        placeholder="Ej. Número de sucursal, folio de camión blindado, etc."
                        value={depComments}
                        onChange={(e) => setDepComments(e.target.value)}
                      />
                    </div>

                    <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
                      <button
                        type="button"
                        onClick={() => setActiveModal(null)}
                        style={{ ...styles.modalBtn, backgroundColor: "#dc2626", color: "white" }}
                      >
                        CERRAR
                      </button>
                      <button
                        type="submit"
                        disabled={depLoading}
                        style={{ ...styles.modalBtn, backgroundColor: "#059669", color: "white" }}
                      >
                        {depLoading ? "Procesando..." : "REGISTRAR RESGUARDO"}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {/* Filtros de Búsqueda */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px", marginBottom: "10px" }}>
                      <div style={styles.inputGroup}>
                        <label style={styles.label}>Referencia:</label>
                        <input
                           type="text"
                           className="input-corporate"
                           placeholder="DEP-..."
                           value={searchDepRef}
                           onChange={(e) => setSearchDepRef(e.target.value)}
                        />
                      </div>
                      <div style={styles.inputGroup}>
                        <label style={styles.label}>Estado:</label>
                        <select
                          value={searchDepStatus}
                          onChange={(e) => setSearchDepStatus(e.target.value)}
                          style={styles.select}
                        >
                          <option value="ALL">Todos</option>
                          <option value="COMPLETED">Completados</option>
                          <option value="PENDING">Pendientes</option>
                          <option value="CANCELLED">Cancelados</option>
                        </select>
                      </div>
                      <div style={styles.inputGroup}>
                        <label style={styles.label}>Cajero:</label>
                        <select
                          value={searchDepUser}
                          onChange={(e) => setSearchDepUser(e.target.value)}
                          style={styles.select}
                        >
                          <option value="">Todos</option>
                          {cashiers.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "14px" }}>
                      <div style={styles.inputGroup}>
                        <label style={styles.label}>Desde:</label>
                        <input
                          type="date"
                          className="input-corporate"
                          value={searchDepDateFrom}
                          onChange={(e) => setSearchDepDateFrom(e.target.value)}
                        />
                      </div>
                      <div style={styles.inputGroup}>
                        <label style={styles.label}>Hasta:</label>
                        <input
                          type="date"
                          className="input-corporate"
                          value={searchDepDateTo}
                          onChange={(e) => setSearchDepDateTo(e.target.value)}
                        />
                      </div>
                    </div>

                    {/* Tabla de Resultados */}
                    <div style={{ maxHeight: "220px", overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: "6px", marginBottom: "14px" }}>
                      <table style={styles.table}>
                        <thead>
                          <tr style={styles.tableHeaderRow}>
                            <th style={{ ...styles.th, padding: "8px" }}>Referencia / Fecha</th>
                            <th style={{ ...styles.th, padding: "8px" }}>Destino</th>
                            <th style={{ ...styles.th, padding: "8px" }}>Monto</th>
                            <th style={{ ...styles.th, padding: "8px" }}>Cajero</th>
                            <th style={{ ...styles.th, padding: "8px" }}>Estado</th>
                            <th style={{ ...styles.th, padding: "8px" }}>Acción</th>
                          </tr>
                        </thead>
                        <tbody>
                          {depSearchLoading ? (
                            <tr>
                              <td colSpan={6} style={{ textAlign: "center", padding: "16px", color: "#64748b", fontSize: "12px" }}>
                                Buscando resguardos...
                              </td>
                            </tr>
                          ) : depSearchResults.length === 0 ? (
                            <tr>
                              <td colSpan={6} style={{ textAlign: "center", padding: "16px", color: "#64748b", fontSize: "12px" }}>
                                No se encontraron resguardos.
                              </td>
                            </tr>
                          ) : (
                            depSearchResults.map((dep) => (
                              <tr key={dep.id} style={styles.tableRow}>
                                <td style={{ ...styles.td, padding: "8px", fontSize: "12px" }}>
                                  <div style={{ fontWeight: "700" }}>{dep.reference || `#${dep.id}`}</div>
                                  <div style={{ fontSize: "10px", color: "#64748b" }}>{new Date(dep.createdAt).toLocaleDateString()}</div>
                                </td>
                                <td style={{ ...styles.td, padding: "8px", fontSize: "12px" }}>
                                  <div>****{dep.accountNumber.slice(-4)}</div>
                                  <div style={{ fontSize: "10px", color: "#64748b" }}>{dep.targetName}</div>
                                </td>
                                <td style={{ ...styles.td, padding: "8px", fontSize: "12px", fontWeight: "700", color: dep.status === "CANCELLED" ? "#b91c1c" : "#0f172a" }}>
                                  {dep.status === "CANCELLED" ? "" : "-"}${Number(dep.amount).toFixed(2)}
                                </td>
                                <td style={{ ...styles.td, padding: "8px", fontSize: "12px" }}>{dep.userName}</td>
                                <td style={{ ...styles.td, padding: "8px", fontSize: "12px" }}>
                                  <span style={
                                    dep.status === "COMPLETED" ? styles.badgeSuccess : 
                                    dep.status === "CANCELLED" ? styles.badgeDanger : 
                                    styles.badgeWarning
                                  }>
                                    {dep.status === "COMPLETED" ? "Exitoso" : 
                                     dep.status === "CANCELLED" ? "Cancelado" : "Pendiente"}
                                  </span>
                                </td>
                                <td style={{ ...styles.td, padding: "8px", fontSize: "12px" }}>
                                  <div style={{ display: "flex", gap: "4px" }}>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setLastDeposit(dep);
                                        setActiveModal("deposit-receipt");
                                      }}
                                      style={{
                                        padding: "4px 6px",
                                        borderRadius: "4px",
                                        backgroundColor: "#eff6ff",
                                        color: "#1d4ed8",
                                        border: "1px solid #bfdbfe",
                                        fontSize: "10px",
                                        fontWeight: "700",
                                        cursor: "pointer"
                                      }}
                                    >
                                      Ver
                                    </button>
                                    {dep.status !== "CANCELLED" && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setCancellingDep(dep);
                                        }}
                                        style={{
                                          padding: "4px 6px",
                                          borderRadius: "4px",
                                          backgroundColor: "#fef2f2",
                                          color: "#b91c1c",
                                          border: "1px solid #fecaca",
                                          fontSize: "10px",
                                          fontWeight: "700",
                                          cursor: "pointer"
                                        }}
                                      >
                                        Cancelar
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>

                    <button
                      type="button"
                      onClick={() => setActiveModal(null)}
                      style={{ ...styles.modalBtn, backgroundColor: "#64748b", color: "white", width: "100%" }}
                    >
                      CERRAR HISTORIAL
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* MODAL: COMPROBANTE DE RETIRO/DEPÓSITO BANCARIO (Fase 3.0) */}
      {activeModal === "deposit-receipt" && lastDeposit && (
        <div style={styles.modalOverlay}>
          <div style={styles.ticketModal}>
            <h3 style={styles.modalTitle}>Comprobante de Retiro</h3>
            <p style={{ fontSize: "11px", color: "#64748b", margin: "4px 0 16px 0", textAlign: "center" }}>
              Depósito bancario registrado exitosamente en base de datos.
            </p>
            
            <div style={styles.ticketContainer} id="deposit-thermal-receipt">
              <div style={{ textAlign: "center", borderBottom: "1px dashed #cbd5e1", paddingBottom: "10px", marginBottom: "10px" }}>
                <strong style={{ fontSize: "14px" }}>LYFRGL POS</strong>
                <p style={{ fontSize: "11px", margin: "2px 0 0 0" }}>{user?.branch.name}</p>
                <p style={{ fontSize: "9px", margin: "2px 0 0 0", color: "#64748b" }}>
                  {new Date(lastDeposit.createdAt).toLocaleString()}
                </p>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "11px" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>TIPO MOV:</span>
                  <strong>RETIRO DE CAJA (DEPÓSITO)</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>ID RETIRO:</span>
                  <strong>#{lastDeposit.id}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>CUENTA DESTINO:</span>
                  <strong>**** **** **** {lastDeposit.accountNumber.slice(-4)}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>BENEFICIARIO:</span>
                  <strong style={{ textAlign: "right" }}>{lastDeposit.targetName}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>MÉTODO DE RETIRO:</span>
                  <strong>{lastDeposit.paymentType}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>SESIÓN DE CAJA:</span>
                  <strong>#{lastDeposit.sessionId}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>CAJERO:</span>
                  <strong>{lastDeposit.userName || user?.name}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>REFERENCIA:</span>
                  <strong>{lastDeposit.reference || "N/A"}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>ESTADO:</span>
                  <strong style={{ color: lastDeposit.status === "CANCELLED" ? "#b91c1c" : "inherit" }}>
                    {lastDeposit.status === "CANCELLED" ? "CANCELADO" : (lastDeposit.status || "PENDING")}
                  </strong>
                </div>
                {lastDeposit.status === "CANCELLED" && lastDeposit.cancelledAt && (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", color: "#b91c1c" }}>
                      <span>CANCELADO EL:</span>
                      <strong>{new Date(lastDeposit.cancelledAt).toLocaleString()}</strong>
                    </div>
                    {lastDeposit.cancelReason && (
                      <div style={{ borderTop: "1px dashed #fca5a5", paddingTop: "4px", marginTop: "2px", color: "#b91c1c" }}>
                        <span>MOTIVO CANCELACIÓN:</span>
                        <p style={{ margin: "2px 0 0 0", fontSize: "10px", fontStyle: "italic" }}>
                          {lastDeposit.cancelReason}
                        </p>
                      </div>
                    )}
                  </>
                )}
                {lastDeposit.comments && (
                  <div style={{ borderTop: "1px dashed #cbd5e1", paddingTop: "6px", marginTop: "4px" }}>
                    <span>REF/COMENTARIOS:</span>
                    <p style={{ margin: "2px 0 0 0", fontSize: "10px", fontStyle: "italic", color: "#475569" }}>
                      {lastDeposit.comments}
                    </p>
                  </div>
                )}
              </div>

              <div style={{ marginTop: "14px", paddingTop: "8px", borderTop: "2px solid #0f172a", display: "flex", justifyContent: "space-between", fontSize: "14px" }}>
                <strong>TOTAL RETIRADO:</strong>
                <strong>${Number(lastDeposit.amount).toFixed(2)} MXN</strong>
              </div>

              <div style={{ textAlign: "center", marginTop: "20px", fontSize: "9px", color: "#64748b", borderTop: "1px dashed #cbd5e1", paddingTop: "8px" }}>
                <span>*** COMPROBANTE DE MOVIMIENTO INTERNO ***</span>
              </div>
            </div>

            <div style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
              <button 
                onClick={() => {
                  const printContents = document.getElementById("deposit-thermal-receipt")?.innerHTML;
                  if (printContents) {
                    const printWindow = window.open("", "_blank");
                    if (printWindow) {
                      printWindow.document.write(`
                        <html>
                          <head>
                            <title>Comprobante de Retiro #${lastDeposit.id}</title>
                            <style>
                              body { font-family: monospace; padding: 20px; width: 300px; margin: 0 auto; }
                              table { width: 100%; border-collapse: collapse; }
                              th, td { text-align: left; padding: 4px; }
                              .dashed { border-top: 1px dashed #000; margin: 10px 0; }
                              .total { font-weight: bold; font-size: 14px; border-top: 2px solid #000; padding-top: 5px; }
                              .center { text-align: center; }
                            </style>
                          </head>
                          <body>
                            ${printContents}
                            <script>window.print(); window.close();</script>
                          </body>
                        </html>
                      `);
                      printWindow.document.close();
                    }
                  }
                }} 
                style={{ ...styles.modalBtn, backgroundColor: "#1e3a8a", color: "white" }}
              >
                IMPRIMIR
              </button>
              <button onClick={handleCloseModal_bankDeposit} style={{ ...styles.modalBtn, backgroundColor: "#059669", color: "white" }}>
                CERRAR
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: COMPROBANTE DE CIERRE DE CAJA / Z-CUT */}
      {activeModal === "close-receipt" && lastClosedStats && (
        <div style={styles.modalOverlay}>
          <div style={styles.ticketModal}>
            <h3 style={styles.modalTitle}>Cierre de Turno</h3>
            <p style={{ fontSize: "11px", color: "#64748b", margin: "4px 0 16px 0", textAlign: "center" }}>
              Corte Z generado exitosamente.
            </p>

            <div style={styles.ticketContainer} id="close-thermal-receipt">
              <div style={{ textAlign: "center", borderBottom: "1px dashed #cbd5e1", paddingBottom: "10px", marginBottom: "10px" }}>
                <strong style={{ fontSize: "14px" }}>LYFRGL POS</strong>
                <p style={{ fontSize: "11px", margin: "2px 0 0 0" }}>{lastClosedStats.session?.branch?.name || user?.branch?.name}</p>
                <p style={{ fontSize: "12px", fontWeight: "700", margin: "4px 0 0 0" }}>*** CORTE Z (CIERRE DE CAJA) ***</p>
                <p style={{ fontSize: "9px", margin: "2px 0 0 0", color: "#64748b" }}>
                  Fecha Cierre: {lastClosedStats.session?.closedAt ? new Date(lastClosedStats.session.closedAt).toLocaleString() : new Date().toLocaleString()}
                </p>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "11px" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>CAJERO:</span>
                  <strong>{lastClosedStats.session?.user?.name || user?.name}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>SUCURSAL:</span>
                  <strong>{lastClosedStats.session?.branch?.name || user?.branch?.name}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>ID SESIÓN:</span>
                  <strong>#{lastClosedStats.session?.id}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>HORA APERTURA:</span>
                  <strong>{lastClosedStats.session?.openedAt ? new Date(lastClosedStats.session.openedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "—"}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>HORA CIERRE:</span>
                  <strong>{lastClosedStats.session?.closedAt ? new Date(lastClosedStats.session.closedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "—"}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>ESTADO:</span>
                  <strong>{lastClosedStats.session?.status}</strong>
                </div>
                
                <div className="dashed" style={{ borderTop: "1px dashed #cbd5e1", margin: "6px 0" }} />
                
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>FONDO INICIAL:</span>
                  <strong>${Number(lastClosedStats.initialAmount || 0).toFixed(2)}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>VENTAS EFECTIVO (+):</span>
                  <strong>${Number(lastClosedStats.cashTotal || 0).toFixed(2)}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>RETIROS CAJA (-):</span>
                  <strong style={{ color: "#dc2626" }}>-${Number(lastClosedStats.cashOut || 0).toFixed(2)}</strong>
                </div>
                
                <div className="dashed" style={{ borderTop: "1px dashed #cbd5e1", margin: "6px 0" }} />
                
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>EFECTIVO ESPERADO:</span>
                  <strong>${Number(lastClosedStats.expectedAmount || 0).toFixed(2)}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>EFECTIVO DECLARADO:</span>
                  <strong>${Number(lastClosedStats.declaredAmount || 0).toFixed(2)}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>DIFERENCIA:</span>
                  <strong style={{ color: (lastClosedStats.difference || 0) < 0 ? "#dc2626" : "#059669" }}>
                    ${Number(lastClosedStats.difference || 0).toFixed(2)}
                  </strong>
                </div>

                <div className="dashed" style={{ borderTop: "1px dashed #cbd5e1", margin: "6px 0" }} />

                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>VENTAS TARJETA DEB:</span>
                  <strong>${Number(lastClosedStats.debitCardTotal || 0).toFixed(2)}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>VENTAS TARJETA CRE:</span>
                  <strong>${Number(lastClosedStats.creditCardTotal || 0).toFixed(2)}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>TOTAL DE DEVOLUCIONES:</span>
                  <strong>${Number(lastClosedStats.totalRefunds || 0).toFixed(2)}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>TRANS. COMPLETADAS:</span>
                  <strong>{lastClosedStats.salesCount}</strong>
                </div>
              </div>

              <div style={{ textAlign: "center", marginTop: "20px", fontSize: "9px", color: "#64748b", borderTop: "1px dashed #cbd5e1", paddingTop: "8px" }}>
                <span>*** GRACIAS POR SU JORNADA ***</span>
              </div>
            </div>

            <div style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
              <button 
                onClick={() => {
                  const printContents = document.getElementById("close-thermal-receipt")?.innerHTML;
                  if (printContents) {
                    const printWindow = window.open("", "_blank");
                    if (printWindow) {
                      printWindow.document.write(`
                        <html>
                          <head>
                            <title>Corte Z - Sesión #${lastClosedStats.session?.id}</title>
                            <style>
                              body { font-family: monospace; padding: 20px; width: 300px; margin: 0 auto; }
                              table { width: 100%; border-collapse: collapse; }
                              th, td { text-align: left; padding: 4px; }
                              .dashed { border-top: 1px dashed #000; margin: 10px 0; }
                              .total { font-weight: bold; font-size: 14px; border-top: 2px solid #000; padding-top: 5px; }
                              .center { text-align: center; }
                            </style>
                          </head>
                          <body>
                            ${printContents}
                            <script>window.print(); window.close();<\/script>
                          </body>
                        </html>
                      `);
                      printWindow.document.close();
                    }
                  }
                }} 
                style={{ ...styles.modalBtn, backgroundColor: "#1e3a8a", color: "white" }}
              >
                IMPRIMIR
              </button>
              <button onClick={handleCloseModal_closeCash} style={{ ...styles.modalBtn, backgroundColor: "#059669", color: "white" }}>
                SALIR
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REIMPRIMIR TICKET MODAL */}
      {activeModal === "ticket-history" && (
        <div style={styles.modalOverlay}>
          <div style={styles.historyModal}>
            <h3 style={styles.modalTitle}>Reimprimir Ticket de Venta:</h3>
            <p style={{ fontSize: "12px", color: "#64748b", marginBottom: "14px" }}>Seleccione la venta de la sucursal para reimprimir su comprobante.</p>
            
            <div style={{ ...styles.inputGroup, marginBottom: "12px" }}>
              <input
                type="text"
                className="input-corporate"
                placeholder="Buscar por folio de venta (V-XXXXXX)..."
                value={ticketSearch}
                onChange={(e) => setTicketSearch(e.target.value)}
              />
            </div>

            <div style={{ maxHeight: "240px", overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: "6px" }}>
              <table style={styles.table}>
                <thead>
                  <tr style={styles.tableHeaderRow}>
                    <th style={styles.th}>Folio</th>
                    <th style={styles.th}>Total</th>
                    <th style={styles.th}>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSales.map((sale) => (
                    <tr key={sale.id} style={styles.tableRow}>
                      <td style={{ ...styles.td, fontWeight: "600" }}>{sale.invoiceNumber}</td>
                      <td style={styles.td}>${sale.totalAmount.toFixed(2)}</td>
                      <td style={styles.td}>
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
                          className="btn-primary"
                          style={{ padding: "6px 10px", fontSize: "12px" }}
                        >
                          Reimprimir
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button onClick={handleCloseModal_ticketHistory} style={{ ...styles.submitBtn, backgroundColor: "#64748b", marginTop: "14px", width: "100%" }}>
              Cerrar
            </button>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRMACIÓN DE BORRADOR DE VENTA */}
      {showDraftConfirm && (
        <div style={styles.modalOverlay}>
          <div style={{ ...styles.cancelModal, width: "400px" }}>
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
      {renderToast()}
    </div>
  );
};

// Estilos premium que calcan la estética y estructura de todas las maquetas (1 a 8)
const styles = {
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
    gridTemplateColumns: "repeat(6, 1fr)",
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
    width: "420px",
    backgroundColor: "#ffffff",
    borderRadius: "12px",
    padding: "24px",
    boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)",
  },
  ticketModal: {
    width: "360px",
    backgroundColor: "#ffffff",
    borderRadius: "12px",
    padding: "24px",
    boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)",
  },
  ticketContainer: {
    padding: "16px",
    border: "1px solid #e2e8f0",
    borderRadius: "8px",
    backgroundColor: "#fffdf9", // Color de papel
    fontFamily: "monospace",
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
