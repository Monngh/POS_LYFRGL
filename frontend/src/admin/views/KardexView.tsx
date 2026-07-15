import React, { useEffect, useState, useCallback, useRef } from "react";
import { ArrowUp, ArrowDown, Printer, ChevronDown, ChevronUp, X, Loader2 } from "lucide-react";
import api from "../../shared/services/api";
import {
  ui,
  type ViewProps,
  Toolbar,
  SearchInput,
  MobileFilterDisclosure,
  Badge,
  TableState,
  SectionHeader,
  fmtDate,
  fmtTime,
  printTicketHtml,
  useMediaQuery,
  usePagination,
  Pagination,
} from "./shared";
import { useToast } from "../../shared/context/ToastContext";

interface KardexRow {
  id: number;
  createdAt: string;
  product: string;
  sku: string;
  branch: string;
  user: string;
  movementType: string;
  quantityChange: number;
  balanceAfter: number;
  reason: string | null;
}

type Tone = "green" | "red" | "amber" | "blue" | "slate";

const typeTone = (t: string): Tone => {
  if (t === "COMPRA" || t === "DEVOLUCION" || t === "TRASPASO_ENTRADA") return "green";
  if (t === "VENTA" || t === "TRASPASO_SALIDA" || t === "AJUSTE_MERMA") return "red";
  if (t.startsWith("AJUSTE")) return "amber";
  return "slate";
};

const movementLabel: Record<string, string> = {
  VENTA: "Venta",
  COMPRA: "Compra",
  DEVOLUCION: "Devolución",
  AJUSTE_INVENTARIO: "Ajuste inventario",
  AJUSTE_MERMA: "Merma",
  TRASPASO_ENTRADA: "Traspaso entrada",
  TRASPASO_SALIDA: "Traspaso salida",
};

// Chips para segmentar la búsqueda por tipo de movimiento
const MOVEMENT_CHIPS: { value: string; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "VENTA", label: "Ventas" },
  { value: "COMPRA", label: "Compras" },
  { value: "DEVOLUCION", label: "Devoluciones" },
  { value: "AJUSTE_INVENTARIO", label: "Ajustes" },
  { value: "AJUSTE_MERMA", label: "Mermas" },
  { value: "TRASPASO_ENTRADA", label: "Traspaso ent." },
  { value: "TRASPASO_SALIDA", label: "Traspaso sal." },
];

const PRINTING_LABEL = "Generando...";
const PRINT_LOCK_RELEASE_DELAY_MS = 700;


const waitForPrintLockRelease = () =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, PRINT_LOCK_RELEASE_DELAY_MS);
  });

const formatMotivo = (texto: string): string => {
  if (!texto) return "";
  return texto
    .replace(/:\s+(V-|DEV-|FACT-)/g, ":\n$1")
    .replace(/(\d+)\.\s+/g, "$1.\n")
    .replace(/\s+(Autorizó:)/g, "\n$1")
    .trim();
};

const chipStyle = (active: boolean): React.CSSProperties => ({
  padding: "7px 14px",
  borderRadius: 999,
  border: active ? "1px solid var(--accent-strong)" : "1px solid var(--border)",
  backgroundColor: active ? "var(--accent-strong)" : "var(--surface)",
  color: active ? "#ffffff" : "var(--text-muted)",
                    fontSize: 12,
  fontWeight: active ? 700 : 600,
  cursor: "pointer",
  fontFamily: "inherit",
  whiteSpace: "nowrap",
  transition: "background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease",
});

const formatDateFilterLabel = (value: string) => {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
};

const kardexMobileFilterStack: React.CSSProperties = {
  display: "grid",
  gap: 10,
  marginBottom: 14,
};

const kardexMobileChipGroup: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  paddingTop: 12,
};

const kardexMobileDateGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr",
  gap: 10,
};

const kardexMobileResultCount: React.CSSProperties = {
  fontSize: 13,
  color: "var(--text-muted)",
  fontWeight: 700,
  padding: "0 2px",
};

// ── Componente de paginación ────────────────────────────────────────────────



