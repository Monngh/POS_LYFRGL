import {
  Search,
  PiggyBank,
  XCircle,
  RotateCcw,
  Printer,
  FileText,
  ExternalLink,
  Home,
} from "lucide-react";
import { type GlobalQuickActionLetter } from "../constants/posShortcuts";

interface QuickActionsCarouselProps {
  onOpenModal: (modal: string) => void;
  onGoHome: () => void;
}

const ALL_ACTIONS = [
  { id: "price-lookup",        label: "Consultar precio",  icon: Search,       color: "#1e40af", shortcutLetter: "Q" as GlobalQuickActionLetter, shortcutLabel: "Alt+Q" },
  { id: "bank-deposit",        label: "Depósito banco",    icon: PiggyBank,    color: "#0d9488", shortcutLetter: "G" as GlobalQuickActionLetter, shortcutLabel: "Alt+G" },
  { id: "cancel-sale",         label: "Cancelar venta",    icon: XCircle,      color: "#b91c1c", shortcutLetter: "N" as GlobalQuickActionLetter, shortcutLabel: "Alt+N" },
  { id: "returns",             label: "Devoluciones",      icon: RotateCcw,    color: "#b91c1c", shortcutLetter: "E" as GlobalQuickActionLetter, shortcutLabel: "Alt+E" },
  { id: "ticket-history",      label: "Reimprimir ticket", icon: Printer,      color: "#1e40af", shortcutLetter: "H" as GlobalQuickActionLetter, shortcutLabel: "Alt+H" },
  { id: "partial-cut-summary", label: "Corte parcial",     icon: FileText,     color: "#d97706", shortcutLetter: "U" as GlobalQuickActionLetter, shortcutLabel: "Alt+U" },
  { id: "autofacturacion",     label: "Facturación",       icon: ExternalLink, color: "#0d9488", shortcutLetter: "I" as GlobalQuickActionLetter, shortcutLabel: "Alt+I" },
];

export function QuickActionsCarousel({ onOpenModal, onGoHome }: QuickActionsCarouselProps) {
  const handleAction = (action: string) => {
    if (action === "autofacturacion") {
      window.open("/autofacturacion", "_blank");
      return;
    }
    onOpenModal(action);
  };

  return (
    <div className="pos-quick-actions-container">
      <div className="pos-quick-actions-header">
        <h4 className="pos-sidebar-title">ACCESOS RÁPIDOS</h4>
      </div>

      <div className="pos-quick-actions-grid">
        {ALL_ACTIONS.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.id}
              onClick={() => handleAction(action.id)}
              className="pos-quick-action-btn active-tap"
              type="button"
              data-shortcut-letter={action.shortcutLetter}
              title={`${action.label} (${action.shortcutLabel})`}
            >
              <div className="pos-quick-action-icon-wrapper" style={{ color: action.color }}>
                <Icon size={16} />
              </div>
              <span className="pos-quick-action-label">{action.label}</span>
              <span className="pos-quick-action-shortcut">{action.shortcutLabel}</span>
            </button>
          );
        })}
      </div>

      <div className="pos-quick-actions-footer">
        <button type="button" className="pos-carousel-link-btn pos-go-home-link" onClick={onGoHome}>
          <Home size={12} />
          <span>Menú principal</span>
        </button>
      </div>
    </div>
  );
}
