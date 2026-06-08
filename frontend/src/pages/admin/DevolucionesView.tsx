import React, { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Eye, RefreshCw } from "lucide-react";
import api from "../../services/api";
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
} from "./shared";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ReturnRow {
  id: number;
  returnNumber: string;
  saleId: number;
  saleNumber: string;
  clientName: string;
  date: string;
  totalRefunded: number;
  paymentMethod: string;
  branchId: number;
  branchName: string;
  authorizedBy: { id: number; name: string } | null;
  status: string;
}

interface ReturnDetailItem {
  id: number;
  productId: number;
  productName: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  taxAmount: number;
  discountAmount: number;
  destination: string;
  serialNumber: string | null;
  batchNumber: string | null;
}

interface ExchangeSaleInfo {
  id: number;
  saleNumber: string;
  date: string;
  total: number;
  items: { productName: string; quantity: number; unitPrice: number }[];
}

interface ReturnDetailData {
  id: number;
  returnNumber: string;
  saleId: number;
  saleNumber: string;
  date: string;
  reason: string;
  type: string;
  clientId: number | null;
  clientName: string;
  clientRFC: string | null;
  totalRefunded: number;
  paymentMethod: string;
  authorizedById: number | null;
  authorizedByName: string | null;
  cashSessionId: number | null;
  cfdiUuid: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  details: ReturnDetailItem[];
  exchangeSale: ExchangeSaleInfo | null;
}

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
        color: "#64748b",
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
        color: highlight ? "#1e3a8a" : "#334155",
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
  const [current, setCurrent] = useState(detail);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const showMsg = (text: string, ok: boolean) => {
    setActionMsg({ text, ok });
    setTimeout(() => setActionMsg(null), 4000);
  };

  const handleRetryRefund = async () => {
    setActionLoading(true);
    try {
      await api.post(`/api/admin/returns/${current.id}/retry-refund`);
      showMsg("Reembolso procesado exitosamente.", true);
    } catch (err: any) {
      showMsg(err.response?.data?.message || "Error al reintentar el reembolso.", false);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateCfdi = async () => {
    setActionLoading(true);
    try {
      const res = await api.post(`/api/admin/returns/${current.id}/create-cfdi`);
      setCurrent((d) => ({ ...d, cfdiUuid: res.data.cfdiUuid }));
      showMsg("CFDI timbrado exitosamente.", true);
    } catch (err: any) {
      showMsg(err.response?.data?.message || "Error al timbrar el CFDI.", false);
    } finally {
      setActionLoading(false);
    }
  };

  const subtotal = current.details.reduce(
    (acc, d) => acc + d.unitPrice * d.quantity - d.discountAmount,
    0
  );
  const totalTax = current.details.reduce((acc, d) => acc + d.taxAmount, 0);

  const showRetryRefund =
    current.status === "PENDING_REFUND" && current.paymentMethod === "QR_MERCADOPAGO";
  const showCreateCfdi =
    !current.cfdiUuid && current.paymentMethod !== "CAMBIO_PRODUCTO";

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 24 }}>
        <button style={ui.ghostBtn} onClick={onBack} className="active-tap">
          <ArrowLeft size={15} /> Volver
        </button>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.4px" }}>
              Devolución {current.returnNumber}
            </h2>
            <Badge tone={statusTone(current.status)}>
              {statusLabel(current.status)}
            </Badge>
          </div>
          <p style={{ fontSize: 13, color: "#64748b", marginTop: 3 }}>
            {fmtDateTime(current.date)} · Autorizado por {current.authorizedByName || "—"}
          </p>
        </div>
      </div>

      {/* Action message */}
      {actionMsg && (
        <div
          style={{
            marginBottom: 16,
            padding: "12px 16px",
            borderRadius: 8,
            backgroundColor: actionMsg.ok ? "#dcfce7" : "#fee2e2",
            color: actionMsg.ok ? "#15803d" : "#b91c1c",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {actionMsg.text}
        </div>
      )}

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
                    <div style={{ fontSize: 11, color: "#94a3b8" }}>{d.sku}</div>
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
      </Panel>

      {/* Sección 3: Resumen económico */}
      <Panel style={{ padding: 20, marginBottom: 20 }}>
        <h3 style={{ ...secTitle, marginBottom: 14 }}>Resumen Económico</h3>
        <div style={{ display: "flex", flexDirection: "column" as const, gap: 10, maxWidth: 320 }}>
          <div style={sumRow}>
            <span style={{ color: "#64748b", fontSize: 13 }}>Subtotal (sin impuesto)</span>
            <span style={{ fontWeight: 700 }}>{moneyExact(subtotal)}</span>
          </div>
          <div style={sumRow}>
            <span style={{ color: "#64748b", fontSize: 13 }}>IVA</span>
            <span style={{ fontWeight: 700 }}>{moneyExact(totalTax)}</span>
          </div>
          <div
            style={{
              ...sumRow,
              borderTop: "2px solid #e2e8f0",
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
            <span style={{ color: "#64748b", fontSize: 13 }}>Método</span>
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
            <span style={{ fontWeight: 700, color: "#1e3a8a", fontSize: 14 }}>
              {current.exchangeSale.saleNumber}
            </span>
            <span style={{ color: "#64748b", fontSize: 13 }}>
              {fmtDate(current.exchangeSale.date)}
            </span>
          </div>
          <table style={ui.table}>
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
        </Panel>
      )}

      {/* Sección 5: Facturación CFDI (condicional) */}
      {current.cfdiUuid && (
        <Panel style={{ padding: 20, marginBottom: 20 }}>
          <h3 style={{ ...secTitle, marginBottom: 12 }}>Facturación CFDI</h3>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div>
              <div style={{ fontSize: 11, color: "#64748b", marginBottom: 2, fontWeight: 600 }}>
                UUID
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, fontFamily: "monospace" }}>
                {current.cfdiUuid}
              </div>
            </div>
            <Badge tone="green">Timbrado ✓</Badge>
          </div>
        </Panel>
      )}

      {/* Sección 6: Acciones admin (condicional) */}
      {(showRetryRefund || showCreateCfdi) && (
        <Panel style={{ padding: 20 }}>
          <h3 style={{ ...secTitle, marginBottom: 14 }}>Acciones Administrativas</h3>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" as const }}>
            {showRetryRefund && (
              <button
                style={{ ...ui.primaryBtn, backgroundColor: "#dc2626" }}
                onClick={handleRetryRefund}
                disabled={actionLoading}
                className="active-tap"
              >
                <RefreshCw size={15} />
                {actionLoading ? "Procesando..." : "Reintentar Reembolso MP"}
              </button>
            )}
            {showCreateCfdi && (
              <button
                style={ui.primaryBtn}
                onClick={handleCreateCfdi}
                disabled={actionLoading}
                className="active-tap"
              >
                {actionLoading ? "Timbrando..." : "Timbrar Nota de Crédito"}
              </button>
            )}
          </div>
        </Panel>
      )}
    </div>
  );
};

