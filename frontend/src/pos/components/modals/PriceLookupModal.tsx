import React from "react";

interface LookupProduct {
  id: number;
  name: string;
  sellPrice: number;
  stock: number;
}

interface PriceLookupModalProps {
  isOpen: boolean;
  onClose: () => void;
  lookupQuery: string;
  onQueryChange: (value: string) => void;
  lookupResults: LookupProduct[];
  onLookupKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

const modalOverlay: React.CSSProperties = {
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: "rgba(15, 23, 42, 0.4)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  zIndex: 100,
};

const lookupModal: React.CSSProperties = {
  width: "480px",
  backgroundColor: "var(--surface)",
  borderRadius: "12px",
  padding: "24px",
  boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)",
  display: "flex",
  flexDirection: "column",
  gap: "14px",
};

const modalTitle: React.CSSProperties = {
  fontSize: "16px",
  fontWeight: "800",
  color: "var(--text)",
  borderBottom: "1px solid var(--border)",
  paddingBottom: "8px",
};

const inputGroup: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "6px",
  textAlign: "left",
};

const labelStyle: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: "700",
  color: "var(--text-secondary)",
  textTransform: "uppercase",
  letterSpacing: "0.5px",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  textAlign: "left",
};

const tableHeaderRow: React.CSSProperties = {
  borderBottom: "2px solid var(--border)",
};

const th: React.CSSProperties = {
  padding: "10px 12px",
  fontSize: "11px",
  fontWeight: "700",
  color: "var(--text-secondary)",
  textTransform: "uppercase",
};

const tableRow: React.CSSProperties = {
  borderBottom: "1px solid var(--surface-3)",
};

const td: React.CSSProperties = {
  padding: "12px",
  fontSize: "13px",
  color: "var(--text-secondary)",
};

const modalBtn: React.CSSProperties = {
  flex: 1,
  padding: "10px",
  borderRadius: "6px",
  border: "none",
  fontWeight: "700",
  cursor: "pointer",
  textAlign: "center",
};

export default function PriceLookupModal({
  isOpen,
  onClose,
  lookupQuery,
  onQueryChange,
  lookupResults,
  onLookupKeyDown,
}: PriceLookupModalProps) {
  if (!isOpen) return null;

  return (
    <div style={modalOverlay} className="pos-cashier-modal-overlay pos-cashier-modal-overlay--center">
      <div style={lookupModal} className="pos-cashier-modal">
        <h3 style={modalTitle}>Búsqueda de productos:</h3>
        <div style={inputGroup}>
          <label style={labelStyle}>Buscar:</label>
          <input
            type="text"
            className="input-corporate"
            placeholder="Nombre o id del producto"
            value={lookupQuery}
            onKeyDown={onLookupKeyDown}
            onChange={(e) => onQueryChange(e.target.value)}
          />
        </div>

        <div style={{ maxHeight: "240px", overflowX: "auto", overflowY: "auto", marginTop: "14px", border: "1px solid var(--border)", borderRadius: "6px" }} className="pos-cashier-inline-table-scroll">
          <table style={tableStyle}>
            <thead>
              <tr style={tableHeaderRow}>
                <th style={th}>Producto</th>
                <th style={th}>Precio</th>
                <th style={th}>Existencia</th>
              </tr>
            </thead>
            <tbody>
              {lookupResults.map((p) => (
                <tr key={p.id} style={tableRow}>
                  <td style={td}>{p.name}</td>
                  <td style={td}>${p.sellPrice.toFixed(2)}</td>
                  <td style={td}>{p.stock}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: "flex", gap: "10px", marginTop: "20px" }} className="pos-cashier-modal-actions">
          <button onClick={onClose} style={{ ...modalBtn, backgroundColor: "#dc2626", color: "white" }}>
            CANCELAR
          </button>
          <button onClick={onClose} style={{ ...modalBtn, backgroundColor: "#059669", color: "white" }}>
            ACEPTAR
          </button>
        </div>
      </div>
    </div>
  );
}
