import React, { useEffect, useState, useCallback } from "react";
import { ArrowUp, ArrowDown } from "lucide-react";
import api from "../../services/api";
import {
  ui,
  type ViewProps,
  Toolbar,
  SearchInput,
  FilterSelect,
  Badge,
  TableState,
  SectionHeader,
  fmtDate,
  fmtTime,
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

const typeTone = (t: string): "green" | "red" | "amber" | "blue" | "slate" => {
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

  return (
    <div>
      <SectionHeader title="Kardex" subtitle="Movimientos de inventario registrados (entradas y salidas)" />

      <Toolbar>
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar por producto o SKU" />
        <FilterSelect
          value={movementType}
          onChange={setMovementType}
          options={[
            { value: "all", label: "Todos los movimientos" },
            { value: "COMPRA", label: "Compras" },
            { value: "VENTA", label: "Ventas" },
            { value: "DEVOLUCION", label: "Devoluciones" },
            { value: "AJUSTE_INVENTARIO", label: "Ajustes de inventario" },
            { value: "AJUSTE_MERMA", label: "Mermas" },
            { value: "TRASPASO_ENTRADA", label: "Traspaso entrada" },
            { value: "TRASPASO_SALIDA", label: "Traspaso salida" },
          ]}
        />
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          title="Desde"
          style={ui.filterSelect}
        />
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          title="Hasta"
          style={ui.filterSelect}
        />
        {(from || to) && (
          <button
            onClick={() => { setFrom(""); setTo(""); }}
            style={{ ...ui.ghostBtn, fontSize: 12 }}
          >
            ✕ Limpiar fechas
          </button>
        )}
        <span style={{ marginLeft: "auto", fontSize: 13, color: "#64748b", fontWeight: 600 }}>
          {rows.length} movimiento{rows.length === 1 ? "" : "s"}
        </span>
      </Toolbar>

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
              <th style={ui.th}>Motivo</th>
            </tr>
          </thead>
          <tbody>
            <TableState colSpan={9} loading={loading} error={error} empty={!loading && rows.length === 0} />
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
                    <td style={{ ...ui.td, color: "#475569" }}>{k.user}</td>
                    <td style={{ ...ui.td, whiteSpace: "normal", color: "#64748b", fontSize: 12, maxWidth: 260 }}>{k.reason || "—"}</td>
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
