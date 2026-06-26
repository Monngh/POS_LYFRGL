import React from "react";
import {
  LogOut,
  Store,
  Users,
  AlertTriangle,
  BadgePercent,
  Search,
  Printer,
  XCircle,
  PiggyBank,
  FileText,
  RotateCcw,
  MoreVertical,
  Sun,
  Moon,
  ShoppingCart,
  MapPin,
  User,
  Clock,
} from "lucide-react";
import { TICKET_PRINT_MEDIA_STYLES } from "../../shared/utils/ticketEmailDocument.util";
import api from "../../shared/services/api";
import { useCashSession } from "../hooks/useCashSession";
import { usePosTheme, togglePosTheme } from "../../shared/hooks/usePosTheme";

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

interface DashboardUser {
  name: string;
  branch: { name: string };
}

interface DashboardHomeViewProps {
  sessionData: ReturnType<typeof useCashSession>;
  user: DashboardUser | null;
  currentTime: Date;
  onOpenModal: (modal: string) => void;
  onLogout: () => void;
  onNuevaVenta: () => void;
  openDashboardTableMenu: string | null;
  onSetOpenDashboardTableMenu: (menu: string | null) => void;
  expandedSalesRows: Set<number>;
  onToggleSalesRow: (id: number) => void;
  expandedDepositRows: Set<number>;
  onToggleDepositRow: (id: number) => void;
  dashboardTicketLoadingId: number | null;
  onOpenDashboardSaleTicket: (sale: Sale) => void;
  onSetSelectedSale: (sale: any) => void;
  onToast: (msg: string, type?: "error" | "success" | "info") => void;
}

