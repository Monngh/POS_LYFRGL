import React, { useEffect, useState, useCallback } from "react";
import { Printer, RefreshCw, CalendarClock, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Calendar, User, Package, Layers, TrendingUp, TrendingDown, ArrowUpDown, Activity } from "lucide-react";
import api from '../../../shared/services/api';
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
  useMediaQuery,
  statusTone,
  payTone,
} from "../shared";
import { useToast } from "../../../shared/context/ToastContext";
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

const reportDetailRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-start",
  alignItems: "flex-start",
  gap: "8px",
  fontSize: 13,
  marginBottom: 6,
};

const reportDetailLabelStyle: React.CSSProperties = {
  fontWeight: 700,
  color: "var(--text-muted)",
  minWidth: "85px",
  display: "inline-block",
  flexShrink: 0,
};

const reportDetailValueStyle: React.CSSProperties = {
  fontWeight: 600,
  color: "var(--text-secondary)",
  wordBreak: "break-word",
  overflowWrap: "anywhere",
  whiteSpace: "normal",
  minWidth: 0,
  flex: 1,
};

const ReportRunner: React.FC<{ def: ReportDef; branchId: string; branchLabel: string }> = ({ def, branchId, branchLabel }) => {
  const { showToast } = useToast();
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
  const [expandedSales, setExpandedSales] = useState<Record<number, boolean>>({});
  const isMobile = useMediaQuery("(max-width: 1024px)");

  const toggleExpandSale = (index: number) => {
    setExpandedSales((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

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
          backgroundColor: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          width: "100%",
        }}
      >
        <div style={{ width: 60, height: 60, borderRadius: 14, backgroundColor: "#fef3c7", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
          <CalendarClock size={28} color="#d97706" />
        </div>
        <h3 style={{ fontSize: 18, fontWeight: 800, color: "var(--accent-strong)" }}>{def.title}</h3>
        <p style={{ fontSize: 14, color: "var(--text-muted)", marginTop: 6, maxWidth: 460 }}>{def.description}</p>
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
    if (raw === null || raw === undefined || raw === "") return <span style={{ color: "var(--text-faint)" }}>—</span>;
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
            {fmtDate(raw)} <span style={{ color: "var(--text-faint)" }}>{fmtTime(raw)}</span>
          </>
        );
      default:
        return <span style={{ wordBreak: "break-word", overflowWrap: "anywhere", whiteSpace: "normal" }}>{raw}</span>;
    }
  };

  const getCell = (row: any, key: string) => {
    const col = cols.find((c) => c.key === key);
    if (!col) return "—";
    return renderCell(col, row);
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
    printHtml(`${def.title} - LYFRGL`, body, showToast);
  };

  return (
    // Contenedor principal sin padding/margen para ocupar todo el ancho
    <div style={{ width: "100%", maxWidth: "100%", padding: 0, margin: 0 }}>
      {/* Barra de filtros — padding reducido al mínimo */}
      <div
        style={{
          backgroundColor: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: isMobile ? "12px 12px" : "8px 12px",
          marginBottom: 16,
          boxShadow: "0 1px 3px rgba(15,23,42,0.05)",
          width: "100%",
        }}
      >
        {/* Fila principal de filtros con gap reducido */}
        <div
          style={{
            display: "flex",
            flexWrap: isMobile ? "wrap" : "nowrap",
            alignItems: "flex-end",
            gap: 8,
            width: "100%",
          }}
        >
          {has("dateRange") && (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: isMobile ? "1 1 200px" : "0 1 160px" }}>
                <label style={ui.fieldLabel}>Periodo</label>
                <select
                  style={{ ...ui.filterSelect, height: 38, width: "100%" }}
                  value={period}
                  onChange={(e) => handlePeriodChange(e.target.value)}
                >
                  {REPORT_PERIOD_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: isMobile ? "1 1 150px" : "1 1 0" }}>
                <label style={ui.fieldLabel}>Desde</label>
                <input
                  type="date"
                  style={{
                    ...ui.filterSelect,
                    height: 38,
                    width: "100%",
                    ...(dateRangeError ? { borderColor: "#fca5a5" } : {}),
                  }}
                  value={filters.from}
                  onChange={(e) => setDateFilter("from", e.target.value)}
                  aria-invalid={Boolean(dateRangeError)}
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: isMobile ? "1 1 150px" : "1 1 0" }}>
                <label style={ui.fieldLabel}>Hasta</label>
                <input
                  type="date"
                  style={{
                    ...ui.filterSelect,
                    height: 38,
                    width: "100%",
                    ...(dateRangeError ? { borderColor: "#fca5a5" } : {}),
                  }}
                  value={filters.to}
                  onChange={(e) => setDateFilter("to", e.target.value)}
                  aria-invalid={Boolean(dateRangeError)}
                />
              </div>
            </>
          )}

          {has("status") && def.statusOptions && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: isMobile ? "1 1 160px" : "0 1 140px" }}>
              <label style={ui.fieldLabel}>Estado</label>
              <FilterSelect value={filters.status} onChange={(v) => setFilter("status", v)} options={def.statusOptions} />
            </div>
          )}
          {has("movementType") && def.movementOptions && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: isMobile ? "1 1 160px" : "0 1 140px" }}>
              <label style={ui.fieldLabel}>Tipo</label>
              <FilterSelect value={filters.movementType} onChange={(v) => setFilter("movementType", v)} options={def.movementOptions} />
            </div>
          )}
          {has("search") && (
            <div style={{ flex: isMobile ? "1 1 200px" : "1 1 0", minWidth: isMobile ? 160 : 100 }}>
              <label style={ui.fieldLabel}>Buscar</label>
              <SearchInput value={filters.search} onChange={(v) => setFilter("search", v)} placeholder="Buscar..." />
            </div>
          )}

          {/* Acciones */}
          <div style={{ display: "flex", gap: 6, alignItems: "flex-end", flexShrink: 0, flexWrap: "wrap", marginLeft: isMobile ? 0 : "auto" }}>
            <button
              style={{ ...ui.primaryBtn, padding: "6px 14px", fontSize: 13 }}
              className="active-tap"
              onClick={load}
              disabled={loading || Boolean(dateRangeError)}
              title="Actualizar"
            >
              <RefreshCw size={14} /> {loading ? "Generando..." : "Generar"}
            </button>
            <button
              style={{ ...ui.ghostBtn, opacity: rows.length ? 1 : 0.5, padding: "6px 14px", fontSize: 13 }}
              className="active-tap"
              onClick={handlePrint}
              disabled={!rows.length || loading}
              title="Imprimir / exportar a PDF"
            >
              <Printer size={14} /> Imprimir
            </button>
          </div>
        </div>

        {/* Fila inferior: indicador de periodo + contador */}
        {has("dateRange") && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 8,
              marginTop: 10,
              paddingTop: 10,
              borderTop: "1px solid var(--border-soft)",
            }}
          >
            <span
              style={{
                fontSize: 12,
                color: dateRangeError ? "#b91c1c" : "var(--text-muted)",
                fontWeight: 600,
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              {dateRangeError ? (
                <span style={{ color: "#b91c1c" }}>{dateRangeError}</span>
              ) : (
                <>
                  <span style={{ color: "var(--text-faint)" }}>Periodo:</span>
                  {formatReportRangeLabel(filters.from, filters.to)}
                </>
              )}
            </span>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                fontSize: 12,
                fontWeight: 700,
                color: "var(--accent-strong)",
                backgroundColor: "var(--accent-soft)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: "3px 10px",
              }}
            >
              {rows.length} registro{rows.length === 1 ? "" : "s"}
            </span>
          </div>
        )}
        {!has("dateRange") && (
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                fontSize: 12,
                fontWeight: 700,
                color: "var(--accent-strong)",
                backgroundColor: "var(--accent-soft)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: "3px 10px",
              }}
            >
              {rows.length} registro{rows.length === 1 ? "" : "s"}
            </span>
          </div>
        )}
      </div>

      {/* KPIs */}
      {kpis.length > 0 && (
        <div
          style={{
            ...ui.kpiGrid,
            gridTemplateColumns: isMobile
              ? `repeat(2, 1fr)`
              : `repeat(auto-fit, minmax(150px, 1fr))`,
            marginBottom: 16,
            gap: 10,
          }}
        >
          {kpis.map((k) => (
            <div key={k.label} style={ui.kpiCard}>
              <div style={ui.kpiLabel}>{k.label}</div>
              <div style={{ ...ui.kpiValue, fontSize: 20 }}>{loading && !res ? "…" : k.value}</div>
            </div>
          ))}
        </div>
      )}

      {isMobile && def.key === "ventas" ? (
        /* ── Mobile / Tablet: Card-based layout for Venta report ── */
        <div style={{ overflowY: "auto", maxHeight: "62vh", padding: "8px 16px", backgroundColor: "var(--surface-2)", borderRadius: 12, border: "1px solid var(--border)" }}>
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
          {!loading && !error && rows.length === 0 && (
            <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--text-faint)", fontSize: 13, fontWeight: 500 }}>
              Sin registros en el periodo seleccionado.
            </div>
          )}

          {!loading &&
            !error &&
            rows.map((row, i) => {
              const isExpanded = expandedSales[i];
              return (
                <div
                  key={i}
                  style={{
                    backgroundColor: "var(--surface)",
                    border: "1px solid var(--border-soft)",
                    borderRadius: 16,
                    padding: 16,
                    marginBottom: 12,
                    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)",
                    textAlign: "left",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <span style={{ fontWeight: 700, color: "var(--accent-strong)", fontSize: 16 }}>
                          {row.invoiceNumber}
                        </span>
                        <span style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>
                          {money(row.totalAmount)}
                        </span>
                      </div>
                      <div style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 8, wordBreak: "break-word", overflowWrap: "anywhere", whiteSpace: "normal" }}>
                        {row.branch} · {row.cajero}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-secondary)", marginBottom: 6 }}>
                        <Calendar size={14} color="#2563eb" style={{ flexShrink: 0 }} />
                        <span style={{ wordBreak: "break-word", overflowWrap: "anywhere", whiteSpace: "normal" }}>
                          {fmtDate(row.createdAt)} {fmtTime(row.createdAt)}
                        </span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-secondary)" }}>
                        <User size={14} color="#2563eb" style={{ flexShrink: 0 }} />
                        <span style={{ wordBreak: "break-word", overflowWrap: "anywhere", whiteSpace: "normal" }}>
                          Cliente: {row.customer || "Público General"}
                        </span>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", alignSelf: "center" }}>
                      <button
                        onClick={() => toggleExpandSale(i)}
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
                        className="active-tap"
                      >
                        {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </button>
                    </div>
                  </div>
                  {isExpanded && (
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border-soft)" }}>
                      <div style={{
                        backgroundColor: "var(--surface-2)",
                        borderRadius: 12,
                        border: "1px solid var(--border)",
                        padding: 16,
                      }}>
                        <h4 style={{ fontSize: 13, fontWeight: 800, color: "var(--text)", marginBottom: 10 }}>Datos de la Venta</h4>
                        <div style={reportDetailRowStyle}>
                          <span style={reportDetailLabelStyle}>Folio:</span>
                          <span style={reportDetailValueStyle}>{row.invoiceNumber}</span>
                        </div>
                        <div style={reportDetailRowStyle}>
                          <span style={reportDetailLabelStyle}>Cajero:</span>
                          <span style={reportDetailValueStyle}>{row.cajero}</span>
                        </div>
                        <div style={reportDetailRowStyle}>
                          <span style={reportDetailLabelStyle}>Artículos:</span>
                          <span style={reportDetailValueStyle}>{row.items}</span>
                        </div>
                        <h4 style={{ fontSize: 13, fontWeight: 800, color: "var(--text)", marginTop: 16, marginBottom: 10 }}>Detalle de Operación</h4>
                        <div style={reportDetailRowStyle}>
                          <span style={reportDetailLabelStyle}>Fecha:</span>
                          <span style={reportDetailValueStyle}>{fmtDate(row.createdAt)} {fmtTime(row.createdAt)}</span>
                        </div>
                        <div style={reportDetailRowStyle}>
                          <span style={reportDetailLabelStyle}>Sucursal:</span>
                          <span style={reportDetailValueStyle}>{row.branch}</span>
                        </div>
                        <div style={reportDetailRowStyle}>
                          <span style={reportDetailLabelStyle}>Cliente:</span>
                          <span style={reportDetailValueStyle}>{row.customer || "Público General"}</span>
                        </div>
                        <h4 style={{ fontSize: 13, fontWeight: 800, color: "var(--text)", marginTop: 16, marginBottom: 10 }}>Resumen Económico</h4>
                        <div style={reportDetailRowStyle}>
                          <span style={reportDetailLabelStyle}>Subtotal:</span>
                          <span style={reportDetailValueStyle}>{money(row.subtotal)}</span>
                        </div>
                        <div style={reportDetailRowStyle}>
                          <span style={reportDetailLabelStyle}>Impuestos:</span>
                          <span style={reportDetailValueStyle}>{money(row.taxAmount)}</span>
                        </div>
                        <div style={reportDetailRowStyle}>
                          <span style={reportDetailLabelStyle}>Método:</span>
                          <span style={reportDetailValueStyle}>
                            <Badge tone={payTone(row.paymentMethod)}>{row.paymentMethod}</Badge>
                          </span>
                        </div>
                        <div style={reportDetailRowStyle}>
                          <span style={reportDetailLabelStyle}>Estado:</span>
                          <span style={reportDetailValueStyle}>
                            <Badge tone={statusTone(row.status)}>{row.status}</Badge>
                          </span>
                        </div>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 12 }}>
                          <span style={{ fontSize: 15, fontWeight: 800, color: "var(--text)" }}>Total:</span>
                          <span style={{ fontSize: 18, fontWeight: 800, color: "var(--accent-strong)" }}>{money(row.totalAmount)}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      ) : isMobile && def.key === "articulos" ? (
        /* ── Mobile / Tablet: Card-based layout for Artículos vendidos report ── */
        <div style={{ overflowY: "auto", maxHeight: "62vh", padding: "8px 16px", backgroundColor: "var(--surface-2)", borderRadius: 12, border: "1px solid var(--border)" }}>
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
          {!loading && !error && rows.length === 0 && (
            <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--text-faint)", fontSize: 13, fontWeight: 500 }}>
              Sin registros en el periodo seleccionado.
            </div>
          )}

          {!loading &&
            !error &&
            rows.map((row, i) => {
              const isExpanded = expandedSales[i];
              return (
                <div
                  key={i}
                  style={{
                    backgroundColor: "var(--surface)",
                    border: "1px solid var(--border-soft)",
                    borderRadius: 16,
                    padding: 16,
                    marginBottom: 12,
                    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)",
                    textAlign: "left",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <span style={{ fontWeight: 800, color: "var(--accent-strong)", fontSize: 14 }}>
                          #{row.rank} · <span style={{ fontFamily: "monospace", color: "var(--text-muted)", fontSize: 13 }}>{row.sku}</span>
                        </span>
                        <span style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>
                          {money(row.importe)}
                        </span>
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", marginBottom: 8, wordBreak: "break-word", overflowWrap: "anywhere", whiteSpace: "normal" }}>
                        {row.name}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-secondary)" }}>
                        <Package size={14} color="#2563eb" style={{ flexShrink: 0 }} />
                        <span>Cantidad vendida: <strong>{row.cantidad}</strong> unidades</span>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", alignSelf: "center" }}>
                      <button
                        onClick={() => toggleExpandSale(i)}
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
                        className="active-tap"
                      >
                        {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </button>
                    </div>
                  </div>
                  {isExpanded && (
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border-soft)" }}>
                      <div style={{
                        backgroundColor: "var(--surface-2)",
                        borderRadius: 12,
                        border: "1px solid var(--border)",
                        padding: 16,
                      }}>
                        <h4 style={{ fontSize: 13, fontWeight: 800, color: "var(--text)", marginBottom: 10 }}>Detalles del Producto</h4>
                        <div style={reportDetailRowStyle}>
                          <span style={reportDetailLabelStyle}>Nombre:</span>
                          <span style={reportDetailValueStyle}>{row.name}</span>
                        </div>
                        <div style={reportDetailRowStyle}>
                          <span style={reportDetailLabelStyle}>SKU:</span>
                          <span style={{ ...reportDetailValueStyle, fontFamily: "monospace" }}>{row.sku}</span>
                        </div>
                        <div style={reportDetailRowStyle}>
                          <span style={reportDetailLabelStyle}>Ranking:</span>
                          <span style={reportDetailValueStyle}>#{row.rank}</span>
                        </div>
                        <div style={reportDetailRowStyle}>
                          <span style={reportDetailLabelStyle}>Unidades:</span>
                          <span style={reportDetailValueStyle}>{row.cantidad} uds</span>
                        </div>
                        <div style={reportDetailRowStyle}>
                          <span style={reportDetailLabelStyle}>Transacciones:</span>
                          <span style={reportDetailValueStyle}>{row.transacciones}</span>
                        </div>
                        <div style={reportDetailRowStyle}>
                          <span style={reportDetailLabelStyle}>Precio prom.:</span>
                          <span style={reportDetailValueStyle}>{money(row.precioPromedio)}</span>
                        </div>
                        <div style={reportDetailRowStyle}>
                          <span style={reportDetailLabelStyle}>Utilidad:</span>
                          <span style={{ ...reportDetailValueStyle, color: "#16a34a", fontWeight: 700 }}>{money(row.utilidad)}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 12 }}>
                          <span style={{ fontSize: 15, fontWeight: 800, color: "var(--text)" }}>Importe Total:</span>
                          <span style={{ fontSize: 18, fontWeight: 800, color: "var(--accent-strong)" }}>{money(row.importe)}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      ) : isMobile && def.key === "existencias" ? (
        /* ── Mobile: Inventario-style card layout for Existencias report ── */
        <div style={{ overflowY: "auto", maxHeight: "62vh", padding: "8px 16px", backgroundColor: "var(--surface-2)", borderRadius: 12, border: "1px solid var(--border)" }}>
          {loading && <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--text-faint)", fontSize: 13, fontWeight: 500 }}>Cargando información...</div>}
          {error && <div style={{ textAlign: "center", padding: "32px 16px", color: "#b91c1c", fontSize: 13, fontWeight: 500 }}>{error}</div>}
          {!loading && !error && rows.length === 0 && <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--text-faint)", fontSize: 13, fontWeight: 500 }}>Sin registros.</div>}

          {!loading && !error && rows.map((row, i) => {
            const isExpanded = expandedSales[i];
            return (
              <div key={i} style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 16, padding: 16, marginBottom: 12, boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03)", textAlign: "left" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <span style={{ fontFamily: "monospace", fontWeight: 700, color: "var(--text-muted)", fontSize: 12, wordBreak: "break-word", overflowWrap: "anywhere" }}>{row.sku}</span>
                      <span style={{ flexShrink: 0, marginLeft: 8 }}>{getCell(row, "estado")}</span>
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", marginBottom: 8, wordBreak: "break-word", overflowWrap: "anywhere", whiteSpace: "normal" }}>
                      {row.name}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-secondary)", marginBottom: 4 }}>
                      <Layers size={14} color="#2563eb" style={{ flexShrink: 0 }} />
                      <span>Stock: <strong>{row.stock}</strong> uds · Mínimo: <strong>{row.minStock}</strong></span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-secondary)" }}>
                      <TrendingUp size={14} color="#16a34a" style={{ flexShrink: 0 }} />
                      <span>Precio venta: <strong>{getCell(row, "sellPrice")}</strong></span>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", alignSelf: "center" }}>
                    <button onClick={() => toggleExpandSale(i)} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", backgroundColor: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: 8, width: 38, height: 38, cursor: "pointer", color: "var(--accent)", padding: 0 }} className="active-tap">
                      {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </button>
                  </div>
                </div>
                {isExpanded && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border-soft)" }}>
                    <div style={{ backgroundColor: "var(--surface-2)", borderRadius: 12, border: "1px solid var(--border)", padding: 16 }}>
                      <h4 style={{ fontSize: 13, fontWeight: 800, color: "var(--text)", marginBottom: 10 }}>Detalles de Inventario</h4>
                      <div style={reportDetailRowStyle}><span style={reportDetailLabelStyle}>SKU:</span><span style={{ ...reportDetailValueStyle, fontFamily: "monospace" }}>{row.sku}</span></div>
                      <div style={reportDetailRowStyle}><span style={reportDetailLabelStyle}>Nombre:</span><span style={reportDetailValueStyle}>{row.name}</span></div>
                      <div style={reportDetailRowStyle}><span style={reportDetailLabelStyle}>Stock actual:</span><span style={reportDetailValueStyle}>{row.stock} uds</span></div>
                      <div style={reportDetailRowStyle}><span style={reportDetailLabelStyle}>Stock mínimo:</span><span style={reportDetailValueStyle}>{row.minStock} uds</span></div>
                      <div style={reportDetailRowStyle}><span style={reportDetailLabelStyle}>Costo:</span><span style={reportDetailValueStyle}>{getCell(row, "costPrice")}</span></div>
                      <div style={reportDetailRowStyle}><span style={reportDetailLabelStyle}>Precio venta:</span><span style={reportDetailValueStyle}>{getCell(row, "sellPrice")}</span></div>
                      <div style={reportDetailRowStyle}><span style={reportDetailLabelStyle}>Estado:</span><span style={reportDetailValueStyle}>{getCell(row, "estado")}</span></div>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 12 }}>
                        <span style={{ fontSize: 15, fontWeight: 800, color: "var(--text)" }}>Valor inventario:</span>
                        <span style={{ fontSize: 18, fontWeight: 800, color: "var(--accent-strong)" }}>{getCell(row, "valor")}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : isMobile && def.key === "kardex" ? (
        /* ── Mobile: Inventario-style card layout for Kardex report ── */
        <div style={{ overflowY: "auto", maxHeight: "62vh", padding: "8px 16px", backgroundColor: "var(--surface-2)", borderRadius: 12, border: "1px solid var(--border)" }}>
          {loading && <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--text-faint)", fontSize: 13, fontWeight: 500 }}>Cargando información...</div>}
          {error && <div style={{ textAlign: "center", padding: "32px 16px", color: "#b91c1c", fontSize: 13, fontWeight: 500 }}>{error}</div>}
          {!loading && !error && rows.length === 0 && <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--text-faint)", fontSize: 13, fontWeight: 500 }}>Sin registros en el periodo seleccionado.</div>}

          {!loading && !error && rows.map((row, i) => {
            const isExpanded = expandedSales[i];
            const isPos = row.quantityChange > 0;
            const isNeg = row.quantityChange < 0;
            return (
              <div key={i} style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 16, padding: 16, marginBottom: 12, boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03)", textAlign: "left" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <span style={{ fontFamily: "monospace", fontWeight: 700, color: "var(--text-muted)", fontSize: 12, wordBreak: "break-word", overflowWrap: "anywhere" }}>{row.sku}</span>
                      <span style={{ flexShrink: 0, marginLeft: 8 }}>{getCell(row, "movementType")}</span>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 8, wordBreak: "break-word", overflowWrap: "anywhere", whiteSpace: "normal" }}>
                      {row.product}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-secondary)", marginBottom: 4 }}>
                      {isPos ? <TrendingUp size={14} color="#16a34a" style={{ flexShrink: 0 }} /> : isNeg ? <TrendingDown size={14} color="#dc2626" style={{ flexShrink: 0 }} /> : <ArrowUpDown size={14} color="#64748b" style={{ flexShrink: 0 }} />}
                      <span style={{ color: isPos ? "#16a34a" : isNeg ? "#dc2626" : "#475569", fontWeight: 700 }}>
                        {isPos ? `+${row.quantityChange}` : row.quantityChange} uds
                      </span>
                      <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>· Saldo: <strong style={{ color: "var(--text)" }}>{row.balanceAfter}</strong></span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-secondary)" }}>
                      <Activity size={14} color="#2563eb" style={{ flexShrink: 0 }} />
                      <span style={{ wordBreak: "break-word", overflowWrap: "anywhere", whiteSpace: "normal" }}>{getCell(row, "createdAt")}</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", alignSelf: "center" }}>
                    <button onClick={() => toggleExpandSale(i)} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", backgroundColor: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: 8, width: 38, height: 38, cursor: "pointer", color: "var(--accent)", padding: 0 }} className="active-tap">
                      {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </button>
                  </div>
                </div>
                {isExpanded && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border-soft)" }}>
                    <div style={{ backgroundColor: "var(--surface-2)", borderRadius: 12, border: "1px solid var(--border)", padding: 16 }}>
                      <h4 style={{ fontSize: 13, fontWeight: 800, color: "var(--text)", marginBottom: 10 }}>Detalles del Movimiento</h4>
                      <div style={reportDetailRowStyle}><span style={reportDetailLabelStyle}>SKU:</span><span style={{ ...reportDetailValueStyle, fontFamily: "monospace" }}>{row.sku}</span></div>
                      <div style={reportDetailRowStyle}><span style={reportDetailLabelStyle}>Producto:</span><span style={reportDetailValueStyle}>{row.product}</span></div>
                      <div style={reportDetailRowStyle}><span style={reportDetailLabelStyle}>Tipo:</span><span style={reportDetailValueStyle}>{getCell(row, "movementType")}</span></div>
                      <div style={reportDetailRowStyle}><span style={reportDetailLabelStyle}>Cambio:</span><span style={{ ...reportDetailValueStyle, color: isPos ? "#16a34a" : isNeg ? "#dc2626" : "#475569", fontWeight: 700 }}>{isPos ? `+${row.quantityChange}` : row.quantityChange} uds</span></div>
                      <div style={reportDetailRowStyle}><span style={reportDetailLabelStyle}>Saldo:</span><span style={reportDetailValueStyle}>{row.balanceAfter} uds</span></div>
                      <div style={reportDetailRowStyle}><span style={reportDetailLabelStyle}>Fecha:</span><span style={reportDetailValueStyle}>{getCell(row, "createdAt")}</span></div>
                      <div style={reportDetailRowStyle}><span style={reportDetailLabelStyle}>Sucursal:</span><span style={reportDetailValueStyle}>{getCell(row, "branch")}</span></div>
                      <div style={reportDetailRowStyle}><span style={reportDetailLabelStyle}>Usuario:</span><span style={reportDetailValueStyle}>{getCell(row, "user")}</span></div>
                      <div style={{ marginTop: 8 }}>
                        <div style={{ ...reportDetailLabelStyle, display: "block", marginBottom: 4 }}>Referencia / Motivo:</div>
                        <div style={{ ...reportDetailValueStyle, padding: "6px 8px", backgroundColor: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, minHeight: 32, display: "block" }}>{row.reason || "—"}</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : isMobile && def.key === "compras" ? (
        /* ── Mobile: Inventario-style card layout for Compras report ── */
        <div style={{ overflowY: "auto", maxHeight: "62vh", padding: "8px 16px", backgroundColor: "var(--surface-2)", borderRadius: 12, border: "1px solid var(--border)" }}>
          {loading && <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--text-faint)", fontSize: 13, fontWeight: 500 }}>Cargando información...</div>}
          {error && <div style={{ textAlign: "center", padding: "32px 16px", color: "#b91c1c", fontSize: 13, fontWeight: 500 }}>{error}</div>}
          {!loading && !error && rows.length === 0 && <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--text-faint)", fontSize: 13, fontWeight: 500 }}>Sin registros en el periodo seleccionado.</div>}

          {!loading && !error && rows.map((row, i) => {
            const isExpanded = expandedSales[i];
            return (
              <div key={i} style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 16, padding: 16, marginBottom: 12, boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03)", textAlign: "left" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <span style={{ fontFamily: "monospace", fontWeight: 700, color: "var(--text-muted)", fontSize: 12, wordBreak: "break-word", overflowWrap: "anywhere" }}>{row.reference}</span>
                      <span style={{ flexShrink: 0, marginLeft: 8 }}>{getCell(row, "status")}</span>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 8, wordBreak: "break-word", overflowWrap: "anywhere", whiteSpace: "normal" }}>
                      {getCell(row, "supplier")}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-secondary)", marginBottom: 4 }}>
                      <Calendar size={14} color="#2563eb" style={{ flexShrink: 0 }} />
                      <span style={{ wordBreak: "break-word", overflowWrap: "anywhere" }}>{getCell(row, "purchaseDate")}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-secondary)" }}>
                      <TrendingUp size={14} color="#16a34a" style={{ flexShrink: 0 }} />
                      <span>Total: <strong>{getCell(row, "total")}</strong></span>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", alignSelf: "center" }}>
                    <button onClick={() => toggleExpandSale(i)} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", backgroundColor: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: 8, width: 38, height: 38, cursor: "pointer", color: "var(--accent)", padding: 0 }} className="active-tap">
                      {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </button>
                  </div>
                </div>
                {isExpanded && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border-soft)" }}>
                    <div style={{ backgroundColor: "var(--surface-2)", borderRadius: 12, border: "1px solid var(--border)", padding: 16 }}>
                      <h4 style={{ fontSize: 13, fontWeight: 800, color: "var(--text)", marginBottom: 10 }}>Desglose de Compra</h4>
                      <div style={reportDetailRowStyle}><span style={reportDetailLabelStyle}>Referencia:</span><span style={{ ...reportDetailValueStyle, fontFamily: "monospace" }}>{row.reference}</span></div>
                      <div style={reportDetailRowStyle}><span style={reportDetailLabelStyle}>Proveedor:</span><span style={reportDetailValueStyle}>{getCell(row, "supplier")}</span></div>
                      <div style={reportDetailRowStyle}><span style={reportDetailLabelStyle}>Fecha:</span><span style={reportDetailValueStyle}>{getCell(row, "purchaseDate")}</span></div>
                      <div style={reportDetailRowStyle}><span style={reportDetailLabelStyle}>Estado:</span><span style={reportDetailValueStyle}>{getCell(row, "status")}</span></div>
                      <div style={reportDetailRowStyle}><span style={reportDetailLabelStyle}>Sucursal:</span><span style={reportDetailValueStyle}>{getCell(row, "branch")}</span></div>
                      <div style={reportDetailRowStyle}><span style={reportDetailLabelStyle}>Subtotal:</span><span style={reportDetailValueStyle}>{getCell(row, "subtotal")}</span></div>
                      <div style={reportDetailRowStyle}><span style={reportDetailLabelStyle}>Impuestos:</span><span style={reportDetailValueStyle}>{getCell(row, "tax")}</span></div>
                      <div style={reportDetailRowStyle}><span style={reportDetailLabelStyle}>Registró:</span><span style={reportDetailValueStyle}>{getCell(row, "createdByUser")}</span></div>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 12 }}>
                        <span style={{ fontSize: 15, fontWeight: 800, color: "var(--text)" }}>Total:</span>
                        <span style={{ fontSize: 18, fontWeight: 800, color: "var(--accent-strong)" }}>{getCell(row, "total")}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : isMobile && def.key === "operaciones" ? (
        /* ── Mobile: Inventario-style card layout for Operaciones del vendedor ── */
        <div style={{ overflowY: "auto", maxHeight: "62vh", padding: "8px 16px", backgroundColor: "var(--surface-2)", borderRadius: 12, border: "1px solid var(--border)" }}>
          {loading && <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--text-faint)", fontSize: 13, fontWeight: 500 }}>Cargando información...</div>}
          {error && <div style={{ textAlign: "center", padding: "32px 16px", color: "#b91c1c", fontSize: 13, fontWeight: 500 }}>{error}</div>}
          {!loading && !error && rows.length === 0 && <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--text-faint)", fontSize: 13, fontWeight: 500 }}>Sin registros en el periodo seleccionado.</div>}

          {!loading && !error && rows.map((row, i) => {
            const isExpanded = expandedSales[i];
            return (
              <div key={i} style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 16, padding: 16, marginBottom: 12, boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03)", textAlign: "left" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <span style={{ fontWeight: 800, color: "var(--accent-strong)", fontSize: 13, wordBreak: "break-word", overflowWrap: "anywhere" }}>{row.name}</span>
                      <span style={{ flexShrink: 0, marginLeft: 8 }}>{getCell(row, "role")}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8, wordBreak: "break-word", overflowWrap: "anywhere", whiteSpace: "normal" }}>
                      {row.branch || "Sin sucursal"}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-secondary)", marginBottom: 4 }}>
                      <Activity size={14} color="#2563eb" style={{ flexShrink: 0 }} />
                      <span><strong>{row.ventasCount}</strong> ventas realizadas</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-secondary)" }}>
                      <TrendingUp size={14} color="#16a34a" style={{ flexShrink: 0 }} />
                      <span>Total vendido: <strong>{getCell(row, "totalVendido")}</strong></span>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", alignSelf: "center" }}>
                    <button onClick={() => toggleExpandSale(i)} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", backgroundColor: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: 8, width: 38, height: 38, cursor: "pointer", color: "var(--accent)", padding: 0 }} className="active-tap">
                      {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </button>
                  </div>
                </div>
                {isExpanded && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border-soft)" }}>
                    <div style={{ backgroundColor: "var(--surface-2)", borderRadius: 12, border: "1px solid var(--border)", padding: 16 }}>
                      <h4 style={{ fontSize: 13, fontWeight: 800, color: "var(--text)", marginBottom: 10 }}>Métricas del Vendedor</h4>
                      <div style={reportDetailRowStyle}><span style={reportDetailLabelStyle}>Nombre:</span><span style={reportDetailValueStyle}>{row.name}</span></div>
                      <div style={reportDetailRowStyle}><span style={reportDetailLabelStyle}>Sucursal:</span><span style={reportDetailValueStyle}>{row.branch || "—"}</span></div>
                      <div style={reportDetailRowStyle}><span style={reportDetailLabelStyle}>Rol:</span><span style={reportDetailValueStyle}>{getCell(row, "role")}</span></div>
                      <div style={reportDetailRowStyle}><span style={reportDetailLabelStyle}>Ventas:</span><span style={reportDetailValueStyle}>{row.ventasCount}</span></div>
                      <div style={reportDetailRowStyle}><span style={reportDetailLabelStyle}>Devoluciones:</span><span style={reportDetailValueStyle}>{row.devolucionesCount}</span></div>
                      <div style={reportDetailRowStyle}><span style={reportDetailLabelStyle}>Cancelaciones:</span><span style={reportDetailValueStyle}>{row.canceladas}</span></div>
                      <div style={reportDetailRowStyle}><span style={reportDetailLabelStyle}>Comisión:</span><span style={{ ...reportDetailValueStyle, color: "#16a34a", fontWeight: 700 }}>{getCell(row, "comision")}</span></div>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 12 }}>
                        <span style={{ fontSize: 15, fontWeight: 800, color: "var(--text)" }}>Total vendido:</span>
                        <span style={{ fontSize: 18, fontWeight: 800, color: "var(--accent-strong)" }}>{getCell(row, "totalVendido")}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : isMobile && def.key === "ventas-usuario" ? (
        /* ── Mobile: Inventario-style card layout for Ventas del usuario ── */
        <div style={{ overflowY: "auto", maxHeight: "62vh", padding: "8px 16px", backgroundColor: "var(--surface-2)", borderRadius: 12, border: "1px solid var(--border)" }}>
          {loading && <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--text-faint)", fontSize: 13, fontWeight: 500 }}>Cargando información...</div>}
          {error && <div style={{ textAlign: "center", padding: "32px 16px", color: "#b91c1c", fontSize: 13, fontWeight: 500 }}>{error}</div>}
          {!loading && !error && rows.length === 0 && <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--text-faint)", fontSize: 13, fontWeight: 500 }}>Sin registros en el periodo seleccionado.</div>}

          {!loading && !error && rows.map((row, i) => {
            const isExpanded = expandedSales[i];
            return (
              <div key={i} style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 16, padding: 16, marginBottom: 12, boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03)", textAlign: "left" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <span style={{ fontWeight: 800, color: "var(--accent-strong)", fontSize: 13, wordBreak: "break-word", overflowWrap: "anywhere" }}>{row.name}</span>
                      <span style={{ flexShrink: 0, marginLeft: 8 }}>{getCell(row, "role")}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8, wordBreak: "break-word", overflowWrap: "anywhere", whiteSpace: "normal" }}>
                      {row.branch || "Sin sucursal"}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-secondary)", marginBottom: 4 }}>
                      <Activity size={14} color="#2563eb" style={{ flexShrink: 0 }} />
                      <span><strong>{row.ventasCount}</strong> tickets realizados</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-secondary)" }}>
                      <TrendingUp size={14} color="#16a34a" style={{ flexShrink: 0 }} />
                      <span>Importe: <strong>{getCell(row, "totalVendido")}</strong></span>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", alignSelf: "center" }}>
                    <button onClick={() => toggleExpandSale(i)} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", backgroundColor: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: 8, width: 38, height: 38, cursor: "pointer", color: "var(--accent)", padding: 0 }} className="active-tap">
                      {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </button>
                  </div>
                </div>
                {isExpanded && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border-soft)" }}>
                    <div style={{ backgroundColor: "var(--surface-2)", borderRadius: 12, border: "1px solid var(--border)", padding: 16 }}>
                      <h4 style={{ fontSize: 13, fontWeight: 800, color: "var(--text)", marginBottom: 10 }}>Resumen del Usuario</h4>
                      <div style={reportDetailRowStyle}><span style={reportDetailLabelStyle}>Nombre:</span><span style={reportDetailValueStyle}>{row.name}</span></div>
                      <div style={reportDetailRowStyle}><span style={reportDetailLabelStyle}>Sucursal:</span><span style={reportDetailValueStyle}>{row.branch || "—"}</span></div>
                      <div style={reportDetailRowStyle}><span style={reportDetailLabelStyle}>Rol:</span><span style={reportDetailValueStyle}>{getCell(row, "role")}</span></div>
                      <div style={reportDetailRowStyle}><span style={reportDetailLabelStyle}>Tickets:</span><span style={reportDetailValueStyle}>{row.ventasCount}</span></div>
                      <div style={reportDetailRowStyle}><span style={reportDetailLabelStyle}>Prom. ticket:</span><span style={reportDetailValueStyle}>{getCell(row, "ticketPromedio")}</span></div>
                      <div style={reportDetailRowStyle}><span style={reportDetailLabelStyle}>Descuentos:</span><span style={reportDetailValueStyle}>{getCell(row, "descuentos")}</span></div>
                      <div style={reportDetailRowStyle}><span style={reportDetailLabelStyle}>Cancelaciones:</span><span style={reportDetailValueStyle}>{getCell(row, "canceladas")}</span></div>
                      <div style={reportDetailRowStyle}><span style={reportDetailLabelStyle}>Devoluciones:</span><span style={reportDetailValueStyle}>{getCell(row, "devolucionesCount")}</span></div>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 12 }}>
                        <span style={{ fontSize: 15, fontWeight: 800, color: "var(--text)" }}>Importe vendido:</span>
                        <span style={{ fontSize: 18, fontWeight: 800, color: "var(--accent-strong)" }}>{getCell(row, "totalVendido")}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : isMobile ? (
        /* ── Mobile Fallback: Generic Card-based layout for any other reports ── */
        <div style={{ overflowY: "auto", maxHeight: "62vh", padding: "8px 16px", backgroundColor: "var(--surface-2)", borderRadius: 12, border: "1px solid var(--border)" }}>
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
          {!loading && !error && rows.length === 0 && (
            <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--text-faint)", fontSize: 13, fontWeight: 500 }}>
              Sin registros en el periodo seleccionado.
            </div>
          )}

          {!loading &&
            !error &&
            rows.map((row, i) => (
              <div
                key={i}
                style={{
                  backgroundColor: "var(--surface)",
                  border: "1px solid var(--border-soft)",
                  borderRadius: 16,
                  padding: 16,
                  marginBottom: 12,
                  boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)",
                  textAlign: "left",
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {cols.map((c) => (
                    <div key={c.key} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.3px" }}>
                        {c.label}
                      </span>
                      <span style={{ fontSize: 14, color: "var(--text-secondary)", fontWeight: 600 }}>
                        {renderCell(c, row)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
        </div>
      ) : (
        /* ── Standard Dynamic Table ── */
        <div
          className="table-sticky-head"
          style={{
            ...ui.tableWrap,
            overflowX: "auto",
            overflowY: "auto",
            maxHeight: "62vh",
            width: "100%",
            maxWidth: "100%",
          }}
        >
          <table style={{ ...ui.table, width: "100%", tableLayout: "auto", minWidth: "max-content" }}>
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
                      <td
                        key={c.key}
                        style={{
                          ...ui.td,
                          textAlign: c.align ?? "left",
                          whiteSpace: "normal",
                          overflowWrap: "anywhere",
                          wordBreak: "break-word",
                          maxWidth: c.width ? c.width : c.key === "reason" ? 240 : undefined,
                        }}
                      >
                        {renderCell(c, row)}
                      </td>
                    ))}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Paginación */}
      {res?.pagination && (
        <div style={{
          display: "flex",
          flexDirection: isMobile ? "column" : "row",
          alignItems: isMobile ? "stretch" : "center",
          justifyContent: "space-between",
          gap: isMobile ? 10 : 0,
          padding: isMobile ? "10px 12px" : "12px 16px",
          backgroundColor: "var(--surface)",
          border: "1px solid var(--border)",
          borderTop: "none",
          borderBottomLeftRadius: 12,
          borderBottomRightRadius: 12,
          fontSize: 13,
          color: "#475569",
          width: "100%",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span>Mostrar</span>
            <select
              style={{
                padding: "4px 8px",
                borderRadius: 4,
                border: "1px solid var(--border-strong)",
                backgroundColor: "var(--surface)",
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
            <span>por pág.</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: isMobile ? "space-between" : "flex-end", gap: 8 }}>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              Pág. <strong>{res.pagination.page}</strong> / <strong>{res.pagination.totalPages || 1}</strong>{!isMobile && <> ({res.pagination.total} registros)</>}
            </span>
            <div style={{ display: "flex", gap: 4 }}>
              <button
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 34,
                  height: 34,
                  padding: 0,
                  borderRadius: 8,
                  border: "1px solid var(--border-strong)",
                  backgroundColor: res.pagination.hasPreviousPage ? "#ffffff" : "#f1f5f9",
                  color: res.pagination.hasPreviousPage ? "#0f172a" : "#94a3b8",
                  cursor: res.pagination.hasPreviousPage ? "pointer" : "default",
                  outline: "none"
                }}
                className="active-tap"
                disabled={!res.pagination.hasPreviousPage || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                title="Página anterior"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 34,
                  height: 34,
                  padding: 0,
                  borderRadius: 8,
                  border: "1px solid var(--border-strong)",
                  backgroundColor: res.pagination.hasNextPage ? "#ffffff" : "#f1f5f9",
                  color: res.pagination.hasNextPage ? "#0f172a" : "#94a3b8",
                  cursor: res.pagination.hasNextPage ? "pointer" : "default",
                  outline: "none"
                }}
                className="active-tap"
                disabled={!res.pagination.hasNextPage || loading}
                onClick={() => setPage((p) => p + 1)}
                title="Página siguiente"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportRunner;