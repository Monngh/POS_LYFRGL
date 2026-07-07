import React, { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Check, Eye, ChevronDown, ChevronUp, Calendar, User, Tag } from "lucide-react";
import {
  getAdminReturns,
  getAdminReturnDetail,
  type ReturnRow,
  type ReturnDetailData,
} from '../../facturacion';
import {
  ui,
  type ViewProps,
  Toolbar,
  SearchInput,
  FilterSelect,
  Badge,
  Panel,
  TableState,
  SectionHeader,
  moneyExact,
  fmtDate,
  fmtDateTime,
  fmtTime,
  useMediaQuery,
} from "./shared";

// ─── Helpers ─────────────────────────────────────────────────────────────────

type Tone = "green" | "red" | "amber" | "blue" | "slate";

const statusTone = (status: string): Tone => {
  if (status === "COMPLETED") return "green";
  if (status === "PENDING_REFUND") return "amber";
  if (status === "FAILED") return "red";
  return "slate";
};

const statusLabel = (status: string) => {
  if (status === "COMPLETED") return "Completada";
  if (status === "PENDING_REFUND") return "Pend. Reembolso";
  if (status === "FAILED") return "Fallida";
  return status;
};

const payTone = (m: string): Tone => {
  if (m === "EFECTIVO") return "green";
  if (m === "TARJETA" || m === "QR_MERCADOPAGO") return "blue";
  if (m === "VALE_DEVOLUCION") return "amber";
  return "slate";
};

const payLabel: Record<string, string> = {
  EFECTIVO: "Efectivo",
  TARJETA: "Tarjeta",
  QR_MERCADOPAGO: "Mercado Pago",
  VALE_DEVOLUCION: "Vale",
  CAMBIO_PRODUCTO: "Cambio",
};

const destLabel: Record<string, string> = {
  INVENTARIO_VENDIBLE: "Vendible",
  GARANTIA: "Garantía",
  MERMA: "Merma",
  REPARACION: "Reparación",
};

const destTone = (d: string): Tone => {
  if (d === "INVENTARIO_VENDIBLE") return "green";
  if (d === "GARANTIA") return "blue";
  if (d === "MERMA") return "red";
  return "slate";
};

// ─── InfoRow helper ───────────────────────────────────────────────────────────

const InfoRow: React.FC<{
  label: string;
  value?: string | number | null;
  highlight?: boolean;
  children?: React.ReactNode;
}> = ({ label, value, highlight, children }) => (
  <div>
    <div
      style={{
        fontSize: 11,
        fontWeight: 700,
        color: "var(--text-muted)",
        textTransform: "uppercase" as const,
        letterSpacing: "0.4px",
        marginBottom: 3,
      }}
    >
      {label}
    </div>
    <div
      style={{
        fontSize: 13,
        fontWeight: highlight ? 700 : 500,
        color: highlight ? "#1e3a8a" : "var(--text-secondary)",
      }}
    >
      {children ?? (value != null ? String(value) : "—")}
    </div>
  </div>
);

// ─── Detail sub-view ──────────────────────────────────────────────────────────

