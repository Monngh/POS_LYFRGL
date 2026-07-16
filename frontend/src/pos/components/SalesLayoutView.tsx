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
      {/* Overlay para cerrar el menú flotante */}
      {!isSidebarCollapsed && (
        <div 
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.3)", zIndex: 40 }}
          onClick={() => setIsSidebarCollapsed(true)}
        />
      )}
      
      {/* Sidebar Container */}
      <aside className="pos-sales-sidebar">
        {/* Sidebar Content (hidden when collapsed via CSS) */}
        <div className="pos-sidebar-inner-content" style={{ display: "flex", flexDirection: "column", height: "100%", justifyContent: "space-between", alignItems: "center" }}>
          {/* Quick Actions Carousel */}
          <QuickActionsCarousel onOpenModal={onOpenModal} onLock={onLock} />

          <div className="pos-sidebar-close-cash-wrapper" style={{ paddingBottom: "16px", display: "flex", flexDirection: "column", gap: "10px", width: "100%", padding: "8px 0 16px" }}>
            <div style={{ position: "relative", display: "flex", width: "100%", justifyContent: "center" }}>
              <button
                type="button"
                onClick={() => onOpenModal("close-cash")}
                className="active-tap"
                data-shortcut-key="F8"
                title="Cerrar caja (F8)"
                style={{
                  width: "44px",
                  height: "44px",
                  borderRadius: "10px",
                  border: "1.5px solid #fca5a5",
                  backgroundColor: "#fee2e2",
                  color: "#dc2626",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  alignItems: "center",
                  gap: "2px",
                  cursor: "pointer",
                  transition: "all 0.2s",
                  fontFamily: "inherit",
                  padding: 0,
                  position: "relative",
                }}
              >
                <Store size={18} />
                <span className="pos-fkey-badge" style={{ fontSize: "7px", padding: "1px 3px", lineHeight: 1 }}>F8</span>
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
