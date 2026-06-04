import React, { useEffect, useState, useCallback } from "react";
import { Printer } from "lucide-react";
import api from "../../services/api";
import {
  ui,
  type ViewProps,
  Panel,
  TableState,
  SectionHeader,
  Badge,
  money,
  moneyExact,
  payTone,
  statusTone,
  fmtDate,
  printHtml,
} from "./shared";

interface BranchOption {
  id: number;
  name: string;
}

interface ReportData {
  range: { from: string; to: string };
  totals: {
    ventasNetas: number;
    impuestos: number;
    ivaAmount: number;
    iepsAmount: number;
    otherTaxesAmount: number;
    descuentos: number;
    utilidad: number;
    ticketCount: number;
    ticketPromedio: number;
    canceladas: number;
  };
  byPaymentMethod: { method: string; total: number; count: number }[];
  byBranch: { id: number; name: string; total: number; count: number }[];
  topProducts: { id: number; name: string; unidades: number; importe: number }[];
  taxBreakdown: { taxName: string; taxRate: number; total: number }[];
  taxByProduct: { productId: number; name: string; sku: string; totalTax: number }[];
  salesList: { id: number; invoiceNumber: string; createdAt: string; subtotal: number; taxAmount: number; totalAmount: number; status: string }[];
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
  const [branches, setBranches] = useState<BranchOption[]>([]);