const ReturnDetailSubView: React.FC<{
  detail: ReturnDetailData;
  onBack: () => void;
}> = ({ detail, onBack }) => {
  const isMobile = useMediaQuery("(max-width: 1024px)");
  const [current] = useState(detail);
  const subtotal = current.details.reduce(
    (acc, d) => acc + d.unitPrice * d.quantity - d.discountAmount,
    0
  );
  const totalTax = current.details.reduce((acc, d) => acc + d.taxAmount, 0);

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 24 }}>
        <button style={ui.ghostBtn} onClick={onBack} className="active-tap">
          <ArrowLeft size={15} /> Volver
        </button>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.4px" }}>
              Devolución {current.returnNumber}
            </h2>
            <Badge tone={statusTone(current.status)}>
              {statusLabel(current.status)}
            </Badge>
          </div>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 3 }}>
            {fmtDateTime(current.date)} · Autorizado por {current.authorizedByName || "—"}
          </p>
        </div>
      </div>

      {/* Sección 1: Info general */}
      <Panel style={{ padding: 20, marginBottom: 20 }}>
        <h3 style={secTitle}>Información General</h3>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "14px 28px",
          }}
        >
          <InfoRow label="Folio Devolución" value={current.returnNumber} highlight />
          <InfoRow label="Folio Venta" value={current.saleNumber} highlight />
          <InfoRow label="Fecha" value={fmtDate(current.date)} />
          <InfoRow label="Cliente" value={current.clientName} />
          <InfoRow label="RFC" value={current.clientRFC} />
          <InfoRow label="Tipo" value={current.type} />
          <InfoRow label="Motivo" value={current.reason} />
          <InfoRow label="Método de Reembolso">
            <Badge tone={payTone(current.paymentMethod)}>
              {payLabel[current.paymentMethod] || current.paymentMethod}
            </Badge>
          </InfoRow>
          {current.cashSessionId != null && (
            <InfoRow label="Sesión de Caja" value={`#${current.cashSessionId}`} />
          )}
          {current.cfdiUuid && (
            <InfoRow label="CFDI UUID" value={current.cfdiUuid} />
          )}
        </div>
      </Panel>

      {/* Sección 2: Productos devueltos */}
      <Panel style={{ marginBottom: 20 }}>
        <div style={{ padding: "16px 20px 12px" }}>
          <h3 style={secTitle}>Productos Devueltos</h3>
        </div>
        {isMobile ? (
          /* ── Mobile / Tablet: Card-based product list ── */
          <div style={{ padding: "0 20px 16px" }}>
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
            {current.details.map((d, i) => (
              <div
                key={d.id}
                style={{
                  padding: "14px 0",
                  borderBottom: i < current.details.length - 1 ? "1px solid var(--border-soft)" : "none",
                }}
              >
                {/* Row 1: Product name + Cantidad badge */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text)", lineHeight: 1.3 }}>{d.productName}</div>
                    <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 2, fontWeight: 600 }}>{d.sku}</div>
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
                    Cantidad: <strong>{d.quantity}</strong>
                  </div>
                </div>
                {/* Row 2: Unitario + Importe */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: 500 }}>
                    Unitario: {moneyExact(d.unitPrice)}
                  </span>
                  <span style={{ fontSize: 14, color: "var(--text)" }}>
                    Importe: <strong style={{ fontWeight: 800 }}>{moneyExact(d.unitPrice * d.quantity - d.discountAmount)}</strong>
                  </span>
                </div>
                {/* Row 3: Tax, Discount, Destino */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginTop: 4 }}>
                  {d.taxAmount > 0 && (
                    <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}>
                      Impuesto: {moneyExact(d.taxAmount)}
                    </span>
                  )}
                  {d.discountAmount > 0 && (
                    <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}>
                      Descuento: {moneyExact(d.discountAmount)}
                    </span>
                  )}
                  <Badge tone={destTone(d.destination)}>
                    {destLabel[d.destination] || d.destination}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* ── Desktop: Standard table ── */
          <div style={{ overflowX: "auto" }}>
            <table style={ui.table}>
              <thead>
                <tr style={ui.theadRow}>
                  <th style={ui.th}>Producto (SKU)</th>
                  <th style={{ ...ui.th, textAlign: "center" }}>Cant.</th>
                  <th style={{ ...ui.th, textAlign: "right" }}>P.Unit.</th>
                  <th style={{ ...ui.th, textAlign: "right" }}>Impuesto</th>
                  <th style={{ ...ui.th, textAlign: "right" }}>Descuento</th>
                  <th style={{ ...ui.th, textAlign: "center" }}>Destino</th>
                </tr>
              </thead>
              <tbody>
                {current.details.map((d) => (
                  <tr key={d.id}>
                    <td style={ui.td}>
                      <div style={{ fontWeight: 700 }}>{d.productName}</div>
                      <div style={{ fontSize: 11, color: "var(--text-faint)" }}>{d.sku}</div>
                    </td>
                    <td style={{ ...ui.td, textAlign: "center" }}>{d.quantity}</td>
                    <td style={{ ...ui.td, textAlign: "right" }}>{moneyExact(d.unitPrice)}</td>
                    <td style={{ ...ui.td, textAlign: "right" }}>{moneyExact(d.taxAmount)}</td>
                    <td style={{ ...ui.td, textAlign: "right" }}>
                      {d.discountAmount > 0 ? moneyExact(d.discountAmount) : "—"}
                    </td>
                    <td style={{ ...ui.td, textAlign: "center" }}>
                      <Badge tone={destTone(d.destination)}>
                        {destLabel[d.destination] || d.destination}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* Sección 3: Resumen económico */}
      <Panel style={{ padding: 20, marginBottom: 20 }}>
        <h3 style={{ ...secTitle, marginBottom: 14 }}>Resumen Económico</h3>
        <div style={{ display: "flex", flexDirection: "column" as const, gap: 10, maxWidth: 320 }}>
          <div style={sumRow}>
            <span style={{ color: "var(--text-muted)", fontSize: 13 }}>Subtotal (sin impuesto)</span>
            <span style={{ fontWeight: 700 }}>{moneyExact(subtotal)}</span>
          </div>
          <div style={sumRow}>
            <span style={{ color: "var(--text-muted)", fontSize: 13 }}>IVA</span>
            <span style={{ fontWeight: 700 }}>{moneyExact(totalTax)}</span>
          </div>
          <div
            style={{
              ...sumRow,
              borderTop: "2px solid var(--border)",
              paddingTop: 10,
              marginTop: 4,
            }}
          >
            <span style={{ fontWeight: 800, fontSize: 14 }}>TOTAL A REEMBOLSAR</span>
            <span style={{ fontWeight: 800, fontSize: 20, color: "#15803d" }}>
              {moneyExact(current.totalRefunded)}
            </span>
          </div>
          <div style={sumRow}>
            <span style={{ color: "var(--text-muted)", fontSize: 13 }}>Método</span>
            <Badge tone={payTone(current.paymentMethod)}>
              {payLabel[current.paymentMethod] || current.paymentMethod}
            </Badge>
          </div>
        </div>
      </Panel>

      {/* Sección 4: Venta de cambio (condicional) */}
      {current.exchangeSale && (
        <Panel style={{ padding: 20, marginBottom: 20 }}>
          <h3 style={{ ...secTitle, marginBottom: 12 }}>Venta de Cambio Generada</h3>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <span style={{ fontWeight: 700, color: "var(--accent-strong)", fontSize: 14 }}>
              {current.exchangeSale.saleNumber}
            </span>
            <span style={{ color: "var(--text-muted)", fontSize: 13 }}>
              {fmtDate(current.exchangeSale.date)}
            </span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ ...ui.table, minWidth: 320 }}>
              <thead>
                <tr style={ui.theadRow}>
                  <th style={ui.th}>Producto</th>
                  <th style={{ ...ui.th, textAlign: "center" }}>Cant.</th>
                  <th style={{ ...ui.th, textAlign: "right" }}>P.Unit.</th>
                </tr>
              </thead>
              <tbody>
                {current.exchangeSale.items.map((item, i) => (
                  <tr key={i}>
                    <td style={ui.td}>{item.productName}</td>
                    <td style={{ ...ui.td, textAlign: "center" }}>{item.quantity}</td>
                    <td style={{ ...ui.td, textAlign: "right" }}>{moneyExact(item.unitPrice)}</td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={2} style={{ ...ui.td, fontWeight: 800 }}>
                    Total
                  </td>
                  <td style={{ ...ui.td, textAlign: "right", fontWeight: 800 }}>
                    {moneyExact(current.exchangeSale.total)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {/* Sección 5: Facturación CFDI (condicional) */}
      {current.cfdiUuid && (
        <Panel style={{ padding: 20, marginBottom: 20 }}>
          <h3 style={{ ...secTitle, marginBottom: 12 }}>Facturación CFDI</h3>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 2, fontWeight: 600 }}>
                UUID
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, fontFamily: "monospace" }}>
                {current.cfdiUuid}
              </div>
            </div>
            <Badge tone="green"><span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Check size={11} /> Timbrado</span></Badge>
          </div>
        </Panel>
      )}


    </div>
  );
};

