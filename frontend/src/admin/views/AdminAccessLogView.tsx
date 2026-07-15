import React, { useState, useCallback, useEffect } from "react";
import { AlertTriangle, ShieldAlert, Lock, ChevronDown, ChevronUp, ShieldOff, X, Activity, MousePointerClick, Award } from "lucide-react";
import api from "../../shared/services/api";
import { validateDateRange, validateSearchText, validateReference } from "../../shared/utils/formValidation";
import { useAuth } from "../../auth";
import { useToast } from "../../shared/context/ToastContext";
import { useSecurityEvents } from "../context/SecurityEventsContext";
import { DataTable } from "../../shared/ui";
import type { Column } from "../../shared/ui";
import {
  ui,
  type ViewProps,
  Toolbar,
  MobileFilterDisclosure,
  FilterSelect,
  SectionHeader,
  useMediaQuery,
  usePagination,
  Pagination,
  fmtDate,
  fmtTime,
} from "./shared";

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

interface ActiveSessionRow {
  userId: number;
  name: string;
  email: string;
  role: string;
  branch: { id: number; name: string } | null;
  ipAddress: string | null;
  deviceId: string | null;
  since: string;
}

interface AdminSessionClosureRow {
  id: number;
  ipAddress: string | null;
  deviceId: string | null;
  loginAt: string;
  closedAt: string;
  closureType: "NORMAL" | "REVOKED";
  revokedReason: string | null;
  user: { id: number; name: string; email: string };
  branch: { id: number; name: string } | null;
  revokedBy: { id: number; name: string; email: string } | null;
}

// Fase 1 del log de movimientos administrativos: navegación entre vistas y acciones
// sensibles (revocar sesión, cambio de estado de empleado). Catálogo queda para Fase 2.
interface AdminActionLogRow {
  id: number;
  actionType: string;
  target: string | null;
  details: string | null;
  ipAddress: string | null;
  createdAt: string;
  user: { id: number; name: string; email: string };
}

type ActiveTab = "logins" | "active-sessions" | "closures" | "movements";
type ActionTypeFilter = "all" | "NAVIGATION" | "REVOKE_SESSION" | "EMPLOYEE_STATUS_CHANGE";
type ClosureTypeFilter = "all" | "NORMAL" | "REVOKED";

