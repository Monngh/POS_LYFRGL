import React, { useEffect, useState, useCallback } from "react";
import { X, Eye, Printer, Ban } from "lucide-react";
import api from "../../services/api";
import { normalizeIntegerInput, validateInteger, validateReference } from "../../utils/formValidation";
import {
  ui,
  type ViewProps,
  Toolbar,
  SearchInput,
  FilterSelect,
  Badge,
  TableState,
  SectionHeader,
  money,
  moneyExact,
  fmtDate,
  fmtTime,
  statusTone,
  payTone,
  printTicketHtml,
} from "./shared";

interface SaleRow {
  id: number;
  invoiceNumber: string;
  createdAt: string;
  branch: string;
  cajero: string;
  customer: string;
  items: number;
  totalAmount: number;
  paymentMethod: string;
  status: string;
}

interface SaleDetail {
  id: number;
  invoiceNumber: string;
  createdAt: string;
  branch: string;
  cajero: string;
  customer: string;
  paymentMethod: string;
  status: string;
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
  items: { sku: string; name: string; quantity: number; unitPrice: number; importe: number }[];
}

// Reimpresión: genera el ticket de la venta y abre el diálogo de impresión
const reprintTicket = (d: SaleDetail) => {
  const safe = (value: unknown) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  const body = `
    <div>
      <div class="ticket-header">
        <span class="ticket-store">LYFRGL POS</span>
        <span class="ticket-muted">Sucursal: ${safe(d.branch)}</span>
        <span class="ticket-operation">VENTA - REIMPRESION</span>
      </div>
      <div class="ticket-section">
        <div class="ticket-row"><span>Folio:</span><span class="ticket-value">${safe(d.invoiceNumber)}</span></div>
        <div class="ticket-row"><span>Fecha:</span><span class="ticket-value">${fmtDate(d.createdAt)} ${fmtTime(d.createdAt)}</span></div>
        <div class="ticket-row"><span>Cajero:</span><span class="ticket-value">${safe(d.cajero)}</span></div>
        <div class="ticket-row"><span>Cliente:</span><span class="ticket-value">${safe(d.customer || "Publico general")}</span></div>
        <div class="ticket-row"><span>Operacion:</span><span class="ticket-value">VENTA</span></div>
      </div>
      <div class="ticket-section">
        <table>
          <thead>
            <tr style="border-bottom:1px dashed #111111;">
              <th style="width:12%;text-align:left;padding-bottom:4px;">Cant</th>
              <th style="width:43%;text-align:left;padding-bottom:4px;">Descripcion</th>
              <th style="width:20%;text-align:right;padding-bottom:4px;">P.Unit</th>
              <th style="width:25%;text-align:right;padding-bottom:4px;">Importe</th>
            </tr>
          </thead>
          <tbody>
            ${d.items.map((it) => `
              <tr>
                <td style="text-align:left;padding:3px 2px 3px 0;">${Number(it.quantity)}</td>
                <td style="padding:3px 4px 3px 0;">${safe(it.name)}</td>
                <td style="text-align:right;padding:3px 4px 3px 0;">${moneyExact(it.unitPrice)}</td>
                <td style="text-align:right;padding:3px 0;">${moneyExact(it.importe)}</td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>
      <div class="ticket-section">
        <div class="ticket-row"><span>Subtotal:</span><span class="ticket-value">${moneyExact(d.subtotal)}</span></div>
        ${d.discountAmount > 0 ? `<div class="ticket-row"><span>Descuento:</span><span class="ticket-value">- ${moneyExact(d.discountAmount)}</span></div>` : ""}
        <div class="ticket-row"><span>Impuestos:</span><span class="ticket-value">${moneyExact(d.taxAmount)}</span></div>
        <div class="ticket-row ticket-total"><span>TOTAL:</span><span>${moneyExact(d.totalAmount)}</span></div>
        <div class="ticket-row"><span>Metodo pago:</span><span class="ticket-value">${safe(d.paymentMethod)}</span></div>
        <div class="ticket-row"><span>Estado:</span><span class="ticket-value">${safe(d.status)}</span></div>
      </div>
      <div class="ticket-footer">
        <p>GRACIAS POR SU COMPRA</p>
        <p>REGRESE PRONTO</p>
      </div>
    </div>
  `;
  printTicketHtml(`Ticket ${d.invoiceNumber}`, body);
};

const VentasView: React.FC<ViewProps> = ({ branchId, refreshToken }) => {
  const [rows, setRows] = useState<SaleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [detail, setDetail] = useState<SaleDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [showPinModal, setShowPinModal] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [cancelFieldErrors, setCancelFieldErrors] = useState<Partial<Record<"pin" | "reason", string>>>({});
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  // Validación del rango de fechas (YYYY-MM-DD se compara lexicográficamente)
  const dateError =
    dateFrom && dateTo && dateFrom > dateTo
      ? "La fecha «Desde» no puede ser posterior a «Hasta»."
      : null;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {};
      if (branchId !== "all") params.branchId = branchId;
      if (status !== "all") params.status = status;
      if (search.trim()) params.search = search.trim();
      // Aplica el rango solo si es válido; admite un solo extremo (Desde o Hasta)
      const invalidRange = Boolean(dateFrom && dateTo && dateFrom > dateTo);
      if (!invalidRange) {
        if (dateFrom) params.from = dateFrom;
        if (dateTo) params.to = dateTo;
      }
      const res = await api.get<{ sales: SaleRow[] }>("/api/admin/sales", { params });
      setRows(res.data.sales);
    } catch (err: any) {
      setError(err.response?.data?.message || "No se pudieron cargar las ventas.");
    } finally {
      setLoading(false);
    }
  }, [branchId, status, search, dateFrom, dateTo, refreshToken]);

  // Debounce de la búsqueda
  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  const openPinModal = () => {
    setPinInput("");
    setCancelReason("");
    setCancelFieldErrors({});
    setCancelError(null);
    setShowPinModal(true);
  };

  const closePinModal = () => {
    setShowPinModal(false);
    setPinInput("");
    setCancelReason("");
    setCancelFieldErrors({});
    setCancelError(null);
  };

  const handleCancelSale = async () => {
    if (!detail) return;
    const fieldErrors: Partial<Record<"pin" | "reason", string>> = {};
    const pinError = validateInteger(pinInput, "El PIN", { min: 0 });
    if (pinError || pinInput.length !== 4) fieldErrors.pin = "El PIN debe contener 4 digitos.";
    const reasonError = validateReference(cancelReason, "El motivo", { required: false, max: 180 });
    if (reasonError) fieldErrors.reason = reasonError;
    if (Object.keys(fieldErrors).length > 0) {
      setCancelFieldErrors(fieldErrors);
      setCancelError(null);
      return;
    }
    setCancelLoading(true);
    setCancelError(null);
    setCancelFieldErrors({});
    try {
      await api.post("/api/sales/authorize-cancel", {
        invoiceNumber: detail.invoiceNumber,
        pinCode: pinInput,
        reason: cancelReason.trim() || undefined,
      });
      closePinModal();
      setDetail(null);
      load();
    } catch (err: any) {
      const status = err.response?.status;
      if (status === 401) {
        setCancelError("PIN incorrecto. Solo ADMIN o GERENTE pueden cancelar ventas.");
      } else if (status === 400) {
        setCancelError(err.response?.data?.message || "La venta no se puede cancelar.");
      } else {
        setCancelError("Error al cancelar la venta. Intente de nuevo.");
      }
    } finally {
      setCancelLoading(false);
    }
  };

  const openDetail = async (id: number) => {
    setDetailLoading(true);
    setDetail(null);
    try {
      const res = await api.get<{ sale: SaleDetail }>(`/api/admin/sales/${id}`);
      setDetail(res.data.sale);
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div>
      <SectionHeader title="Ventas" subtitle="Historial de transacciones registradas en SQL Server" />

      <Toolbar>
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar por folio (V-...)" />
        <FilterSelect
          value={status}
          onChange={setStatus}
          options={[
            { value: "all", label: "Todos los estados" },
            { value: "COMPLETADA", label: "Completadas" },
            { value: "CANCELADA", label: "Canceladas" },
          ]}
        />
        <label style={inlineLabel}>Desde</label>
        <input
          type="date"
          value={dateFrom}
          max={dateTo || undefined}
          onChange={(e) => setDateFrom(e.target.value)}
          style={{ ...dateInputStyle, ...(dateError ? { borderColor: "#fca5a5" } : {}) }}
          title="Fecha inicial"
        />
        <label style={inlineLabel}>Hasta</label>
        <input
          type="date"
          value={dateTo}
          min={dateFrom || undefined}
          onChange={(e) => setDateTo(e.target.value)}
          style={{ ...dateInputStyle, ...(dateError ? { borderColor: "#fca5a5" } : {}) }}
          title="Fecha final"
        />
        {(dateFrom || dateTo) && (
          <button
            style={{ ...ui.ghostBtn, fontSize: 12, padding: "5px 10px", height: 32 }}
            onClick={() => { setDateFrom(""); setDateTo(""); }}
          >
            Limpiar fechas
          </button>
        )}
        {dateError && (
          <span style={{ color: "#b91c1c", fontSize: 12, fontWeight: 600 }}>{dateError}</span>
        )}
        <span style={{ marginLeft: "auto", fontSize: 13, color: "#64748b", fontWeight: 600 }}>
          {rows.length} registro{rows.length === 1 ? "" : "s"}
        </span>
      </Toolbar>

      <div style={{ ...ui.tableWrap, overflowX: "auto", overflowY: "auto", maxHeight: "62vh" }}>
        <table className="table-sticky-head" style={{ ...ui.table, minWidth: 1040 }}>
          <thead>
            <tr style={ui.theadRow}>
              <th style={ui.th}>Folio</th>
              <th style={ui.th}>Fecha</th>
              <th style={ui.th}>Sucursal</th>
              <th style={ui.th}>Cajero</th>
              <th style={ui.th}>Cliente</th>
              <th style={{ ...ui.th, textAlign: "center" }}>Artículos</th>
              <th style={ui.th}>Método</th>
              <th style={{ ...ui.th, textAlign: "right" }}>Total</th>
              <th style={{ ...ui.th, textAlign: "center" }}>Estado</th>
              <th style={{ ...ui.th, textAlign: "center" }}>Detalle</th>
            </tr>
          </thead>
          <tbody>
            <TableState colSpan={10} loading={loading} error={error} empty={!loading && rows.length === 0} />
            {!loading &&
              !error &&
              rows.map((s) => (
                <tr key={s.id}>
                  <td style={{ ...ui.td, fontWeight: 700, color: "#1e3a8a" }}>{s.invoiceNumber}</td>
                  <td style={ui.td}>
                    {fmtDate(s.createdAt)} <span style={{ color: "#94a3b8" }}>{fmtTime(s.createdAt)}</span>
                  </td>
                  <td style={ui.td}>{s.branch}</td>
                  <td style={ui.td}>{s.cajero}</td>
                  <td style={{ ...ui.td, color: s.customer === "Público General" ? "#94a3b8" : "#334155" }}>
                    {s.customer}
                  </td>
                  <td style={{ ...ui.td, textAlign: "center" }}>{s.items}</td>
                  <td style={ui.td}>
                    <Badge tone={payTone(s.paymentMethod)}>{s.paymentMethod}</Badge>
                  </td>
                  <td style={{ ...ui.td, textAlign: "right", fontWeight: 800, color: "#0f172a" }}>
                    {money(s.totalAmount)}
                  </td>
                  <td style={{ ...ui.td, textAlign: "center" }}>
                    <Badge tone={statusTone(s.status)}>{s.status}</Badge>
                  </td>
                  <td style={{ ...ui.td, textAlign: "center" }}>
                    <button style={ui.linkBtn} onClick={() => openDetail(s.id)} className="active-tap">
                      <Eye size={15} style={{ verticalAlign: "-2px" }} /> Ver
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Sub-modal: autorización por PIN para cancelar */}
      {showPinModal && detail && (
        <div style={{ ...ui.overlay, zIndex: 300 }} onClick={closePinModal}>
          <div style={{ ...ui.modal, maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
            <div style={ui.modalHeader}>
              <span style={ui.modalTitle}>Autorizar cancelación</span>
              <button style={ui.linkBtn} onClick={closePinModal}>
                <X size={18} color="#64748b" />
              </button>
            </div>
            <div style={ui.modalBody}>
              <p style={{ fontSize: 13, color: "#334155", marginBottom: 16, lineHeight: 1.5 }}>
                Venta <strong>{detail.invoiceNumber}</strong> — Esta acción es irreversible. Ingrese el PIN de
                supervisor o gerente para confirmar.
              </p>

              <div style={{ marginBottom: 14 }}>
                <label style={ui.fieldLabel}>PIN de autorización</label>
                <input
                  style={ui.input}
                  type="password"
                  placeholder="PIN"
                  value={pinInput}
                  onChange={(e) => {
                    const value = normalizeIntegerInput(e.target.value).slice(0, 4);
                    setPinInput(value);
                    setCancelFieldErrors((prev) => ({
                      ...prev,
                      pin: value.length === 4 ? "" : "El PIN debe contener 4 digitos.",
                    }));
                  }}
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && !cancelLoading && handleCancelSale()}
                />
                {cancelFieldErrors.pin && <p style={ui.fieldError}>{cancelFieldErrors.pin}</p>}
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={ui.fieldLabel}>Motivo (opcional)</label>
                <input
                  style={ui.input}
                  type="text"
                  placeholder="Ej. Error de captura"
                  value={cancelReason}
                  onChange={(e) => {
                    const value = e.target.value;
                    setCancelReason(value);
                    setCancelFieldErrors((prev) => ({
                      ...prev,
                      reason: validateReference(value, "El motivo", { required: false, max: 180 }) || "",
                    }));
                  }}
                />
                {cancelFieldErrors.reason && <p style={ui.fieldError}>{cancelFieldErrors.reason}</p>}
              </div>

              {cancelError && (
                <p style={{ fontSize: 12, color: "#dc2626", fontWeight: 600, marginBottom: 12 }}>{cancelError}</p>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                <button style={ui.ghostBtn} className="active-tap" onClick={closePinModal} disabled={cancelLoading}>
                  Cancelar
                </button>
                <button
                  style={{ ...ui.primaryBtn, backgroundColor: "#dc2626", opacity: cancelLoading ? 0.7 : 1 }}
                  className="active-tap"
                  onClick={handleCancelSale}
                  disabled={cancelLoading || !pinInput.trim()}
                >
                  {cancelLoading ? "Procesando..." : "Confirmar cancelación"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de detalle */}
      {(detail || detailLoading) && (
        <div style={ui.overlay} onClick={() => setDetail(null)}>
          <div style={{ ...ui.modal, maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <div style={ui.modalHeader}>
              <span style={ui.modalTitle}>{detailLoading ? "Cargando venta..." : `Venta ${detail?.invoiceNumber}`}</span>
              <button style={ui.linkBtn} onClick={() => setDetail(null)}>
                <X size={18} color="#64748b" />
              </button>
            </div>
            {detail && (
              <div style={ui.modalBody}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
                  <Info label="Fecha" value={`${fmtDate(detail.createdAt)} ${fmtTime(detail.createdAt)}`} />
                  <Info label="Estado" value={<Badge tone={statusTone(detail.status)}>{detail.status}</Badge>} />
                  <Info label="Sucursal" value={detail.branch} />
                  <Info label="Cajero" value={detail.cajero} />
                  <Info label="Cliente" value={detail.customer} />
                  <Info label="Método" value={<Badge tone={payTone(detail.paymentMethod)}>{detail.paymentMethod}</Badge>} />
                </div>

                <div style={{ ...ui.tableWrap, boxShadow: "none", marginBottom: 14 }}>
                <table style={ui.table}>
                  <thead>
                    <tr style={ui.theadRow}>
                      <th style={ui.th}>Producto</th>
                      <th style={{ ...ui.th, textAlign: "center" }}>Cant</th>
                      <th style={{ ...ui.th, textAlign: "right" }}>P. unit.</th>
                      <th style={{ ...ui.th, textAlign: "right" }}>Importe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.items.map((it, i) => (
                      <tr key={i}>
                        <td style={ui.td}>
                          <div style={{ fontWeight: 600 }}>{it.name}</div>
                          <div style={{ fontSize: 11, color: "#94a3b8" }}>{it.sku}</div>
                        </td>
                        <td style={{ ...ui.td, textAlign: "center" }}>{it.quantity}</td>
                        <td style={{ ...ui.td, textAlign: "right", color: "#64748b" }}>{moneyExact(it.unitPrice)}</td>
                        <td style={{ ...ui.td, textAlign: "right", fontWeight: 700 }}>{moneyExact(it.importe)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <Row label="Subtotal" value={moneyExact(detail.subtotal)} />
                  {detail.discountAmount > 0 && <Row label="Descuento" value={`- ${moneyExact(detail.discountAmount)}`} />}
                  <Row label="IVA (16%)" value={moneyExact(detail.taxAmount)} />
                  <div style={{ borderTop: "1px solid #e2e8f0", marginTop: 4, paddingTop: 8 }}>
                    <Row label="Total" value={moneyExact(detail.totalAmount)} strong />
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 20 }}>
                  {detail.status !== "CANCELADA" ? (
                    <button
                      style={{ ...ui.primaryBtn, backgroundColor: "#dc2626" }}
                      className="active-tap"
                      onClick={openPinModal}
                    >
                      <Ban size={15} /> Cancelar venta
                    </button>
                  ) : (
                    <span />
                  )}
                  <button style={ui.primaryBtn} className="active-tap" onClick={() => reprintTicket(detail)}>
                    <Printer size={15} /> Reimprimir ticket
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const inlineLabel: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "#64748b",
};

const dateInputStyle: React.CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  padding: "0 10px",
  height: 36,
  fontSize: 13,
  color: "#334155",
  fontFamily: "inherit",
  backgroundColor: "#ffffff",
  outline: "none",
  cursor: "pointer",
};

const Info: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div>
    <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.4px" }}>
      {label}
    </div>
    <div style={{ fontSize: 13, fontWeight: 600, color: "#334155", marginTop: 3 }}>{value}</div>
  </div>
);

const Row: React.FC<{ label: string; value: string; strong?: boolean }> = ({ label, value, strong }) => (
  <div style={{ display: "flex", justifyContent: "space-between", fontSize: strong ? 16 : 13 }}>
    <span style={{ color: strong ? "#0f172a" : "#64748b", fontWeight: strong ? 800 : 500 }}>{label}</span>
    <span style={{ color: strong ? "#1e3a8a" : "#334155", fontWeight: strong ? 800 : 700 }}>{value}</span>
  </div>
);

export default VentasView;
