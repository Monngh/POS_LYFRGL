import React, { useState, useEffect, useCallback } from "react";
import { RefreshCw, CheckCircle, AlertCircle } from "lucide-react";
import api from "../../services/api";
import {
  ui,
  type ViewProps,
  Badge,
  Panel,
  TableState,
  SectionHeader,
  moneyExact,
  fmtDate,
} from "./shared";

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
  // Configuración de la factura global
  const todayStr = new Date().toISOString().substring(0, 10);
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(todayStr);
  const [periodicity, setPeriodicity] = useState("day");
  const [month, setMonth] = useState(String(new Date().getMonth() + 1).padStart(2, "0"));
  const [year, setYear] = useState(String(new Date().getFullYear()));

  // Estado de los tickets a facturar
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Estado de timbrado
  const [stamping, setStamping] = useState(false);
  const [stampResult, setStampResult] = useState<any | null>(null);
  const [stampError, setStampError] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

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

      // Filtramos las que no estén facturadas y que sean estrictamente de Público General
      const sales = res.data.sales || [];
      
      const eligibleTickets = sales.filter((s: any) => 
        s.customer === "Público General" && 
        !s.cfdiUuid
      );

      setTickets(eligibleTickets);
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
  const handleStampGlobalClick = () => {
    if (tickets.length === 0) return;
    setShowConfirmModal(true);
  };

  const handleConfirmStampGlobal = async () => {
    setShowConfirmModal(false);

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

      <div className="fact-global-layout">
        
        {/* PANEL DE CONFIGURACIÓN */}
        <Panel style={{ padding: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 800, color: "#1e3a8a", marginBottom: 16 }}>Configurar Factura Global</h3>
          
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
                type="number"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                style={ui.input}
              />
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
            <h3 style={{ fontSize: 15, fontWeight: 800, color: "#0f172a", marginBottom: 14 }}>Resumen de Lote a Facturar</h3>
            
            <div className="fact-global-stats">
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
                onClick={handleStampGlobalClick}
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
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0", backgroundColor: "#f8fafc" }}>
              <strong style={{ fontSize: 13, color: "#334155" }}>Ventas completadas en el rango de fechas</strong>
            </div>
            <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", width: "100%" }}>
              <table style={ui.table}>
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
                    <td style={{ ...ui.td, fontWeight: 700, color: "#1e3a8a" }}>{t.invoiceNumber}</td>
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
          </div>

        </div>

      </div>

      {showConfirmModal && (
        <div style={modalOverlayStyle}>
          <div style={modalContentStyle}>
            <h3 style={{ fontSize: 18, fontWeight: 800, color: "#0f172a", marginBottom: 12 }}>Confirmar Timbrado</h3>
            <p style={{ fontSize: 14, color: "#475569", marginBottom: 24, lineHeight: 1.5 }}>
              ¿Está seguro que desea timbrar la Factura Global de <strong style={{color:"#0f172a"}}>{tickets.length}</strong> tickets?<br/><br/>
              Esto enviará los datos al SAT de forma definitiva y generará el folio fiscal UUID. Esta acción no se puede deshacer.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
              <button
                onClick={() => setShowConfirmModal(false)}
                style={{ ...ui.ghostBtn, border: "1px solid #cbd5e1" }}
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmStampGlobal}
                style={{ ...ui.primaryBtn, backgroundColor: "#1e3a8a" }}
              >
                Confirmar y Timbrar
              </button>
            </div>
          </div>
        </div>
      )}
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
  color: "#64748b",
  textTransform: "uppercase",
};

const kpiVal: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 800,
  color: "#0f172a",
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

const payTone = (m: string) => {
  if (m === "EFECTIVO") return "green";
  if (m === "TARJETA") return "blue";
  if (m === "MIXTO") return "amber";
  return "slate";
};

const modalOverlayStyle: React.CSSProperties = {
  position: "fixed",
  top: 0, left: 0, right: 0, bottom: 0,
  backgroundColor: "rgba(15, 23, 42, 0.6)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 9999,
  padding: 20
};

const modalContentStyle: React.CSSProperties = {
  backgroundColor: "#ffffff",
  borderRadius: 16,
  padding: 24,
  width: "100%",
  maxWidth: 420,
  boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25), 0 10px 15px -3px rgba(0,0,0,0.1)",
  border: "1px solid #e2e8f0"
};

export default FacturacionGlobalView;
