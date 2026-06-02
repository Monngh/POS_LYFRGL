import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import api from "../services/api";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Users,
  Wallet,
  UserCog,
  BarChart3,
  Menu,
  LogOut,
  RefreshCw,
  Store,
  TrendingUp,
  CalendarDays,
  Coins,
  Receipt,
  Tag,
  UserPlus,
  AlertTriangle,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Tipos de la respuesta del backend (/api/dashboard/metrics)
// ---------------------------------------------------------------------------
interface DashboardMetrics {
  ventasHoy: number;
  ventasMes: number;
  utilidadMes: number;
  ticketsHoy: number;
  ticketPromedio: number;
  productosActivos: number;
  clientesNuevos: number;
  inventarioBajo: number;
}
interface DayPoint {
  label: string;
  date: string;
  total: number;
}
interface BranchSales {
  id: number;
  name: string;
  total: number;
}
interface TopProduct {
  id: number;
  name: string;
  unidades: number;
}
interface BranchOption {
  id: number;
  name: string;
}
interface DashboardResponse {
  metrics: DashboardMetrics;
  ventas7dias: DayPoint[];
  ventasPorSucursal: BranchSales[];
  productosMasVendidos: TopProduct[];
  branches: BranchOption[];
}

// Formateador de moneda (es-MX, sin decimales para los indicadores principales)
const money = (n: number) =>
  `$${Math.round(n).toLocaleString("es-MX", { maximumFractionDigits: 0 })}`;

// Elementos del menú lateral
const NAV_ITEMS = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "ventas", label: "Ventas", icon: ShoppingCart },
  { key: "inventario", label: "Inventario", icon: Package },
  { key: "clientes", label: "Clientes", icon: Users },
  { key: "cajas", label: "Cajas", icon: Wallet },
  { key: "empleados", label: "Empleados", icon: UserCog },
  { key: "reportes", label: "Reportes", icon: BarChart3 },
] as const;

