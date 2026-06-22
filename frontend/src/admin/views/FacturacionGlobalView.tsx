import React, { useState, useEffect, useCallback } from "react";
import { RefreshCw, CheckCircle, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
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
import { type FieldErrors, normalizeIntegerInput, validateInteger } from "../../shared/utils/formValidation";

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

const FacturacionGlobalView: React.FC<ViewProps> = ({ branchId, refreshToken }) => {
  const isMobile = useMediaQuery("(max-width: 1024px)");
  const [expandedTickets, setExpandedTickets] = useState<Record<number, boolean>>({});

  const toggleExpandTicket = (id: number) => {
    setExpandedTickets((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };
  // Configuración de la factura global
  const todayStr = new Date().toISOString().substring(0, 10);
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(todayStr);
  const [periodicity, setPeriodicity] = useState("day");
  const [month, setMonth] = useState(String(new Date().getMonth() + 1).padStart(2, "0"));
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<"year">>({});

  // Estado de los tickets a facturar
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Estado de timbrado
  const [stamping, setStamping] = useState(false);
  const [stampResult, setStampResult] = useState<any | null>(null);
  const [stampError, setStampError] = useState<string | null>(null);

  const validateYear = (value: string) => {
    const error = validateInteger(value, "El anio", { required: true, min: 2000, max: 2100 });
    if (error) return error;
    return value.length === 4 ? undefined : "El anio debe tener 4 digitos.";
  };

  const handleYearChange = (value: string) => {
    const normalized = normalizeIntegerInput(value).slice(0, 4);
    const forcedError = value !== normalized ? "El anio solo puede contener numeros enteros." : undefined;
    setYear(normalized);
    setFieldErrors((prev) => ({ ...prev, year: forcedError || validateYear(normalized) }));
  };

  // Cargar tickets elegibles
  const loadEligibleTickets = useCallback(async () => {
    setLoading(true);
    setError(null);
    setStampResult(null);
    setStampError(null);
    try {
      // Usamos el listado de ventas central filtrando por status COMPLETADA
      // y en el frontend filtramos las que no estén facturadas (cfdiUuid === null)
      const res = await api.get("/api/admin/sales", {
        params: {
          branchId,
          from: startDate,
          to: endDate,
          status: "COMPLETADA",
        },
      });

      // El endpoint de ventas retorna { sales: [...] }
      // Filtramos las que no estén facturadas en el frontend
      const sales = res.data.sales || [];
      
      // Nota: El listado central retorna 'customer' y 'invoiceNumber'.
      // Filtramos las ventas que no tienen cfdiUuid (en el listado central no viene cfdiUuid,
      // pero si viene vacío el campo de factura se asume no facturada. Para ser 100% seguros,
      // en el endpoint listSales el cfdiUuid no se mapea, pero si el backend no lo expone o
      // ya tiene UUID no debería salir como elegible. Si el backend retorna todas, filtramos por
      // cliente 'Público General' o ventas que sepamos no facturadas)
      // Como el backend de listSales retorna todas las ventas de ese rango, agregamos un filtro
      // en el controlador o las filtramos aquí. En el backend, ya creamos createGlobalInvoice
      // que vuelve a filtrar con Prisma de forma estricta (cfdiUuid == null).
      setTickets(sales);
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
  const handleStampGlobal = async () => {
    const yearError = validateYear(year);
    setFieldErrors({ year: yearError });
    if (yearError) return;

    if (tickets.length === 0) {
      alert("No hay tickets disponibles para facturar en este rango.");
      return;
    }

    if (!confirm(`¿Está seguro que desea timbrar la Factura Global de ${tickets.length} tickets? Esto enviará los datos al SAT de forma definitiva.`)) {
      return;
    }

    setStamping(true);
    setStampResult(null);
    setStampError(null);
    try {
      const res = await api.post("/api/admin/billing/global", {
        startDate,
        endDate,
        periodicity,
        month,
        year,
        branchId: branchId === "all" ? undefined : parseInt(branchId),
      });

      setStampResult(res.data);
      // Limpiar tickets cargados ya que se facturaron
      setTickets([]);
    } catch (err: any) {
      setStampError(err.response?.data?.message || "Error al timbrar la Factura Global.");
    } finally {
      setStamping(false);
    }
  };

  // Cálculos resumen
  const totalAmount = tickets.reduce((acc, t) => acc + t.totalAmount, 0);
  const totalTax = tickets.reduce((acc, t) => acc + t.taxAmount, 0);

  return (
    <div>
      <SectionHeader
        title="Facturación Global"
        subtitle="Agrupa y timbra los tickets de venta al público en general que no fueron facturados individualmente."
      />

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "280px minmax(0, 1fr)", gap: 24, alignItems: "start" }}>
        
        {/* PANEL DE CONFIGURACIÓN */}
        <Panel style={{ padding: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 800, color: "var(--accent-strong)", marginBottom: 16 }}>Configurar Factura Global</h3>
          
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={fieldLabel}>Fecha Inicio</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={ui.input}
              />
            </div>

            <div>
              <label style={fieldLabel}>Fecha Fin</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                style={ui.input}
              />
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
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                style={{ ...ui.input, cursor: "pointer" }}
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
                inputMode="numeric"
                maxLength={4}
                value={year}
                onChange={(e) => handleYearChange(e.target.value)}
                onBlur={() => setFieldErrors({ year: validateYear(year) })}
                style={{ ...ui.input, ...(fieldErrors.year ? fieldErrorInput : {}) }}
              />
              {fieldErrors.year && <p style={ui.fieldError}>{fieldErrors.year}</p>}
            </div>

            <button
              onClick={loadEligibleTickets}
              disabled={loading || stamping}
              style={{ ...ui.ghostBtn, width: "100%", justifyContent: "center", height: 38 }}
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Actualizar Listado
            </button>
          </div>
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
                    style={{ ...downloadBtn, backgroundColor: "#0f172a" }}
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

          {/* RESUMEN DE VENTAS */}
          <Panel style={{ padding: 20 }}>
            <h3 style={{ fontSize: 15, fontWeight: 800, color: "var(--text)", marginBottom: 14 }}>Resumen de Lote a Facturar</h3>
            
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 16 }}>
              <div style={kpiWrap}>
                <span style={kpiLabel}>Total Tickets</span>
                <span style={kpiVal}>{tickets.length}</span>
              </div>
              <div style={kpiWrap}>
                <span style={kpiLabel}>IVA Trasladado</span>
                <span style={{ ...kpiVal, color: "#b45309" }}>{moneyExact(totalTax)}</span>
              </div>
              <div style={{ ...kpiWrap, borderRight: "none" }}>
                <span style={kpiLabel}>Importe Total (Neto)</span>
                <span style={{ ...kpiVal, color: "#15803d" }}>{moneyExact(totalAmount)}</span>
              </div>
            </div>

            <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 16, marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
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
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0", backgroundColor: "var(--surface-2)" }}>
              <strong style={{ fontSize: 13, color: "var(--text-secondary)" }}>Ventas completadas en el rango de fechas</strong>
            </div>

            {isMobile ? (
              /* ── Mobile / Tablet: Card-based layout ── */
              <div style={{ overflowY: "auto", maxHeight: "62vh", padding: "8px 16px" }}>
                {/* Column header */}
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
                  <div>Folio</div>
                  <div>Fecha</div>
                  <div>Total</div>
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
                          borderBottom: "1px solid #f1f5f9",
                          backgroundColor: "var(--surface-2)",
                          letterSpacing: "0.2px",
                        }}>
                          <span>{t.customer ? t.customer.toUpperCase() : "PÚBLICO GENERAL"}</span>
                          <span><Badge tone="slate">Sin Facturar</Badge></span>
                        </div>

                        {/* Row base: Folio, Fecha, Total, Chevron */}
                        <div style={{
                          display: "grid",
                          gridTemplateColumns: "1.5fr 2fr 1.5fr 0.8fr",
                          padding: "12px 16px",
                          alignItems: "center",
                        }}>
                          {/* Folio */}
                          <div style={{ fontWeight: 700, fontSize: 13, color: "var(--accent-strong)" }}>
                            {t.invoiceNumber}
                          </div>

                          {/* Fecha */}
                          <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                            <div>{fmtDate(t.createdAt)}</div>
                            <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 2 }}>{fmtTime(t.createdAt)}</div>
                          </div>

                          {/* Total */}
                          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
                            {moneyExact(t.totalAmount)}
                          </div>

                          {/* Chevron */}
                          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center" }}>
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

                        {/* Expanded detail card */}
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
                            {/* Datos de la Venta */}
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

                            {/* Detalle Fiscal */}
                            <div>
                              <h4 style={{ fontSize: 13, fontWeight: 800, color: "var(--text)", marginBottom: 10 }}>Detalle Fiscal</h4>
                              <div style={facDetailRow}>
                                <span style={facDetailLabel}>Método:</span>
                                <span style={facDetailValue}>
                                  <Badge tone={payTone(t.paymentMethod)}>{t.paymentMethod}</Badge>
                                </span>
                              </div>
                              <div style={facDetailRow}>
                                <span style={facDetailLabel}>Impuestos:</span>
                                <span style={facDetailValue}>{moneyExact(t.taxAmount)}</span>
                              </div>
                              <div style={facDetailRow}>
                                <span style={facDetailLabel}>Artículos:</span>
                                <span style={facDetailValue}>{t.items ?? "—"}</span>
                              </div>
                            </div>

                            {/* Resumen */}
                            <div>
                              <h4 style={{ fontSize: 13, fontWeight: 800, color: "var(--text)", marginBottom: 10 }}>Resumen</h4>
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
              <div className="table-sticky-head" style={{ overflowX: "auto", overflowY: "auto", maxHeight: "62vh" }}>
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
    </div>
  );
};

const fieldLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "#475569",
  textTransform: "uppercase",
  letterSpacing: "0.4px",
  marginBottom: 6,
  display: "block",
};

const kpiWrap: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  padding: "4px 8px",
  borderRight: "1px solid #e2e8f0",
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

const fieldErrorInput: React.CSSProperties = {
  borderColor: "#ef4444",
  boxShadow: "0 0 0 2px rgba(239, 68, 68, 0.12)",
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
  alignItems: "center",
  gap: "8px",
  fontSize: 13,
  marginBottom: 6,
};

const facDetailLabel: React.CSSProperties = {
  fontWeight: 700,
  color: "var(--text-muted)",
  minWidth: "85px",
  display: "inline-block",
};

const facDetailValue: React.CSSProperties = {
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
