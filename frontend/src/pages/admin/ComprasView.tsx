import React, { useEffect, useState, useCallback } from "react";
import { Plus, Trash2, CheckCircle2 } from "lucide-react";
import api from "../../services/api";
import { ui, type ViewProps, Panel, TableState, SectionHeader, money, fmtDate, fmtTime } from "./shared";

interface BranchOption {
  id: number;
  name: string;
}
interface ProductOption {
  id: number;
  sku: string;
  name: string;
  costPrice: number;
}
interface KardexRow {
  id: number;
  createdAt: string;
  product: string;
  sku: string;
  branch: string;
  user: string;
  quantityChange: number;
  balanceAfter: number;
  reason: string | null;
}
interface Line {
  productId: string;
  quantity: string;
  unitCost: string;
}

const newLine = (): Line => ({ productId: "", quantity: "", unitCost: "" });

const ComprasView: React.FC<ViewProps> = ({ refreshToken }) => {
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);

  const [branchId, setBranchId] = useState("");
  const [supplier, setSupplier] = useState("");
  const [reference, setReference] = useState("");
  const [lines, setLines] = useState<Line[]>([newLine()]);

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [history, setHistory] = useState<KardexRow[]>([]);
  const [histLoading, setHistLoading] = useState(true);

  // Catálogos
  useEffect(() => {
    api.get<{ branches: BranchOption[] }>("/api/auth/branches").then((r) => setBranches(r.data.branches)).catch(() => {});
    api.get<{ products: ProductOption[] }>("/api/admin/inventory").then((r) => setProducts(r.data.products)).catch(() => {});
  }, []);

  const loadHistory = useCallback(async () => {
    setHistLoading(true);
    try {
      const res = await api.get<{ entries: KardexRow[] }>("/api/admin/kardex", { params: { movementType: "COMPRA" } });
      setHistory(res.data.entries);
    } catch {
      setHistory([]);
    } finally {
      setHistLoading(false);
    }
  }, [refreshToken]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const setLine = (i: number, k: keyof Line, v: string) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, [k]: v } : l)));

  const onPickProduct = (i: number, productId: string) => {
    const prod = products.find((p) => String(p.id) === productId);
    setLines((ls) =>
      ls.map((l, idx) => (idx === i ? { ...l, productId, unitCost: l.unitCost || (prod ? String(prod.costPrice) : "") } : l))
    );
  };

  const addLine = () => setLines((ls) => [...ls, newLine()]);
  const removeLine = (i: number) => setLines((ls) => (ls.length === 1 ? ls : ls.filter((_, idx) => idx !== i)));

  const totalEstimado = lines.reduce(
    (acc, l) => acc + (Number(l.quantity) || 0) * (Number(l.unitCost) || 0),
    0
  );

  const submit = async () => {
    setFormError(null);
    setSuccess(null);
    if (!branchId) {
      setFormError("Seleccione la sucursal de destino.");
      return;
    }
    const validLines = lines.filter((l) => l.productId && Number(l.quantity) > 0);
    if (validLines.length === 0) {
      setFormError("Agregue al menos un producto con cantidad mayor a 0.");
      return;
    }
    setSaving(true);
    try {
      const res = await api.post("/api/admin/purchases", {
        branchId: Number(branchId),
        supplier,
        reference,
        items: validLines.map((l) => ({
          productId: Number(l.productId),
          quantity: Number(l.quantity),
          unitCost: l.unitCost ? Number(l.unitCost) : undefined,
        })),
      });
      setSuccess(`${res.data.message} (${res.data.totalUnidades} unidades en ${res.data.branch})`);
      setLines([newLine()]);
      setSupplier("");
      setReference("");
      await loadHistory();
    } catch (err: any) {
      setFormError(err.response?.data?.message || "No se pudo registrar la compra.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <SectionHeader title="Compras" subtitle="Registro de entrada de mercancía (actualiza inventario y kardex)" />

      {/* Formulario de compra */}
      <Panel style={{ padding: 20, marginBottom: 22 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
          <div>
            <label style={ui.fieldLabel}>Sucursal de destino *</label>
            <select style={ui.input} value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              <option value="">Seleccione...</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={ui.fieldLabel}>Proveedor</label>
            <input style={ui.input} value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Nombre del proveedor" />
          </div>
          <div>
            <label style={ui.fieldLabel}>Referencia / Factura</label>
            <input style={ui.input} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Folio o nota" />
          </div>
        </div>

        <table style={ui.table}>
          <thead>
            <tr style={ui.theadRow}>
              <th style={ui.th}>Producto</th>
              <th style={{ ...ui.th, width: 120, textAlign: "center" }}>Cantidad</th>
              <th style={{ ...ui.th, width: 150, textAlign: "center" }}>Costo unitario</th>
              <th style={{ ...ui.th, width: 130, textAlign: "right" }}>Importe</th>
              <th style={{ ...ui.th, width: 50 }}></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i}>
                <td style={ui.td}>
                  <select style={{ ...ui.input, padding: "8px 10px" }} value={l.productId} onChange={(e) => onPickProduct(i, e.target.value)}>
                    <option value="">Seleccione producto...</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                    ))}
                  </select>
                </td>
                <td style={ui.td}>
                  <input style={{ ...ui.input, padding: "8px 10px", textAlign: "center" }} value={l.quantity} onChange={(e) => setLine(i, "quantity", e.target.value)} placeholder="0" />
                </td>
                <td style={ui.td}>
                  <input style={{ ...ui.input, padding: "8px 10px", textAlign: "center" }} value={l.unitCost} onChange={(e) => setLine(i, "unitCost", e.target.value)} placeholder="0.00" />
                </td>
                <td style={{ ...ui.td, textAlign: "right", fontWeight: 700 }}>
                  {money((Number(l.quantity) || 0) * (Number(l.unitCost) || 0))}
                </td>
                <td style={{ ...ui.td, textAlign: "center" }}>
                  <button onClick={() => removeLine(i)} style={{ background: "none", border: "none", cursor: "pointer" }} title="Quitar renglón">
                    <Trash2 size={16} color="#b91c1c" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14 }}>
          <button style={ui.ghostBtn} className="active-tap" onClick={addLine}>
            <Plus size={15} /> Agregar producto
          </button>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#334155" }}>
            Total estimado: <span style={{ color: "#1e3a8a", fontWeight: 800, marginLeft: 6 }}>{money(totalEstimado)}</span>
          </div>
        </div>

        {formError && <p style={{ color: "#b91c1c", fontSize: 13, fontWeight: 600, marginTop: 14 }}>{formError}</p>}
        {success && (
          <p style={{ color: "#15803d", fontSize: 13, fontWeight: 700, marginTop: 14, display: "flex", alignItems: "center", gap: 8 }}>
            <CheckCircle2 size={16} /> {success}
          </p>
        )}

        <div style={{ marginTop: 18, display: "flex", justifyContent: "flex-end" }}>
          <button style={ui.primaryBtn} className="active-tap" onClick={submit} disabled={saving}>
            {saving ? "Registrando..." : "Registrar compra"}
          </button>
        </div>
      </Panel>

      {/* Historial de compras (kardex COMPRA) */}
      <h3 style={{ fontSize: 15, fontWeight: 800, color: "#0f172a", marginBottom: 12 }}>Historial de entradas</h3>
      <div style={ui.tableWrap}>
        <table style={ui.table}>
          <thead>
            <tr style={ui.theadRow}>
              <th style={ui.th}>Fecha</th>
              <th style={ui.th}>Producto</th>
              <th style={ui.th}>Sucursal</th>
              <th style={{ ...ui.th, textAlign: "center" }}>Entrada</th>
              <th style={{ ...ui.th, textAlign: "center" }}>Saldo</th>
              <th style={ui.th}>Registró</th>
              <th style={ui.th}>Detalle</th>
            </tr>
          </thead>
          <tbody>
            <TableState colSpan={7} loading={histLoading} empty={!histLoading && history.length === 0} emptyText="Aún no hay compras registradas." />
            {!histLoading &&
              history.map((k) => (
                <tr key={k.id}>
                  <td style={ui.td}>{fmtDate(k.createdAt)} <span style={{ color: "#94a3b8" }}>{fmtTime(k.createdAt)}</span></td>
                  <td style={{ ...ui.td, whiteSpace: "normal" }}>
                    <div style={{ fontWeight: 600, color: "#0f172a" }}>{k.product}</div>
                    <div style={{ fontSize: 11, color: "#94a3b8" }}>{k.sku}</div>
                  </td>
                  <td style={ui.td}>{k.branch}</td>
                  <td style={{ ...ui.td, textAlign: "center", fontWeight: 800, color: "#15803d" }}>+{k.quantityChange}</td>
                  <td style={{ ...ui.td, textAlign: "center", fontWeight: 700 }}>{k.balanceAfter}</td>
                  <td style={{ ...ui.td, color: "#475569" }}>{k.user}</td>
                  <td style={{ ...ui.td, whiteSpace: "normal", color: "#64748b", fontSize: 12, maxWidth: 260 }}>{k.reason || "—"}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ComprasView;
