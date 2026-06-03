import React, { useEffect, useState, useCallback } from "react";
import { X, Eye } from "lucide-react";
import api from "../../services/api";
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
} from "./shared";

interface SaleRow {
  id: number;
  invoiceNumber: string;
  createdAt: string;
  branch: string;
  cajero: string;
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

const VentasView: React.FC<ViewProps> = ({ branchId, refreshToken }) => {
  const [rows, setRows] = useState<SaleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");

  const [detail, setDetail] = useState<SaleDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ sales: SaleRow[] }>("/api/admin/sales", {
        params: {
          ...(branchId !== "all" ? { branchId } : {}),
          ...(status !== "all" ? { status } : {}),
          ...(search.trim() ? { search: search.trim() } : {}),
        },
      });
      setRows(res.data.sales);
    } catch (err: any) {
      setError(err.response?.data?.message || "No se pudieron cargar las ventas.");
    } finally {
      setLoading(false);
    }
  }, [branchId, status, search, refreshToken]);

  // Debounce de la búsqueda
  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

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
        <span style={{ marginLeft: "auto", fontSize: 13, color: "#64748b", fontWeight: 600 }}>
          {rows.length} registro{rows.length === 1 ? "" : "s"}
        </span>
      </Toolbar>

      <div style={ui.tableWrap}>
        <table style={ui.table}>
          <thead>
            <tr style={ui.theadRow}>
              <th style={ui.th}>Folio</th>
              <th style={ui.th}>Fecha</th>
              <th style={ui.th}>Sucursal</th>
              <th style={ui.th}>Cajero</th>
              <th style={{ ...ui.th, textAlign: "center" }}>Artículos</th>
              <th style={ui.th}>Método</th>
              <th style={{ ...ui.th, textAlign: "right" }}>Total</th>
              <th style={{ ...ui.th, textAlign: "center" }}>Estado</th>
              <th style={{ ...ui.th, textAlign: "center" }}>Detalle</th>
            </tr>
          </thead>
          <tbody>
            <TableState colSpan={9} loading={loading} error={error} empty={!loading && rows.length === 0} />
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

                <table style={{ ...ui.table, marginBottom: 14 }}>
                  <thead>
                    <tr style={ui.theadRow}>
                      <th style={ui.th}>Producto</th>
                      <th style={{ ...ui.th, textAlign: "center" }}>Cant</th>
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
                        <td style={{ ...ui.td, textAlign: "right", fontWeight: 700 }}>{moneyExact(it.importe)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <Row label="Subtotal" value={moneyExact(detail.subtotal)} />
                  {detail.discountAmount > 0 && <Row label="Descuento" value={`- ${moneyExact(detail.discountAmount)}`} />}
                  <Row label="IVA (16%)" value={moneyExact(detail.taxAmount)} />
                  <div style={{ borderTop: "1px solid #e2e8f0", marginTop: 4, paddingTop: 8 }}>
                    <Row label="Total" value={moneyExact(detail.totalAmount)} strong />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
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
