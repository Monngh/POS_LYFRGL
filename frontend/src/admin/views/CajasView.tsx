import React, { useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "../../auth";
import { AlertTriangle, Ban, Calendar, ChevronDown, ChevronUp, DollarSign, Eye, Printer, X } from "lucide-react";
import api from "../../shared/services/api";
import { validateReference } from "../../shared/utils/formValidation";
import {
  ui,
  type ViewProps,
  Toolbar,
  FilterSelect,
  Badge,
  TableState,
  SectionHeader,
  money,
  fmtDate,
  fmtTime,
  fmtDateTime,
  statusTone,
  printTicketHtml,
  useMediaQuery,
  usePagination,
  Pagination,
} from "./shared";
import { useToast } from "../../shared/context/ToastContext";

// ============================================================================
// Tipos y funciones auxiliares
// ============================================================================

interface SessionRow {
  id: number;
  branch: string;
  cajero: string;
  openedAt: string;
  closedAt: string | null;
  initialAmount: number;
  cashIn: number;
  cashOut: number;
  expectedAmount: number;
  declaredAmount: number | null;
  difference: number | null;
  salesCount: number;
  status: string;
  forceCloseReason?: string | null;
  forcedByAdmin?: string | null;
}

const calculateDuration = (start: string, end: string) => {
  const diff = new Date(end).getTime() - new Date(start).getTime();
  if (diff < 0) return "—";
  const h = Math.floor(diff / (1000 * 60 * 60));
  const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `${h}h ${m}m`;
};

interface SessionDetail extends SessionRow {
  forceCloseReason: string | null;
  forcedByAdmin: string | null;
  payBreakdown: {
    efectivo: number;
    tarjetaCredito: number;
    tarjetaDebito: number;
    mercadoPago: number;
    totalVentas: number;
  };
  movements: {
    id: number;
    date: string;
    type: string;
    description: string;
    amount: number;
    balance: number;
  }[];
}

// ============================================================================
// Componente de badge para tipo de cierre (igual que en AdminAccessLogView)
// ============================================================================

const ClosureTypeBadge: React.FC<{ type: string }> = ({ type }) => {
  const isRevoked = type === "REVOCADO";
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: 12,
        fontSize: 11,
        fontWeight: 700,
        backgroundColor: isRevoked ? "#fee2e2" : "#dcfce7",
        color: isRevoked ? "#b91c1c" : "#15803d",
        whiteSpace: "nowrap",
      }}
    >
      {isRevoked ? "Revocado" : "Normal"}
    </span>
  );
};

// ============================================================================
// Estilos y componentes auxiliares
// ============================================================================

const dateInput: React.CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: 8,
  height: 38,
  padding: "0 10px",
  fontSize: 13,
  fontWeight: 500,
  color: "var(--text-secondary)",
  backgroundColor: "var(--surface)",
  outline: "none",
  fontFamily: "inherit",
  cursor: "pointer",
  flex: "1 1 120px",
  minWidth: 0,
  maxWidth: 180,
};

const clearBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 28,
  height: 28,
  border: "1px solid var(--border)",
  borderRadius: 6,
  backgroundColor: "var(--surface)",
  color: "var(--text-muted)",
  cursor: "pointer",
  fontSize: 12,
};

const sectionLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "var(--text-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.5px",
  marginBottom: 10,
};

const finBox: React.CSSProperties = {
  backgroundColor: "var(--surface-2)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "12px 16px",
  display: "flex",
  flexDirection: "column",
  gap: 4,
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

const FinRow: React.FC<{
  label: string;
  value: React.ReactNode;
  bold?: boolean;
  color?: string;
  isMobile?: boolean;
}> = ({ label, value, bold, color, isMobile }) => (
  <div
    style={{
      display: "flex",
      flexDirection: isMobile ? "column" : "row",
      justifyContent: isMobile ? "flex-start" : "space-between",
      fontSize: 13,
      alignItems: isMobile ? "flex-start" : "center",
      gap: isMobile ? 2 : 0,
      paddingBottom: isMobile ? 6 : 0,
    }}
  >
    <span style={{ color: "var(--text-muted)" }}>{label}</span>
    <span
      style={{
        fontWeight: bold ? 800 : 600,
        color: color ?? "var(--text)",
        fontSize: isMobile ? 15 : 13,
      }}
    >
      {value}
    </span>
  </div>
);

// ============================================================================
// Componente principal
// ============================================================================

// Traduce el `estado` recibido desde el Dashboard al valor interno de status.
const mapCajasEstadoFilter = (estado?: string): string | null => {
  if (!estado) return null;
  const normalized = estado.trim().toLowerCase();
  if (normalized === "abiertas" || normalized === "abierta") return "ABIERTA";
  if (normalized === "cerradas" || normalized === "cerrada") return "CERRADA";
  return null;
};

const CajasView: React.FC<ViewProps> = ({ branchId, refreshToken, initialFilters }) => {
  const { showToast } = useToast();
  const { user } = useAuth();
  const isMobile = useMediaQuery("(max-width: 1024px)");
  const [expandedSessions, setExpandedSessions] = useState<Record<number, boolean>>({});
  const toggleExpand = (id: number) => {
    setExpandedSessions((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const [rows, setRows] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [filterUserId, setFilterUserId] = useState("");
  const [employees, setEmployees] = useState<{ id: number; name: string }[]>([]);

  const [activeTab, setActiveTab] = useState<"turnos" | "historial">("turnos");
  const [historialType, setHistorialType] = useState("all");

  const paged = usePagination(rows, { resetKey: `${branchId}|${status}|${from}|${to}|${filterUserId}` });

  const historialRows = React.useMemo(() => {
    return rows.filter((r) => {
      if (!r.closedAt) return false;
      if (historialType === "REVOCADO" && r.status !== "REVOCADO") return false;
      if (historialType === "NORMAL" && r.status === "REVOCADO") return false;
      return true;
    });
  }, [rows, historialType]);

  const pagedHistorial = usePagination(historialRows, { resetKey: `${branchId}|${historialType}|${from}|${to}|${filterUserId}` });

  const [hoveredRow, setHoveredRow] = useState<number | null>(null);

  // Aplica el filtro entregado por la vista de origen (ej. tarjetas del Dashboard)
  // una sola vez al montar, sin quedar "pegado" a cambios manuales posteriores.
  const appliedInitialFilters = useRef(false);
  useEffect(() => {
    if (appliedInitialFilters.current) return;
    appliedInitialFilters.current = true;
    const mapped = mapCajasEstadoFilter(initialFilters?.estado);
    if (mapped) setStatus(mapped);
  }, [initialFilters]);

  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedDetail, setSelectedDetail] = useState<SessionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [forceOpen, setForceOpen] = useState(false);
  const [forceConfirmOpen, setForceConfirmOpen] = useState(false);
  const [forceReason, setForceReason] = useState("");
  const [forceReasonError, setForceReasonError] = useState("");
  const [forceLoading, setForceLoading] = useState(false);
  const [forceError, setForceError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {};
      if (branchId !== "all") params.branchId = branchId;
      if (status !== "all") params.status = status;
      if (from) params.from = from;
      if (to) params.to = to;
      if (filterUserId) params.userId = filterUserId;

      const res = await api.get<{ sessions: SessionRow[] }>("/api/admin/cash-sessions", { params });
      setRows(res.data.sessions);
    } catch (err: any) {
      setError(err.response?.data?.message || "No se pudieron cargar las sesiones de caja.");
    } finally {
      setLoading(false);
    }
  }, [branchId, status, from, to, filterUserId, refreshToken]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const params: Record<string, string> = {};
    if (branchId !== "all") params.branchId = branchId;
    api
      .get<{ employees: { id: number; name: string }[] }>("/api/admin/employees", { params })
      .then((res) => setEmployees(res.data.employees))
      .catch(() => setEmployees([]));
  }, [branchId]);

  const openDetail = async (id: number) => {
    setDetailOpen(true);
    setSelectedDetail(null);
    setDetailLoading(true);
    setDetailError(null);
    setForceOpen(false);
    setForceConfirmOpen(false);
    setForceReason("");
    setForceError(null);
    try {
      const res = await api.get<{
        session: Omit<SessionDetail, "payBreakdown" | "movements">;
        payBreakdown: SessionDetail["payBreakdown"];
        movements: SessionDetail["movements"];
      }>(`/api/admin/cash-sessions/${id}`);
      setSelectedDetail({ ...res.data.session, payBreakdown: res.data.payBreakdown, movements: res.data.movements });
    } catch (err: any) {
      setDetailError(err.response?.data?.message || "No se pudieron cargar los detalles de la sesión.");
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setDetailOpen(false);
    setSelectedDetail(null);
    setForceOpen(false);
    setForceConfirmOpen(false);
    setForceReason("");
    setForceReasonError("");
    setForceError(null);
  };

  const handleForceClose = async () => {
    if (!selectedDetail) return;
    const reasonError = validateReference(forceReason, "El motivo", { required: true, max: 180 });
    if (reasonError) {
      setForceReasonError(reasonError);
      return;
    }
    setForceLoading(true);
    setForceError(null);
    setForceReasonError("");
    try {
      await api.put(`/api/admin/cash-sessions/${selectedDetail.id}/force-close`, {
        reason: forceReason.trim(),
        forcedBy: user?.id ?? 0,
      });
      closeDetail();
      load();
    } catch (err: any) {
      setForceError(err.response?.data?.message || "Error al cerrar la caja forzadamente.");
    } finally {
      setForceLoading(false);
    }
  };

  const printCashReport = () => {
    if (!selectedDetail) return;

    const d = selectedDetail;
    const diffColor = d.difference === null ? "#94a3b8" : d.difference >= 0 ? "#15803d" : "#b91c1c";
    const diffStr =
      d.difference !== null
        ? `${d.difference >= 0 ? "+" : ""}$${d.difference.toFixed(2)}`
        : "—";

    let body = `
      <div class="doc-header">
        <div>
          <div class="doc-brand">LYFRGL POS</div>
          <div class="doc-sub">Arqueo de Caja · Caja #${d.id}</div>
        </div>
        <div>
          <div class="doc-title">Cajero: ${d.cajero}</div>
          <div class="doc-meta">Sucursal: ${d.branch}</div>
          <div class="doc-meta">Estado: ${d.status}</div>
          <div class="doc-meta">Apertura: ${fmtDateTime(d.openedAt)}</div>
          ${d.closedAt ? `<div class="doc-meta">Cierre: ${fmtDateTime(d.closedAt)}</div>` : ""}
        </div>
      </div>

      <div class="kpis">
        <div class="kpi"><div class="l">Fondo inicial</div><div class="v">$${d.initialAmount.toFixed(2)}</div></div>
        <div class="kpi"><div class="l">Esperado</div><div class="v">$${d.expectedAmount.toFixed(2)}</div></div>
        <div class="kpi"><div class="l">Declarado</div><div class="v">${d.declaredAmount !== null ? "$" + d.declaredAmount.toFixed(2) : "—"}</div></div>
        <div class="kpi"><div class="l">Diferencia</div><div class="v" style="color:${diffColor}">${diffStr}</div></div>
      </div>

      <h3>Desglose financiero</h3>
      <table>
        <tr><td>Monto inicial (fondo)</td><td class="r">$${d.initialAmount.toFixed(2)}</td></tr>
        <tr><td>+ Ventas (efectivo neto)</td><td class="r">$${d.cashIn.toFixed(2)}</td></tr>
        <tr><td>− Depósitos (salidas)</td><td class="r">$${d.cashOut.toFixed(2)}</td></tr>
        <tr><td><strong>= Esperado (teórico)</strong></td><td class="r"><strong>$${d.expectedAmount.toFixed(2)}</strong></td></tr>
        <tr><td>Declarado (contado)</td><td class="r">${d.declaredAmount !== null ? "$" + d.declaredAmount.toFixed(2) : "—"}</td></tr>
        <tr><td><strong>Diferencia</strong></td><td class="r" style="color:${diffColor}"><strong>${diffStr}</strong></td></tr>
      </table>

      <h3>Por método de pago (ventas completadas)</h3>
      <table>
        <tr><td>Efectivo</td><td class="r">$${d.payBreakdown.efectivo.toFixed(2)}</td></tr>
        <tr><td>Tarjeta crédito</td><td class="r">$${d.payBreakdown.tarjetaCredito.toFixed(2)}</td></tr>
        <tr><td>Tarjeta débito</td><td class="r">$${d.payBreakdown.tarjetaDebito.toFixed(2)}</td></tr>
        <tr><td>MercadoPago QR</td><td class="r">$${d.payBreakdown.mercadoPago.toFixed(2)}</td></tr>
        <tr><td><strong>Total ventas</strong></td><td class="r"><strong>$${d.payBreakdown.totalVentas.toFixed(2)}</strong></td></tr>
      </table>

      <h3>Últimos movimientos (${d.movements.length})</h3>
      <table>
        <thead>
          <tr>
            <th>Fecha / Hora</th><th>Tipo</th><th>Descripción</th>
            <th class="r">Monto</th><th class="r">Saldo</th>
          </tr>
        </thead>
        <tbody>
          ${d.movements
        .map(
          (m) => `<tr>
                <td>${fmtDateTime(m.date)}</td>
                <td>${m.type}</td>
                <td>${m.description}</td>
                <td class="r" style="color:${m.amount >= 0 ? "#15803d" : "#b91c1c"}">${m.amount >= 0 ? "+" : ""}$${m.amount.toFixed(2)}</td>
                <td class="r">$${m.balance.toFixed(2)}</td>
              </tr>`
        )
        .join("")}
        </tbody>
      </table>
    `;

    body = `
      <div>
        <div class="ticket-header">
          <span class="ticket-store">LYFRGL POS</span>
          <span class="ticket-muted">Sucursal: ${d.branch}</span>
          <span class="ticket-operation">ARQUEO DE CAJA</span>
        </div>
        <div class="ticket-section">
          <div class="ticket-row"><span>Folio:</span><span class="ticket-value">Caja #${d.id}</span></div>
          <div class="ticket-row"><span>Cajero:</span><span class="ticket-value">${d.cajero}</span></div>
          <div class="ticket-row"><span>Estado:</span><span class="ticket-value">${d.status}</span></div>
          <div class="ticket-row"><span>Apertura:</span><span class="ticket-value">${fmtDateTime(d.openedAt)}</span></div>
          ${d.closedAt ? `<div class="ticket-row"><span>Cierre:</span><span class="ticket-value">${fmtDateTime(d.closedAt)}</span></div>` : ""}
        </div>
        <div class="ticket-section">
          <div class="ticket-row"><span>Fondo inicial:</span><span class="ticket-value">$${d.initialAmount.toFixed(2)}</span></div>
          <div class="ticket-row"><span>Ventas efectivo:</span><span class="ticket-value">$${d.cashIn.toFixed(2)}</span></div>
          <div class="ticket-row"><span>Depositos/salidas:</span><span class="ticket-value">-$${d.cashOut.toFixed(2)}</span></div>
          <div class="ticket-row"><span>Efectivo esperado:</span><span class="ticket-value">$${d.expectedAmount.toFixed(2)}</span></div>
          <div class="ticket-row"><span>Declarado:</span><span class="ticket-value">${d.declaredAmount !== null ? "$" + d.declaredAmount.toFixed(2) : "N/A"}</span></div>
          <div class="ticket-row ticket-total"><span>Diferencia:</span><span style="color:${diffColor}">${diffStr}</span></div>
        </div>
        <div class="ticket-section">
          <div class="ticket-row"><span>Efectivo:</span><span class="ticket-value">$${d.payBreakdown.efectivo.toFixed(2)}</span></div>
          <div class="ticket-row"><span>T. credito:</span><span class="ticket-value">$${d.payBreakdown.tarjetaCredito.toFixed(2)}</span></div>
          <div class="ticket-row"><span>T. debito:</span><span class="ticket-value">$${d.payBreakdown.tarjetaDebito.toFixed(2)}</span></div>
          <div class="ticket-row"><span>MercadoPago:</span><span class="ticket-value">$${d.payBreakdown.mercadoPago.toFixed(2)}</span></div>
          <div class="ticket-row ticket-total"><span>Total ventas:</span><span>$${d.payBreakdown.totalVentas.toFixed(2)}</span></div>
        </div>
        <div class="ticket-section">
          <div style="font-weight:800;margin-bottom:4px;">MOVIMIENTOS (${d.movements.length})</div>
          ${d.movements
        .map(
          (m) => `
                <div style="border-top:1px dashed #cbd5e1;padding-top:4px;margin-top:4px;">
                  <div class="ticket-row"><span>${fmtDateTime(m.date)}</span><span class="ticket-value">${m.type}</span></div>
                  <div style="font-size:9px;margin-bottom:3px;">${m.description}</div>
                  <div class="ticket-row"><span>Monto:</span><span class="ticket-value" style="color:${m.amount >= 0 ? "#15803d" : "#b91c1c"}">${m.amount >= 0 ? "+" : ""}$${m.amount.toFixed(2)}</span></div>
                  <div class="ticket-row"><span>Saldo:</span><span class="ticket-value">$${m.balance.toFixed(2)}</span></div>
                </div>`
        )
        .join("")}
        </div>
        <div class="ticket-footer">
          <p>COMPROBANTE DE ARQUEO</p>
          <p>Documento generado el ${new Date().toLocaleString("es-MX")}</p>
        </div>
      </div>
    `;

    printTicketHtml(`Arqueo Caja #${d.id}`, body, showToast);
  };

  const openCount = rows.filter((r) => r.status === "ABIERTA").length;
  const diffColor = (d: number | null) =>
    d === null ? "#94a3b8" : d < 0 ? "#b91c1c" : d > 0 ? "#15803d" : "var(--text-secondary)";

  const movTypeColor = (type: string) =>
    type === "VENTA" ? "#15803d" : type === "CANCELACIÓN" ? "#b91c1c" : "#2563eb";

  // ========================================================================
  // RENDER
  // ========================================================================

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%" }}>
      <SectionHeader title="Cajas" subtitle="Turnos y arqueos de caja registrados" />

      <div style={{ display: "flex", gap: 0, marginBottom: 18, borderBottom: "1px solid var(--border)" }}>
        {(["turnos", "historial"] as const).map((tab) => {
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                background: "none",
                border: "none",
                borderBottom: isActive ? "2px solid var(--accent)" : "2px solid transparent",
                marginBottom: -1,
                padding: "8px 20px",
                fontSize: 14,
                fontWeight: isActive ? 700 : 500,
                color: isActive ? "var(--accent-strong)" : "var(--text-muted)",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {tab === "turnos" ? "Turnos Registrados" : "Historial de Cierres"}
            </button>
          );
        })}
      </div>

      <Toolbar style={{ gap: isMobile ? 8 : 10, padding: isMobile ? "0 4px" : 0 }}>
        <div
          style={{
            display: "flex",
            gap: 8,
            width: isMobile ? "100%" : "auto",
            flexWrap: isMobile ? "wrap" : "nowrap",
            flex: isMobile ? 1 : "none",
          }}
        >
          {activeTab === "turnos" ? (
            <FilterSelect
              value={status}
              onChange={setStatus}
              options={[
                { value: "all", label: "Todos los turnos" },
                { value: "ABIERTA", label: "Abiertas" },
                { value: "CERRADA", label: "Cerradas" },
              ]}
              style={isMobile ? { flex: "1 1 calc(50% - 4px)", minWidth: 120 } : {}}
            />
          ) : (
            <FilterSelect
              value={historialType}
              onChange={setHistorialType}
              options={[
                { value: "all", label: "Todos los cierres" },
                { value: "NORMAL", label: "Normales" },
                { value: "REVOCADO", label: "Revocados" },
              ]}
              style={isMobile ? { flex: "1 1 calc(50% - 4px)", minWidth: 120 } : {}}
            />
          )}
          <FilterSelect
            value={filterUserId}
            onChange={setFilterUserId}
            options={[
              { value: "", label: "Todos los cajeros" },
              ...employees.map((e) => ({ value: String(e.id), label: e.name })),
            ]}
            style={isMobile ? { flex: "1 1 calc(50% - 4px)", minWidth: 120 } : {}}
          />
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            width: isMobile ? "100%" : "auto",
            marginTop: isMobile ? 4 : 0,
            overflowX: "auto",
          }}
        >
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "var(--text-secondary)",
              display: isMobile ? "none" : "inline",
            }}
          >
            Desde:
          </span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            style={{ ...dateInput, ...(isMobile ? { flex: "1 1 120px", maxWidth: "none" } : {}) }}
          />
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "var(--text-secondary)",
              display: isMobile ? "none" : "inline",
            }}
          >
            Hasta:
          </span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            style={{ ...dateInput, ...(isMobile ? { flex: "1 1 120px", maxWidth: "none" } : {}) }}
          />
          {(from || to) && (
            <button
              onClick={() => {
                setFrom("");
                setTo("");
              }}
              style={clearBtn}
              title="Limpiar fechas"
            >
              <X size={13} />
            </button>
          )}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: isMobile ? "100%" : "auto",
            flex: 1,
            padding: isMobile ? "0 4px" : 0,
          }}
        >
          {activeTab === "turnos" && openCount > 0 ? (
            <span style={{ fontSize: 13, color: "#15803d", fontWeight: 700 }}>{openCount} abierta(s)</span>
          ) : (
            <span />
          )}
          <span style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: 600 }}>
            {activeTab === "turnos" ? (
              <>
                {rows.length} sesión{rows.length === 1 ? "" : "es"}
              </>
            ) : (
              <>
                {pagedHistorial.total} cierre{pagedHistorial.total === 1 ? "" : "s"}
              </>
            )}
          </span>
        </div>
      </Toolbar>

      {/* ====================================================================
          CONTENIDO SEGÚN PESTAÑA
          ==================================================================== */}
      {activeTab === "turnos" ? (
        <>
          {isMobile ? (
            // ---- MÓVIL: vista de tarjetas ----
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "8px 4px", width: "100%" }}>
              {loading && (
                <div
                  style={{
                    textAlign: "center",
                    padding: "32px 16px",
                    color: "var(--text-faint)",
                    fontSize: 13,
                    fontWeight: 500,
                  }}
                >
                  Cargando información...
                </div>
              )}
              {error && (
                <div
                  style={{
                    textAlign: "center",
                    padding: "32px 16px",
                    color: "#b91c1c",
                    fontSize: 13,
                    fontWeight: 500,
                  }}
                >
                  {error}
                </div>
              )}
              {!loading && !error && rows.length === 0 && (
                <div
                  style={{
                    textAlign: "center",
                    padding: "32px 16px",
                    color: "var(--text-faint)",
                    fontSize: 13,
                    fontWeight: 500,
                  }}
                >
                  No hay sesiones de caja para mostrar.
                </div>
              )}

              {!loading &&
                !error &&
                paged.pageItems.map((s) => {
                  const isExpanded = expandedSessions[s.id];
                  return (
                    <div
                      key={s.id}
                      style={{
                        backgroundColor: "var(--surface)",
                        border: "1px solid var(--border-soft)",
                        borderRadius: 16,
                        marginBottom: 12,
                        boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          padding: "10px 16px",
                          fontSize: 11,
                          fontWeight: 700,
                          color: "var(--text-muted)",
                          borderBottom: "1px solid var(--border-soft)",
                          backgroundColor: "var(--surface-2)",
                          letterSpacing: "0.2px",
                        }}
                      >
                        <span>{s.branch.toUpperCase()}</span>
                        <span>CAJERO: {s.cajero.toUpperCase()}</span>
                      </div>

                      <div style={{ padding: 16 }}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "flex-start",
                            gap: 12,
                          }}
                        >
                          <div style={{ flex: 1 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                              <span style={{ fontSize: 16, fontWeight: 700, color: "var(--accent)" }}>
                                Caja #{s.id}
                              </span>
                              <Badge tone={statusTone(s.status)}>{s.status}</Badge>
                            </div>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                fontSize: 13,
                                color: "var(--text-secondary)",
                                marginBottom: 6,
                              }}
                            >
                              <Calendar size={14} color="#2563eb" />
                              <span>
                                Apertura: {fmtDate(s.openedAt)} {fmtTime(s.openedAt)}
                              </span>
                            </div>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                fontSize: 13,
                                color: "var(--text-secondary)",
                              }}
                            >
                              <DollarSign size={14} color="#2563eb" />
                              <span>Fondo Inicial: {money(s.initialAmount)}</span>
                            </div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", alignSelf: "center" }}>
                            <button
                              onClick={() => toggleExpand(s.id)}
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

                        {isExpanded && (
                          <div
                            style={{
                              marginTop: 12,
                              paddingTop: 12,
                              borderTop: "1px solid var(--border-soft)",
                            }}
                          >
                            <div style={{ marginBottom: 12 }}>
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
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 6,
                                }}
                                className="active-tap"
                              >
                                <Eye size={15} /> Ver detalle (Arqueo/Movimientos)
                              </button>
                            </div>
                            <div
                              style={{
                                backgroundColor: "var(--surface-2)",
                                borderRadius: 12,
                                border: "1px solid var(--border)",
                                padding: 16,
                              }}
                            >
                              <h4
                                style={{
                                  fontSize: 13,
                                  fontWeight: 800,
                                  color: "var(--text)",
                                  marginBottom: 10,
                                }}
                              >
                                Detalle de Cierre
                              </h4>
                              <div style={detailRowStyle}>
                                <span style={detailLabelStyle}>Cierre:</span>
                                <span style={detailValueStyle}>
                                  {s.closedAt
                                    ? `${fmtDate(s.closedAt)} ${fmtTime(s.closedAt)}`
                                    : "Caja Abierta / Activa"}
                                </span>
                              </div>
                              <div style={detailRowStyle}>
                                <span style={detailLabelStyle}>Fondo Inicial:</span>
                                <span style={detailValueStyle}>{money(s.initialAmount)}</span>
                              </div>
                              <div style={detailRowStyle}>
                                <span style={detailLabelStyle}>Ventas:</span>
                                <span style={detailValueStyle}>
                                  {s.salesCount} · {money(s.cashIn)}
                                </span>
                              </div>
                              <div style={detailRowStyle}>
                                <span style={detailLabelStyle}>Esperado:</span>
                                <span style={{ ...detailValueStyle, fontWeight: 800 }}>
                                  {money(s.expectedAmount)}
                                </span>
                              </div>
                              <div style={detailRowStyle}>
                                <span style={detailLabelStyle}>Declarado:</span>
                                <span style={detailValueStyle}>
                                  {s.declaredAmount !== null ? money(s.declaredAmount) : "—"}
                                </span>
                              </div>
                              <div style={detailRowStyle}>
                                <span style={detailLabelStyle}>Diferencia:</span>
                                <span
                                  style={{
                                    ...detailValueStyle,
                                    fontWeight: 800,
                                    color: diffColor(s.difference),
                                  }}
                                >
                                  {s.difference !== null ? money(s.difference) : "—"}
                                </span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          ) : (
            // ---- ESCRITORIO: Tabla Turnos ----
            <div
              className="table-sticky-head"
              style={{ ...ui.tableWrap, overflowX: "auto", overflowY: "auto", maxHeight: "62vh" }}
            >
              <table style={{ ...ui.table, fontSize: 13 }}>
                <thead style={{ ...ui.theadRow, position: "sticky", top: 0, zIndex: 2, backgroundColor: "#f1f5f9" }}>
                  <tr>
                    <th style={{ ...ui.th, fontSize: 12, padding: "14px 12px", whiteSpace: "nowrap", minWidth: 40 }}>#</th>
                    <th style={{ ...ui.th, fontSize: 12, padding: "14px 12px", whiteSpace: "nowrap", minWidth: 80, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis" }}>Sucursal</th>
                    <th style={{ ...ui.th, fontSize: 12, padding: "14px 12px", whiteSpace: "nowrap", minWidth: 80, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis" }}>Cajero</th>
                    <th style={{ ...ui.th, fontSize: 12, padding: "14px 12px", whiteSpace: "nowrap", minWidth: 100 }}>Apertura</th>
                    <th style={{ ...ui.th, fontSize: 12, padding: "14px 12px", whiteSpace: "nowrap", minWidth: 100 }}>Cierre</th>
                    <th style={{ ...ui.th, fontSize: 12, padding: "14px 12px", whiteSpace: "nowrap", textAlign: "right", minWidth: 70 }}>Fondo</th>
                    <th style={{ ...ui.th, fontSize: 12, padding: "14px 12px", whiteSpace: "nowrap", textAlign: "center", minWidth: 50 }}>Ventas</th>
                    <th style={{ ...ui.th, fontSize: 12, padding: "14px 12px", whiteSpace: "nowrap", textAlign: "right", minWidth: 70 }}>Esperado</th>
                    <th style={{ ...ui.th, fontSize: 12, padding: "14px 12px", whiteSpace: "nowrap", textAlign: "right", minWidth: 70 }}>Declarado</th>
                    <th style={{ ...ui.th, fontSize: 12, padding: "14px 12px", whiteSpace: "nowrap", textAlign: "right", minWidth: 70 }}>Diferencia</th>
                    <th style={{ ...ui.th, fontSize: 12, padding: "14px 12px", whiteSpace: "nowrap", textAlign: "center", minWidth: 60 }}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  <TableState colSpan={11} loading={loading} error={error} empty={!loading && rows.length === 0} />
                  {!loading &&
                    !error &&
                    paged.pageItems.map((s) => (
                      <tr
                        key={s.id}
                        onClick={() => openDetail(s.id)}
                        onMouseEnter={() => setHoveredRow(s.id)}
                        onMouseLeave={() => setHoveredRow(null)}
                        style={{
                          cursor: "pointer",
                          backgroundColor: hoveredRow === s.id ? "#f8fafc" : "transparent",
                          transition: "background-color 0.15s",
                        }}
                      >
                        <td style={{ ...ui.td, fontSize: 13, padding: "14px 12px", whiteSpace: "nowrap", fontWeight: 700, color: "var(--accent-strong)" }}>{s.id}</td>
                        <td style={{ ...ui.td, fontSize: 13, padding: "14px 12px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 120 }}>{s.branch}</td>
                        <td style={{ ...ui.td, fontSize: 13, padding: "14px 12px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 120 }}>{s.cajero}</td>
                        <td style={{ ...ui.td, fontSize: 13, padding: "14px 12px", whiteSpace: "nowrap" }}>
                          {fmtDate(s.openedAt)} <span style={{ color: "var(--text-faint)" }}>{fmtTime(s.openedAt)}</span>
                        </td>
                        <td style={{ ...ui.td, fontSize: 13, padding: "14px 12px", whiteSpace: "nowrap" }}>
                          {s.closedAt ? (
                            <>
                              {fmtDate(s.closedAt)} <span style={{ color: "var(--text-faint)" }}>{fmtTime(s.closedAt)}</span>
                            </>
                          ) : (
                            <span style={{ color: "var(--text-faint)" }}>—</span>
                          )}
                        </td>
                        <td style={{ ...ui.td, fontSize: 13, padding: "14px 12px", whiteSpace: "nowrap", textAlign: "right" }}>{money(s.initialAmount)}</td>
                        <td style={{ ...ui.td, fontSize: 13, padding: "14px 12px", whiteSpace: "nowrap", textAlign: "center", fontWeight: 700 }}>{s.salesCount}</td>
                        <td style={{ ...ui.td, fontSize: 13, padding: "14px 12px", whiteSpace: "nowrap", textAlign: "right", fontWeight: 700 }}>{money(s.expectedAmount)}</td>
                        <td style={{ ...ui.td, fontSize: 13, padding: "14px 12px", whiteSpace: "nowrap", textAlign: "right" }}>
                          {s.declaredAmount !== null ? money(s.declaredAmount) : <span style={{ color: "var(--text-faint)" }}>—</span>}
                        </td>
                        <td style={{ ...ui.td, fontSize: 13, padding: "14px 12px", whiteSpace: "nowrap", textAlign: "right", fontWeight: 800, color: diffColor(s.difference) }}>
                          {s.difference !== null ? money(s.difference) : "—"}
                        </td>
                        <td style={{ ...ui.td, fontSize: 13, padding: "14px 12px", whiteSpace: "nowrap", textAlign: "center" }}>
                          <Badge tone={statusTone(s.status)}>{s.status}</Badge>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}

          {!loading && !error && (
            <Pagination
              page={paged.page}
              pageCount={paged.pageCount}
              total={paged.total}
              from={paged.from}
              to={paged.to}
              onPage={paged.setPage}
              itemLabel="sesiones"
            />
          )}
        </>
      ) : (
        // ============================================================
        // PESTAÑA HISTORIAL (con más altura y badge verde/rojo)
        // ============================================================
        <>
          {isMobile ? (
            // ---- MÓVIL: tarjetas con más padding y badge visible ----
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "8px 4px", width: "100%" }}>
              {loading && (
                <div
                  style={{
                    textAlign: "center",
                    padding: "32px 16px",
                    color: "var(--text-faint)",
                    fontSize: 13,
                    fontWeight: 500,
                  }}
                >
                  Cargando información...
                </div>
              )}
              {error && (
                <div
                  style={{
                    textAlign: "center",
                    padding: "32px 16px",
                    color: "#b91c1c",
                    fontSize: 13,
                    fontWeight: 500,
                  }}
                >
                  {error}
                </div>
              )}
              {!loading && !error && pagedHistorial.total === 0 && (
                <div
                  style={{
                    textAlign: "center",
                    padding: "32px 16px",
                    color: "var(--text-faint)",
                    fontSize: 13,
                    fontWeight: 500,
                  }}
                >
                  No hay cierres para mostrar.
                </div>
              )}

              {!loading &&
                !error &&
                pagedHistorial.pageItems.map((s) => (
                  <div
                    key={s.id}
                    style={{
                      backgroundColor: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                      padding: 16,
                      marginBottom: 12,
                      boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 12,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 800, color: "var(--text)" }}>{s.cajero}</div>
                        <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 2 }}>
                          Sucursal: {s.branch}
                        </div>
                      </div>
                      <div style={{ flexShrink: 0, marginLeft: 8 }}>
                        <ClosureTypeBadge type={s.status} />
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <div>
                        <div
                          style={{
                            fontSize: 11,
                            color: "var(--text-muted)",
                            textTransform: "uppercase",
                            fontWeight: 700,
                          }}
                        >
                          Cierre
                        </div>
                        <div style={{ fontSize: 14, color: "var(--text)", fontWeight: 500, marginTop: 2 }}>
                          {s.closedAt ? `${fmtDate(s.closedAt)} ${fmtTime(s.closedAt)}` : "—"}
                        </div>
                      </div>
                      <div>
                        <div
                          style={{
                            fontSize: 11,
                            color: "var(--text-muted)",
                            textTransform: "uppercase",
                            fontWeight: 700,
                          }}
                        >
                          Duración
                        </div>
                        <div style={{ fontSize: 14, color: "var(--text)", fontWeight: 500, marginTop: 2 }}>
                          {s.closedAt ? calculateDuration(s.openedAt, s.closedAt) : "—"}
                        </div>
                      </div>
                    </div>
                    {s.forceCloseReason && (
                      <div
                        style={{
                          backgroundColor: "var(--surface-2)",
                          padding: "10px 12px",
                          borderRadius: 8,
                          marginTop: 4,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 11,
                            color: "var(--color-danger)",
                            textTransform: "uppercase",
                            fontWeight: 700,
                            marginBottom: 2,
                          }}
                        >
                          Motivo de cierre:
                        </div>
                        <div style={{ fontSize: 13, color: "var(--text)" }}>{s.forceCloseReason}</div>
                        {s.forcedByAdmin && (
                          <div
                            style={{
                              fontSize: 12,
                              color: "var(--text-muted)",
                              marginTop: 6,
                              fontWeight: 500,
                            }}
                          >
                            Por: <strong style={{ color: "var(--text)" }}>{s.forcedByAdmin}</strong>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
            </div>
          ) : (
            // ---- ESCRITORIO: Tabla Historial con más altura ----
            <div
              className="table-sticky-head"
              style={{ ...ui.tableWrap, overflowX: "auto", overflowY: "auto", maxHeight: "62vh" }}
            >
              <table style={{ ...ui.table, fontSize: 13 }}>
                <thead style={{ ...ui.theadRow, position: "sticky", top: 0, zIndex: 2, backgroundColor: "#f1f5f9" }}>
                  <tr>
                    <th style={{ ...ui.th, fontSize: 12, padding: "18px 16px", whiteSpace: "nowrap", minWidth: 100, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }}>Cajero</th>
                    <th style={{ ...ui.th, fontSize: 12, padding: "18px 16px", whiteSpace: "nowrap", minWidth: 100, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }}>Sucursal</th>
                    <th style={{ ...ui.th, fontSize: 12, padding: "18px 16px", whiteSpace: "nowrap", minWidth: 130 }}>Fecha de Cierre</th>
                    <th style={{ ...ui.th, fontSize: 12, padding: "18px 16px", whiteSpace: "nowrap", minWidth: 90 }}>Duración</th>
                    <th style={{ ...ui.th, fontSize: 12, padding: "18px 16px", whiteSpace: "nowrap", textAlign: "center", minWidth: 80 }}>Tipo</th>
                    <th style={{ ...ui.th, fontSize: 12, padding: "18px 16px", whiteSpace: "nowrap", minWidth: 180 }}>Motivo / Admin</th>
                  </tr>
                </thead>
                <tbody>
                  <TableState
                    colSpan={6}
                    loading={loading}
                    error={error}
                    empty={!loading && pagedHistorial.total === 0}
                    emptyText="No hay cierres para mostrar."
                  />
                  {!loading &&
                    !error &&
                    pagedHistorial.pageItems.map((s) => (
                      <tr key={s.id}>
                        <td style={{ ...ui.td, padding: "18px 16px", verticalAlign: "top" }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>{s.cajero}</div>
                        </td>
                        <td style={{ ...ui.td, fontSize: 13, padding: "18px 16px", verticalAlign: "top", color: "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 160 }}>{s.branch}</td>
                        <td style={{ ...ui.td, fontSize: 13, padding: "18px 16px", verticalAlign: "top", whiteSpace: "nowrap" }}>
                          {s.closedAt ? (
                            <>
                              {fmtDate(s.closedAt)} <span style={{ color: "var(--text-faint)" }}>{fmtTime(s.closedAt)}</span>
                            </>
                          ) : "—"}
                        </td>
                        <td style={{ ...ui.td, fontSize: 13, padding: "18px 16px", verticalAlign: "top", whiteSpace: "nowrap" }}>{s.closedAt ? calculateDuration(s.openedAt, s.closedAt) : "—"}</td>
                        <td style={{ ...ui.td, padding: "18px 16px", verticalAlign: "top", textAlign: "center" }}>
                          <ClosureTypeBadge type={s.status} />
                        </td>
                        <td style={{ ...ui.td, fontSize: 13, padding: "18px 16px", verticalAlign: "top", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 220 }}>
                          {s.forceCloseReason ? (
                            <div>
                              <div style={{ color: "var(--color-danger)", fontWeight: 600 }}>{s.forceCloseReason}</div>
                              {s.forcedByAdmin && (
                                <div style={{ color: "var(--text-muted)", marginTop: 2, fontSize: 12 }}>
                                  Por: <strong style={{ color: "var(--text)" }}>{s.forcedByAdmin}</strong>
                                </div>
                              )}
                            </div>
                          ) : (
                            <span style={{ color: "var(--text-faint)" }}>—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}

          {!loading && !error && (
            <Pagination
              page={pagedHistorial.page}
              pageCount={pagedHistorial.pageCount}
              total={pagedHistorial.total}
              from={pagedHistorial.from}
              to={pagedHistorial.to}
              onPage={pagedHistorial.setPage}
              itemLabel="cierres"
            />
          )}
        </>
      )}

      {/* ====================================================================
          MODAL DETALLE DE CAJA (sin cambios)
          ==================================================================== */}
      {detailOpen && (
        <div style={ui.overlay} onClick={closeDetail}>
          <div
            style={{ ...ui.modal, maxWidth: 750, width: "100%", maxHeight: "90vh" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ ...ui.modalHeader, gap: 12, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={ui.modalTitle}>Caja #{selectedDetail?.id ?? "…"}</span>
                {selectedDetail && (
                  <span style={{ marginLeft: 10, fontSize: 13, color: "var(--text-muted)" }}>
                    Cajero: <strong>{selectedDetail.cajero}</strong> | Sucursal:{" "}
                    <strong>{selectedDetail.branch}</strong>
                  </span>
                )}
              </div>
              {selectedDetail && <Badge tone={statusTone(selectedDetail.status)}>{selectedDetail.status}</Badge>}
              <button style={ui.ghostBtn} onClick={closeDetail} title="Cerrar">
                <X size={15} />
              </button>
            </div>

            <div style={ui.modalBody}>
              {detailLoading && (
                <p style={{ textAlign: "center", color: "var(--text-faint)", padding: "24px 0", fontSize: 13 }}>
                  Cargando detalles...
                </p>
              )}
              {detailError && (
                <p style={{ color: "var(--color-danger)", fontSize: 13, padding: "8px 0" }}>{detailError}</p>
              )}

              {!detailLoading && !detailError && selectedDetail && (
                <>
                  <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>
                    Apertura: {fmtDateTime(selectedDetail.openedAt)}
                    {selectedDetail.closedAt && (
                      <>
                        {" "}
                        · Cierre: {fmtDateTime(selectedDetail.closedAt)}
                      </>
                    )}
                  </p>

                  {selectedDetail.closedAt && (
                    <>
                      <p style={sectionLabel}>Historial de Cierre de Caja</p>
                      <div style={{ ...finBox, marginBottom: 18 }}>
                        <FinRow
                          isMobile={isMobile}
                          label="Tipo de cierre:"
                          value={selectedDetail.forceCloseReason ? "Revocado (Forzado)" : "Normal"}
                        />
                        <FinRow isMobile={isMobile} label="Fecha y Hora:" value={fmtDateTime(selectedDetail.closedAt)} />
                        <FinRow
                          isMobile={isMobile}
                          label="Duración del turno:"
                          value={calculateDuration(selectedDetail.openedAt, selectedDetail.closedAt)}
                        />
                        {selectedDetail.forceCloseReason && (
                          <>
                            <div style={{ borderTop: "1px dashed var(--border-strong)", margin: "8px 0" }} />
                            <FinRow
                              isMobile={isMobile}
                              label="Motivo:"
                              value={selectedDetail.forceCloseReason}
                              color="var(--color-danger)"
                            />
                            {selectedDetail.forcedByAdmin && (
                              <FinRow
                                isMobile={isMobile}
                                label="Administrador involucrado:"
                                value={selectedDetail.forcedByAdmin}
                              />
                            )}
                          </>
                        )}
                      </div>
                    </>
                  )}

                  <p style={sectionLabel}>Desglose financiero</p>
                  <div style={{ ...finBox, maxHeight: 155, overflowY: "auto" }}>
                    <FinRow isMobile={isMobile} label="Monto inicial (fondo):" value={money(selectedDetail.initialAmount)} />
                    <FinRow isMobile={isMobile} label="+ Ventas (efectivo neto):" value={money(selectedDetail.cashIn)} />
                    <FinRow isMobile={isMobile} label="– Depósitos (salidas):" value={money(selectedDetail.cashOut)} />
                    <div style={{ borderTop: "1px solid var(--border)", margin: "8px 0" }} />
                    <FinRow isMobile={isMobile} label="= Esperado (teórico):" value={money(selectedDetail.expectedAmount)} bold />
                    <div style={{ borderTop: "1px dashed var(--border-strong)", margin: "8px 0" }} />
                    <FinRow
                      isMobile={isMobile}
                      label="Declarado (contado):"
                      value={selectedDetail.declaredAmount !== null ? money(selectedDetail.declaredAmount) : "—"}
                    />
                    <FinRow
                      isMobile={isMobile}
                      label="Diferencia:"
                      value={
                        selectedDetail.difference !== null
                          ? selectedDetail.difference >= 0
                            ? `+${money(selectedDetail.difference)}`
                            : money(selectedDetail.difference)
                          : "—"
                      }
                      bold
                      color={
                        selectedDetail.difference === null
                          ? "var(--text-faint)"
                          : selectedDetail.difference >= 0
                            ? "var(--color-success)"
                            : "var(--color-danger)"
                      }
                    />
                  </div>

                  <p style={{ ...sectionLabel, marginTop: 18 }}>Por método de pago (ventas completadas)</p>
                  <div style={{ ...finBox, maxHeight: 155, overflowY: "auto" }}>
                    <FinRow isMobile={isMobile} label="Efectivo" value={money(selectedDetail.payBreakdown.efectivo)} />
                    <FinRow
                      isMobile={isMobile}
                      label="Tarjeta crédito"
                      value={money(selectedDetail.payBreakdown.tarjetaCredito)}
                    />
                    <FinRow
                      isMobile={isMobile}
                      label="Tarjeta débito"
                      value={money(selectedDetail.payBreakdown.tarjetaDebito)}
                    />
                    <FinRow
                      isMobile={isMobile}
                      label="MercadoPago QR"
                      value={money(selectedDetail.payBreakdown.mercadoPago)}
                    />
                    <div style={{ borderTop: "1px solid var(--border)", margin: "8px 0" }} />
                    <FinRow
                      isMobile={isMobile}
                      label="Total ventas"
                      value={money(selectedDetail.payBreakdown.totalVentas)}
                      bold
                    />
                  </div>

                  <p style={{ ...sectionLabel, marginTop: 18 }}>
                    Últimos movimientos ({selectedDetail.movements.length})
                  </p>
                  {selectedDetail.movements.length === 0 ? (
                    <p style={{ fontSize: 13, color: "var(--text-faint)", textAlign: "center", padding: "12px 0" }}>
                      Sin movimientos registrados.
                    </p>
                  ) : isMobile ? (
                    <div
                      style={{
                        maxHeight: 340,
                        overflowY: "auto",
                        overflowX: "hidden",
                        display: "flex",
                        flexDirection: "column",
                        gap: 10,
                      }}
                    >
                      {selectedDetail.movements.map((m) => (
                        <div
                          key={m.id}
                          style={{
                            backgroundColor: "var(--surface-2)",
                            borderRadius: 8,
                            padding: 12,
                            border: "1px solid var(--border-soft)",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                            <span style={{ fontSize: 11, color: "var(--text-faint)" }}>{fmtDateTime(m.date)}</span>
                            <span style={{ fontSize: 11, color: movTypeColor(m.type), fontWeight: 700 }}>
                              {m.type}
                            </span>
                          </div>
                          <div style={{ fontSize: 13, color: "var(--text)", marginBottom: 8, fontWeight: 500 }}>
                            {m.description}
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                            <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Saldo: {money(m.balance)}</div>
                            <div
                              style={{
                                fontSize: 14,
                                fontWeight: 700,
                                color: m.amount >= 0 ? "#15803d" : "#b91c1c",
                              }}
                            >
                              {m.amount >= 0 ? "+" : ""}
                              {money(m.amount)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div
                      style={{
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        overflowX: "hidden",
                        overflowY: "auto",
                        maxHeight: 340,
                        maxWidth: "100%",
                      }}
                    >
                      <table style={{ ...ui.table, fontSize: 12 }}>
                        <thead>
                          <tr style={ui.theadRow}>
                            <th style={{ ...ui.th, fontSize: 10 }}>Fecha / hora</th>
                            <th style={{ ...ui.th, fontSize: 10 }}>Tipo</th>
                            <th style={{ ...ui.th, fontSize: 10 }}>Descripción</th>
                            <th style={{ ...ui.th, fontSize: 10, textAlign: "right" }}>Monto</th>
                            <th style={{ ...ui.th, fontSize: 10, textAlign: "right" }}>Saldo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedDetail.movements.map((m) => (
                            <tr key={m.id}>
                              <td style={{ ...ui.td, fontSize: 12 }}>{fmtDateTime(m.date)}</td>
                              <td style={{ ...ui.td, fontSize: 12 }}>
                                <span style={{ color: movTypeColor(m.type), fontWeight: 700 }}>{m.type}</span>
                              </td>
                              <td
                                style={{
                                  ...ui.td,
                                  fontSize: 12,
                                  maxWidth: 160,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                }}
                              >
                                {m.description}
                              </td>
                              <td
                                style={{
                                  ...ui.td,
                                  fontSize: 12,
                                  textAlign: "right",
                                  fontWeight: 700,
                                  color: m.amount >= 0 ? "#15803d" : "#b91c1c",
                                }}
                              >
                                {m.amount >= 0 ? "+" : ""}
                                {money(m.amount)}
                              </td>
                              <td
                                style={{
                                  ...ui.td,
                                  fontSize: 12,
                                  textAlign: "right",
                                  color: "var(--text-secondary)",
                                }}
                              >
                                {money(m.balance)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>

            <div
              style={{
                padding: "14px 22px",
                borderTop: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  style={{
                    ...ui.ghostBtn,
                    ...(isMobile ? { width: 38, height: 38, padding: 0, minWidth: 38, justifyContent: "center" } : {}),
                  }}
                  onClick={closeDetail}
                  title="Cerrar"
                >
                  <X size={15} />
                  {!isMobile && <span>Cerrar</span>}
                </button>
                <button
                  style={{
                    ...ui.primaryBtn,
                    backgroundColor: "#2563eb",
                    ...(isMobile ? { width: 38, height: 38, padding: 0, minWidth: 38, justifyContent: "center" } : {}),
                  }}
                  onClick={printCashReport}
                  disabled={detailLoading || !selectedDetail}
                  title="Imprimir arqueo de esta caja"
                >
                  <Printer size={15} />
                  {!isMobile && <span>Imprimir</span>}
                </button>
              </div>
              {selectedDetail?.status === "ABIERTA" && (
                <button
                  style={{
                    ...ui.primaryBtn,
                    backgroundColor: "#b91c1c",
                    ...(isMobile ? { width: 38, height: 38, padding: 0, minWidth: 38, justifyContent: "center" } : {}),
                  }}
                  onClick={() => setForceOpen(true)}
                  title="Cerrar forzado"
                >
                  <Ban size={15} />
                  {!isMobile && <span>Cerrar forzado</span>}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          SUB-MODAL CIERRE FORZADO – Paso 1 (motivo)
          ==================================================================== */}
      {forceOpen && (
        <div
          style={{ ...ui.overlay, zIndex: 300 }}
          onClick={() => {
            setForceOpen(false);
            setForceReason("");
            setForceError(null);
          }}
        >
          <div
            style={{ ...ui.modal, maxWidth: 440, width: "100%" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={ui.modalHeader}>
              <span style={ui.modalTitle}>¿Cerrar caja forzadamente?</span>
              <button
                style={ui.ghostBtn}
                onClick={() => {
                  setForceOpen(false);
                  setForceReason("");
                  setForceReasonError("");
                  setForceError(null);
                }}
                title="Cerrar"
              >
                <X size={15} />
              </button>
            </div>
            <div style={ui.modalBody}>
              <p
                style={{
                  fontSize: 13,
                  color: "#b91c1c",
                  fontWeight: 600,
                  marginBottom: 18,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <AlertTriangle size={14} /> Esta acción no se puede deshacer.
              </p>
              <label style={ui.fieldLabel}>Motivo de cierre *</label>
              <textarea
                value={forceReason}
                maxLength={180}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value.length <= 180) {
                    setForceReason(value);
                    setForceReasonError(validateReference(value, "El motivo", { required: true, max: 180 }) || "");
                  }
                }}
                placeholder="Ingresa el motivo del cierre forzado..."
                rows={3}
                style={{
                  ...ui.input,
                  resize: "vertical",
                  minHeight: 80,
                  fontFamily: "inherit",
                  lineHeight: 1.5,
                }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginTop: 4 }}>
                <div style={{ flex: 1 }}>
                  {forceReasonError && <p style={{ ...ui.fieldError, marginTop: 0 }}>{forceReasonError}</p>}
                </div>
                <span
                  style={{
                    fontSize: 11,
                    color: forceReason.length >= 180 ? "#b91c1c" : "var(--text-faint)",
                    marginLeft: 8,
                  }}
                >
                  {forceReason.length} / 180
                </span>
              </div>
              {forceError && <p style={{ color: "#b91c1c", fontSize: 13, marginTop: 8 }}>{forceError}</p>}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
                <button
                  style={ui.ghostBtn}
                  onClick={() => {
                    setForceOpen(false);
                    setForceReason("");
                    setForceReasonError("");
                    setForceError(null);
                  }}
                  disabled={forceLoading}
                >
                  Cancelar
                </button>
                <button
                  style={{
                    ...ui.primaryBtn,
                    backgroundColor: !forceReason.trim() ? "#94a3b8" : "#b91c1c",
                    cursor: !forceReason.trim() ? "not-allowed" : "pointer",
                  }}
                  onClick={() => {
                    const err = validateReference(forceReason, "El motivo", { required: true, max: 180 });
                    if (err) {
                      setForceReasonError(err);
                      return;
                    }
                    setForceReasonError("");
                    setForceOpen(false);
                    setForceConfirmOpen(true);
                  }}
                  disabled={!forceReason.trim()}
                >
                  Continuar →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          SUB-MODAL CIERRE FORZADO – Paso 2 (confirmación)
          ==================================================================== */}
      {forceConfirmOpen && selectedDetail && (
        <div
          style={{ ...ui.overlay, zIndex: 310 }}
          onClick={() => {
            setForceConfirmOpen(false);
            setForceOpen(true);
          }}
        >
          <div
            style={{ ...ui.modal, maxWidth: 440, width: "100%" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={ui.modalHeader}>
              <span style={ui.modalTitle}>Confirmar cierre de caja</span>
              <button
                style={ui.ghostBtn}
                onClick={() => {
                  setForceConfirmOpen(false);
                  setForceOpen(true);
                }}
                title="Cerrar"
              >
                <X size={15} />
              </button>
            </div>
            <div style={ui.modalBody}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
                <div style={detailRowStyle}>
                  <span style={detailLabelStyle}>Caja:</span>
                  <span style={detailValueStyle}>Caja #{selectedDetail.id}</span>
                </div>
                <div style={detailRowStyle}>
                  <span style={detailLabelStyle}>Cajero:</span>
                  <span style={detailValueStyle}>{selectedDetail.cajero}</span>
                </div>
                <div style={detailRowStyle}>
                  <span style={detailLabelStyle}>Sucursal:</span>
                  <span style={detailValueStyle}>{selectedDetail.branch}</span>
                </div>
                <div style={{ ...detailRowStyle, alignItems: "flex-start" }}>
                  <span style={detailLabelStyle}>Motivo:</span>
                  <span style={{ ...detailValueStyle, wordBreak: "break-word", flex: 1 }}>{forceReason}</span>
                </div>
              </div>
              <p
                style={{
                  fontSize: 13,
                  color: "#b91c1c",
                  fontWeight: 600,
                  marginBottom: 20,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <AlertTriangle size={14} /> Esta acción cerrará la caja permanentemente y no se puede deshacer.
              </p>
              {forceError && <p style={{ color: "#b91c1c", fontSize: 13, marginBottom: 12 }}>{forceError}</p>}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button
                  style={ui.ghostBtn}
                  onClick={() => {
                    setForceConfirmOpen(false);
                    setForceOpen(true);
                  }}
                  disabled={forceLoading}
                >
                  ← Regresar
                </button>
                <button
                  style={{
                    ...ui.primaryBtn,
                    backgroundColor: "#b91c1c",
                    cursor: forceLoading ? "not-allowed" : "pointer",
                  }}
                  onClick={handleForceClose}
                  disabled={forceLoading}
                >
                  {forceLoading ? "Cerrando..." : "Confirmar cierre"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CajasView;