// No existe ya un helper de formato de duración reutilizable en el proyecto (se
// revisó formValidation/decimalInput y las vistas de reportes): se calcula aquí,
// a partir de las dos fechas crudas que ya manda el backend.
const formatDuration = (loginAt: string, closedAt: string): string => {
  const ms = new Date(closedAt).getTime() - new Date(loginAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const totalMinutes = Math.round(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} h`;
  return `${hours} h ${minutes} min`;
};

const ClosureTypeBadge: React.FC<{ type: string }> = ({ type }) => {
  const isRevoked = type === "REVOKED";
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
      }}
    >
      {isRevoked ? "Revocado" : "Normal"}
    </span>
  );
};

const ACTION_TYPE_LABELS: Record<string, { label: string; tone: "blue" | "red" | "amber" }> = {
  NAVIGATION: { label: "Navegación", tone: "blue" },
  REVOKE_SESSION: { label: "Revocar sesión", tone: "red" },
  EMPLOYEE_STATUS_CHANGE: { label: "Cambio de estado", tone: "amber" },
};

const ActionTypeBadge: React.FC<{ type: string }> = ({ type }) => {
  const isDark = document.documentElement.classList.contains("theme-dark");
  const cfg = ACTION_TYPE_LABELS[type] ?? { label: type.replace(/_/g, " "), tone: "blue" as const };
  const toneMap: Record<"blue" | "red" | "amber", { bg: string; color: string }> = {
    blue: { bg: isDark ? "rgba(96,165,250,0.15)" : "#dbeafe", color: isDark ? "#60a5fa" : "#1d4ed8" },
    red: { bg: isDark ? "rgba(239,68,68,0.15)" : "#fee2e2", color: isDark ? "#f87171" : "#b91c1c" },
    amber: { bg: isDark ? "rgba(245,158,11,0.15)" : "#fef3c7", color: isDark ? "#f59e0b" : "#92400e" },
  };
  const c = toneMap[cfg.tone];
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: 12,
        fontSize: 11,
        fontWeight: 700,
        backgroundColor: c.bg,
        color: c.color,
        whiteSpace: "nowrap",
      }}
    >
      {cfg.label}
    </span>
  );
};

const fmtDateTime = (iso: string) =>
  new Intl.DateTimeFormat("es-MX", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));

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

const RoleBadge: React.FC<{ role: string }> = ({ role }) => {
  const c = role === "ADMIN" ? { bg: "#fee2e2", color: "#b91c1c" } : { bg: "#ede9fe", color: "#5b21b6" };
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: 12,
        fontSize: 11,
        fontWeight: 700,
        backgroundColor: c.bg,
        color: c.color,
      }}
    >
      {role}
    </span>
  );
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

const detailRow = (label: string, value: React.ReactNode) => (
  <div style={detailRowStyle}>
    <span style={detailLabelStyle}>{label}:</span>
    <span style={detailValueStyle}>{value}</span>
  </div>
);

// Tarjeta expandible "Premium" de 2 niveles — misma estructura exacta que
// ReportAuditLogView.tsx: cabecera gris (fecha + badge), cuerpo blanco (título/
// subtítulo + botón chevron cuadrado independiente) y panel expandido gris con
// margen interno.
const ExpandableCard: React.FC<{
  topDate: React.ReactNode;
  topBadge: React.ReactNode;
  mainTitle: React.ReactNode;
  mainSubtitle: React.ReactNode;
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  extraActions?: React.ReactNode;
}> = ({ topDate, topBadge, mainTitle, mainSubtitle, isExpanded, onToggle, children, extraActions }) => (
  <div
    style={{
      backgroundColor: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: 12,
      marginBottom: 10,
      boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
      overflow: "hidden",
    }}
  >
    {/* Cabecera gris: fecha + badge */}
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "8px 16px 6px 16px",
        fontSize: 11,
        fontWeight: 700,
        color: "var(--text-muted)",
        borderBottom: "1px solid var(--border-soft)",
        backgroundColor: "var(--surface-2)",
        letterSpacing: "0.2px",
      }}
    >
      <span>{topDate}</span>
      {topBadge}
    </div>

    {/* Cuerpo blanco: título/subtítulo + chevron independiente */}
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", gap: 12 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: "var(--text)",
            wordBreak: "break-word",
            overflowWrap: "anywhere",
            whiteSpace: "normal",
          }}
        >
          {mainTitle}
        </div>
        <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>{mainSubtitle}</div>
      </div>

      <div style={{ display: "flex", alignItems: "center", alignSelf: "center" }}>
        <button
          type="button"
          onClick={onToggle}
          className="active-tap"
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
        >
          {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
      </div>
    </div>

    {/* Panel expandido gris con margen interno */}
    {isExpanded && (
      <div
        style={{
          padding: "16px",
          margin: "0 16px 16px 16px",
          backgroundColor: "var(--surface-2)",
          borderRadius: "12px",
          border: "1px solid var(--border)",
        }}
      >
        {children}
        {extraActions}
      </div>
    )}
  </div>
);

const truncatedSummary = (text: string): React.ReactNode => (
  <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{text}</span>
);

// Tarjeta de estadística "premium" (mismo patrón que las tarjetas del Dashboard:
// fondo var(--surface), borde definido, sombra sutil y chip de ícono a color).
const statCardStyle: React.CSSProperties = {
  backgroundColor: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: "16px 18px",
  boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
  minWidth: 0,
};
const statHeadStyle: React.CSSProperties = { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 };
const statLabelStyle: React.CSSProperties = { fontSize: 12.5, fontWeight: 600, color: "var(--text-muted)", minWidth: 0, lineHeight: 1.3 };
const statIconStyle: React.CSSProperties = {
  width: 30,
  height: 30,
  borderRadius: 8,
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
const statValueStyle: React.CSSProperties = {
  fontSize: "clamp(19px, 4.6vw, 26px)",
  fontWeight: 800,
  marginTop: 10,
  letterSpacing: "-0.4px",
  lineHeight: 1.15,
  color: "var(--text)",
  minWidth: 0,
  overflowWrap: "break-word",
};

const StatCard: React.FC<{
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  iconBg: string;
  valueFontSize?: string;
}> = ({ label, value, icon, iconBg, valueFontSize }) => (
  <div style={statCardStyle}>
    <div style={statHeadStyle}>
      <span style={statLabelStyle}>{label}</span>
      <div style={{ ...statIconStyle, backgroundColor: iconBg }}>{icon}</div>
    </div>
    <h2 style={{ ...statValueStyle, ...(valueFontSize ? { fontSize: valueFontSize } : {}) }}>{value}</h2>
  </div>
);

// Agrupa visualmente el rango de fechas (Desde/Hasta) dentro de MobileFilterDisclosure,
// para que no compita al mismo nivel que la búsqueda/combobox/botón — mismo padding y
// contenedor en las 3 pestañas que usan filtros de fecha.
const dateRangeGroupStyle: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flex: "1 1 100%",
  padding: 10,
  backgroundColor: "var(--surface-2)",
  borderRadius: 8,
  border: "1px solid var(--border-soft)",
};
const dateFieldStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 4, flex: "1 1 0", minWidth: 0 };
const mobileFilterFieldsWrap: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: 12 };

const MobileDateRangeFields: React.FC<{
  from: string;
  to: string;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
  hasError?: boolean;
}> = ({ from, to, onFrom, onTo, hasError }) => (
  <div style={dateRangeGroupStyle}>
    <div style={dateFieldStyle}>
      <label style={{ fontSize: 11, fontWeight: 700, color: "var(--accent-strong)" }}>Desde:</label>
      <input
        type="date"
        value={from}
        max={to || undefined}
        onChange={(e) => onFrom(e.target.value)}
        style={{ ...ui.input, maxWidth: "100%", padding: "6px 8px", ...(hasError ? { borderColor: "#ef4444" } : {}) }}
      />
    </div>
    <div style={dateFieldStyle}>
      <label style={{ fontSize: 11, fontWeight: 700, color: "var(--accent-strong)" }}>Hasta:</label>
      <input
        type="date"
        value={to}
        min={from || undefined}
        onChange={(e) => onTo(e.target.value)}
        style={{ ...ui.input, maxWidth: "100%", padding: "6px 8px", ...(hasError ? { borderColor: "#ef4444" } : {}) }}
      />
    </div>
  </div>
);

const AdminAccessLogView: React.FC<ViewProps> = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const isMobile = useMediaQuery("(max-width: 1024px)");
  const [activeTab, setActiveTab] = useState<ActiveTab>("logins");
  const [unlocked, setUnlocked] = useState(false);
  const [auditToken, setAuditToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [unlockLoading, setUnlockLoading] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);

  // Calcula cuántas filas caben en pantalla según la altura disponible (mismo
  // patrón usado en ReportAuditLogView/ClientesView), compartido por las 4 pestañas.
  const [dynPageSize, setDynPageSize] = useState(10);
  useEffect(() => {
    const ROW_H = 50;
    const FIXED = 314;
    const compute = () => setDynPageSize(Math.max(5, Math.floor((window.innerHeight - FIXED) / ROW_H)));
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);

  // ── Tab "Accesos" ──
  const [rows, setRows] = useState<AccessLogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [logsFiltersOpen, setLogsFiltersOpen] = useState(false);
  const [expandedLogs, setExpandedLogs] = useState<Record<number, boolean>>({});
  const dateError = from && to ? validateDateRange(from, to) : undefined;
  const userSearchError = validateSearchText(userSearch, "La busqueda de usuario", { max: 120 });

  const toggleExpand = (id: number) => setExpandedLogs((prev) => ({ ...prev, [id]: !prev[id] }));

  const relock = (msg: string) => {
    setUnlocked(false);
    setAuditToken(null);
    setRows([]);
    setUnlockError(msg);
  };

  // Carga de datos optimizada con conversión de Zona Horaria Local -> UTC
  const load = useCallback(
    async (token: string, f: string, t: string) => {
      const invalidRange = f && t ? validateDateRange(f, t) : undefined;
      if (invalidRange) {
        setRows([]);
        setError(invalidRange);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const params: any = { auditToken: token };

        // SOLUCCIÓN TIMING: Creamos fechas basadas en la zona horaria del navegador
        // y dejamos que .toISOString() haga la conversión correcta para el backend.
        if (f) {
          const localFrom = new Date(`${f}T00:00:00`);
          params.from = localFrom.toISOString();
        }

        if (t) {
          const localTo = new Date(`${t}T23:59:59.999`);
          params.to = localTo.toISOString();
        }

        const res = await api.post<{ logs: AccessLogRow[] }>("/api/admin/security/admin-access", params);
        setRows(res.data.logs);
      } catch (err: any) {
        if (err.response?.data?.code === "AUDIT_LOCK") {
          relock("Su sesión de auditoría expiró. Reingrese su contraseña para continuar.");
        } else {
          setError(err.response?.data?.message || "No se pudieron cargar los accesos administrativos.");
        }
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Cargar datos cuando cambian las fechas o el token
  useEffect(() => {
    if (auditToken) {
      load(auditToken, from, to);
    }
  }, [auditToken, from, to, load]);

  // Filtrado local exclusivo para la búsqueda por texto de usuario
  const visible = userSearch.trim()
    ? rows.filter(
        (r) =>
          r.user.name.toLowerCase().includes(userSearch.toLowerCase()) ||
          r.user.email.toLowerCase().includes(userSearch.toLowerCase())
      )
    : rows;

  const logsPagination = usePagination(visible, { pageSize: dynPageSize, resetKey: `${from}|${to}|${userSearch}` });

  const logsActiveFilterLabels = [
    from ? `Desde ${from}` : null,
    to ? `Hasta ${to}` : null,
    userSearch.trim() ? "Búsqueda de usuario" : null,
  ].filter((l): l is string => Boolean(l));
  const logsFilterSummary = logsActiveFilterLabels.length > 0 ? logsActiveFilterLabels.join(", ") : "Sin filtros activos";

  // ── Tab "Sesiones Activas" ──
  const [sessionRows, setSessionRows] = useState<ActiveSessionRow[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<ActiveSessionRow | null>(null);
  const [revokeConfirmOpen, setRevokeConfirmOpen] = useState(false);
  const [revokeReason, setRevokeReason] = useState("");
  const [revokeReasonError, setRevokeReasonError] = useState("");
  const [revoking, setRevoking] = useState(false);
  const [expandedSessions, setExpandedSessions] = useState<Record<number, boolean>>({});
  const toggleExpandSession = (id: number) => setExpandedSessions((prev) => ({ ...prev, [id]: !prev[id] }));

  const loadActiveSessions = useCallback(async () => {
    setSessionsLoading(true);
    setSessionsError(null);
    try {
      const res = await api.get<{ sessions: ActiveSessionRow[] }>("/api/admin/security/active-sessions");
      setSessionRows(res.data.sessions);
    } catch (err: any) {
      setSessionsError(err.response?.data?.message || "No se pudieron cargar las sesiones activas.");
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (unlocked && activeTab === "active-sessions") {
      loadActiveSessions();
    }
  }, [unlocked, activeTab, loadActiveSessions]);

  const sessionsPagination = usePagination(sessionRows, { pageSize: dynPageSize, resetKey: activeTab });

  // ── Tab "Historial de Cierres" ──
  const [closureRows, setClosureRows] = useState<AdminSessionClosureRow[]>([]);
  const [closuresLoading, setClosuresLoading] = useState(false);
  const [closuresError, setClosuresError] = useState<string | null>(null);
  const [closureSearch, setClosureSearch] = useState("");
  const [closureTypeFilter, setClosureTypeFilter] = useState<ClosureTypeFilter>("all");
  const [closuresFiltersOpen, setClosuresFiltersOpen] = useState(false);
  const [expandedClosures, setExpandedClosures] = useState<Record<number, boolean>>({});
  const toggleExpandClosure = (id: number) => setExpandedClosures((prev) => ({ ...prev, [id]: !prev[id] }));

  // Mismo patrón de carga que "Accesos": reutiliza los filtros from/to ya
  // existentes en el componente (misma UI de fechas, un solo rango compartido).
  const loadClosures = useCallback(async (f: string, t: string) => {
    const invalidRange = f && t ? validateDateRange(f, t) : undefined;
    if (invalidRange) {
      setClosureRows([]);
      setClosuresError(invalidRange);
      setClosuresLoading(false);
      return;
    }
    setClosuresLoading(true);
    setClosuresError(null);
    try {
      const params: any = {};
      if (f) params.from = new Date(`${f}T00:00:00`).toISOString();
      if (t) params.to = new Date(`${t}T23:59:59.999`).toISOString();
      const res = await api.get<{ closures: AdminSessionClosureRow[] }>(
        "/api/admin/security/admin-session-closures",
        { params }
      );
      setClosureRows(res.data.closures);
    } catch (err: any) {
      setClosuresError(err.response?.data?.message || "No se pudo cargar el historial de cierres.");
    } finally {
      setClosuresLoading(false);
    }
  }, []);

  // Carga solo al entrar a esta pestaña (o si cambian los filtros mientras está
  // activa), igual que el patrón ya usado por "Sesiones Activas" — evita refrescar
  // una pestaña que el usuario no está viendo.
  useEffect(() => {
    if (unlocked && activeTab === "closures") {
      loadClosures(from, to);
    }
  }, [unlocked, activeTab, from, to, loadClosures]);

  // Filtrado 100% client-side sobre los datos ya cargados: busca en usuario
  // (nombre/correo) y motivo de revocación; el combobox filtra por tipo de cierre.
  const filteredClosures = closureRows.filter((c) => {
    if (closureTypeFilter !== "all" && c.closureType !== closureTypeFilter) return false;
    if (!closureSearch.trim()) return true;
    const q = closureSearch.trim().toLowerCase();
    return (
      c.user.name.toLowerCase().includes(q) ||
      c.user.email.toLowerCase().includes(q) ||
      (c.revokedReason ?? "").toLowerCase().includes(q)
    );
  });

  const closuresPagination = usePagination(filteredClosures, {
    pageSize: dynPageSize,
    resetKey: `${activeTab}|${from}|${to}|${closureSearch}|${closureTypeFilter}`,
  });

  const closuresActiveFilterLabels = [
    from ? `Desde ${from}` : null,
    to ? `Hasta ${to}` : null,
    closureSearch.trim() ? "Búsqueda" : null,
    closureTypeFilter !== "all" ? (closureTypeFilter === "REVOKED" ? "Revocado" : "Normal") : null,
  ].filter((l): l is string => Boolean(l));
  const closuresFilterSummary =
    closuresActiveFilterLabels.length > 0 ? closuresActiveFilterLabels.join(", ") : "Sin filtros activos";

  // ── Tab "Log de movimientos" (Fase 1: navegación + acciones sensibles) ──
  const [movementRows, setMovementRows] = useState<AdminActionLogRow[]>([]);
  const [movementsLoading, setMovementsLoading] = useState(false);
  const [movementsError, setMovementsError] = useState<string | null>(null);
  const [movementSearch, setMovementSearch] = useState("");
  const [actionTypeFilter, setActionTypeFilter] = useState<ActionTypeFilter>("all");
  const [movementsFiltersOpen, setMovementsFiltersOpen] = useState(false);
  const [expandedMovements, setExpandedMovements] = useState<Record<number, boolean>>({});
  const toggleExpandMovement = (id: number) => setExpandedMovements((prev) => ({ ...prev, [id]: !prev[id] }));

  const loadMovements = useCallback(async (f: string, t: string) => {
    const invalidRange = f && t ? validateDateRange(f, t) : undefined;
    if (invalidRange) {
      setMovementRows([]);
      setMovementsError(invalidRange);
      setMovementsLoading(false);
      return;
    }
    setMovementsLoading(true);
    setMovementsError(null);
    try {
      const params: any = {};
      if (f) params.from = new Date(`${f}T00:00:00`).toISOString();
      if (t) params.to = new Date(`${t}T23:59:59.999`).toISOString();
      const res = await api.get<{ logs: AdminActionLogRow[] }>("/api/admin/security/action-log", { params });
      setMovementRows(res.data.logs);
    } catch (err: any) {
      setMovementsError(err.response?.data?.message || "No se pudo cargar el log de movimientos.");
    } finally {
      setMovementsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (unlocked && activeTab === "movements") {
      loadMovements(from, to);
    }
  }, [unlocked, activeTab, from, to, loadMovements]);

  const filteredMovements = movementRows.filter((m) => {
    if (actionTypeFilter !== "all" && m.actionType !== actionTypeFilter) return false;
    if (!movementSearch.trim()) return true;
    const q = movementSearch.trim().toLowerCase();
    return (
      m.user.name.toLowerCase().includes(q) ||
      m.user.email.toLowerCase().includes(q) ||
      (m.target ?? "").toLowerCase().includes(q)
    );
  });

  const movementsPagination = usePagination(filteredMovements, {
    pageSize: dynPageSize,
    resetKey: `${activeTab}|${from}|${to}|${movementSearch}|${actionTypeFilter}`,
  });

  const movementsActiveFilterLabels = [
    from ? `Desde ${from}` : null,
    to ? `Hasta ${to}` : null,
    movementSearch.trim() ? "Búsqueda" : null,
    actionTypeFilter !== "all" ? ACTION_TYPE_LABELS[actionTypeFilter]?.label ?? actionTypeFilter : null,
  ].filter((l): l is string => Boolean(l));
  const movementsFilterSummary =
    movementsActiveFilterLabels.length > 0 ? movementsActiveFilterLabels.join(", ") : "Sin filtros activos";

  // Tarjetas de resumen del "Log de movimientos": se calculan en el frontend sobre
  // filteredMovements (los mismos datos ya filtrados que alimentan la tabla), así que
  // se recalculan solas cuando cambian fecha/búsqueda/tipo — sin endpoint nuevo.
  const movementsTotal = filteredMovements.length;
  const navigationCount = filteredMovements.filter((m) => m.actionType === "NAVIGATION").length;
  const sensitiveCount = movementsTotal - navigationCount;
  const mostActiveAdmin = (() => {
    if (movementsTotal === 0) return "—";
    const counts = new Map<string, number>();
    filteredMovements.forEach((m) => counts.set(m.user.name, (counts.get(m.user.name) ?? 0) + 1));
    let topName = "—";
    let topCount = 0;
    counts.forEach((count, name) => {
      if (count > topCount) {
        topCount = count;
        topName = name;
      }
    });
    return `${topName} (${topCount})`;
  })();

  const closeRevokeFlow = () => {
    setRevokeTarget(null);
    setRevokeConfirmOpen(false);
    setRevokeReason("");
    setRevokeReasonError("");
  };

  const confirmRevokeSession = async () => {
    if (!revokeTarget || revoking) return;
    setRevoking(true);
    try {
      await api.post(`/api/admin/security/revoke-session/${revokeTarget.userId}`, {
        reason: revokeReason.trim(),
      });
      showToast(`Sesión de ${revokeTarget.name} cerrada correctamente.`, "success");
      closeRevokeFlow();
      await loadActiveSessions();
    } catch {
      // Manejado por el interceptor global de errores (api.ts) — mismo mensaje.
    } finally {
      setRevoking(false);
    }
  };

  // Actualización en tiempo real: se suscribe a la conexión SSE global (ver
  // SecurityEventsProvider en AdminDashboard.tsx) en vez de abrir una conexión propia,
  // para no duplicar el EventSource. Refrescamos AMBAS listas (sesiones activas e
  // historial de accesos) cuando hay un nuevo login, solo si ya pasamos el gate de
  // contraseña de esta vista. No se gatea por activeTab: loadActiveSessions ya se
  // refrescaba aquí sin importar la pestaña visible (mantiene los datos frescos para
  // cuando el usuario cambie de pestaña), así que load() sigue ese mismo patrón por
  // consistencia. La detección de revocación (propia o ajena) ahora depende de
  // AdminSession en BD: la del propio usuario la cubre useAdminSessionStatus
  // (polling de 5s) + el rechazo duro 401 SESION_DESPLAZADA.
  useSecurityEvents(
    useCallback(
      (payload) => {
        if (!unlocked) return;
        if (payload.type === "login") {
          loadActiveSessions();
          if (auditToken) load(auditToken, from, to);
        }
      },
      [unlocked, loadActiveSessions, load, auditToken, from, to]
    )
  );

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (unlockLoading) return;
    if (!password.trim()) return;
    if (password.length > 128) {
      setUnlockError("La contrasena no puede exceder 128 caracteres.");
      return;
    }
    setUnlockLoading(true);
    setUnlockError(null);
    try {
      const res = await api.post<{ auditToken: string }>("/api/admin/security/audit-unlock", { password });
      setAuditToken(res.data.auditToken);
      setUnlocked(true);
      setPassword("");
    } catch (err: any) {
      const data = err.response?.data;
      if (data?.code === "PASSWORD_INCORRECTA") {
        setUnlockError("Contraseña incorrecta. Verifique e intente de nuevo.");
      } else if (!err.response) {
        setUnlockError("No hay conexión con el servidor. Intente de nuevo.");
      } else {
        setUnlockError(data?.message || "No se pudo validar la contraseña.");
      }
      setPassword("");
    } finally {
      setUnlockLoading(false);
    }
  };

  const clearFilters = () => {
    setFrom("");
    setTo("");
    setUserSearch("");
  };

  const clearClosureFilters = () => {
    setFrom("");
    setTo("");
    setClosureSearch("");
    setClosureTypeFilter("all");
  };

  const clearMovementFilters = () => {
    setFrom("");
    setTo("");
    setMovementSearch("");
    setActionTypeFilter("all");
  };

  // ---- Pantalla de candado ----
  if (!unlocked) {
    return (
      <div>
        <SectionHeader
          title="Accesos Administrativos"
          subtitle="Historial de inicios de sesión de administradores y gerentes"
        />
        <div style={lockStyles.wrap}>
          <div style={lockStyles.card}>
            <div style={lockStyles.iconCircle}>
              <ShieldAlert size={28} color="#b45309" />
            </div>
            <h3 style={lockStyles.title}>Acceso restringido</h3>
            <p style={lockStyles.desc}>
              Por seguridad, confirme su <strong>contraseña</strong> para ver los registros de acceso
              de administradores y gerentes.
            </p>
            <form onSubmit={handleUnlock} style={{ width: "100%", display: "flex", flexDirection: "column", gap: 12 }}>
              <input
                type="password"
                autoFocus
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setUnlockError(null);
                }}
                placeholder="Su contraseña actual"
                style={lockStyles.input}
                maxLength={128}
              />
              {unlockError && (
                <div style={lockStyles.error}>
                  <Lock size={14} color="#b91c1c" />
                  <span>{unlockError}</span>
                </div>
              )}
              <button type="submit" disabled={unlockLoading || !password.trim()} style={lockStyles.button}>
                {unlockLoading ? "Verificando..." : "Desbloquear"}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // ---- Columnas de las tablas de escritorio (DataTable) ----
  const loginColumns: Column<AccessLogRow>[] = [
    {
      key: "createdAt",
      header: "Fecha / Hora",
      render: (row) => <span style={{ whiteSpace: "nowrap", color: "var(--text-secondary)" }}>{fmtDateTime(row.createdAt)}</span>,
    },
    {
      key: "user",
      header: "Usuario",
      render: (row) => (
        <div>
          <div style={{ fontWeight: 700, color: "var(--text)" }}>{row.user.name}</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{row.user.email}</div>
        </div>
      ),
    },
    { key: "role", header: "Rol", align: "center", render: (row) => <RoleBadge role={row.role} /> },
    {
      key: "branch",
      header: "Sucursal",
      render: (row) => row.branch?.name ?? <span style={{ color: "var(--text-faint)" }}>—</span>,
    },
    {
      key: "method",
      header: "Método",
      align: "center",
      render: (row) => <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{row.method}</span>,
    },
    {
      key: "ipAddress",
      header: "IP",
      render: (row) => (
        <span style={{ fontFamily: "monospace", fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
          {row.ipAddress ?? "—"}
        </span>
      ),
    },
  ];

  const sessionColumns: Column<ActiveSessionRow>[] = [
    {
      key: "user",
      header: "Usuario",
      render: (s) => (
        <div>
          <div style={{ fontWeight: 700, color: "var(--text)" }}>
            {s.name}
            {user?.id === s.userId ? " (tú)" : ""}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{s.email}</div>
        </div>
      ),
    },
    { key: "role", header: "Rol", align: "center", render: (s) => <RoleBadge role={s.role} /> },
    {
      key: "branch",
      header: "Sucursal",
      render: (s) => s.branch?.name ?? <span style={{ color: "var(--text-faint)" }}>—</span>,
    },
    {
      key: "since",
      header: "Activo desde",
      render: (s) => <span style={{ whiteSpace: "nowrap", color: "var(--text-secondary)" }}>{fmtDateTime(s.since)}</span>,
    },
    {
      key: "device",
      header: "Dispositivo",
      render: (s) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)" }}>{formatDevice(s.deviceId)}</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2, fontFamily: "monospace" }}>
            {formatDeviceShort(s.deviceId)}
          </div>
        </div>
      ),
    },
    {
      key: "ipAddress",
      header: "IP",
      render: (s) => (
        <span style={{ fontFamily: "monospace", fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
          {formatIP(s.ipAddress)}
        </span>
      ),
    },
    {
      key: "actions",
      header: "Acción",
      align: "right",
      render: (s) =>
        user?.id !== s.userId ? (
          <button
            onClick={() => setRevokeTarget(s)}
            style={{
              padding: "6px 12px",
              borderRadius: 8,
              border: "1px solid #fca5a5",
              backgroundColor: "#fef2f2",
              color: "#b91c1c",
              fontWeight: 700,
              fontSize: 12,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
            }}
            className="active-tap"
          >
            <ShieldOff size={13} /> Cerrar sesión
          </button>
        ) : null,
    },
  ];

  const closureColumns: Column<AdminSessionClosureRow>[] = [
    {
      key: "user",
      header: "Usuario",
      render: (c) => (
        <div>
          <div style={{ fontWeight: 700, color: "var(--text)" }}>{c.user.name}</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{c.user.email}</div>
        </div>
      ),
    },
    {
      key: "branch",
      header: "Sucursal",
      render: (c) => c.branch?.name ?? <span style={{ color: "var(--text-faint)" }}>—</span>,
    },
    {
      key: "closedAt",
      header: "Cerrado",
      render: (c) => <span style={{ whiteSpace: "nowrap", color: "var(--text-secondary)" }}>{fmtDateTime(c.closedAt)}</span>,
    },
    {
      key: "duration",
      header: "Duración",
      render: (c) => <span style={{ whiteSpace: "nowrap", color: "var(--text-secondary)" }}>{formatDuration(c.loginAt, c.closedAt)}</span>,
    },
    { key: "closureType", header: "Tipo", align: "center", render: (c) => <ClosureTypeBadge type={c.closureType} /> },
    {
      key: "device",
      header: "Dispositivo",
      render: (c) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)" }}>{formatDevice(c.deviceId)}</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2, fontFamily: "monospace" }}>
            {formatDeviceShort(c.deviceId)}
          </div>
        </div>
      ),
    },
    {
      key: "ipAddress",
      header: "IP",
      render: (c) => (
        <span style={{ fontFamily: "monospace", fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
          {formatIP(c.ipAddress)}
        </span>
      ),
    },
    {
      key: "reason",
      header: "Motivo",
      width: "220px",
      render: (c) =>
        c.closureType === "REVOKED" ? (
          <>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", wordBreak: "break-word" }}>{c.revokedReason ?? "—"}</div>
            {c.revokedBy && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>Por: {c.revokedBy.name}</div>}
          </>
        ) : (
          <span style={{ color: "var(--border-strong)" }}>—</span>
        ),
    },
  ];

  const movementColumns: Column<AdminActionLogRow>[] = [
    {
      key: "createdAt",
      header: "Fecha / Hora",
      render: (m) => <span style={{ whiteSpace: "nowrap", color: "var(--text-secondary)" }}>{fmtDateTime(m.createdAt)}</span>,
    },
    {
      key: "user",
      header: "Usuario",
      render: (m) => (
        <div>
          <div style={{ fontWeight: 700, color: "var(--text)" }}>{m.user.name}</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{m.user.email}</div>
        </div>
      ),
    },
    { key: "actionType", header: "Tipo de acción", align: "center", render: (m) => <ActionTypeBadge type={m.actionType} /> },
    {
      key: "detail",
      header: "Detalle",
      render: (m) => (
        <div style={{ fontSize: 12, color: "var(--text-secondary)", wordBreak: "break-word" }}>
          {m.target ?? "—"}
          {m.details && <span style={{ color: "var(--text-muted)" }}> — {m.details}</span>}
        </div>
      ),
    },
  ];

  // ---- Bitácora (ya desbloqueada) ----
  return (
    <div>
      <SectionHeader
        title="Accesos Administrativos"
        subtitle={
          activeTab === "logins"
            ? "Historial de inicios de sesión de administradores y gerentes"
            : activeTab === "active-sessions"
            ? "Sesiones de administrador/gerente activas en este momento"
            : activeTab === "closures"
            ? "Historial de cierres de sesión (normales y revocados)"
            : "Log de movimientos administrativos (navegación y acciones sensibles)"
        }
      />

      <style>{`
        .admin-access-tabs-scroll { scrollbar-width: none; -ms-overflow-style: none; }
        .admin-access-tabs-scroll::-webkit-scrollbar { display: none; }
      `}</style>
      <div style={{ position: "relative", marginBottom: 18 }}>
        <div
          className="admin-access-tabs-scroll"
          style={{
            display: "flex",
            gap: 0,
            borderBottom: "1px solid var(--border)",
            overflowX: "auto",
            overflowY: "hidden",
          }}
        >
          {(["logins", "active-sessions", "closures", "movements"] as const).map((tab) => {
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
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                {tab === "logins"
                  ? "Accesos"
                  : tab === "active-sessions"
                  ? "Sesiones Activas"
                  : tab === "closures"
                  ? "Historial de Cierres"
                  : "Log de movimientos"}
              </button>
            );
          })}
        </div>
        {/* Indicio visual de que hay más pestañas a la derecha (el scroll horizontal
            corta el texto en el borde): fundido sutil hacia el fondo de la página. */}
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 1,
            width: 28,
            background: "linear-gradient(to right, transparent, var(--app-bg))",
            pointerEvents: "none",
          }}
        />
      </div>

      {activeTab === "logins" && (
        <>
          {/* ============================== FILTROS ============================== */}
          {isMobile ? (
            <MobileFilterDisclosure
              id="admin-access-logs-filters"
              title="Filtros"
              activeCount={logsActiveFilterLabels.length}
              summary={truncatedSummary(logsFilterSummary)}
              isOpen={logsFiltersOpen}
              onToggle={() => setLogsFiltersOpen((c) => !c)}
            >
              <div style={mobileFilterFieldsWrap}>
                <MobileDateRangeFields from={from} to={to} onFrom={setFrom} onTo={setTo} hasError={Boolean(dateError)} />
                <input
                  type="text"
                  placeholder="Buscar usuario..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  maxLength={120}
                  style={{ ...ui.input, flex: "1 1 100%", maxWidth: "100%", padding: "6px 8px" }}
                />
                <button
                  onClick={clearFilters}
                  style={{ ...ui.ghostBtn, flex: "1 1 100%", justifyContent: "center", padding: "6px 8px", fontSize: 12 }}
                  className="active-tap"
                >
                  Limpiar filtros
                </button>
                {(dateError || userSearchError) && (
                  <span style={{ color: "#b91c1c", fontSize: 12, fontWeight: 600, flex: "1 1 100%" }}>{dateError || userSearchError}</span>
                )}
              </div>
            </MobileFilterDisclosure>
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
                  placeholder="Buscar usuario..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  maxLength={120}
                  style={{ ...inputStyle, minWidth: 160 }}
                />
                <button onClick={clearFilters} style={ui.ghostBtn} className="active-tap">
                  Limpiar
                </button>
              </div>
              <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                {visible.length} registro{visible.length !== 1 ? "s" : ""}
              </span>
            </Toolbar>
          )}

          {/* ============================== MÓVIL / ESCRITORIO ============================== */}
          {isMobile ? (
            <div style={{ padding: "8px 4px" }}>
              {loading && (
                <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--text-faint)", fontSize: 13, fontWeight: 500 }}>
                  Cargando información...
                </div>
              )}
              {error && (
                <div style={{ textAlign: "center", padding: "32px 16px", color: "#b91c1c", fontSize: 13, fontWeight: 500 }}>{error}</div>
              )}
              {!loading && !error && logsPagination.total === 0 && (
                <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--text-faint)", fontSize: 13, fontWeight: 500 }}>
                  No hay registros para mostrar.
                </div>
              )}
              {!loading &&
                !error &&
                logsPagination.pageItems.map((row) => {
                  const isExpanded = expandedLogs[row.id];
                  return (
                    <ExpandableCard
                      key={row.id}
                      isExpanded={isExpanded}
                      onToggle={() => toggleExpand(row.id)}
                      topDate={`${fmtDate(row.createdAt)} ${fmtTime(row.createdAt)}`}
                      topBadge={<RoleBadge role={row.role} />}
                      mainTitle={row.user.name}
                      mainSubtitle={
                        <>
                          Sucursal: <strong>{row.branch?.name ?? "—"}</strong>
                        </>
                      }
                    >
                      {detailRow("Usuario", row.user.email)}
                      {detailRow("Sucursal", row.branch?.name ?? "—")}
                      {detailRow("Método", row.method)}
                      {detailRow("IP", <span style={{ fontFamily: "monospace" }}>{row.ipAddress ?? "—"}</span>)}
                    </ExpandableCard>
                  );
                })}
            </div>
          ) : (
            <DataTable
              columns={loginColumns}
              data={logsPagination.pageItems}
              loading={loading}
              error={error}
              emptyMessage="No hay accesos administrativos para los filtros seleccionados."
              keyExtractor={(row) => row.id}
              height="calc(100vh - 275px)"
            />
          )}

          {!loading && !error && (
            <Pagination
              page={logsPagination.page}
              pageCount={logsPagination.pageCount}
              total={logsPagination.total}
              from={logsPagination.from}
              to={logsPagination.to}
              onPage={logsPagination.setPage}
              itemLabel="registros"
            />
          )}
        </>
      )}

      {activeTab === "active-sessions" && (
        <>
          {isMobile ? (
            <div style={{ padding: "8px 4px" }}>
              {sessionsLoading && (
                <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--text-faint)", fontSize: 13, fontWeight: 500 }}>
                  Cargando información...
                </div>
              )}
              {sessionsError && (
                <div style={{ textAlign: "center", padding: "32px 16px", color: "#b91c1c", fontSize: 13, fontWeight: 500 }}>{sessionsError}</div>
              )}
              {!sessionsLoading && !sessionsError && sessionsPagination.total === 0 && (
                <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--text-faint)", fontSize: 13, fontWeight: 500 }}>
                  No hay sesiones de administrador/gerente activas.
                </div>
              )}

              {!sessionsLoading &&
                !sessionsError &&
                sessionsPagination.pageItems.map((s) => {
                  const isSelf = user?.id === s.userId;
                  const isExpanded = expandedSessions[s.userId];
                  return (
                    <ExpandableCard
                      key={s.userId}
                      isExpanded={isExpanded}
                      onToggle={() => toggleExpandSession(s.userId)}
                      topDate={`Desde ${fmtDateTime(s.since)}`}
                      topBadge={<RoleBadge role={s.role} />}
                      mainTitle={
                        <>
                          {s.name}
                          {isSelf ? " (tú)" : ""}
                        </>
                      }
                      mainSubtitle={
                        <>
                          Sucursal: <strong>{s.branch?.name ?? "—"}</strong>
                        </>
                      }
                      extraActions={
                        !isSelf && (
                          <button
                            onClick={() => setRevokeTarget(s)}
                            style={{
                              marginTop: 10,
                              padding: "8px 14px",
                              borderRadius: 8,
                              border: "1px solid #fca5a5",
                              backgroundColor: "#fef2f2",
                              color: "#b91c1c",
                              fontWeight: 700,
                              fontSize: 13,
                              cursor: "pointer",
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: 6,
                              width: "100%",
                            }}
                            className="active-tap"
                          >
                            <ShieldOff size={14} /> Cerrar sesión
                          </button>
                        )
                      }
                    >
                      {detailRow("Correo", s.email)}
                      {detailRow("Sucursal", s.branch?.name ?? "—")}
                      {detailRow(
                        "Dispositivo",
                        <>
                          <div style={{ fontWeight: 600 }}>{formatDevice(s.deviceId)}</div>
                          <div style={{ fontFamily: "monospace", fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>
                            {formatDeviceShort(s.deviceId)}
                          </div>
                        </>
                      )}
                      {detailRow("IP", <span style={{ fontFamily: "monospace" }}>{formatIP(s.ipAddress)}</span>)}
                    </ExpandableCard>
                  );
                })}
              <Pagination {...sessionsPagination} onPage={sessionsPagination.setPage} itemLabel="sesiones" />
            </div>
          ) : (
            <>
              <DataTable
                columns={sessionColumns}
                data={sessionsPagination.pageItems}
                loading={sessionsLoading}
                error={sessionsError}
                emptyMessage="No hay sesiones de administrador/gerente activas."
                keyExtractor={(s) => s.userId}
                height="calc(100vh - 275px)"
              />
              {!sessionsLoading && !sessionsError && (
                <Pagination {...sessionsPagination} onPage={sessionsPagination.setPage} itemLabel="sesiones" />
              )}
            </>
          )}

          {/* ===================== SUB-MODAL PASO 1: MOTIVO DE CIERRE ===================== */}
          {revokeTarget && !revokeConfirmOpen && (
            <div style={ui.overlay} onClick={closeRevokeFlow}>
              <div style={{ ...ui.modal, maxWidth: 440, width: "100%" }} onClick={(e) => e.stopPropagation()}>
                <div style={ui.modalHeader}>
                  <span style={ui.modalTitle}>¿Cerrar la sesión de "{revokeTarget.name}"?</span>
                  <button style={ui.ghostBtn} onClick={closeRevokeFlow} title="Cerrar">
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
                    <AlertTriangle size={14} /> Se cerrará de inmediato y deberá volver a iniciar sesión.
                  </p>
                  <label style={ui.fieldLabel}>Motivo del cierre *</label>
                  <textarea
                    value={revokeReason}
                    maxLength={180}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value.length <= 180) {
                        setRevokeReason(value);
                        setRevokeReasonError(validateReference(value, "El motivo", { required: true, max: 180 }) || "");
                      }
                    }}
                    placeholder="Ingresa el motivo del cierre de sesión..."
                    rows={3}
                    style={{
                      ...ui.input,
                      resize: "vertical",
                      minHeight: 80,
                      fontFamily: "inherit",
                      lineHeight: 1.5,
                    }}
                  />
                  {revokeReasonError && <p style={ui.fieldError}>{revokeReasonError}</p>}
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
                    <button style={ui.ghostBtn} onClick={closeRevokeFlow}>
                      Cancelar
                    </button>
                    <button
                      style={{
                        ...ui.primaryBtn,
                        backgroundColor: !revokeReason.trim() ? "#94a3b8" : "#b91c1c",
                        cursor: !revokeReason.trim() ? "not-allowed" : "pointer",
                      }}
                      onClick={() => {
                        const err = validateReference(revokeReason, "El motivo", { required: true, max: 180 });
                        if (err) {
                          setRevokeReasonError(err);
                          return;
                        }
                        setRevokeReasonError("");
                        setRevokeConfirmOpen(true);
                      }}
                      disabled={!revokeReason.trim()}
                    >
                      Continuar →
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================= SUB-MODAL PASO 2: CONFIRMAR CIERRE DE SESIÓN ================= */}
          {revokeTarget && revokeConfirmOpen && (
            <div style={{ ...ui.overlay, zIndex: 310 }} onClick={() => setRevokeConfirmOpen(false)}>
              <div style={{ ...ui.modal, maxWidth: 440, width: "100%" }} onClick={(e) => e.stopPropagation()}>
                <div style={ui.modalHeader}>
                  <span style={ui.modalTitle}>Confirmar cierre de sesión</span>
                  <button style={ui.ghostBtn} onClick={() => setRevokeConfirmOpen(false)} title="Cerrar">
                    <X size={15} />
                  </button>
                </div>
                <div style={ui.modalBody}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
                    {detailRow("Usuario", `${revokeTarget.name} (${revokeTarget.email})`)}
                    {detailRow("Sucursal", revokeTarget.branch?.name ?? "—")}
                    <div style={{ ...detailRowStyle, alignItems: "flex-start" }}>
                      <span style={detailLabelStyle}>Motivo:</span>
                      <span style={{ ...detailValueStyle, wordBreak: "break-word", flex: 1 }}>{revokeReason}</span>
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
                    <AlertTriangle size={14} /> Esta acción cerrará la sesión de inmediato y no se puede deshacer.
                  </p>
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                    <button style={ui.ghostBtn} onClick={() => setRevokeConfirmOpen(false)} disabled={revoking}>
                      ← Regresar
                    </button>
                    <button
                      style={{
                        ...ui.primaryBtn,
                        backgroundColor: "#b91c1c",
                        cursor: revoking ? "not-allowed" : "pointer",
                      }}
                      onClick={confirmRevokeSession}
                      disabled={revoking}
                    >
                      {revoking ? "Cerrando..." : "Confirmar cierre"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {activeTab === "closures" && (
        <>
          {/* ============================== FILTROS ============================== */}
          {isMobile ? (
            <MobileFilterDisclosure
              id="admin-closures-filters"
              title="Filtros"
              activeCount={closuresActiveFilterLabels.length}
              summary={truncatedSummary(closuresFilterSummary)}
              isOpen={closuresFiltersOpen}
              onToggle={() => setClosuresFiltersOpen((c) => !c)}
            >
              <div style={mobileFilterFieldsWrap}>
                <MobileDateRangeFields from={from} to={to} onFrom={setFrom} onTo={setTo} hasError={Boolean(dateError)} />
                <input
                  type="text"
                  placeholder="Buscar usuario o motivo..."
                  value={closureSearch}
                  onChange={(e) => setClosureSearch(e.target.value)}
                  maxLength={120}
                  style={{ ...ui.input, flex: "1 1 100%", maxWidth: "100%", padding: "6px 8px" }}
                />
                <FilterSelect
                  value={closureTypeFilter}
                  onChange={(v) => setClosureTypeFilter(v as ClosureTypeFilter)}
                  options={[
                    { value: "all", label: "Todos los tipos" },
                    { value: "NORMAL", label: "Normal" },
                    { value: "REVOKED", label: "Revocado" },
                  ]}
                  style={{ flex: "1 1 100%", maxWidth: "100%", width: "100%" }}
                />
                <button
                  onClick={clearClosureFilters}
                  style={{ ...ui.ghostBtn, flex: "1 1 100%", justifyContent: "center", padding: "6px 8px", fontSize: 12 }}
                  className="active-tap"
                >
                  Limpiar filtros
                </button>
                {dateError && <span style={{ color: "#b91c1c", fontSize: 12, fontWeight: 600, flex: "1 1 100%" }}>{dateError}</span>}
              </div>
            </MobileFilterDisclosure>
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
                  placeholder="Buscar usuario o motivo..."
                  value={closureSearch}
                  onChange={(e) => setClosureSearch(e.target.value)}
                  maxLength={120}
                  style={{ ...inputStyle, minWidth: 160 }}
                />
                <FilterSelect
                  value={closureTypeFilter}
                  onChange={(v) => setClosureTypeFilter(v as ClosureTypeFilter)}
                  options={[
                    { value: "all", label: "Todos los tipos" },
                    { value: "NORMAL", label: "Normal" },
                    { value: "REVOKED", label: "Revocado" },
                  ]}
                />
                <button onClick={clearClosureFilters} style={ui.ghostBtn} className="active-tap">
                  Limpiar
                </button>
              </div>
              <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                {filteredClosures.length} registro{filteredClosures.length !== 1 ? "s" : ""}
              </span>
            </Toolbar>
          )}

          {isMobile ? (
            <div style={{ padding: "8px 4px" }}>
              {closuresLoading && (
                <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--text-faint)", fontSize: 13, fontWeight: 500 }}>
                  Cargando información...
                </div>
              )}
              {closuresError && (
                <div style={{ textAlign: "center", padding: "32px 16px", color: "#b91c1c", fontSize: 13, fontWeight: 500 }}>{closuresError}</div>
              )}
              {!closuresLoading && !closuresError && closuresPagination.total === 0 && (
                <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--text-faint)", fontSize: 13, fontWeight: 500 }}>
                  No hay cierres de sesión para mostrar.
                </div>
              )}

              {!closuresLoading &&
                !closuresError &&
                closuresPagination.pageItems.map((c) => {
                  const isExpanded = expandedClosures[c.id];
                  return (
                    <ExpandableCard
                      key={c.id}
                      isExpanded={isExpanded}
                      onToggle={() => toggleExpandClosure(c.id)}
                      topDate={fmtDateTime(c.closedAt)}
                      topBadge={<ClosureTypeBadge type={c.closureType} />}
                      mainTitle={c.user.name}
                      mainSubtitle={
                        <>
                          Sucursal: <strong>{c.branch?.name ?? "—"}</strong>
                        </>
                      }
                    >
                      {detailRow("Duración", formatDuration(c.loginAt, c.closedAt))}
                      {detailRow(
                        "Dispositivo",
                        <>
                          <div style={{ fontWeight: 600 }}>{formatDevice(c.deviceId)}</div>
                          <div style={{ fontFamily: "monospace", fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>
                            {formatDeviceShort(c.deviceId)}
                          </div>
                        </>
                      )}
                      {detailRow("IP", <span style={{ fontFamily: "monospace" }}>{formatIP(c.ipAddress)}</span>)}
                      {c.closureType === "REVOKED" &&
                        detailRow(
                          "Motivo",
                          <>
                            {c.revokedReason ?? "—"}
                            {c.revokedBy && <span style={{ color: "var(--text-muted)" }}> (por {c.revokedBy.name})</span>}
                          </>
                        )}
                    </ExpandableCard>
                  );
                })}
              <Pagination {...closuresPagination} onPage={closuresPagination.setPage} itemLabel="cierres" />
            </div>
          ) : (
            <>
              <DataTable
                columns={closureColumns}
                data={closuresPagination.pageItems}
                loading={closuresLoading}
                error={closuresError}
                emptyMessage="No hay cierres de sesión para los filtros seleccionados."
                keyExtractor={(c) => c.id}
                height="calc(100vh - 275px)"
              />
              {!closuresLoading && !closuresError && (
                <Pagination {...closuresPagination} onPage={closuresPagination.setPage} itemLabel="cierres" />
              )}
            </>
          )}
        </>
      )}

      {activeTab === "movements" && (
        <>
          {/* ============================== FILTROS ============================== */}
          {isMobile ? (
            <MobileFilterDisclosure
              id="admin-movements-filters"
              title="Filtros"
              activeCount={movementsActiveFilterLabels.length}
              summary={truncatedSummary(movementsFilterSummary)}
              isOpen={movementsFiltersOpen}
              onToggle={() => setMovementsFiltersOpen((c) => !c)}
            >
              <div style={mobileFilterFieldsWrap}>
                <MobileDateRangeFields from={from} to={to} onFrom={setFrom} onTo={setTo} hasError={Boolean(dateError)} />
                <input
                  type="text"
                  placeholder="Buscar usuario o detalle..."
                  value={movementSearch}
                  onChange={(e) => setMovementSearch(e.target.value)}
                  maxLength={120}
                  style={{ ...ui.input, flex: "1 1 100%", maxWidth: "100%", padding: "6px 8px" }}
                />
                <FilterSelect
                  value={actionTypeFilter}
                  onChange={(v) => setActionTypeFilter(v as ActionTypeFilter)}
                  options={[
                    { value: "all", label: "Todos los tipos" },
                    { value: "NAVIGATION", label: "Navegación" },
                    { value: "REVOKE_SESSION", label: "Revocar sesión" },
                    { value: "EMPLOYEE_STATUS_CHANGE", label: "Cambio de estado" },
                  ]}
                  style={{ flex: "1 1 100%", maxWidth: "100%", width: "100%" }}
                />
                <button
                  onClick={clearMovementFilters}
                  style={{ ...ui.ghostBtn, flex: "1 1 100%", justifyContent: "center", padding: "6px 8px", fontSize: 12 }}
                  className="active-tap"
                >
                  Limpiar filtros
                </button>
                {dateError && <span style={{ color: "#b91c1c", fontSize: 12, fontWeight: 600, flex: "1 1 100%" }}>{dateError}</span>}
              </div>
            </MobileFilterDisclosure>
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
                  placeholder="Buscar usuario o detalle..."
                  value={movementSearch}
                  onChange={(e) => setMovementSearch(e.target.value)}
                  maxLength={120}
                  style={{ ...inputStyle, minWidth: 160 }}
                />
                <FilterSelect
                  value={actionTypeFilter}
                  onChange={(v) => setActionTypeFilter(v as ActionTypeFilter)}
                  options={[
                    { value: "all", label: "Todos los tipos" },
                    { value: "NAVIGATION", label: "Navegación" },
                    { value: "REVOKE_SESSION", label: "Revocar sesión" },
                    { value: "EMPLOYEE_STATUS_CHANGE", label: "Cambio de estado" },
                  ]}
                />
                <button onClick={clearMovementFilters} style={ui.ghostBtn} className="active-tap">
                  Limpiar
                </button>
              </div>
              <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                {filteredMovements.length} registro{filteredMovements.length !== 1 ? "s" : ""}
              </span>
            </Toolbar>
          )}

          {/* ============================== TARJETAS DE RESUMEN ============================== */}
          <div style={{ ...ui.kpiGrid, marginBottom: 16 }}>
            <StatCard
              label="Total de movimientos"
              value={movementsTotal}
              icon={<Activity size={16} color="#2563eb" />}
              iconBg="var(--icon-bg-blue)"
            />
            <StatCard
              label="Navegaciones"
              value={navigationCount}
              icon={<MousePointerClick size={16} color="#2563eb" />}
              iconBg="var(--icon-bg-blue)"
            />
            <StatCard
              label="Acciones sensibles"
              value={sensitiveCount}
              icon={<ShieldAlert size={16} color="#d97706" />}
              iconBg="var(--icon-bg-amber)"
            />
            <StatCard
              label="Admin más activo"
              value={mostActiveAdmin}
              icon={<Award size={16} color="#16a34a" />}
              iconBg="var(--icon-bg-green)"
              valueFontSize="clamp(14px, 3.5vw, 17px)"
            />
          </div>

          {isMobile ? (
            <div style={{ padding: "8px 4px" }}>
              {movementsLoading && (
                <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--text-faint)", fontSize: 13, fontWeight: 500 }}>
                  Cargando información...
                </div>
              )}
              {movementsError && (
                <div style={{ textAlign: "center", padding: "32px 16px", color: "#b91c1c", fontSize: 13, fontWeight: 500 }}>{movementsError}</div>
              )}
              {!movementsLoading && !movementsError && movementsPagination.total === 0 && (
                <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--text-faint)", fontSize: 13, fontWeight: 500 }}>
                  No hay movimientos administrativos para mostrar.
                </div>
              )}

              {!movementsLoading &&
                !movementsError &&
                movementsPagination.pageItems.map((m) => {
                  const isExpanded = expandedMovements[m.id];
                  return (
                    <ExpandableCard
                      key={m.id}
                      isExpanded={isExpanded}
                      onToggle={() => toggleExpandMovement(m.id)}
                      topDate={`${fmtDate(m.createdAt)} ${fmtTime(m.createdAt)}`}
                      topBadge={<ActionTypeBadge type={m.actionType} />}
                      mainTitle={m.user.name}
                      mainSubtitle={
                        <>
                          Detalle: <strong>{m.target ?? "—"}</strong>
                        </>
                      }
                    >
                      {detailRow("Usuario", m.user.email)}
                      {detailRow("Detalle", m.target ?? "—")}
                      {m.details && detailRow("Info. adicional", m.details)}
                      {detailRow("IP", <span style={{ fontFamily: "monospace" }}>{m.ipAddress ?? "—"}</span>)}
                    </ExpandableCard>
                  );
                })}
              <Pagination {...movementsPagination} onPage={movementsPagination.setPage} itemLabel="movimientos" />
            </div>
          ) : (
            <>
              <DataTable
                columns={movementColumns}
                data={movementsPagination.pageItems}
                loading={movementsLoading}
                error={movementsError}
                emptyMessage="No hay movimientos administrativos para los filtros seleccionados."
                keyExtractor={(m) => m.id}
                height="calc(100vh - 275px)"
              />
              {!movementsLoading && !movementsError && (
                <Pagination {...movementsPagination} onPage={movementsPagination.setPage} itemLabel="movimientos" />
              )}
            </>
          )}
        </>
      )}
    </div>
  );
};

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

const lockStyles: { [k: string]: React.CSSProperties } = {
  wrap: { display: "flex", justifyContent: "center", paddingTop: 40, paddingBottom: 40 },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    padding: 28,
    boxShadow: "0 10px 15px -3px rgba(0,0,0,0.05)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
    gap: 12,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 999,
    backgroundColor: "#fef3c7",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 18, fontWeight: 800, color: "var(--text)", margin: 0 },
  desc: { fontSize: 13.5, color: "var(--text-muted)", margin: 0, lineHeight: 1.5 },
  input: {
    width: "100%",
    padding: "10px 14px",
    border: "1px solid var(--border-strong)",
    borderRadius: 8,
    fontSize: 14,
    fontFamily: "inherit",
    backgroundColor: "var(--surface)",
    color: "var(--text-secondary)",
    outline: "none",
  },
  error: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fef2f2",
    border: "1px solid #fca5a5",
    borderRadius: 8,
    padding: "8px 12px",
    color: "#991b1b",
    fontSize: 12.5,
    fontWeight: 600,
  },
  button: {
    width: "100%",
    padding: "11px",
    backgroundColor: "#2563eb",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    transition: "opacity 0.2s",
  },
};

export default AdminAccessLogView;
