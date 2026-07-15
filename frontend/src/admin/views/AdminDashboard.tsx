import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "../../auth";
import api from "../../shared/services/api";
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
  DollarSign,
  Tags,
  RotateCcw,
  ShieldCheck,
  KeyRound,
  Lock,
  Sun,
  Moon,
  AlertTriangle,
  Check,
  EllipsisVertical,
  type LucideIcon,
} from "lucide-react";

import DashboardView from "./DashboardView";
import VentasView from "./VentasView";
import InventarioView from "./InventarioView";
import ClientesView from "./ClientesView";
import CajasView from "./CajasView";
import EmpleadosView from "./EmpleadosView";
import SucursalesView from "./SucursalesView";
import ReportesView from "./ReportesView";
import KardexView from "./KardexView";
import ComprasView from "./ComprasView";
import DepositosView from "./DepositosView";
import ProveedoresView from "./ProveedoresView";
import ImpuestosView from "./ImpuestosView";
import PromocionesView from "./PromocionesView";
import PriceAdjustmentsView from "./PriceAdjustmentsView";
import DevolucionesView from "./DevolucionesView";
import FacturacionGlobalView from "./FacturacionGlobalView";
import ReportAuditLogView from "./ReportAuditLogView";
import CajaAccessLogView from "./CajaAccessLogView";
import AdminAccessLogView from "./AdminAccessLogView";
import type { ViewProps } from "./shared";
import { ui } from "./shared";
import { SecurityEventsProvider } from "../context/SecurityEventsContext";
import { useAdminSessionStatus } from "../hooks/useAdminSessionStatus";

interface BranchOption {
  id: number;
  name: string;
}

// Hook de responsividad: reacciona a cambios de viewport sin recargar
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches
  );
  useEffect(() => {
    const m = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    setMatches(m.matches);
    m.addEventListener("change", handler);
    return () => m.removeEventListener("change", handler);
  }, [query]);
  return matches;
}

const NAV_ITEMS: { key: string; label: string; icon: LucideIcon; view: React.FC<ViewProps>; branchScoped: boolean; adminOnly?: boolean }[] = [
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
  { key: "ajustes-precios", label: "Ajustes de precios", icon: DollarSign, view: PriceAdjustmentsView, branchScoped: false, adminOnly: true },
  { key: "reportes", label: "Reportes", icon: BarChart3, view: ReportesView, branchScoped: true },
  { key: "facturacion-global", label: "Factura Global", icon: BadgePercent, view: FacturacionGlobalView, branchScoped: true },
  { key: "auditoria-reportes", label: "Auditoría Reportes", icon: ShieldCheck, view: ReportAuditLogView, branchScoped: false, adminOnly: true },
  { key: "caja-access", label: "Accesos de Caja", icon: KeyRound, view: CajaAccessLogView, branchScoped: true, adminOnly: true },
  { key: "admin-access", label: "Accesos Admin", icon: Lock, view: AdminAccessLogView, branchScoped: false, adminOnly: true },
];

const RESTRICTED_KEYS_GERENTE = [
  "compras",
  "sucursales",
  "proveedores",
  "impuestos",
  "promociones",
  "ajustes-precios",
  "facturacion-global",
  "auditoria-reportes",
  "caja-access",
  "admin-access",
];

// Orden por prioridad del negocio (alta → baja) para un POS retail multi-sucursal:
// 1) Inicio: panorama del negocio (primer vistazo del día).
// 2) Operación: el flujo que genera ingreso (ventas, devoluciones, compras).
// 3) Caja y finanzas: control diario del dinero / anti-fraude (cajas, depósitos, factura global).
// 4) Inventario: disponibilidad de producto, el corazón del retail.
// 5) Reportes: analítica para decisiones gerenciales (uso frecuente de dirección).
// 6) Catálogos: datos maestros / configuración (se ajustan con baja frecuencia).
// 7) Seguridad: bitácoras de auditoría (supervisión admin, frecuencia mínima).
const NAV_SECTIONS: { label: string; items: string[] }[] = [
  { label: "Inicio", items: ["dashboard"] },
  { label: "Operación", items: ["ventas", "devoluciones", "compras"] },
  { label: "Caja y finanzas", items: ["cajas", "depositos", "facturacion-global"] },
  { label: "Inventario", items: ["inventario"] },
  { label: "Reportes", items: ["reportes"] },
  { label: "Catálogos", items: ["clientes", "promociones", "ajustes-precios", "proveedores", "empleados", "sucursales", "impuestos"] },
  { label: "Seguridad", items: ["auditoria-reportes", "caja-access", "admin-access"] },
];

