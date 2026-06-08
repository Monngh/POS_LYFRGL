import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import api from "../services/api";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Truck,
  ClipboardList,
  Users,
  Wallet,
  Landmark,
  UserCog,
  Building2,
  BarChart3,
  Menu,
  ArrowLeft,
  LogOut,
  RefreshCw,
  Store,
  BadgePercent,
  Tags,
  RotateCcw,
  type LucideIcon,
} from "lucide-react";

import DashboardView from "./admin/DashboardView";
import VentasView from "./admin/VentasView";
import InventarioView from "./admin/InventarioView";
import ClientesView from "./admin/ClientesView";
import CajasView from "./admin/CajasView";
import EmpleadosView from "./admin/EmpleadosView";
import SucursalesView from "./admin/SucursalesView";
import ReportesView from "./admin/ReportesView";
import KardexView from "./admin/KardexView";
import ComprasView from "./admin/ComprasView";
import DepositosView from "./admin/DepositosView";
import ProveedoresView from "./admin/ProveedoresView";
import ImpuestosView from "./admin/ImpuestosView";
import PromocionesView from "./admin/PromocionesView";
import DevolucionesView from "./admin/DevolucionesView";
import type { ViewProps } from "./admin/shared";

interface BranchOption {
  id: number;
  name: string;
}

const NAV_ITEMS: { key: string; label: string; icon: LucideIcon; view: React.FC<ViewProps>; branchScoped: boolean }[] = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard, view: DashboardView, branchScoped: true },
  { key: "ventas", label: "Ventas", icon: ShoppingCart, view: VentasView, branchScoped: true },
  { key: "devoluciones", label: "Devoluciones", icon: RotateCcw, view: DevolucionesView, branchScoped: true },
  { key: "inventario", label: "Inventario", icon: Package, view: InventarioView, branchScoped: true },
  { key: "compras", label: "Compras", icon: Truck, view: ComprasView, branchScoped: false },
  { key: "kardex", label: "Kardex", icon: ClipboardList, view: KardexView, branchScoped: true },
  { key: "clientes", label: "Clientes", icon: Users, view: ClientesView, branchScoped: false },
  { key: "cajas", label: "Cajas", icon: Wallet, view: CajasView, branchScoped: true },
  { key: "depositos", label: "Depósitos", icon: Landmark, view: DepositosView, branchScoped: true },
  { key: "empleados", label: "Empleados", icon: UserCog, view: EmpleadosView, branchScoped: true },
  { key: "sucursales", label: "Sucursales", icon: Building2, view: SucursalesView, branchScoped: false },
  { key: "proveedores", label: "Proveedores", icon: Building2, view: ProveedoresView, branchScoped: false },
  { key: "impuestos", label: "Impuestos", icon: BadgePercent, view: ImpuestosView, branchScoped: false },
  { key: "promociones", label: "Promociones", icon: Tags, view: PromocionesView, branchScoped: false },
  { key: "reportes", label: "Reportes", icon: BarChart3, view: ReportesView, branchScoped: true },
];

const NAV_SECTIONS: { label: string; items: string[] }[] = [
  { label: "Inicio", items: ["dashboard"] },
  { label: "Operación", items: ["ventas", "devoluciones", "compras"] },
  { label: "Caja y finanzas", items: ["cajas", "depositos"] },
  { label: "Inventario", items: ["inventario"] },
  { label: "Catálogos", items: ["clientes", "empleados", "sucursales", "proveedores", "impuestos", "promociones"] },
  { label: "Reportes", items: ["reportes"] },
];

