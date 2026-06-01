import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { 
  LogOut, 
  Store, 
  TrendingUp, 
  Package, 
  Users, 
  Layers, 
  AlertTriangle, 
  Plus, 
  Minus, 
  Trash2, 
  BadgePercent,
  CircleCheck
} from "lucide-react";

// Mock de productos iniciales para interactuar en la terminal
const MOCK_PRODUCTS = [
  { id: 1, sku: "PROD-001", barcode: "7501001100223", name: "Coca Cola Original 600ml", price: 18.00, category: "Bebidas" },
  { id: 2, sku: "PROD-002", barcode: "7501031302833", name: "Papas Sabritas Sal 50g", price: 17.00, category: "Botanas" },
  { id: 3, sku: "PROD-003", barcode: "7501000122238", name: "Pan Blanco Bimbo Grande", price: 45.00, category: "Panadería" },
  { id: 4, sku: "PROD-004", barcode: "7501055303496", name: "Galletas Chokis 90g", price: 21.00, category: "Galletas" },
];

const Dashboard: React.FC = () => {
  const { user, logout } = useAuth();
  
  // Estado para la Terminal de Ventas (Cajero)
  const [cart, setCart] = useState<{ id: number; name: string; price: number; quantity: number }[]>([]);
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  // Agregar al carrito
  const addToCart = (product: typeof MOCK_PRODUCTS[0]) => {
    setPaymentSuccess(false);
    setCart((prevCart) => {
      const existing = prevCart.find((item) => item.id === product.id);
      if (existing) {
        return prevCart.map((item) =>
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prevCart, { id: product.id, name: product.name, price: product.price, quantity: 1 }];
    });
  };

  // Restar del carrito
  const updateQuantity = (id: number, amount: number) => {
    setCart((prevCart) =>
      prevCart
        .map((item) => {
          if (item.id === id) {
            const nextQty = item.quantity + amount;
            return nextQty > 0 ? { ...item, quantity: nextQty } : null;
          }
          return item;
        })
        .filter((item): item is typeof cart[0] => item !== null)
    );
  };

  // Eliminar del carrito
  const removeFromCart = (id: number) => {
    setCart((prevCart) => prevCart.filter((item) => item.id !== id));
  };

  // Calcular Totales
  const subtotal = cart.reduce((acc, item) => acc + item.price * item.quantity, 0);
  const tax = subtotal * 0.16; // 16% IVA
  const total = subtotal + tax;

  const handleCheckout = () => {
    setCart([]);
    setPaymentSuccess(true);
    setTimeout(() => setPaymentSuccess(false), 4000);
  };

  if (!user) return null;

  return (
    <div style={styles.appContainer}>
      {/* Barra de Navegación Superior */}
      <header style={styles.navbar}>
        <div style={styles.navBrand}>
          <Store size={22} color="#ffffff" />
          <span style={styles.brandText}>POS FMB Solutions</span>
          <span style={styles.branchBadge}>{user.branch.name}</span>
        </div>

        <div style={styles.navUser}>
          <div style={styles.userInfo}>
            <div style={styles.userRoleBadge}>{user.role}</div>
            <span style={styles.userName}>{user.name}</span>
          </div>
          <button onClick={logout} style={styles.logoutBtn} className="active-tap">
            <LogOut size={16} />
            Salir
          </button>
        </div>
      </header>

      {/* Contenido Principal */}
      <main style={styles.mainContent}>
        {user.role === "ADMIN" ? (
          /* ========================================================================= */
          /* MÓDULO ADMINISTRADOR: Consola de control e inventario */
          /* ========================================================================= */
          <div style={styles.adminContainer}>
            <div style={styles.sectionHeader}>
              <h2 style={styles.sectionTitle}>Dashboard de Administración</h2>
              <p style={styles.sectionSubtitle}>Métricas clave e inventario general de la empresa</p>
            </div>

            {/* Fila de Tarjetas Analíticas */}
            <div style={styles.metricRow}>
              <div style={styles.metricCard}>
                <div style={{ ...styles.metricIconContainer, backgroundColor: "#e0f2fe" }}>
                  <TrendingUp size={22} color="#0284c7" />
                </div>
                <div>
                  <p style={styles.metricLabel}>Ventas del Día</p>
                  <h3 style={styles.metricValue}>$42,850.00</h3>
                  <span style={styles.metricTrend}>+12.4% vs ayer</span>
                </div>
              </div>

              <div style={styles.metricCard}>
                <div style={{ ...styles.metricIconContainer, backgroundColor: "#ecfdf5" }}>
                  <Package size={22} color="#059669" />
                </div>
                <div>
                  <p style={styles.metricLabel}>Productos Activos</p>
                  <h3 style={styles.metricValue}>1,248</h3>
                  <span style={styles.metricTrend}>12 agregados hoy</span>
                </div>
              </div>

              <div style={styles.metricCard}>
                <div style={{ ...styles.metricIconContainer, backgroundColor: "#fff7ed" }}>
                  <Users size={22} color="#ea580c" />
                </div>
                <div>
                  <p style={styles.metricLabel}>Clientes Registrados</p>
                  <h3 style={styles.metricValue}>352</h3>
                  <span style={styles.metricTrend}>+4 este mes</span>
                </div>
              </div>

              <div style={styles.metricCard}>
                <div style={{ ...styles.metricIconContainer, backgroundColor: "#fee2e2" }}>
                  <AlertTriangle size={22} color="#dc2626" />
                </div>
                <div>
                  <p style={styles.metricLabel}>Alertas de Stock</p>
                  <h3 style={styles.metricValue}>7</h3>
                  <span style={{ ...styles.metricTrend, color: "#dc2626" }}>Acción requerida</span>
                </div>
              </div>
            </div>

            {/* Listado / Grid de Productos e Inventarios */}
            <div className="card-premium" style={styles.adminTableCard}>
              <div style={styles.tableHeader}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <Layers size={18} color="#1e3a8a" />
                  <h3 style={styles.cardTitle}>Control de Inventario de Productos</h3>
                </div>
                <button className="btn-primary" style={{ padding: "8px 12px", fontSize: "13px" }}>
                  <Plus size={16} />
                  Nuevo Producto
                </button>
              </div>

              <table style={styles.table}>
                <thead>
                  <tr style={styles.tableHeaderRow}>
                    <th style={styles.th}>SKU</th>
                    <th style={styles.th}>Producto</th>
                    <th style={styles.th}>Categoría</th>
                    <th style={styles.th}>Costo</th>
                    <th style={styles.th}>P. Venta</th>
                    <th style={styles.th}>Existencias</th>
                    <th style={styles.th}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {MOCK_PRODUCTS.map((prod) => (
                    <tr key={prod.id} style={styles.tableRow}>
                      <td style={{ ...styles.td, fontWeight: "600" }}>{prod.sku}</td>
                      <td style={styles.td}>{prod.name}</td>
                      <td style={styles.td}>{prod.category}</td>
                      <td style={styles.td}>${(prod.price * 0.7).toFixed(2)}</td>
                      <td style={{ ...styles.td, fontWeight: "600" }}>${prod.price.toFixed(2)}</td>
                      <td style={styles.td}>45 piezas</td>
                      <td style={styles.td}>
                        <span style={styles.badgeSuccess}>Activo</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* ========================================================================= */
          /* MÓDULO CAJERO: Terminal de Ventas (High-Speed UI) */
          /* ========================================================================= */
          <div className="pos-grid" style={{ margin: "-20px" }}>
            
            {/* Panel Izquierdo: Catálogo y Carrito */}
            <div style={styles.posLeft}>
              <div style={styles.sectionHeader}>
                <h2 style={styles.sectionTitle}>Terminal de Venta Rápida</h2>
                <p style={styles.sectionSubtitle}>Selecciona productos o escanea código de barras</p>
              </div>

              {/* Grid de Productos */}
              <div style={styles.posProductGrid}>
                {MOCK_PRODUCTS.map((prod) => (
                  <button
                    key={prod.id}
                    style={styles.productCard}
                    onClick={() => addToCart(prod)}
                    className="active-tap"
                  >
                    <div style={styles.productBadge}>{prod.category}</div>
                    <h4 style={styles.productName}>{prod.name}</h4>
                    <p style={styles.productSku}>{prod.sku}</p>
                    <div style={styles.productPrice}>${prod.price.toFixed(2)}</div>
                  </button>
                ))}
              </div>

              {/* Simulación de escanear por código de barras */}
              <div style={styles.scannerSimulator}>
                <span style={{ fontSize: "13px", fontWeight: "600", color: "#475569" }}>
                  Simulador de lector de barras:
                </span>
                <button
                  onClick={() => addToCart(MOCK_PRODUCTS[0])}
                  style={styles.simBtn}
                  className="active-tap"
                >
                  🔋 Escanear Coca Cola
                </button>
                <button
                  onClick={() => addToCart(MOCK_PRODUCTS[2])}
                  style={styles.simBtn}
                  className="active-tap"
                >
                  🍞 Escanear Pan Bimbo
                </button>
              </div>
            </div>

            {/* Panel Derecho: Cuenta / Carrito y Cobro */}
            <div style={styles.posRight}>
              <div style={styles.cartHeader}>
                <h3 style={styles.cartTitle}>Carrito de Ventas ({cart.reduce((sum, i) => sum + i.quantity, 0)})</h3>
                {cart.length > 0 && (
                  <button onClick={() => setCart([])} style={styles.clearCartBtn} className="active-tap">
                    Vaciar
                  </button>
                )}
              </div>

              {/* Listado de items en el carrito */}
              <div style={styles.cartList}>
                {cart.length === 0 ? (
                  <div style={styles.emptyCart}>
                    {paymentSuccess ? (
                      <div style={styles.successBlock}>
                        <CircleCheck size={48} color="#059669" />
                        <h4 style={{ color: "#059669", marginTop: "12px" }}>¡Cobro Exitoso!</h4>
                        <p style={{ fontSize: "12px", color: "#64748b", textAlign: "center", marginTop: "4px" }}>
                          Ticket impreso localmente. El inventario ha sido actualizado en la base de datos SQL Server.
                        </p>
                      </div>
                    ) : (
                      <>
                        <Package size={36} color="#94a3b8" />
                        <p style={{ marginTop: "10px", color: "#64748b", fontSize: "14px" }}>
                          El carrito de compras está vacío.
                        </p>
                      </>
                    )}
                  </div>
                ) : (
                  cart.map((item) => (
                    <div key={item.id} style={styles.cartItem}>
                      <div style={styles.cartItemInfo}>
                        <span style={styles.cartItemName}>{item.name}</span>
                        <span style={styles.cartItemPrice}>${item.price.toFixed(2)} c/u</span>
                      </div>
                      
                      {/* Controles de cantidad */}
                      <div style={styles.cartItemActions}>
                        <div style={styles.qtyContainer}>
                          <button
                            onClick={() => updateQuantity(item.id, -1)}
                            style={styles.qtyBtn}
                            className="active-tap"
                          >
                            <Minus size={12} />
                          </button>
                          <span style={styles.qtyText}>{item.quantity}</span>
                          <button
                            onClick={() => updateQuantity(item.id, 1)}
                            style={styles.qtyBtn}
                            className="active-tap"
                          >
                            <Plus size={12} />
                          </button>
                        </div>
                        <button
                          onClick={() => removeFromCart(item.id)}
                          style={styles.deleteItemBtn}
                          className="active-tap"
                        >
                          <Trash2 size={14} color="#dc2626" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Totales y Botón de Cobro */}
              <div style={styles.cartFooter}>
                <div style={styles.summaryRow}>
                  <span>Subtotal</span>
                  <span>${subtotal.toFixed(2)}</span>
                </div>
                <div style={styles.summaryRow}>
                  <span>IVA (16%)</span>
                  <span>${tax.toFixed(2)}</span>
                </div>
                <div style={{ ...styles.summaryRow, ...styles.summaryTotal }}>
                  <span>Total</span>
                  <span>${total.toFixed(2)}</span>
                </div>

                <button
                  onClick={handleCheckout}
                  disabled={cart.length === 0}
                  style={styles.checkoutBtn}
                  className="btn-success active-tap"
                >
                  <BadgePercent size={20} />
                  Pagar e Imprimir Ticket
                </button>
              </div>
            </div>

          </div>
        )}
      </main>
    </div>
  );
};

// Estilos dinámicos y limpios para mantener cohesión visual ERP corporativa
const styles: { [key: string]: React.CSSProperties } = {
  appContainer: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    backgroundColor: "#f8fafc",
  },
  navbar: {
    height: "64px",
    backgroundColor: "#0f172a", // Dark Slate Navy
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
    fontWeight: "700",
    fontSize: "16px",
    letterSpacing: "-0.3px",
  },
  branchBadge: {
    backgroundColor: "#1e3a8a",
    color: "#93c5fd",
    fontSize: "11px",
    fontWeight: "600",
    padding: "2px 8px",
    borderRadius: "4px",
    marginLeft: "8px",
  },
  navUser: {
    display: "flex",
    alignItems: "center",
    gap: "16px",
  },
  userInfo: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginRight: "8px",
  },
  userRoleBadge: {
    backgroundColor: "#334155",
    color: "#e2e8f0",
    fontSize: "10px",
    fontWeight: "700",
    padding: "2px 6px",
    borderRadius: "4px",
    textTransform: "uppercase",
  },
  userName: {
    color: "#f1f5f9",
    fontSize: "14px",
    fontWeight: "500",
  },
  logoutBtn: {
    backgroundColor: "transparent",
    border: "1px solid #334155",
    color: "#94a3b8",
    padding: "6px 12px",
    borderRadius: "4px",
    fontSize: "13px",
    fontWeight: "500",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    transition: "all 0.15s ease",
  },
  mainContent: {
    flex: 1,
    padding: "24px",
  },
  adminContainer: {
    display: "flex",
    flexDirection: "column",
    gap: "24px",
  },
  sectionHeader: {
    marginBottom: "8px",
  },
  sectionTitle: {
    fontSize: "22px",
    fontWeight: "700",
    color: "#0f172a",
    letterSpacing: "-0.5px",
  },
  sectionSubtitle: {
    fontSize: "13px",
    color: "#64748b",
  },
  metricRow: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: "20px",
  },
  metricCard: {
    backgroundColor: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: "10px",
    padding: "20px",
    display: "flex",
    alignItems: "center",
    gap: "16px",
    boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
  },
  metricIconContainer: {
    width: "48px",
    height: "48px",
    borderRadius: "8px",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
  },
  metricLabel: {
    fontSize: "12px",
    fontWeight: "600",
    color: "#64748b",
    textTransform: "uppercase",
  },
  metricValue: {
    fontSize: "20px",
    fontWeight: "700",
    color: "#0f172a",
    margin: "2px 0",
  },
  metricTrend: {
    fontSize: "11px",
    fontWeight: "500",
    color: "#059669",
  },
  adminTableCard: {
    padding: "24px",
  },
  tableHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "16px",
  },
  cardTitle: {
    fontSize: "16px",
    fontWeight: "700",
    color: "#0f172a",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    textAlign: "left",
  },
  tableHeaderRow: {
    borderBottom: "2px solid #f1f5f9",
  },
  th: {
    padding: "12px 16px",
    fontSize: "12px",
    fontWeight: "700",
    color: "#475569",
    textTransform: "uppercase",
  },
  tableRow: {
    borderBottom: "1px solid #f1f5f9",
    transition: "background-color 0.15s ease",
  },
  td: {
    padding: "14px 16px",
    fontSize: "14px",
    color: "#334155",
  },
  badgeSuccess: {
    backgroundColor: "#dcfce7",
    color: "#166534",
    fontSize: "11px",
    fontWeight: "600",
    padding: "2px 8px",
    borderRadius: "4px",
  },
  posLeft: {
    padding: "24px",
    display: "flex",
    flexDirection: "column",
    gap: "20px",
    overflowY: "auto",
  },
  posProductGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: "16px",
  },
  productCard: {
    backgroundColor: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: "10px",
    padding: "20px",
    textAlign: "left",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    position: "relative",
    boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
    transition: "all 0.15s ease",
  },
  productBadge: {
    position: "absolute",
    top: "14px",
    right: "14px",
    backgroundColor: "#f1f5f9",
    color: "#475569",
    fontSize: "10px",
    fontWeight: "600",
    padding: "2px 6px",
    borderRadius: "4px",
  },
  productName: {
    fontSize: "14px",
    fontWeight: "700",
    color: "#0f172a",
    marginTop: "8px",
    marginRight: "60px",
  },
  productSku: {
    fontSize: "11px",
    color: "#64748b",
    marginTop: "2px",
  },
  productPrice: {
    fontSize: "16px",
    fontWeight: "800",
    color: "#0d9488", // Teal Accent
    marginTop: "12px",
  },
  scannerSimulator: {
    marginTop: "16px",
    backgroundColor: "#e2e8f0",
    padding: "16px",
    borderRadius: "8px",
    display: "flex",
    alignItems: "center",
    gap: "12px",
    border: "1px solid #cbd5e1",
  },
  simBtn: {
    backgroundColor: "#ffffff",
    border: "1px solid #cbd5e1",
    borderRadius: "4px",
    padding: "8px 12px",
    fontSize: "12px",
    fontWeight: "600",
    color: "#334155",
    cursor: "pointer",
  },
  posRight: {
    backgroundColor: "#ffffff",
    borderLeft: "1px solid #e2e8f0",
    display: "flex",
    flexDirection: "column",
    height: "100%",
  },
  cartHeader: {
    padding: "20px 24px",
    borderBottom: "1px solid #e2e8f0",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cartTitle: {
    fontSize: "15px",
    fontWeight: "700",
    color: "#0f172a",
  },
  clearCartBtn: {
    backgroundColor: "transparent",
    border: "none",
    color: "#dc2626",
    fontSize: "13px",
    fontWeight: "600",
    cursor: "pointer",
  },
  cartList: {
    flex: 1,
    padding: "20px 24px",
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "14px",
  },
  emptyCart: {
    height: "100%",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
  },
  successBlock: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "20px",
  },
  cartItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: "14px",
    borderBottom: "1px solid #f1f5f9",
  },
  cartItemInfo: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  },
  cartItemName: {
    fontSize: "14px",
    fontWeight: "600",
    color: "#0f172a",
  },
  cartItemPrice: {
    fontSize: "12px",
    color: "#64748b",
  },
  cartItemActions: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  qtyContainer: {
    display: "flex",
    alignItems: "center",
    border: "1px solid #cbd5e1",
    borderRadius: "4px",
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
    padding: "0 10px",
    fontSize: "13px",
    fontWeight: "600",
    color: "#0f172a",
  },
  deleteItemBtn: {
    background: "none",
    border: "none",
    cursor: "pointer",
  },
  cartFooter: {
    padding: "20px 24px",
    borderTop: "1px solid #e2e8f0",
    backgroundColor: "#f8fafc",
  },
  summaryRow: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: "13px",
    color: "#475569",
    marginBottom: "8px",
  },
  summaryTotal: {
    borderTop: "1px solid #cbd5e1",
    paddingTop: "12px",
    fontSize: "18px",
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: "16px",
  },
  checkoutBtn: {
    width: "100%",
    padding: "14px",
    fontSize: "15px",
  },
};

export default Dashboard;