// ─── Main list view ───────────────────────────────────────────────────────────

const DevolucionesView: React.FC<ViewProps> = ({ branchId, refreshToken }) => {
  const isMobile = useMediaQuery("(max-width: 1024px)");
  const [expandedReturns, setExpandedReturns] = useState<Record<number, boolean>>({});
  const [rows, setRows] = useState<ReturnRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRows, setTotalRows] = useState(0);

  const [detail, setDetail] = useState<ReturnDetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const toggleExpand = (id: number) => {
    setExpandedReturns((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const LIMIT = 50;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getAdminReturns({
        page,
        limit: LIMIT,
        ...(branchId !== "all" ? { branchId } : {}),
        ...(paymentFilter !== "all" ? { paymentMethod: paymentFilter } : {}),
        ...(dateFrom ? { startDate: dateFrom } : {}),
        ...(dateTo ? { endDate: dateTo } : {}),
      } as any);
      setRows((res.data as any).data);
      setTotalPages((res.data as any).pagination.pages);
      setTotalRows((res.data as any).pagination.total);
    } catch (err: any) {
      setError(err.response?.data?.message || "No se pudieron cargar las devoluciones.");
    } finally {
      setLoading(false);
    }
  }, [branchId, page, paymentFilter, dateFrom, dateTo, refreshToken]);

  useEffect(() => {
    load();
  }, [load]);

  const openDetail = async (id: number) => {
    setDetailLoading(true);
    setDetail(null);
    try {
      const res = await getAdminReturnDetail(id);
      setDetail((res.data as any).data);
    } catch (err: any) {
      setError(err.response?.data?.message || "Error al cargar el detalle.");
    } finally {
      setDetailLoading(false);
    }
  };

  const filtered = search.trim()
    ? rows.filter(
      (r) =>
        r.returnNumber.toLowerCase().includes(search.toLowerCase()) ||
        r.saleNumber.toLowerCase().includes(search.toLowerCase())
    )
    : rows;

  if (detailLoading) {
    return (
      <div style={{ padding: 60, textAlign: "center", color: "var(--text-faint)", fontSize: 14 }}>
        Cargando detalle...
      </div>
    );
  }

  if (detail) {
    return <ReturnDetailSubView detail={detail} onBack={() => setDetail(null)} />;
  }

  return (
    <div>
      <SectionHeader
        title="Devoluciones"
        subtitle={`${totalRows} devolución${totalRows !== 1 ? "es" : ""} registrada${totalRows !== 1 ? "s" : ""}`}
      />

      <Toolbar>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Buscar por folio DEV-... o V-..."
        />
        <FilterSelect
          value={paymentFilter}
          onChange={(v) => {
            setPaymentFilter(v);
            setPage(1);
          }}
          options={[
            { value: "all", label: "Todos los métodos" },
            { value: "EFECTIVO", label: "Efectivo" },
            { value: "TARJETA", label: "Tarjeta" },
            { value: "QR_MERCADOPAGO", label: "Mercado Pago" },
            { value: "VALE_DEVOLUCION", label: "Vale Devolución" },
            { value: "CAMBIO_PRODUCTO", label: "Cambio Producto" },
          ]}
        />
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => {
            setDateFrom(e.target.value);
            setPage(1);
          }}
          style={dateInput}
          title="Desde"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => {
            setDateTo(e.target.value);
            setPage(1);
          }}
          style={dateInput}
          title="Hasta"
        />
        {(dateFrom || dateTo) && (
          <button
            style={{ ...ui.ghostBtn, fontSize: 12, padding: "5px 10px", height: 32 }}
            onClick={() => {
              setDateFrom("");
              setDateTo("");
              setPage(1);
            }}
          >
            Limpiar fechas
          </button>
        )}
      </Toolbar>


      {isMobile ? (
        <div style={{ overflowY: "auto", maxHeight: "62vh", padding: "8px 16px" }}>
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
          {!loading && !error && filtered.length === 0 && (
            <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--text-faint)", fontSize: 13, fontWeight: 500 }}>
              No hay devoluciones para mostrar.
            </div>
          )}

          {!loading &&
            !error &&
            filtered.map((r) => {
              const isExpanded = expandedReturns[r.id];
              const formattedMethod = payLabel[r.paymentMethod] || r.paymentMethod;
              const formattedStatus = statusLabel(r.status);
              return (
                <div
                  key={r.id}
                  style={{
                    backgroundColor: "var(--surface)",
                    border: "1px solid var(--border-soft)",
                    borderRadius: 16,
                    padding: 16,
                    marginBottom: 12,
                    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Folio solo en su propia línea */}
                      <div style={{ marginBottom: 6 }}>
                        <button
                          onClick={() => openDetail(r.id)}
                          style={{
                            background: "none",
                            border: "none",
                            color: "var(--accent)",
                            fontWeight: 700,
                            cursor: "pointer",
                            padding: 0,
                            fontSize: 16,
                            textAlign: "left",
                            wordBreak: "break-all",
                            overflowWrap: "anywhere",
                          }}
                          className="active-tap"
                        >
                          {r.returnNumber}
                        </button>
                      </div>

                      {/* Sucursal */}
                      <div style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 4, wordBreak: "break-word" }}>
                        {r.branchName}
                      </div>

                      {/* Precio de reembolso debajo de sucursal */}
                      <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>
                        {moneyExact(r.totalRefunded)}
                      </div>

                      {/* Fecha */}
                      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-secondary)", marginBottom: 6 }}>
                        <Calendar size={14} color="#2563eb" />
                        <span>{fmtDateTime(r.date)}</span>
                      </div>

                      {/* Cliente */}
                      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-secondary)" }}>
                        <User size={14} color="#2563eb" />
                        <span style={{ wordBreak: "break-word" }}>Cliente: {r.clientName}</span>
                      </div>
                    </div>

                    {/* Chevron Button — alineado arriba */}
                    <div style={{ display: "flex", alignItems: "flex-start", paddingTop: 2 }}>
                      <button
                        onClick={() => toggleExpand(r.id)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: "var(--surface)",
                          border: "1px solid var(--border-strong)",
                          borderRadius: 8,
                          width: 38,
                          height: 38,
                          cursor: "pointer",
                          color: "var(--accent)",
                          padding: 0,
                        }}
                        className="active-tap"
                      >
                        {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </button>
                    </div>
                  </div>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border-soft)" }}>
                      {/* Venta box */}
                      <div style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        backgroundColor: "#eff6ff",
                        color: "#1e40af",
                        padding: "10px 12px",
                        borderRadius: 8,
                        fontSize: 13,
                        fontWeight: 600,
                        marginBottom: 12,
                      }}>
                        <Tag size={15} color="#2563eb" />
                        <span>Venta: {r.saleNumber}</span>
                      </div>

                      {/* Ver detalle link */}
                      <div style={{ marginBottom: 16 }}>
                        <button
                          onClick={() => openDetail(r.id)}
                          style={{
                            background: "none",
                            border: "none",
                            color: "var(--accent)",
                            fontWeight: 700,
                            cursor: "pointer",
                            padding: 0,
                            fontSize: 13,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                          className="active-tap"
                        >
                          <Eye size={15} /> Ver detalle
                        </button>
                      </div>

                      {/* Details container from Image 2 */}
                      <div style={{
                        backgroundColor: "var(--surface-2)",
                        borderRadius: 12,
                        border: "1px solid var(--border)",
                        padding: 16,
                      }}>
                        {/* Datos de Devolución */}
                        <h4 style={{ fontSize: 13, fontWeight: 800, color: "var(--text)", marginBottom: 10 }}>Datos de Devolución</h4>
                        <div style={detailRowStyle}>
                          <span style={detailLabelStyle}>Folio Dev:</span>
                          <span style={detailValueStyle}>{r.returnNumber}</span>
                        </div>
                        <div style={detailRowStyle}>
                          <span style={detailLabelStyle}>Folio Venta:</span>
                          <span style={detailValueStyle}>{r.saleNumber}</span>
                        </div>
                        <div style={detailRowStyle}>
                          <span style={detailLabelStyle}>Autorizado:</span>
                          <span style={detailValueStyle}>{r.authorizedBy ? r.authorizedBy.name : "—"}</span>
                        </div>

                        {/* Detalle de Operación */}
                        <h4 style={{ fontSize: 13, fontWeight: 800, color: "var(--text)", marginTop: 16, marginBottom: 10 }}>Detalle de Operación</h4>
                        <div style={detailRowStyle}>
                          <span style={detailLabelStyle}>Fecha:</span>
                          <span style={detailValueStyle}>{fmtDateTime(r.date)}</span>
                        </div>
                        <div style={detailRowStyle}>
                          <span style={detailLabelStyle}>Sucursal:</span>
                          <span style={detailValueStyle}>{r.branchName}</span>
                        </div>
                        <div style={detailRowStyle}>
                          <span style={detailLabelStyle}>Cliente:</span>
                          <span style={detailValueStyle}>{r.clientName}</span>
                        </div>

                        {/* Resumen Económico */}
                        <h4 style={{ fontSize: 13, fontWeight: 800, color: "var(--text)", marginTop: 16, marginBottom: 10 }}>Resumen Económico</h4>
                        <div style={detailRowStyle}>
                          <span style={detailLabelStyle}>Método:</span>
                          <span style={detailValueStyle}>
                            <Badge tone={payTone(r.paymentMethod)}>{formattedMethod}</Badge>
                          </span>
                        </div>
                        <div style={detailRowStyle}>
                          <span style={detailLabelStyle}>Estado:</span>
                          <span style={detailValueStyle}>
                            <Badge tone={statusTone(r.status)}>{formattedStatus}</Badge>
                          </span>
                        </div>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 12 }}>
                          <span style={{ fontSize: 15, fontWeight: 800, color: "var(--text)" }}>Reembolso:</span>
                          <span style={{ fontSize: 18, fontWeight: 800, color: "#15803d" }}>{moneyExact(r.totalRefunded)}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      ) : (
        <div className="table-sticky-head" style={{ ...ui.tableWrap, overflowX: "auto", overflowY: "auto", maxHeight: "62vh" }}>
          <table style={{ ...ui.table, minWidth: 680 }}>
            <thead>
              <tr style={ui.theadRow}>
                <th style={ui.th}>Folio Devolución</th>
                <th style={ui.th}>Folio Venta</th>
                <th style={ui.th}>Cliente</th>
                <th style={ui.th}>Fecha</th>
                <th style={ui.th}>Sucursal</th>
                <th style={ui.th}>Método</th>
                <th style={{ ...ui.th, textAlign: "right" }}>Monto</th>
                <th style={{ ...ui.th, textAlign: "center" }}>Estado</th>
                <th style={{ ...ui.th, textAlign: "center" }}>Acción</th>
              </tr>
            </thead>
            <tbody>
              <TableState
                colSpan={9}
                loading={loading}
                error={error}
                empty={!loading && !error && filtered.length === 0}
                emptyText="No hay devoluciones para mostrar."
              />
              {!loading &&
                !error &&
                filtered.map((r) => (
                  <tr key={r.id}>
                    <td style={{ ...ui.td, fontWeight: 700, color: "var(--accent-strong)" }}>
                      {r.returnNumber}
                    </td>
                    <td style={{ ...ui.td, color: "var(--text-muted)" }}>{r.saleNumber}</td>
                    <td style={ui.td}>{r.clientName}</td>
                    <td style={ui.td}>
                      {fmtDate(r.date)}{" "}
                      <span style={{ color: "var(--text-faint)" }}>{fmtTime(r.date)}</span>
                    </td>
                    <td style={ui.td}>{r.branchName}</td>
                    <td style={ui.td}>
                      <Badge tone={payTone(r.paymentMethod)}>
                        {payLabel[r.paymentMethod] || r.paymentMethod}
                      </Badge>
                    </td>
                    <td style={{ ...ui.td, textAlign: "right", fontWeight: 800, color: "var(--text)" }}>
                      {moneyExact(r.totalRefunded)}
                    </td>
                    <td style={{ ...ui.td, textAlign: "center" }}>
                      <Badge tone={statusTone(r.status)}>{statusLabel(r.status)}</Badge>
                    </td>
                    <td style={{ ...ui.td, textAlign: "center" }}>
                      <button
                        style={ui.linkBtn}
                        onClick={() => openDetail(r.id)}
                        className="active-tap"
                      >
                        <Eye size={15} style={{ verticalAlign: "-2px" }} /> Ver
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Paginación */}
      {totalPages > 1 && (
        <div style={pageWrap}>
          <button
            style={{ ...ui.ghostBtn, opacity: page <= 1 ? 0.4 : 1 }}
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            ← Anterior
          </button>
          <span style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: 600 }}>
            Página {page} de {totalPages}
          </span>
          <button
            style={{ ...ui.ghostBtn, opacity: page >= totalPages ? 0.4 : 1 }}
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Siguiente →
          </button>
        </div>
      )}
    </div>
  );
};

// ─── Local styles ─────────────────────────────────────────────────────────────

const dateInput: React.CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: 8,
  height: 38,
  padding: "0 12px",
  fontSize: 13,
  fontWeight: 600,
  color: "var(--text-secondary)",
  backgroundColor: "var(--surface)",
  cursor: "pointer",
  fontFamily: "inherit",
  outline: "none",
};

const pageWrap: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 12,
  marginTop: 16,
  padding: "12px 0",
};

const secTitle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 800,
  color: "var(--text)",
  marginBottom: 16,
  letterSpacing: "-0.2px",
};

const sumRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

const detailRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-start",
  alignItems: "flex-start",
  gap: "8px",
  fontSize: 13,
  marginBottom: 6,
};

const detailLabelStyle: React.CSSProperties = {
  fontWeight: 700,
  color: "var(--text-muted)",
  minWidth: "85px",
  display: "inline-block",
  flexShrink: 0,
};

const detailValueStyle: React.CSSProperties = {
  fontWeight: 600,
  color: "var(--text-secondary)",
  wordBreak: "break-word",
  overflowWrap: "anywhere",
  whiteSpace: "normal",
  minWidth: 0,
  flex: 1,
};

export default DevolucionesView;