  useEffect(() => {
    api.get<{ branches: BranchOption[] }>("/api/auth/branches").then((r) => setBranches(r.data.branches)).catch(() => {});
  }, []);

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
    { label: "IVA Total", value: t ? money(t.ivaAmount) : "—" },
    { label: "IEPS Total", value: t ? money(t.iepsAmount) : "—" },
    { label: "Otros Impuestos", value: t ? money(t.otherTaxesAmount) : "—" },
    { label: "Descuentos", value: t ? money(t.descuentos) : "—" },
    { label: "Ventas canceladas", value: t ? String(t.canceladas) : "—" },
  ];

  const maxPay = Math.max(1, ...(data?.byPaymentMethod.map((p) => p.total) ?? [0]));
  const maxBranch = Math.max(1, ...(data?.byBranch.map((b) => b.total) ?? [0]));

  const branchLabel = branchId === "all" ? "Todas las sucursales" : branches.find((b) => String(b.id) === branchId)?.name || `Sucursal #${branchId}`;

  const handlePrint = () => {
    if (!data) return;
    const tt = data.totals;
    const body = `
      <div class="doc-header">
        <div>
          <div class="doc-brand">LYFRGL Solutions POS</div>
          <div class="doc-sub">Reporte ejecutivo de operaciones</div>
        </div>
        <div>
          <div class="doc-title">REPORTE DE VENTAS</div>
          <div class="doc-meta">Periodo: ${fmtDate(data.range.from)} — ${fmtDate(data.range.to)}</div>
          <div class="doc-meta">${branchLabel}</div>
        </div>
      </div>
      <div class="kpis">
        <div class="kpi"><div class="l">Ventas netas</div><div class="v">${moneyExact(tt.ventasNetas)}</div></div>
        <div class="kpi"><div class="l">Utilidad</div><div class="v">${moneyExact(tt.utilidad)}</div></div>
        <div class="kpi"><div class="l">Tickets</div><div class="v">${tt.ticketCount}</div></div>
        <div class="kpi"><div class="l">Ticket promedio</div><div class="v">${moneyExact(tt.ticketPromedio)}</div></div>
        <div class="kpi"><div class="l">IVA Total</div><div class="v">${moneyExact(tt.ivaAmount)}</div></div>
        <div class="kpi"><div class="l">IEPS Total</div><div class="v">${moneyExact(tt.iepsAmount)}</div></div>
        <div class="kpi"><div class="l">Otros Impuestos</div><div class="v">${moneyExact(tt.otherTaxesAmount)}</div></div>
        <div class="doc-meta">Total Impuestos Colectados: ${moneyExact(tt.impuestos)}</div>
        <div class="kpi"><div class="l">Descuentos</div><div class="v">${moneyExact(tt.descuentos)}</div></div>
        <div class="kpi"><div class="l">Canceladas</div><div class="v">${tt.canceladas}</div></div>
      </div>
      <h3>Ventas por método de pago</h3>
      <table><thead><tr><th>Método</th><th class="c">Operaciones</th><th class="r">Importe</th></tr></thead><tbody>
        ${data.byPaymentMethod.map((p) => `<tr><td>${p.method}</td><td class="c">${p.count}</td><td class="r">${moneyExact(p.total)}</td></tr>`).join("") || `<tr><td colspan="3" class="c">Sin datos</td></tr>`}
      </tbody></table>
      <h3>Ventas por sucursal</h3>
      <table><thead><tr><th>Sucursal</th><th class="c">Tickets</th><th class="r">Importe</th></tr></thead><tbody>
        ${data.byBranch.map((b) => `<tr><td>${b.name}</td><td class="c">${b.count}</td><td class="r">${moneyExact(b.total)}</td></tr>`).join("") || `<tr><td colspan="3" class="c">Sin datos</td></tr>`}
      </tbody></table>
      <h3>Desglose de Impuestos Colectados</h3>
      <table><thead><tr><th>Impuesto</th><th class="r">Tasa</th><th class="r">Total</th></tr></thead><tbody>
        ${(data.taxBreakdown ?? []).map((tb) => `<tr><td>${tb.taxName}</td><td class="r">${(tb.taxRate * 100).toFixed(2)}%</td><td class="r">${moneyExact(tb.total)}</td></tr>`).join("") || `<tr><td colspan="3" class="c">Sin datos</td></tr>`}
      </tbody></table>
      <h3>Impuestos por Producto</h3>
      <table><thead><tr><th>Producto (SKU)</th><th class="r">Impuesto Total</th></tr></thead><tbody>
        ${(data.taxByProduct ?? []).map((tbp) => `<tr><td>${tbp.name} (${tbp.sku})</td><td class="r">${moneyExact(tbp.totalTax)}</td></tr>`).join("") || `<tr><td colspan="2" class="c">Sin datos</td></tr>`}
      </tbody></table>
      <h3>Listado detallado de ventas</h3>
      <table><thead><tr><th>Folio</th><th>Fecha</th><th class="r">Subtotal</th><th class="r">Impuestos</th><th class="r">Total</th><th>Estatus</th></tr></thead><tbody>
        ${(data.salesList ?? []).map((s) => `<tr><td>${s.invoiceNumber}</td><td>${fmtDate(s.createdAt)}</td><td class="r">${moneyExact(s.subtotal)}</td><td class="r">${moneyExact(s.taxAmount)}</td><td class="r">${moneyExact(s.totalAmount)}</td><td>${s.status}</td></tr>`).join("") || `<tr><td colspan="6" class="c">Sin datos</td></tr>`}
      </tbody></table>
      <h3>Productos más vendidos</h3>
      <table><thead><tr><th>#</th><th>Producto</th><th class="c">Unidades</th><th class="r">Importe</th></tr></thead><tbody>
        ${data.topProducts.map((p, i) => `<tr><td>${i + 1}</td><td>${p.name}</td><td class="c">${p.unidades}</td><td class="r">${moneyExact(p.importe)}</td></tr>`).join("") || `<tr><td colspan="4" class="c">Sin datos</td></tr>`}
      </tbody></table>
    `;
    printHtml("Reporte de ventas - LYFRGL Solutions", body);
  };

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
        <button
          style={{ ...ui.ghostBtn, marginTop: 18, height: 38, opacity: data ? 1 : 0.5 }}
          className="active-tap"
          onClick={handlePrint}
          disabled={!data || loading}
          title="Imprimir / exportar a PDF"
        >
          <Printer size={15} /> Imprimir reporte completo
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
          <div style={{ ...ui.kpiGrid, gridTemplateColumns: "repeat(5, 1fr)", marginTop: 16 }}>
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

          {/* Desglose de Impuestos por Tipo y por Producto */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginTop: 20 }}>
            <Panel style={{ padding: 20 }}>
              <h3 style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>Impuestos Colectados por Tipo</h3>
              <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 14 }}>
                {(data?.taxBreakdown ?? []).map((tb) => {
                  const maxTax = Math.max(1, ...(data?.taxBreakdown.map((t) => t.total) ?? [0]));
                  return (
                    <div key={tb.taxName}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>{tb.taxName} ({(tb.taxRate * 100).toFixed(0)}%)</span>
                        <span style={{ fontSize: 13, fontWeight: 800, color: "#1e3a8a" }}>{money(tb.total)}</span>
                      </div>
                      <div style={{ height: 9, backgroundColor: "#eef2f7", borderRadius: 999, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${(tb.total / maxTax) * 100}%`, backgroundColor: "#8b5cf6", borderRadius: 999 }} />
                      </div>
                    </div>
                  );
                })}
                {!loading && (data?.taxBreakdown ?? []).length === 0 && <Empty />}
              </div>
            </Panel>

            <Panel style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
              <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0" }}>
                <h3 style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>Impuestos Colectados por Producto</h3>
              </div>
              <div style={{ overflowY: "auto", maxHeight: 280 }}>
                <table style={ui.table}>
                  <thead>
                    <tr style={ui.theadRow}>
                      <th style={ui.th}>Producto</th>
                      <th style={{ ...ui.th, textAlign: "right" }}>Impuesto Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    <TableState colSpan={2} loading={loading && !data} empty={!loading && (data?.taxByProduct ?? []).length === 0} emptyText="Sin impuestos por producto." />
                    {(data?.taxByProduct ?? []).map((tbp) => (
                      <tr key={tbp.productId}>
                        <td style={{ ...ui.td, fontWeight: 600, color: "#0f172a" }}>{tbp.name} <span style={{ fontSize: 11, color: "#64748b" }}>({tbp.sku})</span></td>
                        <td style={{ ...ui.td, textAlign: "right", fontWeight: 700 }}>{money(tbp.totalTax)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>

          {/* Listado detallado de Ventas */}
          <div style={{ ...ui.tableWrap, marginTop: 20 }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0" }}>
              <h3 style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>Listado Detallado de Ventas</h3>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={ui.table}>
                <thead>
                  <tr style={ui.theadRow}>
                    <th style={ui.th}>Folio</th>
                    <th style={ui.th}>Fecha</th>
                    <th style={{ ...ui.th, textAlign: "right" }}>Subtotal</th>
                    <th style={{ ...ui.th, textAlign: "right" }}>Impuestos</th>
                    <th style={{ ...ui.th, textAlign: "right" }}>Total Neto</th>
                    <th style={{ ...ui.th, textAlign: "center" }}>Estatus</th>
                  </tr>
                </thead>
                <tbody>
                  <TableState colSpan={6} loading={loading && !data} empty={!loading && (data?.salesList ?? []).length === 0} emptyText="Sin ventas en el periodo seleccionado." />
                  {(data?.salesList ?? []).map((s) => (
                    <tr key={s.id}>
                      <td style={{ ...ui.td, fontWeight: 700, color: "#1e3a8a" }}>{s.invoiceNumber}</td>
                      <td style={{ ...ui.td }}>{fmtDate(s.createdAt)}</td>
                      <td style={{ ...ui.td, textAlign: "right" }}>{money(s.subtotal)}</td>
                      <td style={{ ...ui.td, textAlign: "right" }}>{money(s.taxAmount)}</td>
                      <td style={{ ...ui.td, textAlign: "right", fontWeight: 800 }}>{money(s.totalAmount)}</td>
                      <td style={{ ...ui.td, textAlign: "center" }}>
                        <Badge tone={statusTone(s.status)}>{s.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
