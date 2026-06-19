import React, { useEffect, useState, useCallback } from "react";
import { Printer, RefreshCw, CalendarClock, ChevronDown, ChevronUp, ChevronLeft, ChevronRight } from "lucide-react";
import api from "../../../services/api";
import { validateSearchText } from "../../../utils/formValidation";
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
import { type ReportDef, type ReportFilters, type Column, formatForPrint } from "./reportConfig";
import {
  CUSTOM_REPORT_PERIOD,
  REPORT_PERIOD_OPTIONS,
  daysAgoInputValue,
  formatReportRangeLabel,
  getReportDateRange,
  isReportPeriod,
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
    if (!isReportPeriod(period)) {
      setRes(null);
      setRows([]);
      setError("Selecciona un periodo valido.");
      setLoading(false);
      return;
    }
    const searchError = has("search")
      ? validateSearchText(filters.search, "La busqueda", { max: 120 })
      : undefined;
    if (searchError) {
      setRes(null);
      setRows([]);
      setError(searchError);
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
  }, [def, branchId, filters.from, filters.to, filters.status, filters.movementType, filters.search, period, page, pageSize]);

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
  const searchError = has("search")
    ? validateSearchText(filters.search, "La busqueda", { max: 120 })
    : undefined;

  const setFilter = (k: keyof ReportFilters, v: string) => {
    setPage(1);
    setFilters((f) => ({ ...f, [k]: v }));
  };

  const setDateFilter = (k: "from" | "to", v: string) => {
    setPeriod(CUSTOM_REPORT_PERIOD);
    setFilter(k, v);
  };

  const handlePeriodChange = (value: string) => {
    if (!isReportPeriod(value)) {
      setError("Selecciona un periodo valido.");
      return;
    }
    const nextPeriod: ReportPeriod = value;
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
                max={filters.to || undefined}
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
                min={filters.from || undefined}
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
        {has("search") && (
          <SearchInput
            value={filters.search}
            onChange={(v) => setFilter("search", v)}
            placeholder="Buscar..."
            maxLength={120}
          />
        )}

        <button
          style={{ ...ui.primaryBtn }}
          className="active-tap"
          onClick={load}
          disabled={loading || Boolean(dateRangeError) || Boolean(searchError)}
          title="Actualizar"
        >
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
        <div style={{ ...ui.kpiGrid, gridTemplateColumns: isMobile ? `repeat(2, 1fr)` : `repeat(${Math.min(kpis.length, 6)}, 1fr)`, marginBottom: 20 }}>
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
        <div style={{ overflowY: "auto", maxHeight: "62vh", padding: "8px 16px", backgroundColor: "#f8fafc", borderRadius: 12, border: "1px solid #e2e8f0" }}>
          {loading && (
            <div style={{ textAlign: "center", padding: "32px 16px", color: "#94a3b8", fontSize: 13, fontWeight: 500 }}>
              Cargando información...
            </div>
          )}
          {error && (
            <div style={{ textAlign: "center", padding: "32px 16px", color: "#b91c1c", fontSize: 13, fontWeight: 500 }}>
              {error}
            </div>
          )}
          {!loading && !error && rows.length === 0 && (
            <div style={{ textAlign: "center", padding: "32px 16px", color: "#94a3b8", fontSize: 13, fontWeight: 500 }}>
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
                    backgroundColor: "#ffffff",
                    border: "1px solid #e2e8f0",
                    borderRadius: 12,
                    marginBottom: 10,
                    boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
                    overflow: "hidden",
                    textAlign: "left",
                  }}
                >
                  {/* Header: Folio y Estatus */}
                  <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "8px 16px 6px 16px",
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#64748b",
                    borderBottom: "1px solid #f1f5f9",
                    backgroundColor: "#f8fafc",
                    letterSpacing: "0.2px",
                  }}>
                    <span style={{ fontFamily: "monospace", color: "#64748b" }}>{row.invoiceNumber}</span>
                    <Badge tone={statusTone(row.status)}>
                      {row.status}
                    </Badge>
                  </div>

                  {/* Fila principal */}
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "1.5fr 2fr 1.5fr 0.8fr",
                    padding: "12px 16px",
                    alignItems: "center",
                  }}>
                    {/* Cliente */}
                    <div style={{ fontWeight: 700, fontSize: 13, color: "#1e3a8a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {row.customer || "Público General"}
                    </div>

                    {/* Fecha */}
                    <div style={{ fontSize: 13, color: "#334155" }}>
                      {fmtDate(row.createdAt)} <span style={{ color: "#94a3b8" }}>{fmtTime(row.createdAt)}</span>
                    </div>

                    {/* Total */}
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>
                      {money(row.totalAmount)}
                    </div>

                    {/* Chevron */}
                    <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center" }}>
                      <button
                        onClick={() => toggleExpandSale(i)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: "#ffffff",
                          border: "1px solid #cbd5e1",
                          borderRadius: 8,
                          width: 34,
                          height: 34,
                          cursor: "pointer",
                          color: "#64748b",
                          padding: 0,
                        }}
                        className="active-tap"
                      >
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                    </div>
                  </div>

                  {/* Detalle expandido */}
                  {isExpanded && (
                    <div style={{
                      padding: "16px",
                      margin: "0 16px 16px 16px",
                      backgroundColor: "#f8fafc",
                      borderRadius: "8px",
                      border: "1px solid #e2e8f0",
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                      gap: "16px",
                    }}>
                      {/* Datos de la Venta */}
                      <div>
                        <h4 style={{ fontSize: 13, fontWeight: 800, color: "#0f172a", marginBottom: 10 }}>Datos de la Venta</h4>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12 }}>
                          <span style={{ color: "#64748b", fontWeight: 600 }}>Folio:</span>
                          <span style={{ color: "#334155", fontWeight: 700 }}>{row.invoiceNumber}</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12 }}>
                          <span style={{ color: "#64748b", fontWeight: 600 }}>Sucursal:</span>
                          <span style={{ color: "#334155", fontWeight: 700 }}>{row.branch}</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12 }}>
                          <span style={{ color: "#64748b", fontWeight: 600 }}>Vendedor:</span>
                          <span style={{ color: "#334155", fontWeight: 700 }}>{row.cajero}</span>
                        </div>
                      </div>

                      {/* Detalles Económicos */}
                      <div>
                        <h4 style={{ fontSize: 13, fontWeight: 800, color: "#0f172a", marginBottom: 10 }}>Detalles Económicos</h4>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12 }}>
                          <span style={{ color: "#64748b", fontWeight: 600 }}>Subtotal:</span>
                          <span style={{ color: "#334155", fontWeight: 700 }}>{money(row.subtotal)}</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12 }}>
                          <span style={{ color: "#64748b", fontWeight: 600 }}>Impuestos:</span>
                          <span style={{ color: "#334155", fontWeight: 700 }}>{money(row.taxAmount)}</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12 }}>
                          <span style={{ color: "#64748b", fontWeight: 600 }}>Método de Pago:</span>
                          <Badge tone={payTone(row.paymentMethod)}>{row.paymentMethod}</Badge>
                        </div>
                      </div>

                      {/* Artículos */}
                      <div>
                        <h4 style={{ fontSize: 13, fontWeight: 800, color: "#0f172a", marginBottom: 10 }}>Artículos</h4>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12 }}>
                          <span style={{ color: "#64748b", fontWeight: 600 }}>Cantidad:</span>
                          <span style={{ color: "#334155", fontWeight: 700 }}>{row.items} artículos</span>
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
        <div style={{ overflowY: "auto", maxHeight: "62vh", padding: "8px 16px", backgroundColor: "#f8fafc", borderRadius: 12, border: "1px solid #e2e8f0" }}>
          {loading && (
            <div style={{ textAlign: "center", padding: "32px 16px", color: "#94a3b8", fontSize: 13, fontWeight: 500 }}>
              Cargando información...
            </div>
          )}
          {error && (
            <div style={{ textAlign: "center", padding: "32px 16px", color: "#b91c1c", fontSize: 13, fontWeight: 500 }}>
              {error}
            </div>
          )}
          {!loading && !error && rows.length === 0 && (
            <div style={{ textAlign: "center", padding: "32px 16px", color: "#94a3b8", fontSize: 13, fontWeight: 500 }}>
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
                    backgroundColor: "#ffffff",
                    border: "1px solid #e2e8f0",
                    borderRadius: 12,
                    marginBottom: 10,
                    boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
                    overflow: "hidden",
                    textAlign: "left",
                  }}
                >
                  {/* Header: Ranking y SKU */}
                  <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "8px 16px 6px 16px",
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#64748b",
                    borderBottom: "1px solid #f1f5f9",
                    backgroundColor: "#f8fafc",
                    letterSpacing: "0.2px",
                  }}>
                    <span style={{ color: "#1e3a8a", fontWeight: 800, fontSize: 12 }}>#{row.rank}</span>
                    <span style={{ fontFamily: "monospace", color: "#64748b", fontSize: 11 }}>{row.sku}</span>
                  </div>

                  {/* Fila principal: Producto, Cantidad, Importe, Chevron */}
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "2fr 1fr 1.5fr 0.6fr",
                    padding: "12px 16px",
                    alignItems: "center",
                    gap: 8,
                  }}>
                    {/* Producto */}
                    <div style={{ fontWeight: 700, fontSize: 13, color: "#1e3a8a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {row.name}
                    </div>

                    {/* Cantidad */}
                    <div style={{ fontSize: 13, color: "#334155", textAlign: "center", fontWeight: 600 }}>
                      {row.cantidad} <span style={{ color: "#94a3b8", fontSize: 11 }}>uds</span>
                    </div>

                    {/* Importe */}
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", textAlign: "right" }}>
                      {money(row.importe)}
                    </div>

                    {/* Chevron */}
                    <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center" }}>
                      <button
                        onClick={() => toggleExpandSale(i)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: "#ffffff",
                          border: "1px solid #cbd5e1",
                          borderRadius: 8,
                          width: 34,
                          height: 34,
                          cursor: "pointer",
                          color: "#64748b",
                          padding: 0,
                        }}
                        className="active-tap"
                      >
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                    </div>
                  </div>

                  {/* Detalle expandido */}
                  {isExpanded && (
                    <div style={{
                      padding: "16px",
                      margin: "0 16px 16px 16px",
                      backgroundColor: "#f8fafc",
                      borderRadius: "8px",
                      border: "1px solid #e2e8f0",
                    }}>
                      <h4 style={{ fontSize: 13, fontWeight: 800, color: "#0f172a", marginBottom: 10 }}>Detalles del Producto</h4>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12 }}>
                        <span style={{ color: "#64748b", fontWeight: 600 }}>Transacciones:</span>
                        <span style={{ color: "#334155", fontWeight: 700 }}>{row.transacciones}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12 }}>
                        <span style={{ color: "#64748b", fontWeight: 600 }}>Precio promedio:</span>
                        <span style={{ color: "#334155", fontWeight: 700 }}>{money(row.precioPromedio)}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12 }}>
                        <span style={{ color: "#64748b", fontWeight: 600 }}>Utilidad:</span>
                        <span style={{ color: "#16a34a", fontWeight: 700 }}>{money(row.utilidad)}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      ) : isMobile && def.key === "existencias" ? (
        /* ── Mobile / Tablet: Card-based layout for Existencias report ── */
        <div style={{ overflowY: "auto", maxHeight: "62vh", padding: "8px 16px", backgroundColor: "#f8fafc", borderRadius: 12, border: "1px solid #e2e8f0" }}>
          {loading && (
            <div style={{ textAlign: "center", padding: "32px 16px", color: "#94a3b8", fontSize: 13, fontWeight: 500 }}>
              Cargando información...
            </div>
          )}
          {error && (
            <div style={{ textAlign: "center", padding: "32px 16px", color: "#b91c1c", fontSize: 13, fontWeight: 500 }}>
              {error}
            </div>
          )}
          {!loading && !error && rows.length === 0 && (
            <div style={{ textAlign: "center", padding: "32px 16px", color: "#94a3b8", fontSize: 13, fontWeight: 500 }}>
              Sin registros.
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
                    backgroundColor: "#ffffff",
                    border: "1px solid #e2e8f0",
                    borderRadius: 12,
                    marginBottom: 10,
                    boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
                    overflow: "hidden",
                    textAlign: "left",
                  }}
                >
                  {/* Header: SKU y Estado */}
                  <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "8px 16px 6px 16px",
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#64748b",
                    borderBottom: "1px solid #f1f5f9",
                    backgroundColor: "#f8fafc",
                    letterSpacing: "0.2px",
                  }}>
                    <span style={{ fontFamily: "monospace", color: "#64748b" }}>{row.sku}</span>
                    {getCell(row, "estado")}
                  </div>

                  {/* Fila principal: Producto, Stock, Precio, Chevron */}
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "2fr 1fr 1.5fr 0.6fr",
                    padding: "12px 16px",
                    alignItems: "center",
                    gap: 8,
                  }}>
                    {/* Producto */}
                    <div style={{ fontWeight: 700, fontSize: 13, color: "#1e3a8a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {row.name}
                    </div>

                    {/* Stock */}
                    <div style={{ fontSize: 13, color: "#334155", textAlign: "center", fontWeight: 600 }}>
                      {row.stock} <span style={{ color: "#94a3b8", fontSize: 11 }}>uds</span>
                    </div>

                    {/* Precio */}
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", textAlign: "right" }}>
                      {getCell(row, "sellPrice")}
                    </div>

                    {/* Chevron */}
                    <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center" }}>
                      <button
                        onClick={() => toggleExpandSale(i)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: "#ffffff",
                          border: "1px solid #cbd5e1",
                          borderRadius: 8,
                          width: 34,
                          height: 34,
                          cursor: "pointer",
                          color: "#64748b",
                          padding: 0,
                        }}
                        className="active-tap"
                      >
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                    </div>
                  </div>

                  {/* Detalle expandido */}
                  {isExpanded && (
                    <div style={{
                      padding: "16px",
                      margin: "0 16px 16px 16px",
                      backgroundColor: "#f8fafc",
                      borderRadius: "8px",
                      border: "1px solid #e2e8f0",
                    }}>
                      <h4 style={{ fontSize: 13, fontWeight: 800, color: "#0f172a", marginBottom: 10 }}>Detalles de Inventario</h4>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12 }}>
                        <span style={{ color: "#64748b", fontWeight: 600 }}>Stock mínimo:</span>
                        <span style={{ color: "#334155", fontWeight: 700 }}>{row.minStock} uds</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12 }}>
                        <span style={{ color: "#64748b", fontWeight: 600 }}>Costo:</span>
                        <span style={{ color: "#334155", fontWeight: 700 }}>{getCell(row, "costPrice")}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12 }}>
                        <span style={{ color: "#64748b", fontWeight: 600 }}>Valor del Inventario:</span>
                        <span style={{ color: "#0f172a", fontWeight: 700 }}>{getCell(row, "valor")}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      ) : isMobile && def.key === "kardex" ? (
        /* ── Mobile / Tablet: Card-based layout for Kardex report ── */
        <div style={{ overflowY: "auto", maxHeight: "62vh", padding: "8px 16px", backgroundColor: "#f8fafc", borderRadius: 12, border: "1px solid #e2e8f0" }}>
          {loading && (
            <div style={{ textAlign: "center", padding: "32px 16px", color: "#94a3b8", fontSize: 13, fontWeight: 500 }}>
              Cargando información...
            </div>
          )}
          {error && (
            <div style={{ textAlign: "center", padding: "32px 16px", color: "#b91c1c", fontSize: 13, fontWeight: 500 }}>
              {error}
            </div>
          )}
          {!loading && !error && rows.length === 0 && (
            <div style={{ textAlign: "center", padding: "32px 16px", color: "#94a3b8", fontSize: 13, fontWeight: 500 }}>
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
                    backgroundColor: "#ffffff",
                    border: "1px solid #e2e8f0",
                    borderRadius: 12,
                    marginBottom: 10,
                    boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
                    overflow: "hidden",
                    textAlign: "left",
                  }}
                >
                  {/* Header: SKU y Movimiento */}
                  <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "8px 16px 6px 16px",
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#64748b",
                    borderBottom: "1px solid #f1f5f9",
                    backgroundColor: "#f8fafc",
                    letterSpacing: "0.2px",
                  }}>
                    <span style={{ fontFamily: "monospace", color: "#64748b" }}>{row.sku}</span>
                    {getCell(row, "movementType")}
                  </div>

                  {/* Fila principal: Producto, Cambio, Saldo, Chevron */}
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "2fr 1.2fr 1.2fr 0.6fr",
                    padding: "12px 16px",
                    alignItems: "center",
                    gap: 8,
                  }}>
                    {/* Producto */}
                    <div style={{ fontWeight: 700, fontSize: 13, color: "#1e3a8a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {row.product}
                    </div>

                    {/* Cambio (Cantidad) */}
                    <div style={{ fontSize: 13, color: row.quantityChange > 0 ? "#16a34a" : row.quantityChange < 0 ? "#dc2626" : "#475569", textAlign: "center", fontWeight: 700 }}>
                      {row.quantityChange > 0 ? `+${row.quantityChange}` : row.quantityChange}
                    </div>

                    {/* Saldo */}
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", textAlign: "right" }}>
                      {row.balanceAfter} <span style={{ color: "#94a3b8", fontSize: 11, fontWeight: 500 }}>uds</span>
                    </div>

                    {/* Chevron */}
                    <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center" }}>
                      <button
                        onClick={() => toggleExpandSale(i)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: "#ffffff",
                          border: "1px solid #cbd5e1",
                          borderRadius: 8,
                          width: 34,
                          height: 34,
                          cursor: "pointer",
                          color: "#64748b",
                          padding: 0,
                        }}
                        className="active-tap"
                      >
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                    </div>
                  </div>

                  {/* Detalle expandido */}
                  {isExpanded && (
                    <div style={{
                      padding: "16px",
                      margin: "0 16px 16px 16px",
                      backgroundColor: "#f8fafc",
                      borderRadius: "8px",
                      border: "1px solid #e2e8f0",
                    }}>
                      <h4 style={{ fontSize: 13, fontWeight: 800, color: "#0f172a", marginBottom: 10 }}>Detalles del Movimiento</h4>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12 }}>
                        <span style={{ color: "#64748b", fontWeight: 600 }}>Fecha y hora:</span>
                        <span style={{ color: "#334155", fontWeight: 700 }}>{getCell(row, "createdAt")}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12 }}>
                        <span style={{ color: "#64748b", fontWeight: 600 }}>Sucursal:</span>
                        <span style={{ color: "#334155", fontWeight: 700 }}>{getCell(row, "branch")}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12 }}>
                        <span style={{ color: "#64748b", fontWeight: 600 }}>Usuario:</span>
                        <span style={{ color: "#334155", fontWeight: 700 }}>{getCell(row, "user")}</span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8, fontSize: 12 }}>
                        <span style={{ color: "#64748b", fontWeight: 600 }}>Referencia / Motivo:</span>
                        <span style={{ color: "#334155", padding: "6px 8px", backgroundColor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 6, minHeight: 32 }}>{row.reason || "—"}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      ) : isMobile && def.key === "compras" ? (
        /* ── Mobile / Tablet: Card-based layout for Compras report ── */
        <div style={{ overflowY: "auto", maxHeight: "62vh", padding: "8px 16px", backgroundColor: "#f8fafc", borderRadius: 12, border: "1px solid #e2e8f0" }}>
          {loading && (
            <div style={{ textAlign: "center", padding: "32px 16px", color: "#94a3b8", fontSize: 13, fontWeight: 500 }}>
              Cargando información...
            </div>
          )}
          {error && (
            <div style={{ textAlign: "center", padding: "32px 16px", color: "#b91c1c", fontSize: 13, fontWeight: 500 }}>
              {error}
            </div>
          )}
          {!loading && !error && rows.length === 0 && (
            <div style={{ textAlign: "center", padding: "32px 16px", color: "#94a3b8", fontSize: 13, fontWeight: 500 }}>
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
                    backgroundColor: "#ffffff",
                    border: "1px solid #e2e8f0",
                    borderRadius: 12,
                    marginBottom: 10,
                    boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
                    overflow: "hidden",
                    textAlign: "left",
                  }}
                >
                  {/* Header: Folio y Estado */}
                  <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "8px 16px 6px 16px",
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#64748b",
                    borderBottom: "1px solid #f1f5f9",
                    backgroundColor: "#f8fafc",
                    letterSpacing: "0.2px",
                  }}>
                    <span style={{ fontFamily: "monospace", color: "#64748b" }}>{row.reference}</span>
                    {getCell(row, "status")}
                  </div>

                  {/* Fila principal: Proveedor, Fecha, Total, Chevron */}
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "1.8fr 1.5fr 1.5fr 0.6fr",
                    padding: "12px 16px",
                    alignItems: "center",
                    gap: 8,
                  }}>
                    {/* Proveedor */}
                    <div style={{ fontWeight: 700, fontSize: 13, color: "#1e3a8a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {getCell(row, "supplier")}
                    </div>

                    {/* Fecha */}
                    <div style={{ fontSize: 13, color: "#334155", textAlign: "center" }}>
                      {getCell(row, "purchaseDate")}
                    </div>

                    {/* Total */}
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", textAlign: "right" }}>
                      {getCell(row, "total")}
                    </div>

                    {/* Chevron */}
                    <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center" }}>
                      <button
                        onClick={() => toggleExpandSale(i)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: "#ffffff",
                          border: "1px solid #cbd5e1",
                          borderRadius: 8,
                          width: 34,
                          height: 34,
                          cursor: "pointer",
                          color: "#64748b",
                          padding: 0,
                        }}
                        className="active-tap"
                      >
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                    </div>
                  </div>

                  {/* Detalle expandido */}
                  {isExpanded && (
                    <div style={{
                      padding: "16px",
                      margin: "0 16px 16px 16px",
                      backgroundColor: "#f8fafc",
                      borderRadius: "8px",
                      border: "1px solid #e2e8f0",
                    }}>
                      <h4 style={{ fontSize: 13, fontWeight: 800, color: "#0f172a", marginBottom: 10 }}>Desglose de Compra</h4>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12 }}>
                        <span style={{ color: "#64748b", fontWeight: 600 }}>Sucursal:</span>
                        <span style={{ color: "#334155", fontWeight: 700 }}>{getCell(row, "branch")}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12 }}>
                        <span style={{ color: "#64748b", fontWeight: 600 }}>Subtotal:</span>
                        <span style={{ color: "#334155", fontWeight: 700 }}>{getCell(row, "subtotal")}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12 }}>
                        <span style={{ color: "#64748b", fontWeight: 600 }}>Impuestos:</span>
                        <span style={{ color: "#334155", fontWeight: 700 }}>{getCell(row, "tax")}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12 }}>
                        <span style={{ color: "#64748b", fontWeight: 600 }}>Registró:</span>
                        <span style={{ color: "#334155", fontWeight: 700 }}>{getCell(row, "createdByUser")}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      ) : isMobile && def.key === "operaciones" ? (
        /* ── Mobile / Tablet: Card-based layout for Operaciones del vendedor report ── */
        <div style={{ overflowY: "auto", maxHeight: "62vh", padding: "8px 16px", backgroundColor: "#f8fafc", borderRadius: 12, border: "1px solid #e2e8f0" }}>
          {loading && (
            <div style={{ textAlign: "center", padding: "32px 16px", color: "#94a3b8", fontSize: 13, fontWeight: 500 }}>
              Cargando información...
            </div>
          )}
          {error && (
            <div style={{ textAlign: "center", padding: "32px 16px", color: "#b91c1c", fontSize: 13, fontWeight: 500 }}>
              {error}
            </div>
          )}
          {!loading && !error && rows.length === 0 && (
            <div style={{ textAlign: "center", padding: "32px 16px", color: "#94a3b8", fontSize: 13, fontWeight: 500 }}>
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
                    backgroundColor: "#ffffff",
                    border: "1px solid #e2e8f0",
                    borderRadius: 12,
                    marginBottom: 10,
                    boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
                    overflow: "hidden",
                    textAlign: "left",
                  }}
                >
                  {/* Header: Vendedor y Rol */}
                  <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "8px 16px 6px 16px",
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#64748b",
                    borderBottom: "1px solid #f1f5f9",
                    backgroundColor: "#f8fafc",
                    letterSpacing: "0.2px",
                  }}>
                    <span style={{ color: "#1e3a8a", fontWeight: 800, fontSize: 12 }}>{row.name}</span>
                    {getCell(row, "role")}
                  </div>

                  {/* Fila principal: Sucursal, Ventas, Total Vendido, Chevron */}
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "1.8fr 1.5fr 1.5fr 0.6fr",
                    padding: "12px 16px",
                    alignItems: "center",
                    gap: 8,
                  }}>
                    {/* Sucursal */}
                    <div style={{ fontSize: 13, color: "#334155", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {row.branch || "—"}
                    </div>

                    {/* Ventas */}
                    <div style={{ fontSize: 13, color: "#475569", textAlign: "center", fontWeight: 600 }}>
                      {row.ventasCount} <span style={{ color: "#94a3b8", fontSize: 11 }}>vts</span>
                    </div>

                    {/* Total Vendido */}
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", textAlign: "right" }}>
                      {getCell(row, "totalVendido")}
                    </div>

                    {/* Chevron */}
                    <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center" }}>
                      <button
                        onClick={() => toggleExpandSale(i)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: "#ffffff",
                          border: "1px solid #cbd5e1",
                          borderRadius: 8,
                          width: 34,
                          height: 34,
                          cursor: "pointer",
                          color: "#64748b",
                          padding: 0,
                        }}
                        className="active-tap"
                      >
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                    </div>
                  </div>

                  {/* Detalle expandido */}
                  {isExpanded && (
                    <div style={{
                      padding: "16px",
                      margin: "0 16px 16px 16px",
                      backgroundColor: "#f8fafc",
                      borderRadius: "8px",
                      border: "1px solid #e2e8f0",
                    }}>
                      <h4 style={{ fontSize: 13, fontWeight: 800, color: "#0f172a", marginBottom: 10 }}>Métricas del Vendedor</h4>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12 }}>
                        <span style={{ color: "#64748b", fontWeight: 600 }}>Devoluciones:</span>
                        <span style={{ color: "#334155", fontWeight: 700 }}>{row.devolucionesCount}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12 }}>
                        <span style={{ color: "#64748b", fontWeight: 600 }}>Cancelaciones:</span>
                        <span style={{ color: "#334155", fontWeight: 700 }}>{row.canceladas}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12 }}>
                        <span style={{ color: "#64748b", fontWeight: 600 }}>Comisión Generada:</span>
                        <span style={{ color: "#16a34a", fontWeight: 700 }}>{getCell(row, "comision")}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      ) : isMobile && def.key === "ventas-usuario" ? (
        /* ── Mobile / Tablet: Card-based layout for Ventas del usuario report ── */
        <div style={{ overflowY: "auto", maxHeight: "62vh", padding: "8px 16px", backgroundColor: "#f8fafc", borderRadius: 12, border: "1px solid #e2e8f0" }}>
          {loading && (
            <div style={{ textAlign: "center", padding: "32px 16px", color: "#94a3b8", fontSize: 13, fontWeight: 500 }}>
              Cargando información...
            </div>
          )}
          {error && (
            <div style={{ textAlign: "center", padding: "32px 16px", color: "#b91c1c", fontSize: 13, fontWeight: 500 }}>
              {error}
            </div>
          )}
          {!loading && !error && rows.length === 0 && (
            <div style={{ textAlign: "center", padding: "32px 16px", color: "#94a3b8", fontSize: 13, fontWeight: 500 }}>
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
                    backgroundColor: "#ffffff",
                    border: "1px solid #e2e8f0",
                    borderRadius: 12,
                    marginBottom: 10,
                    boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
                    overflow: "hidden",
                    textAlign: "left",
                  }}
                >
                  {/* Header: Usuario y Rol */}
                  <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "8px 16px 6px 16px",
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#64748b",
                    borderBottom: "1px solid #f1f5f9",
                    backgroundColor: "#f8fafc",
                    letterSpacing: "0.2px",
                  }}>
                    <span style={{ color: "#1e3a8a", fontWeight: 800, fontSize: 12 }}>{row.name}</span>
                    {getCell(row, "role")}
                  </div>

                  {/* Fila principal: Sucursal, Tickets, Importe Vendido, Chevron */}
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "1.8fr 1.5fr 1.5fr 0.6fr",
                    padding: "12px 16px",
                    alignItems: "center",
                    gap: 8,
                  }}>
                    {/* Sucursal */}
                    <div style={{ fontSize: 13, color: "#334155", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {row.branch || "—"}
                    </div>

                    {/* Tickets */}
                    <div style={{ fontSize: 13, color: "#475569", textAlign: "center", fontWeight: 600 }}>
                      {row.ventasCount} <span style={{ color: "#94a3b8", fontSize: 11 }}>tks</span>
                    </div>

                    {/* Importe Vendido */}
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", textAlign: "right" }}>
                      {getCell(row, "totalVendido")}
                    </div>

                    {/* Chevron */}
                    <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center" }}>
                      <button
                        onClick={() => toggleExpandSale(i)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: "#ffffff",
                          border: "1px solid #cbd5e1",
                          borderRadius: 8,
                          width: 34,
                          height: 34,
                          cursor: "pointer",
                          color: "#64748b",
                          padding: 0,
                        }}
                        className="active-tap"
                      >
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                    </div>
                  </div>

                  {/* Detalle expandido */}
                  {isExpanded && (
                    <div style={{
                      padding: "16px",
                      margin: "0 16px 16px 16px",
                      backgroundColor: "#f8fafc",
                      borderRadius: "8px",
                      border: "1px solid #e2e8f0",
                    }}>
                      <h4 style={{ fontSize: 13, fontWeight: 800, color: "#0f172a", marginBottom: 10 }}>Resumen del Usuario</h4>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12 }}>
                        <span style={{ color: "#64748b", fontWeight: 600 }}>Promedio por ticket:</span>
                        <span style={{ color: "#334155", fontWeight: 700 }}>{getCell(row, "ticketPromedio")}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12 }}>
                        <span style={{ color: "#64748b", fontWeight: 600 }}>Descuentos:</span>
                        <span style={{ color: "#334155", fontWeight: 700 }}>{getCell(row, "descuentos")}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12 }}>
                        <span style={{ color: "#64748b", fontWeight: 600 }}>Cancelaciones:</span>
                        <span style={{ color: "#334155", fontWeight: 700 }}>{getCell(row, "canceladas")}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12 }}>
                        <span style={{ color: "#64748b", fontWeight: 600 }}>Devoluciones:</span>
                        <span style={{ color: "#334155", fontWeight: 700 }}>{getCell(row, "devolucionesCount")}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      ) : (
        /* ── Standard Dynamic Table ── */
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
          backgroundColor: "#ffffff",
          border: "1px solid #e2e8f0",
          borderTop: "none",
          borderBottomLeftRadius: 12,
          borderBottomRightRadius: 12,
          fontSize: 13,
          color: "#475569"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
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
            <span>por pág.</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: isMobile ? "space-between" : "flex-end", gap: 8 }}>
            <span style={{ fontSize: 12, color: "#64748b" }}>
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
                  border: "1px solid #cbd5e1",
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
                  border: "1px solid #cbd5e1",
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
