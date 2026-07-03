import React, { useState, useEffect } from "react";
import { History } from "lucide-react";
import api from '../../../shared/services/api';
import {
  normalizeIntegerInput,
} from '../../../shared/utils/formValidation';
import { PosModal } from "./shared";

const maskPhone = (value: string | null | undefined): string => {
  const digits = (value || "").replace(/\D/g, "");
  if (!digits) return "";
  return `${"•".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
};

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


const inputGroup: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "6px",
  textAlign: "left",
};

const label: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: "700",
  color: "var(--text-secondary)",
  textTransform: "uppercase",
  letterSpacing: "0.5px",
};

const table: React.CSSProperties = {
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

  const renderFooter = () => (
    <div style={{ display: "flex", width: "100%" }}>
      <button
        title="Cerrar"
        onClick={onClose}
        style={{
          padding: "10px",
          borderRadius: "6px",
          border: "none",
          backgroundColor: "var(--text-muted)",
          color: "white",
          fontWeight: "700",
          cursor: "pointer",
          fontSize: "12px",
          textAlign: "center",
          flex: 1
        }}
      >
        CERRAR
      </button>
    </div>
  );

  return (
    <PosModal
      isOpen={isOpen}
      onClose={onClose}
      title="Reimprimir Ticket de Venta"
      subtitle="Seleccione la venta de la sucursal para reimprimir su comprobante."
      icon={<History size={24} />}
      iconColor="#2563eb"
      size="xl"
      footer={renderFooter()}
    >
      <div style={{ display: "flex", flexDirection: "column" }}>
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

        <div style={{ maxHeight: "40vh", overflowY: "auto", border: "1px solid var(--border)", borderRadius: "6px" }} className="pos-cashier-table-scroll pos-cashier-table-scroll--history">
          <style>{`
            @media (max-width: 1024px) {
              .pos-cashier-table-scroll--history { overflow-x: hidden; max-height: 50vh; padding: 4px 6px; }
              .pos-cashier-table-scroll--history table { width: 100%; border-collapse: collapse; min-width: 0; }
              .pos-cashier-table-scroll--history thead { display: none; }
              .pos-cashier-table-scroll--history tbody { display: block; }
              .pos-cashier-table-scroll--history tr { display: grid; grid-template-columns: 1fr 110px; grid-template-rows: auto auto; gap: 6px; align-items: center; padding: 10px 8px; border-bottom: 1px solid var(--surface-3); margin: 0; }
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
                  <td colSpan={4} style={{ textAlign: "center", padding: "16px", color: "var(--text-muted)", fontSize: "12px" }}>
                    No se encontraron ventas.
                  </td>
                </tr>
              ) : (
                filteredSales.map((sale) => (
                  <tr key={sale.id} style={tableRow}>
                    <td style={td}>
                      <div style={{ fontWeight: "600", color: "var(--text)" }}>{sale.invoiceNumber}</div>
                      <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>{new Date(sale.createdAt).toLocaleDateString()}</div>
                    </td>
                    <td style={{ ...td, fontSize: "11px" }}>
                      {sale.customerName ? (
                        <>
                          <div style={{ fontWeight: "600", color: "var(--text-secondary)" }}>Cliente registrado</div>
                          {sale.customerPhone && <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>Tel: {maskPhone(sale.customerPhone)}</div>}
                        </>
                      ) : (
                        <span style={{ color: "var(--text-faint)", fontStyle: "italic" }}>General</span>
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
      </div>
    </PosModal>
  );
}
