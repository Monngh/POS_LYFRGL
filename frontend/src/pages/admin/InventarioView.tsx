import React, { useEffect, useState, useCallback } from "react";
import { AlertTriangle } from "lucide-react";
import api from "../../services/api";
import KardexView from "./KardexView";
import {
  ui,
  type ViewProps,
  Toolbar,
  SearchInput,
  Badge,
  TableState,
  SectionHeader,
  money,
} from "./shared";

interface ProductRow {
  id: number;
  sku: string;
  name: string;
  active: boolean;
  sellPrice: number;
  costPrice: number;
  stock: number;
  minStock: number;
  low: boolean;
  branchCount: number;
}

const InventarioView: React.FC<ViewProps> = ({ branchId, refreshToken }) => {
  const [activeTab, setActiveTab] = useState<"existencias" | "kardex">("existencias");
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ products: ProductRow[] }>("/api/admin/inventory", {
        params: {
          ...(branchId !== "all" ? { branchId } : {}),
          ...(search.trim() ? { search: search.trim() } : {}),
        },
      });
      setRows(res.data.products);
    } catch (err: any) {
      setError(err.response?.data?.message || "No se pudo cargar el inventario.");
    } finally {
      setLoading(false);
    }
  }, [branchId, search, refreshToken]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  const lowCount = rows.filter((r) => r.low).length;
  const scope = branchId !== "all" ? "en la sucursal seleccionada" : "consolidado de todas las sucursales";

  return (
    <div>
      <SectionHeader
        title="Inventario"
        subtitle={activeTab === "existencias" ? `Existencias ${scope}` : undefined}
      />

      <div style={{ display: "flex", gap: 0, marginBottom: 18, borderBottom: "1px solid #e2e8f0" }}>
        {(["existencias", "kardex"] as const).map((tab) => {
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                background: "none",
                border: "none",
                borderBottom: isActive ? "2px solid #3b82f6" : "2px solid transparent",
                marginBottom: -1,
                padding: "8px 20px",
                fontSize: 14,
                fontWeight: isActive ? 700 : 500,
                color: isActive ? "#1e3a8a" : "#64748b",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {tab === "existencias" ? "Existencias" : "Kardex"}
            </button>
          );
        })}
      </div>

      {activeTab === "kardex" && <KardexView branchId={branchId} refreshToken={refreshToken} />}

      {activeTab === "existencias" && (
        <>
          <Toolbar>
            <SearchInput value={search} onChange={setSearch} placeholder="Buscar por nombre o SKU" />
            {lowCount > 0 && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#b45309", fontSize: 13, fontWeight: 700 }}>
                <AlertTriangle size={16} /> {lowCount} con stock bajo
              </span>
            )}
            <span style={{ marginLeft: "auto", fontSize: 13, color: "#64748b", fontWeight: 600 }}>
              {rows.length} producto{rows.length === 1 ? "" : "s"}
            </span>
          </Toolbar>

          <div style={ui.tableWrap}>
            <table style={ui.table}>
              <thead>
                <tr style={ui.theadRow}>
                  <th style={ui.th}>SKU</th>
                  <th style={ui.th}>Producto</th>
                  <th style={{ ...ui.th, textAlign: "right" }}>Costo</th>
                  <th style={{ ...ui.th, textAlign: "right" }}>Precio</th>
                  <th style={{ ...ui.th, textAlign: "center" }}>Stock</th>
                  <th style={{ ...ui.th, textAlign: "center" }}>Mínimo</th>
                  <th style={{ ...ui.th, textAlign: "center" }}>Estado</th>
                </tr>
              </thead>
              <tbody>
                <TableState colSpan={7} loading={loading} error={error} empty={!loading && rows.length === 0} />
                {!loading &&
                  !error &&
                  rows.map((p) => (
                    <tr key={p.id} style={p.low ? { backgroundColor: "#fffbeb" } : undefined}>
                      <td style={{ ...ui.td, color: "#94a3b8", fontWeight: 600 }}>{p.sku}</td>
                      <td style={{ ...ui.td, fontWeight: 600, color: "#0f172a", whiteSpace: "normal" }}>{p.name}</td>
                      <td style={{ ...ui.td, textAlign: "right" }}>{money(p.costPrice)}</td>
                      <td style={{ ...ui.td, textAlign: "right", fontWeight: 700 }}>{money(p.sellPrice)}</td>
                      <td
                        style={{
                          ...ui.td,
                          textAlign: "center",
                          fontWeight: 800,
                          color: p.low ? "#b45309" : "#0f172a",
                        }}
                      >
                        {p.stock}
                      </td>
                      <td style={{ ...ui.td, textAlign: "center", color: "#64748b" }}>{p.minStock}</td>
                      <td style={{ ...ui.td, textAlign: "center" }}>
                        {!p.active ? (
                          <Badge tone="red">Inactivo</Badge>
                        ) : p.low ? (
                          <Badge tone="amber">Stock bajo</Badge>
                        ) : (
                          <Badge tone="green">Disponible</Badge>
                        )}
                      </td>
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

export default InventarioView;
