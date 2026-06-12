import React, { useEffect, useState, useCallback } from "react";
import { Printer, RefreshCw, CalendarClock } from "lucide-react";
import api from "../../../services/api";
import {
  ui,
  Badge,
  SearchInput,
  FilterSelect,
  TableState,
  money,
  fmtDate,
  fmtTime,
  printHtml,
} from "../shared";
import { type ReportDef, type ReportFilters, type Column, formatForPrint } from "./reportConfig";
import {
  CUSTOM_REPORT_PERIOD,
  REPORT_PERIOD_OPTIONS,
  daysAgoInputValue,
  formatReportRangeLabel,
  getReportDateRange,
  validateReportDateRange,
  type ReportPeriod,
} from "./reportPeriods";

const ReportRunner: React.FC<{ def: ReportDef; branchId: string; branchLabel: string }> = ({ def, branchId, branchLabel }) => {
  const [filters, setFilters] = useState<ReportFilters>({
    from: daysAgoInputValue(29),
    to: daysAgoInputValue(0),
    status: "all",
    movementType: "all",
    search: "",
  });
  const [period, setPeriod] = useState<ReportPeriod>(CUSTOM_REPORT_PERIOD);
  const [res, setRes] = useState<any>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const has = (f: string) => def.filters?.includes(f as any);

  const load = useCallback(async () => {
    if (!def.available || !def.endpoint) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const currentDateRangeError = def.filters?.includes("dateRange")
        ? validateReportDateRange(filters.from, filters.to)
        : null;
      if (currentDateRangeError) {
        setRes(null);
        setRows([]);
        setError(currentDateRangeError);
        return;
      }

      const params = def.params ? def.params(filters, branchId) : {};
      if (def.endpoint === "/api/admin/reports/sales") {
        params.page = page;
        params.pageSize = pageSize;
      }
      const r = await api.get(def.endpoint, { params });
      setRes(r.data);
      let extracted = def.rows ? def.rows(r.data) : [];
      if (def.clientFilter) extracted = def.clientFilter(extracted, filters);
      setRows(extracted);
    } catch (err: any) {
      setError(err.response?.data?.message || "No se pudo generar el reporte.");
      setRows([]);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def, branchId, filters.from, filters.to, filters.status, filters.movementType, filters.search, page, pageSize]);

  useEffect(() => {
    const t = setTimeout(load, has("search") ? 300 : 0);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [branchId, def]);

  const kpis = def.kpis && res ? def.kpis(res, rows) : [];
  const cols = def.columns ?? [];
  const dateRangeError = has("dateRange") ? validateReportDateRange(filters.from, filters.to) : null;

  const setFilter = (k: keyof ReportFilters, v: string) => {
    setPage(1);
    setFilters((f) => ({ ...f, [k]: v }));
  };

  const setDateFilter = (k: "from" | "to", v: string) => {
    setPeriod(CUSTOM_REPORT_PERIOD);
    setFilter(k, v);
  };

  const handlePeriodChange = (value: string) => {
    const nextPeriod = value as ReportPeriod;
    setPeriod(nextPeriod);
    setPage(1);

    if (nextPeriod === CUSTOM_REPORT_PERIOD) return;

    const { startDate, endDate } = getReportDateRange(nextPeriod);
    setFilters((f) => ({ ...f, from: startDate, to: endDate }));
  };

  // -------- Reporte no disponible --------
  if (!def.available) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: "70px 24px",
          backgroundColor: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: 12,
        }}
      >
        <div style={{ width: 60, height: 60, borderRadius: 14, backgroundColor: "#fef3c7", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
          <CalendarClock size={28} color="#d97706" />
        </div>
        <h3 style={{ fontSize: 18, fontWeight: 800, color: "#1e3a8a" }}>{def.title}</h3>
        <p style={{ fontSize: 14, color: "#64748b", marginTop: 6, maxWidth: 460 }}>{def.description}</p>
        <p style={{ fontSize: 13, color: "#b45309", marginTop: 14, fontWeight: 600 }}>
          Este reporte estará disponible cuando se implemente el módulo de apartados/reservas en la base de datos.
        </p>
      </div>
    );
  }

  const renderCell = (col: Column, row: any): React.ReactNode => {
    const raw = col.value ? col.value(row) : row[col.key];
    if (col.type === "badge") {
      const tone = col.badgeTone ? col.badgeTone(row) : "slate";
      return <Badge tone={tone}>{raw ?? "—"}</Badge>;
    }
    if (raw === null || raw === undefined || raw === "") return <span style={{ color: "#94a3b8" }}>—</span>;
    switch (col.type) {
      case "money":
        return money(Number(raw));
      case "number":
        return raw;
      case "date":
        return fmtDate(raw);
      case "datetime":
        return (
          <>
            {fmtDate(raw)} <span style={{ color: "#94a3b8" }}>{fmtTime(raw)}</span>
          </>
        );
      default:
        return raw;
    }
  };

  const handlePrint = () => {
    const cls = (c: Column) => (c.align === "right" ? "r" : c.align === "center" ? "c" : "");
    const periodLine = has("dateRange") ? `<div class="doc-meta">Periodo: ${formatReportRangeLabel(filters.from, filters.to)}</div>` : "";
    const body = `
      <div class="doc-header">
        <div>
          <div class="doc-brand">LYFRGL Solutions POS</div>
          <div class="doc-sub">${def.description}</div>
        </div>
        <div>
          <div class="doc-title">${def.title.toUpperCase()}</div>
          ${periodLine}
          ${def.branchScoped ? `<div class="doc-meta">${branchLabel}</div>` : ""}
        </div>
      </div>
      ${kpis.length ? `<div class="kpis">${kpis.map((k) => `<div class="kpi"><div class="l">${k.label}</div><div class="v">${k.value}</div></div>`).join("")}</div>` : ""}
      <h3>${def.title} — ${rows.length} registro(s)</h3>
      <table>
        <thead><tr>${cols.map((c) => `<th class="${cls(c)}">${c.label}</th>`).join("")}</tr></thead>
        <tbody>
          ${rows.map((row) => `<tr>${cols.map((c) => `<td class="${cls(c)}">${formatForPrint(c, row)}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${cols.length}" class="c">Sin datos en el periodo</td></tr>`}
        </tbody>
      </table>
    `;
    printHtml(`${def.title} - LYFRGL`, body);
  };

  return (
    <div>
      {/* Barra de filtros */}
      <div style={ui.toolbar}>
        {has("dateRange") && (
          <>
            <div>
              <label style={ui.fieldLabel}>Periodo del reporte</label>
              <select style={{ ...ui.filterSelect, minWidth: 180 }} value={period} onChange={(e) => handlePeriodChange(e.target.value)}>
                {REPORT_PERIOD_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={ui.fieldLabel}>Desde</label>
              <input
                type="date"
                style={{ ...ui.filterSelect, height: 38, ...(dateRangeError ? { borderColor: "#fca5a5" } : {}) }}
                value={filters.from}
                onChange={(e) => setDateFilter("from", e.target.value)}
                aria-invalid={Boolean(dateRangeError)}
              />
            </div>
            <div>
              <label style={ui.fieldLabel}>Hasta</label>
              <input
                type="date"
                style={{ ...ui.filterSelect, height: 38, ...(dateRangeError ? { borderColor: "#fca5a5" } : {}) }}
                value={filters.to}
                onChange={(e) => setDateFilter("to", e.target.value)}
                aria-invalid={Boolean(dateRangeError)}
              />
            </div>
            <span
              style={{
                alignSelf: "flex-end",
                height: 38,
                display: "inline-flex",
                alignItems: "center",
                fontSize: 12,
                color: dateRangeError ? "#b91c1c" : "#64748b",
                fontWeight: 700,
              }}
            >
              {dateRangeError || `Periodo seleccionado: ${formatReportRangeLabel(filters.from, filters.to)}`}
            </span>
          </>
        )}
        {has("status") && def.statusOptions && (
          <FilterSelect value={filters.status} onChange={(v) => setFilter("status", v)} options={def.statusOptions} />
        )}
        {has("movementType") && def.movementOptions && (
          <FilterSelect value={filters.movementType} onChange={(v) => setFilter("movementType", v)} options={def.movementOptions} />
        )}
        {has("search") && <SearchInput value={filters.search} onChange={(v) => setFilter("search", v)} placeholder="Buscar..." />}

        <button style={{ ...ui.primaryBtn }} className="active-tap" onClick={load} disabled={loading || Boolean(dateRangeError)} title="Actualizar">
          <RefreshCw size={15} /> {loading ? "Generando..." : "Generar"}
        </button>
        <button
          style={{ ...ui.ghostBtn, opacity: rows.length ? 1 : 0.5 }}
          className="active-tap"
          onClick={handlePrint}
          disabled={!rows.length || loading}
          title="Imprimir / exportar a PDF"
        >
          <Printer size={15} /> Imprimir
        </button>
        <span style={{ marginLeft: "auto", fontSize: 13, color: "#64748b", fontWeight: 600 }}>
          {rows.length} registro{rows.length === 1 ? "" : "s"}
        </span>
      </div>

      {/* KPIs */}
      {kpis.length > 0 && (
        <div style={{ ...ui.kpiGrid, gridTemplateColumns: `repeat(${Math.min(kpis.length, 6)}, 1fr)`, marginBottom: 20 }}>
          {kpis.map((k) => (
            <div key={k.label} style={ui.kpiCard}>
              <div style={ui.kpiLabel}>{k.label}</div>
              <div style={{ ...ui.kpiValue, fontSize: 20 }}>{loading && !res ? "…" : k.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabla */}
      <div className="table-sticky-head" style={{ ...ui.tableWrap, overflowX: "auto", overflowY: "auto", maxHeight: "62vh" }}>
        <table style={ui.table}>
          <thead>
            <tr style={ui.theadRow}>
              {cols.map((c) => (
                <th key={c.key} style={{ ...ui.th, textAlign: c.align ?? "left", ...(c.width ? { width: c.width } : {}) }}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <TableState colSpan={cols.length} loading={loading} error={error} empty={!loading && !error && rows.length === 0} />
            {!loading &&
              !error &&
              rows.map((row, i) => (
                <tr key={i}>
                  {cols.map((c) => (
                    <td key={c.key} style={{ ...ui.td, textAlign: c.align ?? "left", whiteSpace: c.key === "name" || c.key === "product" || c.key === "reason" ? "normal" : "nowrap" }}>
                      {renderCell(c, row)}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Paginación */}
      {res?.pagination && (
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          backgroundColor: "#ffffff",
          border: "1px solid #e2e8f0",
          borderTop: "none",
          borderBottomLeftRadius: 12,
          borderBottomRightRadius: 12,
          fontSize: 13,
          color: "#475569"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span>Mostrar</span>
            <select
              style={{
                padding: "4px 8px",
                borderRadius: 4,
                border: "1px solid #cbd5e1",
                backgroundColor: "#ffffff",
                fontSize: 13,
                cursor: "pointer"
              }}
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <span>registros por página</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ marginRight: 16 }}>
              Mostrando página <strong>{res.pagination.page}</strong> de <strong>{res.pagination.totalPages || 1}</strong> ({res.pagination.total} registros en total)
            </span>
            <button
              style={{
                padding: "6px 12px",
                borderRadius: 6,
                border: "1px solid #cbd5e1",
                backgroundColor: res.pagination.hasPreviousPage ? "#ffffff" : "#f1f5f9",
                color: res.pagination.hasPreviousPage ? "#0f172a" : "#94a3b8",
                cursor: res.pagination.hasPreviousPage ? "pointer" : "default",
                fontSize: 13,
                fontWeight: 600,
                outline: "none"
              }}
              disabled={!res.pagination.hasPreviousPage || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Anterior
            </button>
            <button
              style={{
                padding: "6px 12px",
                borderRadius: 6,
                border: "1px solid #cbd5e1",
                backgroundColor: res.pagination.hasNextPage ? "#ffffff" : "#f1f5f9",
                color: res.pagination.hasNextPage ? "#0f172a" : "#94a3b8",
                cursor: res.pagination.hasNextPage ? "pointer" : "default",
                fontSize: 13,
                fontWeight: 600,
                outline: "none"
              }}
              disabled={!res.pagination.hasNextPage || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              Siguiente
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportRunner;
