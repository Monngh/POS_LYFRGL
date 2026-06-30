import { X, Clock, ShoppingCart, Trash2 } from "lucide-react";
import type { ParkedSale } from "../../hooks/useParkedSales";

interface ParkedSalesModalProps {
  isOpen: boolean;
  onClose: () => void;
  parkedSales: ParkedSale[];
  loading: boolean;
  onRecover: (sale: ParkedSale) => void;
  onDelete: (id: number) => void;
}

const styles = {
  overlay: {
    position: "fixed" as const,
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
  },
  modal: {
    backgroundColor: "var(--surface)",
    padding: "24px",
    borderRadius: "8px",
    width: "500px",
    maxWidth: "90vw",
    maxHeight: "80vh",
    display: "flex",
    flexDirection: "column" as const,
    gap: "16px",
    boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottom: "1px solid var(--border)",
    paddingBottom: "12px",
  },
  title: {
    fontSize: "18px",
    fontWeight: "700",
    color: "var(--text)",
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  closeBtn: {
    background: "none",
    border: "none",
    cursor: "pointer",
    color: "var(--text-muted)",
  },
  list: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "12px",
    overflowY: "auto" as const,
    flex: 1,
  },
  card: {
    border: "1px solid var(--border-strong)",
    borderRadius: "6px",
    padding: "16px",
    backgroundColor: "var(--surface-2)",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardInfo: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "4px",
  },
  time: {
    fontSize: "12px",
    color: "var(--text-secondary)",
    display: "flex",
    alignItems: "center",
    gap: "4px",
  },
  customer: {
    fontSize: "14px",
    fontWeight: "600",
    color: "var(--text)",
  },
  total: {
    fontSize: "16px",
    fontWeight: "800",
    color: "var(--accent-strong)",
  },
  actions: {
    display: "flex",
    gap: "8px",
  },
  recoverBtn: {
    backgroundColor: "var(--accent)",
    color: "#fff",
    border: "none",
    padding: "8px 16px",
    borderRadius: "4px",
    cursor: "pointer",
    fontWeight: "700",
    fontSize: "13px",
  },
  deleteBtn: {
    backgroundColor: "transparent",
    color: "#dc2626",
    border: "1px solid #dc2626",
    padding: "8px",
    borderRadius: "4px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  empty: {
    textAlign: "center" as const,
    color: "var(--text-muted)",
    padding: "32px 0",
    fontSize: "14px",
  }
};

export function ParkedSalesModal({ isOpen, onClose, parkedSales, loading, onRecover, onDelete }: ParkedSalesModalProps) {
  if (!isOpen) return null;

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <h3 style={styles.title}>
            <Clock size={20} /> Ventas en Espera
          </h3>
          <button onClick={onClose} style={styles.closeBtn}><X size={24} /></button>
        </div>

        <div style={styles.list}>
          {loading && parkedSales.length === 0 ? (
            <p style={{ textAlign: "center", padding: "20px" }}>Cargando...</p>
          ) : parkedSales.length === 0 ? (
            <div style={styles.empty}>
              <ShoppingCart size={32} style={{ opacity: 0.5, marginBottom: "8px" }} />
              <p>No tienes ninguna venta en espera.</p>
            </div>
          ) : (
            parkedSales.map(sale => {
              const date = new Date(sale.createdAt);
              const timeString = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              
              // Intentar leer cuántos items hay en el JSON
              let itemsCount = 0;
              try {
                const cart = JSON.parse(sale.cartData);
                itemsCount = Array.isArray(cart) ? cart.length : 0;
              } catch (e) {}

              return (
                <div key={sale.id} style={styles.card}>
                  <div style={styles.cardInfo}>
                    <span style={styles.time}><Clock size={12} /> {timeString}</span>
                    <span style={styles.customer}>{sale.customer?.name || "Público en General"}</span>
                    <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{itemsCount} artículos</span>
                    <span style={styles.total}>${Number(sale.total).toFixed(2)}</span>
                  </div>
                  <div style={styles.actions}>
                    <button style={styles.deleteBtn} onClick={() => onDelete(sale.id)} title="Eliminar">
                      <Trash2 size={16} />
                    </button>
                    <button style={styles.recoverBtn} onClick={() => onRecover(sale)}>
                      RECUPERAR
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
