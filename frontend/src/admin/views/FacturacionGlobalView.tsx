import React, { useState, useEffect, useCallback, useMemo } from "react";
import { RefreshCw, CheckCircle, AlertCircle, ChevronDown, ChevronUp, X } from "lucide-react";
import api from "../../shared/services/api";
import {
  ui,
  type ViewProps,
  Badge,
  Panel,
  TableState,
  SectionHeader,
  moneyExact,
  fmtDate,
  fmtTime,
  useMediaQuery,
} from "./shared";
import { useToast } from "../../shared/context/ToastContext";
import { ConfirmModal } from "../../shared/ui";

const PERIODICIDADES = [
  { value: "day", label: "Diario" },
  { value: "week", label: "Semanal" },
  { value: "fortnight", label: "Quincenal" },
  { value: "month", label: "Mensual" },
];

const MESES = [
  { value: "01", label: "Enero" },
  { value: "02", label: "Febrero" },
  { value: "03", label: "Marzo" },
  { value: "04", label: "Abril" },
  { value: "05", label: "Mayo" },
  { value: "06", label: "Junio" },
  { value: "07", label: "Julio" },
  { value: "08", label: "Agosto" },
  { value: "09", label: "Septiembre" },
  { value: "10", label: "Octubre" },
  { value: "11", label: "Noviembre" },
  { value: "12", label: "Diciembre" },
];

// Normaliza el nombre de cliente para poder comparar de forma consistente
const normalizeCustomerName = (customer: any): string => (customer ? String(customer).trim().toLowerCase() : "");

const isPublicoGeneral = (customer: any): boolean => {
  const cName = normalizeCustomerName(customer);
  return cName === "" || cName === "público general";
};

