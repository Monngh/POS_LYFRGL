import React, { useState, useEffect, useCallback } from "react";
import {
  TrendingUp,
  CalendarDays,
  Coins,
  Receipt,
  Tag,
  Package,
  UserPlus,
  AlertTriangle,
  Wallet,
  Landmark,
  Scale,
  BadgePercent,
} from "lucide-react";
import api from "../../shared/services/api";
import { ui, type ViewProps, SectionHeader, money, useMediaQuery } from "./shared";

interface DashboardMetrics {
  ventasHoy: number;
  ventasMes: number;
  utilidadMes: number;
  ticketsHoy: number;
  ticketPromedio: number;
  productosActivos: number;
  clientesNuevos: number;
  inventarioBajo: number;
  promocionesActivas: number;
}
interface DayPoint {
  label: string;
  date: string;
  total: number;
}
interface BranchSales {
  id: number;
  name: string;
  total: number;
}
interface TopProduct {
  id: number;
  name: string;
  unidades: number;
}
interface DashboardResponse {
  metrics: DashboardMetrics;
  ventas7dias: DayPoint[];
  ventasPorSucursal: BranchSales[];
  productosMasVendidos: TopProduct[];
}
interface CashSessionRow {
  id: number;
  branch: string;
  cajero: string;
  openedAt: string;
  closedAt: string | null;
  status: string;
  difference: number | null;
}
interface DepositRow {
  id: number;
  amount: number;
  createdAt: string;
}

const pad2 = (n: number): string => String(n).padStart(2, "0");
const formatLocalDate = (d: Date): string => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

