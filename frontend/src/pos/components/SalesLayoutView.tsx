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
  onOpenModal,
  onLock,
  children,
  isSidebarCollapsed,
}: SalesLayoutViewProps) {

  return (
    <div className={`pos-sales-layout ${isSidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      {/* Sidebar Container */}
      <aside className="pos-sales-sidebar">
        {/* Sidebar Content (hidden when collapsed via CSS) */}
        <div className="pos-sidebar-inner-content" style={{ display: "flex", flexDirection: "column", height: "100%", justifyContent: "space-between", alignItems: "center" }}>
          {/* Quick Actions Carousel */}
          <QuickActionsCarousel onOpenModal={onOpenModal} onLock={onLock} />

          <div className="pos-sidebar-close-cash-wrapper" style={{ paddingBottom: "16px", display: "flex", flexDirection: "column", gap: "10px", width: "100%", padding: "8px 12px 16px" }}>
            <div style={{ position: "relative", display: "flex", width: "100%" }}>
              <button
                type="button"
                onClick={() => onOpenModal("close-cash")}
                className="pos-quick-action-icon-btn active-tap"
                data-shortcut-key="F8"
                title="Cerrar caja (F8)"
                style={{
                  width: "100%",
                  minHeight: "40px",
                  borderRadius: "8px",
                  border: "1px solid #fca5a5",
                  backgroundColor: "#fee2e2",
                  color: "#dc2626",
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  gap: "6px",
                  cursor: "pointer",
                  transition: "all 0.2s",
                  fontWeight: "700",
                  fontSize: "11px",
                  paddingLeft: "8px",
                  paddingRight: "8px",
                }}
              >
                <Store size={16} />
                <span>Cerrar Caja</span>
                <span className="pos-fkey-badge" style={{ fontSize: "7px", padding: "1px 3px", marginLeft: "auto" }}>F8</span>
              </button>
            </div>
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
