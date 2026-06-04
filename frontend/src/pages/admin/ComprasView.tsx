import React, { useEffect, useState, useCallback } from "react";
import { Plus, Trash2, CheckCircle2, Package } from "lucide-react";
import api from "../../services/api";
import {
  ui,
  type ViewProps,
  Panel,
  TableState,
  SectionHeader,
  Badge,
  FilterSelect,
  Toolbar,
  money,
  fmtDate,
  fmtTime,
} from "./shared";

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
interface SupplierOption {
  id: number;
  name: string;
}
interface PurchaseRow {
  id: number;
  reference: string;
  purchaseDate: string;
  supplier: { id: number; name: string };
  branch: { id: number; name: string };
  subtotal: number;
  tax: number;
  total: number;
  status: string;
  notes?: string;
  details: Array<{
    id: number;
    productId: number;
    quantity: number;
    unitCost: number;
    subtotal: number;
    product: { id: number; sku: string; name: string };
  }>;
  createdByUser: { id: number; name: string };
}
// KardexRow kept for backward compatibility (unused after refactor)
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

const statusTone = (s: string) =>
  s === "RECIBIDA" ? "green" : s === "CANCELADA" ? "red" : "amber";

const ComprasView: React.FC<ViewProps> = ({ refreshToken }) => {
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);

  // Formulario nueva orden
  const [branchId, setBranchId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([newLine()]);

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Historial de órdenes
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [purchasesLoading, setPurchasesLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterSupplierId, setFilterSupplierId] = useState("all");
  const [receiving, setReceiving] = useState<number | null>(null);

  // Catálogos
  useEffect(() => {
    api
      .get<{ branches: BranchOption[] }>("/api/auth/branches")
      .then((r) => setBranches(r.data.branches))
      .catch(() => {});
    api
      .get<{ products: ProductOption[] }>("/api/admin/inventory")
      .then((r) => setProducts(r.data.products))
      .catch(() => {});
    api
      .get<SupplierOption[]>("/api/admin/suppliers")
      .then((r) => setSuppliers(r.data))
      .catch(() => {});
  }, []);

  const loadPurchases = useCallback(async () => {
    setPurchasesLoading(true);
    try {
      const res = await api.get<PurchaseRow[]>("/api/admin/purchases");
      setPurchases(res.data);
    } catch {
      setPurchases([]);
    } finally {
      setPurchasesLoading(false);
    }
  }, [refreshToken]);

  useEffect(() => {
    loadPurchases();
  }, [loadPurchases]);

  const setLine = (i: number, k: keyof Line, v: string) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, [k]: v } : l)));

  const onPickProduct = (i: number, productId: string) => {
    const prod = products.find((p) => String(p.id) === productId);
    setLines((ls) =>
      ls.map((l, idx) =>
        idx === i
          ? { ...l, productId, unitCost: l.unitCost || (prod ? String(prod.costPrice) : "") }
          : l
      )
    );
  };

  const addLine = () => setLines((ls) => [...ls, newLine()]);
  const removeLine = (i: number) =>
    setLines((ls) => (ls.length === 1 ? ls : ls.filter((_, idx) => idx !== i)));

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
    if (!supplierId) {
      setFormError("Seleccione el proveedor.");
      return;
    }
    if (!reference.trim()) {
      setFormError("Ingrese la referencia o folio de la compra.");
      return;
    }
    const validLines = lines.filter((l) => l.productId && Number(l.quantity) > 0);
    if (validLines.length === 0) {
      setFormError("Agregue al menos un producto con cantidad mayor a 0.");
      return;
    }
    setSaving(true);
    try {
      const res = await api.post<PurchaseRow>("/api/admin/purchases", {
        supplierId: Number(supplierId),
        branchId: Number(branchId),
        reference: reference.trim(),
        notes: notes.trim() || undefined,
        details: validLines.map((l) => ({
          productId: Number(l.productId),
          quantity: Number(l.quantity),
          unitCost: l.unitCost ? Number(l.unitCost) : 0,
        })),
      });
      setSuccess(
        `Orden #${res.data.id} creada (${res.data.reference}) — Proveedor: ${res.data.supplier.name}. Total: ${money(Number(res.data.total))}. Estado: PENDIENTE.`
      );
      setLines([newLine()]);
      setSupplierId("");
      setReference("");
      setNotes("");
      await loadPurchases();
    } catch (err: any) {
      setFormError(err.response?.data?.message || "No se pudo registrar la compra.");
    } finally {
      setSaving(false);
    }
  };

  const receive = async (purchaseId: number) => {
    setReceiving(purchaseId);
    try {
      await api.put(`/api/admin/purchases/${purchaseId}/receive`);
      await loadPurchases();
    } catch (err: any) {
      alert(err.response?.data?.message || "Error al recibir la compra.");
    } finally {
      setReceiving(null);
    }
  };

  const filteredPurchases = purchases.filter((p) => {
    if (filterStatus !== "all" && p.status !== filterStatus) return false;
    if (filterSupplierId !== "all" && String(p.supplier.id) !== filterSupplierId) return false;
    return true;
  });

  return (
    <div>
      <SectionHeader
        title="Compras"
        subtitle="Órdenes de compra — el inventario se actualiza al recibir la mercancía"
      />

      {/* Formulario nueva orden */}
      <Panel style={{ padding: 20, marginBottom: 22 }}>
        <div
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}
        >
          <div>
            <label style={ui.fieldLabel}>Sucursal de destino *</label>
            <select
              style={ui.input}
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
            >
              <option value="">Seleccione...</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={ui.fieldLabel}>Proveedor *</label>
            <select
              style={ui.input}
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
            >
              <option value="">Seleccione proveedor...</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={ui.fieldLabel}>Referencia / Factura *</label>
            <input
              style={ui.input}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Folio o nota"
            />
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={ui.fieldLabel}>Notas (opcional)</label>
          <textarea
            style={{ ...ui.input, resize: "vertical", minHeight: 52, fontSize: 13 }}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Observaciones sobre la compra..."
          />
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
                  <select
                    style={{ ...ui.input, padding: "8px 10px" }}
                    value={l.productId}
                    onChange={(e) => onPickProduct(i, e.target.value)}
                  >
                    <option value="">Seleccione producto...</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.sku})
                      </option>
                    ))}
                  </select>
                </td>
                <td style={ui.td}>
                  <input
                    style={{ ...ui.input, padding: "8px 10px", textAlign: "center" }}
                    value={l.quantity}
                    onChange={(e) => setLine(i, "quantity", e.target.value)}
                    placeholder="0"
                  />
                </td>
                <td style={ui.td}>
                  <input
                    style={{ ...ui.input, padding: "8px 10px", textAlign: "center" }}
                    value={l.unitCost}
                    onChange={(e) => setLine(i, "unitCost", e.target.value)}
                    placeholder="0.00"
                  />
                </td>
                <td style={{ ...ui.td, textAlign: "right", fontWeight: 700 }}>
                  {money((Number(l.quantity) || 0) * (Number(l.unitCost) || 0))}
                </td>
                <td style={{ ...ui.td, textAlign: "center" }}>
                  <button
                    onClick={() => removeLine(i)}
                    style={{ background: "none", border: "none", cursor: "pointer" }}
                    title="Quitar renglón"
                  >
                    <Trash2 size={16} color="#b91c1c" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 14,
          }}
        >
          <button style={ui.ghostBtn} className="active-tap" onClick={addLine}>
            <Plus size={15} /> Agregar producto
          </button>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#334155" }}>
            Subtotal estimado:{" "}
            <span style={{ color: "#1e3a8a", fontWeight: 800, marginLeft: 6 }}>
              {money(totalEstimado)}
            </span>
            <span style={{ color: "#64748b", fontSize: 12, fontWeight: 500, marginLeft: 8 }}>
              + IVA 16% = {money(totalEstimado * 1.16)}
            </span>
          </div>
        </div>

        {formError && (
          <p style={{ color: "#b91c1c", fontSize: 13, fontWeight: 600, marginTop: 14 }}>
            {formError}
          </p>
        )}
        {success && (
          <p
            style={{
              color: "#15803d",
              fontSize: 13,
              fontWeight: 700,
              marginTop: 14,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <CheckCircle2 size={16} /> {success}
          </p>
        )}

        <div style={{ marginTop: 18, display: "flex", justifyContent: "flex-end" }}>
          <button
            style={ui.primaryBtn}
            className="active-tap"
            onClick={submit}
            disabled={saving}
          >
            {saving ? "Guardando..." : "Crear orden de compra"}
          </button>
        </div>
      </Panel>

      {/* Historial de órdenes de compra */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <h3 style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>
          Órdenes de compra
        </h3>
        <Toolbar>
          <FilterSelect
            value={filterStatus}
            onChange={setFilterStatus}
            options={[
              { value: "all", label: "Todos los estados" },
              { value: "PENDIENTE", label: "Pendiente" },
              { value: "RECIBIDA", label: "Recibida" },
              { value: "CANCELADA", label: "Cancelada" },
            ]}
          />
          <FilterSelect
            value={filterSupplierId}
            onChange={setFilterSupplierId}
            options={[
              { value: "all", label: "Todos los proveedores" },
              ...suppliers.map((s) => ({ value: String(s.id), label: s.name })),
            ]}
          />
        </Toolbar>
      </div>

      <div style={ui.tableWrap}>
        <table style={ui.table}>
          <thead>
            <tr style={ui.theadRow}>
              <th style={ui.th}>Fecha</th>
              <th style={ui.th}>Proveedor</th>
              <th style={ui.th}>Sucursal</th>
              <th style={ui.th}>Referencia</th>
              <th style={{ ...ui.th, textAlign: "center" }}>Artículos</th>
              <th style={{ ...ui.th, textAlign: "right" }}>Total</th>
              <th style={{ ...ui.th, textAlign: "center" }}>Estado</th>
              <th style={ui.th}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            <TableState
              colSpan={8}
              loading={purchasesLoading}
              empty={!purchasesLoading && filteredPurchases.length === 0}
              emptyText="No hay órdenes de compra con los filtros seleccionados."
            />
            {!purchasesLoading &&
              filteredPurchases.map((p) => (
                <tr key={p.id}>
                  <td style={ui.td}>
                    {fmtDate(p.purchaseDate)}{" "}
                    <span style={{ color: "#94a3b8" }}>{fmtTime(p.purchaseDate)}</span>
                  </td>
                  <td style={{ ...ui.td, fontWeight: 600, color: "#0f172a" }}>
                    {p.supplier.name}
                  </td>
                  <td style={ui.td}>{p.branch.name}</td>
                  <td style={ui.td}>{p.reference}</td>
                  <td style={{ ...ui.td, textAlign: "center" }}>
                    <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                      <Package size={13} color="#64748b" />
                      {p.details.length}
                    </span>
                  </td>
                  <td style={{ ...ui.td, textAlign: "right", fontWeight: 700, color: "#1e3a8a" }}>
                    {money(Number(p.total))}
                  </td>
                  <td style={{ ...ui.td, textAlign: "center" }}>
                    <Badge tone={statusTone(p.status)}>{p.status}</Badge>
                  </td>
                  <td style={ui.td}>
                    {p.status === "PENDIENTE" ? (
                      <button
                        style={{
                          ...ui.primaryBtn,
                          fontSize: 12,
                          padding: "6px 12px",
                          height: 30,
                          backgroundColor: "#15803d",
                        }}
                        onClick={() => receive(p.id)}
                        disabled={receiving === p.id}
                      >
                        {receiving === p.id ? "Recibiendo..." : "✓ Recibir"}
                      </button>
                    ) : (
                      <span style={{ color: "#94a3b8", fontSize: 12 }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ComprasView;
