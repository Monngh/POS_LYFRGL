import React, { useState, useEffect } from "react";
import { Download, FileText, ChevronDown, ChevronUp } from "lucide-react";
import api from "../../services/api";
import {
  ui,
  type ViewProps,
  Badge,
  Panel,
  TableState,
  SectionHeader,
  moneyExact,
  useMediaQuery,
} from "./shared";

const HistorialFacturasView: React.FC<ViewProps> = ({ refreshToken }) => {
  const isMobile = useMediaQuery("(max-width: 1024px)");
  const [expandedInvoices, setExpandedInvoices] = useState<Record<string, boolean>>({});

  const toggleExpandInvoice = (uuid: string) => {
    setExpandedInvoices((prev) => ({
      ...prev,
      [uuid]: !prev[uuid],
    }));
  };

  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get("/api/admin/billing/history");
      setHistory(res.data.data || []);
    } catch (err: any) {
      setError(err.response?.data?.message || "Error al cargar el historial de facturas.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [refreshToken]);

  const formatDate = (dateString: string) => {
    const d = new Date(dateString);
    return new Intl.DateTimeFormat("es-MX", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(d);
  };

  return (
    <div>
      <SectionHeader
        title="Historial de Facturas"
        subtitle="Consulta todas las facturas individuales y globales timbradas. Descarga el PDF y XML de cada una."
      />

      <Panel>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0", backgroundColor: "var(--surface-2)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <strong style={{ fontSize: 14, color: "var(--text-secondary)" }}>Facturas Emitidas</strong>
          <button onClick={fetchHistory} style={ui.ghostBtn}>
            Actualizar
          </button>
        </div>
        
        {isMobile ? (
          /* ── Mobile / Tablet: Card-based layout ── */
          <div style={{ overflowY: "auto", maxHeight: "62vh", padding: "8px 16px" }}>
            {/* Header row mirroring the fields */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "1.5fr 2fr 1.5fr 0.8fr",
              padding: "12px 16px",
              fontWeight: 700,
              fontSize: 11,
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.4px",
            }}>
              <div>Cliente</div>
              <div>Fecha</div>
              <div>Total</div>
              <div style={{ textAlign: "right", paddingRight: 8 }}>Más</div>
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
            {!loading && !error && history.length === 0 && (
              <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--text-faint)", fontSize: 13, fontWeight: 500 }}>
                No hay facturas emitidas.
              </div>
            )}

            {!loading &&
              !error &&
              history.map((item: any) => {
                const isExpanded = expandedInvoices[item.uuid];
                const displayUuid = item.uuid.substring(0, 8) + "..." + item.uuid.substring(item.uuid.length - 8);
                return (
                  <div
                    key={item.uuid}
                    style={{
                      backgroundColor: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                      marginBottom: 10,
                      boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
                      overflow: "hidden",
                    }}
                  >
                    {/* Header: UUID y Tipo de Factura */}
                    <div style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "8px 16px 6px 16px",
                      fontSize: 11,
                      fontWeight: 700,
                      color: "var(--text-muted)",
                      borderBottom: "1px solid #f1f5f9",
                      backgroundColor: "var(--surface-2)",
                      letterSpacing: "0.2px",
                    }}>
                      <span style={{ fontFamily: "monospace", color: "var(--text-muted)" }}>{displayUuid}</span>
                      <Badge tone={item.type === "Global" ? "blue" : "slate"}>
                        {item.type}
                      </Badge>
                    </div>

                    {/* Fila principal */}
                    <div style={{
                      display: "grid",
                      gridTemplateColumns: "1.5fr 2fr 1.5fr 0.8fr",
                      padding: "12px 16px",
                      alignItems: "center",
                    }}>
                      {/* Cliente */}
                      <div style={{ fontWeight: 700, fontSize: 13, color: "var(--accent-strong)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {item.customer || "Público General"}
                      </div>

                      {/* Fecha */}
                      <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                        {formatDate(item.date)}
                      </div>

                      {/* Total */}
                      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
                        {moneyExact(item.totalAmount)}
                      </div>

                      {/* Chevron */}
                      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center" }}>
                        <button
                          onClick={() => toggleExpandInvoice(item.uuid)}
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
                      </div>
                    </div>

                    {/* Detalle expandido */}
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
                        {/* Datos Generales */}
                        <div>
                          <h4 style={{ fontSize: 13, fontWeight: 800, color: "var(--text)", marginBottom: 10 }}>Datos de la Factura</h4>
                          <div style={hisDetailRow}>
                            <span style={hisDetailLabel}>UUID:</span>
                            <span style={{ ...hisDetailValue, fontFamily: "monospace", fontSize: 11, wordBreak: "break-all" }}>{item.uuid}</span>
                          </div>
                          <div style={hisDetailRow}>
                            <span style={hisDetailLabel}>Tipo:</span>
                            <span style={hisDetailValue}>{item.type}</span>
                          </div>
                          <div style={hisDetailRow}>
                            <span style={hisDetailLabel}>Cliente:</span>
                            <span style={hisDetailValue}>{item.customer || "Público General"}</span>
                          </div>
                        </div>

                        {/* Tickets Relacionados */}
                        <div>
                          <h4 style={{ fontSize: 13, fontWeight: 800, color: "var(--text)", marginBottom: 10 }}>Ventas Involucradas</h4>
                          <div style={hisDetailRow}>
                            <span style={hisDetailLabel}>Detalle:</span>
                            <span style={hisDetailValue}>
                              {item.type === "Global" ? (
                                <span style={{ fontWeight: 600 }}>{item.ticketsCount} tickets</span>
                              ) : (
                                <span style={{ fontWeight: 600 }}>{item.ticketsInvolved[0] || "—"}</span>
                              )}
                            </span>
                          </div>
                        </div>

                        {/* Descarga de Archivos */}
                        <div>
                          <h4 style={{ fontSize: 13, fontWeight: 800, color: "var(--text)", marginBottom: 10 }}>Descargar Comprobantes</h4>
                          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                            <a
                              href={`${api.defaults.baseURL}/api/public/sales/invoice/${item.uuid}/pdf`}
                              target="_blank"
                              rel="noreferrer"
                              style={{ ...downloadBtn, backgroundColor: "#dc2626" }}
                            >
                              <FileText size={14} /> PDF
                            </a>
                            <a
                              href={`${api.defaults.baseURL}/api/public/sales/invoice/${item.uuid}/xml`}
                              target="_blank"
                              rel="noreferrer"
                              style={{ ...downloadBtn, backgroundColor: "#0f172a" }}
                            >
                              <Download size={14} /> XML
                            </a>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        ) : (
          /* ── Desktop: Standard table ── */
          <div className="table-sticky-head" style={{ overflowX: "auto", overflowY: "auto", maxHeight: "62vh", WebkitOverflowScrolling: "touch", width: "100%" }}>
            <table style={ui.table}>
              <thead>
                <tr style={ui.theadRow}>
                  <th style={ui.th}>Fecha</th>
                  <th style={ui.th}>Folio Fiscal (UUID)</th>
                  <th style={ui.th}>Tipo</th>
                  <th style={ui.th}>Cliente</th>
                  <th style={ui.th}>Tickets</th>
                  <th style={{ ...ui.th, textAlign: "right" }}>Total</th>
                  <th style={{ ...ui.th, textAlign: "center" }}>Archivos</th>
                </tr>
              </thead>
              <tbody>
                <TableState
                  colSpan={7}
                  loading={loading}
                  error={error}
                  empty={!loading && !error && history.length === 0}
                  emptyText="No hay facturas emitidas."
                />
                {!loading && !error && history.map((item) => (
                  <tr key={item.uuid}>
                    <td style={ui.td}>{formatDate(item.date)}</td>
                    <td style={{ ...ui.td, fontFamily: "monospace", color: "var(--accent-strong)", fontWeight: 600 }}>{item.uuid}</td>
                    <td style={ui.td}>
                      <Badge tone={item.type === "Global" ? "blue" : "slate"}>
                        {item.type}
                      </Badge>
                    </td>
                    <td style={ui.td}>{item.customer}</td>
                    <td style={ui.td}>
                      {item.type === "Global" ? (
                        <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}>
                          {item.ticketsCount} tickets
                        </span>
                      ) : (
                        <span style={{ fontSize: 12 }}>{item.ticketsInvolved[0]}</span>
                      )}
                    </td>
                    <td style={{ ...ui.td, textAlign: "right", fontWeight: 700 }}>{moneyExact(item.totalAmount)}</td>
                    <td style={{ ...ui.td, textAlign: "center" }}>
                      <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                        <a
                          href={`${api.defaults.baseURL}/api/public/sales/invoice/${item.uuid}/pdf`}
                          target="_blank"
                          rel="noreferrer"
                          title="Descargar PDF"
                          style={{ ...actionBtn, color: "#dc2626", backgroundColor: "#fef2f2" }}
                        >
                          <FileText size={16} />
                          <span style={srOnly}>PDF</span>
                        </a>
                        <a
                          href={`${api.defaults.baseURL}/api/public/sales/invoice/${item.uuid}/xml`}
                          target="_blank"
                          rel="noreferrer"
                          title="Descargar XML"
                          style={{ ...actionBtn, color: "var(--text)", backgroundColor: "var(--surface-3)" }}
                        >
                          <Download size={16} />
                          <span style={srOnly}>XML</span>
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
};

const actionBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 32,
  height: 32,
  borderRadius: 6,
  textDecoration: "none",
  transition: "all 0.2s ease"
};

const srOnly: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  borderWidth: 0
};

const hisDetailRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-start",
  alignItems: "center",
  gap: "8px",
  fontSize: 13,
  marginBottom: 6,
};

const hisDetailLabel: React.CSSProperties = {
  fontWeight: 700,
  color: "var(--text-muted)",
  minWidth: "75px",
  display: "inline-block",
};

const hisDetailValue: React.CSSProperties = {
  fontWeight: 600,
  color: "var(--text-secondary)",
};

const downloadBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  color: "#ffffff",
  fontSize: 12,
  fontWeight: 700,
  padding: "6px 12px",
  borderRadius: 6,
  textDecoration: "none",
  cursor: "pointer",
};

export default HistorialFacturasView;

