import React, { useEffect, useState, useCallback } from "react";
import { ArrowUp, ArrowDown, Printer } from "lucide-react";
import api from "../../services/api";
import {
  ui,
  type ViewProps,
  Toolbar,
  SearchInput,
  Badge,
  TableState,
  SectionHeader,
  fmtDate,
  fmtTime,
  printHtml,
} from "./shared";

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

const chipStyle = (active: boolean): React.CSSProperties => ({
  padding: "7px 14px",
  borderRadius: 999,
  border: active ? "1px solid #1e3a8a" : "1px solid #e2e8f0",
  backgroundColor: active ? "#1e3a8a" : "#ffffff",
  color: active ? "#ffffff" : "#475569",
  fontSize: 13,
  fontWeight: active ? 700 : 600,
  cursor: "pointer",
  fontFamily: "inherit",
  whiteSpace: "nowrap",
  transition: "background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease",
});

const KardexView: React.FC<ViewProps> = ({ branchId, refreshToken }) => {
  const [rows, setRows] = useState<KardexRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [movementType, setMovementType] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ entries: KardexRow[] }>("/api/admin/kardex", {
        params: {
          ...(branchId !== "all" ? { branchId } : {}),
          ...(movementType !== "all" ? { movementType } : {}),
          ...(search.trim() ? { search: search.trim() } : {}),
          ...(from ? { from } : {}),
          ...(to ? { to } : {}),
        },
      });
      setRows(res.data.entries);
    } catch (err: any) {
      setError(err.response?.data?.message || "No se pudo cargar el kardex.");
    } finally {
      setLoading(false);
    }
  }, [branchId, movementType, search, from, to, refreshToken]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  // Imprime el comprobante de un movimiento individual
  const printMovement = (k: KardexRow) => {
    const before = k.balanceAfter - k.quantityChange;
    const signo = k.quantityChange >= 0 ? "+" : "";
    const row = (l: string, v: string) =>
      `<tr><td style="color:#64748b">${l}</td><td style="text-align:right;font-weight:700">${v}</td></tr>`;
    const body = `
      <div class="doc-header">
        <div>
          <div class="doc-brand">LYFRGL POS</div>
          <div class="doc-sub">Comprobante de movimiento de inventario</div>
        </div>
        <div>
          <div class="doc-title">KARDEX · MOV. #${k.id}</div>
          <div class="doc-meta">${fmtDate(k.createdAt)} ${fmtTime(k.createdAt)}</div>
        </div>
      </div>
      <table style="margin-top:8px">
        <tbody>
          ${row("Producto", `${k.product} (${k.sku})`)}
          ${row("Sucursal", k.branch)}
          ${row("Tipo de movimiento", movementLabel[k.movementType] ?? k.movementType.replace(/_/g, " "))}
          ${row("Existencia anterior", String(before))}
          ${row("Cambio", `${signo}${k.quantityChange}`)}
          ${row("Existencia final", String(k.balanceAfter))}
          ${row("Usuario responsable", k.user)}
          ${row("Referencia / Motivo", k.reason || "—")}
        </tbody>
      </table>
    `;
    printHtml(`Kardex Mov. #${k.id}`, body);
  };

  return (
    <div>
      <SectionHeader title="Kardex" subtitle="Movimientos de inventario registrados (entradas y salidas)" />

      {/* Chips de segmentación por tipo de movimiento */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
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

      {/* Búsqueda + rango de fechas */}
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
          <button onClick={() => { setFrom(""); setTo(""); }} style={{ ...ui.ghostBtn, fontSize: 12, marginTop: 18 }}>
            ✕ Limpiar fechas
          </button>
        )}
        <span style={{ marginLeft: "auto", fontSize: 13, color: "#64748b", fontWeight: 600 }}>
          {rows.length} movimiento{rows.length === 1 ? "" : "s"}
        </span>
      </Toolbar>

      <div style={{ ...ui.tableWrap, overflowX: "auto" }}>
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
              <th style={ui.th}>Motivo</th>
              <th style={{ ...ui.th, textAlign: "center" }}>Imprimir</th>
            </tr>
          </thead>
          <tbody>
            <TableState colSpan={10} loading={loading} error={error} empty={!loading && !error && rows.length === 0} />
            {!loading &&
              !error &&
              rows.map((k) => {
                const balanceBefore = k.balanceAfter - k.quantityChange;
                return (
                  <tr key={k.id}>
                    <td style={ui.td}>
                      {fmtDate(k.createdAt)} <span style={{ color: "#94a3b8" }}>{fmtTime(k.createdAt)}</span>
                    </td>
                    <td style={{ ...ui.td, whiteSpace: "normal" }}>
                      <div style={{ fontWeight: 600, color: "#0f172a" }}>{k.product}</div>
                      <div style={{ fontSize: 11, color: "#94a3b8" }}>{k.sku}</div>
                    </td>
                    <td style={ui.td}>{k.branch}</td>
                    <td style={{ ...ui.td, textAlign: "center" }}>
                      <Badge tone={typeTone(k.movementType)}>
                        {movementLabel[k.movementType] ?? k.movementType.replace(/_/g, " ")}
                      </Badge>
                    </td>
                    <td style={{ ...ui.td, textAlign: "center", fontWeight: 800, color: k.quantityChange >= 0 ? "#15803d" : "#b91c1c" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
                        {k.quantityChange >= 0 ? <ArrowUp size={13} /> : <ArrowDown size={13} />}
                        {Math.abs(k.quantityChange)}
                      </span>
                    </td>
                    <td style={{ ...ui.td, textAlign: "center", color: "#64748b" }}>{balanceBefore}</td>
                    <td style={{ ...ui.td, textAlign: "center", fontWeight: 700 }}>{k.balanceAfter}</td>
                    <td style={ui.td}>{k.user}</td>
                    <td style={{ ...ui.td, whiteSpace: "normal", color: "#64748b", fontSize: 12, maxWidth: 240 }}>{k.reason || "—"}</td>
                    <td style={{ ...ui.td, textAlign: "center" }}>
                      <button
                        onClick={() => printMovement(k)}
                        title="Imprimir comprobante de este movimiento"
                        className="active-tap"
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 7,
                          border: "1px solid #e2e8f0",
                          backgroundColor: "#ffffff",
                          color: "#1e3a8a",
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Printer size={15} />
                      </button>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default KardexView;
