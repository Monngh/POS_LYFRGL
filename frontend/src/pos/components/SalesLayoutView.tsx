import React from "react";
import { Lock, Store } from "lucide-react";
import { QuickActionsCarousel } from "./QuickActionsCarousel";
import { CashInfoPanel } from "./CashInfoPanel";

interface SalesLayoutViewProps {
  session: any;
  sessionStats: any;
  onOpenModal: (modal: string) => void;
  onLock: () => void;
  onGoHome: () => void;
  children: React.ReactNode;
  isSidebarCollapsed: boolean;
  setIsSidebarCollapsed: (collapsed: boolean) => void;
}

export function SalesLayoutView({
  session,
  sessionStats,
  onOpenModal,
  onLock,
  onGoHome,
  children,
  isSidebarCollapsed,
  setIsSidebarCollapsed,
}: SalesLayoutViewProps) {

  return (
    <div className={`pos-sales-layout ${isSidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      {/* Sidebar Container */}
      <aside className="pos-sales-sidebar">
        {/* Sidebar Content (hidden when collapsed via CSS) */}
        <div className="pos-sidebar-inner-content">
          {/* Close sidebar button — top right of sidebar */}
          <button
            type="button"
            onClick={() => setIsSidebarCollapsed(true)}
            className="pos-sidebar-close-btn active-tap"
            title="Ocultar panel lateral"
            aria-label="Ocultar panel lateral"
          >
            ✕
          </button>

          {/* Quick Actions Carousel */}
          <QuickActionsCarousel onOpenModal={onOpenModal} onGoHome={onGoHome} />

          {/* Cash Session Status & Info */}
          <CashInfoPanel session={session} sessionStats={sessionStats} />

          {/* Cerrar Caja Button */}
          <div className="pos-sidebar-close-cash-wrapper">
            <button
              type="button"
              onClick={() => onOpenModal("close-options")}
              className="pos-sidebar-close-cash-btn active-tap"
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
            >
              <Lock size={16} />
              <span>BLOQUEAR PANTALLA</span>
            </button>
            <span className="pos-lock-shortcut-label">Ctrl + L</span>
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
