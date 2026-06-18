import { useState, useEffect } from "react";
import api, { LONG_OPERATION_TIMEOUT } from "../../services/api";
import {
  collectRoundedDecimalMessages,
  type DecimalFieldValue,
  roundToTwoDecimals,
  validateDecimalField,
} from "../../utils/decimalInput";

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

type CartEntry = { product: Product; quantity: number };

const getProductId = (product: Product | Record<string, any> | null | undefined): number => {
  const runtimeProduct = product as Record<string, any> | null | undefined;
  return Number(runtimeProduct?.id ?? runtimeProduct?.productId);
};

const getCheckoutErrorMessage = (err: any, fallback: string): string => {
  if (err?.code === "ECONNABORTED" || /timeout/i.test(err?.message || "")) {
    return "La operación tardó más de lo esperado y no se recibió respuesta del servidor. " +
      "IMPORTANTE: la venta pudo haberse registrado. Verifique en el Historial de Tickets antes de volver a cobrar para evitar un cobro duplicado.";
  }
  if (!err?.response && err?.request) {
    return "No hay conexión con el servidor. Verifique su conexión a internet e intente de nuevo.";
  }
  const data = err?.response?.data;
  const message = typeof data?.message === "string" ? data.message : "";
  const detail = typeof data?.error === "string" && data.error !== message ? data.error : "";
  return [message, detail].filter(Boolean).join(" Detalle: ") || err?.message || fallback;
};

interface UsePosCartProps {
  user: any;
  selectedCustomer: any;
  onToast: (msg: string, type?: "error" | "success" | "info") => void;
  onSetSelectedSale: (sale: any) => void;
  onSetSelectedCustomer: (customer: any) => void;
  onSetActiveModal: (modal: string | null) => void;
  onCancelSale: () => void;
}

