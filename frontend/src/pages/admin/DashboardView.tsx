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
} from "lucide-react";
import api from "../../services/api";
import { ui, type ViewProps, SectionHeader, money } from "./shared";

interface DashboardMetrics {
  ventasHoy: number;
  ventasMes: number;
  utilidadMes: number;
  ticketsHoy: number;
  ticketPromedio: number;
  productosActivos: number;
  clientesNuevos: number;
  inventarioBajo: number;
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

const DashboardView: React.FC<ViewProps> = ({ branchId, refreshToken }) => {
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

  const m = data?.metrics;
  const cards = [
    { label: "Ventas de hoy", value: m ? money(m.ventasHoy) : "—", icon: TrendingUp },
    { label: "Ventas del mes", value: m ? money(m.ventasMes) : "—", icon: CalendarDays },
    { label: "Utilidad del mes", value: m ? money(m.utilidadMes) : "—", icon: Coins },
    { label: "Tickets de hoy", value: m ? String(m.ticketsHoy) : "—", icon: Receipt },
    { label: "Ticket promedio", value: m ? money(m.ticketPromedio) : "—", icon: Tag },
    { label: "Productos activos", value: m ? String(m.productosActivos) : "—", icon: Package },
    { label: "Clientes nuevos", value: m ? String(m.clientesNuevos) : "—", icon: UserPlus },
    {
      label: "Inventario bajo",
      value: m ? `${m.inventarioBajo} ${m.inventarioBajo === 1 ? "producto" : "productos"}` : "—",
      icon: AlertTriangle,
      warning: !!m && m.inventarioBajo > 0,
    },
  ];

  const maxDay = Math.max(1, ...(data?.ventas7dias.map((d) => d.total) ?? [0]));
  const maxBranch = Math.max(1, ...(data?.ventasPorSucursal.map((b) => b.total) ?? [0]));

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
      <SectionHeader title="Dashboard" subtitle="Métricas empresariales en tiempo real desde SQL Server" />

      {/* Tarjetas de métricas */}
      <div style={s.metricsGrid}>
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} style={s.metricCard}>
              <div style={s.metricHead}>
                <span style={s.metricLabel}>{card.label}</span>
                <div style={{ ...s.metricIcon, backgroundColor: card.warning ? "#fef3c7" : "#eff6ff" }}>
                  <Icon size={16} color={card.warning ? "#d97706" : "#2563eb"} />
                </div>
              </div>
              <h2 style={{ ...s.metricValue, color: card.warning ? "#b45309" : "#0f172a" }}>
                {loading && !data ? "…" : card.value}
              </h2>
            </div>
          );
        })}
      </div>

      {/* Gráfica de 7 días */}
      <div style={{ ...ui.panel, padding: 20, marginTop: 20 }}>
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

      {/* Comparativos */}
      <div style={s.bottomGrid}>
        <div style={{ ...ui.panel, padding: 20 }}>
          <h3 style={s.panelTitle}>Ventas por sucursal</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 16 }}>
            {(data?.ventasPorSucursal ?? []).map((b) => (
              <div key={b.id}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>{b.name}</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: "#1e3a8a" }}>{money(b.total)}</span>
                </div>
                <div style={s.track}>
                  <div style={{ ...s.trackFill, width: `${(b.total / maxBranch) * 100}%` }} />
                </div>
              </div>
            ))}
            {!loading && (data?.ventasPorSucursal ?? []).length === 0 && <EmptyState />}
          </div>
        </div>

        <div style={{ ...ui.panel, padding: 20 }}>
          <h3 style={s.panelTitle}>Productos más vendidos</h3>
          <div style={{ marginTop: 8 }}>
            {(data?.productosMasVendidos ?? []).map((p, i) => (
              <div key={p.id} style={s.productRow}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={s.rankBadge}>{i + 1}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>{p.name}</span>
                </div>
                <span style={{ fontSize: 13, fontWeight: 800, color: "#0f172a" }}>{p.unidades} u</span>
              </div>
            ))}
            {!loading && (data?.productosMasVendidos ?? []).length === 0 && <EmptyState />}
          </div>
        </div>
      </div>
    </div>
  );
};

const EmptyState: React.FC = () => (
  <p style={{ fontSize: 13, color: "#94a3b8", padding: "24px 4px", textAlign: "center" }}>
    Aún no hay datos registrados para este periodo.
  </p>
);

const s: { [k: string]: React.CSSProperties } = {
  metricsGrid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 },
  metricCard: {
    backgroundColor: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: 12,
    padding: "18px 20px",
    boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
  },
  metricHead: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  metricLabel: { fontSize: 13, fontWeight: 600, color: "#64748b" },
  metricIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  metricValue: { fontSize: 26, fontWeight: 800, marginTop: 12, letterSpacing: "-0.5px" },
  panelTitle: { fontSize: 15, fontWeight: 800, color: "#0f172a" },
  chart: {
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 12,
    height: 200,
    marginTop: 18,
    paddingTop: 10,
    borderBottom: "1px solid #f1f5f9",
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
  chartValue: { fontSize: 10, fontWeight: 700, color: "#64748b", height: 12 },
  bar: { width: "60%", maxWidth: 46, borderRadius: "6px 6px 0 0", transition: "height 0.3s ease" },
  chartLabel: { fontSize: 12, fontWeight: 600, color: "#94a3b8" },
  bottomGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginTop: 20 },
  track: { height: 9, backgroundColor: "#eef2f7", borderRadius: 999, overflow: "hidden" },
  trackFill: { height: "100%", backgroundColor: "#3b82f6", borderRadius: 999, transition: "width 0.3s ease" },
  productRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "11px 0",
    borderBottom: "1px solid #f1f5f9",
  },
  rankBadge: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: "#eff6ff",
    color: "#2563eb",
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