const AdminDashboard: React.FC = () => {
  const { user, logout } = useAuth();

  const [collapsed, setCollapsed] = useState(false);
  const [activeNav, setActiveNav] = useState<string>("dashboard");
  const [branchId, setBranchId] = useState<string>("all");
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [refreshToken, setRefreshToken] = useState(0);
  const [navHistory, setNavHistory] = useState<string[]>([]);

  // Navega a una pestaña guardando la actual en el historial
  const navigateTo = (key: string) => {
    if (key === activeNav) return;
    setNavHistory((h) => [...h, activeNav]);
    setActiveNav(key);
  };

  // Regresa a la pestaña anterior
  const goBack = () => {
    if (navHistory.length === 0) return;
    const prev = navHistory[navHistory.length - 1];
    setNavHistory((h) => h.slice(0, -1));
    setActiveNav(prev);
  };

  // Cargar el catálogo de sucursales para el filtro global (una sola vez)
  useEffect(() => {
    api
      .get<{ branches: BranchOption[] }>("/api/auth/branches")
      .then((res) => setBranches(res.data.branches))
      .catch(() => setBranches([]));
  }, []);

  const active = NAV_ITEMS.find((n) => n.key === activeNav) ?? NAV_ITEMS[0];
  const ActiveView = active.view;

  return (
    <div style={styles.shell}>
      {/* ===================== SIDEBAR RETRÁCTIL ===================== */}
      <aside style={{ ...styles.sidebar, width: collapsed ? 72 : 248 }}>
        <div style={styles.brandRow}>
          <div style={styles.brandLogo}>
            <Store size={20} color="#ffffff" />
          </div>
          {!collapsed && <span style={styles.brandText}>LYFRGL POS</span>}
        </div>

        <nav style={styles.nav} className="admin-sidebar-nav">
          {NAV_SECTIONS.map((section) => (
            <React.Fragment key={section.label}>
              {!collapsed && (
                <span style={styles.navSectionLabel}>{section.label}</span>
              )}
              {section.items.map((key) => {
                const item = NAV_ITEMS.find((n) => n.key === key)!;
                const Icon = item.icon;
                const isActive = activeNav === item.key;
                return (
                  <button
                    key={item.key}
                    onClick={() => navigateTo(item.key)}
                    title={item.label}
                    className="active-tap"
                    style={{
                      ...styles.navItem,
                      justifyContent: collapsed ? "center" : "flex-start",
                      backgroundColor: isActive ? "#3b82f6" : "transparent",
                      color: isActive ? "#ffffff" : "#bfdbfe",
                      fontWeight: isActive ? 700 : 500,
                    }}
                  >
                    <Icon size={19} />
                    {!collapsed && <span>{item.label}</span>}
                  </button>
                );
              })}
            </React.Fragment>
          ))}
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
            <button
              onClick={goBack}
              disabled={navHistory.length === 0}
              title="Regresar a la pestaña anterior"
              className="active-tap"
              style={{
                ...styles.iconBtn,
                opacity: navHistory.length === 0 ? 0.4 : 1,
                cursor: navHistory.length === 0 ? "default" : "pointer",
              }}
            >
              <ArrowLeft size={18} color="#1e3a8a" />
            </button>
            <span style={styles.appLabel}>Panel Administrativo Central</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                ...styles.selectWrap,
                opacity: active.branchScoped ? 1 : 0.45,
                pointerEvents: active.branchScoped ? "auto" : "none",
              }}
              title={active.branchScoped ? "Filtrar por sucursal" : "Esta sección no se filtra por sucursal"}
            >
              <Store size={15} color="#64748b" />
              <select value={branchId} onChange={(e) => setBranchId(e.target.value)} style={styles.select}>
                <option value="all">Todas las sucursales</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={() => setRefreshToken((t) => t + 1)}
              title="Actualizar"
              className="active-tap"
              style={styles.iconBtn}
            >
              <RefreshCw size={16} color="#1e3a8a" />
            </button>
            <button onClick={logout} className="active-tap" style={styles.logoutBtn}>
              <LogOut size={15} /> Salir
            </button>
          </div>
        </header>

        <div style={styles.content}>
          <ActiveView branchId={branchId} refreshToken={refreshToken} />
        </div>
      </div>
    </div>
  );
};

const styles: { [k: string]: React.CSSProperties } = {
  shell: { display: "flex", minHeight: "100vh", backgroundColor: "#f1f5f9" },

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
  brandText: { color: "#ffffff", fontWeight: 800, fontSize: 16, letterSpacing: "-0.3px", whiteSpace: "nowrap" },
  nav: { display: "flex", flexDirection: "column", gap: 4, padding: "16px 12px", flex: 1, minHeight: 0, overflowY: "auto" },
  navSectionLabel: {
    fontSize: 10,
    fontWeight: 700,
    color: "#93c5fd",
    textTransform: "uppercase" as const,
    letterSpacing: "0.8px",
    padding: "10px 12px 4px",
    display: "block",
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
  sidebarFooter: { padding: "14px 12px", borderTop: "1px solid rgba(255,255,255,0.12)" },
  userMini: { display: "flex", alignItems: "center", gap: 10, padding: "4px 4px" },
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
  userRole: { color: "#93c5fd", fontSize: 11, fontWeight: 600 },

  main: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0 },
  topbar: {
    height: 64,
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
  appLabel: { fontSize: 15, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.3px" },
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
  content: { padding: 24, overflowY: "auto" },
};

export default AdminDashboard;
