import React, { useEffect, useState, useCallback } from "react";
import { X, Eye, Printer, Ban, ChevronDown, ChevronUp } from "lucide-react";
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
  useMediaQuery,
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
  const isMobile = useMediaQuery("(max-width: 1024px)");
  const [expandedSales, setExpandedSales] = useState<Record<number, boolean>>({});
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

  const toggleExpand = (id: number) => {
    setExpandedSales((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

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
        <span style={{ marginLeft: "auto", fontSize: 13, color: "var(--text-muted)", fontWeight: 600 }}>
          {rows.length} registro{rows.length === 1 ? "" : "s"}
        </span>
      </Toolbar>

      {isMobile ? (
        <div style={{ ...ui.tableWrap, overflowX: "auto", overflowY: "auto", maxHeight: "62vh" }}>
          <div style={{ padding: "8px 16px" }}>
            {/* Cabecera de columnas */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "1.5fr 2.5fr 1.5fr 1.5fr",
              padding: "12px 16px",
              fontWeight: 700,
              fontSize: 11,
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.4px"
            }}>
              <div>Folio</div>
              <div>Fecha</div>
              <div>Precio</div>
              <div style={{ textAlign: "right", paddingRight: 8 }}>Mas</div>
            </div>

            {loading && (
              <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--text-faint)", fontSize: 13, fontWeight: 500 }}>
                Cargando información...
              </div>
            )}
            {error && (
              <div style={{ textAlign: "center", padding: "32px 16px", color: "#b91c1c", fontSize: 13, fontWeight: 500 }}>
                {error}
              </div>
            )}
            {!loading && !error && rows.length === 0 && (
              <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--text-faint)", fontSize: 13, fontWeight: 500 }}>
                No hay registros para mostrar.
              </div>
            )}

            {!loading &&
              !error &&
              rows.map((s) => {
                const isExpanded = expandedSales[s.id];
                const formattedMethod = s.paymentMethod ? (s.paymentMethod.charAt(0).toUpperCase() + s.paymentMethod.slice(1).toLowerCase()) : "";
                const formattedStatus = s.status ? (s.status.charAt(0).toUpperCase() + s.status.slice(1).toLowerCase()) : "";
                return (
                  <div
                    key={s.id}
                    style={{
                      backgroundColor: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                      marginBottom: 10,
                      boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
                      overflow: "hidden",
                    }}
                  >
                    {/* Encabezado del registro con Sucursal y Cajero */}
                    <div style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "8px 16px 6px 16px",
                      fontSize: 11,
                      fontWeight: 700,
                      color: "var(--text-muted)",
                      borderBottom: "1px solid var(--surface-3)",
                      backgroundColor: "var(--surface-2)",
                      letterSpacing: "0.2px"
                    }}>
                      <span>{s.branch.toUpperCase()}</span>
                      <span>CAJERO: {s.cajero.toUpperCase()}</span>
                    </div>

                    {/* Fila base */}
                    <div style={{
                      display: "grid",
                      gridTemplateColumns: "1.5fr 2.5fr 1.5fr 1.5fr",
                      padding: "12px 16px",
                      alignItems: "center",
                    }}>
                      {/* Folio */}
                      <div>
                        <button
                          onClick={() => openDetail(s.id)}
                          style={{
                            background: "none",
                            border: "none",
                            color: "#2563eb",
                            fontWeight: 700,
                            cursor: "pointer",
                            padding: 0,
                            fontSize: 13,
                            textAlign: "left",
                          }}
                          className="active-tap"
                        >
                          {s.invoiceNumber}
                        </button>
                      </div>

                      {/* Fecha */}
                      <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                        <div>{fmtDate(s.createdAt)}</div>
                        <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 2 }}>{fmtTime(s.createdAt)}</div>
                      </div>

                      {/* Precio */}
                      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
                        {money(s.totalAmount)}
                      </div>

                      {/* Acciones (MAS) */}
                      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, alignItems: "center" }}>
                        <button
                          onClick={() => toggleExpand(s.id)}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: "var(--surface)",
                            border: "1px solid var(--border-strong)",
                            borderRadius: 8,
                            width: 34,
                            height: 34,
                            cursor: "pointer",
                            color: "var(--text-muted)",
                            padding: 0,
                          }}
                          className="active-tap"
                        >
                          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>
                        <button
                          onClick={() => openDetail(s.id)}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: "var(--surface)",
                            border: "1px solid var(--border-strong)",
                            borderRadius: 8,
                            width: 34,
                            height: 34,
                            cursor: "pointer",
                            color: "var(--text-muted)",
                            padding: 0,
                          }}
                          className="active-tap"
                        >
                          <Eye size={16} />
                        </button>
                      </div>
                    </div>

                    {/* Tarjeta desplegable de datos adicionales */}
                    {isExpanded && (
                      <div style={{
                        padding: "16px",
                        margin: "0 16px 16px 16px",
                        backgroundColor: "var(--surface-2)",
                        borderRadius: "8px",
                        border: "1px solid var(--border)",
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                        gap: "16px",
                      }}>
                        {/* Datos de la Transacción */}
                        <div>
                          <h4 style={{ fontSize: 13, fontWeight: 800, color: "var(--text)", marginBottom: 10 }}>Datos de la Transacción</h4>
                          <div style={detailRowStyle}>
                            <span style={detailLabelStyle}>Folio:</span>
                            <span style={detailValueStyle}>{s.invoiceNumber}</span>
                          </div>
                          <div style={detailRowStyle}>
                            <span style={detailLabelStyle}>Fecha:</span>
                            <span style={detailValueStyle}>{fmtDate(s.createdAt)} {fmtTime(s.createdAt)}</span>
                          </div>
                          <div style={detailRowStyle}>
                            <span style={detailLabelStyle}>Cajero:</span>
                            <span style={detailValueStyle}>{s.cajero}</span>
                          </div>
                        </div>

                        {/* Detalle de Venta */}
                        <div>
                          <h4 style={{ fontSize: 13, fontWeight: 800, color: "var(--text)", marginBottom: 10 }}>Detalle de Venta</h4>
                          <div style={detailRowStyle}>
                            <span style={detailLabelStyle}>Cliente:</span>
                            <span style={detailValueStyle}>{s.customer}</span>
                          </div>
                          <div style={detailRowStyle}>
                            <span style={detailLabelStyle}>Artículos:</span>
                            <span style={detailValueStyle}>{s.items}</span>
                          </div>
                          <div style={detailRowStyle}>
                            <span style={detailLabelStyle}>Método:</span>
                            <span style={detailValueStyle}>
                              <Badge tone={payTone(s.paymentMethod)}>{formattedMethod}</Badge>
                            </span>
                          </div>
                          <div style={detailRowStyle}>
                            <span style={detailLabelStyle}>Estado:</span>
                            <span style={detailValueStyle}>
                              <Badge tone={statusTone(s.status)}>{formattedStatus}</Badge>
                            </span>
                          </div>
                        </div>

                        {/* Resumen de Pago */}
                        <div>
                          <h4 style={{ fontSize: 13, fontWeight: 800, color: "var(--text)", marginBottom: 10 }}>Resumen de Pago</h4>
                          <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 8 }}>
                            <span style={{ fontSize: 18, fontWeight: 700, color: "var(--text)" }}>Total:</span>
                            <span style={{ fontSize: 20, fontWeight: 800, color: "var(--accent-strong)" }}>{moneyExact(s.totalAmount)}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      ) : (
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
                    <td style={{ ...ui.td, fontWeight: 700, color: "var(--accent-strong)" }}>{s.invoiceNumber}</td>
                    <td style={ui.td}>
                      {fmtDate(s.createdAt)} <span style={{ color: "var(--text-faint)" }}>{fmtTime(s.createdAt)}</span>
                    </td>
                    <td style={ui.td}>{s.branch}</td>
                    <td style={ui.td}>{s.cajero}</td>
                    <td style={{ ...ui.td, color: s.customer === "Público General" ? "var(--text-faint)" : "var(--text-secondary)" }}>
                      {s.customer}
                    </td>
                    <td style={{ ...ui.td, textAlign: "center" }}>{s.items}</td>
                    <td style={ui.td}>
                      <Badge tone={payTone(s.paymentMethod)}>{s.paymentMethod}</Badge>
                    </td>
                    <td style={{ ...ui.td, textAlign: "right", fontWeight: 800, color: "var(--text)" }}>
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
      )}

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
              <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 16, lineHeight: 1.5 }}>
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

                {isMobile ? (
                  /* ── Mobile / Tablet: Card-based product list ── */
                  <div style={{ marginBottom: 14 }}>
                    <div style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: "var(--text-faint)",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                      padding: "0 0 10px 0",
                      borderBottom: "1px solid var(--border)",
                      marginBottom: 0,
                    }}>
                      DETALLE DE PRODUCTOS
                    </div>
                    {detail.items.map((it, i) => (
                      <div
                        key={i}
                        style={{
                          padding: "14px 0",
                          borderBottom: i < detail.items.length - 1 ? "1px solid var(--surface-3)" : "none",
                        }}
                      >
                        {/* Row 1: Product name + Cantidad badge */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text)", lineHeight: 1.3 }}>{it.name}</div>
                            <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 2, fontWeight: 600 }}>{it.sku}</div>
                          </div>
                          <div style={{
                            border: "1px solid var(--border)",
                            borderRadius: 8,
                            padding: "4px 12px",
                            fontSize: 12,
                            fontWeight: 600,
                            color: "var(--text-secondary)",
                            backgroundColor: "var(--surface)",
                            whiteSpace: "nowrap",
                            marginLeft: 12,
                          }}>
                            Cantidad: <strong>{it.quantity}</strong>
                          </div>
                        </div>
                        {/* Row 2: Unitario + Importe */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: 500 }}>
                            Unitario: {moneyExact(it.unitPrice)}
                          </span>
                          <span style={{ fontSize: 14, color: "var(--text)" }}>
                            Importe: <strong style={{ fontWeight: 800 }}>{moneyExact(it.importe)}</strong>
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  /* ── Desktop: Standard table ── */
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
                            <div style={{ fontSize: 11, color: "var(--text-faint)" }}>{it.sku}</div>
                          </td>
                          <td style={{ ...ui.td, textAlign: "center" }}>{it.quantity}</td>
                          <td style={{ ...ui.td, textAlign: "right", color: "var(--text-muted)" }}>{moneyExact(it.unitPrice)}</td>
                          <td style={{ ...ui.td, textAlign: "right", fontWeight: 700 }}>{moneyExact(it.importe)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <Row label="Subtotal" value={moneyExact(detail.subtotal)} />
                  {detail.discountAmount > 0 && <Row label="Descuento" value={`- ${moneyExact(detail.discountAmount)}`} />}
                  <Row label="IVA (16%)" value={moneyExact(detail.taxAmount)} />
                  <div style={{ borderTop: "1px solid var(--border)", marginTop: 4, paddingTop: 8 }}>
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
  color: "var(--text-muted)",
};