const DashboardView: React.FC<ViewProps> = ({ branchId, refreshToken, navigateTo }) => {
  const isMobile = useMediaQuery("(max-width: 1024px)");
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<DashboardResponse>("/api/dashboard/metrics", {
        params: branchId !== "all" ? { branchId } : {},
      });
      setData(res.data);
    } catch (err: any) {
      setError(err.response?.data?.message || "No se pudieron cargar las métricas.");
    } finally {
      setLoading(false);
    }
  }, [branchId, refreshToken]);

  useEffect(() => {
    load();
  }, [load]);

  const [sessions, setSessions] = useState<CashSessionRow[]>([]);
  const [deposits, setDeposits] = useState<DepositRow[]>([]);
  const [loadingCash, setLoadingCash] = useState(true);

  const loadCash = useCallback(async () => {
    setLoadingCash(true);
    try {
      const params = branchId !== "all" ? { branchId } : {};
      const [sessRes, depRes] = await Promise.all([
        api.get<{ sessions: CashSessionRow[] }>("/api/admin/cash-sessions", { params }),
        api.get<{ deposits: DepositRow[] }>("/api/admin/bank-deposits", { params }),
      ]);
      setSessions(sessRes.data.sessions);
      setDeposits(depRes.data.deposits);
    } catch {
      // widgets muestran "—" si falla
    } finally {
      setLoadingCash(false);
    }
  }, [branchId, refreshToken]);

  useEffect(() => {
    loadCash();
  }, [loadCash]);

  const m = data?.metrics;
  const todayISO = formatLocalDate(new Date());
  const firstDayOfMonthISO = formatLocalDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1));

  const goVentasHoy = () => navigateTo?.("ventas", { from: todayISO, to: todayISO });
  const goVentasMes = () => navigateTo?.("ventas", { from: firstDayOfMonthISO, to: todayISO });
  const goResumenEjecutivo = () => navigateTo?.("reportes", { tab: "resumen-ejecutivo" });
  const goProductosActivos = () => navigateTo?.("inventario", { estado: "Todos" });
  const goClientesNuevos = () => navigateTo?.("clientes");
  const goInventarioBajo = () => navigateTo?.("inventario", { estado: "Bajo" });
  const goCajasAbiertas = () => navigateTo?.("cajas", { estado: "Abiertas" });
  const goDepositosHoy = () => navigateTo?.("depositos", { from: todayISO, to: todayISO });
  const goCajasCerradas = () => navigateTo?.("cajas", { estado: "Cerradas" });
  const goPromosVigentes = () => navigateTo?.("promociones", { statusFilter: "vigente" });

  const cards = [
    { label: "Ventas de hoy", value: m ? money(m.ventasHoy) : "—", icon: TrendingUp, onClick: goVentasHoy },
    { label: "Ventas del mes", value: m ? money(m.ventasMes) : "—", icon: CalendarDays, onClick: goVentasMes },
    { label: "Utilidad del mes", value: m ? money(m.utilidadMes) : "—", icon: Coins, onClick: goResumenEjecutivo },
    { label: "Tickets de hoy", value: m ? String(m.ticketsHoy) : "—", icon: Receipt, onClick: goResumenEjecutivo },
    { label: "Ticket promedio", value: m ? money(m.ticketPromedio) : "—", icon: Tag, onClick: goResumenEjecutivo },
    { label: "Productos activos", value: m ? String(m.productosActivos) : "—", icon: Package, onClick: goProductosActivos },
    { label: "Clientes nuevos", value: m ? String(m.clientesNuevos) : "—", icon: UserPlus, onClick: goClientesNuevos },
    {
      label: "Inventario bajo",
      value: m ? `${m.inventarioBajo} ${m.inventarioBajo === 1 ? "producto" : "productos"}` : "—",
      icon: AlertTriangle,
      warning: !!m && m.inventarioBajo > 0,
      onClick: goInventarioBajo,
    },
    { label: "Promos vigentes", value: m ? `${m.promocionesActivas} vigentes` : "—", icon: BadgePercent, onClick: goPromosVigentes },
  ];

  const maxDay = Math.max(1, ...(data?.ventas7dias.map((d) => d.total) ?? [0]));
  const maxBranch = Math.max(1, ...(data?.ventasPorSucursal.map((b) => b.total) ?? [0]));

  // ── Cálculos para los 4 widgets nuevos ──
  const cajasAbiertas = sessions.filter((s) => s.status === "ABIERTA").length;
  const ultimaApertura = sessions
    .filter((s) => s.status === "ABIERTA")
    .sort((a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime())[0];
  const minutosDesdeApertura = ultimaApertura
    ? Math.round((Date.now() - new Date(ultimaApertura.openedAt).getTime()) / 60000)
    : null;

  const hoy = new Date().toDateString();
  const depositosHoy = deposits.filter((d) => new Date(d.createdAt).toDateString() === hoy);
  const totalDepositosHoy = depositosHoy.reduce((acc, d) => acc + d.amount, 0);

  const sesionesHoyCerradas = sessions.filter(
    (s) => s.status === "CERRADA" && s.closedAt && new Date(s.closedAt).toDateString() === hoy
  );
  const totalSesionesHoy = sesionesHoyCerradas.length;
  const cajasCuadradas = sesionesHoyCerradas.filter((s) => s.difference === null || s.difference === 0).length;
  const diferenciaTotalHoy = sesionesHoyCerradas.reduce((acc, s) => acc + Math.abs(s.difference ?? 0), 0);
  const hasDiferencias = diferenciaTotalHoy > 0;
  const sesionesConDiferencia = sesionesHoyCerradas.filter(
    (sess) => sess.difference !== null && sess.difference !== 0
  );

  if (error) {
    return (
      <div>
        <SectionHeader title="Dashboard" subtitle="Métricas empresariales en tiempo real" />
        <div style={s.errorBox}>
          <AlertTriangle size={20} color="#b45309" />
          <span>{error}</span>
          <button onClick={load} className="active-tap" style={s.retryBtn}>
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <style>{`
        .dash-metric-card { transition: box-shadow .15s ease, transform .15s ease; }
        .dash-metric-card:hover { box-shadow: 0 6px 16px -4px rgba(15,23,42,0.18); transform: translateY(-1px); }
      `}</style>
      <SectionHeader title="Dashboard" subtitle="Métricas en tiempo real desde SQL Server" />

      {/* Tarjetas de métricas — grid único: auto-fill deja espacio vacío en la
          última fila en vez de estirar las tarjetas existentes (auto-fit). */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(165px, 1fr))", gap: 16 }}>
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              style={{ ...s.metricCard, cursor: "pointer" }}
              className="dash-metric-card active-tap"
              onClick={card.onClick}
            >
              <div style={s.metricHead}>
                <span style={s.metricLabel}>{card.label}</span>
                <div style={{ ...s.metricIcon, backgroundColor: card.warning ? "var(--icon-bg-amber)" : "var(--icon-bg-blue)" }}>
                  <Icon size={16} color={card.warning ? "#d97706" : "#2563eb"} />
                </div>
              </div>
              <h2 style={{ ...s.metricValue, color: card.warning ? "var(--color-warning)" : "var(--text)" }}>
                {loading && !data ? "…" : card.value}
              </h2>
            </div>
          );
        })}

        {/* Widget: Estado de cajas */}
        <div
          style={{ ...s.metricCard, cursor: "pointer" }}
          className="dash-metric-card active-tap"
          onClick={goCajasAbiertas}
        >
          <div style={s.metricHead}>
            <span style={s.metricLabel}>Estado de cajas</span>
            <div style={{ ...s.metricIcon, backgroundColor: "var(--icon-bg-blue)" }}>
              <Wallet size={16} color="#2563eb" />
            </div>
          </div>
          <h2 style={s.metricValue}>
            {loadingCash ? "…" : `${cajasAbiertas} abierta${cajasAbiertas !== 1 ? "s" : ""}`}
          </h2>
          <p style={s.metricSecondary}>
            {!loadingCash && minutosDesdeApertura !== null
              ? `Última apertura hace ${minutosDesdeApertura} min`
              : !loadingCash
                ? "Sin cajas activas ahora"
                : ""}
          </p>
        </div>

        {/* Widget: Depósitos hoy */}
        <div
          style={{ ...s.metricCard, cursor: "pointer" }}
          className="dash-metric-card active-tap"
          onClick={goDepositosHoy}
        >
          <div style={s.metricHead}>
            <span style={s.metricLabel}>Depósitos hoy</span>
            <div style={{ ...s.metricIcon, backgroundColor: "var(--icon-bg-green)" }}>
              <Landmark size={16} color="#16a34a" />
            </div>
          </div>
          <h2 style={{ ...s.metricValue, color: "var(--color-success)" }}>
            {loadingCash ? "…" : money(totalDepositosHoy)}
          </h2>
          <p style={s.metricSecondary}>
            {!loadingCash ? `${depositosHoy.length} depósito${depositosHoy.length !== 1 ? "s" : ""}` : ""}
          </p>
        </div>

        {/* Widget: Diferencia de caja */}
        <div
          style={{ ...s.metricCard, cursor: "pointer" }}
          className="dash-metric-card active-tap"
          onClick={goCajasCerradas}
        >
          <div style={s.metricHead}>
            <span style={s.metricLabel}>Diferencia de caja</span>
            <div style={{ ...s.metricIcon, backgroundColor: hasDiferencias ? "var(--icon-bg-red)" : "var(--icon-bg-green)" }}>
              <Scale size={16} color={hasDiferencias ? "#dc2626" : "#16a34a"} />
            </div>
          </div>
          <h2 style={{ ...s.metricValue, color: hasDiferencias ? "var(--color-danger)" : "var(--color-success)" }}>
            {loadingCash
              ? "…"
              : totalSesionesHoy > 0
                ? `${cajasCuadradas} de ${totalSesionesHoy}`
                : "Sin cortes hoy"}
          </h2>
          {!loadingCash && totalSesionesHoy > 0 && !hasDiferencias && (
            <p style={s.metricSecondary}>Todas cuadradas</p>
          )}
          {!loadingCash && sesionesConDiferencia.length > 0 && (
            <div style={{ marginTop: 6 }}>
              {sesionesConDiferencia.slice(0, 3).map((sess) => (
                <div
                  key={sess.id}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 5 }}
                >
                  <span style={{ ...s.metricSecondary, marginTop: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "65%" }}>
                    {sess.branch}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "var(--color-danger)", flexShrink: 0 }}>
                    {sess.difference! >= 0
                      ? `+${money(sess.difference!)}`
                      : `-${money(Math.abs(sess.difference!))}`}
                  </span>
                </div>
              ))}
              {sesionesConDiferencia.length > 3 && (
                <p style={{ ...s.metricSecondary, marginTop: 5 }}>
                  +{sesionesConDiferencia.length - 3} caja{sesionesConDiferencia.length - 3 !== 1 ? "s" : ""} más
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Gráfica de 7 días + Ventas por sucursal: 2 columnas en desktop (2/3 + 1/3),
          apiladas verticalmente en mobile. */}
      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 16, marginTop: 16 }}>
        <div style={{ ...ui.panel, padding: 20, flex: isMobile ? "1 1 auto" : "2 1 0%", minWidth: 0 }}>
          <h3 style={s.panelTitle}>Ventas de los últimos 7 días</h3>
          <div style={s.chart}>
            {(data?.ventas7dias ?? []).map((d, i) => {
              const h = Math.round((d.total / maxDay) * 150);
              return (
                <div key={i} style={s.chartCol}>
                  <span style={s.chartValue}>{d.total > 0 ? money(d.total) : ""}</span>
                  <div
                    style={{
                      ...s.bar,
                      height: `${Math.max(h, d.total > 0 ? 6 : 2)}px`,
                      backgroundColor: d.total > 0 ? "#3b82f6" : "#e2e8f0",
                    }}
                  />
                  <span style={s.chartLabel}>{d.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ ...ui.panel, padding: 20, flex: isMobile ? "1 1 auto" : "1 1 0%", minWidth: 0 }}>
          <h3 style={s.panelTitle}>Ventas por sucursal</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 16 }}>
            {(data?.ventasPorSucursal ?? []).map((b) => (
              <div key={b.id}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>{b.name}</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: "var(--accent-strong)" }}>{money(b.total)}</span>
                </div>
                <div style={s.track}>
                  <div style={{ ...s.trackFill, width: `${(b.total / maxBranch) * 100}%` }} />
                </div>
              </div>
            ))}
            {!loading && (data?.ventasPorSucursal ?? []).length === 0 && <EmptyState />}
          </div>
        </div>
      </div>

      {/* Productos más vendidos */}
      <div style={{ ...ui.panel, padding: 20, marginTop: 16 }}>
        <h3 style={s.panelTitle}>Productos más vendidos</h3>
        <div style={{ marginTop: 8 }}>
          {(data?.productosMasVendidos ?? []).map((p, i) => (
            <div key={p.id} style={s.productRow}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={s.rankBadge}>{i + 1}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>{p.name}</span>
              </div>
              <span style={{ fontSize: 13, fontWeight: 800, color: "var(--text)" }}>{p.unidades} u</span>
            </div>
          ))}
          {!loading && (data?.productosMasVendidos ?? []).length === 0 && <EmptyState />}
        </div>
      </div>
    </div>
  );
};

