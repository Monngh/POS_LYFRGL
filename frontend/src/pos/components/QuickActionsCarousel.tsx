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
    } else {
      onOpenModal(action);
    }
  };

  const pages = [
    // Page 1
    [
      { id: "price-lookup", label: "Consultar precio", icon: Search, color: "var(--accent-strong)" },
      { id: "bank-deposit", label: "Depósito Banco", icon: PiggyBank, color: "#0d9488" },
      { id: "cancel-sale", label: "Cancelar venta", icon: XCircle, color: "#dc2626" },
      { id: "returns", label: "Devoluciones", icon: RotateCcw, color: "#dc2626" },
    ],
    // Page 2
    [
      { id: "ticket-history", label: "Reimprimir ticket", icon: Printer, color: "var(--accent-strong)" },
      { id: "partial-cut-summary", label: "Corte Parcial", icon: FileText, color: "#d97706" },
      { id: "autofacturacion", label: "Facturación", icon: ExternalLink, color: "#0d9488" },
    ],
  ];

  const currentPageActions = pages[page];

  return (
    <div className="pos-quick-actions-container">
      <div className="pos-quick-actions-header">
        <h4 className="pos-sidebar-title">ACCESOS RÁPIDOS</h4>
        <div className="pos-carousel-controls">
          <button
            type="button"
            className="pos-carousel-arrow"
            onClick={() => setPage((prev) => Math.max(0, prev - 1))}
            disabled={page === 0}
            aria-label="Anterior"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="pos-carousel-indicator">
            {page + 1}/{totalPages}
          </span>
          <button
            type="button"
            className="pos-carousel-arrow"
            onClick={() => setPage((prev) => Math.min(totalPages - 1, prev + 1))}
            disabled={page === totalPages - 1}
            aria-label="Siguiente"
          >
            <ChevronRight size={16} />
          </button>
        </div>
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
            >
              <div className="pos-quick-action-icon-wrapper" style={{ color: action.color }}>
                <Icon size={20} />
              </div>
              <span className="pos-quick-action-label">{action.label}</span>
            </button>
          );
        })}
      </div>

      <div className="pos-quick-actions-footer">
        {page === 0 ? (
          <button
            type="button"
            className="pos-carousel-link-btn"
            onClick={() => setPage(1)}
          >
            Ver más acciones &gt;
          </button>
        ) : (
          <button
            type="button"
            className="pos-carousel-link-btn"
            onClick={() => setPage(0)}
          >
            &lt; Regresar
          </button>
        )}
      </div>

      {/* Link to main dashboard */}
      <div className="pos-quick-actions-footer" style={{ marginTop: "4px" }}>
        <button
          type="button"
          className="pos-carousel-link-btn pos-go-home-link"
          onClick={onGoHome}
        >
          <Home size={14} />
          <span>Ir a menú principal</span>
        </button>
      </div>
    </div>
  );
}
