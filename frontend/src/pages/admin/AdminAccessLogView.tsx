import React, { useState, useCallback, useEffect } from "react";
import { ShieldAlert, Lock, ChevronDown, ChevronUp } from "lucide-react";
import api from "../../services/api";
import {
  ui,
  type ViewProps,
  Toolbar,
  TableState,
  SectionHeader,
  useMediaQuery,
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

const fmtDateTime = (iso: string) =>
  new Intl.DateTimeFormat("es-MX", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));

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
  const isMobile = useMediaQuery("(max-width: 1024px)");
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

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
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
        subtitle="Historial de inicios de sesión de administradores y gerentes"
      />

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
              onChange={(e) => setFrom(e.target.value)}
              style={{
                ...ui.input,
                padding: "6px 10px",
                fontSize: 13,
                flex: 1,
                minWidth: 0
              }}
            />
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--accent-strong)" }}>Hasta:</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              style={{
                ...ui.input,
                padding: "6px 10px",
                fontSize: 13,
                flex: 1,
                minWidth: 0
              }}
            />
          </div>
          <div>
            <input
              type="text"
              placeholder="Buscar usuario..."
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
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
              backgroundColor: "#f1f5f9",
              border: "1px solid #e2e8f0",
              borderRadius: "8px",
              color: "#64748b",
              fontWeight: 600,
              width: "100%"
            }}
            className="active-tap"
          >
            Limpiar filtros
          </button>
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
              onChange={(e) => setFrom(e.target.value)}
              style={inputStyle}
            />
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--accent-strong)" }}>Hasta:</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              style={inputStyle}
            />
            <input
              type="text"
              placeholder="Buscar usuario..."
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
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