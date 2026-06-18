import React, { useState, useEffect } from "react";
import api from "../../../services/api";
import {
  normalizeIntegerInput,
} from "../../../utils/formValidation";

const validateFolioInput = (value: string): string =>
  value
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, "")
    .replace(/[^a-zA-Z0-9\-]/g, "");

const validateNameInput = (value: string): string =>
  value
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, "")
    .replace(/[^a-záéíóúàèìòùäëïöüâêîôûñçA-ZÁÉÍÓÚÀÈÌÒÙÄËÏÖÜÂÊÎÔÛÑÇ\s]/g, "");

interface TicketHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSale: (sale: any) => void;
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

const historyModal: React.CSSProperties = {
  width: "520px",
  maxWidth: "95vw",
  backgroundColor: "#ffffff",
  borderRadius: "12px",
  padding: "24px",
  boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)",
};

const modalTitle: React.CSSProperties = {
  fontSize: "16px",
  fontWeight: "800",
  color: "#0f172a",
  borderBottom: "1px solid #e2e8f0",
  paddingBottom: "8px",
};

const inputGroup: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "6px",
  textAlign: "left",
};

const label: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: "700",
  color: "#475569",
  textTransform: "uppercase",
  letterSpacing: "0.5px",
};

const table: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  textAlign: "left",
};

const tableHeaderRow: React.CSSProperties = {
  borderBottom: "2px solid #e2e8f0",
};

const th: React.CSSProperties = {
  padding: "10px 12px",
  fontSize: "11px",
  fontWeight: "700",
  color: "#475569",
  textTransform: "uppercase",
};

const tableRow: React.CSSProperties = {
  borderBottom: "1px solid #f1f5f9",
};

const td: React.CSSProperties = {
  padding: "12px",
  fontSize: "13px",
  color: "#334155",
};

const submitBtn: React.CSSProperties = {
  backgroundColor: "#2563eb",
  color: "#ffffff",
  border: "none",
  padding: "12px",
  borderRadius: "6px",
  fontWeight: "700",
  cursor: "pointer",
  boxShadow: "0 4px 6px rgba(37,99,235,0.15)",
};

