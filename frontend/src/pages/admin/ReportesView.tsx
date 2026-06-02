import React, { useEffect, useState, useCallback } from "react";
import api from "../../services/api";
import {
  ui,
  type ViewProps,
  Panel,
  TableState,
  SectionHeader,
  Badge,
  money,
  payTone,
} from "./shared";

interface ReportData {
  range: { from: string; to: string };
  totals: {
    ventasNetas: number;
    impuestos: number;
    descuentos: number;
    utilidad: number;
    ticketCount: number;
    ticketPromedio: number;
    canceladas: number;
  };
  byPaymentMethod: { method: string; total: number; count: number }[];
  byBranch: { id: number; name: string; total: number; count: number }[];
  topProducts: { id: number; name: string; unidades: number; importe: number }[];
}

// yyyy-mm-dd para inputs date
const toInput = (d: Date) => d.toISOString().slice(0, 10);

const ReportesView: React.FC<ViewProps> = ({ branchId, refreshToken }) => {
  const today = new Date();
  const monthAgo = new Date();
  monthAgo.setDate(today.getDate() - 29);

  const [from, setFrom] = useState(toInput(monthAgo));
  const [to, setTo] = useState(toInput(today));
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<ReportData>("/api/admin/reports", {
        params: {
          from,
          to,
          ...(branchId !== "all" ? { branchId } : {}),
        },
      });
      setData(res.data);
    } catch (err: any) {
      setError(err.response?.data?.message || "No se pudieron generar los reportes.");
    } finally {
      setLoading(false);
    }
  }, [from, to, branchId, refreshToken]);

  useEffect(() => {
    load();
  }, [load]);

  const t = data?.totals;
  const kpis = [
    { label: "Ventas netas", value: t ? money(t.ventasNetas) : "—" },
    { label: "Utilidad", value: t ? money(t.utilidad) : "—" },
    { label: "Tickets", value: t ? String(t.ticketCount) : "—" },
    { label: "Ticket promedio", value: t ? money(t.ticketPromedio) : "—" },
    { label: "Impuestos (IVA)", value: t ? money(t.impuestos) : "—" },
    { label: "Descuentos", value: t ? money(t.descuentos) : "—" },
    { label: "Ventas canceladas", value: t ? String(t.canceladas) : "—" },
  ];

  const maxPay = Math.max(1, ...(data?.byPaymentMethod.map((p) => p.total) ?? [0]));
  const maxBranch = Math.max(1, ...(data?.byBranch.map((b) => b.total) ?? [0]));

  return (
    <div>
      <SectionHeader title="Reportes" subtitle="Resumen ejecutivo de operaciones por periodo" />

      {/* Selector de rango de fechas */}
      <div style={ui.toolbar}>
        <DateField label="Desde" value={from} onChange={setFrom} />
        <DateField label="Hasta" value={to} onChange={setTo} />
        <button style={{ ...ui.primaryBtn, marginTop: 18 }} className="active-tap" onClick={load} disabled={loading}>
          {loading ? "Generando..." : "Generar reporte"}
        </button>
      </div>

      {error && (
        <Panel style={{ padding: 24, color: "#b91c1c", fontWeight: 600 }}>{error}</Panel>
      )}

      {!error && (
        <>
          {/* KPIs */}
          <div style={{ ...ui.kpiGrid, gridTemplateColumns: "repeat(4, 1fr)" }}>
            {kpis.slice(0, 4).map((k) => (
              <div key={k.label} style={ui.kpiCard}>
                <div style={ui.kpiLabel}>{k.label}</div>
                <div style={ui.kpiValue}>{loading && !data ? "…" : k.value}</div>
              </div>
            ))}
          </div>
          <div style={{ ...ui.kpiGrid, gridTemplateColumns: "repeat(3, 1fr)", marginTop: 16 }}>
            {kpis.slice(4).map((k) => (
              <div key={k.label} style={ui.kpiCard}>
                <div style={ui.kpiLabel}>{k.label}</div>
                <div style={ui.kpiValue}>{loading && !data ? "…" : k.value}</div>
              </div>
            ))}
          </div>

          {/* Desgloses */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginTop: 20 }}>
            <Panel style={{ padding: 20 }}>
              <h3 style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>Ventas por método de pago</h3>
              <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 14 }}>
                {(data?.byPaymentMethod ?? []).map((p) => (
                  <div key={p.method}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <Badge tone={payTone(p.method)}>{p.method}</Badge>
                      <span style={{ fontSize: 13, fontWeight: 800, color: "#1e3a8a" }}>{money(p.total)}</span>
                    </div>
                    <div style={{ height: 9, backgroundColor: "#eef2f7", borderRadius: 999, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${(p.total / maxPay) * 100}%`, backgroundColor: "#3b82f6", borderRadius: 999 }} />
                    </div>
                  </div>
                ))}
                {!loading && (data?.byPaymentMethod ?? []).length === 0 && <Empty />}
              </div>
            </Panel>

            <Panel style={{ padding: 20 }}>
              <h3 style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>Ventas por sucursal</h3>
              <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 14 }}>
                {(data?.byBranch ?? []).map((b) => (
                  <div key={b.id}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>{b.name}</span>
                      <span style={{ fontSize: 13, fontWeight: 800, color: "#1e3a8a" }}>{money(b.total)}</span>
                    </div>
                    <div style={{ height: 9, backgroundColor: "#eef2f7", borderRadius: 999, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${(b.total / maxBranch) * 100}%`, backgroundColor: "#1e3a8a", borderRadius: 999 }} />
                    </div>
                  </div>
                ))}
                {!loading && (data?.byBranch ?? []).length === 0 && <Empty />}
              </div>
            </Panel>
          </div>

          {/* Top productos */}
          <div style={{ ...ui.tableWrap, marginTop: 20 }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0" }}>
              <h3 style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>Productos más vendidos</h3>
            </div>
            <table style={ui.table}>
              <thead>
                <tr style={ui.theadRow}>
                  <th style={{ ...ui.th, width: 50, textAlign: "center" }}>#</th>
                  <th style={ui.th}>Producto</th>
                  <th style={{ ...ui.th, textAlign: "center" }}>Unidades</th>
                  <th style={{ ...ui.th, textAlign: "right" }}>Importe</th>
                </tr>
              </thead>
              <tbody>
                <TableState colSpan={4} loading={loading && !data} empty={!loading && (data?.topProducts ?? []).length === 0} emptyText="Sin ventas en el periodo seleccionado." />
                {(data?.topProducts ?? []).map((p, i) => (
                  <tr key={p.id}>
                    <td style={{ ...ui.td, textAlign: "center", fontWeight: 800, color: "#2563eb" }}>{i + 1}</td>
                    <td style={{ ...ui.td, fontWeight: 600, color: "#0f172a", whiteSpace: "normal" }}>{p.name}</td>
                    <td style={{ ...ui.td, textAlign: "center", fontWeight: 700 }}>{p.unidades}</td>
                    <td style={{ ...ui.td, textAlign: "right", fontWeight: 700 }}>{money(p.importe)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

const DateField: React.FC<{ label: string; value: string; onChange: (v: string) => void }> = ({ label, value, onChange }) => (
  <div>
    <label style={ui.fieldLabel}>{label}</label>
    <input type="date" style={{ ...ui.filterSelect, height: 38 }} value={value} onChange={(e) => onChange(e.target.value)} />
  </div>
);

const Empty: React.FC = () => (
  <p style={{ fontSize: 13, color: "#94a3b8", padding: "16px 0", textAlign: "center" }}>Sin datos en el periodo.</p>
);

export default ReportesView;
