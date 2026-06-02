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
  AlertTriangle
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
}

interface Sale {
  id: number;
  invoiceNumber: string;
  createdAt: string;
  totalAmount: number;
  paymentMethod: string;
  status: string;
  cajero: string;
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
  const [recentSales, setRecentSales] = useState<Sale[]>([]);
  const [recentDeposits, setRecentDeposits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modales de Acción Rápida: null | "price-lookup" | "ticket-history" | "cancel-sale" | "close-cash" | "bank-deposit"
  const [activeModal, setActiveModal] = useState<string | null>(null);

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
      alert("Por favor ingrese un monto inicial válido.");
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
      alert(err.response?.data?.message || "Error al abrir la caja registradora.");
    } finally {
      setOpeningLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // 3. CONSULTAR PRECIO / LOOKUP (Mockup 6)
  // ---------------------------------------------------------------------------
  const [lookupQuery, setLookupQuery] = useState("");
  const [lookupResults, setLookupResults] = useState<Product[]>([]);

  const handleLookupSearch = async () => {
    try {
      const res = await api.get(`/api/products/search?query=${lookupQuery}`);
      setLookupResults(res.data.products);
    } catch (err) {
      console.error("Error al buscar productos:", err);
    }
  };

  // Trigger search on typing
  useEffect(() => {
    if (activeModal === "price-lookup") {
      const delayDebounce = setTimeout(() => {
        handleLookupSearch();
      }, 300);
      return () => clearTimeout(delayDebounce);
    }
  }, [lookupQuery, activeModal]);

  // ---------------------------------------------------------------------------
  // 4. TERMINAL DE VENTAS (Mockup 5)
  // ---------------------------------------------------------------------------
  const [cart, setCart] = useState<{ product: Product; quantity: number }[]>([]);
  const [barcodeSearch, setBarcodeSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [selectedSale, setSelectedSale] = useState<any>(null); // Guardar venta tras cobro para ticket

  // Estados para autorización de PIN en modificaciones de carrito (Fase 3.0)
  const [pendingCartAction, setPendingCartAction] = useState<{
    type: "update" | "remove";
    prodId: number;
    change?: number;
  } | null>(null);
  const [cartPin, setCartPin] = useState("");
  const [cartPinError, setCartPinError] = useState("");
  const [cartPinLoading, setCartPinLoading] = useState(false);

  const handleProductBarcodeSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcodeSearch.trim()) return;
    try {
      const res = await api.get(`/api/products/search?query=${barcodeSearch}`);
      const list: Product[] = res.data.products;
      if (list.length === 1) {
        // Añadir directamente
        addProductToCart(list[0]);
        setBarcodeSearch("");
        setSearchResults([]);
      } else {
        setSearchResults(list);
      }
    } catch (err) {
      console.error("Error al buscar producto:", err);
    }
  };