const styles: { [key: string]: React.CSSProperties } = {
  appContainer: { minHeight: "100vh", display: "flex", flexDirection: "column" as const, backgroundColor: "var(--surface-2)" },
  navbar: { height: "64px", backgroundColor: "var(--accent-strong)", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 24px", boxShadow: "0 2px 4px rgba(0,0,0,0.05)" },
  navBrand: { display: "flex", alignItems: "center", gap: "10px" },
  brandText: { color: "#ffffff", fontWeight: "800", fontSize: "16px", letterSpacing: "-0.3px" },
  logoutBtn: { backgroundColor: "transparent", border: "1px solid #93c5fd", color: "#ffffff", padding: "6px 12px", borderRadius: "4px", fontSize: "13px", fontWeight: "600", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px", transition: "all 0.15s ease" },
  goToSalesBtn: { backgroundColor: "rgba(255, 255, 255, 0.15)", border: "1px solid rgba(255, 255, 255, 0.3)", color: "#ffffff", padding: "6px 12px", borderRadius: "4px", fontSize: "13px", fontWeight: "600", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px", transition: "all 0.15s ease" },
  themeBtn: { backgroundColor: "transparent", border: "1px solid #93c5fd", color: "#ffffff", width: "34px", height: "34px", borderRadius: "4px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s ease" },
  navActions: { display: "flex", alignItems: "center", gap: "10px" },
  mainLayout: { display: "flex", flex: 1 },
  sidebar: { width: "250px", backgroundColor: "var(--surface)", borderRight: "1px solid var(--border)", padding: "24px", display: "flex", flexDirection: "column" as const, alignItems: "center" },
  sidebarProfile: { display: "flex", flexDirection: "column" as const, alignItems: "center", textAlign: "center" as const, gap: "8px" },
  avatarCircle: { width: "48px", height: "48px", borderRadius: "50%", backgroundColor: "var(--accent-strong)", display: "flex", justifyContent: "center", alignItems: "center" },
  profileName: { fontSize: "14px", fontWeight: "700", color: "var(--text)" },
  profileBranch: { fontSize: "12px", color: "var(--text-muted)" },
  contentArea: { flex: 1, padding: "24px", overflowY: "auto" as const },
  statsGrid: { display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "14px" },
  statusCard: { backgroundColor: "var(--surface)", border: "1px solid #3b82f6", borderRadius: "6px", padding: "16px 12px", boxShadow: "0 1px 2px rgba(0,0,0,0.02)", display: "flex", flexDirection: "column" as const },
  cardHeaderLabel: { fontSize: "9px", fontWeight: "700", color: "var(--text-muted)", letterSpacing: "0.5px", textTransform: "uppercase" as const },
  sectionSubtitle: { fontSize: "12px", fontWeight: "700", color: "var(--text-secondary)", letterSpacing: "0.5px", marginBottom: "10px" },
  actionsGrid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" },
  actionBtn: { backgroundColor: "var(--surface)", border: "1px solid #3b82f6", borderRadius: "8px", padding: "20px 10px", display: "flex", flexDirection: "column" as const, alignItems: "center", gap: "10px", cursor: "pointer", fontSize: "12px", fontWeight: "700", color: "var(--accent-strong)", boxShadow: "0 1px 3px rgba(0,0,0,0.03)", transition: "all 0.15s ease" },
  tablesGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginTop: "24px" },
  tableCard: { padding: "20px", height: "360px", display: "flex", flexDirection: "column" as const },
  tableCardTitle: { fontSize: "11px", fontWeight: "800", color: "#ffffff", backgroundColor: "#3b82f6", padding: "8px 12px", borderRadius: "4px", letterSpacing: "0.5px" },
  table: { width: "100%", borderCollapse: "collapse" as const, textAlign: "left" as const },
  tableHeaderRow: { borderBottom: "2px solid var(--border)" },
  th: { padding: "10px 12px", fontSize: "11px", fontWeight: "700", color: "var(--text-secondary)", textTransform: "uppercase" as const },
  tableRow: { borderBottom: "1px solid var(--surface-3)" },
  td: { padding: "12px", fontSize: "13px", color: "var(--text-secondary)" },
  actionLink: { background: "none", border: "none", color: "var(--accent)", fontWeight: "600", fontSize: "12px", cursor: "pointer" },
  badgeSuccess: { backgroundColor: "#dcfce7", color: "#15803d", fontSize: "10px", fontWeight: "700", padding: "2px 6px", borderRadius: "4px" },
};

export function DashboardHomeView({
  sessionData,
  user,
  currentTime,
  onOpenModal,
  onLogout,
  onNuevaVenta,
  openDashboardTableMenu,
  onSetOpenDashboardTableMenu,
  expandedSalesRows,
  onToggleSalesRow,
  expandedDepositRows,
  onToggleDepositRow,
  dashboardTicketLoadingId,
  onOpenDashboardSaleTicket,
  onSetSelectedSale,
  onToast,
}: DashboardHomeViewProps) {
  const { session, sessionStats, recentSales, recentDeposits } = sessionData;
  const theme = usePosTheme();

  const formattedTime = currentTime.toLocaleTimeString("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  return (
    <div style={styles.appContainer} className="pos-cashier-app">
      <style>{TICKET_PRINT_MEDIA_STYLES}</style>
      {/* Navbar */}
      <header className="pos-terminal-navbar">
        <div className="pos-terminal-navbar-left">
          <Store size={20} className="pos-terminal-store-icon" />
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
          <button
            onClick={togglePosTheme}
            className="pos-terminal-home-btn active-tap"
            title={theme === "dark" ? "Modo claro" : "Modo oscuro"}
            aria-label={theme === "dark" ? "Activar modo claro" : "Activar modo oscuro"}
            type="button"
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button
            onClick={onNuevaVenta}
            className="pos-terminal-home-btn active-tap"
            title="Ir a Ventas"
            aria-label="Ir a Ventas"
            type="button"
          >
            <ShoppingCart size={16} />
          </button>
          <button
            onClick={onLogout}
            className="pos-terminal-logout-btn active-tap"
            title="Cerrar Sesión"
            aria-label="Cerrar sesión del cajero"
            type="button"
          >
            <LogOut size={16} />
          </button>
        </div>
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
                <span style={{ fontSize: "11px", fontWeight: "normal", color: "var(--text-muted)", marginLeft: "8px", display: "inline-block" }}>
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
                onClick={() => onOpenModal("bank-deposit")}
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
              <h3 style={{ fontSize: "20px", fontWeight: "800", color: "var(--text)", marginTop: "4px" }}>
                ${sessionStats?.totalSalesAmount.toFixed(2) || "0.00"}
              </h3>
            </div>
            <div style={styles.statusCard}>
              <span style={styles.cardHeaderLabel}>VENTAS REALIZADAS</span>
              <h3 style={{ fontSize: "20px", fontWeight: "800", color: "var(--text)", marginTop: "4px" }}>
                {sessionStats?.salesCount || 0} ventas
              </h3>
            </div>
            <div style={styles.statusCard}>
              <span style={styles.cardHeaderLabel}>FONDO INICIAL</span>
              <h3 style={{ fontSize: "20px", fontWeight: "800", color: "var(--text-secondary)", marginTop: "4px" }}>
                ${sessionStats?.initialAmount.toFixed(2) || "0.00"}
              </h3>
            </div>
            <div style={styles.statusCard}>
              <span style={styles.cardHeaderLabel}>EFECTIVO ESPERADO</span>
              <h3 style={{ fontSize: "20px", fontWeight: "800", color: "var(--accent-strong)", marginTop: "4px" }}>
                ${sessionStats?.expectedAmount.toFixed(2) || "0.00"}
              </h3>
            </div>
            <div style={styles.statusCard}>
              <span style={styles.cardHeaderLabel}>TURNO INICIADO</span>
              <h3 style={{ fontSize: "16px", fontWeight: "800", color: "var(--text-secondary)", marginTop: "6px" }}>
                {session?.openedAt ? new Date(session.openedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "8:00 am"}
              </h3>
            </div>
          </div>

          {/* ACCIONES RÁPIDAS (Mockup 7) */}
          <div style={{ marginTop: "24px" }}>
            <h4 style={styles.sectionSubtitle}>ACCIONES RÁPIDAS</h4>
            <div style={styles.actionsGrid} className="pos-cashier-actions-grid">
              <button onClick={onNuevaVenta} style={styles.actionBtn} className="active-tap pos-cashier-action-btn">
                <BadgePercent size={28} color="#1e3a8a" />
                <span>Nueva Venta</span>
              </button>
              <button onClick={() => onOpenModal("price-lookup")} style={styles.actionBtn} className="active-tap pos-cashier-action-btn">
                <Search size={28} color="#1e3a8a" />
                <span>Consultar precio</span>
              </button>
              <button onClick={() => onOpenModal("ticket-history")} style={styles.actionBtn} className="active-tap pos-cashier-action-btn">
                <Printer size={28} color="#1e3a8a" />
                <span>Reimprimir ticket</span>
              </button>
              <button onClick={() => onOpenModal("cancel-sale")} style={styles.actionBtn} className="active-tap pos-cashier-action-btn">
                <XCircle size={28} color="#1e3a8a" />
                <span>Solicitar Cancelación</span>
              </button>
              <button onClick={() => onOpenModal("close-options")} style={styles.actionBtn} className="active-tap pos-cashier-action-btn">
                <Store size={28} color="#dc2626" />
                <span>Cerrar Caja</span>
              </button>
              <button onClick={() => onOpenModal("bank-deposit")} style={styles.actionBtn} className="active-tap pos-cashier-action-btn">
                <PiggyBank size={28} color="#0d9488" />
                <span>Depósito Banco</span>
              </button>
              <button onClick={() => onOpenModal("returns")} style={styles.actionBtn} className="active-tap pos-cashier-action-btn">
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
                                onClick={() => onOpenDashboardSaleTicket(sale)}
                                disabled={dashboardTicketLoadingId === sale.id}
                                style={{ ...styles.actionLink, opacity: dashboardTicketLoadingId === sale.id ? 0.65 : 1 }}
                              >
                                Ver Ticket v
                              </button>
                              <button
                                onClick={() => onToggleSalesRow(sale.id)}
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
                                onClick={() => onSetOpenDashboardTableMenu(openDashboardTableMenu === `sale-${sale.id}` ? null : `sale-${sale.id}`)}
                              >
                                <MoreVertical size={18} />
                              </button>
                              {openDashboardTableMenu === `sale-${sale.id}` && (
                                <div className="pos-cashier-row-menu">
                                  <button
                                    type="button"
                                    disabled={dashboardTicketLoadingId === sale.id}
                                    onClick={() => onOpenDashboardSaleTicket(sale)}
                                  >
                                    Ver Ticket
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onToggleSalesRow(sale.id);
                                      onSetOpenDashboardTableMenu(null);
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
                                          onSetSelectedSale({
                                            ...res.data.sale,
                                            refundStatus: sale.refundStatus,
                                            isNewSale: false
                                          });
                                          onOpenModal("ticket-view");
                                        } catch (e: any) {
                                          onToast(e.response?.data?.message || "Error al recuperar los detalles de la venta.", "error");
                                        }
                                      }}
                                      style={styles.actionLink}
                                    >
                                      Ver Ticket v
                                    </button>
                                  </span>
                                </div>
                                <button
                                  onClick={() => onToggleSalesRow(sale.id)}
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
                        <td colSpan={7} style={{ textAlign: "center", padding: "24px 12px", color: "var(--text-muted)", fontSize: "13px" }}>
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
                      <th style={styles.th}>DESTINO</th>
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
                            <td data-label="Destino" style={styles.td}>{dep.targetName ? "Destino registrado" : "Destino no registrado"}</td>
                            <td data-label="Monto" style={{ ...styles.td, fontWeight: "700", color: "#dc2626" }}>-${dep.amount.toFixed(2)}</td>
                            <td data-label="Estado" style={styles.td}>
                              <span style={styles.badgeSuccess}>Exitoso</span>
                              <button
                                onClick={() => onToggleDepositRow(dep.id)}
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
                                onClick={() => onSetOpenDashboardTableMenu(openDashboardTableMenu === `deposit-${dep.id}` ? null : `deposit-${dep.id}`)}
                              >
                                <MoreVertical size={18} />
                              </button>
                              {openDashboardTableMenu === `deposit-${dep.id}` && (
                                <div className="pos-cashier-row-menu">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onToggleDepositRow(dep.id);
                                      onSetOpenDashboardTableMenu(null);
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
                                  onClick={() => onToggleDepositRow(dep.id)}
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
                        <td colSpan={5} style={{ textAlign: "center", padding: "20px", color: "var(--text-muted)" }}>
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
    </div>
  );
}
