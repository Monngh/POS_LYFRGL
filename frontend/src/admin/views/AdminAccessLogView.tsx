import React, { useState, useCallback, useEffect } from "react";
import { ShieldAlert, Lock, ChevronDown, ChevronUp, ShieldOff } from "lucide-react";
import api from "../../shared/services/api";
import { validateDateRange, validateSearchText, validateReference } from "../../shared/utils/formValidation";
import { useAuth } from "../../auth";
import { useToast } from "../../shared/context/ToastContext";
import { useSecurityEvents } from "../context/SecurityEventsContext";
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

const AdminAccessLogView: React.FC<ViewProps> = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const isMobile = useMediaQuery("(max-width: 1024px)");
  const [activeTab, setActiveTab] = useState<"logins" | "active-sessions" | "closures">("logins");
  const [expandedLogs, setExpandedLogs] = useState<Record<number, boolean>>({});
  const [unlocked, setUnlocked] = useState(false);
  const [auditToken, setAuditToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [unlockLoading, setUnlockLoading] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);

  const [rows, setRows] = useState<AccessLogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const dateError = from && to ? validateDateRange(from, to) : undefined;
  const userSearchError = validateSearchText(userSearch, "La busqueda de usuario", { max: 120 });

  const toggleExpand = (id: number) => {
    setExpandedLogs((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

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

  // Filtro limpio del lado del cliente
  const filteredByDate = rows;

  // Filtrado local exclusivo para la búsqueda por texto de usuario
  const visible = userSearch.trim()
    ? filteredByDate.filter(
      (r) =>
        r.user.name.toLowerCase().includes(userSearch.toLowerCase()) ||
        r.user.email.toLowerCase().includes(userSearch.toLowerCase())
    )
    : filteredByDate;

  // ── Tab "Sesiones Activas" ──
  const [sessionRows, setSessionRows] = useState<ActiveSessionRow[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<ActiveSessionRow | null>(null);
  const [revokeConfirmOpen, setRevokeConfirmOpen] = useState(false);
  const [revokeReason, setRevokeReason] = useState("");
  const [revokeReasonError, setRevokeReasonError] = useState("");
  const [revoking, setRevoking] = useState(false);

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

  const sessionsPagination = usePagination(sessionRows, { pageSize: 20, resetKey: activeTab });

  // ── Tab "Historial de Cierres" ──
  const [closureRows, setClosureRows] = useState<AdminSessionClosureRow[]>([]);
  const [closuresLoading, setClosuresLoading] = useState(false);
  const [closuresError, setClosuresError] = useState<string | null>(null);

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

  const closuresPagination = usePagination(closureRows, { pageSize: 20, resetKey: `${activeTab}|${from}|${to}` });

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
    } catch (err: any) {
      showToast(err.response?.data?.message || "No se pudo cerrar la sesión.", "error");
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
            : "Historial de cierres de sesión (normales y revocados)"
        }
      />

      <div style={{ display: "flex", gap: 0, marginBottom: 18, borderBottom: "1px solid var(--border)" }}>
        {(["logins", "active-sessions", "closures"] as const).map((tab) => {
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
              {tab === "logins" ? "Accesos" : tab === "active-sessions" ? "Sesiones Activas" : "Historial de Cierres"}
            </button>
          );
        })}
      </div>

      {activeTab === "logins" && (
      <>
      {isMobile ? (
        <div style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          marginBottom: 16,
          padding: "12px",
          backgroundColor: "var(--surface-2)",
          borderRadius: 12,
          border: "1px solid var(--border)"
        }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--accent-strong)" }}>Desde:</label>
            <input
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => setFrom(e.target.value)}
              style={{
                ...ui.input,
                padding: "6px 10px",
                fontSize: 13,
                flex: 1,
                minWidth: 0,
                ...(dateError ? { borderColor: "#ef4444" } : {})
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
                ...ui.input,
                padding: "6px 10px",
                fontSize: 13,
                flex: 1,
                minWidth: 0,
                ...(dateError ? { borderColor: "#ef4444" } : {})
              }}
            />
          </div>
          <div>
            <input
              type="text"
              placeholder="Buscar usuario..."
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              maxLength={120}
              style={{
                ...ui.input,
                padding: "6px 10px",
                fontSize: 13,
                width: "100%"
              }}
            />
          </div>
          <button
            onClick={clearFilters}
            style={{
              ...ui.ghostBtn,
              padding: "8px 14px",
              fontSize: 13,
              backgroundColor: "var(--surface-3)",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              color: "var(--text-muted)",
              fontWeight: 600,
              width: "100%"
            }}
            className="active-tap"
          >
            Limpiar filtros
          </button>
          {(dateError || userSearchError) && (
            <span style={{ color: "#b91c1c", fontSize: 12, fontWeight: 600 }}>
              {dateError || userSearchError}
            </span>
          )}
          <div style={{
            fontSize: 12,
            color: "var(--text-muted)",
            fontWeight: 600,
            textAlign: "center",
            paddingTop: 4,
            borderTop: "1px solid var(--border)"
          }}>
            {visible.length} registro{visible.length !== 1 ? "s" : ""}
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
              placeholder="Buscar usuario..."
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              maxLength={120}
              style={{ ...inputStyle, minWidth: 160 }}
            />
            <button
              onClick={clearFilters}
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
              Limpiar
            </button>
          </div>
          <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
            {visible.length} registro{visible.length !== 1 ? "s" : ""}
          </span>
        </Toolbar>
      )}

      {isMobile ? (
        <div style={{ overflowY: "auto", maxHeight: "62vh", padding: "8px 4px" }}>
          <div style={{
            display: "grid",
            gridTemplateColumns: "1.8fr 1.8fr 1.2fr",
            padding: "10px 12px",
            fontWeight: 700,
            fontSize: 10,
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.3px",
          }}>
            <div>Fecha</div>
            <div>Sucursal</div>
            <div style={{ textAlign: "right" }}>Acción</div>
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
          {!loading && !error && visible.length === 0 && (
            <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--text-faint)", fontSize: 13, fontWeight: 500 }}>
              No hay registros para mostrar.
            </div>
          )}

          {!loading &&
            !error &&
            visible.map((row) => {
              const isExpanded = expandedLogs[row.id];
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
                  <div style={{
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
                    textTransform: "uppercase"
                  }}>
                    <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "55%" }}>
                      {row.user.name}
                    </span>
                    <RoleBadge role={row.role} />
                  </div>

                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "1.8fr 1.8fr 1.2fr",
                    padding: "10px 12px",
                    alignItems: "center",
                    gap: "4px"
                  }}>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                      <div>{fmtDate(row.createdAt)}</div>
                      <div style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 1 }}>
                        {fmtTime(row.createdAt)}
                      </div>
                    </div>

                    <div style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: "var(--text-secondary)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis"
                    }}>
                      {row.branch?.name ?? "—"}
                    </div>

                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      <button
                        onClick={() => toggleExpand(row.id)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: "var(--surface)",
                          border: "1px solid var(--border-strong)",
                          borderRadius: 6,
                          width: 30,
                          height: 30,
                          cursor: "pointer",
                          color: "var(--text-muted)",
                          padding: 0,
                        }}
                        className="active-tap"
                      >
                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div style={{
                      padding: "12px",
                      margin: "0 12px 12px 12px",
                      backgroundColor: "var(--surface-2)",
                      borderRadius: "8px",
                      border: "1px solid var(--border)",
                      display: "grid",
                      gridTemplateColumns: "1fr",
                      gap: "6px",
                      textAlign: "left",
                    }}>
                      <div style={detailRowStyle}>
                        <span style={detailLabelStyle}>Usuario:</span>
                        <span style={detailValueStyle}>{row.user.name} ({row.user.email})</span>
                      </div>
                      <div style={detailRowStyle}>
                        <span style={detailLabelStyle}>Rol:</span>
                        <span style={detailValueStyle}>{row.role}</span>
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
                        <span style={detailLabelStyle}>Dirección IP:</span>
                        <span style={{ ...detailValueStyle, fontFamily: "monospace", fontSize: 11 }}>
                          {row.ipAddress ?? "—"}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      ) : (
        <div
          className="table-sticky-head"
          style={{ ...ui.tableWrap, overflowX: "auto", overflowY: "auto", maxHeight: "62vh" }}
        >
          <table style={ui.table}>
            <thead>
              <tr style={ui.theadRow}>
                <th style={ui.th}>Fecha / Hora</th>
                <th style={ui.th}>Usuario</th>
                <th style={{ ...ui.th, textAlign: "center" }}>Rol</th>
                <th style={ui.th}>Sucursal</th>
                <th style={{ ...ui.th, textAlign: "center" }}>Método</th>
                <th style={{ ...ui.th, fontFamily: "monospace" }}>IP</th>
              </tr>
            </thead>
            <tbody>
              <TableState
                colSpan={6}
                loading={loading}
                error={error}
                empty={!loading && visible.length === 0}
                emptyText="No hay accesos administrativos para los filtros seleccionados."
              />
              {!loading &&
                !error &&
                visible.map((row) => (
                  <tr key={row.id}>
                    <td style={{ ...ui.td, whiteSpace: "nowrap", color: "var(--text-secondary)" }}>{fmtDateTime(row.createdAt)}</td>
                    <td style={ui.td}>
                      <div style={{ fontWeight: 700, color: "var(--text)" }}>{row.user.name}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{row.user.email}</div>
                    </td>
                    <td style={{ ...ui.td, textAlign: "center" }}>
                      <RoleBadge role={row.role} />
                    </td>
                    <td style={{ ...ui.td, color: "var(--text-muted)" }}>
                      {row.branch?.name ?? <span style={{ color: "var(--border-strong)" }}>—</span>}
                    </td>
                    <td style={{ ...ui.td, textAlign: "center", fontSize: 12, color: "var(--text-secondary)" }}>{row.method}</td>
                    <td style={{ ...ui.td, fontFamily: "monospace", fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                      {row.ipAddress ?? "—"}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
      </>
      )}

      {activeTab === "active-sessions" && (
      <>
      {isMobile ? (
        <div style={{ overflowY: "auto", maxHeight: "62vh", padding: "8px 4px" }}>
          {sessionsLoading && (
            <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--text-faint)", fontSize: 13, fontWeight: 500 }}>
              Cargando información...
            </div>
          )}
          {sessionsError && (
            <div style={{ textAlign: "center", padding: "32px 16px", color: "#b91c1c", fontSize: 13, fontWeight: 500 }}>
              {sessionsError}
            </div>
          )}
          {!sessionsLoading && !sessionsError && sessionsPagination.pageItems.length === 0 && (
            <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--text-faint)", fontSize: 13, fontWeight: 500 }}>
              No hay sesiones de administrador/gerente activas.
            </div>
          )}

          {!sessionsLoading &&
            !sessionsError &&
            sessionsPagination.pageItems.map((s) => {
              const isSelf = user?.id === s.userId;
              return (
                <div
                  key={s.userId}
                  style={{
                    backgroundColor: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    marginBottom: 10,
                    boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
                    overflow: "hidden",
                  }}
                >
                  <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "8px 12px 6px 12px",
                    fontSize: 11,
                    fontWeight: 700,
                    color: "var(--text-muted)",
                    borderBottom: "1px solid var(--surface-3)",
                    backgroundColor: "var(--surface-2)",
                    letterSpacing: "0.2px",
                    textTransform: "uppercase"
                  }}>
                    <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "60%" }}>
                      {s.name}{isSelf ? " (tú)" : ""}
                    </span>
                    <RoleBadge role={s.role} />
                  </div>
                  <div style={{ padding: "12px", display: "grid", gap: "6px" }}>
                    <div style={detailRowStyle}>
                      <span style={detailLabelStyle}>Correo:</span>
                      <span style={detailValueStyle}>{s.email}</span>
                    </div>
                    <div style={detailRowStyle}>
                      <span style={detailLabelStyle}>Sucursal:</span>
                      <span style={detailValueStyle}>{s.branch?.name ?? "—"}</span>
                    </div>
                    <div style={detailRowStyle}>
                      <span style={detailLabelStyle}>Desde:</span>
                      <span style={detailValueStyle}>{fmtDateTime(s.since)}</span>
                    </div>
                    <div style={detailRowStyle}>
                      <span style={detailLabelStyle}>Dispositivo:</span>
                      <span style={detailValueStyle}>
                        <div style={{ fontWeight: 600, fontSize: 12 }}>{formatDevice(s.deviceId)}</div>
                        <div style={{ fontFamily: "monospace", fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>
                          {formatDeviceShort(s.deviceId)}
                        </div>
                      </span>
                    </div>
                    <div style={detailRowStyle}>
                      <span style={detailLabelStyle}>IP:</span>
                      <span style={{ ...detailValueStyle, fontFamily: "monospace", fontSize: 11 }}>{formatIP(s.ipAddress)}</span>
                    </div>
                    {!isSelf && (
                      <button
                        onClick={() => setRevokeTarget(s)}
                        style={{
                          marginTop: 6,
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
                        }}
                        className="active-tap"
                      >
                        <ShieldOff size={14} /> Cerrar sesión
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          <Pagination {...sessionsPagination} onPage={sessionsPagination.setPage} itemLabel="sesiones" />
        </div>
      ) : (
        <div
          className="table-sticky-head"
          style={{ ...ui.tableWrap, overflowX: "auto", overflowY: "auto", maxHeight: "62vh" }}
        >
          <table style={ui.table}>
            <thead>
              <tr style={ui.theadRow}>
                <th style={ui.th}>Usuario</th>
                <th style={{ ...ui.th, textAlign: "center" }}>Rol</th>
                <th style={ui.th}>Sucursal</th>
                <th style={ui.th}>Activo desde</th>
                <th style={ui.th}>Dispositivo</th>
                <th style={{ ...ui.th, fontFamily: "monospace" }}>IP</th>
                <th style={{ ...ui.th, textAlign: "right" }}>Acción</th>
              </tr>
            </thead>
            <tbody>
              <TableState
                colSpan={7}
                loading={sessionsLoading}
                error={sessionsError}
                empty={!sessionsLoading && sessionsPagination.pageItems.length === 0}
                emptyText="No hay sesiones de administrador/gerente activas."
              />
              {!sessionsLoading &&
                !sessionsError &&
                sessionsPagination.pageItems.map((s) => {
                  const isSelf = user?.id === s.userId;
                  return (
                    <tr key={s.userId}>
                      <td style={ui.td}>
                        <div style={{ fontWeight: 700, color: "var(--text)" }}>{s.name}{isSelf ? " (tú)" : ""}</div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{s.email}</div>
                      </td>
                      <td style={{ ...ui.td, textAlign: "center" }}>
                        <RoleBadge role={s.role} />
                      </td>
                      <td style={{ ...ui.td, color: "var(--text-muted)" }}>
                        {s.branch?.name ?? <span style={{ color: "var(--border-strong)" }}>—</span>}
                      </td>
                      <td style={{ ...ui.td, whiteSpace: "nowrap", color: "var(--text-secondary)" }}>{fmtDateTime(s.since)}</td>
                      <td style={ui.td}>
                        <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)" }}>
                          {formatDevice(s.deviceId)}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2, fontFamily: "monospace" }}>
                          {formatDeviceShort(s.deviceId)}
                        </div>
                      </td>
                      <td style={{ ...ui.td, fontFamily: "monospace", fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                        {formatIP(s.ipAddress)}
                      </td>
                      <td style={{ ...ui.td, textAlign: "right" }}>
                        {!isSelf && (
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
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
          <div style={{ padding: "0 4px" }}>
            <Pagination {...sessionsPagination} onPage={sessionsPagination.setPage} itemLabel="sesiones" />
          </div>
        </div>
      )}

      {/* ===================== SUB-MODAL PASO 1: MOTIVO DE CIERRE ===================== */}
      {revokeTarget && !revokeConfirmOpen && (
        <div style={ui.overlay} onClick={closeRevokeFlow}>
          <div
            style={{ ...ui.modal, maxWidth: 440, width: "100%" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={ui.modalHeader}>
              <span style={ui.modalTitle}>¿Cerrar la sesión de "{revokeTarget.name}"?</span>
              <button style={ui.ghostBtn} onClick={closeRevokeFlow}>✕</button>
            </div>
            <div style={ui.modalBody}>
              <p style={{ fontSize: 13, color: "#b91c1c", fontWeight: 600, marginBottom: 18 }}>
                ⚠ Se cerrará de inmediato y deberá volver a iniciar sesión.
              </p>
              <label style={ui.fieldLabel}>Motivo del cierre *</label>
              <textarea
                value={revokeReason}
                onChange={(e) => {
                  const value = e.target.value;
                  setRevokeReason(value);
                  setRevokeReasonError(validateReference(value, "El motivo", { required: true, max: 180 }) || "");
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
                    if (err) { setRevokeReasonError(err); return; }
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
          <div
            style={{ ...ui.modal, maxWidth: 440, width: "100%" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={ui.modalHeader}>
              <span style={ui.modalTitle}>Confirmar cierre de sesión</span>
              <button style={ui.ghostBtn} onClick={() => setRevokeConfirmOpen(false)}>✕</button>
            </div>
            <div style={ui.modalBody}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
                <div style={detailRowStyle}>
                  <span style={detailLabelStyle}>Usuario:</span>
                  <span style={detailValueStyle}>{revokeTarget.name} ({revokeTarget.email})</span>
                </div>
                <div style={detailRowStyle}>
                  <span style={detailLabelStyle}>Sucursal:</span>
                  <span style={detailValueStyle}>{revokeTarget.branch?.name ?? "—"}</span>
                </div>
                <div style={{ ...detailRowStyle, alignItems: "flex-start" }}>
                  <span style={detailLabelStyle}>Motivo:</span>
                  <span style={{ ...detailValueStyle, wordBreak: "break-word", flex: 1 }}>{revokeReason}</span>
                </div>
              </div>
              <p style={{ fontSize: 13, color: "#b91c1c", fontWeight: 600, marginBottom: 20 }}>
                ⚠ Esta acción cerrará la sesión de inmediato y no se puede deshacer.
              </p>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button
                  style={ui.ghostBtn}
                  onClick={() => setRevokeConfirmOpen(false)}
                  disabled={revoking}
                >
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
      {isMobile ? (
        <div style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          marginBottom: 16,
          padding: "12px",
          backgroundColor: "var(--surface-2)",
          borderRadius: 12,
          border: "1px solid var(--border)"
        }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--accent-strong)" }}>Desde:</label>
            <input
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => setFrom(e.target.value)}
              style={{ ...ui.input, padding: "6px 10px", fontSize: 13, flex: 1, minWidth: 0, ...(dateError ? { borderColor: "#ef4444" } : {}) }}
            />
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--accent-strong)" }}>Hasta:</label>
            <input
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
              style={{ ...ui.input, padding: "6px 10px", fontSize: 13, flex: 1, minWidth: 0, ...(dateError ? { borderColor: "#ef4444" } : {}) }}
            />
          </div>
          {dateError && (
            <span style={{ color: "#b91c1c", fontSize: 12, fontWeight: 600 }}>{dateError}</span>
          )}
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
          </div>
          <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
            {closureRows.length} registro{closureRows.length !== 1 ? "s" : ""}
          </span>
        </Toolbar>
      )}

      {isMobile ? (
        <div style={{ overflowY: "auto", maxHeight: "62vh", padding: "8px 4px" }}>
          {closuresLoading && (
            <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--text-faint)", fontSize: 13, fontWeight: 500 }}>
              Cargando información...
            </div>
          )}
          {closuresError && (
            <div style={{ textAlign: "center", padding: "32px 16px", color: "#b91c1c", fontSize: 13, fontWeight: 500 }}>
              {closuresError}
            </div>
          )}
          {!closuresLoading && !closuresError && closuresPagination.pageItems.length === 0 && (
            <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--text-faint)", fontSize: 13, fontWeight: 500 }}>
              No hay cierres de sesión para mostrar.
            </div>
          )}

          {!closuresLoading &&
            !closuresError &&
            closuresPagination.pageItems.map((c) => (
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
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "8px 12px 6px 12px",
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--text-muted)",
                  borderBottom: "1px solid var(--surface-3)",
                  backgroundColor: "var(--surface-2)",
                  letterSpacing: "0.2px",
                  textTransform: "uppercase"
                }}>
                  <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "60%" }}>
                    {c.user.name}
                  </span>
                  <ClosureTypeBadge type={c.closureType} />
                </div>
                <div style={{ padding: "12px", display: "grid", gap: "6px" }}>
                  <div style={detailRowStyle}>
                    <span style={detailLabelStyle}>Sucursal:</span>
                    <span style={detailValueStyle}>{c.branch?.name ?? "—"}</span>
                  </div>
                  <div style={detailRowStyle}>
                    <span style={detailLabelStyle}>Cerrado:</span>
                    <span style={detailValueStyle}>{fmtDateTime(c.closedAt)}</span>
                  </div>
                  <div style={detailRowStyle}>
                    <span style={detailLabelStyle}>Duración:</span>
                    <span style={detailValueStyle}>{formatDuration(c.loginAt, c.closedAt)}</span>
                  </div>
                  <div style={detailRowStyle}>
                    <span style={detailLabelStyle}>Dispositivo:</span>
                    <span style={detailValueStyle}>
                      <div style={{ fontWeight: 600, fontSize: 12 }}>{formatDevice(c.deviceId)}</div>
                      <div style={{ fontFamily: "monospace", fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>
                        {formatDeviceShort(c.deviceId)}
                      </div>
                    </span>
                  </div>
                  <div style={detailRowStyle}>
                    <span style={detailLabelStyle}>IP:</span>
                    <span style={{ ...detailValueStyle, fontFamily: "monospace", fontSize: 11 }}>{formatIP(c.ipAddress)}</span>
                  </div>
                  {c.closureType === "REVOKED" && (
                    <div style={{ ...detailRowStyle, alignItems: "flex-start" }}>
                      <span style={detailLabelStyle}>Motivo:</span>
                      <span style={{ ...detailValueStyle, wordBreak: "break-word" }}>
                        {c.revokedReason ?? "—"}
                        {c.revokedBy && (
                          <span style={{ color: "var(--text-muted)" }}> (por {c.revokedBy.name})</span>
                        )}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          <Pagination {...closuresPagination} onPage={closuresPagination.setPage} itemLabel="cierres" />
        </div>
      ) : (
        <div
          className="table-sticky-head"
          style={{ ...ui.tableWrap, overflowX: "auto", overflowY: "auto", maxHeight: "62vh" }}
        >
          <table style={ui.table}>
            <thead>
              <tr style={ui.theadRow}>
                <th style={ui.th}>Usuario</th>
                <th style={ui.th}>Sucursal</th>
                <th style={ui.th}>Cerrado</th>
                <th style={ui.th}>Duración</th>
                <th style={{ ...ui.th, textAlign: "center" }}>Tipo</th>
                <th style={ui.th}>Dispositivo</th>
                <th style={{ ...ui.th, fontFamily: "monospace" }}>IP</th>
                <th style={ui.th}>Motivo</th>
              </tr>
            </thead>
            <tbody>
              <TableState
                colSpan={8}
                loading={closuresLoading}
                error={closuresError}
                empty={!closuresLoading && closuresPagination.pageItems.length === 0}
                emptyText="No hay cierres de sesión para los filtros seleccionados."
              />
              {!closuresLoading &&
                !closuresError &&
                closuresPagination.pageItems.map((c) => (
                  <tr key={c.id}>
                    <td style={ui.td}>
                      <div style={{ fontWeight: 700, color: "var(--text)" }}>{c.user.name}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{c.user.email}</div>
                    </td>
                    <td style={{ ...ui.td, color: "var(--text-muted)" }}>
                      {c.branch?.name ?? <span style={{ color: "var(--border-strong)" }}>—</span>}
                    </td>
                    <td style={{ ...ui.td, whiteSpace: "nowrap", color: "var(--text-secondary)" }}>{fmtDateTime(c.closedAt)}</td>
                    <td style={{ ...ui.td, whiteSpace: "nowrap", color: "var(--text-secondary)" }}>
                      {formatDuration(c.loginAt, c.closedAt)}
                    </td>
                    <td style={{ ...ui.td, textAlign: "center" }}>
                      <ClosureTypeBadge type={c.closureType} />
                    </td>
                    <td style={ui.td}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)" }}>
                        {formatDevice(c.deviceId)}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2, fontFamily: "monospace" }}>
                        {formatDeviceShort(c.deviceId)}
                      </div>
                    </td>
                    <td style={{ ...ui.td, fontFamily: "monospace", fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                      {formatIP(c.ipAddress)}
                    </td>
                    <td style={{ ...ui.td, maxWidth: 220 }}>
                      {c.closureType === "REVOKED" ? (
                        <>
                          <div style={{ fontSize: 12, color: "var(--text-secondary)", wordBreak: "break-word" }}>
                            {c.revokedReason ?? "—"}
                          </div>
                          {c.revokedBy && (
                            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                              Por: {c.revokedBy.name}
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
          <div style={{ padding: "0 4px" }}>
            <Pagination {...closuresPagination} onPage={closuresPagination.setPage} itemLabel="cierres" />
          </div>
        </div>
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

export default AdminAccessLogView;