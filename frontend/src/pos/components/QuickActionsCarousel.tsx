import {
  Search,
  PiggyBank,
  XCircle,
  RotateCcw,
  Printer,
  FileText,
  ExternalLink,
  Lock,
} from "lucide-react";
import { type GlobalQuickActionLetter } from "../constants/posShortcuts";

interface QuickActionsCarouselProps {
  onOpenModal: (modal: string) => void;
  onLock?: () => void;
}

const ALL_ACTIONS = [
  { id: "price-lookup",        label: "Consultar precio",  icon: Search,       shortcutLetter: "Q" as GlobalQuickActionLetter, shortcutLabel: "Alt+Q" },
  { id: "bank-deposit",        label: "Depósito banco",    icon: PiggyBank,    shortcutLetter: "G" as GlobalQuickActionLetter, shortcutLabel: "Alt+G" },
  { id: "cancel-sale",         label: "Cancelar venta",    icon: XCircle,      shortcutLetter: "N" as GlobalQuickActionLetter, shortcutLabel: "Alt+N" },
  { id: "returns",             label: "Devoluciones",      icon: RotateCcw,    shortcutLetter: "D" as GlobalQuickActionLetter, shortcutLabel: "Alt+D" },
  { id: "ticket-history",      label: "Reimprimir ticket", icon: Printer,      shortcutLetter: "H" as GlobalQuickActionLetter, shortcutLabel: "Alt+H" },
  { id: "partial-cut-summary", label: "Corte parcial",     icon: FileText,     shortcutLetter: "U" as GlobalQuickActionLetter, shortcutLabel: "Alt+U" },
  { id: "autofacturacion",     label: "Facturación",       icon: ExternalLink, shortcutLetter: "I" as GlobalQuickActionLetter, shortcutLabel: "Alt+I" },
  { id: "lock-screen",         label: "Bloquear caja",     icon: Lock,         shortcutKey: "F10", shortcutLabel: "F10" },
];

export function QuickActionsCarousel({ onOpenModal, onLock }: QuickActionsCarouselProps) {
  const handleAction = (action: string) => {
    if (action === "autofacturacion") {
      window.open("/autofacturacion", "_blank");
      return;
    }
    if (action === "lock-screen") {
      if (onLock) onLock();
      return;
    }
    onOpenModal(action);
  };

  return (
    <div className="pos-quick-actions-container" style={{ padding: "10px 0" }}>

      <div className="pos-quick-actions-bar" style={{ display: "flex", flexDirection: "column", gap: "10px", alignItems: "center" }}>
        {ALL_ACTIONS.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.id}
              onClick={() => handleAction(action.id)}
              className="pos-quick-action-icon-btn active-tap"
              type="button"
              data-shortcut-letter={"shortcutLetter" in action ? action.shortcutLetter : undefined}
              data-shortcut-key={"shortcutKey" in action ? action.shortcutKey : undefined}
              title={`${action.label} (${action.shortcutLabel})`}
              style={{
                width: "58px",
                height: "58px",
                borderRadius: "8px",
                border: "1px solid var(--pos-border)",
                backgroundColor: "var(--pos-surface)",
                color: "var(--pos-text-muted)",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                alignItems: "center",
                cursor: "pointer",
                transition: "all 0.2s",
                position: "relative"
              }}
            >
              <Icon size={20} style={{ marginBottom: "2px" }} />
              <span style={{ fontSize: "8px", fontWeight: "700", textAlign: "center", lineHeight: "1" }}>{action.label}</span>
              <span className="pos-fkey-badge" style={{ position: "absolute", bottom: "-4px", right: "-4px", fontSize: "8px", padding: "1px 3px" }}>
                {action.shortcutLabel}
              </span>
            </button>
          );
        })}
      </div>

    </div>
  );
}
