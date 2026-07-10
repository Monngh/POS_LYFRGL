import React from "react";
import { Lock, Store } from "lucide-react";
import { QuickActionsCarousel } from "./QuickActionsCarousel";
import { CashInfoPanel } from "./CashInfoPanel";
import { RecentSalesPanel } from "./RecentSalesPanel";
import { ShortcutsHelpPanel } from "./ShortcutsHelpPanel";

interface SalesLayoutViewProps {
  session: any;
  sessionStats: any;
  recentSales?: any[];
  onOpenModal: (modal: string) => void;
  onLock: () => void;
  onGoHome: () => void;
  onReprintTicket?: (saleId: number) => void;
  onStartReturn?: (saleId: number) => void;
  children: React.ReactNode;
  isSidebarCollapsed: boolean;
  setIsSidebarCollapsed: (collapsed: boolean) => void;
}

export function SalesLayoutView({
  session,
  sessionStats,
  recentSales = [],
  onOpenModal,
  onLock,
  onGoHome,
  onReprintTicket,
  onStartReturn,
  children,
  isSidebarCollapsed,
  setIsSidebarCollapsed,
}: SalesLayoutViewProps) {

  return (
    <div className={`pos-sales-layout ${isSidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      {/* Sidebar Container */}
      <aside className="pos-sales-sidebar">
        {/* Close sidebar button — positioned absolute inside sidebar padding area */}
        <button
          type="button"
          onClick={() => setIsSidebarCollapsed(true)}
          className="pos-sidebar-close-btn active-tap"
          title="Ocultar panel lateral"
          aria-label="Ocultar panel lateral"
        >
          ✕
        </button>

        {/* Sidebar Content (hidden when collapsed via CSS) */}
        <div className="pos-sidebar-inner-content">
          {/* Quick Actions Carousel */}
          <QuickActionsCarousel onOpenModal={onOpenModal} onGoHome={onGoHome} />

          {/* Cash Session Status & Info */}
          <CashInfoPanel session={session} sessionStats={sessionStats} />

          {/* Últimas ventas del turno */}
          {recentSales.length > 0 && (
            <RecentSalesPanel
              recentSales={recentSales}
              onReprintTicket={onReprintTicket || (() => {})}
              onStartReturn={onStartReturn || (() => {})}
            />
          )}

          {/* Panel de atajos colapsable */}
          <ShortcutsHelpPanel />

          {/* Cerrar Caja Button */}
          <div className="pos-sidebar-close-cash-wrapper">
            <button
              type="button"
              onClick={() => onOpenModal("close-options")}
              className="pos-sidebar-close-cash-btn active-tap"
              data-shortcut-letter="T"
              data-shortcut-key="F8"
              title="Cerrar caja (Alt+T, F8)"
            >
              <Store size={16} />
              <span>CERRAR CAJA</span>
            </button>
          </div>

          {/* Lock Screen Button */}
          <div className="pos-sidebar-lock-wrapper">
            <button
              type="button"
              onClick={onLock}
              className="pos-sidebar-lock-btn active-tap"
              data-shortcut-key="F10"
              title="Bloquear pantalla (F10)"
            >
              <Lock size={16} />
              <span>BLOQUEAR PANTALLA</span>
            </button>
            <span className="pos-lock-shortcut-label">F10</span>
          </div>
        </div>
      </aside>

      {/* Main content area */}
      <main className="pos-sales-main-content">
        {children}
      </main>
    </div>
  );
}
