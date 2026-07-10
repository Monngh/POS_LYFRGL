import { useState } from "react";
import { Keyboard, ChevronDown, ChevronUp } from "lucide-react";

const SHORTCUTS = [
  { key: "F2",     label: "Buscar producto"    },
  { key: "F3",     label: "Calculadora cambio" },
  { key: "F4",     label: "Cobrar"             },
  { key: "F6",     label: "Buscar cliente"     },
  { key: "F7",     label: "Ocultar panel"      },
  { key: "F10",    label: "Bloquear pantalla"  },
  { key: "Alt+B",  label: "Buscar producto"    },
  { key: "Alt+V",  label: "Cancelar compra"    },
  { key: "Alt+P",  label: "Pausar venta"       },
  { key: "Alt+Q",  label: "Consultar precio"   },
  { key: "Alt+E",  label: "Devolución"         },
  { key: "Alt+H",  label: "Historial tickets"  },
  { key: "Alt+L",  label: "Cerrar sesión"      },
  { key: "Alt+K",  label: "Ventas pausadas"    },
];

export function ShortcutsHelpPanel() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="pos-shortcuts-panel">
      <button
        type="button"
        className="pos-shortcuts-toggle"
        onClick={() => setIsOpen(!isOpen)}
        data-shortcut-key="F12"
        title="Panel de atajos (F12)"
        aria-expanded={isOpen}
      >
        <Keyboard size={12} />
        <span>Atajos de teclado</span>
        {isOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
      </button>

      {isOpen && (
        <div className="pos-shortcuts-grid">
          {SHORTCUTS.map(({ key, label }) => (
            <div key={key} className="pos-shortcut-item">
              <kbd className="pos-kbd">{key}</kbd>
              <span className="pos-shortcut-desc">{label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