const FacturacionGlobalView: React.FC<ViewProps> = ({ branchId, refreshToken }) => {
  const { showToast } = useToast();
  const [confirmStampOpen, setConfirmStampOpen] = useState(false);
  const isMobile = useMediaQuery("(max-width: 1024px)");
  const isTablet = useMediaQuery("(min-width: 1025px) and (max-width: 1366px)");
  const [expandedTickets, setExpandedTickets] = useState<Record<number, boolean>>({});
  const [filtersExpanded, setFiltersExpanded] = useState(true);

  const toggleExpandTicket = (id: number) => {
    setExpandedTickets((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Configuración de la factura global
  const todayStr = new Date().toISOString().substring(0, 10);
  const defaultMonth = String(new Date().getMonth() + 1).padStart(2, "0");
  const defaultYear = String(new Date().getFullYear());

  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(todayStr);
  const [periodicity, setPeriodicity] = useState("day");

  // El mes y año se derivan de la fecha de inicio 
  const derivedMonth = useMemo(() => startDate.substring(5, 7) || defaultMonth, [startDate]);
  const derivedYear = useMemo(() => startDate.substring(0, 4) || defaultYear, [startDate]);

  // Estado de los tickets a facturar
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasAssociatedCustomers, setHasAssociatedCustomers] = useState(false);

  // Estado de timbrado
  const [stamping, setStamping] = useState(false);
  const [stampResult, setStampResult] = useState<any | null>(null);
  const [stampError, setStampError] = useState<string | null>(null);

  // Restablece todos los filtros a sus valores por defecto (hoy / diario)
  const handleClearFilters = () => {
    setStartDate(todayStr);
    setEndDate(todayStr);
    setPeriodicity("day");
  };

  // Cargar tickets elegibles
  const loadEligibleTickets = useCallback(async () => {
    setLoading(true);
    setError(null);
    setStampResult(null);
    setStampError(null);
    try {
      const res = await api.get("/api/admin/sales", {
        params: {
          branchId,
          from: startDate,
          to: endDate,
          status: "COMPLETADA",
        },
      });

      const sales = res.data.sales || [];
      const incomingHasCustomers = sales.some((s: any) => !isPublicoGeneral(s.customer));
      setHasAssociatedCustomers(incomingHasCustomers);

      const unbilled = sales.filter((s: any) => !s.cfdiUuid && isPublicoGeneral(s.customer));
      setTickets(unbilled);
    } catch (err: any) {
      setError(err.response?.data?.message || "Error al recuperar las ventas elegibles.");
    } finally {
      setLoading(false);
    }
  }, [branchId, startDate, endDate, refreshToken]);

  useEffect(() => {
    loadEligibleTickets();
  }, [loadEligibleTickets]);

  // Ejecutar timbrado de Factura Global
  const handleStampGlobal = () => {
    if (tickets.length === 0) {
      showToast("No hay tickets disponibles para facturar en este rango.", "warning");
      return;
    }
    setConfirmStampOpen(true);
  };

  const confirmStampGlobal = async () => {
    setConfirmStampOpen(false);
    setStamping(true);
    setStampResult(null);
    setStampError(null);
    try {
      const res = await api.post("/api/admin/billing/global", {
        startDate,
        endDate,
        periodicity,
        month: derivedMonth,   // ← valor derivado
        year: derivedYear,     // ← valor derivado
        branchId: branchId === "all" ? undefined : parseInt(branchId),
      });

      setStampResult(res.data);
      setTickets([]);
    } catch (err: any) {
      setStampError(err.response?.data?.message || "Error al timbrar la Factura Global.");
    } finally {
      setStamping(false);
    }
  };

  // Cálculos resumen
  const totalAmount = useMemo(() => tickets.reduce((acc, t) => acc + t.totalAmount, 0), [tickets]);
  const totalTax = useMemo(() => tickets.reduce((acc, t) => acc + t.taxAmount, 0), [tickets]);

  const periodicityLabel = PERIODICIDADES.find((p) => p.value === periodicity)?.label || periodicity;

  return (
    <div>
      <SectionHeader
        title="Facturación Global"
        subtitle="Agrupa y timbra los tickets de venta al público en general que no fueron facturados individualmente."
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : isTablet ? "240px minmax(0, 1fr)" : "280px minmax(0, 1fr)",
          gap: isMobile ? 16 : isTablet ? 18 : 24,
          alignItems: "start",
        }}
      >
        {/* PANEL DE CONFIGURACIÓN */}
        <Panel style={{ padding: 20 }}>
          <div
            onClick={() => isMobile && setFiltersExpanded((v) => !v)}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              cursor: isMobile ? "pointer" : "default",
              marginBottom: filtersExpanded ? 16 : 0,
            }}
          >
            <h3 style={{ fontSize: 14, fontWeight: 800, color: "var(--accent-strong)" }}>Configurar Factura Global</h3>
            {isMobile && (filtersExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
          </div>

          {isMobile && !filtersExpanded && (
            <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0 }}>
              {startDate === endDate ? fmtDate(startDate) : `${fmtDate(startDate)} – ${fmtDate(endDate)}`} · {periodicityLabel}
            </p>
          )}

          {(!isMobile || filtersExpanded) && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 120px" }}>
                  <label style={fieldLabel}>Fecha Inicio</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    style={ui.input}
                  />
                </div>

                <div style={{ flex: "1 1 120px" }}>
                  <label style={fieldLabel}>Fecha Fin</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    style={ui.input}
                  />
                </div>
              </div>

              <div>
                <label style={fieldLabel}>Periodicidad SAT</label>
                <select
                  value={periodicity}
                  onChange={(e) => setPeriodicity(e.target.value)}
                  style={{ ...ui.input, cursor: "pointer" }}
                >
                  {PERIODICIDADES.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={fieldLabel}>Mes correspondiente</label>
                <select
                  value={derivedMonth}
                  disabled={true}  // ← no editable
                  style={{ ...ui.input, cursor: "not-allowed", opacity: 0.7 }}
                >
                  {MESES.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={fieldLabel}>Año correspondiente</label>
                <input
                  type="text"
                  value={derivedYear}
                  disabled={true}  // ← no editable
                  style={{ ...ui.input, cursor: "not-allowed", opacity: 0.7 }}
                />
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={loadEligibleTickets}
                  disabled={loading || stamping}
                  style={{ ...ui.ghostBtn, flex: 1, justifyContent: "center", height: 38 }}
                >
                  <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Actualizar
                </button>
                <button
                  onClick={handleClearFilters}
                  disabled={loading || stamping}
                  title="Limpiar filtros"
                  style={{ ...ui.ghostBtn, justifyContent: "center", height: 38, width: 42, padding: 0 }}
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          )}
        </Panel>

        {/* DETALLE Y RESULTADOS */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Alertas de Resultado */}
          {stampResult && (
            <div style={successAlert}>
              <CheckCircle size={24} style={{ flexShrink: 0 }} />
              <div>
                <strong style={{ display: "block", fontSize: 14 }}>¡Factura Global Timbrada Exitosamente!</strong>
                <p style={{ fontSize: 13, marginTop: 4 }}>
                  UUID: <span style={{ fontFamily: "monospace", fontWeight: 700 }}>{stampResult.cfdiUuid}</span>
                </p>
                <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                  <a
                    href={`${api.defaults.baseURL}/api/public/sales/invoice/${stampResult.cfdiUuid}/pdf`}
                    target="_blank"
                    rel="noreferrer"
                    style={downloadBtn}
                  >
                    Descargar PDF
                  </a>
                  <a
                    href={`${api.defaults.baseURL}/api/public/sales/invoice/${stampResult.cfdiUuid}/xml`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ ...downloadBtn, backgroundColor: "var(--text)" }}
                  >
                    Descargar XML
                  </a>
                </div>
              </div>
            </div>
          )}

          {stampError && (
            <div style={errorAlert}>
              <AlertCircle size={24} style={{ flexShrink: 0 }} />
              <div>
                <strong style={{ display: "block", fontSize: 14 }}>Error al Timbrar Factura Global</strong>
                <p style={{ fontSize: 13, marginTop: 4 }}>{stampError}</p>
              </div>
            </div>
          )}

          {hasAssociatedCustomers && (
            <div style={warningAlert}>
              <AlertCircle size={24} style={{ flexShrink: 0 }} />
              <div>
                <strong style={{ display: "block", fontSize: 14 }}>Atención: Clientes Asociados Detectados</strong>
                <p style={{ fontSize: 13, marginTop: 4 }}>
                  Se han omitido automáticamente los tickets con clientes registrados de esta lista,
                  ya que la Factura Global es exclusiva para ventas de Público General.
                </p>
              </div>
            </div>
          )}

          {/* RESUMEN DE VENTAS */}
          <Panel style={{ padding: 20 }}>
            <h3 style={{ fontSize: 15, fontWeight: 800, color: "var(--text)", marginBottom: 14 }}>Resumen de Lote a Facturar</h3>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
              <div style={{ display: "flex", flexDirection: "column", padding: "4px 8px", minWidth: isTablet ? 100 : 120, borderRight: isMobile ? "none" : "1px solid var(--border)" }}>
                <span style={kpiLabel}>Total Tickets</span>
                <span style={kpiVal}>{tickets.length}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", padding: "4px 8px", minWidth: isTablet ? 100 : 120, borderRight: isMobile ? "none" : "1px solid var(--border)" }}>
                <span style={kpiLabel}>IVA Trasladado</span>
                <span style={{ ...kpiVal, color: "#b45309" }}>{moneyExact(totalTax)}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", padding: "4px 8px", minWidth: isTablet ? 100 : 120 }}>
                <span style={kpiLabel}>Importe Total (Neto)</span>
                <span style={{ ...kpiVal, color: "#15803d" }}>{moneyExact(totalAmount)}</span>
              </div>
            </div>

            <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16, marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
              <button
                onClick={handleStampGlobal}
                disabled={tickets.length === 0 || stamping}
                style={{
                  ...ui.primaryBtn,
                  backgroundColor: stamping ? "#94a3b8" : "#1e3a8a",
                  opacity: tickets.length === 0 ? 0.6 : 1,
                  cursor: tickets.length === 0 ? "not-allowed" : "pointer"
                }}
              >
                {stamping ? "Timbrando Factura Global..." : "Timbrar Factura Global"}
              </button>
            </div>
          </Panel>

          {/* LISTADO DE TICKETS A INCLUIR */}
          <div style={ui.tableWrap}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", backgroundColor: "var(--surface-2)" }}>
              <strong style={{ fontSize: 13, color: "var(--text-secondary)" }}>Ventas completadas en el rango de fechas</strong>
            </div>

            {isMobile ? (
              /* ── Mobile / Tablet: Card-based layout ── */
              <div style={{ overflowY: "auto", maxHeight: "260px", padding: "8px 16px" }}>
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
                {!loading && !error && tickets.length === 0 && (
                  <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--text-faint)", fontSize: 13, fontWeight: 500 }}>
                    No hay ventas pendientes de facturar en este rango de fechas.
                  </div>
                )}

                {!loading &&
                  !error &&
                  tickets.map((t: any) => {
                    const isExpanded = expandedTickets[t.id];
                    return (
                      <div
                        key={t.id}
                        style={{
                          backgroundColor: "var(--surface)",
                          border: "1px solid var(--border)",
                          borderRadius: 12,
                          marginBottom: 10,
                          boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
                          overflow: "hidden",
                        }}
                      >
                        {/* Card header: Cliente */}
                        <div style={{
                          display: "flex",
                          justifyContent: "space-between",
                          padding: "8px 16px 6px 16px",
                          fontSize: 11,
                          fontWeight: 700,
                          color: "var(--text-muted)",
                          borderBottom: "1px solid var(--border-soft)",
                          backgroundColor: "var(--surface-2)",
                          letterSpacing: "0.2px",
                        }}>
                          <span>{t.customer ? t.customer.toUpperCase() : "PÚBLICO GENERAL"}</span>
                          <span><Badge tone="slate">Sin Facturar</Badge></span>
                        </div>

                        {/* Método e Impuestos: visibles siempre */}
                        <div style={{
                          display: "flex",
                          gap: 20,
                          padding: "10px 16px 0 16px",
                        }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            <span style={miniLabel}>Método</span>
                            <Badge tone={payTone(t.paymentMethod)}>{t.paymentMethod}</Badge>
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            <span style={miniLabel}>Impuestos</span>
                            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{moneyExact(t.taxAmount)}</span>
                          </div>
                        </div>

                        {/* Row base: Folio, Fecha, Total, Chevron */}
                        <div style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          flexWrap: "wrap",
                          gap: 12,
                          padding: "12px 16px",
                        }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 auto", minWidth: 120 }}>
                            <div style={{ fontWeight: 800, fontSize: 14, color: "var(--accent-strong)" }}>
                              {t.invoiceNumber}
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-secondary)" }}>
                              <span>{fmtDate(t.createdAt)}</span>
                              <span style={{ color: "var(--text-faint)" }}>{fmtTime(t.createdAt)}</span>
                            </div>
                          </div>

                          <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
                            <div style={{ fontSize: 15, fontWeight: 800, color: "var(--text)" }}>
                              {moneyExact(t.totalAmount)}
                            </div>
                            <button
                              onClick={() => toggleExpandTicket(t.id)}
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

                        {/* Expanded detail */}
                        {isExpanded && (
                          <div style={{
                            padding: "16px",
                            margin: "0 16px 16px 16px",
                            backgroundColor: "var(--surface-2)",
                            borderRadius: "8px",
                            border: "1px solid var(--border)",
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                            gap: "16px",
                          }}>
                            <div>
                              <h4 style={{ fontSize: 13, fontWeight: 800, color: "var(--text)", marginBottom: 10 }}>Datos de la Venta</h4>
                              <div style={facDetailRow}>
                                <span style={facDetailLabel}>Folio:</span>
                                <span style={facDetailValue}>{t.invoiceNumber}</span>
                              </div>
                              <div style={facDetailRow}>
                                <span style={facDetailLabel}>Cliente:</span>
                                <span style={facDetailValue}>{t.customer || "Público General"}</span>
                              </div>
                              <div style={facDetailRow}>
                                <span style={facDetailLabel}>Sucursal:</span>
                                <span style={facDetailValue}>{t.branch || "—"}</span>
                              </div>
                            </div>

                            <div>
                              <h4 style={{ fontSize: 13, fontWeight: 800, color: "var(--text)", marginBottom: 10 }}>Resumen</h4>
                              <div style={facDetailRow}>
                                <span style={facDetailLabel}>Artículos:</span>
                                <span style={facDetailValue}>{t.items ?? "—"}</span>
                              </div>
                              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 8 }}>
                                <span style={{ fontSize: 18, fontWeight: 700, color: "var(--text)" }}>Total:</span>
                                <span style={{ fontSize: 20, fontWeight: 800, color: "var(--accent-strong)" }}>{moneyExact(t.totalAmount)}</span>
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
              <div className="table-sticky-head" style={{ overflowX: "auto", overflowY: "auto", maxHeight: "260px" }}>
                <table style={{ ...ui.table, minWidth: 720 }}>
                  <thead>
                    <tr style={ui.theadRow}>
                      <th style={ui.th}>Folio Venta</th>
                      <th style={ui.th}>Fecha</th>
                      <th style={ui.th}>Cliente</th>
                      <th style={ui.th}>Método</th>
                      <th style={{ ...ui.th, textAlign: "right" }}>Impuestos</th>
                      <th style={{ ...ui.th, textAlign: "right" }}>Total</th>
                      <th style={{ ...ui.th, textAlign: "center" }}>Estatus</th>
                    </tr>
                  </thead>
                  <tbody>
                    <TableState
                      colSpan={7}
                      loading={loading}
                      error={error}
                      empty={!loading && !error && tickets.length === 0}
                      emptyText="No hay ventas pendientes de facturar en este rango de fechas."
                    />
                    {!loading && !error && tickets.map((t) => (
                      <tr key={t.id}>
                        <td style={{ ...ui.td, fontWeight: 700, color: "var(--accent-strong)" }}>{t.invoiceNumber}</td>
                        <td style={ui.td}>{fmtDate(t.createdAt)}</td>
                        <td style={ui.td}>{t.customer}</td>
                        <td style={ui.td}>
                          <Badge tone={payTone(t.paymentMethod)}>{t.paymentMethod}</Badge>
                        </td>
                        <td style={{ ...ui.td, textAlign: "right" }}>{moneyExact(t.taxAmount)}</td>
                        <td style={{ ...ui.td, textAlign: "right", fontWeight: 700 }}>{moneyExact(t.totalAmount)}</td>
                        <td style={{ ...ui.td, textAlign: "center" }}>
                          <Badge tone="slate">Sin Facturar</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={confirmStampOpen}
        onClose={() => setConfirmStampOpen(false)}
        onConfirm={confirmStampGlobal}
        variant="danger"
        title="Confirmar Factura Global"
        message={`¿Está seguro que desea timbrar la Factura Global de ${tickets.length} tickets? Esto enviará los datos al SAT de forma definitiva.`}
      />
    </div>
  );
};

// ─── Estilos ──────────────────────────────────────────────
const fieldLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "var(--text-secondary)",
  textTransform: "uppercase",
  letterSpacing: "0.4px",
  marginBottom: 6,
  display: "block",
};

const miniLabel: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: "var(--text-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.3px",
};

const kpiLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "var(--text-muted)",
  textTransform: "uppercase",
};

const kpiVal: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 800,
  color: "var(--text)",
  marginTop: 4,
};

const successAlert: React.CSSProperties = {
  display: "flex",
  gap: 16,
  backgroundColor: "#f0fdf4",
  border: "1px solid #bbf7d0",
  color: "#166534",
  padding: 16,
  borderRadius: 12,
};

const errorAlert: React.CSSProperties = {
  display: "flex",
  gap: 16,
  backgroundColor: "#fef2f2",
  border: "1px solid #fca5a5",
  color: "#b91c1c",
  padding: 16,
  borderRadius: 12,
};

const warningAlert: React.CSSProperties = {
  display: "flex",
  gap: 16,
  backgroundColor: "#fffbeb",
  border: "1px solid #fde68a",
  color: "#b45309",
  padding: 16,
  borderRadius: 12,
};

const downloadBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  backgroundColor: "#166534",
  color: "#ffffff",
  fontSize: 12,
  fontWeight: 700,
  padding: "6px 12px",
  borderRadius: 6,
  textDecoration: "none",
  cursor: "pointer",
};

const facDetailRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-start",
  alignItems: "flex-start",
  gap: "8px",
  fontSize: 13,
  marginBottom: 6,
};

const facDetailLabel: React.CSSProperties = {
  flexShrink: 0,
  fontWeight: 700,
  color: "var(--text-muted)",
  minWidth: "85px",
  display: "inline-block",
};

const facDetailValue: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  overflowWrap: "anywhere",
  fontWeight: 600,
  color: "var(--text-secondary)",
};

const payTone = (m: string) => {
  if (m === "EFECTIVO") return "green";
  if (m === "TARJETA") return "blue";
  if (m === "MIXTO") return "amber";
  return "slate";
};

export default FacturacionGlobalView;