export default function TicketHistoryModal({
  isOpen,
  onClose,
  onSelectSale,
}: TicketHistoryModalProps) {
  const [ticketSearch, setTicketSearch] = useState("");
  const [ticketCustomer, setTicketCustomer] = useState("");
  const [ticketPhone, setTicketPhone] = useState("");
  const [ticketDateFrom, setTicketDateFrom] = useState("");
  const [ticketDateTo, setTicketDateTo] = useState("");
  const [filteredSales, setFilteredSales] = useState<any[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setTicketSearch("");
      setTicketCustomer("");
      setTicketPhone("");
      setTicketDateFrom("");
      setTicketDateTo("");
      setFilteredSales([]);
      setLocalError(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(async () => {
      try {
        const params: any = {};
        if (ticketSearch.trim()) params.search = ticketSearch.trim();
        if (ticketCustomer.trim()) params.customer = ticketCustomer.trim();
        if (ticketPhone.trim()) params.phone = ticketPhone.trim();
        if (ticketDateFrom) params.dateFrom = ticketDateFrom;
        if (ticketDateTo) params.dateTo = ticketDateTo;
        const res = await api.get("/api/sales/my-recent", { params });
        setFilteredSales(res.data.sales || []);
      } catch (err) {
        console.error("Error al buscar tickets:", err);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [ticketSearch, ticketCustomer, ticketPhone, ticketDateFrom, ticketDateTo, isOpen]);

  if (!isOpen) return null;

  return (
    <div style={modalOverlay} className="pos-cashier-modal-overlay pos-cashier-modal-overlay--center">
      <div style={historyModal} className="pos-cashier-modal">
        <h3 style={modalTitle}>Reimprimir Ticket de Venta:</h3>
        <p style={{ fontSize: "12px", color: "#64748b", marginBottom: "14px" }}>Seleccione la venta de la sucursal para reimprimir su comprobante.</p>

        {localError && (
          <p style={{ fontSize: "12px", color: "#dc2626", fontWeight: "600", marginBottom: "10px" }}>
            {localError}
          </p>
        )}

        {/* Grid de Filtros */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "12px" }} className="pos-cashier-grid-2">
          <div style={{ ...inputGroup, gridColumn: "span 2" }}>
            <label style={label}>Folio de Venta:</label>
            <input
              type="text"
              className="input-corporate"
              placeholder="Buscar por folio de venta (V-XXXXXX)..."
              value={ticketSearch}
              onChange={(e) => setTicketSearch(validateFolioInput(e.target.value).toUpperCase())}
            />
          </div>
          <div style={inputGroup}>
            <label style={label}>Cliente (Nombre):</label>
            <input
              type="text"
              className="input-corporate"
              placeholder="Coincidencia parcial..."
              value={ticketCustomer}
              onChange={(e) => setTicketCustomer(validateNameInput(e.target.value))}
            />
          </div>
          <div style={inputGroup}>
            <label style={label}>Teléfono:</label>
            <input
              type="text"
              className="input-corporate"
              placeholder="Coincidencia parcial..."
              value={ticketPhone}
              onChange={(e) => setTicketPhone(normalizeIntegerInput(e.target.value).slice(0, 10))}
            />
          </div>
          <div style={inputGroup}>
            <label style={label}>Desde:</label>
            <input
              type="date"
              className="input-corporate"
              value={ticketDateFrom}
              onChange={(e) => setTicketDateFrom(e.target.value)}
            />
          </div>
          <div style={inputGroup}>
            <label style={label}>Hasta:</label>
            <input
              type="date"
              className="input-corporate"
              value={ticketDateTo}
              onChange={(e) => setTicketDateTo(e.target.value)}
            />
          </div>
        </div>

        <div style={{ maxHeight: "240px", overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: "6px" }} className="pos-cashier-table-scroll pos-cashier-table-scroll--history">
          <style>{`
            @media (max-width: 1024px) {
              .pos-cashier-table-scroll--history { overflow-x: hidden; max-height: 60vh; padding: 4px 6px; }
              .pos-cashier-table-scroll--history table { width: 100%; border-collapse: collapse; min-width: 0; }
              .pos-cashier-table-scroll--history thead { display: none; }
              .pos-cashier-table-scroll--history tbody { display: block; }
              .pos-cashier-table-scroll--history tr { display: grid; grid-template-columns: 1fr 110px; grid-template-rows: auto auto; gap: 6px; align-items: center; padding: 10px 8px; border-bottom: 1px solid #f1f5f9; margin: 0; }
              .pos-cashier-table-scroll--history td { display: block; padding: 0; vertical-align: top; box-sizing: border-box; min-width: 0; word-break: break-word; white-space: normal; }
              .pos-cashier-table-scroll--history td:nth-child(1) { grid-column: 1 / 2; grid-row: 1 / 2; font-weight: 600; color: #0f172a; }
              .pos-cashier-table-scroll--history td:nth-child(2) { grid-column: 1 / 2; grid-row: 2 / 3; color: #64748b; font-size: 12px; }
              .pos-cashier-table-scroll--history td:nth-child(3) { grid-column: 2 / 3; grid-row: 1 / 2; text-align: right; font-weight: 700; color: #0f172a; }
              .pos-cashier-table-scroll--history td:nth-child(4) { grid-column: 2 / 3; grid-row: 2 / 3; display: flex; justify-content: flex-end; }
              .pos-cashier-table-scroll--history .btn-primary { padding: 6px 10px; font-size: 12px; white-space: nowrap; }
              .pos-cashier-table-scroll--history, .pos-cashier-table-scroll--history table, .pos-cashier-table-scroll--history tbody, .pos-cashier-table-scroll--history tr, .pos-cashier-table-scroll--history td { box-sizing: border-box; }
            }
          `}</style>
          <table style={table}>
            <thead>
              <tr style={tableHeaderRow}>
                <th style={th}>Folio / Fecha</th>
                <th style={th}>Cliente / Tel</th>
                <th style={{ ...th, textAlign: "right" }}>Total</th>
                <th style={{ ...th, textAlign: "center" }}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {filteredSales.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: "center", padding: "16px", color: "#64748b", fontSize: "12px" }}>
                    No se encontraron ventas.
                  </td>
                </tr>
              ) : (
                filteredSales.map((sale) => (
                  <tr key={sale.id} style={tableRow}>
                    <td style={td}>
                      <div style={{ fontWeight: "600", color: "#0f172a" }}>{sale.invoiceNumber}</div>
                      <div style={{ fontSize: "10px", color: "#64748b" }}>{new Date(sale.createdAt).toLocaleDateString()}</div>
                    </td>
                    <td style={{ ...td, fontSize: "11px" }}>
                      {sale.customerName ? (
                        <>
                          <div style={{ fontWeight: "600", color: "#334155" }}>{sale.customerName}</div>
                          {sale.customerPhone && <div style={{ fontSize: "10px", color: "#64748b" }}>{sale.customerPhone}</div>}
                        </>
                      ) : (
                        <span style={{ color: "#94a3b8", fontStyle: "italic" }}>General</span>
                      )}
                    </td>
                    <td style={{ ...td, textAlign: "right", fontWeight: "700" }}>
                      ${sale.totalAmount.toFixed(2)}
                    </td>
                    <td style={{ ...td, textAlign: "center" }}>
                      <button
                        onClick={async () => {
                          setLocalError(null);
                          try {
                            const res = await api.get(`/api/sales/detail?id=${sale.id}`);
                            onSelectSale({
                              ...res.data.sale,
                              refundStatus: sale.refundStatus,
                              isNewSale: false,
                            });
                          } catch (e: any) {
                            setLocalError(e.response?.data?.message || "Error al recuperar los detalles de la venta.");
                          }
                        }}
                        className="btn-primary"
                        style={{ padding: "6px 10px", fontSize: "12px" }}
                      >
                        Reimprimir
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <button onClick={onClose} style={{ ...submitBtn, backgroundColor: "#64748b", marginTop: "14px", width: "100%" }}>
          Cerrar
        </button>
      </div>
    </div>
  );
}
