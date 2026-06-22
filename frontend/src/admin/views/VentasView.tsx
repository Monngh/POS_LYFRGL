import React, { useEffect, useRef, useState } from "react";
import { Ban, ChevronDown, ChevronUp, Eye, Printer } from "lucide-react";
import api from "../../shared/services/api";
import { useAdminData } from "../../shared/hooks";
import { DataTable, ActionModal } from "../../shared/ui";
import type { Column } from "../../shared/ui";
import { normalizeIntegerInput, validateInteger, validateReference } from "../../shared/utils/formValidation";
import {
  ui,
  type ViewProps,
  Toolbar,
  SearchInput,
  FilterSelect,
  Badge,
  SectionHeader,
  money,
  moneyExact,
  fmtDate,
  fmtTime,
  statusTone,
  payTone,
  printTicketHtml,
  useMediaQuery
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

const VentasView: React.FC<ViewProps> = ({ branchId, refreshToken }) => {
  const isMobile = useMediaQuery("(max-width: 1024px)");
  const [expandedSales, setExpandedSales] = useState<Record<number, boolean>>({});

  const toggleExpand = (id: number) => {
    setExpandedSales((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
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

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const invalidRange = Boolean(dateFrom && dateTo && dateFrom > dateTo);
  const filterParams: Record<string, unknown> = {};
  if (branchId !== "all") filterParams.branchId = branchId;
  if (status !== "all") filterParams.status = status;
  if (debouncedSearch.trim()) filterParams.search = debouncedSearch.trim();
  if (!invalidRange) {
    if (dateFrom) filterParams.from = dateFrom;
    if (dateTo) filterParams.to = dateTo;
  }

  const { data, loading, error, refetch } = useAdminData<{ sales: SaleRow[] }>(
    "/api/admin/sales",
    { params: filterParams }
  );
  const rows = data?.sales ?? [];

  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    refetch();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshToken]);

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
      refetch();
    } catch (err: any) {
      const statusCode = err.response?.status;
      if (statusCode === 401) {
        setCancelError("PIN incorrecto. Solo ADMIN o GERENTE pueden cancelar ventas.");
      } else if (statusCode === 400) {
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

  const columns: Column<SaleRow>[] = [
    {
      key: "invoiceNumber",
      header: "Folio",
      render: (s) => <span style={{ fontWeight: 700, color: "var(--accent-strong)" }}>{s.invoiceNumber}</span>,
    },
    {
      key: "createdAt",
      header: "Fecha",
      render: (s) => (
        <>
          {fmtDate(s.createdAt)}{" "}
          <span style={{ color: "var(--text-faint)" }}>{fmtTime(s.createdAt)}</span>
        </>
      ),
    },
    { key: "branch", header: "Sucursal" },
    { key: "cajero", header: "Cajero" },
    {
      key: "customer",
      header: "Cliente",
      render: (s) => (
        <span style={{ color: s.customer === "Público General" ? "#94a3b8" : "#334155" }}>
          {s.customer}
        </span>
      ),
    },
    { key: "items", header: "Artículos", align: "center" },
    {
      key: "paymentMethod",
      header: "Método",
      render: (s) => <Badge tone={payTone(s.paymentMethod)}>{s.paymentMethod}</Badge>,
    },
    {
      key: "totalAmount",
      header: "Total",
      align: "right",
      render: (s) => <span style={{ fontWeight: 800, color: "var(--text)" }}>{money(s.totalAmount)}</span>,
    },
    {
      key: "status",
      header: "Estado",
      align: "center",
      render: (s) => <Badge tone={statusTone(s.status)}>{s.status}</Badge>,
    },
    {
      key: "id",
      header: "Detalle",
      align: "center",
      render: (s) => (
        <button style={ui.linkBtn} onClick={() => openDetail(s.id)} className="active-tap">
          <Eye size={15} style={{ verticalAlign: "-2px" }} /> Ver
        </button>
      ),
    },
  ];

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
                      borderBottom: "1px solid #f1f5f9",
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
                            color: "var(--accent)",
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
        <DataTable
          columns={columns}
          data={rows}
          loading={loading}
          error={error}
          emptyMessage="No hay ventas con los filtros seleccionados."
          keyExtractor={(s) => s.id}
        />
      )}

      {/* Sub-modal: autorización por PIN para cancelar */}
      <ActionModal
        isOpen={showPinModal && !!detail}
        onClose={closePinModal}
        title="Autorizar cancelación"
        size="sm"
        footer={
          <>
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
          </>
        }
      >
        <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 16, lineHeight: 1.5 }}>
          Venta <strong>{detail?.invoiceNumber}</strong> — Esta acción es irreversible. Ingrese el PIN de
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
      </ActionModal>

      {/* Modal de detalle */}
      <ActionModal
        isOpen={!!(detail || detailLoading)}
        onClose={() => setDetail(null)}
        title={detailLoading ? "Cargando venta..." : `Venta ${detail?.invoiceNumber}`}
        size="md"
      >
        {detail && (
          <>
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
          </>
        )}
      </ActionModal>
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
    <span style={{ color: strong ? "#0f172a" : "#64748b", fontWeight: strong ? 800 : 500 }}>{label}</span>
    <span style={{ color: strong ? "#1e3a8a" : "#334155", fontWeight: strong ? 800 : 700 }}>{value}</span>
  </div>
);

export default VentasView;