const AdminDashboard: React.FC = () => {
  const { user, logout } = useAuth();

  const [collapsed, setCollapsed] = useState(false);
  const [activeNav, setActiveNav] = useState<string>("dashboard");
  const [branchId, setBranchId] = useState<string>("all");

  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // -------------------------------------------------------------------------
  // Carga de métricas desde SQL Server
  // -------------------------------------------------------------------------
  const loadMetrics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<DashboardResponse>("/api/dashboard/metrics", {
        params: branchId !== "all" ? { branchId } : {},
      });
      setData(res.data);
    } catch (err: any) {
      setError(
        err.response?.data?.message ||
          "No se pudieron cargar las métricas. Verifique la conexión con el servidor."
      );
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    loadMetrics();
  }, [loadMetrics]);

  const branches = data?.branches ?? [];

  // -------------------------------------------------------------------------
  // Tarjetas de métricas (estructura declarativa)
  // -------------------------------------------------------------------------
  const m = data?.metrics;
  const metricCards = [
    { label: "Ventas de hoy", value: m ? money(m.ventasHoy) : "—", icon: TrendingUp },
    { label: "Ventas del mes", value: m ? money(m.ventasMes) : "—", icon: CalendarDays },
    { label: "Utilidad del mes", value: m ? money(m.utilidadMes) : "—", icon: Coins },
    { label: "Tickets de hoy", value: m ? String(m.ticketsHoy) : "—", icon: Receipt },
    { label: "Ticket promedio", value: m ? money(m.ticketPromedio) : "—", icon: Tag },
    { label: "Productos activos", value: m ? String(m.productosActivos) : "—", icon: Package },
    { label: "Clientes nuevos", value: m ? String(m.clientesNuevos) : "—", icon: UserPlus },
    {
      label: "Inventario bajo",
      value: m ? `${m.inventarioBajo} ${m.inventarioBajo === 1 ? "producto" : "productos"}` : "—",
      icon: AlertTriangle,
      warning: !!m && m.inventarioBajo > 0,
    },
  ];

  const maxDay = Math.max(1, ...(data?.ventas7dias.map((d) => d.total) ?? [0]));
  const maxBranch = Math.max(1, ...(data?.ventasPorSucursal.map((b) => b.total) ?? [0]));

  return (
    <div style={styles.shell}>
      {/* ===================== SIDEBAR RETRÁCTIL ===================== */}
      <aside style={{ ...styles.sidebar, width: collapsed ? 72 : 248 }}>
        <div style={styles.brandRow}>
          <div style={styles.brandLogo}>
            <Store size={20} color="#ffffff" />
          </div>
          {!collapsed && <span style={styles.brandText}>FMB POS</span>}
        </div>

        <nav style={styles.nav}>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeNav === item.key;
            return (
              <button
                key={item.key}
                onClick={() => setActiveNav(item.key)}
                title={item.label}
                className="active-tap"
                style={{
                  ...styles.navItem,
                  justifyContent: collapsed ? "center" : "flex-start",
                  backgroundColor: active ? "#3b82f6" : "transparent",
                  color: active ? "#ffffff" : "#bfdbfe",
                  fontWeight: active ? 700 : 500,
                }}
              >
                <Icon size={19} />
                {!collapsed && <span>{item.label}</span>}
              </button>
            );
          })}
        </nav>

        <div style={styles.sidebarFooter}>
          <div style={styles.userMini}>
            <div style={styles.userAvatar}>
              <UserCog size={16} color="#1e3a8a" />
            </div>
            {!collapsed && (
              <div style={{ overflow: "hidden" }}>
                <p style={styles.userName}>{user?.name || "Administrador"}</p>
                <p style={styles.userRole}>{user?.role || "ADMIN"}</p>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* ===================== ÁREA PRINCIPAL ===================== */}
      <div style={styles.main}>
        {/* Barra superior */}
        <header style={styles.topbar}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <button
              onClick={() => setCollapsed((c) => !c)}
              title={collapsed ? "Expandir menú" : "Contraer menú"}
              className="active-tap"
              style={styles.iconBtn}
            >
              <Menu size={18} color="#1e3a8a" />
            </button>
            <div>
              <h1 style={styles.pageTitle}>Panel Administrativo Central</h1>
              <p style={styles.pageSubtitle}>Métricas empresariales en tiempo real desde SQL Server</p>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={styles.selectWrap}>
              <Store size={15} color="#64748b" />
              <select
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                style={styles.select}
              >
                <option value="all">Todas las sucursales</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <button onClick={loadMetrics} title="Actualizar" className="active-tap" style={styles.iconBtn}>
              <RefreshCw size={16} color="#1e3a8a" style={loading ? { opacity: 0.5 } : undefined} />
            </button>
            <button onClick={logout} className="active-tap" style={styles.logoutBtn}>
              <LogOut size={15} /> Salir
            </button>
          </div>
        </header>

        {/* Contenido desplazable */}
        <div style={styles.content}>
          {activeNav !== "dashboard" ? (
            <PlaceholderModule label={NAV_ITEMS.find((n) => n.key === activeNav)?.label || ""} />
          ) : error ? (
            <div style={styles.errorBox}>
              <AlertTriangle size={20} color="#b45309" />
              <span>{error}</span>
              <button onClick={loadMetrics} className="active-tap" style={styles.retryBtn}>
                Reintentar
              </button>
            </div>
          ) : (
            <>
              {/* ---- Tarjetas de métricas ---- */}
              <div style={styles.metricsGrid}>
                {metricCards.map((card) => {
                  const Icon = card.icon;
                  return (
                    <div key={card.label} style={styles.metricCard}>
                      <div style={styles.metricHead}>
                        <span style={styles.metricLabel}>{card.label}</span>
                        <div
                          style={{
                            ...styles.metricIcon,
                            backgroundColor: card.warning ? "#fef3c7" : "#eff6ff",
                          }}
                        >
                          <Icon size={16} color={card.warning ? "#d97706" : "#2563eb"} />
                        </div>
                      </div>
                      <h2
                        style={{
                          ...styles.metricValue,
                          color: card.warning ? "#b45309" : "#0f172a",
                        }}
                      >
                        {loading && !data ? "…" : card.value}
                      </h2>
                    </div>
                  );
                })}
              </div>

              {/* ---- Gráfica de ventas últimos 7 días ---- */}
              <div style={{ ...styles.panel, marginTop: 20 }}>
                <h3 style={styles.panelTitle}>Ventas de los últimos 7 días</h3>
                <div style={styles.chart}>
                  {(data?.ventas7dias ?? []).map((d, i) => {
                    const h = Math.round((d.total / maxDay) * 150);
                    return (
                      <div key={i} style={styles.chartCol}>
                        <span style={styles.chartValue}>{d.total > 0 ? money(d.total) : ""}</span>
                        <div
                          style={{
                            ...styles.bar,
                            height: `${Math.max(h, d.total > 0 ? 6 : 2)}px`,
                            backgroundColor: d.total > 0 ? "#3b82f6" : "#e2e8f0",
                          }}
                        />
                        <span style={styles.chartLabel}>{d.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ---- Comparativos inferiores ---- */}
              <div style={styles.bottomGrid}>
                {/* Ventas por sucursal */}
                <div style={styles.panel}>
                  <h3 style={styles.panelTitle}>Ventas por sucursal</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 16 }}>
                    {(data?.ventasPorSucursal ?? []).map((b) => (
                      <div key={b.id}>
                        <div style={styles.branchRow}>
                          <span style={styles.branchName}>{b.name}</span>
                          <span style={styles.branchAmount}>{money(b.total)}</span>
                        </div>
                        <div style={styles.track}>
                          <div
                            style={{
                              ...styles.trackFill,
                              width: `${(b.total / maxBranch) * 100}%`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                    {(data?.ventasPorSucursal ?? []).length === 0 && <EmptyState />}
                  </div>
                </div>

                {/* Productos más vendidos */}
                <div style={styles.panel}>
                  <h3 style={styles.panelTitle}>Productos más vendidos</h3>
                  <div style={{ marginTop: 8 }}>
                    {(data?.productosMasVendidos ?? []).map((p, i) => (
                      <div key={p.id} style={styles.productRow}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={styles.rankBadge}>{i + 1}</span>
                          <span style={styles.productName}>{p.name}</span>
                        </div>
                        <span style={styles.productUnits}>{p.unidades} u</span>
                      </div>
                    ))}
                    {(data?.productosMasVendidos ?? []).length === 0 && <EmptyState />}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// Estado vacío reutilizable
const EmptyState: React.FC = () => (
  <p style={{ fontSize: 13, color: "#94a3b8", padding: "24px 4px", textAlign: "center" }}>
    Aún no hay datos registrados para este periodo.
  </p>
);

// Módulo en construcción para las demás secciones del menú
const PlaceholderModule: React.FC<{ label: string }> = ({ label }) => (
  <div style={styles.placeholder}>
    <div style={styles.placeholderIcon}>
      <LayoutDashboard size={28} color="#3b82f6" />
    </div>
    <h3 style={{ fontSize: 18, fontWeight: 800, color: "#1e3a8a" }}>Módulo de {label}</h3>
    <p style={{ fontSize: 14, color: "#64748b", marginTop: 6, maxWidth: 420, textAlign: "center" }}>
      Esta sección está planificada para una próxima fase. El Dashboard administrativo ya está
      conectado a la base de datos SQL Server.
    </p>
  </div>
);

// ---------------------------------------------------------------------------
// Estilos (paleta corporativa azul / navy — consistente con el resto del POS)
// ---------------------------------------------------------------------------
const styles: { [k: string]: React.CSSProperties } = {
  shell: {
    display: "flex",
    minHeight: "100vh",
    backgroundColor: "#f1f5f9",
  },

  // Sidebar
  sidebar: {
    backgroundColor: "#1e3a8a",
    display: "flex",
    flexDirection: "column",
    transition: "width 0.18s ease",
    position: "sticky",
    top: 0,
    height: "100vh",
    flexShrink: 0,
  },
  brandRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "20px 18px",
    borderBottom: "1px solid rgba(255,255,255,0.12)",
  },
  brandLogo: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: "#3b82f6",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  brandText: {
    color: "#ffffff",
    fontWeight: 800,
    fontSize: 16,
    letterSpacing: "-0.3px",
    whiteSpace: "nowrap",
  },
  nav: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    padding: "16px 12px",
    flex: 1,
  },
  navItem: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "11px 12px",
    borderRadius: 8,
    border: "none",
    cursor: "pointer",
    fontSize: 14,
    whiteSpace: "nowrap",
    transition: "background-color 0.15s ease, color 0.15s ease",
  },
  sidebarFooter: {
    padding: "14px 12px",
    borderTop: "1px solid rgba(255,255,255,0.12)",
  },
  userMini: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "4px 4px",
  },
  userAvatar: {
    width: 32,
    height: 32,
    borderRadius: "50%",
    backgroundColor: "#ffffff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  userName: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: 700,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  userRole: {
    color: "#93c5fd",
    fontSize: 11,
    fontWeight: 600,
  },

  // Main
  main: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
  },
  topbar: {
    height: 70,
    backgroundColor: "#ffffff",
    borderBottom: "1px solid #e2e8f0",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 24px",
    position: "sticky",
    top: 0,
    zIndex: 10,
  },
  pageTitle: {
    fontSize: 18,
    fontWeight: 800,
    color: "#0f172a",
    letterSpacing: "-0.3px",
  },
  pageSubtitle: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 2,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 8,
    border: "1px solid #e2e8f0",
    backgroundColor: "#ffffff",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  selectWrap: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    border: "1px solid #e2e8f0",
    borderRadius: 8,
    padding: "0 12px",
    height: 38,
    backgroundColor: "#ffffff",
  },
  select: {
    border: "none",
    outline: "none",
    backgroundColor: "transparent",
    fontSize: 13,
    fontWeight: 600,
    color: "#334155",
    cursor: "pointer",
    fontFamily: "inherit",
  },
  logoutBtn: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#1e3a8a",
    color: "#ffffff",
    border: "none",
    borderRadius: 8,
    padding: "9px 16px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    height: 38,
  },
  content: {
    padding: 24,
    overflowY: "auto",
  },

  // Métricas
  metricsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: 16,
  },
  metricCard: {
    backgroundColor: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: 12,
    padding: "18px 20px",
    boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
  },
  metricHead: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  metricLabel: {
    fontSize: 13,
    fontWeight: 600,
    color: "#64748b",
  },
  metricIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  metricValue: {
    fontSize: 26,
    fontWeight: 800,
    marginTop: 12,
    letterSpacing: "-0.5px",
  },

  // Paneles
  panel: {
    backgroundColor: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: 12,
    padding: 20,
    boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
  },
  panelTitle: {
    fontSize: 15,
    fontWeight: 800,
    color: "#0f172a",
  },

  // Gráfica de barras
  chart: {
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 12,
    height: 200,
    marginTop: 18,
    paddingTop: 10,
    borderBottom: "1px solid #f1f5f9",
  },
  chartCol: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
    height: "100%",
  },
  chartValue: {
    fontSize: 10,
    fontWeight: 700,
    color: "#64748b",
    height: 12,
  },
  bar: {
    width: "60%",
    maxWidth: 46,
    borderRadius: "6px 6px 0 0",
    transition: "height 0.3s ease",
  },
  chartLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: "#94a3b8",
  },

  // Comparativos
  bottomGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 20,
    marginTop: 20,
  },
  branchRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 7,
  },
  branchName: {
    fontSize: 13,
    fontWeight: 600,
    color: "#334155",
  },
  branchAmount: {
    fontSize: 13,
    fontWeight: 800,
    color: "#1e3a8a",
  },
  track: {
    height: 9,
    backgroundColor: "#eef2f7",
    borderRadius: 999,
    overflow: "hidden",
  },
  trackFill: {
    height: "100%",
    backgroundColor: "#3b82f6",
    borderRadius: 999,
    transition: "width 0.3s ease",
  },
  productRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "11px 0",
    borderBottom: "1px solid #f1f5f9",
  },
  rankBadge: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: "#eff6ff",
    color: "#2563eb",
    fontSize: 11,
    fontWeight: 800,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  productName: {
    fontSize: 13,
    fontWeight: 600,
    color: "#334155",
  },
  productUnits: {
    fontSize: 13,
    fontWeight: 800,
    color: "#0f172a",
  },

  // Estados
  errorBox: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#fffbeb",
    border: "1px solid #fef3c7",
    borderRadius: 10,
    padding: "16px 18px",
    color: "#b45309",
    fontSize: 14,
    fontWeight: 600,
  },
  retryBtn: {
    marginLeft: "auto",
    backgroundColor: "#d97706",
    color: "#ffffff",
    border: "none",
    borderRadius: 6,
    padding: "7px 14px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
  },
  placeholder: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    padding: "80px 24px",
    backgroundColor: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: 12,
  },
  placeholderIcon: {
    width: 60,
    height: 60,
    borderRadius: 14,
    backgroundColor: "#eff6ff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
};

export default AdminDashboard;