// ── Componente principal ────────────────────────────────────────────────────
const KardexView: React.FC<ViewProps> = ({ branchId, refreshToken }) => {
  const { showToast } = useToast();
  const [rows, setRows] = useState<KardexRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [movementType, setMovementType] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  
  const isSmallScreen = useMediaQuery("(max-width: 640px)");
  const [kardexFiltersOpen, setKardexFiltersOpen] = useState(false);
  const [expandedKardex, setExpandedKardex] = useState<Record<number, boolean>>({});
  const [printingId, setPrintingId] = useState<number | null>(null);
  const printingIdRef = useRef<number | null>(null);

  // Resetear a página 1 cuando cambia cualquier filtro
  useEffect(() => { setPage(1); }, [branchId, movementType, search, from, to]);

  const toggleExpandKardex = (id: number) => {
    setExpandedKardex((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ entries: KardexRow[]; total: number }>("/api/admin/kardex", {
        params: {
          ...(branchId !== "all" ? { branchId } : {}),
          ...(movementType !== "all" ? { movementType } : {}),
          ...(search.trim() ? { search: search.trim() } : {}),
          ...(from ? { from } : {}),
          ...(to ? { to } : {}),
          page,
        },
      });
      setRows(res.data.entries);
      setTotal(res.data.total);
    } catch (err: any) {
      setError(err.response?.data?.message || "No se pudo cargar el kardex.");
    } finally {
      setLoading(false);
    }
  }, [branchId, movementType, search, from, to, page, refreshToken]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  const paged = usePagination(rows, { resetKey: `${branchId}|${movementType}|${search}|${from}|${to}` });

  // Imprime el comprobante de un movimiento individual
  const printMovement = useCallback(async (k: KardexRow) => {
    if (printingIdRef.current !== null) return;

    printingIdRef.current = k.id;
    setPrintingId(k.id);

    try {
      const before = k.balanceAfter - k.quantityChange;
      const signo = k.quantityChange >= 0 ? "+" : "";
      const safe = (value: unknown) =>
        String(value ?? "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");
      const row = (l: string, v: string) =>
        `<div class="ticket-row"><span>${l}</span><span class="ticket-value">${v}</span></div>`;
      const body = `
        <div>
        <div class="ticket-header">
          <span class="ticket-store">LYFRGL POS</span>
          <span class="ticket-muted">Sucursal: ${safe(k.branch)}</span>
          <span class="ticket-operation">KARDEX - MOV. #${k.id}</span>
        </div>
        <div class="ticket-section">
          ${row("Fecha:", `${fmtDate(k.createdAt)} ${fmtTime(k.createdAt)}`)}
          ${row("Producto:", `${safe(k.product)} (${safe(k.sku)})`)}
          ${row("Tipo:", safe(movementLabel[k.movementType] ?? k.movementType.replace(/_/g, " ")))}
          ${row("Exist. anterior:", String(before))}
          ${row("Cambio:", `${signo}${k.quantityChange}`)}
          ${row("Exist. final:", String(k.balanceAfter))}
          ${row("Usuario:", safe(k.user))}
          ${row("Referencia:", safe(k.reason || "N/A"))}
        </div>
        <div class="ticket-footer">
          <p>COMPROBANTE DE MOVIMIENTO DE INVENTARIO</p>
        </div>
        </div>
      `;
      printTicketHtml(`Kardex Mov. #${k.id}`, body, showToast);
      await waitForPrintLockRelease();
    } catch (err) {
      console.error("No se pudo imprimir el movimiento de Kardex.", err);
      alert("No se pudo generar el comprobante de Kardex.");
    } finally {
      printingIdRef.current = null;
      setPrintingId(null);
    }
  }, []);

  
  const selectedMovementLabel = MOVEMENT_CHIPS.find((chip) => chip.value === movementType)?.label;
  const kardexActiveFilterLabels = [
    movementType !== "all" ? selectedMovementLabel : null,
    search.trim() ? "Busqueda" : null,
    from ? `Desde ${formatDateFilterLabel(from)}` : null,
    to ? `Hasta ${formatDateFilterLabel(to)}` : null,
  ].filter((label): label is string => Boolean(label));
  const kardexFilterSummary = kardexActiveFilterLabels.length > 0
    ? kardexActiveFilterLabels.join(", ")
    : "Sin filtros activos";
  const movementChips = (
    <div style={isSmallScreen ? kardexMobileChipGroup : { display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
      {MOVEMENT_CHIPS.map((chip) => (
        <button
          key={chip.value}
          onClick={() => setMovementType(chip.value)}
          className="active-tap"
          style={chipStyle(movementType === chip.value)}
        >
          {chip.label}
        </button>
      ))}
    </div>
  );

  return (
    <div>
      <SectionHeader title="Kardex" subtitle="Movimientos de inventario registrados (entradas y salidas)" />

      {isSmallScreen ? (
        <>
          <div style={kardexMobileFilterStack}>
            <MobileFilterDisclosure
              id="kardex-mobile-filters"
              title="Filtros de Kardex"
              activeCount={kardexActiveFilterLabels.length}
              summary={kardexFilterSummary}
              isOpen={kardexFiltersOpen}
              onToggle={() => setKardexFiltersOpen((current) => !current)}
            >
              {movementChips}
              <SearchInput value={search} onChange={setSearch} placeholder="Buscar por producto o SKU" />
              <div style={kardexMobileDateGrid}>
                <div>
                  <label style={ui.fieldLabel}>Desde</label>
                  <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ ...ui.filterSelect, height: 38, width: "100%" }} />
                </div>
                <div>
                  <label style={ui.fieldLabel}>Hasta</label>
                  <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ ...ui.filterSelect, height: 38, width: "100%" }} />
                </div>
                {(from || to) && (
                  <button onClick={() => { setFrom(""); setTo(""); }} style={{ ...ui.ghostBtn, fontSize: 12, justifyContent: "center" }}>
                    Limpiar fechas
                  </button>
                )}
              </div>
            </MobileFilterDisclosure>
            <div style={kardexMobileResultCount}>
              {total} movimiento{total === 1 ? "" : "s"}
            </div>
          </div>

          {/* Cards mobile */}
          <div style={{ overflowY: "auto", maxHeight: "62vh", padding: "8px 16px", backgroundColor: "var(--surface-2)", borderRadius: 12, border: "1px solid var(--border)" }}>
            <div style={{
              display: "grid",
              gridTemplateColumns: "3fr 1.3fr 1.5fr",
              padding: "12px 16px",
              fontWeight: 700,
              fontSize: 11,
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.4px",
            }}>
              <div>Producto</div>
              <div>Cambio</div>
              <div style={{ textAlign: "right", paddingRight: 8 }}>Acción</div>
            </div>

            {loading && (
              <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--text-faint)", fontSize: 13, fontWeight: 500 }}>
                Cargando información...
              </div>
            )}
            {!loading && error && (
              <div style={{ textAlign: "center", padding: "32px 16px", color: "#b91c1c", fontSize: 13, fontWeight: 500 }}>
                {error}
              </div>
            )}
            {!loading && !error && rows.length === 0 && (
              <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--text-faint)", fontSize: 13, fontWeight: 500 }}>
                {search.trim()
                  ? "No se encontraron productos con esa búsqueda."
                  : "Sin registros en el periodo seleccionado."}
              </div>
            )}

            {!loading &&
              !error &&
              paged.pageItems.map((k) => {
                const isExpanded = expandedKardex[k.id];
                const balanceBefore = k.balanceAfter - k.quantityChange;
                const isCurrentPrinting = printingId === k.id;
                const isPrintDisabled = printingId !== null;
                return (
                  <div
                    key={k.id}
                    style={{
                      backgroundColor: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                      marginBottom: 10,
                      boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
                      overflow: "hidden",
                      textAlign: "left",
                    }}
                  >
                    <div style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "8px 16px 6px 16px",
                      fontSize: 11,
                      fontWeight: 700,
                      color: "var(--text-muted)",
                      borderBottom: "1px solid var(--border-soft)",
                      backgroundColor: "var(--surface-2)",
                      letterSpacing: "0.2px",
                    }}>
                      <span style={{ fontFamily: "monospace" }}>{k.sku}</span>
                      <Badge tone={typeTone(k.movementType)}>
                        {movementLabel[k.movementType] ?? k.movementType.replace(/_/g, " ")}
                      </Badge>
                    </div>

                    <div style={{
                      display: "grid",
                      gridTemplateColumns: "3fr 1.3fr 1.5fr",
                      padding: "12px 16px",
                      alignItems: "center",
                    }}>
                      <div style={{ fontSize: 13, color: "var(--text)", fontWeight: 600, paddingRight: 8, overflow: "hidden", display: "-webkit-box" as React.CSSProperties["display"], WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as React.CSSProperties["WebkitBoxOrient"] }}>
                        {k.product}
                      </div>

                      <div style={{ fontSize: 13, fontWeight: 800, color: k.quantityChange >= 0 ? "var(--color-success)" : "var(--color-danger)" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
                          {k.quantityChange >= 0 ? <ArrowUp size={13} /> : <ArrowDown size={13} />}
                          {Math.abs(k.quantityChange)}
                        </span>
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8 }}>
                          <button
                            onClick={() => { void printMovement(k); }}
                            disabled={isPrintDisabled}
                            aria-busy={isCurrentPrinting}
                            aria-label={isCurrentPrinting ? PRINTING_LABEL : "Imprimir comprobante"}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              backgroundColor: "var(--accent-soft)",
                              border: "1px solid var(--border)",
                              borderRadius: 8,
                              width: 34,
                              height: 34,
                              cursor: isPrintDisabled ? "not-allowed" : "pointer",
                              color: "var(--accent)",
                              opacity: isPrintDisabled ? (isCurrentPrinting ? 0.75 : 0.45) : 1,
                              padding: 0,
                            }}
                            className="active-tap"
                            title={isCurrentPrinting ? PRINTING_LABEL : isPrintDisabled ? "Espere a que termine la impresión actual" : "Imprimir comprobante"}
                          >
                            {isCurrentPrinting ? <Loader2 size={15} style={{ animation: "spin 0.8s linear infinite" }} /> : <Printer size={15} />}
                          </button>

                          <button
                            onClick={() => toggleExpandKardex(k.id)}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              backgroundColor: "var(--surface)",
                              border: "1px solid var(--border-strong)",
                              borderRadius: 8,
                              width: 34,
                              height: 34,
                              cursor: "pointer",
                              color: "var(--text-muted)",
                              padding: 0,
                            }}
                            className="active-tap"
                          >
                            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </button>
                        </div>
                        {isCurrentPrinting && (
                          <span style={{ fontSize: 10, lineHeight: 1, fontWeight: 700, color: "var(--text-muted)" }}>
                            {PRINTING_LABEL}
                          </span>
                        )}
                      </div>
                    </div>

                    {isExpanded && (
                      <div style={{
                        padding: "16px",
                        margin: "0 16px 16px 16px",
                        backgroundColor: "var(--surface-2)",
                        borderRadius: "8px",
                        border: "1px solid var(--border)",
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                        gap: "16px",
                      }}>
                        <div>
                          <h4 style={{ fontSize: 13, fontWeight: 800, color: "var(--text)", marginBottom: 10 }}>Datos del Movimiento</h4>
                          <div style={kardexDetailRow}>
                            <span style={kardexDetailLabel}>Fecha/Hora:</span>
                            <span style={kardexDetailValue}>
                              {fmtDate(k.createdAt)} <span style={{ color: "var(--text-faint)", fontWeight: 500 }}>{fmtTime(k.createdAt)}</span>
                            </span>
                          </div>
                          <div style={kardexDetailRow}>
                            <span style={kardexDetailLabel}>Sucursal:</span>
                            <span style={kardexDetailValue}>{k.branch}</span>
                          </div>
                          <div style={kardexDetailRow}>
                            <span style={kardexDetailLabel}>Usuario:</span>
                            <span style={kardexDetailValue}>{k.user}</span>
                          </div>
                        </div>

                        <div>
                          <h4 style={{ fontSize: 13, fontWeight: 800, color: "var(--text)", marginBottom: 10 }}>Resumen Físico</h4>
                          <div style={kardexDetailRow}>
                            <span style={kardexDetailLabel}>Exist. anterior:</span>
                            <span style={kardexDetailValue}>{balanceBefore} uds</span>
                          </div>
                          <div style={kardexDetailRow}>
                            <span style={kardexDetailLabel}>Cambio:</span>
                            <span style={{ ...kardexDetailValue, color: k.quantityChange >= 0 ? "var(--color-success)" : "var(--color-danger)" }}>
                              {k.quantityChange >= 0 ? `+${k.quantityChange}` : k.quantityChange}
                            </span>
                          </div>
                          <div style={kardexDetailRow}>
                            <span style={kardexDetailLabel}>Exist. final:</span>
                            <span style={{ ...kardexDetailValue, fontWeight: 700 }}>{k.balanceAfter} uds</span>
                          </div>
                        </div>

                        <div style={{ gridColumn: "1 / -1" }}>
                          <h4 style={{ fontSize: 13, fontWeight: 800, color: "var(--text)", marginBottom: 6 }}>Referencia / Motivo</h4>
                          <div style={{
                            padding: "8px 12px",
                            backgroundColor: "var(--surface)",
                            border: "1px solid var(--border)",
                            borderRadius: 8,
                            fontSize: 12,
                            color: "var(--text-secondary)",
                            whiteSpace: "normal",
                            lineHeight: 1.5,
                          }}>
                            {k.reason || "Sin observaciones registradas."}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
          </div>

        </>
      ) : (
        <>
          {movementChips}
          <Toolbar>
            <SearchInput value={search} onChange={setSearch} placeholder="Buscar por producto o SKU" />
            <div>
              <label style={ui.fieldLabel}>Desde</label>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ ...ui.filterSelect, height: 38 }} />
            </div>
            <div>
              <label style={ui.fieldLabel}>Hasta</label>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ ...ui.filterSelect, height: 38 }} />
            </div>
            {(from || to) && (
              <button onClick={() => { setFrom(""); setTo(""); }} style={{ ...ui.ghostBtn, fontSize: 12, marginTop: 18, display: "inline-flex", alignItems: "center", gap: 5 }}>
                <X size={12} /> Limpiar fechas
              </button>
            )}
            <span style={{ marginLeft: "auto", fontSize: 13, color: "var(--text-muted)", fontWeight: 600 }}>
              {total} movimiento{total === 1 ? "" : "s"}
            </span>
          </Toolbar>

          {/* Desktop: Standard table */}
          <div className="table-sticky-head" style={{ ...ui.tableWrap, overflowX: "auto", overflowY: "auto", maxHeight: "62vh" }}>
            <table style={ui.table}>
              <thead>
                <tr style={ui.theadRow}>
                  <th style={ui.th}>Fecha</th>
                  <th style={ui.th}>Producto</th>
                  <th style={ui.th}>Sucursal</th>
                  <th style={{ ...ui.th, textAlign: "center" }}>Tipo</th>
                  <th style={{ ...ui.th, textAlign: "center" }}>Cambio</th>
                  <th style={{ ...ui.th, textAlign: "center" }}>Antes</th>
                  <th style={{ ...ui.th, textAlign: "center" }}>Después</th>
                  <th style={ui.th}>Usuario</th>
                  <th style={{ ...ui.th, maxWidth: 200 }}>Motivo</th>
                  <th style={{ ...ui.th, textAlign: "center" }}>Imprimir</th>
                </tr>
              </thead>
              <tbody>
                <TableState
                  colSpan={10}
                  loading={loading}
                  error={error}
                  empty={!loading && !error && rows.length === 0}
                  emptyText={search.trim() ? "No se encontraron productos con esa búsqueda." : "Sin registros en el periodo seleccionado."}
                />
                {!loading &&
                  !error &&
                  paged.pageItems.map((k) => {
                    const balanceBefore = k.balanceAfter - k.quantityChange;
                    const isCurrentPrinting = printingId === k.id;
                    const isPrintDisabled = printingId !== null;
                    return (
                      <tr key={k.id}>
                        <td style={ui.td}>
                          {fmtDate(k.createdAt)} <span style={{ color: "var(--text-faint)" }}>{fmtTime(k.createdAt)}</span>
                        </td>
                        <td style={{ ...ui.td, whiteSpace: "normal" }}>
                          <div style={{ fontWeight: 600, color: "var(--text)" }}>{k.product}</div>
                          <div style={{ fontSize: 11, color: "var(--text-faint)" }}>{k.sku}</div>
                        </td>
                        <td style={ui.td}>{k.branch}</td>
                        <td style={{ ...ui.td, textAlign: "center" }}>
                          <Badge tone={typeTone(k.movementType)}>
                            {movementLabel[k.movementType] ?? k.movementType.replace(/_/g, " ")}
                          </Badge>
                        </td>
                        <td style={{ ...ui.td, textAlign: "center", fontWeight: 800, color: k.quantityChange >= 0 ? "var(--color-success)" : "var(--color-danger)" }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
                            {k.quantityChange >= 0 ? <ArrowUp size={13} /> : <ArrowDown size={13} />}
                            {Math.abs(k.quantityChange)}
                          </span>
                        </td>
                        <td style={{ ...ui.td, textAlign: "center", color: "var(--text-muted)" }}>{balanceBefore}</td>
                        <td style={{ ...ui.td, textAlign: "center", fontWeight: 700 }}>{k.balanceAfter}</td>
                        <td style={ui.td}>{k.user}</td>
                        <td style={{ ...ui.td, maxWidth: 220, padding: 0, verticalAlign: "top" }}>
                          <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", color: "var(--text-muted)", fontSize: 12, lineHeight: "1.5", padding: "10px 12px" }}>
                            {formatMotivo(k.reason || "—")}
                          </div>
                        </td>
                        <td style={{ ...ui.td, textAlign: "center" }}>
                          <button
                            onClick={() => { void printMovement(k); }}
                            disabled={isPrintDisabled}
                            aria-busy={isCurrentPrinting}
                            aria-label={isCurrentPrinting ? PRINTING_LABEL : "Imprimir comprobante de este movimiento"}
                            title={isCurrentPrinting ? PRINTING_LABEL : isPrintDisabled ? "Espere a que termine la impresión actual" : "Imprimir comprobante de este movimiento"}
                            className="active-tap"
                            style={{
                              minWidth: 112,
                              height: 32,
                              borderRadius: 7,
                              border: "1px solid var(--border)",
                              backgroundColor: "var(--surface)",
                              color: "var(--accent-strong)",
                              cursor: isPrintDisabled ? "not-allowed" : "pointer",
                              opacity: isPrintDisabled ? (isCurrentPrinting ? 0.75 : 0.45) : 1,
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: 6,
                              padding: "0 10px",
                            }}
                          >
                            {isCurrentPrinting ? <Loader2 size={15} style={{ animation: "spin 0.8s linear infinite" }} /> : <Printer size={15} />}
                            <span>{isCurrentPrinting ? PRINTING_LABEL : "Imprimir"}</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>

        </>
      )}
      {!loading && !error && (
        <Pagination page={paged.page} pageCount={paged.pageCount} total={paged.total} from={paged.from} to={paged.to} onPage={paged.setPage} itemLabel="movimientos" />
      )}
    </div>
  );
};

const kardexDetailRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-start",
  alignItems: "flex-start",
  gap: "8px",
  fontSize: 13,
  marginBottom: 6,
};

const kardexDetailLabel: React.CSSProperties = {
  flexShrink: 0,
  fontWeight: 700,
  color: "var(--text-muted)",
  minWidth: "105px",
  display: "inline-block",
};

const kardexDetailValue: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  overflowWrap: "anywhere",
  fontWeight: 600,
  color: "var(--text-secondary)",
};

export default KardexView;