// ─── Main list view ───────────────────────────────────────────────────────────

const DevolucionesView: React.FC<ViewProps> = ({ branchId, refreshToken }) => {
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

  const LIMIT = 20;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get("/api/admin/returns", {
        params: {
          page,
          limit: LIMIT,
          ...(branchId !== "all" ? { branchId } : {}),
          ...(paymentFilter !== "all" ? { paymentMethod: paymentFilter } : {}),
          ...(dateFrom ? { startDate: dateFrom } : {}),
          ...(dateTo ? { endDate: dateTo } : {}),
        },
      });
      setRows(res.data.data);
      setTotalPages(res.data.pagination.pages);
      setTotalRows(res.data.pagination.total);
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
      const res = await api.get(`/api/admin/returns/${id}`);
      setDetail(res.data.data);
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
      <div style={{ padding: 60, textAlign: "center", color: "#94a3b8", fontSize: 14 }}>
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

      <div style={ui.tableWrap}>
        <table style={ui.table}>
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
                  <td style={{ ...ui.td, fontWeight: 700, color: "#1e3a8a" }}>
                    {r.returnNumber}
                  </td>
                  <td style={{ ...ui.td, color: "#64748b" }}>{r.saleNumber}</td>
                  <td style={ui.td}>{r.clientName}</td>
                  <td style={ui.td}>
                    {fmtDate(r.date)}{" "}
                    <span style={{ color: "#94a3b8" }}>{fmtTime(r.date)}</span>
                  </td>
                  <td style={ui.td}>{r.branchName}</td>
                  <td style={ui.td}>
                    <Badge tone={payTone(r.paymentMethod)}>
                      {payLabel[r.paymentMethod] || r.paymentMethod}
                    </Badge>
                  </td>
                  <td style={{ ...ui.td, textAlign: "right", fontWeight: 800, color: "#0f172a" }}>
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
          <span style={{ fontSize: 13, color: "#64748b", fontWeight: 600 }}>
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
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  height: 38,
  padding: "0 12px",
  fontSize: 13,
  fontWeight: 600,
  color: "#334155",
  backgroundColor: "#ffffff",
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
  color: "#0f172a",
  marginBottom: 16,
  letterSpacing: "-0.2px",
};

const sumRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

export default DevolucionesView;