export function usePosCart({
  user,
  selectedCustomer,
  onToast,
  onSetSelectedSale,
  onSetSelectedCustomer,
  onSetActiveModal,
  onCancelSale,
}: UsePosCartProps) {
  const DRAFT_KEY = user?.id ? `pos_sale_draft_${user.id}` : "pos_sale_draft";

  const loadDraft = (): CartEntry[] => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const validItems = parsed
            .map((item: any) => {
              const product = item?.product;
              const productId = getProductId(product);
              const quantity = Math.floor(Number(item?.quantity));
              if (!Number.isInteger(productId) || productId <= 0 || !Number.isInteger(quantity) || quantity <= 0) {
                return null;
              }
              return { product: { ...product, id: productId }, quantity };
            })
            .filter((item): item is CartEntry => item !== null);

          if (validItems.length !== parsed.length) {
            localStorage.removeItem(DRAFT_KEY);
          }

          return validItems;
        }
      }
    } catch { /* ignore */ }
    return [];
  };

  const [cart, setCart] = useState<CartEntry[]>(loadDraft);
  const [showDraftConfirm, setShowDraftConfirm] = useState(false);
  const [cartQtyDraft, setCartQtyDraft] = useState<Record<number, string>>({});

  const [pendingCartAction, setPendingCartAction] = useState<{
    type: "update" | "remove" | "cancel";
    prodId?: number;
    change?: number;
  } | null>(null);
  const [cartPin, setCartPin] = useState("");
  const [cartPinError, setCartPinError] = useState("");
  const [cartPinLoading, setCartPinLoading] = useState(false);

  const [simulationData, setSimulationData] = useState<any>(null);
  const [, setLoadingSimulation] = useState(false);

  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkoutFieldErrors, setCheckoutFieldErrors] = useState<
    Partial<Record<"cashReceived" | "mixtoCard" | "mixtoCash", string>>
  >({});

  const [paymentMethod, setPaymentMethod] = useState<"EFECTIVO" | "TARJETA" | "MIXTO" | "QR_MERCADOPAGO">("EFECTIVO");
  const [cashReceived, setCashReceived] = useState("");
  const [mixtoCash, setMixtoCash] = useState("");
  const [mixtoCard, setMixtoCard] = useState("");
  const [cardType, setCardType] = useState<"CREDITO" | "DEBITO">("DEBITO");

  const [pointsToRedeem, setPointsToRedeem] = useState<number>(0);
  const [usePoints, setUsePoints] = useState<boolean>(false);
  const [invoiceRequested, setInvoiceRequested] = useState<boolean>(false);

  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [qrUrl, setQrUrl] = useState("");
  const [qrReference, setQrReference] = useState("");
  const [qrChecking, setQrChecking] = useState(false);
  const [qrExpiresAt] = useState("");

  // Valores calculados del carrito desde simulación
  const cartSubtotalOriginal: number = simulationData?.subtotal ?? 0;
  const cartDiscount: number = simulationData?.totalDiscount ?? 0;
  const cartSubtotal: number = cartSubtotalOriginal - cartDiscount;
  const cartTax: number = simulationData?.totalTax ?? 0;
  const cartTotal: number = simulationData?.total ?? 0;
  const taxBreakdown: Record<string, number> = simulationData?.taxBreakdown ?? {};

  const pointsDiscount = (usePoints && selectedCustomer) ? Math.min(selectedCustomer.points, pointsToRedeem) : 0;
  const netTotalToPay = Math.max(0, cartTotal - pointsDiscount);

  const parsedReceived = roundToTwoDecimals(Number(cashReceived) || 0);
  const parsedMixtoCash = roundToTwoDecimals(Number(mixtoCash) || 0);
  const parsedMixtoCard = roundToTwoDecimals(Number(mixtoCard) || 0);
  const calculatedChange = paymentMethod === "EFECTIVO"
    ? (parsedReceived >= netTotalToPay ? parsedReceived - netTotalToPay : 0)
    : paymentMethod === "MIXTO"
    ? (parsedMixtoCard <= netTotalToPay && parsedMixtoCash >= (netTotalToPay - parsedMixtoCard) ? parsedMixtoCash - (netTotalToPay - parsedMixtoCard) : 0)
    : 0;

  const clearCartAndDraft = () => {
    setCart([]);
    localStorage.removeItem(DRAFT_KEY);
  };

  const loadSaleSimulation = async () => {
    if (cart.length === 0) {
      setSimulationData(null);
      return;
    }
    try {
      setLoadingSimulation(true);
      const { data } = await api.post("/api/sales/simulate", {
        items: cart.map(item => ({
          productId: item.product.id,
          quantity: item.quantity
        }))
      });
      setSimulationData(data);
    } catch (err) {
      console.error("Error simulating sale:", err);
    } finally {
      setLoadingSimulation(false);
    }
  };

  // Simular venta cuando cambia el carrito
  useEffect(() => {
    loadSaleSimulation();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart]);

  // Persistir borrador de venta en localStorage cada vez que cambie el carrito
  useEffect(() => {
    if (!user?.id) return;
    if (cart.length > 0) {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(cart));
    } else {
      localStorage.removeItem(DRAFT_KEY);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, user?.id]);

  // Sincronizar borrador cuando cambie el usuario autenticado
  useEffect(() => {
    if (user?.id) {
      setCart(loadDraft());
    } else {
      setCart([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const addProductToCart = (prod: Product) => {
    if (prod.stock <= 0) {
      onToast("No hay existencias de este producto en la sucursal.");
      return;
    }
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === prod.id);
      if (existing) {
        if (existing.quantity >= prod.stock) {
          onToast(`Límite alcanzado. Solo hay ${prod.stock} piezas disponibles.`);
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
      setCartPin("");
      setCartPinError("");
      setPendingCartAction({ type: "update", prodId, change });
      onSetActiveModal("cart-pin-auth");
      return;
    }

    setCart((prev) =>
      prev
        .map((item) => {
          if (item.product.id === prodId) {
            const nextQty = item.quantity + change;
            if (nextQty > item.product.stock) {
              onToast(`Solo hay ${item.product.stock} piezas en stock.`);
              return item;
            }
            return nextQty > 0 ? { ...item, quantity: nextQty } : null;
          }
          return item;
        })
        .filter((item): item is { product: Product; quantity: number } => item !== null)
    );
  };

  const applyCartQty = (prodId: number, targetQty: number) => {
    const item = cart.find((i) => i.product.id === prodId);
    if (!item) return;

    const qty = Math.min(Math.max(1, Math.floor(targetQty)), item.product.stock);
    const currentQty = item.quantity;
    if (qty === currentQty) return;

    if (qty < currentQty) {
      setCartPin("");
      setCartPinError("");
      setPendingCartAction({ type: "update", prodId, change: qty - currentQty });
      onSetActiveModal("cart-pin-auth");
      return;
    }

    setCart((prev) =>
      prev.map((i) => (i.product.id === prodId ? { ...i, quantity: qty } : i))
    );
  };

  const removeCartItem = (prodId: number) => {
    setCartPin("");
    setCartPinError("");
    setPendingCartAction({ type: "remove", prodId });
    onSetActiveModal("cart-pin-auth");
  };

  const handleCancelCurrentPurchase = () => {
    if (cart.length === 0) {
      onCancelSale();
      return;
    }
    setCartPin("");
    setCartPinError("");
    setPendingCartAction({ type: "cancel" });
    onSetActiveModal("cart-pin-auth");
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
      onCancelSale();
    }
    setPendingCartAction(null);
    onSetActiveModal(null);
  };

  const handleCartPinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cartPin) {
      setCartPinError("Ingrese la contraseña o clave de autorización.");
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

  const buildCheckoutItemsPayload = () => {
    if (cart.length === 0) {
      throw new Error("El carrito de ventas no puede estar vacío.");
    }

    return cart.map((item, index) => {
      const productId = getProductId(item.product);
      const quantity = Math.floor(Number(item.quantity));

      if (!Number.isInteger(productId) || productId <= 0) {
        throw new Error(`El producto en la posición ${index + 1} no tiene un identificador válido.`);
      }

      if (!Number.isInteger(quantity) || quantity <= 0) {
        throw new Error(`La cantidad de ${item.product.name || `producto #${productId}`} debe ser mayor a cero.`);
      }

      return {
        id: productId,
        productId,
        name: item.product.name,
        quantity,
      };
    });
  };

  const handleCheckoutSubmit = async () => {
    if (checkoutLoading) return;
    setCheckoutError(null);
    setCheckoutFieldErrors({});

    let itemsPayload: ReturnType<typeof buildCheckoutItemsPayload>;
    try {
      itemsPayload = buildCheckoutItemsPayload();
    } catch (err: any) {
      setCheckoutError(err.message || "El carrito no tiene datos válidos para cobrar.");
      return;
    }

    let cashPayment = 0;
    let cardPayment: number | undefined;
    const paymentRoundedValues: DecimalFieldValue[] = [];

    if (paymentMethod === "EFECTIVO") {
      const cashValidation = validateDecimalField(cashReceived, "El monto recibido", {
        invalidMessage: "El monto recibido debe ser un numero valido con maximo 3 decimales.",
      });
      if (!cashValidation.ok) {
        setCheckoutFieldErrors((prev) => ({ ...prev, cashReceived: cashValidation.error }));
        return;
      }
      cashPayment = cashValidation.value.value;
      paymentRoundedValues.push(cashValidation.value);
    }

    if (paymentMethod === "MIXTO") {
      const cardValidation = validateDecimalField(mixtoCard, "El monto con tarjeta", {
        min: 0,
        minExclusive: true,
        invalidMessage: "El monto con tarjeta debe ser un numero valido con maximo 3 decimales.",
        minMessage: "El monto con tarjeta debe ser mayor a 0.",
      });
      if (!cardValidation.ok) {
        setCheckoutFieldErrors((prev) => ({ ...prev, mixtoCard: cardValidation.error }));
        return;
      }

      const cashValidation = validateDecimalField(mixtoCash, "El monto con efectivo", {
        min: 0,
        minExclusive: true,
        invalidMessage: "El monto con efectivo debe ser un numero valido con maximo 3 decimales.",
        minMessage: "El monto con efectivo debe ser mayor a 0.",
      });
      if (!cashValidation.ok) {
        setCheckoutFieldErrors((prev) => ({ ...prev, mixtoCash: cashValidation.error }));
        return;
      }

      cardPayment = cardValidation.value.value;
      cashPayment = cashValidation.value.value;
      paymentRoundedValues.push(cardValidation.value, cashValidation.value);

      if (cardPayment > netTotalToPay) {
        setCheckoutFieldErrors((prev) => ({ ...prev, mixtoCard: "El monto pagado con tarjeta no puede ser mayor al total de la compra." }));
        return;
      }
      if (cashPayment + cardPayment < netTotalToPay) {
        setCheckoutFieldErrors((prev) => ({ ...prev, mixtoCash: "La suma de efectivo y tarjeta es menor al total a pagar." }));
        return;
      }
    }

    const paymentRoundingMessages = collectRoundedDecimalMessages(paymentRoundedValues);

    if (paymentMethod === "EFECTIVO" && cashPayment < netTotalToPay) {
      setCheckoutFieldErrors((prev) => ({ ...prev, cashReceived: "El efectivo recibido es menor al total a pagar." }));
      return;
    }

    if (paymentMethod === "QR_MERCADOPAGO") {
      setCheckoutLoading(true);
      try {
        const res = await api.post("/api/sales", {
          items: itemsPayload,
          paymentMethod: "QR_MERCADOPAGO",
          cashReceived: 0,
          changeGiven: 0,
          discountAmount: cartDiscount,
          customerId: selectedCustomer ? selectedCustomer.id : undefined,
          pointsRedeemed: (usePoints && selectedCustomer) ? pointsToRedeem : undefined,
          invoiceRequested: selectedCustomer ? invoiceRequested : false,
        }, { timeout: LONG_OPERATION_TIMEOUT });

        const saleInvoice = res.data.invoiceNumber;

        const qrRes = await api.post("/api/mercadopago/qr-preference", {
          title: "Venta " + saleInvoice,
          totalAmount: cartTotal,
          externalReference: saleInvoice
        });

        onSetSelectedSale({
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
        alert(getCheckoutErrorMessage(err, "Error al procesar pago QR"));
      } finally {
        setCheckoutLoading(false);
      }
      return;
    }

    setCheckoutLoading(true);
    try {
      if (paymentRoundingMessages.length > 0) {
        onToast(paymentRoundingMessages.join("\n"), "info");
      }

      const res = await api.post("/api/sales", {
        items: itemsPayload,
        paymentMethod,
        cardType: (paymentMethod === "TARJETA" || paymentMethod === "MIXTO") ? cardType : undefined,
        cashReceived: paymentMethod === "EFECTIVO" ? cashPayment : paymentMethod === "MIXTO" ? cashPayment : 0,
        cardAmount: paymentMethod === "MIXTO" ? cardPayment : undefined,
        changeGiven: calculatedChange,
        discountAmount: cartDiscount,
        customerId: selectedCustomer ? selectedCustomer.id : undefined,
        pointsRedeemed: (usePoints && selectedCustomer) ? pointsToRedeem : undefined,
        invoiceRequested: selectedCustomer ? invoiceRequested : false,
      }, { timeout: LONG_OPERATION_TIMEOUT });

      try {
        const saleDetailRes = await api.get(`/api/sales/detail?id=${res.data.saleId}`);
        onSetSelectedSale({
          ...saleDetailRes.data.sale,
          isNewSale: true
        });
      } catch (detailErr) {
        console.error("Error al recuperar el detalle de la venta:", detailErr);
        onSetSelectedSale({
          invoiceNumber: res.data.invoiceNumber,
          items: [...cart],
          subtotal: cartSubtotal,
          discountAmount: cartDiscount,
          subtotalOriginal: cartSubtotalOriginal,
          tax: cartTax,
          total: cartTotal,
          paymentMethod,
          cardType: (paymentMethod === "TARJETA" || paymentMethod === "MIXTO") ? cardType : undefined,
          cashReceived: paymentMethod === "EFECTIVO" ? cashPayment : paymentMethod === "MIXTO" ? cashPayment : 0,
          changeGiven: calculatedChange,
          createdAt: new Date().toISOString(),
          isNewSale: true,
          status: "COMPLETADA",
          pointsEarned: res.data.pointsEarned || 0,
          pointsRedeemed: res.data.pointsRedeemed || 0,
          pointsDiscount: res.data.pointsDiscount || 0,
          customerPoints: res.data.customerPoints || 0,
          customerName: res.data.customerName || null,
          customerEmail: selectedCustomer?.email || null,
        });
      }

      setCart([]);
      localStorage.removeItem(DRAFT_KEY);
      onSetSelectedCustomer(null);
      setUsePoints(false);
      setPointsToRedeem(0);
      setInvoiceRequested(false);
      setCheckoutModalOpen(false);
      setPaymentMethod("EFECTIVO");
      setCashReceived("");
      setMixtoCash("");
      setMixtoCard("");
      onSetActiveModal("ticket-view");
    } catch (err: any) {
      setCheckoutError(getCheckoutErrorMessage(err, "Error al completar el cobro."));
    } finally {
      setCheckoutLoading(false);
    }
  };

  const isQrExpired = (sale: any) => {
    if (!sale || !sale.qrExpiresAt) return false;
    return new Date(sale.qrExpiresAt).getTime() < Date.now();
  };

  const checkQrStatus = async () => {
    if (qrExpiresAt && new Date(qrExpiresAt).getTime() < Date.now()) {
      onToast("El código QR ha expirado. Por favor, cancela e intenta de nuevo o guarda la venta en pagos pendientes.");
      return;
    }
    setQrChecking(true);
    setQrChecking(true);
    try {
      const res = await api.get(`/api/mercadopago/status/${qrReference}`);
      if (res.data.status === "approved") {
        await api.post("/api/sales/confirm-qr", {
          invoiceNumber: qrReference,
          paymentId: res.data.paymentId || `mock-${Date.now()}`
        }, { timeout: LONG_OPERATION_TIMEOUT });
        alert("Pago aprobado exitosamente.");
        setQrModalOpen(false);
        setCart([]);
        setPaymentMethod("EFECTIVO");

        try {
          const saleDetailRes = await api.get(`/api/sales/detail?invoiceNumber=${qrReference}`);
          onSetSelectedSale({
            ...saleDetailRes.data.sale,
            isNewSale: true
          });
        } catch (detailErr) {
          console.error("Error al recuperar el detalle de la venta MP:", detailErr);
        }

        onSetActiveModal("ticket-view");
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

  return {
    // Carrito
    cart,
    setCart,
    showDraftConfirm,
    setShowDraftConfirm,
    cartQtyDraft,
    setCartQtyDraft,
    DRAFT_KEY,
    // PIN autorización
    pendingCartAction,
    setPendingCartAction,
    cartPin,
    setCartPin,
    cartPinError,
    setCartPinError,
    cartPinLoading,
    // Simulación
    simulationData,
    setSimulationData,
    // Checkout modal
    checkoutModalOpen,
    setCheckoutModalOpen,
    checkoutLoading,
    checkoutError,
    setCheckoutError,
    checkoutFieldErrors,
    setCheckoutFieldErrors,
    // Pago
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
    // Puntos y factura
    pointsToRedeem,
    setPointsToRedeem,
    usePoints,
    setUsePoints,
    invoiceRequested,
    setInvoiceRequested,
    // QR
    qrModalOpen,
    setQrModalOpen,
    qrUrl,
    setQrUrl,
    qrReference,
    setQrReference,
    qrChecking,
    // Valores calculados
    cartSubtotalOriginal,
    cartDiscount,
    cartSubtotal,
    cartTax,
    cartTotal,
    taxBreakdown,
    pointsDiscount,
    netTotalToPay,
    parsedReceived,
    parsedMixtoCash,
    parsedMixtoCard,
    calculatedChange,
    // Funciones
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
  };
}
