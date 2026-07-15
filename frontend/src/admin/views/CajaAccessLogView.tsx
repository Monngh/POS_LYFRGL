import React, { useState, useEffect, useCallback, useMemo } from "react";
import { ChevronDown, ChevronUp, Ban } from "lucide-react";
import api from "../../shared/services/api";
import { validateDateRange } from "../../shared/utils/formValidation";
import { useSecurityEvents } from "../context/SecurityEventsContext";
import { useAuth } from "../../auth";
import {
  ui,
  type ViewProps,
  Toolbar,
  TableState,
  SectionHeader,
  useMediaQuery,
  usePagination,
  Pagination,
  fmtDate,
  fmtTime,
} from "./shared";
import { ForceCloseCashModal } from "../components/ForceCloseCashModal";

// ============================================================================
// Tipos
// ============================================================================

interface AccessLogRow {
  id: number;
  email: string;
  name: string;
  role: string;
  method: string;
  ipAddress: string | null;
  deviceId: string | null;
  createdAt: string;
  user: { id: number; name: string; email: string };
  branch: { id: number; name: string } | null;
}

interface FailedPinAttemptRow {
  id: number;
  action: string;
  ipAddress: string | null;
  deviceId: string | null;
  createdAt: string;
  user: { id: number; name: string };
  branch: { id: number; name: string };
}

interface CashierActiveSessionRow {
  id: number;
  user: { id: number; name: string; email: string };
  branch: { id: number; name: string } | null;
  openedAt: string;
  initialAmount: number;
}

interface CashierClosureRow {
  id: number;
  user: { id: number; name: string; email: string };
  branch: { id: number; name: string } | null;
  openedAt: string;
  closedAt: string | null;
  closureType: "NORMAL" | "FORCED";
  forceCloseReason: string | null;
  forcedByAdmin: string | null;
  declaredAmount: number | null;
  difference: number | null;
}

// ============================================================================
// Constantes y helpers
// ============================================================================

const FAILED_PIN_ACTION_LABELS: Record<string, string> = {
  CANCEL_SALE: "Cancelar venta",
  CLOSE_CASH: "Cierre de caja",
  RETURN: "Devolución",
  CANCEL_DEPOSIT: "Cancelar depósito",
  REMOVE_ITEM: "Quitar artículo",
  CLEAR_CART: "Vaciar carrito",
  CART_ACTION: "Acción de carrito",
};

const actionLabel = (action: string): string => FAILED_PIN_ACTION_LABELS[action] ?? action;

const PAGE_SIZE = 50;

const fmtDateTime = (iso: string) =>
  new Intl.DateTimeFormat("es-MX", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));

const MethodBadge: React.FC<{ method: string }> = ({ method }) => (
  <span
    style={{
      display: "inline-block",
      padding: "2px 10px",
      borderRadius: 12,
      fontSize: 11,
      fontWeight: 700,
      backgroundColor: method === "PASSWORD" ? "#dbeafe" : "#fef3c7",
      color: method === "PASSWORD" ? "#1d4ed8" : "#92400e",
      whiteSpace: "nowrap",
    }}
  >
    {method}
  </span>
);

const formatDevice = (deviceId: string | null): string => {
  if (!deviceId) return "Desconocido";
  if (deviceId.startsWith("dev-")) return "Navegador Web";
  if (/^[0-9a-f]{8}-[0-9a-f]{4}/i.test(deviceId)) return "App Móvil";
  if (/^[0-9a-f]{8,}/i.test(deviceId)) return "Terminal POS";
  return deviceId.slice(0, 8).toUpperCase();
};

const formatDeviceShort = (deviceId: string | null): string => {
  if (!deviceId) return "";
  return deviceId.slice(0, 8).toUpperCase() + "...";
};

const formatIP = (ip: string | null): string => {
  if (!ip) return "—";
  if (ip === "::1" || ip === "::ffff:127.0.0.1") return "Local";
  if (ip.startsWith("::ffff:")) return ip.replace("::ffff:", "");
  return ip;
};