const EmptyState: React.FC = () => (
  <p style={{ fontSize: 13, color: "var(--text-faint)", padding: "24px 4px", textAlign: "center" }}>
    Aún no hay datos registrados para este periodo.
  </p>
);

const s: { [k: string]: React.CSSProperties } = {
  metricCard: {
    backgroundColor: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    padding: "18px 20px",
    boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
    minWidth: 0,
  },
  metricHead: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, minHeight: 32 },
  metricLabel: { fontSize: 12.5, fontWeight: 600, color: "var(--text-muted)", minWidth: 0, lineHeight: 1.3 },
  metricIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  metricValue: {
    fontSize: "clamp(19px, 4.6vw, 26px)",
    fontWeight: 800,
    marginTop: 10,
    letterSpacing: "-0.4px",
    lineHeight: 1.15,
    color: "var(--text)",
    minWidth: 0,
    overflowWrap: "break-word",
  },
  metricSecondary: { fontSize: 12, color: "var(--text-faint)", marginTop: 6, fontWeight: 500, lineHeight: 1.35 },
  panelTitle: { fontSize: 15, fontWeight: 800, color: "var(--text)" },
  chart: {
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 12,
    height: 150,
    marginTop: 18,
    paddingTop: 10,
    borderBottom: "1px solid var(--border-soft)",
  },
  chartCol: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
    height: "100%",
  },
  chartValue: { fontSize: 11, fontWeight: 700, color: "var(--text-muted)", height: 13 },
  bar: { width: "60%", maxWidth: 46, borderRadius: "6px 6px 0 0", transition: "height 0.3s ease" },
  chartLabel: { fontSize: 12, fontWeight: 600, color: "var(--text-faint)" },
  track: { height: 9, backgroundColor: "#eef2f7", borderRadius: 999, overflow: "hidden" },
  trackFill: { height: "100%", backgroundColor: "#3b82f6", borderRadius: 999, transition: "width 0.3s ease" },
  productRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "11px 0",
    borderBottom: "1px solid var(--border-soft)",
  },
  rankBadge: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: "#eff6ff",
    color: "var(--accent)",
    fontSize: 11,
    fontWeight: 800,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  errorBox: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 12,
    backgroundColor: "#fffbeb",
    border: "1px solid #fef3c7",
    borderRadius: 10,
    padding: "16px 18px",
    color: "#b45309",
    fontSize: 14,
    fontWeight: 600,
  },
  retryBtn: {
    marginLeft: "auto",
    backgroundColor: "#d97706",
    color: "#ffffff",
    border: "none",
    borderRadius: 6,
    padding: "7px 14px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
  },
};

export default DashboardView;