const dateInputStyle: React.CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "0 10px",
  height: 36,
  fontSize: 13,
  color: "var(--text-secondary)",
  fontFamily: "inherit",
  backgroundColor: "var(--surface)",
  outline: "none",
  cursor: "pointer",
};

const Info: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div>
    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.4px" }}>
      {label}
    </div>
    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", marginTop: 3 }}>{value}</div>
  </div>
);

const Row: React.FC<{ label: string; value: string; strong?: boolean }> = ({ label, value, strong }) => (
  <div style={{ display: "flex", justifyContent: "space-between", fontSize: strong ? 16 : 13 }}>
    <span style={{ color: strong ? "var(--text)" : "var(--text-muted)", fontWeight: strong ? 800 : 500 }}>{label}</span>
    <span style={{ color: strong ? "var(--accent-strong)" : "var(--text-secondary)", fontWeight: strong ? 800 : 700 }}>{value}</span>
  </div>
);

const detailRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-start",
  alignItems: "center",
  gap: "8px",
  fontSize: 13,
  marginBottom: 6,
};

const detailLabelStyle: React.CSSProperties = {
  fontWeight: 700,
  color: "var(--text-muted)",
  minWidth: "85px",
  display: "inline-block",
};

const detailValueStyle: React.CSSProperties = {
  fontWeight: 600,
  color: "var(--text-secondary)",
};

export default VentasView;