// Badge para el tipo de cierre en Historial de Cierres (usa "Revocado" en lugar de "Forzado")
const ClosureTypeBadge: React.FC<{ type: string }> = ({ type }) => {
  const isRevoked = type === "FORCED";
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

const formatDuration = (openedAt: string, closedAt: string | null): string => {
  if (!closedAt) return "—";
  const ms = new Date(closedAt).getTime() - new Date(openedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const totalMinutes = Math.round(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} h`;
  return `${hours} h ${minutes} min`;
};

// ============================================================================
// Componente principal
// ============================================================================

const CajaAccessLogView: React.FC<ViewProps> = ({ branchId, refreshToken }) => {
  const isMobile = useMediaQuery("(max-width: 768px)");
  const isTablet = useMediaQuery("(min-width: 769px) and (max-width: 1024px)");
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<"logins" | "failed-pin" | "active-sessions" | "closures">("logins");

  // ── Inicios de Sesión ──
  const [expandedLogs, setExpandedLogs] = useState<Record<number, boolean>>({});
  const [rows, setRows] = useState<AccessLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const dateError = from && to ? validateDateRange(from, to) : undefined;

  // ── Intentos Fallidos ──
  const [expandedPinLogs, setExpandedPinLogs] = useState<Record<number, boolean>>({});
  const [pinRows, setPinRows] = useState<FailedPinAttemptRow[]>([]);
  const [pinLoading, setPinLoading] = useState(true);
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinFrom, setPinFrom] = useState("");
  const [pinTo, setPinTo] = useState("");
  const [pinUserSearch, setPinUserSearch] = useState("");
  // Paginación de SERVIDOR: el backend (getFailedPinAttempts) pagina con skip/take
  // y regresa `total`. pinPage/pinTotal reflejan lo que el backend reporta.
  const [pinPage, setPinPage] = useState(1);
  const [pinTotal, setPinTotal] = useState(0);
  const pinDateError = pinFrom && pinTo ? validateDateRange(pinFrom, pinTo) : undefined;

  // ── Sesiones Activas ──
  const [activeSessionRows, setActiveSessionRows] = useState<CashierActiveSessionRow[]>([]);
  const [activeSessionsLoading, setActiveSessionsLoading] = useState(true);
  const [activeSessionsError, setActiveSessionsError] = useState<string | null>(null);
  const [activeUserSearch, setActiveUserSearch] = useState("");
  const [forceModal, setForceModal] = useState<{
    open: boolean;
    session: CashierActiveSessionRow | null;
  }>({ open: false, session: null });

  // ── Historial de Cierres ──
  const [expandedClosures, setExpandedClosures] = useState<Record<number, boolean>>({});
  const [closureRows, setClosureRows] = useState<CashierClosureRow[]>([]);
  const [closuresLoading, setClosuresLoading] = useState(false);
  const [closuresError, setClosuresError] = useState<string | null>(null);
  const [closuresFrom, setClosuresFrom] = useState("");
  const [closuresTo, setClosuresTo] = useState("");
  const [closuresUserSearch, setClosuresUserSearch] = useState("");
  // Paginación de SERVIDOR: el backend (getCashierSessionClosures) pagina con
  // skip/take y regresa `total`. closuresPage/closuresTotal reflejan al backend.
  const [closuresPage, setClosuresPage] = useState(1);
  const [closuresTotal, setClosuresTotal] = useState(0);
  const closuresDateError = closuresFrom && closuresTo ? validateDateRange(closuresFrom, closuresTo) : undefined;

  // ── Filtros y paginación ──

  // Inicios de Sesión
  const filteredLogs = useMemo(() => {
    if (!userSearch.trim()) return rows;
    const search = userSearch.toLowerCase();
    return rows.filter(
      (r) =>
        r.user.name.toLowerCase().includes(search) ||
        r.user.email.toLowerCase().includes(search)
    );
  }, [rows, userSearch]);

  const logsPagination = usePagination(filteredLogs, {
    pageSize: PAGE_SIZE,
    resetKey: `${branchId}|${from}|${to}|${userSearch}`,
  });

  // Intentos Fallidos
  // pinRows ya viene paginado por el backend (25-50 registros de la página actual).
  // El buscador de cajero solo filtra dentro de esa página; no re-consulta al backend.
  const pinFiltered = useMemo(() => {
    if (!pinUserSearch.trim()) return pinRows;
    const search = pinUserSearch.toLowerCase();
    return pinRows.filter((r) => r.user.name.toLowerCase().includes(search));
  }, [pinRows, pinUserSearch]);

  const pinPageCount = Math.max(1, Math.ceil(pinTotal / PAGE_SIZE));
  const pinRangeFrom = pinTotal === 0 ? 0 : (pinPage - 1) * PAGE_SIZE + 1;
  const pinRangeTo = Math.min(pinTotal, pinPage * PAGE_SIZE);

  // Sesiones Activas
  const activeFiltered = useMemo(() => {
    if (!activeUserSearch.trim()) return activeSessionRows;
    const search = activeUserSearch.toLowerCase();
    return activeSessionRows.filter(
      (s) =>
        s.user.name.toLowerCase().includes(search) ||
        s.user.email.toLowerCase().includes(search)
    );
  }, [activeSessionRows, activeUserSearch]);

  const activePagination = usePagination(activeFiltered, {
    pageSize: PAGE_SIZE,
    resetKey: `${branchId}|${activeUserSearch}`,
  });

  // Historial de Cierres
  // closureRows ya viene paginado por el backend. El buscador de cajero solo
  // filtra dentro de la página actual; no re-consulta al backend.
  const closuresFiltered = useMemo(() => {
    if (!closuresUserSearch.trim()) return closureRows;
    const search = closuresUserSearch.toLowerCase();
    return closureRows.filter(
      (c) =>
        c.user.name.toLowerCase().includes(search) ||
        c.user.email.toLowerCase().includes(search)
    );
  }, [closureRows, closuresUserSearch]);

  const closuresPageCount = Math.max(1, Math.ceil(closuresTotal / PAGE_SIZE));
  const closuresRangeFrom = closuresTotal === 0 ? 0 : (closuresPage - 1) * PAGE_SIZE + 1;
  const closuresRangeTo = Math.min(closuresTotal, closuresPage * PAGE_SIZE);

  // ── Carga de datos ──

  const loadLogs = useCallback(async () => {
    const invalidRange = from && to ? validateDateRange(from, to) : undefined;
    if (invalidRange) {
      setRows([]);
      setError(invalidRange);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {};
      if (branchId !== "all") params.branchId = branchId;
      if (from) {
        const localFrom = new Date(`${from}T00:00:00`);
        params.from = localFrom.toISOString();
      }
      if (to) {
        const localTo = new Date(`${to}T23:59:59.999`);
        params.to = localTo.toISOString();
      }
      const res = await api.get<{ logs: AccessLogRow[] }>("/api/admin/security/cashier-access", { params });
      setRows(res.data.logs);
    } catch (err: any) {
      setError(err.response?.data?.message || "No se pudieron cargar los accesos de caja.");
    } finally {
      setLoading(false);
    }
  }, [from, to, branchId, refreshToken]);

  const loadFailedPin = useCallback(async () => {
    const invalidRange = pinFrom && pinTo ? validateDateRange(pinFrom, pinTo) : undefined;
    if (invalidRange) {
      setPinRows([]);
      setPinTotal(0);
      setPinError(invalidRange);
      setPinLoading(false);
      return;
    }
    setPinLoading(true);
    setPinError(null);
    try {
      const params: Record<string, string> = {
        page: String(pinPage),
        pageSize: String(PAGE_SIZE),
      };
      if (branchId !== "all") params.branchId = branchId;
      if (pinFrom) params.from = new Date(`${pinFrom}T00:00:00`).toISOString();
      if (pinTo) params.to = new Date(`${pinTo}T23:59:59.999`).toISOString();
      const res = await api.get<{ logs: FailedPinAttemptRow[]; total: number }>(
        "/api/admin/security/failed-pin-attempts",
        { params }
      );
      setPinRows(res.data.logs);
      setPinTotal(res.data.total);
    } catch (err: any) {
      setPinError(err.response?.data?.message || "No se pudieron cargar los intentos fallidos de PIN.");
      setPinTotal(0);
    } finally {
      setPinLoading(false);
    }
  }, [pinFrom, pinTo, branchId, refreshToken, pinPage]);

  const loadActiveSessions = useCallback(async () => {
    setActiveSessionsLoading(true);
    setActiveSessionsError(null);
    try {
      const params: Record<string, string> = {};
      if (branchId !== "all") params.branchId = branchId;
      const res = await api.get<{ sessions: CashierActiveSessionRow[] }>(
        "/api/admin/security/cashier-active-sessions",
        { params }
      );
      setActiveSessionRows(res.data.sessions);
    } catch (err: any) {
      setActiveSessionsError(err.response?.data?.message || "No se pudieron cargar las sesiones activas.");
    } finally {
      setActiveSessionsLoading(false);
    }
  }, [branchId, refreshToken]);

  const loadClosures = useCallback(async () => {
    const invalidRange = closuresFrom && closuresTo ? validateDateRange(closuresFrom, closuresTo) : undefined;
    if (invalidRange) {
      setClosureRows([]);
      setClosuresTotal(0);
      setClosuresError(invalidRange);
      setClosuresLoading(false);
      return;
    }
    setClosuresLoading(true);
    setClosuresError(null);
    try {
      const params: Record<string, string> = {
        page: String(closuresPage),
        pageSize: String(PAGE_SIZE),
      };
      if (branchId !== "all") params.branchId = branchId;
      if (closuresFrom) params.from = new Date(`${closuresFrom}T00:00:00`).toISOString();
      if (closuresTo) params.to = new Date(`${closuresTo}T23:59:59.999`).toISOString();
      const res = await api.get<{ closures: CashierClosureRow[]; total: number }>(
        "/api/admin/security/cashier-session-closures",
        { params }
      );
      setClosureRows(res.data.closures);
      setClosuresTotal(res.data.total);
    } catch (err: any) {
      setClosuresError(err.response?.data?.message || "No se pudo cargar el historial de cierres.");
      setClosuresTotal(0);
    } finally {
      setClosuresLoading(false);
    }
  }, [closuresFrom, closuresTo, branchId, refreshToken, closuresPage]);

  // Al cambiar filtros de fecha/sucursal, regresamos a la página 1 del backend
  useEffect(() => {
    setPinPage(1);
  }, [pinFrom, pinTo, branchId]);

  useEffect(() => {
    setClosuresPage(1);
  }, [closuresFrom, closuresTo, branchId]);

  // ── Efectos de carga según pestaña ──

  useEffect(() => {
    if (activeTab === "logins") loadLogs();
    else if (activeTab === "failed-pin") loadFailedPin();
    else if (activeTab === "active-sessions") loadActiveSessions();
    else if (activeTab === "closures") loadClosures();
  }, [activeTab, loadLogs, loadFailedPin, loadActiveSessions, loadClosures]);

  // ── Eventos SSE ──
  useSecurityEvents(
    useCallback(
      (payload) => {
        if (payload.type === "login") {
          loadLogs();
          if (activeTab === "active-sessions") loadActiveSessions();
        } else if (payload.type === "failed-pin") {
          loadFailedPin();
        }
      },
      [loadLogs, loadFailedPin, loadActiveSessions, activeTab]
    )
  );

  // ── Handlers ──

  const toggleExpand = (id: number) => {
    setExpandedLogs((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const toggleExpandPin = (id: number) => {
    setExpandedPinLogs((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const toggleExpandClosure = (id: number) => {
    setExpandedClosures((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const clearLogsFilters = () => {
    setFrom("");
    setTo("");
    setUserSearch("");
  };

  const clearPinFilters = () => {
    setPinFrom("");
    setPinTo("");
    setPinUserSearch("");
  };

  const clearClosuresFilters = () => {
    setClosuresFrom("");
    setClosuresTo("");
    setClosuresUserSearch("");
  };

  // ============================================================================
  // Estilos compartidos
  // ============================================================================

  const inputStyle: React.CSSProperties = {
    padding: "8px 12px",
    border: "1px solid #d1d5db",
    borderRadius: 6,
    fontSize: 13,
    flex: "1 1 120px",
    minWidth: 0,
    maxWidth: 180,
    fontFamily: "inherit",
    backgroundColor: "var(--surface)",
    color: "var(--text-secondary)",
    outline: "none",
  };

  const detailRowStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "flex-start",
    alignItems: "flex-start",
    gap: "6px",
    fontSize: 12,
    marginBottom: 3,
  };

  const detailLabelStyle: React.CSSProperties = {
    fontWeight: 700,
    color: "var(--text-muted)",
    minWidth: "70px",
    display: "inline-block",
    fontSize: "inherit",
  };

  const detailValueStyle: React.CSSProperties = {
    fontWeight: 600,
    color: "var(--text-secondary)",
    flex: 1,
    fontSize: "inherit",
    wordBreak: "break-word",
  };

  // ============================================================================
  // Render
  // ============================================================================

  const tabs = [
    { key: "logins", label: "Inicios de Sesión" },
    { key: "failed-pin", label: "Intentos Fallidos" },
    { key: "active-sessions", label: "Sesiones Activas" },
    { key: "closures", label: "Historial de Cierres" },
  ] as const;

  return (
    <div>
      <SectionHeader
        title="Accesos de Caja"
        subtitle={
          activeTab === "logins"
            ? "Historial de inicios de sesión de cajeros en las terminales"
            : activeTab === "failed-pin"
              ? "Intentos fallidos de autorización por PIN en operaciones sensibles"
              : activeTab === "active-sessions"
                ? "Sesiones de caja abiertas en este momento"
                : "Historial de cierres de sesión de caja (normales y revocados)"
        }
      />

      {/* Tabs responsivos */}
      <div
        style={{
          display: "flex",
          flexWrap: isMobile ? "wrap" : "nowrap",
          gap: isMobile ? 4 : 0,
          marginBottom: 18,
          borderBottom: "1px solid var(--border)",
        }}
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                background: "none",
                border: "none",
                borderBottom: isActive ? "2px solid var(--accent)" : "2px solid transparent",
                padding: isMobile ? "6px 12px" : isTablet ? "8px 16px" : "8px 20px",
                fontSize: isMobile ? 13 : isTablet ? 13.5 : 14,
                fontWeight: isActive ? 700 : 500,
                color: isActive ? "var(--accent-strong)" : "var(--text-muted)",
                cursor: "pointer",
                fontFamily: "inherit",
                whiteSpace: "nowrap",
                transition: "border-color 0.2s",
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ================================================================ */}
      {/* TAB: INICIOS DE SESIÓN */}
      {/* ================================================================ */}
      {activeTab === "logins" && (
        <>
          {isMobile ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                marginBottom: 16,
                padding: "12px",
                backgroundColor: "var(--surface-2)",
                borderRadius: 12,
                border: "1px solid var(--border)",
              }}
            >
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--accent-strong)" }}>Desde:</label>
                <input
                  type="date"
                  value={from}
                  max={to || undefined}
                  onChange={(e) => setFrom(e.target.value)}
                  style={{
                    ...inputStyle,
                    padding: "6px 10px",
                    fontSize: 13,
                    flex: 1,
                    minWidth: 0,
                    ...(dateError ? { borderColor: "#ef4444" } : {}),
                  }}
                />
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--accent-strong)" }}>Hasta:</label>
                <input
                  type="date"
                  value={to}
                  min={from || undefined}
                  onChange={(e) => setTo(e.target.value)}
                  style={{
                    ...inputStyle,
                    padding: "6px 10px",
                    fontSize: 13,
                    flex: 1,
                    minWidth: 0,
                    ...(dateError ? { borderColor: "#ef4444" } : {}),
                  }}
                />
              </div>
              <div>
                <input
                  type="text"
                  placeholder="Buscar cajero..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  maxLength={120}
                  style={{
                    ...inputStyle,
                    padding: "6px 10px",
                    fontSize: 13,
                    width: "100%",
                  }}
                />
              </div>
              <button
                onClick={clearLogsFilters}
                style={{
                  ...ui.ghostBtn,
                  padding: "8px 14px",
                  fontSize: 13,
                  backgroundColor: "var(--surface-3)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  color: "var(--text-muted)",
                  fontWeight: 600,
                  width: "100%",
                }}
                className="active-tap"
              >
                Limpiar filtros
              </button>
              {dateError && (
                <span style={{ color: "#b91c1c", fontSize: 12, fontWeight: 600 }}>{dateError}</span>
              )}
              <div
                style={{
                  fontSize: 12,
                  color: "var(--text-muted)",
                  fontWeight: 600,
                  textAlign: "center",
                  paddingTop: 4,
                  borderTop: "1px solid var(--border)",
                }}
              >
                {filteredLogs.length} registro{filteredLogs.length !== 1 ? "s" : ""}
              </div>
            </div>
          ) : (
            <Toolbar>
              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--accent-strong)" }}>Desde:</label>
                <input
                  type="date"
                  value={from}
                  max={to || undefined}
                  onChange={(e) => setFrom(e.target.value)}
                  style={{ ...inputStyle, ...(dateError ? { borderColor: "#ef4444" } : {}) }}
                />
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--accent-strong)" }}>Hasta:</label>
                <input
                  type="date"
                  value={to}
                  min={from || undefined}
                  onChange={(e) => setTo(e.target.value)}
                  style={{ ...inputStyle, ...(dateError ? { borderColor: "#ef4444" } : {}) }}
                />
                <input
                  type="text"
                  placeholder="Buscar cajero..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  maxLength={120}
                  style={{ ...inputStyle, minWidth: 160 }}
                />
                <button
                  onClick={clearLogsFilters}
                  style={{
                    padding: "8px 14px",
                    background: "#f3f4f6",
                    border: "1px solid #d1d5db",
                    borderRadius: 6,
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#374151",
                  }}
                  className="active-tap"
                >
                  Limpiar filtros
                </button>
              </div>
              <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                {filteredLogs.length} registro{filteredLogs.length !== 1 ? "s" : ""}
              </span>
            </Toolbar>
          )}

          {isMobile ? (
            <div style={{ overflowY: "auto", maxHeight: "62vh", padding: "8px 4px" }}>
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
              {!loading && !error && filteredLogs.length === 0 && (
                <div
                  style={{
                    textAlign: "center",
                    padding: "32px 16px",
                    color: "var(--text-faint)",
                    fontSize: 13,
                    fontWeight: 500,
                  }}
                >
                  No hay registros para mostrar.
                </div>
              )}

              {!loading &&
                !error &&
                logsPagination.pageItems.map((row) => {
                  const expanded = expandedLogs[row.id];
                  return (
                    <div
                      key={row.id}
                      style={{
                        backgroundColor: "var(--surface)",
                        border: "1px solid var(--border)",
                        borderRadius: 12,
                        marginBottom: 10,
                        boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "6px 12px 5px 12px",
                          fontSize: 10,
                          fontWeight: 700,
                          color: "var(--text-muted)",
                          borderBottom: "1px solid var(--surface-3)",
                          backgroundColor: "var(--surface-2)",
                          letterSpacing: "0.2px",
                          textTransform: "uppercase",
                        }}
                      >
                        <span
                          style={{
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            maxWidth: "55%",
                          }}
                        >
                          {row.user.name}
                        </span>
                        <MethodBadge method={row.method} />
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr",
                          gap: "4px",
                          padding: "14px 12px",
                        }}
                      >
                        <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                          <span style={{ fontWeight: 600, color: "var(--text)" }}>Fecha:</span>{" "}
                          {fmtDate(row.createdAt)} {fmtTime(row.createdAt)}
                        </div>
                        <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                          <span style={{ fontWeight: 600, color: "var(--text)" }}>Sucursal:</span>{" "}
                          {row.branch?.name ?? "—"}
                        </div>
                        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
                          <button
                            onClick={() => toggleExpand(row.id)}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              backgroundColor: "var(--surface)",
                              border: "1px solid var(--border-strong)",
                              borderRadius: 6,
                              width: 36,
                              height: 36,
                              cursor: "pointer",
                              color: "var(--text-muted)",
                              padding: 0,
                            }}
                            className="active-tap"
                          >
                            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </button>
                        </div>
                      </div>

                      {expanded && (
                        <div
                          style={{
                            padding: "14px",
                            margin: "0 12px 14px 12px",
                            backgroundColor: "var(--surface-2)",
                            borderRadius: "8px",
                            border: "1px solid var(--border)",
                            display: "grid",
                            gridTemplateColumns: "1fr",
                            gap: "6px",
                            textAlign: "left",
                          }}
                        >
                          <div style={detailRowStyle}>
                            <span style={detailLabelStyle}>Cajero:</span>
                            <span style={detailValueStyle}>
                              {row.user.name} ({row.user.email})
                            </span>
                          </div>
                          <div style={detailRowStyle}>
                            <span style={detailLabelStyle}>Sucursal:</span>
                            <span style={detailValueStyle}>{row.branch?.name ?? "—"}</span>
                          </div>
                          <div style={detailRowStyle}>
                            <span style={detailLabelStyle}>Método:</span>
                            <span style={detailValueStyle}>{row.method}</span>
                          </div>
                          <div style={detailRowStyle}>
                            <span style={detailLabelStyle}>Dispositivo:</span>
                            <span style={detailValueStyle}>
                              <div style={{ fontWeight: 600, fontSize: 12 }}>{formatDevice(row.deviceId)}</div>
                              <div
                                style={{
                                  fontFamily: "monospace",
                                  fontSize: 11,
                                  color: "var(--text-muted)",
                                  marginTop: 1,
                                }}
                              >
                                {formatDeviceShort(row.deviceId)}
                              </div>
                            </span>
                          </div>
                          <div style={detailRowStyle}>
                            <span style={detailLabelStyle}>IP:</span>
                            <span style={{ ...detailValueStyle, fontFamily: "monospace", fontSize: 11 }}>
                              {formatIP(row.ipAddress)}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              {logsPagination.pageCount > 1 && (
                <Pagination
                  {...logsPagination}
                  onPage={logsPagination.setPage}
                  itemLabel="registros"
                />
              )}
            </div>
          ) : (
            <>
              <div
                className="table-sticky-head"
                style={{ ...ui.tableWrap, overflowX: "auto", overflowY: "auto", maxHeight: "62vh" }}
              >
                <table style={ui.table}>
                  <thead>
                    <tr style={ui.theadRow}>
                      <th style={ui.th}>Fecha / Hora</th>
                      <th style={ui.th}>Cajero</th>
                      <th style={ui.th}>Sucursal</th>
                      <th style={{ ...ui.th, textAlign: "center" }}>Método</th>
                      <th style={ui.th}>Dispositivo</th>
                      <th style={{ ...ui.th, fontFamily: "monospace" }}>IP</th>
                    </tr>
                  </thead>
                  <tbody>
                    <TableState
                      colSpan={6}
                      loading={loading}
                      error={error}
                      empty={!loading && filteredLogs.length === 0}
                      emptyText="No hay accesos de caja para los filtros seleccionados."
                    />
                    {!loading &&
                      !error &&
                      logsPagination.pageItems.map((row) => (
                        <tr key={row.id}>
                          <td style={{ ...ui.td, whiteSpace: "nowrap", color: "var(--text-secondary)" }}>
                            {fmtDateTime(row.createdAt)}
                          </td>
                          <td style={ui.td}>
                            <div style={{ fontWeight: 700, color: "var(--text)" }}>{row.user.name}</div>
                            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{row.user.email}</div>
                          </td>
                          <td style={{ ...ui.td, color: "var(--text-muted)" }}>
                            {row.branch?.name ?? <span style={{ color: "var(--border-strong)" }}>—</span>}
                          </td>
                          <td style={{ ...ui.td, textAlign: "center" }}>
                            <MethodBadge method={row.method} />
                          </td>
                          <td style={ui.td}>
                            <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)" }}>
                              {formatDevice(row.deviceId)}
                            </div>
                            <div
                              style={{
                                fontSize: 11,
                                color: "var(--text-muted)",
                                marginTop: 2,
                                fontFamily: "monospace",
                              }}
                            >
                              {formatDeviceShort(row.deviceId)}
                            </div>
                          </td>
                          <td
                            style={{
                              ...ui.td,
                              fontFamily: "monospace",
                              fontSize: 12,
                              color: "var(--text-muted)",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {formatIP(row.ipAddress)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              {logsPagination.pageCount > 1 && (
                <Pagination
                  {...logsPagination}
                  onPage={logsPagination.setPage}
                  itemLabel="registros"
                />
              )}
            </>
          )}
        </>
      )}

      {/* ================================================================ */}
      {/* TAB: INTENTOS FALLIDOS */}
      {/* ================================================================ */}
      {activeTab === "failed-pin" && (
        <>
          {isMobile ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                marginBottom: 16,
                padding: "12px",
                backgroundColor: "var(--surface-2)",
                borderRadius: 12,
                border: "1px solid var(--border)",
              }}
            >
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--accent-strong)" }}>Desde:</label>
                <input
                  type="date"
                  value={pinFrom}
                  max={pinTo || undefined}
                  onChange={(e) => setPinFrom(e.target.value)}
                  style={{
                    ...inputStyle,
                    padding: "6px 10px",
                    fontSize: 13,
                    flex: 1,
                    minWidth: 0,
                    ...(pinDateError ? { borderColor: "#ef4444" } : {}),
                  }}
                />
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--accent-strong)" }}>Hasta:</label>
                <input
                  type="date"
                  value={pinTo}
                  min={pinFrom || undefined}
                  onChange={(e) => setPinTo(e.target.value)}
                  style={{
                    ...inputStyle,
                    padding: "6px 10px",
                    fontSize: 13,
                    flex: 1,
                    minWidth: 0,
                    ...(pinDateError ? { borderColor: "#ef4444" } : {}),
                  }}
                />
              </div>
              <div>
                <input
                  type="text"
                  placeholder="Buscar cajero..."
                  value={pinUserSearch}
                  onChange={(e) => setPinUserSearch(e.target.value)}
                  maxLength={120}
                  style={{
                    ...inputStyle,
                    padding: "6px 10px",
                    fontSize: 13,
                    width: "100%",
                  }}
                />
              </div>
              <button
                onClick={clearPinFilters}
                style={{
                  ...ui.ghostBtn,
                  padding: "8px 14px",
                  fontSize: 13,
                  backgroundColor: "var(--surface-3)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  color: "var(--text-muted)",
                  fontWeight: 600,
                  width: "100%",
                }}
                className="active-tap"
              >
                Limpiar filtros
              </button>
              {pinDateError && (
                <span style={{ color: "#b91c1c", fontSize: 12, fontWeight: 600 }}>{pinDateError}</span>
              )}
              <div
                style={{
                  fontSize: 12,
                  color: "var(--text-muted)",
                  fontWeight: 600,
                  textAlign: "center",
                  paddingTop: 4,
                  borderTop: "1px solid var(--border)",
                }}
              >
                {pinTotal} registro{pinTotal !== 1 ? "s" : ""}
                {pinUserSearch.trim() && (
                  <div style={{ fontWeight: 500, marginTop: 2 }}>
                    ({pinFiltered.length} coinciden en esta página)
                  </div>
                )}
              </div>
            </div>
          ) : (
            <Toolbar>
              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--accent-strong)" }}>Desde:</label>
                <input
                  type="date"
                  value={pinFrom}
                  max={pinTo || undefined}
                  onChange={(e) => setPinFrom(e.target.value)}
                  style={{ ...inputStyle, ...(pinDateError ? { borderColor: "#ef4444" } : {}) }}
                />
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--accent-strong)" }}>Hasta:</label>
                <input
                  type="date"
                  value={pinTo}
                  min={pinFrom || undefined}
                  onChange={(e) => setPinTo(e.target.value)}
                  style={{ ...inputStyle, ...(pinDateError ? { borderColor: "#ef4444" } : {}) }}
                />
                <input
                  type="text"
                  placeholder="Buscar cajero..."
                  value={pinUserSearch}
                  onChange={(e) => setPinUserSearch(e.target.value)}
                  maxLength={120}
                  style={{ ...inputStyle, minWidth: 160 }}
                />
                <button
                  onClick={clearPinFilters}
                  style={{
                    padding: "8px 14px",
                    background: "#f3f4f6",
                    border: "1px solid #d1d5db",
                    borderRadius: 6,
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#374151",
                  }}
                  className="active-tap"
                >
                  Limpiar filtros
                </button>
              </div>
              <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                {pinTotal} registro{pinTotal !== 1 ? "s" : ""}
                {pinUserSearch.trim() ? ` (${pinFiltered.length} en esta página)` : ""}
              </span>
            </Toolbar>
          )}

          {isMobile ? (
            <div style={{ overflowY: "auto", maxHeight: "62vh", padding: "8px 4px" }}>
              {pinLoading && (
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
              {pinError && (
                <div
                  style={{
                    textAlign: "center",
                    padding: "32px 16px",
                    color: "#b91c1c",
                    fontSize: 13,
                    fontWeight: 500,
                  }}
                >
                  {pinError}
                </div>
              )}
              {!pinLoading && !pinError && pinFiltered.length === 0 && (
                <div
                  style={{
                    textAlign: "center",
                    padding: "32px 16px",
                    color: "var(--text-faint)",
                    fontSize: 13,
                    fontWeight: 500,
                  }}
                >
                  No hay intentos fallidos de PIN registrados.
                </div>
              )}

              {!pinLoading &&
                !pinError &&
                pinFiltered.map((row) => {
                  const expanded = expandedPinLogs[row.id];
                  return (
                    <div
                      key={row.id}
                      style={{
                        backgroundColor: "var(--surface)",
                        border: "1px solid var(--border)",
                        borderRadius: 12,
                        marginBottom: 10,
                        boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "6px 12px 5px 12px",
                          fontSize: 10,
                          fontWeight: 700,
                          color: "var(--text-muted)",
                          borderBottom: "1px solid var(--surface-3)",
                          backgroundColor: "var(--surface-2)",
                          letterSpacing: "0.2px",
                          textTransform: "uppercase",
                        }}
                      >
                        <span
                          style={{
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            maxWidth: "55%",
                          }}
                        >
                          {row.user.name}
                        </span>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "2px 10px",
                            borderRadius: 12,
                            fontSize: 11,
                            fontWeight: 700,
                            backgroundColor: "#fee2e2",
                            color: "#b91c1c",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {actionLabel(row.action)}
                        </span>
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr",
                          gap: "4px",
                          padding: "14px 12px",
                        }}
                      >
                        <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                          <span style={{ fontWeight: 600, color: "var(--text)" }}>Fecha:</span>{" "}
                          {fmtDate(row.createdAt)} {fmtTime(row.createdAt)}
                        </div>
                        <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                          <span style={{ fontWeight: 600, color: "var(--text)" }}>Acción:</span>{" "}
                          {actionLabel(row.action)}
                        </div>
                        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
                          <button
                            onClick={() => toggleExpandPin(row.id)}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              backgroundColor: "var(--surface)",
                              border: "1px solid var(--border-strong)",
                              borderRadius: 6,
                              width: 36,
                              height: 36,
                              cursor: "pointer",
                              color: "var(--text-muted)",
                              padding: 0,
                            }}
                            className="active-tap"
                          >
                            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </button>
                        </div>
                      </div>

                      {expanded && (
                        <div
                          style={{
                            padding: "14px",
                            margin: "0 12px 14px 12px",
                            backgroundColor: "var(--surface-2)",
                            borderRadius: "8px",
                            border: "1px solid var(--border)",
                            display: "grid",
                            gridTemplateColumns: "1fr",
                            gap: "6px",
                            textAlign: "left",
                          }}
                        >
                          <div style={detailRowStyle}>
                            <span style={detailLabelStyle}>Cajero:</span>
                            <span style={detailValueStyle}>{row.user.name}</span>
                          </div>
                          <div style={detailRowStyle}>
                            <span style={detailLabelStyle}>Sucursal:</span>
                            <span style={detailValueStyle}>{row.branch?.name ?? "—"}</span>
                          </div>
                          <div style={detailRowStyle}>
                            <span style={detailLabelStyle}>Dispositivo:</span>
                            <span style={detailValueStyle}>
                              <div style={{ fontWeight: 600, fontSize: 12 }}>{formatDevice(row.deviceId)}</div>
                              <div
                                style={{
                                  fontFamily: "monospace",
                                  fontSize: 11,
                                  color: "var(--text-muted)",
                                  marginTop: 1,
                                }}
                              >
                                {formatDeviceShort(row.deviceId)}
                              </div>
                            </span>
                          </div>
                          <div style={detailRowStyle}>
                            <span style={detailLabelStyle}>IP:</span>
                            <span style={{ ...detailValueStyle, fontFamily: "monospace", fontSize: 11 }}>
                              {formatIP(row.ipAddress)}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              {pinPageCount > 1 && (
                <Pagination
                  page={pinPage}
                  pageCount={pinPageCount}
                  total={pinTotal}
                  from={pinRangeFrom}
                  to={pinRangeTo}
                  onPage={setPinPage}
                  itemLabel="registros"
                />
              )}
            </div>
          ) : (
            <>
              <div
                className="table-sticky-head"
                style={{ ...ui.tableWrap, overflowX: "auto", overflowY: "auto", maxHeight: "62vh" }}
              >
                <table style={ui.table}>
                  <thead>
                    <tr style={ui.theadRow}>
                      <th style={ui.th}>Fecha / Hora</th>
                      <th style={ui.th}>Cajero</th>
                      <th style={ui.th}>Sucursal</th>
                      <th style={ui.th}>Acción intentada</th>
                      <th style={ui.th}>Dispositivo</th>
                      <th style={{ ...ui.th, fontFamily: "monospace" }}>IP</th>
                    </tr>
                  </thead>
                  <tbody>
                    <TableState
                      colSpan={6}
                      loading={pinLoading}
                      error={pinError}
                      empty={!pinLoading && pinFiltered.length === 0}
                      emptyText="No hay intentos fallidos de PIN registrados."
                    />
                    {!pinLoading &&
                      !pinError &&
                      pinFiltered.map((row) => (
                        <tr key={row.id}>
                          <td style={{ ...ui.td, whiteSpace: "nowrap", color: "var(--text-secondary)" }}>
                            {fmtDateTime(row.createdAt)}
                          </td>
                          <td style={ui.td}>
                            <div style={{ fontWeight: 700, color: "var(--text)" }}>{row.user.name}</div>
                          </td>
                          <td style={{ ...ui.td, color: "var(--text-muted)" }}>
                            {row.branch?.name ?? <span style={{ color: "var(--border-strong)" }}>—</span>}
                          </td>
                          <td style={ui.td}>
                            <span
                              style={{
                                display: "inline-block",
                                padding: "2px 10px",
                                borderRadius: 12,
                                fontSize: 11,
                                fontWeight: 700,
                                backgroundColor: "#fee2e2",
                                color: "#b91c1c",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {actionLabel(row.action)}
                            </span>
                          </td>
                          <td style={ui.td}>
                            <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)" }}>
                              {formatDevice(row.deviceId)}
                            </div>
                            <div
                              style={{
                                fontSize: 11,
                                color: "var(--text-muted)",
                                marginTop: 2,
                                fontFamily: "monospace",
                              }}
                            >
                              {formatDeviceShort(row.deviceId)}
                            </div>
                          </td>
                          <td
                            style={{
                              ...ui.td,
                              fontFamily: "monospace",
                              fontSize: 12,
                              color: "var(--text-muted)",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {formatIP(row.ipAddress)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              {pinPageCount > 1 && (
                <Pagination
                  page={pinPage}
                  pageCount={pinPageCount}
                  total={pinTotal}
                  from={pinRangeFrom}
                  to={pinRangeTo}
                  onPage={setPinPage}
                  itemLabel="registros"
                />
              )}
            </>
          )}
        </>
      )}

      {/* ================================================================ */}
      {/* TAB: SESIONES ACTIVAS */}
      {/* ================================================================ */}
      {activeTab === "active-sessions" && (
        <>
          {isMobile ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                marginBottom: 16,
                padding: "12px",
                backgroundColor: "var(--surface-2)",
                borderRadius: 12,
                border: "1px solid var(--border)",
              }}
            >
              <div>
                <input
                  type="text"
                  placeholder="Buscar cajero..."
                  value={activeUserSearch}
                  onChange={(e) => setActiveUserSearch(e.target.value)}
                  maxLength={120}
                  style={{
                    ...inputStyle,
                    padding: "6px 10px",
                    fontSize: 13,
                    width: "100%",
                  }}
                />
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--text-muted)",
                  fontWeight: 600,
                  textAlign: "center",
                  paddingTop: 4,
                  borderTop: "1px solid var(--border)",
                }}
              >
                {activeFiltered.length} sesión{activeFiltered.length !== 1 ? "es" : ""} activa
                {activeFiltered.length !== 1 ? "s" : ""}
              </div>
            </div>
          ) : (
            <Toolbar>
              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <input
                  type="text"
                  placeholder="Buscar cajero..."
                  value={activeUserSearch}
                  onChange={(e) => setActiveUserSearch(e.target.value)}
                  maxLength={120}
                  style={{ ...inputStyle, minWidth: 160 }}
                />
              </div>
              <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                {activeFiltered.length} sesión{activeFiltered.length !== 1 ? "es" : ""} activa
                {activeFiltered.length !== 1 ? "s" : ""}
              </span>
            </Toolbar>
          )}

          {isMobile ? (
            <div style={{ overflowY: "auto", maxHeight: "62vh", padding: "8px 4px" }}>
              {activeSessionsLoading && (
                <div
                  style={{
                    textAlign: "center",
                    padding: "32px 16px",
                    color: "var(--text-faint)",
                    fontSize: 13,
                    fontWeight: 500,
                  }}
                >
                  Cargando sesiones...
                </div>
              )}
              {activeSessionsError && (
                <div
                  style={{
                    textAlign: "center",
                    padding: "32px 16px",
                    color: "#b91c1c",
                    fontSize: 13,
                    fontWeight: 500,
                  }}
                >
                  {activeSessionsError}
                </div>
              )}
              {!activeSessionsLoading && !activeSessionsError && activeFiltered.length === 0 && (
                <div
                  style={{
                    textAlign: "center",
                    padding: "32px 16px",
                    color: "var(--text-faint)",
                    fontSize: 13,
                    fontWeight: 500,
                  }}
                >
                  No hay sesiones de caja abiertas.
                </div>
              )}

              {!activeSessionsLoading &&
                !activeSessionsError &&
                activePagination.pageItems.map((s) => (
                  <div
                    key={s.id}
                    style={{
                      backgroundColor: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                      marginBottom: 10,
                      padding: "14px",
                      boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
                    }}
                  >
                    <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "4px" }}>
                      <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                        <span style={{ fontWeight: 600, color: "var(--text)" }}>Cajero:</span> {s.user.name}
                      </div>
                      <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                        <span style={{ fontWeight: 600, color: "var(--text)" }}>Email:</span> {s.user.email}
                      </div>
                      <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                        <span style={{ fontWeight: 600, color: "var(--text)" }}>Sucursal:</span>{" "}
                        {s.branch?.name ?? "—"}
                      </div>
                      <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                        <span style={{ fontWeight: 600, color: "var(--text)" }}>Abierta:</span>{" "}
                        {fmtDateTime(s.openedAt)}
                      </div>
                      <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                        <span style={{ fontWeight: 600, color: "var(--text)" }}>Fondo:</span> $
                        {s.initialAmount.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                      </div>
                      <div style={{ marginTop: 6 }}>
                        <button
                          onClick={() => setForceModal({ open: true, session: s })}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: "#fee2e2",
                            border: "none",
                            borderRadius: 6,
                            padding: "4px 12px",
                            cursor: "pointer",
                            color: "#b91c1c",
                            fontWeight: 600,
                            fontSize: 12,
                            whiteSpace: "nowrap",
                            transition: "background-color 0.2s",
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#fecaca")}
                          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#fee2e2")}
                          title="Cerrar caja forzadamente"
                        >
                          <Ban size={14} style={{ marginRight: 4 }} />
                          Cerrar
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              {activePagination.pageCount > 1 && (
                <Pagination
                  {...activePagination}
                  onPage={activePagination.setPage}
                  itemLabel="sesiones"
                />
              )}
            </div>
          ) : (
            <>
              <div
                className="table-sticky-head"
                style={{ ...ui.tableWrap, overflowX: "auto", overflowY: "auto", maxHeight: "62vh" }}
              >
                <table style={ui.table}>
                  <thead>
                    <tr style={ui.theadRow}>
                      <th style={ui.th}>Cajero</th>
                      <th style={ui.th}>Sucursal</th>
                      <th style={ui.th}>Abierta desde</th>
                      <th style={{ ...ui.th, textAlign: "right" }}>Fondo inicial</th>
                      <th style={{ ...ui.th, textAlign: "center", width: 80 }}>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    <TableState
                      colSpan={5}
                      loading={activeSessionsLoading}
                      error={activeSessionsError}
                      empty={!activeSessionsLoading && !activeSessionsError && activeFiltered.length === 0}
                      emptyText="No hay sesiones de caja abiertas."
                    />
                    {!activeSessionsLoading &&
                      !activeSessionsError &&
                      activePagination.pageItems.map((s) => (
                        <tr key={s.id}>
                          <td style={ui.td}>
                            <div style={{ fontWeight: 700, color: "var(--text)" }}>{s.user.name}</div>
                            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{s.user.email}</div>
                          </td>
                          <td style={{ ...ui.td, color: "var(--text-muted)" }}>
                            {s.branch?.name ?? <span style={{ color: "var(--border-strong)" }}>—</span>}
                          </td>
                          <td style={{ ...ui.td, whiteSpace: "nowrap", color: "var(--text-secondary)" }}>
                            {fmtDateTime(s.openedAt)}
                          </td>
                          <td
                            style={{
                              ...ui.td,
                              textAlign: "right",
                              fontFamily: "monospace",
                              fontSize: 12,
                            }}
                          >
                            ${s.initialAmount.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                          </td>
                          <td style={{ ...ui.td, textAlign: "center" }}>
                            <button
                              onClick={() => setForceModal({ open: true, session: s })}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                backgroundColor: "#fee2e2",
                                border: "none",
                                borderRadius: 6,
                                padding: "4px 12px",
                                cursor: "pointer",
                                color: "#b91c1c",
                                fontWeight: 600,
                                fontSize: 12,
                                whiteSpace: "nowrap",
                                transition: "background-color 0.2s",
                              }}
                              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#fecaca")}
                              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#fee2e2")}
                              title="Cerrar caja forzadamente"
                            >
                              <Ban size={14} style={{ marginRight: 4 }} />
                              Cerrar
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              {activePagination.pageCount > 1 && (
                <Pagination
                  {...activePagination}
                  onPage={activePagination.setPage}
                  itemLabel="sesiones"
                />
              )}
            </>
          )}
          {forceModal.open && forceModal.session && (
            <ForceCloseCashModal
              sessionId={forceModal.session.id}
              cajero={forceModal.session.user.name}
              branch={forceModal.session.branch?.name ?? "Sucursal no asignada"}
              userId={user?.id ?? 0}
              onClose={() => setForceModal({ open: false, session: null })}
              onSuccess={() => {
                setForceModal({ open: false, session: null });
                loadActiveSessions();
              }}
            />
          )}
        </>
      )}

      {/* ================================================================ */}
      {/* TAB: HISTORIAL DE CIERRES }
      {/* ================================================================ */}
      {activeTab === "closures" && (
        <>
          {isMobile ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                marginBottom: 16,
                padding: "12px",
                backgroundColor: "var(--surface-2)",
                borderRadius: 12,
                border: "1px solid var(--border)",
              }}
            >
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--accent-strong)" }}>Desde:</label>
                <input
                  type="date"
                  value={closuresFrom}
                  max={closuresTo || undefined}
                  onChange={(e) => setClosuresFrom(e.target.value)}
                  style={{
                    ...inputStyle,
                    padding: "6px 10px",
                    fontSize: 13,
                    flex: 1,
                    minWidth: 0,
                    ...(closuresDateError ? { borderColor: "#ef4444" } : {}),
                  }}
                />
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--accent-strong)" }}>Hasta:</label>
                <input
                  type="date"
                  value={closuresTo}
                  min={closuresFrom || undefined}
                  onChange={(e) => setClosuresTo(e.target.value)}
                  style={{
                    ...inputStyle,
                    padding: "6px 10px",
                    fontSize: 13,
                    flex: 1,
                    minWidth: 0,
                    ...(closuresDateError ? { borderColor: "#ef4444" } : {}),
                  }}
                />
              </div>
              <div>
                <input
                  type="text"
                  placeholder="Buscar cajero..."
                  value={closuresUserSearch}
                  onChange={(e) => setClosuresUserSearch(e.target.value)}
                  maxLength={120}
                  style={{
                    ...inputStyle,
                    padding: "6px 10px",
                    fontSize: 13,
                    width: "100%",
                  }}
                />
              </div>
              <button
                onClick={clearClosuresFilters}
                style={{
                  ...ui.ghostBtn,
                  padding: "8px 14px",
                  fontSize: 13,
                  backgroundColor: "var(--surface-3)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  color: "var(--text-muted)",
                  fontWeight: 600,
                  width: "100%",
                }}
                className="active-tap"
              >
                Limpiar filtros
              </button>
              {closuresDateError && (
                <span style={{ color: "#b91c1c", fontSize: 12, fontWeight: 600 }}>{closuresDateError}</span>
              )}
              <div
                style={{
                  fontSize: 12,
                  color: "var(--text-muted)",
                  fontWeight: 600,
                  textAlign: "center",
                  paddingTop: 4,
                  borderTop: "1px solid var(--border)",
                }}
              >
                {closuresTotal} registro{closuresTotal !== 1 ? "s" : ""}
                {closuresUserSearch.trim() && (
                  <div style={{ fontWeight: 500, marginTop: 2 }}>
                    ({closuresFiltered.length} coinciden en esta página)
                  </div>
                )}
              </div>
            </div>
          ) : (
            <Toolbar>
              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--accent-strong)" }}>Desde:</label>
                <input
                  type="date"
                  value={closuresFrom}
                  max={closuresTo || undefined}
                  onChange={(e) => setClosuresFrom(e.target.value)}
                  style={{ ...inputStyle, ...(closuresDateError ? { borderColor: "#ef4444" } : {}) }}
                />
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--accent-strong)" }}>Hasta:</label>
                <input
                  type="date"
                  value={closuresTo}
                  min={closuresFrom || undefined}
                  onChange={(e) => setClosuresTo(e.target.value)}
                  style={{ ...inputStyle, ...(closuresDateError ? { borderColor: "#ef4444" } : {}) }}
                />
                <input
                  type="text"
                  placeholder="Buscar cajero..."
                  value={closuresUserSearch}
                  onChange={(e) => setClosuresUserSearch(e.target.value)}
                  maxLength={120}
                  style={{ ...inputStyle, minWidth: 160 }}
                />
                <button
                  onClick={clearClosuresFilters}
                  style={{
                    padding: "8px 14px",
                    background: "#f3f4f6",
                    border: "1px solid #d1d5db",
                    borderRadius: 6,
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#374151",
                  }}
                  className="active-tap"
                >
                  Limpiar filtros
                </button>
              </div>
              <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                {closuresTotal} registro{closuresTotal !== 1 ? "s" : ""}
                {closuresUserSearch.trim() ? ` (${closuresFiltered.length} en esta página)` : ""}
              </span>
            </Toolbar>
          )}

          {isMobile ? (
            <div style={{ overflowY: "auto", maxHeight: "62vh", padding: "8px 4px" }}>
              {closuresLoading && (
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
              {closuresError && (
                <div
                  style={{
                    textAlign: "center",
                    padding: "32px 16px",
                    color: "#b91c1c",
                    fontSize: 13,
                    fontWeight: 500,
                  }}
                >
                  {closuresError}
                </div>
              )}
              {!closuresLoading && !closuresError && closuresFiltered.length === 0 && (
                <div
                  style={{
                    textAlign: "center",
                    padding: "32px 16px",
                    color: "var(--text-faint)",
                    fontSize: 13,
                    fontWeight: 500,
                  }}
                >
                  No hay cierres de caja para los filtros seleccionados.
                </div>
              )}

              {!closuresLoading &&
                !closuresError &&
                closuresFiltered.map((c) => {
                  const expanded = expandedClosures[c.id];
                  return (
                    <div
                      key={c.id}
                      style={{
                        backgroundColor: "var(--surface)",
                        border: "1px solid var(--border)",
                        borderRadius: 12,
                        marginBottom: 10,
                        boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "6px 12px 5px 12px",
                          fontSize: 10,
                          fontWeight: 700,
                          color: "var(--text-muted)",
                          borderBottom: "1px solid var(--surface-3)",
                          backgroundColor: "var(--surface-2)",
                          letterSpacing: "0.2px",
                          textTransform: "uppercase",
                        }}
                      >
                        <span
                          style={{
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            maxWidth: "55%",
                          }}
                        >
                          {c.user.name}
                        </span>
                        <ClosureTypeBadge type={c.closureType} />
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr",
                          gap: "4px",
                          padding: "14px 12px",
                        }}
                      >
                        <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                          <span style={{ fontWeight: 600, color: "var(--text)" }}>Cerrada:</span>{" "}
                          {c.closedAt ? fmtDateTime(c.closedAt) : "—"}
                        </div>
                        <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                          <span style={{ fontWeight: 600, color: "var(--text)" }}>Sucursal:</span>{" "}
                          {c.branch?.name ?? "—"}
                        </div>
                        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
                          <button
                            onClick={() => toggleExpandClosure(c.id)}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              backgroundColor: "var(--surface)",
                              border: "1px solid var(--border-strong)",
                              borderRadius: 6,
                              width: 36,
                              height: 36,
                              cursor: "pointer",
                              color: "var(--text-muted)",
                              padding: 0,
                            }}
                            className="active-tap"
                          >
                            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </button>
                        </div>
                      </div>

                      {expanded && (
                        <div
                          style={{
                            padding: "14px",
                            margin: "0 12px 14px 12px",
                            backgroundColor: "var(--surface-2)",
                            borderRadius: "8px",
                            border: "1px solid var(--border)",
                            display: "grid",
                            gridTemplateColumns: "1fr",
                            gap: "6px",
                            textAlign: "left",
                          }}
                        >
                          <div style={detailRowStyle}>
                            <span style={detailLabelStyle}>Cajero:</span>
                            <span style={detailValueStyle}>
                              {c.user.name} ({c.user.email})
                            </span>
                          </div>
                          <div style={detailRowStyle}>
                            <span style={detailLabelStyle}>Sucursal:</span>
                            <span style={detailValueStyle}>{c.branch?.name ?? "—"}</span>
                          </div>
                          <div style={detailRowStyle}>
                            <span style={detailLabelStyle}>Abierta:</span>
                            <span style={detailValueStyle}>{fmtDateTime(c.openedAt)}</span>
                          </div>
                          <div style={detailRowStyle}>
                            <span style={detailLabelStyle}>Duración:</span>
                            <span style={detailValueStyle}>{formatDuration(c.openedAt, c.closedAt)}</span>
                          </div>
                          <div style={detailRowStyle}>
                            <span style={detailLabelStyle}>Tipo:</span>
                            <span style={detailValueStyle}>
                              <ClosureTypeBadge type={c.closureType} />
                            </span>
                          </div>
                          {c.closureType === "FORCED" && (
                            <>
                              <div style={detailRowStyle}>
                                <span style={detailLabelStyle}>Motivo:</span>
                                <span style={detailValueStyle}>{c.forceCloseReason ?? "—"}</span>
                              </div>
                              {c.forcedByAdmin && (
                                <div style={detailRowStyle}>
                                  <span style={detailLabelStyle}>Por:</span>
                                  <span style={detailValueStyle}>{c.forcedByAdmin}</span>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              {closuresPageCount > 1 && (
                <Pagination
                  page={closuresPage}
                  pageCount={closuresPageCount}
                  total={closuresTotal}
                  from={closuresRangeFrom}
                  to={closuresRangeTo}
                  onPage={setClosuresPage}
                  itemLabel="cierres"
                />
              )}
            </div>
          ) : (
            <>
              <div
                className="table-sticky-head"
                style={{ ...ui.tableWrap, overflowX: "auto", overflowY: "auto", maxHeight: "62vh" }}
              >
                <table style={ui.table}>
                  <thead>
                    <tr style={ui.theadRow}>
                      <th style={ui.th}>Cajero</th>
                      <th style={ui.th}>Sucursal</th>
                      <th style={ui.th}>Cerrada</th>
                      <th style={ui.th}>Duración</th>
                      <th style={{ ...ui.th, textAlign: "center" }}>Tipo</th>
                      <th style={ui.th}>Motivo / Admin</th>
                    </tr>
                  </thead>
                  <tbody>
                    <TableState
                      colSpan={6}
                      loading={closuresLoading}
                      error={closuresError}
                      empty={!closuresLoading && !closuresError && closuresFiltered.length === 0}
                      emptyText="No hay cierres de caja para los filtros seleccionados."
                    />
                    {!closuresLoading &&
                      !closuresError &&
                      closuresFiltered.map((c) => (
                        <tr key={c.id}>
                          <td style={ui.td}>
                            <div style={{ fontWeight: 700, color: "var(--text)" }}>{c.user.name}</div>
                            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{c.user.email}</div>
                          </td>
                          <td style={{ ...ui.td, color: "var(--text-muted)" }}>
                            {c.branch?.name ?? <span style={{ color: "var(--border-strong)" }}>—</span>}
                          </td>
                          <td style={{ ...ui.td, whiteSpace: "nowrap", color: "var(--text-secondary)" }}>
                            {c.closedAt ? fmtDateTime(c.closedAt) : "—"}
                          </td>
                          <td style={{ ...ui.td, whiteSpace: "nowrap", color: "var(--text-secondary)" }}>
                            {formatDuration(c.openedAt, c.closedAt)}
                          </td>
                          <td style={{ ...ui.td, textAlign: "center" }}>
                            <ClosureTypeBadge type={c.closureType} />
                          </td>
                          <td style={{ ...ui.td, maxWidth: 220 }}>
                            {c.closureType === "FORCED" ? (
                              <>
                                <div style={{ fontSize: 12, color: "var(--text-secondary)", wordBreak: "break-word" }}>
                                  {c.forceCloseReason ?? "—"}
                                </div>
                                {c.forcedByAdmin && (
                                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                                    Por: {c.forcedByAdmin}
                                  </div>
                                )}
                              </>
                            ) : (
                              <span style={{ color: "var(--border-strong)" }}>—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              {closuresPageCount > 1 && (
                <Pagination
                  page={closuresPage}
                  pageCount={closuresPageCount}
                  total={closuresTotal}
                  from={closuresRangeFrom}
                  to={closuresRangeTo}
                  onPage={setClosuresPage}
                  itemLabel="cierres"
                />
              )}
            </>
          )}
        </>
      )}
    </div>
  );
};

export default CajaAccessLogView;
