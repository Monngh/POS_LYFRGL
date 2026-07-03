import { getSellerReport } from "./reports.service";
import { vary } from "./executiveSummary.service";

// ============================================================================
// Reporte de Personal (vendedores) — servicio compartido por los reportes
// «Operaciones del vendedor» y «Ventas por usuario», que presentan la misma
// data con distinto énfasis. Periodo con comparativo vs. periodo anterior.
// Reutiliza getSellerReport (reports.service) para las filas por usuario.
// ============================================================================

export interface PersonnelReportFilters {
  from: Date;
  to: Date;
  branchId?: number;
}

interface SellerRow {
  userId: number;
  name: string;
  role: string;
  branch: string;
  ventasCount: number;
  totalVendido: number;
  descuentos: number;
  canceladas: number;
  devolucionesCount: number;
  devolucionesMonto: number;
  ticketPromedio: number;
  comision: number;
}

const coreOf = (rows: SellerRow[]) => {
  const totalVendido = rows.reduce((a, r) => a + r.totalVendido, 0);
  const tickets = rows.reduce((a, r) => a + r.ventasCount, 0);
  return {
    usuarios: rows.length,
    vendedoresActivos: rows.filter((r) => r.ventasCount > 0).length,
    totalVendido,
    tickets,
    ticketPromedio: tickets > 0 ? totalVendido / tickets : 0,
    comision: rows.reduce((a, r) => a + r.comision, 0),
    descuentos: rows.reduce((a, r) => a + r.descuentos, 0),
    cancelaciones: rows.reduce((a, r) => a + r.canceladas, 0),
    devoluciones: rows.reduce((a, r) => a + r.devolucionesCount, 0),
    devolucionesMonto: rows.reduce((a, r) => a + r.devolucionesMonto, 0),
  };
};

const KPI_KEYS = ["usuarios", "vendedoresActivos", "totalVendido", "tickets", "ticketPromedio", "comision", "descuentos", "cancelaciones", "devoluciones", "devolucionesMonto"] as const;

export async function getPersonnelReport(f: PersonnelReportFilters) {
  const { from, to, branchId } = f;
  const durationMs = to.getTime() - from.getTime();
  const prevTo = new Date(from.getTime() - 1);
  const prevFrom = new Date(from.getTime() - durationMs - 1);

  const [cur, prev] = await Promise.all([
    getSellerReport({ from, to, branchId }),
    getSellerReport({ from: prevFrom, to: prevTo, branchId }),
  ]);
  const curRows = cur.rows as SellerRow[];
  const c = coreOf(curRows);
  const p = coreOf(prev.rows as SellerRow[]);

  const kpis: Record<string, ReturnType<typeof vary>> = {};
  for (const key of KPI_KEYS) kpis[key] = vary((c as any)[key] ?? 0, (p as any)[key] ?? 0);

  // Filas enriquecidas con tasas de cancelación / devolución.
  const rows = curRows.map((r) => {
    const ops = r.ventasCount + r.canceladas;
    return {
      ...r,
      tasaCancelacion: ops > 0 ? (r.canceladas / ops) * 100 : 0,
      tasaDevolucion: r.ventasCount > 0 ? (r.devolucionesCount / r.ventasCount) * 100 : 0,
    };
  });

  const byImporte = [...rows].sort((a, b) => b.totalVendido - a.totalVendido);
  const byTickets = [...rows].sort((a, b) => b.ventasCount - a.ventasCount);
  const byComision = [...rows].sort((a, b) => b.comision - a.comision);
  const byDevoluciones = [...rows].filter((r) => r.devolucionesCount > 0).sort((a, b) => b.devolucionesCount - a.devolucionesCount);

  const series = {
    ventasPorVendedor: byImporte.slice(0, 12).map((r) => ({ vendedor: r.name, total: r.totalVendido, tickets: r.ventasCount })),
    ticketsPorVendedor: byTickets.slice(0, 12).map((r) => ({ vendedor: r.name, tickets: r.ventasCount, total: r.totalVendido })),
    comisionPorVendedor: byComision.slice(0, 12).map((r) => ({ vendedor: r.name, comision: r.comision, total: r.totalVendido })),
  };

  const rankings = {
    importe: byImporte.slice(0, 10).map((r, i) => ({ rank: i + 1, nombre: r.name, tickets: r.ventasCount, importe: r.totalVendido })),
    tickets: byTickets.slice(0, 10).map((r, i) => ({ rank: i + 1, nombre: r.name, tickets: r.ventasCount, importe: r.totalVendido })),
    comision: byComision.slice(0, 10).map((r, i) => ({ rank: i + 1, nombre: r.name, tickets: r.ventasCount, importe: r.comision })),
    devoluciones: byDevoluciones.slice(0, 10).map((r, i) => ({ rank: i + 1, nombre: r.name, tickets: r.devolucionesCount, importe: r.devolucionesMonto })),
  };

  return {
    period: { from: from.toISOString(), to: to.toISOString(), prevFrom: prevFrom.toISOString(), prevTo: prevTo.toISOString(), days: Math.max(1, Math.round(durationMs / 864e5) + 1) },
    kpis,
    tops: {
      topVendedor: byImporte[0]?.name ?? "—",
      topTickets: byTickets[0]?.name ?? "—",
      topComision: byComision[0]?.name ?? "—",
    },
    series,
    rankings,
    sellers: byImporte,
    sellersMeta: { total: rows.length },
    alertsData: {
      altaCancelacion: rows.filter((r) => r.tasaCancelacion > 8 && r.ventasCount + r.canceladas >= 5).map((r) => ({ nombre: r.name, tasa: r.tasaCancelacion })).slice(0, 5),
      altaDevolucion: rows.filter((r) => r.tasaDevolucion > 8 && r.ventasCount >= 5).map((r) => ({ nombre: r.name, tasa: r.tasaDevolucion })).slice(0, 5),
      sinVentas: rows.filter((r) => r.ventasCount === 0).length,
    },
  };
}
