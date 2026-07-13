import React from "react";
import { Store } from "lucide-react";
import { QuickActionsCarousel } from "./QuickActionsCarousel";



interface SalesLayoutViewProps {

  recentSales?: any[];
  onOpenModal: (modal: string) => void;
  onLock: () => void;

  onReprintTicket?: (saleId: number) => void;
  onStartReturn?: (saleId: number) => void;
  children: React.ReactNode;
  isSidebarCollapsed: boolean;
  setIsSidebarCollapsed: (collapsed: boolean) => void;
  cartData?: any;
  onToast?: (msg: string, type?: "error" | "success" | "info" | "warning") => void;
}

export function SalesLayoutView({

  recentSales = [],
  onOpenModal,
  onLock,

  onReprintTicket,
  onStartReturn,
  children,
  isSidebarCollapsed,
  setIsSidebarCollapsed,
  cartData,
  onToast,
}: SalesLayoutViewProps) {

  return (
    <div className={`pos-sales-layout ${isSidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      {/* Sidebar Container */}
      <aside className="pos-sales-sidebar">
        {/* Sidebar Content (hidden when collapsed via CSS) */}
        <div className="pos-sidebar-inner-content" style={{ display: "flex", flexDirection: "column", height: "100%", justifyContent: "space-between", alignItems: "center" }}>
          {/* Quick Actions Carousel */}
          <QuickActionsCarousel onOpenModal={onOpenModal} onLock={onLock} />

          <div className="pos-sidebar-close-cash-wrapper" style={{ paddingBottom: "16px", display: "flex", flexDirection: "column", gap: "10px" }}>

            <button
              type="button"
              onClick={() => onOpenModal("close-options")}
              className="pos-quick-action-icon-btn active-tap"
              data-shortcut-letter="X"
              data-shortcut-key="F8"
              title="Cerrar caja (Alt+X, F8)"
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "8px",
                border: "1px solid var(--pos-border)",
                backgroundColor: "#fee2e2",
                color: "#dc2626",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                cursor: "pointer",
                transition: "all 0.2s"
              }}
            >
              <Store size={20} />
            </button>
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
