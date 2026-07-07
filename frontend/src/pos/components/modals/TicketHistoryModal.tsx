import React, { useState, useEffect } from "react";
import { History } from "lucide-react";
import api from '../../../shared/services/api';
import {
  normalizeIntegerInput,
} from '../../../shared/utils/formValidation';
import { PosModal } from "./shared";
import { openTicketPrintWindow } from "../../../shared/utils/ticketEmailDocument.util";

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
  const [activeTab, setActiveTab] = useState<"ventas" | "vales">("ventas");
  const [vales, setVales] = useState<any[]>([]);
  const [valesLoading, setValesLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = React.useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setTicketSearch("");
      setTicketCustomer("");
      setTicketPhone("");
      setTicketDateFrom("");
      setTicketDateTo("");
      setFilteredSales([]);
      setVales([]);
      setLocalError(null);
      setActiveTab("ventas");
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Reset selection when results change
  useEffect(() => { setSelectedIndex(0); }, [filteredSales.length]);

  // Focus the list container when results load so arrow keys work immediately
  useEffect(() => {
    if (filteredSales.length > 0 && listRef.current) {
      listRef.current.focus();
    }
  }, [filteredSales.length]);

  useEffect(() => {
    if (!isOpen) return;
    if (activeTab === "ventas") {
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
    } else {
      setValesLoading(true);
      api.get("/api/sales/store-credits")
        .then(res => {
          setVales(res.data.storeCredits || []);
        })
        .catch(err => {
          console.error("Error al buscar vales:", err);
        })
        .finally(() => {
          setValesLoading(false);
        });
    }
  }, [ticketSearch, ticketCustomer, ticketPhone, ticketDateFrom, ticketDateTo, activeTab, isOpen]);

  const filteredVales = vales.filter((v) => {
    if (ticketSearch.trim() && !v.code.toLowerCase().includes(ticketSearch.trim().toLowerCase())) {
      return false;
    }
    const custName = v.customer?.name || "Público General";
    if (ticketCustomer.trim() && !custName.toLowerCase().includes(ticketCustomer.trim().toLowerCase())) {
      return false;
    }
    const custPhone = v.customer?.phone || "";
    if (ticketPhone.trim() && !custPhone.includes(ticketPhone.trim())) {
      return false;
    }
    if (ticketDateFrom && new Date(v.createdAt) < new Date(ticketDateFrom + "T00:00:00")) {
      return false;
    }
    if (ticketDateTo && new Date(v.createdAt) > new Date(ticketDateTo + "T23:59:59")) {
      return false;
    }
    return true;
  });

  const buildStoreCreditReceiptHtml = (sc: any) => {
    const safe = (value: unknown) =>
      String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    const rows = [
      `<div class="ticket-row"><span>Codigo de vale:</span><span class="ticket-value">${safe(sc.code)}</span></div>`,
      `<div class="ticket-row"><span>Fecha creacion:</span><span class="ticket-value">${safe(new Date(sc.createdAt).toLocaleString())}</span></div>`,
      `<div class="ticket-row"><span>Cliente:</span><span class="ticket-value">${safe(sc.customer?.name || "Publico general")}</span></div>`,
      `<div class="ticket-row"><span>Estado:</span><span class="ticket-value">${sc.active ? "ACTIVO" : "INACTIVO / USADO"}</span></div>`,
    ];
    return `
      <div>
        <div class="ticket-header">
          <span class="ticket-store">LYFRGL POS</span>
          <span class="ticket-muted">Punto de Venta Corporativo</span>
          <span class="ticket-operation">VALE DE DEVOLUCIÓN</span>
        </div>
        <div class="ticket-section">
          ${rows.join("")}
        </div>
        <div class="ticket-section">
          <div class="ticket-row">
            <span>Monto Inicial:</span>
            <span>$${Number(sc.amount).toFixed(2)}</span>
          </div>
          <div class="ticket-row ticket-total">
            <span>Saldo Restante:</span>
            <span>$${Number(sc.remaining).toFixed(2)}</span>
          </div>
        </div>
        <div class="ticket-footer">
          <p>VALE GENERADO POR DEVOLUCIÓN</p>
          <p>Presente este ticket para aplicar su saldo a favor en su proxima compra.</p>
        </div>
      </div>
    `;
  };

  const handlePrintStoreCredit = (sc: any) => {
    const html = buildStoreCreditReceiptHtml(sc);
    const title = `Vale ${sc.code}`;
    const printed = openTicketPrintWindow(title, html);
    if (!printed) {
      alert("Habilite las ventanas emergentes para imprimir el vale.");
    }
  };

  if (!isOpen) return null;

  const safeIdx = filteredSales.length > 0 ? Math.min(selectedIndex, filteredSales.length - 1) : 0;

  const handleListKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (filteredSales.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, filteredSales.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      const active = document.activeElement;
      // Only trigger if not focused inside a text input
      if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) return;
      e.preventDefault();
      const selected = filteredSales[safeIdx];
      if (selected) triggerReprint(selected);
    }
  };

  const triggerReprint = async (sale: any) => {
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
  };

  const renderFooter = () => (
    <div style={{ display: "flex", width: "100%" }}>
      <button
        title="Cerrar (Esc)"
        data-shortcut="cancel"
        data-shortcut-letter="X"
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
            <label style={label}>{activeTab === "ventas" ? "Folio de Venta:" : "Código de Vale:"}</label>
            <input
              type="text"
              className="input-corporate"
              placeholder={activeTab === "ventas" ? "Buscar por folio de venta (V-XXXXXX)..." : "Buscar por código de vale (VALE-)..."}
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

        {/* Selector de pestañas */}
        <div style={{ display: "flex", borderBottom: "2px solid var(--border)", marginBottom: "16px" }} className="pos-cashier-dep-tabs">
          <button
            type="button"
            onClick={() => setActiveTab("ventas")}
            style={{
              flex: 1,
              padding: "10px",
              border: "none",
              borderBottom: activeTab === "ventas" ? "3px solid #2563eb" : "none",
              backgroundColor: "transparent",
              fontWeight: "700",
              color: activeTab === "ventas" ? "#2563eb" : "var(--text-muted)",
              cursor: "pointer",
            }}
          >
            VENTAS RECIENTES
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("vales")}
            style={{
              flex: 1,
              padding: "10px",
              border: "none",
              borderBottom: activeTab === "vales" ? "3px solid #2563eb" : "none",
              backgroundColor: "transparent",
              fontWeight: "700",
              color: activeTab === "vales" ? "#2563eb" : "var(--text-muted)",
              cursor: "pointer",
            }}
          >
            VALES GENERADOS
          </button>
        </div>

        {activeTab === "ventas" && filteredSales.length > 0 && (
          <p style={{ fontSize: "11px", color: "var(--text-muted)", margin: "0 0 4px 0" }}>
            ↑↓ seleccionar · Enter / Alt+C reimprimir
          </p>
        )}

        <div
          ref={listRef}
          style={{ maxHeight: "40vh", overflowY: "auto", border: "1px solid var(--border)", borderRadius: "6px", outline: "none" }}
          className="pos-cashier-table-scroll pos-cashier-table-scroll--history"
          tabIndex={-1}
          onKeyDown={handleListKeyDown}
        >
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
          {activeTab === "ventas" ? (
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
                  filteredSales.map((sale, index) => (
                    <tr
                      key={sale.id}
                      style={{
                        ...tableRow,
                        backgroundColor: index === safeIdx ? "var(--surface-2)" : "transparent",
                        cursor: "pointer",
                      }}
                      onClick={() => setSelectedIndex(index)}
                    >
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
                          onClick={(e) => { e.stopPropagation(); triggerReprint(sale); }}
                          className="btn-primary"
                          style={{ padding: "6px 10px", fontSize: "12px" }}
                          {...(index === safeIdx
                            ? {
                                "data-shortcut": "confirm",
                                "data-shortcut-letter": "C",
                                title: "Reimprimir (Enter, Alt+C)",
                              }
                            : { title: "Reimprimir" })}
                        >
                          Reimprimir
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : (
            <table style={table}>
              <thead>
                <tr style={tableHeaderRow}>
                  <th style={th}>Código / Fecha</th>
                  <th style={th}>Cliente / Tel</th>
                  <th style={{ ...th, textAlign: "right" }}>Saldo / Inicial</th>
                  <th style={{ ...th, textAlign: "center" }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {valesLoading ? (
                  <tr>
                    <td colSpan={4} style={{ textAlign: "center", padding: "16px", color: "var(--text-muted)", fontSize: "12px" }}>
                      Cargando vales...
                    </td>
                  </tr>
                ) : filteredVales.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ textAlign: "center", padding: "16px", color: "var(--text-muted)", fontSize: "12px" }}>
                      No se encontraron vales.
                    </td>
                  </tr>
                ) : (
                  filteredVales.map((vale) => (
                    <tr key={vale.id} style={tableRow}>
                      <td style={td}>
                        <div style={{ fontWeight: "700", color: "#7c3aed" }}>{vale.code}</div>
                        <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>{new Date(vale.createdAt).toLocaleDateString()}</div>
                      </td>
                      <td style={{ ...td, fontSize: "11px" }}>
                        <div style={{ fontWeight: "600", color: "var(--text-secondary)" }}>{vale.customer?.name || "Público General"}</div>
                        {vale.customer?.phone && <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>Tel: {maskPhone(vale.customer.phone)}</div>}
                      </td>
                      <td style={{ ...td, textAlign: "right" }}>
                        <div style={{ fontWeight: "700", color: vale.active ? "#166534" : "var(--text-muted)" }}>
                          ${Number(vale.remaining).toFixed(2)}
                        </div>
                        <div style={{ fontSize: "9px", color: "var(--text-muted)" }}>inicial: ${Number(vale.amount).toFixed(2)}</div>
                      </td>
                      <td style={{ ...td, textAlign: "center" }}>
                        <button
                          onClick={() => handlePrintStoreCredit(vale)}
                          className="btn-primary"
                          style={{ padding: "6px 10px", fontSize: "12px", backgroundColor: "#7c3aed", color: "white", border: "none", borderRadius: "4px", fontWeight: "bold", cursor: "pointer" }}
                        >
                          Reimprimir
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </PosModal>
  );
}