// Estilos de interacción/movimiento del shell, aislados a esta vista.
// Manejan hover/focus (que no son expresables con estilos en línea) y respetan
// la preferencia de "reducir movimiento" del sistema.
const ADMIN_CSS = `
.adm-nav-item{ position:relative; transition: background-color .18s ease, color .18s ease, transform .16s ease, box-shadow .18s ease; }
.adm-nav-item:hover{ background-color: rgba(255,255,255,.09); color:#ffffff; transform: translateX(3px); }
.adm-rail{ transition: opacity .22s ease, transform .22s cubic-bezier(.34,1.56,.64,1); }
.adm-icon-btn{ transition: background-color .15s ease, border-color .15s ease, transform .1s ease; }
.adm-icon-btn:hover{ background-color: var(--surface-2); border-color: var(--border-strong); }
.adm-logout{ transition: filter .15s ease, transform .1s ease, box-shadow .15s ease; }
.adm-logout:hover{ filter: brightness(1.08); box-shadow: 0 8px 18px -6px rgba(37,99,235,.6); }
.adm-logout:active{ transform: translateY(1px); }
.adm-brand-logo{ transition: transform .25s ease, box-shadow .25s ease; }
.adm-brand-row:hover .adm-brand-logo{ transform: rotate(-6deg) scale(1.05); }
.adm-spin{ animation: admSpin .6s ease; }
@keyframes admSpin{ from{transform:rotate(0)} to{transform:rotate(360deg)} }
.adm-branch-item{ transition: background-color .12s ease; }
.adm-branch-item:hover{ background-color: var(--surface-2); }
.adm-branch-menu{ animation: admMenuIn .14s ease; transform-origin: top right; }
@keyframes admMenuIn{ from{opacity:0; transform:translateY(-4px) scale(.98)} to{opacity:1; transform:none} }
@media (prefers-reduced-motion: reduce){
  .adm-nav-item, .adm-rail, .adm-icon-btn, .adm-logout, .adm-brand-logo{ transition:none !important; }
  .adm-nav-item:hover, .adm-brand-row:hover .adm-brand-logo{ transform:none !important; }
  .adm-spin, .adm-branch-menu{ animation:none !important; }
}
`;

const initialsOf = (name?: string): string => {
  const parts = (name || "Administrador").trim().split(/\s+/).filter(Boolean).slice(0, 2);
  const txt = parts.map((w) => w[0]).join("").toUpperCase();
  return txt || "A";
};

const AdminDashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const { revokedData, acknowledgeRevocation } = useAdminSessionStatus(user);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);

  useEffect(() => {
    const INACTIVITY_LIMIT = 15 * 60 * 1000; // 15 minutos
    let inactivityTimer: ReturnType<typeof setTimeout>;

    const resetTimer = () => {
      clearTimeout(inactivityTimer);
      inactivityTimer = setTimeout(() => {
        setShowInactivityModal(true);
      }, INACTIVITY_LIMIT);
    };

    const activityEvents = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    activityEvents.forEach((event) => window.addEventListener(event, resetTimer));
    resetTimer();

    return () => {
      clearTimeout(inactivityTimer);
      activityEvents.forEach((event) => window.removeEventListener(event, resetTimer));
    };
  }, []);

  // Mobile real (cajón deslizable). Tablet (769–1024px): layout de escritorio
  // pero con el rail lateral forzado a colapsado (solo íconos).
  const isMobile = useMediaQuery("(max-width: 768px)");
  const isTablet = useMediaQuery("(min-width: 769px) and (max-width: 1024px)");

  const [collapsed, setCollapsed] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showInactivityModal, setShowInactivityModal] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeNav, setActiveNav] = useState<string>("dashboard");
  const [pendingViewFilter, setPendingViewFilter] = useState<Record<string, any> | undefined>(undefined);
  const [branchId, setBranchId] = useState<string>("all");
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [refreshToken, setRefreshToken] = useState(0);
  const [navHistory, setNavHistory] = useState<string[]>([]);
  const [spinning, setSpinning] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);

  // Refrescar datos de la vista activa con feedback (giro del icono)
  const handleRefresh = () => {
    setRefreshToken((t) => t + 1);
    setSpinning(true);
    window.setTimeout(() => setSpinning(false), 600);
  };

  // Tema claro / oscuro (persistente, scopeado al panel admin)
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window === "undefined") return "light";
    return localStorage.getItem("fmb_pos_theme") === "dark" ? "dark" : "light";
  });
  useEffect(() => {
    localStorage.setItem("fmb_pos_theme", theme);
  }, [theme]);
  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  // Redirigir a dashboard si tiene un rol GERENTE e intenta entrar a una sección prohibida
  useEffect(() => {
    if (user?.role === "GERENTE" && RESTRICTED_KEYS_GERENTE.includes(activeNav)) {
      setActiveNav("dashboard");
    }
  }, [user, activeNav]);

  // Si es GERENTE, forzar a sucursal asignada
  useEffect(() => {
    if (user?.role === "GERENTE" && user.branch?.id) {
      setBranchId(user.branch.id.toString());
    }
  }, [user]);

  // Filtrar las secciones y elementos navegables permitidos para el rol GERENTE
  const allowedSections = NAV_SECTIONS.map((section) => {
    const items = section.items.filter((key) => {
      if (user?.role === "GERENTE") {
        return !RESTRICTED_KEYS_GERENTE.includes(key);
      }
      return true;
    });
    return { ...section, items };
  }).filter((section) => section.items.length > 0);

  // En móvil el menú nunca usa el rail colapsado; siempre cajón completo.
  // En tablet se fuerza el rail colapsado (solo íconos) en vez del cajón de mobile.
  const effectiveCollapsed = isMobile ? false : isTablet ? true : collapsed;

  // El hamburguesa: en móvil abre/cierra el cajón; en escritorio colapsa el rail
  const toggleMenu = () => {
    if (isMobile) setMobileOpen((o) => !o);
    else setCollapsed((c) => !c);
  };

  // Navega a una pestaña guardando la actual en el historial. Acepta un filtro
  // opcional (ej. desde las tarjetas del Dashboard) que se entrega a la vista
  // destino como `initialFilters` para que lo aplique una sola vez al montar.
  const navigateTo = (key: string, filter?: Record<string, any>) => {
    setMobileOpen(false); // cerrar el cajón al elegir módulo en móvil
    setPendingViewFilter(filter);
    if (key === activeNav) return;
    setNavHistory((h) => [...h, activeNav]);
    setActiveNav(key);
  };

  // Regresa a la pestaña anterior
  const goBack = () => {
    if (navHistory.length === 0) return;
    const prev = navHistory[navHistory.length - 1];
    setNavHistory((h) => h.slice(0, -1));
    setPendingViewFilter(undefined);
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

  // Log de movimientos administrativos (AdminActionLog, Fase 1): solo se dispara
  // cuando activeNav cambia de verdad, no en cada re-render. El guard con ref evita
  // duplicados por el doble-montaje de efectos de React StrictMode en desarrollo
  // (monta -> desmonta -> monta), además de re-renders genuinos que no cambian de
  // pestaña. Fire-and-forget — no debe bloquear la navegación ni mostrar error si falla.
  const lastLoggedNav = useRef<string | null>(null);
  useEffect(() => {
    if (lastLoggedNav.current === activeNav) return;
    lastLoggedNav.current = activeNav;
    api.post("/api/admin/security/action-log", { target: active.label }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNav]);

  // Estilo del sidebar: cajón fijo deslizable en móvil, acoplado en escritorio
  const sidebarStyle: React.CSSProperties = isMobile
    ? {
        ...styles.sidebar,
        position: "fixed",
        left: 0,
        top: 0,
        width: 264,
        transform: mobileOpen ? "translateX(0)" : "translateX(-100%)",
        transition: "transform 0.25s ease",
        zIndex: 300,
        boxShadow: mobileOpen ? "0 10px 40px rgba(0,0,0,0.35)" : "none",
      }
    : { ...styles.sidebar, width: effectiveCollapsed ? 72 : 248 };

  return (
    <SecurityEventsProvider>
    {/* Modal bloqueante: la sesión fue revocada por otro admin. Se muestra sin
        importar la vista activa (Dashboard, Inventario, Facturación, etc.) gracias
        a que useAdminSessionStatus vive en la raíz del panel admin. Independiente
        del rechazo duro 401 SESION_DESPLAZADA: si el usuario está inactivo y no
        dispara ningún request, este polling de 5s igual lo detecta y lo avisa. */}
    {revokedData && (
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
          <div style={{ display: "flex", justifyContent: "center", marginBottom: "16px" }}>
            <AlertTriangle size={48} color="var(--color-warning)" strokeWidth={1.5} />
          </div>
          <h2 style={{ fontSize: "20px", fontWeight: "800", color: "var(--text)", marginBottom: "10px" }}>
            Sesión cerrada
          </h2>
          <p style={{ fontSize: "14px", color: "var(--text-secondary)", marginBottom: "20px" }}>
            Un administrador cerró tu sesión.
          </p>
          {revokedData.reason && (
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
              <span
                style={{
                  fontSize: "12px",
                  fontWeight: "700",
                  color: "var(--text-secondary)",
                  textTransform: "uppercase",
                  letterSpacing: "0.4px",
                }}
              >
                Motivo
              </span>
              <p style={{ fontSize: "14px", color: "var(--text)", fontWeight: "600", marginTop: "6px", wordBreak: "break-word" }}>
                {revokedData.reason}
              </p>
            </div>
          )}
          <button
            onClick={() => {
              acknowledgeRevocation();
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
    )}
    <div style={styles.shell} className={`theme-aware${theme === "dark" ? " theme-dark" : ""}`}>
      <style>{ADMIN_CSS}</style>
      {/* Backdrop del cajón en móvil */}
      {isMobile && mobileOpen && (
        <div onClick={() => setMobileOpen(false)} style={styles.backdrop} />
      )}

      {/* ===================== SIDEBAR RETRÁCTIL / CAJÓN ===================== */}
      <aside style={sidebarStyle}>
        <div style={styles.brandRow} className="adm-brand-row">
          <div style={styles.brandLogo} className="adm-brand-logo">
            <Store size={20} color="#ffffff" />
          </div>
          {!effectiveCollapsed && (
            <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.05, minWidth: 0 }}>
              <span style={styles.brandText}>LYFRGL</span>
              <span style={styles.brandSub}>Punto de venta</span>
            </div>
          )}
        </div>

        <nav style={styles.nav} className="admin-sidebar-nav">
          {allowedSections.map((section) => (
            <React.Fragment key={section.label}>
              {!effectiveCollapsed && (
                <span style={styles.navSectionLabel}>{section.label}</span>
              )}
              {section.items.map((key) => {
                const item = NAV_ITEMS.find((n) => n.key === key)!;
                if (item.adminOnly && user?.role !== "ADMIN") return null;
                const Icon = item.icon;
                const isActive = activeNav === item.key;
                return (
                  <button
                    key={item.key}
                    onClick={() => navigateTo(item.key)}
                    title={item.label}
                    className="active-tap adm-nav-item"
                    style={{
                      ...styles.navItem,
                      justifyContent: effectiveCollapsed ? "center" : "flex-start",
                      backgroundColor: isActive ? "rgba(96,165,250,0.18)" : "transparent",
                      boxShadow: isActive ? "inset 0 0 0 1px rgba(96,165,250,0.28)" : "none",
                      color: isActive ? "#ffffff" : "#bcd0f0",
                      fontWeight: isActive ? 700 : 500,
                    }}
                  >
                    {/* Riel de acento que crece cuando el módulo está activo */}
                    <span
                      className="adm-rail"
                      aria-hidden
                      style={{
                        position: "absolute",
                        left: 3,
                        top: "50%",
                        width: 3,
                        height: 18,
                        borderRadius: 999,
                        background: "linear-gradient(180deg,#60a5fa,#22d3ee)",
                        boxShadow: isActive ? "0 0 8px rgba(96,165,250,0.85)" : "none",
                        transform: `translateY(-50%) scaleY(${isActive ? 1 : 0.2})`,
                        opacity: isActive ? 1 : 0,
                      }}
                    />
                    <Icon size={19} />
                    {!effectiveCollapsed && <span>{item.label}</span>}
                  </button>
                );
              })}
            </React.Fragment>
          ))}
        </nav>

        <div style={styles.sidebarFooter}>
          <div style={styles.userMini}>
            <div style={styles.userAvatar}>
              {initialsOf(user?.name)}
              <span style={styles.userOnlineDot} aria-hidden />
            </div>
            {!effectiveCollapsed && (
              <div style={{ overflow: "hidden", minWidth: 0 }}>
                <p style={styles.userName}>{user?.name || "Administrador"}</p>
                <span style={styles.userRoleBadge}>{user?.role || "ADMIN"}</span>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* ===================== ÁREA PRINCIPAL ===================== */}
      <div style={styles.main}>
        <header style={{ ...styles.topbar, padding: isMobile ? "0 12px" : "0 24px", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 6 : 14, minWidth: 0 }}>
            {/* En mobile: o el menú raíz, o la flecha de volver, nunca ambos a la vez.
                En desktop/tablet ambos botones pueden convivir. */}
            {(!isMobile || navHistory.length === 0) && (
              <button
                onClick={toggleMenu}
                title={isMobile ? "Abrir menú" : effectiveCollapsed ? "Expandir menú" : "Contraer menú"}
                className="active-tap adm-icon-btn"
                style={styles.iconBtn}
              >
                <Menu size={18} />
              </button>
            )}
            {navHistory.length > 0 && (
              <button
                onClick={goBack}
                title="Regresar a la pestaña anterior"
                className="active-tap adm-icon-btn"
                style={styles.iconBtn}
              >
                <ArrowLeft size={18} />
              </button>
            )}
            {isMobile ? (
              <span
                style={{
                  ...styles.appLabel,
                  fontSize: 14,
                  flex: "1 1 0",
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {active.label}
              </span>
            ) : (
              <div style={styles.titleWrap}>
                <span style={styles.appEyebrow}>Panel administrativo</span>
                <span style={styles.appLabel}>{active.label}</span>
              </div>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 6 : 10, flexShrink: 0 }}>
            {isMobile ? (
              // ── Mobile: Sucursales/Tema/Refresh/Salir condensados en un menú de
              //    "más opciones" para no competir por espacio con el título ──
              (() => {
                const canPickBranch = active.branchScoped && user?.role !== "GERENTE";
                const branchTitle = !active.branchScoped
                  ? "Esta sección no se filtra por sucursal"
                  : user?.role === "GERENTE"
                  ? `Sucursal asignada: ${user.branch?.name}`
                  : "Filtrar por sucursal";
                return (
                  <div style={{ position: "relative" }}>
                    <button
                      onClick={() => setMoreMenuOpen((o) => !o)}
                      title="Más opciones"
                      aria-label="Más opciones"
                      aria-haspopup="menu"
                      aria-expanded={moreMenuOpen}
                      className="active-tap adm-icon-btn"
                      style={{ ...styles.iconBtn, position: "relative" }}
                    >
                      <EllipsisVertical size={18} />
                      {canPickBranch && branchId !== "all" && <span style={styles.branchDot} aria-hidden />}
                    </button>
                    {moreMenuOpen && (
                      <>
                        <div onClick={() => setMoreMenuOpen(false)} style={styles.branchBackdrop} />
                        <div className="adm-branch-menu" style={{ ...styles.branchMenu, padding: 6 }} role="menu">
                          {active.branchScoped && (
                            <>
                              <div style={styles.branchMenuHead}>{branchTitle}</div>
                              {canPickBranch ? (
                                [{ id: "all", name: "Todas las sucursales" }, ...branches.map((b) => ({ id: String(b.id), name: b.name }))].map(
                                  (opt) => {
                                    const selected = branchId === opt.id;
                                    return (
                                      <button
                                        key={opt.id}
                                        role="menuitemradio"
                                        aria-checked={selected}
                                        className="adm-branch-item"
                                        onClick={() => {
                                          setBranchId(opt.id);
                                          setMoreMenuOpen(false);
                                        }}
                                        style={{
                                          ...styles.branchItem,
                                          backgroundColor: selected ? "var(--accent-soft)" : "transparent",
                                          color: selected ? "var(--accent-strong)" : "var(--text-secondary)",
                                          fontWeight: selected ? 700 : 500,
                                        }}
                                      >
                                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                          {opt.name}
                                        </span>
                                        {selected && <Check size={15} style={{ flexShrink: 0 }} />}
                                      </button>
                                    );
                                  }
                                )
                              ) : (
                                <div style={{ padding: "8px 10px", fontSize: 13, color: "var(--text-secondary)" }}>
                                  {user?.branch?.name}
                                </div>
                              )}
                              <div style={{ borderTop: "1px solid var(--border)", margin: "6px 0" }} />
                            </>
                          )}
                          <button
                            className="adm-branch-item"
                            onClick={() => {
                              toggleTheme();
                              setMoreMenuOpen(false);
                            }}
                            style={{ ...styles.branchItem, display: "flex", alignItems: "center", gap: 8 }}
                          >
                            {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
                            {theme === "dark" ? "Modo claro" : "Modo oscuro"}
                          </button>
                          <button
                            className="adm-branch-item"
                            onClick={() => {
                              handleRefresh();
                              setMoreMenuOpen(false);
                            }}
                            style={{ ...styles.branchItem, display: "flex", alignItems: "center", gap: 8 }}
                          >
                            <RefreshCw size={15} /> Actualizar
                          </button>
                          <div style={{ borderTop: "1px solid var(--border)", margin: "6px 0" }} />
                          <button
                            className="adm-branch-item"
                            onClick={() => {
                              setMoreMenuOpen(false);
                              setShowLogoutConfirm(true);
                            }}
                            style={{ ...styles.branchItem, display: "flex", alignItems: "center", gap: 8, color: "#dc2626" }}
                          >
                            <LogOut size={15} /> Cerrar sesión
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })()
            ) : (
              <>
                {(() => {
                  const canPickBranch = active.branchScoped && user?.role !== "GERENTE";
                  const branchTitle = !active.branchScoped
                    ? "Esta sección no se filtra por sucursal"
                    : user?.role === "GERENTE"
                    ? `Sucursal asignada: ${user.branch?.name}`
                    : "Filtrar por sucursal";

                  return (
                    <div
                      style={{
                        ...styles.selectWrap,
                        opacity: !active.branchScoped ? 0.45 : (user?.role === "GERENTE" ? 0.8 : 1),
                        pointerEvents: canPickBranch ? "auto" : "none",
                      }}
                      title={branchTitle}
                    >
                      <Store size={15} style={{ flexShrink: 0, color: "var(--text-muted)" }} />
                      <select
                        value={branchId}
                        onChange={(e) => setBranchId(e.target.value)}
                        disabled={user?.role === "GERENTE" || !active.branchScoped}
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
                  );
                })()}
                <button
                  onClick={toggleTheme}
                  title={theme === "dark" ? "Activar modo claro" : "Activar modo oscuro"}
                  aria-label={theme === "dark" ? "Activar modo claro" : "Activar modo oscuro"}
                  className="active-tap adm-icon-btn"
                  style={styles.iconBtn}
                >
                  {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
                </button>
                <button
                  onClick={handleRefresh}
                  title="Actualizar"
                  className="active-tap adm-icon-btn"
                  style={styles.iconBtn}
                >
                  <RefreshCw size={16} className={spinning ? "adm-spin" : undefined} />
                </button>
                <button
                  onClick={() => setShowLogoutConfirm(true)}
                  className="active-tap adm-logout"
                  style={styles.logoutBtn}
                  title="Cerrar sesión"
                >
                  <LogOut size={15} /> Salir
                </button>
              </>
            )}
          </div>
        </header>

        <div style={{ ...styles.content, padding: isMobile ? 14 : 24 }}>
          <ActiveView
            branchId={branchId}
            refreshToken={refreshToken}
            initialFilters={pendingViewFilter}
            navigateTo={navigateTo}
          />
        </div>
      </div>
      {showInactivityModal && (
        <div style={ui.overlay}>
          <div style={{ ...ui.modal, maxWidth: 400, textAlign: "center" }}>
            <div style={ui.modalHeader}>
              <span style={ui.modalTitle}>Sesión inactiva</span>
            </div>
            <div style={{ ...ui.modalBody, paddingTop: 16, paddingBottom: 8 }}>
              <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 24 }}>
                Tu sesión ha estado inactiva por 15 minutos. ¿Deseas continuar o cerrar sesión?
              </p>
              <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                <button
                  onClick={() => {
                    setShowInactivityModal(false);
                    logout();
                  }}
                  style={ui.ghostBtn}
                >
                  Cerrar sesión
                </button>
                <button
                  onClick={() => setShowInactivityModal(false)}
                  style={{
                    ...ui.primaryBtn,
                    background: "linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)",
                  }}
                >
                  Continuar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {showLogoutConfirm && (
        <div style={ui.overlay}>
          <div style={{ ...ui.modal, maxWidth: 400, textAlign: "center" }}>
            <div style={ui.modalHeader}>
              <span style={ui.modalTitle}>¿Cerrar sesión?</span>
            </div>
            <div style={{ ...ui.modalBody, paddingTop: 16, paddingBottom: 8 }}>
              <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 24 }}>
                ¿Estás seguro que deseas cerrar tu sesión? Tendrás que volver a iniciar sesión para acceder al panel.
              </p>
              <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                <button
                  onClick={() => setShowLogoutConfirm(false)}
                  style={ui.ghostBtn}
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    setShowLogoutConfirm(false);
                    logout();
                  }}
                  style={{
                    ...ui.primaryBtn,
                    background: "linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)",
                  }}
                >
                  Sí, cerrar sesión
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
    </SecurityEventsProvider>
  );
};

const styles: { [k: string]: React.CSSProperties } = {
  shell: {
    display: "flex",
    minHeight: "100vh",
    background: "var(--app-bg)",
  },

  backdrop: {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(8,15,34,0.55)",
    backdropFilter: "blur(2px)",
    zIndex: 290,
  },

  sidebar: {
    background: "linear-gradient(180deg, #1b2c57 0%, #0f1c3f 55%, #0c1834 100%)",
    borderRight: "1px solid rgba(255,255,255,0.06)",
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
    gap: 11,
    padding: "20px 18px",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    cursor: "default",
  },
  brandLogo: {
    width: 36,
    height: 36,
    borderRadius: 10,
    background: "linear-gradient(135deg, #60a5fa 0%, #2563eb 100%)",
    boxShadow: "0 6px 16px -4px rgba(37,99,235,0.7)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  brandText: { color: "#ffffff", fontWeight: 800, fontSize: 17, letterSpacing: "0.2px", whiteSpace: "nowrap" },
  brandSub: {
    color: "#7f9bd0",
    fontWeight: 700,
    fontSize: 9.5,
    letterSpacing: "1.4px",
    textTransform: "uppercase" as const,
    whiteSpace: "nowrap",
  },
  nav: { display: "flex", flexDirection: "column", gap: 3, padding: "14px 12px", flex: 1, minHeight: 0, overflowY: "auto" },
  navSectionLabel: {
    fontSize: 10,
    fontWeight: 700,
    color: "var(--text-muted)",
    textTransform: "uppercase" as const,
    letterSpacing: "1px",
    padding: "14px 12px 5px",
    display: "block",
  },
  navItem: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 12px 10px 14px",
    borderRadius: 10,
    border: "none",
    cursor: "pointer",
    fontSize: 14,
    whiteSpace: "nowrap",
    background: "transparent",
  },
  sidebarFooter: { padding: "14px 12px", borderTop: "1px solid rgba(255,255,255,0.08)" },
  userMini: { display: "flex", alignItems: "center", gap: 11, padding: "4px 4px" },
  userAvatar: {
    position: "relative",
    width: 36,
    height: 36,
    borderRadius: "50%",
    background: "linear-gradient(135deg, #60a5fa 0%, #2563eb 100%)",
    color: "#ffffff",
    fontSize: 13,
    fontWeight: 800,
    letterSpacing: "0.3px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    boxShadow: "0 4px 10px -3px rgba(37,99,235,0.6)",
  },
  userOnlineDot: {
    position: "absolute",
    right: -1,
    bottom: -1,
    width: 10,
    height: 10,
    borderRadius: "50%",
    backgroundColor: "#22c55e",
    border: "2px solid #0f1c3f",
  },
  userName: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: 700,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    margin: 0,
  },
  userRoleBadge: {
    display: "inline-block",
    marginTop: 3,
    fontSize: 9.5,
    fontWeight: 800,
    letterSpacing: "0.6px",
    color: "#bfdbfe",
    backgroundColor: "rgba(96,165,250,0.18)",
    padding: "2px 8px",
    borderRadius: 999,
  },

  main: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0 },
  topbar: {
    height: 64,
    backgroundColor: "var(--topbar-bg)",
    borderBottom: "1px solid var(--border)",
    boxShadow: "0 1px 3px rgba(15,23,42,0.04)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 24px",
    position: "sticky",
    top: 0,
    zIndex: 10,
  },
  titleWrap: { display: "flex", flexDirection: "column", lineHeight: 1.15, minWidth: 0 },
  appEyebrow: {
    fontSize: 10,
    fontWeight: 700,
    color: "var(--text-muted)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.9px",
  },
  appLabel: { fontSize: 16, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.4px" },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    border: "1px solid var(--border)",
    backgroundColor: "var(--surface)",
    color: "var(--accent-strong)",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  selectWrap: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    border: "1px solid var(--border)",
    borderRadius: 10,
    padding: "0 12px",
    height: 38,
    color: "var(--text-muted)",
    backgroundColor: "var(--surface)",
  },
  select: {
    border: "none",
    outline: "none",
    backgroundColor: "transparent",
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-secondary)",
    cursor: "pointer",
    fontFamily: "inherit",
  },
  // Selector de sucursales en móvil (botón casita + menú desplegable)
  branchDot: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 7,
    height: 7,
    borderRadius: "50%",
    backgroundColor: "#22c55e",
    border: "1.5px solid var(--surface)",
  },
  branchBackdrop: {
    position: "fixed",
    inset: 0,
    zIndex: 290,
    background: "transparent",
  },
  branchMenu: {
    position: "fixed",
    top: 60,
    right: 12,
    left: "auto",
    minWidth: 220,
    maxWidth: "calc(100vw - 24px)",
    maxHeight: "70vh",
    overflowY: "auto",
    backgroundColor: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    boxShadow: "var(--shadow-pop)",
    padding: 6,
    zIndex: 300,
  },
  branchMenuHead: {
    fontSize: 10,
    fontWeight: 700,
    color: "var(--text-muted)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.7px",
    padding: "6px 10px 8px",
  },
  branchItem: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    width: "100%",
    textAlign: "left",
    border: "none",
    borderRadius: 8,
    padding: "10px 10px",
    fontSize: 13,
    cursor: "pointer",
    background: "transparent",
    fontFamily: "inherit",
  },
  logoutBtn: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: "linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)",
    color: "#ffffff",
    border: "none",
    borderRadius: 10,
    padding: "9px 16px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    height: 38,
    boxShadow: "0 4px 12px -5px rgba(37,99,235,0.55)",
  },
  content: { padding: 24, overflowY: "auto", overflowX: "hidden", minWidth: 0, flex: 1, color: "var(--text)" },
};

export default AdminDashboard;