  const addProductToCart = (prod: Product) => {
    if (prod.stock <= 0) {
      alert("No hay existencias de este producto en la sucursal.");
      return;
    }
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === prod.id);
      if (existing) {
        if (existing.quantity >= prod.stock) {
          alert(`Límite alcanzado. Solo hay ${prod.stock} piezas disponibles.`);
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
              alert(`Solo hay ${item.product.stock} piezas en stock.`);
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

    if (type === "update" && change !== undefined) {
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
    } else if (type === "remove") {
      setCart((prev) => prev.filter((item) => item.product.id !== prodId));
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

  const cartSubtotal = cart.reduce((sum, item) => sum + item.product.sellPrice * item.quantity, 0);
  const cartTax = cartSubtotal * 0.16; // 16% IVA
  const cartTotal = cartSubtotal + cartTax;

  // ---------------------------------------------------------------------------
  // 5. MODAL COBRO (Mockup 4)
  // ---------------------------------------------------------------------------
  const [paymentMethod, setPaymentMethod] = useState<"EFECTIVO" | "TARJETA" | "MIXTO">("EFECTIVO");
  const [cashReceived, setCashReceived] = useState("");
  // Campos para pago mixto
  const [mixtoCash, setMixtoCash] = useState("");
  const [mixtoCard, setMixtoCard] = useState("");
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  // Cambio reactivo
  const parsedReceived = Number(cashReceived) || 0;
  const calculatedChange = paymentMethod === "EFECTIVO" 
    ? (parsedReceived >= cartTotal ? parsedReceived - cartTotal : 0)
    : paymentMethod === "MIXTO"
    ? (Number(mixtoCash) >= (cartTotal - Number(mixtoCard)) ? Number(mixtoCash) - (cartTotal - Number(mixtoCard)) : 0)
    : 0;

  const handleCheckoutSubmit = async () => {
    if (paymentMethod === "EFECTIVO" && parsedReceived < cartTotal) {
      alert("El efectivo recibido es menor al total a pagar.");
      return;
    }
    if (paymentMethod === "MIXTO") {
      const mCash = Number(mixtoCash) || 0;
      const mCard = Number(mixtoCard) || 0;
      if (mCash + mCard < cartTotal) {
        alert("La suma de efectivo y tarjeta es menor al total a pagar.");
        return;
      }
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
        cashReceived: paymentMethod === "EFECTIVO" ? parsedReceived : paymentMethod === "MIXTO" ? Number(mixtoCash) : 0,
        changeGiven: calculatedChange,
        discountAmount: 0,
      });

      // Guardar info para imprimir ticket
      setSelectedSale({
        invoiceNumber: res.data.invoiceNumber,
        items: [...cart],
        subtotal: cartSubtotal,
        tax: cartTax,
        total: cartTotal,
        paymentMethod,
        cashReceived: paymentMethod === "EFECTIVO" ? parsedReceived : paymentMethod === "MIXTO" ? Number(mixtoCash) : 0,
        changeGiven: calculatedChange,
        createdAt: new Date().toISOString(),
      });

      // Limpiar carrito y cerrar cobro
      setCart([]);
      setCheckoutModalOpen(false);
      setPaymentMethod("EFECTIVO");
      setCashReceived("");
      setMixtoCash("");
      setMixtoCard("");
      setActiveModal("ticket-view"); // Mostrar el ticket inmediatamente
    } catch (err: any) {
      alert(err.response?.data?.message || "Error al completar el cobro.");
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

  // ---------------------------------------------------------------------------
  // 7. SOLICITUD DE CANCELACIÓN (Mockup 1)
  // ---------------------------------------------------------------------------
  const [cancelInvoice, setCancelInvoice] = useState("");
  const [cancelPin, setCancelPin] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [cancelLoading, setCancelLoading] = useState(false);

  const handleCancelSaleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancelInvoice || !cancelPin || !cancelReason) {
      alert("Por favor complete todos los campos.");
      return;
    }
    setCancelLoading(true);
    try {
      const res = await api.post("/api/sales/authorize-cancel", {
        invoiceNumber: cancelInvoice,
        pinCode: cancelPin,
        reason: cancelReason,
      });
      alert(res.data.message);
      setActiveModal(null);
      setCancelInvoice("");
      setCancelPin("");
      setCancelReason("");
      await loadDashboardData();
    } catch (err: any) {
      alert(err.response?.data?.message || "Error de autorización o folio inválido.");
    } finally {
      setCancelLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // 8. CIERRE DE CAJA (Mockup 2)
  // ---------------------------------------------------------------------------
  const [declaredCash, setDeclaredCash] = useState("");
  const [closingLoading, setClosingLoading] = useState(false);

  const calculatedDifference = sessionStats
    ? (Number(declaredCash) || 0) - sessionStats.expectedAmount
    : 0;

  const handleCloseShift = async () => {
    if (!declaredCash || isNaN(Number(declaredCash))) {
      alert("Por favor ingrese el efectivo contado en la caja.");
      return;
    }
    setClosingLoading(true);
    try {
      await api.post("/api/cash-session/close", {
        declaredAmount: Number(declaredCash)
      });
      alert("Turno cerrado con éxito. Generando reporte de arqueo...");
      setSession(null);
      setView("apertura");
      setActiveModal(null);
      setDeclaredCash("");
    } catch (err: any) {
      alert(err.response?.data?.message || "Error al cerrar turno.");
    } finally {
      setClosingLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // 9. DEPOSITOS BANCARIOS (Simulación)
  // ---------------------------------------------------------------------------
  const [depAccount, setDepAccount] = useState("");
  const [depName, setDepName] = useState("");
  const [depAmount, setDepAmount] = useState("");
  const [depType, setDepType] = useState("EFECTIVO");
  const [depComments, setDepComments] = useState("");
  const [depLoading, setDepLoading] = useState(false);
  const [lastDeposit, setLastDeposit] = useState<any>(null); // Para comprobante (Fase 3.0)

  const handleDepositSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (depAccount.length !== 16 || isNaN(Number(depAccount))) {
      alert("El número de cuenta debe tener exactamente 16 dígitos.");
      return;
    }
    if (!depName || !depAmount || isNaN(Number(depAmount))) {
      alert("Por favor complete los campos obligatorios.");
      return;
    }

    setDepLoading(true);
    try {
      const res = await api.post("/api/sales/bank-deposit", {
        accountNumber: depAccount,
        targetName: depName,
        amount: Number(depAmount),
        paymentType: depType,
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
      alert(err.response?.data?.message || "Error al procesar el depósito.");
    } finally {
      setDepLoading(false);
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
            <span style={styles.brandText}>POS FMB Solutions</span>
          </div>
          <button onClick={logout} style={styles.logoutBtn} className="active-tap">
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
              Venta - Ticket #{session?.id || 1}
            </h2>
          </div>
          <div style={{ fontSize: "14px", fontWeight: "600", color: "#475569" }}>
            Cajero: <span style={{ color: "#1e3a8a" }}>{user?.name.split(" ")[0]}</span>
          </div>
        </header>

        {/* Cuerpo Venta */}
        <div style={styles.terminalBody}>
          {/* Búsqueda de Productos */}
          <div className="card-premium" style={styles.terminalSearchArea}>
            <form onSubmit={handleProductBarcodeSearch} style={{ display: "flex", gap: "10px" }}>
              <div style={{ flex: 1, position: "relative" }}>
                <Search size={18} color="#94a3b8" style={{ position: "absolute", left: "12px", top: "12px" }} />
                <input
                  type="text"
                  className="input-corporate"
                  style={{ paddingLeft: "38px" }}
                  placeholder="Ingrese código o nombre del producto y presione Enter..."
                  value={barcodeSearch}
                  onChange={(e) => setBarcodeSearch(e.target.value)}
                />
              </div>
              <button type="submit" className="btn-primary">
                Buscar
              </button>
            </form>

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
                  {cart.map((item) => (
                    <tr key={item.product.id} style={styles.tableRow}>
                      <td style={styles.td}>{item.product.sku}</td>
                      <td style={{ ...styles.td, fontWeight: "600" }}>{item.product.name}</td>
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
                      <td style={styles.td}>${item.product.sellPrice.toFixed(2)}</td>
                      <td style={{ ...styles.td, fontWeight: "700" }}>
                        ${(item.product.sellPrice * item.quantity).toFixed(2)}
                      </td>
                      <td style={styles.td}>
                        <button onClick={() => removeCartItem(item.product.id)} style={{ border: "none", background: "none", cursor: "pointer" }}>
                          <XCircle size={18} color="#dc2626" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totales y Controles Cobro */}
            <div style={styles.terminalSummary}>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", width: "240px", marginLeft: "auto" }}>
                <div style={styles.summaryRow}>
                  <span>Subtotal:</span>
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
                    setCart([]);
                    setView("dashboard");
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
                $ {cartTotal.toFixed(2)}
              </div>

              {/* Selector Métodos Pago */}
              <div style={styles.payMethodsRow}>
                <button
                  onClick={() => setPaymentMethod("EFECTIVO")}
                  style={{ ...styles.payMethodBtn, ...(paymentMethod === "EFECTIVO" ? styles.payMethodActive : {}) }}
                >
                  💵 EFECTIVO
                </button>
                <button
                  onClick={() => setPaymentMethod("TARJETA")}
                  style={{ ...styles.payMethodBtn, ...(paymentMethod === "TARJETA" ? styles.payMethodActive : {}) }}
                >
                  💳 TARJETA
                </button>
                <button
                  onClick={() => setPaymentMethod("MIXTO")}
                  style={{ ...styles.payMethodBtn, ...(paymentMethod === "MIXTO" ? styles.payMethodActive : {}) }}
                >
                  ⚖️ MIXTO
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
                      onChange={(e) => setCashReceived(e.target.value)}
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
                <div style={{ padding: "20px 0", textAlign: "center", color: "#64748b" }}>
                  <p>Solicite que inserte la tarjeta en la terminal bancaria.</p>
                  <p style={{ fontWeight: "600", color: "#1e3a8a", marginTop: "8px" }}>NIP requerido en terminal física.</p>
                </div>
              )}

              {paymentMethod === "MIXTO" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "14px" }}>
                  <div style={styles.inputGroup}>
                    <label style={styles.label}>Monto con Tarjeta ($):</label>
                    <input
                      type="text"
                      className="input-corporate"
                      value={mixtoCard}
                      onChange={(e) => setMixtoCard(e.target.value)}
                    />
                  </div>
                  <div style={styles.inputGroup}>
                    <label style={styles.label}>Monto con Efectivo ($):</label>
                    <input
                      type="text"
                      className="input-corporate"
                      value={mixtoCash}
                      onChange={(e) => setMixtoCash(e.target.value)}
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
        <button onClick={logout} style={styles.logoutBtn} className="active-tap">
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
              <button onClick={() => setView("sales-terminal")} style={styles.actionBtn} className="active-tap">
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
              <button onClick={() => setActiveModal("close-cash")} style={styles.actionBtn} className="active-tap">
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
                        <td style={styles.td}>
                          <button
                            onClick={async () => {
                              try {
                                // Recuperar detalles para reimpresión
                                await api.get(`/api/sales/recent`); // Simplificado, ya tenemos el mock de items
                                // Simular el formato de la venta seleccionada
                                setSelectedSale({
                                  invoiceNumber: sale.invoiceNumber,
                                  items: [
                                    { product: { name: "Artículos Varios", sellPrice: sale.totalAmount }, quantity: 1 }
                                  ],
                                  subtotal: sale.totalAmount / 1.16,
                                  tax: sale.totalAmount - (sale.totalAmount / 1.16),
                                  total: sale.totalAmount,
                                  paymentMethod: sale.paymentMethod,
                                  cashReceived: sale.totalAmount,
                                  changeGiven: 0,
                                  createdAt: sale.createdAt
                                });
                                setActiveModal("ticket-view");
                              } catch (e) {
                                console.error(e);
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
              <button onClick={() => setActiveModal(null)} style={{ ...styles.modalBtn, backgroundColor: "#dc2626", color: "white" }}>
                CANCELAR
              </button>
              <button onClick={() => setActiveModal(null)} style={{ ...styles.modalBtn, backgroundColor: "#059669", color: "white" }}>
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
                  onClick={() => setActiveModal(null)}
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
              <div style={{ textAlign: "center", marginBottom: "14px" }}>
                <h4 style={{ textTransform: "uppercase", fontWeight: "800" }}>FMB SOLUTIONS</h4>
                <p style={{ fontSize: "11px", color: "#475569" }}>SUCURSAL: {user?.branch.name}</p>
                <p style={{ fontSize: "10px", color: "#64748b" }}>TEL: 772 100 2000</p>
              </div>

              <div style={{ borderBottom: "1px dashed #cbd5e1", paddingBottom: "8px", marginBottom: "8px", fontSize: "11px" }}>
                <p><strong>Folio:</strong> {selectedSale.invoiceNumber}</p>
                <p><strong>Fecha:</strong> {new Date(selectedSale.createdAt).toLocaleDateString()}</p>
                <p><strong>Hora:</strong> {new Date(selectedSale.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                <p><strong>Cajero:</strong> {user?.name}</p>
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
                <p><strong>Método de pago:</strong> {selectedSale.paymentMethod}</p>
                {selectedSale.paymentMethod === "EFECTIVO" && (
                  <>
                    <p><strong>Pagó con:</strong> ${selectedSale.cashReceived.toFixed(2)}</p>
                    <p><strong>Cambio:</strong> ${selectedSale.changeGiven.toFixed(2)}</p>
                  </>
                )}
              </div>

              <div style={{ textAlign: "center", marginTop: "20px", fontSize: "10px", color: "#64748b" }}>
                <p>¡GRACIAS POR SU COMPRA!</p>
                <p>REGRESE PRONTO</p>
              </div>
            </div>

            <div style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
              <button onClick={() => setActiveModal(null)} style={{ ...styles.modalBtn, backgroundColor: "#dc2626", color: "white" }}>
                CERRAR TICKET
              </button>
              <button onClick={handlePrintTicket} style={{ ...styles.modalBtn, backgroundColor: "#059669", color: "white" }}>
                <Printer size={16} /> IMPRIMIR
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
                <button onClick={() => setActiveModal(null)} style={{ ...styles.modalBtn, backgroundColor: "#dc2626", color: "white" }}>
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

      {/* MODAL 5: DEPOSITO BANCARIO */}
      {activeModal === "bank-deposit" && (
        <div style={styles.modalOverlay}>
          <div style={styles.depositModal}>
            <h3 style={styles.modalTitle}>Registrar Depósito Bancario:</h3>
            <form onSubmit={handleDepositSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px", marginTop: "14px" }}>
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
                  placeholder="Monto"
                  value={depAmount}
                  onChange={(e) => setDepAmount(e.target.value)}
                />
              </div>

              <div style={styles.inputGroup}>
                <label style={styles.label}>Método de Retiro de Caja:</label>
                <select
                  value={depType}
                  onChange={(e) => setDepType(e.target.value)}
                  style={styles.select}
                >
                  <option value="EFECTIVO">Retirar de Efectivo en Caja</option>
                  <option value="TARJETA">Registrado Electrónicamente</option>
                </select>
              </div>

              <div style={styles.inputGroup}>
                <label style={styles.label}>Comentarios / Referencia:</label>
                <input
                  type="text"
                  className="input-corporate"
                  placeholder="Comentarios adicionales"
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
                  CANCELAR
                </button>
                <button
                  type="submit"
                  disabled={depLoading}
                  style={{ ...styles.modalBtn, backgroundColor: "#059669", color: "white" }}
                >
                  {depLoading ? "Procesando..." : "REGISTRAR DEPÓSITO"}
                </button>
              </div>
            </form>
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
                <strong style={{ fontSize: "14px" }}>FMB SOLUTIONS POS</strong>
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
                  <strong>{user?.name}</strong>
                </div>
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
              <button onClick={() => setActiveModal(null)} style={{ ...styles.modalBtn, backgroundColor: "#059669", color: "white" }}>
                CERRAR
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
                  {recentSales.map((sale) => (
                    <tr key={sale.id} style={styles.tableRow}>
                      <td style={{ ...styles.td, fontWeight: "600" }}>{sale.invoiceNumber}</td>
                      <td style={styles.td}>${sale.totalAmount.toFixed(2)}</td>
                      <td style={styles.td}>
                        <button
                          onClick={() => {
                            setSelectedSale({
                              invoiceNumber: sale.invoiceNumber,
                              items: [
                                { product: { name: "Reimpresión de Venta", sellPrice: sale.totalAmount }, quantity: 1 }
                              ],
                              subtotal: sale.totalAmount / 1.16,
                              tax: sale.totalAmount - (sale.totalAmount / 1.16),
                              total: sale.totalAmount,
                              paymentMethod: sale.paymentMethod,
                              cashReceived: sale.totalAmount,
                              changeGiven: 0,
                              createdAt: sale.createdAt
                            });
                            setActiveModal("ticket-view");
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
            <button onClick={() => setActiveModal(null)} style={{ ...styles.submitBtn, backgroundColor: "#64748b", marginTop: "14px", width: "100%" }}>
              Cerrar
            </button>
          </div>
        </div>
      )}
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
    borderColor: "#2563eb",
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
    width: "420px",
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
