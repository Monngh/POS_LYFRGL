import { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Search,
  PiggyBank,
  XCircle,
  RotateCcw,
  Printer,
  FileText,
  ExternalLink,
  Home,
} from "lucide-react";
import { GLOBAL_QUICK_ACTIONS, type GlobalQuickActionLetter } from "../constants/posShortcuts";

interface QuickActionsCarouselProps {
  onOpenModal: (modal: string) => void;
  onGoHome: () => void;
}

export function QuickActionsCarousel({ onOpenModal, onGoHome }: QuickActionsCarouselProps) {
  const [page, setPage] = useState(0);
  const totalPages = 2;

  const handleAction = (action: string) => {
    if (action === "autofacturacion") {
      window.open("/autofacturacion", "_blank");
      return;
    }
    onOpenModal(action);
  };

  const pages = [
    [
      { id: "price-lookup", label: "Consultar precio", icon: Search, color: "var(--accent-strong)", shortcutLetter: "Q" as GlobalQuickActionLetter },
      { id: "bank-deposit", label: "Deposito Banco", icon: PiggyBank, color: "#0d9488", shortcutLetter: "G" as GlobalQuickActionLetter },
      { id: "cancel-sale", label: "Cancelar venta", icon: XCircle, color: "#dc2626", shortcutLetter: "N" as GlobalQuickActionLetter },
      { id: "returns", label: "Devoluciones", icon: RotateCcw, color: "#dc2626", shortcutLetter: "E" as GlobalQuickActionLetter },
    ],
    [
      { id: "ticket-history", label: "Reimprimir ticket", icon: Printer, color: "var(--accent-strong)", shortcutLetter: "H" as GlobalQuickActionLetter },
      { id: "partial-cut-summary", label: "Corte Parcial", icon: FileText, color: "#d97706", shortcutLetter: "U" as GlobalQuickActionLetter },
      { id: "autofacturacion", label: "Facturacion", icon: ExternalLink, color: "#0d9488", shortcutLetter: "I" as GlobalQuickActionLetter },
    ],
  ];

  const currentPageActions = pages[page];
  const allActions = pages.flat();

  return (
    <div className="pos-quick-actions-container">
      <div className="pos-quick-actions-header">
        <h4 className="pos-sidebar-title">ACCESOS RAPIDOS</h4>
      </div>

      <div className="pos-quick-actions-grid">
        {currentPageActions.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.id}
              onClick={() => handleAction(action.id)}
              className="pos-quick-action-btn active-tap"
              type="button"
              data-shortcut-letter={action.shortcutLetter}
              title={`${action.label} (Alt+${action.shortcutLetter})`}
            >
              <div className="pos-quick-action-icon-wrapper" style={{ color: action.color }}>
                <Icon size={20} />
              </div>
              <span className="pos-quick-action-label">{action.label}</span>
            </button>
          );
        })}
      </div>

      <div className="pos-carousel-controls">
        <button type="button" className="pos-carousel-arrow" onClick={() => setPage((prev) => Math.max(0, prev - 1))} disabled={page === 0} aria-label="Anterior">
          <ChevronLeft size={16} />
        </button>
        <span className="pos-carousel-indicator">
          {page + 1}/{totalPages}
        </span>
        <button type="button" className="pos-carousel-arrow" onClick={() => setPage((prev) => Math.min(totalPages - 1, prev + 1))} disabled={page === totalPages - 1} aria-label="Siguiente">
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="pos-quick-actions-footer" style={{ marginTop: "4px" }}>
        <button type="button" className="pos-carousel-link-btn pos-go-home-link" onClick={onGoHome}>
          <Home size={14} />
          <span>Ir a menu principal</span>
        </button>
      </div>
    </div>
  );
}
