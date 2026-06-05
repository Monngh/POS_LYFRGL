import React, { useEffect, useRef, useState, useCallback } from "react";
import { AlertTriangle, Printer, X, Plus, BadgePercent } from "lucide-react";
import api from "../../services/api";
import KardexView from "./KardexView";
import {
  ui,
  type ViewProps,
  Toolbar,
  SearchInput,
  FilterSelect,
  Badge,
  TableState,
  SectionHeader,
  money,
  fmtDate,
  fmtTime,
  printHtml,
} from "./shared";

interface ProductRow {
  id: number;
  sku: string;
  barcode: string | null;
  name: string;
  description: string | null;
  active: boolean;
  sellPrice: number;
  costPrice: number;
  stock: number;
  minStock: number;
  low: boolean;
  branchCount: number;
}

interface ProductDetail {
  id: number;
  sku: string;
  barcode: string | null;
  name: string;
  description: string | null;
  costPrice: number;
  sellPrice: number;
  active: boolean;
  trackingType: string;
  isReturnable: boolean;
  returnWindowDays: number;
  createdAt: string;
  updatedAt: string;
  inventories: {
    id: number;
    branch: string;
    branchId: number;
    quantity: number;
    minStock: number;
    maxStock: number;
  }[];
  recentKardex: {
    id: number;
    date: string;
    branch: string;
    user: string;
    movementType: string;
    quantityChange: number;
    balanceAfter: number;
    reason: string | null;
  }[];
}

interface SupplierOption {
  id: number;
  name: string;
}

const subModalStyle: React.CSSProperties = {
  ...({} as any),
  position: "fixed",
  inset: 0,
  backgroundColor: "rgba(15,23,42,0.55)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 300,
  padding: 20,
};

interface TaxOption {
  id: number;
  name: string;
  description: string | null;
  rate: number | string;
  active: boolean;
}

interface TaxListResponse {
  data: TaxOption[];
}

interface ProductTaxResponse {
  data: {
    productId: number;
    taxIds: number[];
    taxes: TaxOption[];
  };
}

const emptyForm = { sku: "", barcode: "", name: "", description: "", costPrice: "", sellPrice: "" };

const getErrorMessage = (err: unknown, fallback: string) => {
  if (typeof err === "object" && err !== null && "response" in err) {
    const apiError = err as { response?: { data?: { message?: string } } };
    return apiError.response?.data?.message || fallback;
  }

  return fallback;
};

const extractTaxOptions = (payload: TaxListResponse | { data?: unknown }) => {
  return Array.isArray(payload.data) ? payload.data as TaxOption[] : [];
};

const formatTaxRate = (rate: number | string) => {
  const value = Number(rate);
  const percent = Number.isFinite(value) ? value * 100 : 0;
  return `${percent.toLocaleString("es-MX", {
    minimumFractionDigits: percent % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 4,
  })}%`;
};

const InventarioView: React.FC<ViewProps> = ({ branchId, refreshToken }) => {
  const [activeTab, setActiveTab] = useState<"existencias" | "kardex">("existencias");
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);

  // Detail modal
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Feature 1: edit prices
  const [editMode, setEditMode] = useState(false);
  const [editCost, setEditCost] = useState(0);
  const [editPrice, setEditPrice] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Feature 2: adjust stock
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustBranch, setAdjustBranch] = useState(0);
  const [adjustType, setAdjustType] = useState("");
  const [adjustQuantity, setAdjustQuantity] = useState(0);
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustError, setAdjustError] = useState<string | null>(null);

  // Feature 3: transfer
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferFrom, setTransferFrom] = useState(0);
  const [transferTo, setTransferTo] = useState(0);
  const [transferQty, setTransferQty] = useState(0);
  const [transferError, setTransferError] = useState<string | null>(null);


  // Suppliers catalog (shared between create + detail modals)
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);

  const [productSuppliers, setProductSuppliers] = useState<number[]>([]);
  const [editingSuppliersMode, setEditingSuppliersMode] = useState(false);
  const [suppliersError, setSuppliersError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [taxOptions, setTaxOptions] = useState<TaxOption[]>([]);
  const [selectedTaxIds, setSelectedTaxIds] = useState<number[]>([]);
  const [taxLoading, setTaxLoading] = useState(false);
  const [taxError, setTaxError] = useState<string | null>(null);
  const taxRequestId = useRef(0);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const closeForm = () => {
    if (saving) return;
    taxRequestId.current += 1;
    setShowForm(false);
    setEditingId(null);
    setFormError(null);
    setTaxError(null);
    setTaxOptions([]);
    setSelectedTaxIds([]);
  };

  const loadProductTaxes = async (productId: number) => {
    const requestId = taxRequestId.current + 1;
    taxRequestId.current = requestId;
    setTaxLoading(true);
    setTaxError(null);
    setTaxOptions([]);
    setSelectedTaxIds([]);

    try {
      const [taxesRes, productTaxesRes] = await Promise.all([
        api.get<TaxListResponse>("/api/admin-tax/taxes"),
        api.get<ProductTaxResponse>(`/api/admin-tax/products/${productId}/taxes`),
      ]);

      if (taxRequestId.current !== requestId) return;

      const activeTaxes = extractTaxOptions(taxesRes.data).filter((tax) => tax.active);
      setTaxOptions(activeTaxes);
      setSelectedTaxIds(productTaxesRes.data.data.taxIds);
    } catch (err: unknown) {
      if (taxRequestId.current !== requestId) return;
      setTaxError(getErrorMessage(err, "No se pudieron cargar los impuestos del producto."));
    } finally {
      if (taxRequestId.current === requestId) {
        setTaxLoading(false);
      }
    }
  };

  const toggleTax = (taxId: number) => {
    setSelectedTaxIds((current) =>
      current.includes(taxId)
        ? current.filter((id) => id !== taxId)
        : [...current, taxId]
    );
  };

  const handleOpenCreate = () => {
    taxRequestId.current += 1;
    setForm({ ...emptyForm });
    setEditingId(null);
    setFormError(null);
    setTaxError(null);
    setTaxOptions([]);
    setSelectedTaxIds([]);
    setShowForm(true);
  };

  const handleEdit = (p: ProductRow | ProductDetail) => {
    closeDetail();
    setForm({
      sku: p.sku,
      barcode: p.barcode || "",
      name: p.name,
      description: p.description || "",
      costPrice: String(p.costPrice),
      sellPrice: String(p.sellPrice),
    });
    setEditingId(p.id);
    setFormError(null);
    setShowForm(true);
    void loadProductTaxes(p.id);
  };

  const handleToggleActive = async (p: ProductRow | ProductDetail) => {
    try {
      if (p.active) {
        // Soft delete (desactivar)
        await api.delete(`/api/admin/products/${p.id}`);
      } else {
        // Activar (usando PUT con active: true)
        await api.put(`/api/admin/products/${p.id}`, {
          name: p.name,
          description: p.description || undefined,
          barcode: p.barcode || undefined,
          costPrice: p.costPrice,
          sellPrice: p.sellPrice,
          active: true,
        });
      }
      if (detailOpen && selectedProduct?.id === p.id) {
        await fetchDetail(p.id);
      }
      await load();
    } catch (err: unknown) {
      alert(getErrorMessage(err, "No se pudo cambiar el estado del producto."));
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.sku.trim()) {
      setFormError("El SKU es obligatorio.");
      return;
    }
    if (!form.name.trim()) {
      setFormError("El nombre del producto es obligatorio.");
      return;
    }
    const cost = parseFloat(form.costPrice);
    const sell = parseFloat(form.sellPrice);

    if (isNaN(cost) || cost <= 0) {
      setFormError("El precio de costo debe ser mayor a 0.");
      return;
    }
    if (isNaN(sell) || sell <= 0) {
      setFormError("El precio de venta debe ser mayor a 0.");
      return;
    }
    if (editingId !== null && taxLoading) {
      setFormError("Espere a que terminen de cargar los impuestos del producto.");
      return;
    }
    if (editingId !== null && taxError) {
      setFormError("No se puede guardar hasta cargar correctamente los impuestos aplicables.");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      if (editingId !== null) {
        // Modo Edición
        await api.put(`/api/admin/products/${editingId}`, {
          name: form.name.trim(),
          barcode: form.barcode.trim() || undefined,
          description: form.description.trim() || undefined,
          costPrice: cost,
          sellPrice: sell,
        });
        await api.put(`/api/admin-tax/products/${editingId}/taxes`, {
          taxIds: selectedTaxIds,
        });
      } else {
        // Modo Creación
        await api.post("/api/admin/products", {
          sku: form.sku.trim(),
          barcode: form.barcode.trim() || undefined,
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          costPrice: cost,
          sellPrice: sell,
        });
      }
      setShowForm(false);
      setForm({ ...emptyForm });
      setEditingId(null);
      setTaxOptions([]);
      setSelectedTaxIds([]);
      await load();
    } catch (err: unknown) {
      setFormError(getErrorMessage(err, "No se pudo guardar el producto."));
    } finally {
      setSaving(false);
    }
  };

  const load = useCallback(async () => {
    void refreshToken;
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
    } catch (err: unknown) {
      setError(getErrorMessage(err, "No se pudo cargar el inventario."));
    } finally {
      setLoading(false);
    }
  }, [branchId, search, refreshToken]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    api
      .get<SupplierOption[]>("/api/admin/suppliers")
      .then((r) => setSuppliers(r.data))
      .catch(() => { });
  }, []);

  const fetchDetail = async (id: number) => {
    const res = await api.get<{ product: ProductDetail }>(`/api/admin/products/${id}`);
    setSelectedProduct(res.data.product);
    setEditCost(res.data.product.costPrice);
    setEditPrice(res.data.product.sellPrice);
  };

  const openProductDetail = useCallback(async (id: number) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailError(null);
    setSelectedProduct(null);
    setEditMode(false);
    setSaveError(null);
    setEditingSuppliersMode(false);
    setProductSuppliers([]);
    setSuppliersError(null);
    try {
      await fetchDetail(id);
      const spRes = await api.get<SupplierOption[]>(`/api/admin/products/${id}/suppliers`);
      setProductSuppliers(spRes.data.map((s) => s.id));
    } catch (err: any) {
      setDetailError(err.response?.data?.message || "No se pudo cargar el detalle del producto.");
    } finally {
      setDetailLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const closeDetail = () => {
    setDetailOpen(false);
    setEditMode(false);
    setAdjustOpen(false);
    setTransferOpen(false);
    setEditingSuppliersMode(false);
    setProductSuppliers([]);
    setSuppliersError(null);
  };

  const printProduct = useCallback(() => {
    if (!selectedProduct) return;
    const p = selectedProduct;
    const invRows = p.inventories
      .map(
        (inv) => `
      <tr>
        <td>${inv.branch}</td>
        <td class="c">${inv.quantity}</td>
        <td class="c">${inv.minStock}</td>
        <td class="c">${inv.maxStock}</td>
        <td class="c" style="color:${inv.quantity <= inv.minStock ? "#b45309" : "#15803d"}">${inv.quantity <= inv.minStock ? "Stock bajo" : "OK"}</td>
      </tr>`
      )
      .join("");
    const kardexRows = p.recentKardex
      .map(
        (k) => `
      <tr>
        <td>${fmtDate(k.date)}</td>
        <td>${k.branch}</td>
        <td>${k.movementType.replace(/_/g, " ")}</td>
        <td class="c" style="color:${k.quantityChange >= 0 ? "#15803d" : "#b91c1c"}">${k.quantityChange >= 0 ? "+" : ""}${k.quantityChange}</td>
        <td class="c">${k.balanceAfter}</td>
        <td>${k.reason || "—"}</td>
      </tr>`
      )
      .join("");
    printHtml(
      `Producto: ${p.name}`,
      `
      <div class="doc-header">
        <div><div class="doc-brand">LYFRGL POS</div><div class="doc-sub">Ficha de Producto</div></div>
        <div>
          <div class="doc-title">${p.name}</div>
          <div class="doc-meta">SKU: ${p.sku}${p.barcode ? ` · Barcode: ${p.barcode}` : ""}</div>
        </div>
      </div>
      <div class="kpis">
        <div class="kpi"><div class="l">Costo</div><div class="v">${money(p.costPrice)}</div></div>
        <div class="kpi"><div class="l">Precio venta</div><div class="v">${money(p.sellPrice)}</div></div>
        <div class="kpi"><div class="l">Estado</div><div class="v">${p.active ? "Activo" : "Inactivo"}</div></div>
        <div class="kpi"><div class="l">Sucursales</div><div class="v">${p.inventories.length}</div></div>
      </div>
      <h3>Stock por sucursal</h3>
      <table>
        <thead><tr><th>Sucursal</th><th class="c">Stock</th><th class="c">Mínimo</th><th class="c">Máximo</th><th class="c">Estado</th></tr></thead>
        <tbody>${invRows || '<tr><td colspan="5" class="c">Sin inventario registrado</td></tr>'}</tbody>
      </table>
      <h3>Últimos movimientos Kardex</h3>
      <table>
        <thead><tr><th>Fecha</th><th>Sucursal</th><th>Tipo</th><th class="c">Cambio</th><th class="c">Saldo</th><th>Motivo</th></tr></thead>
        <tbody>${kardexRows || '<tr><td colspan="6" class="c">Sin movimientos registrados</td></tr>'}</tbody>
      </table>`
    );
  }, [selectedProduct]);

  // Feature 1: save price/cost edits
  const saveProductChanges = async () => {
    if (!selectedProduct) return;
    setSaveError(null);
    try {
      await api.put(`/api/admin/products/${selectedProduct.id}`, {
        costPrice: editCost,
        sellPrice: editPrice,
      });
      await fetchDetail(selectedProduct.id);
      setEditMode(false);
      load();
    } catch (err: any) {
      setSaveError(err.response?.data?.message || "Error al guardar.");
    }
  };

  // Feature 2: submit stock adjustment
  const submitAdjustment = async () => {
    if (!selectedProduct) return;
    setAdjustError(null);
    if (!adjustBranch || !adjustType || !adjustQuantity || !adjustReason.trim()) {
      setAdjustError("Completa todos los campos.");
      return;
    }
    const quantityChange =
      adjustType === "AJUSTE_INVENTARIO" ? Math.abs(adjustQuantity) : -Math.abs(adjustQuantity);
    try {
      await api.post("/api/admin/inventory/adjust", {
        productId: selectedProduct.id,
        branchId: adjustBranch,
        quantityChange,
        movementType: adjustType,
        reason: adjustReason.trim(),
      });
      await fetchDetail(selectedProduct.id);
      load();
      setAdjustOpen(false);
      setAdjustBranch(0);
      setAdjustType("");
      setAdjustQuantity(0);
      setAdjustReason("");
    } catch (err: any) {
      setAdjustError(err.response?.data?.message || "Error al aplicar ajuste.");
    }
  };

  // Feature 3: submit transfer
  const submitTransfer = async () => {
    if (!selectedProduct) return;
    setTransferError(null);
    if (!transferFrom || !transferTo || !transferQty) {
      setTransferError("Completa todos los campos.");
      return;
    }
    try {
      await api.post("/api/admin/inventory/transfer", {
        productId: selectedProduct.id,
        fromBranch: transferFrom,
        toBranch: transferTo,
        quantity: transferQty,
      });
      await fetchDetail(selectedProduct.id);
      load();
      setTransferOpen(false);
      setTransferFrom(0);
      setTransferTo(0);
      setTransferQty(0);
    } catch (err: any) {
      setTransferError(err.response?.data?.message || "Error al trasladar.");
    }
  };

  const saveSuppliersChanges = async () => {
    if (!selectedProduct) return;
    setSuppliersError(null);
    try {
      const res = await api.get<SupplierOption[]>(`/api/admin/products/${selectedProduct.id}/suppliers`);
      const oldIds = res.data.map((s) => s.id);

      for (const supplierId of oldIds) {
        if (!productSuppliers.includes(supplierId)) {
          await api.post("/api/admin/suppliers/products/remove", { supplierId, productId: selectedProduct.id });
        }
      }
      for (const supplierId of productSuppliers) {
        if (!oldIds.includes(supplierId)) {
          await api.post("/api/admin/suppliers/products/assign", { supplierId, productId: selectedProduct.id });
        }
      }
      setEditingSuppliersMode(false);
    } catch (err: any) {
      setSuppliersError(err.response?.data?.message || "Error al guardar proveedores.");
    }
  };

  const filteredRows = rows.filter((p) => {
    if (statusFilter === "disponible") return p.active && !p.low;
    if (statusFilter === "bajo") return p.active && p.low;
    if (statusFilter === "inactivo") return !p.active;
    return true;
  });

  const lowCount = filteredRows.filter((r) => r.low).length;
  const scope = branchId !== "all" ? "en la sucursal seleccionada" : "consolidado de todas las sucursales";

  const liveMargem =
    editPrice > 0
      ? (((editPrice - editCost) / editPrice) * 100).toFixed(1)
      : "—";

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
            <FilterSelect
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: "all", label: "Todos los estados" },
                { value: "disponible", label: "Disponible" },
                { value: "bajo", label: "Stock bajo" },
                { value: "inactivo", label: "Inactivo" },
              ]}
            />
            {lowCount > 0 && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#b45309", fontSize: 13, fontWeight: 700 }}>
                <AlertTriangle size={16} /> {lowCount} con stock bajo
              </span>
            )}
            <span style={{ marginLeft: "auto", fontSize: 13, color: "#64748b", fontWeight: 600 }}>
              {filteredRows.length} producto{filteredRows.length === 1 ? "" : "s"}
            </span>
            <button onClick={handleOpenCreate} style={ui.primaryBtn}>
              <Plus size={15} /> Nuevo producto
            </button>
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
                <TableState colSpan={7} loading={loading} error={error} empty={!loading && filteredRows.length === 0} />
                {!loading &&
                  !error &&
                  filteredRows.map((p) => (
                    <tr
                      key={p.id}
                      onClick={() => openProductDetail(p.id)}
                      onMouseEnter={() => setHoveredRow(p.id)}
                      onMouseLeave={() => setHoveredRow(null)}
                      style={{
                        cursor: "pointer",
                        backgroundColor:
                          hoveredRow === p.id
                            ? "#eff6ff"
                            : p.low
                              ? "#fffbeb"
                              : undefined,
                      }}
                    >
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

      {/* =================== MODAL DETALLE =================== */}
      {detailOpen && (
        <div style={ui.overlay} onClick={closeDetail}>
          <div style={{ ...ui.modal, maxWidth: 680 }} onClick={(e) => e.stopPropagation()}>
            <div style={ui.modalHeader}>
              <div>
                <div style={ui.modalTitle}>
                  {selectedProduct ? selectedProduct.name : "Cargando…"}
                </div>
                {selectedProduct && (
                  <div style={{ fontSize: 12, color: "#64748b", marginTop: 3 }}>
                    SKU: {selectedProduct.sku}
                    {selectedProduct.barcode ? ` · Barcode: ${selectedProduct.barcode}` : ""}
                  </div>
                )}
              </div>
              <button onClick={closeDetail} style={{ ...ui.ghostBtn, padding: "6px 10px" }}>
                <X size={16} />
              </button>
            </div>

            <div style={ui.modalBody}>
              {detailLoading && (
                <p style={{ textAlign: "center", color: "#94a3b8", padding: "32px 0" }}>Cargando detalle…</p>
              )}
              {detailError && (
                <p style={{ textAlign: "center", color: "#b91c1c", padding: "32px 0" }}>{detailError}</p>
              )}
              {selectedProduct && !detailLoading && (
                <>
                  {/* ── Precios (con modo edición) ── */}
                  <div style={{ ...({} as any), border: "1px solid #e2e8f0", borderRadius: 10, padding: 16, marginBottom: 20 }}>
                    {!editMode ? (
                      <>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 12 }}>
                          {[
                            { label: "Costo", value: money(selectedProduct.costPrice) },
                            { label: "Precio venta", value: money(selectedProduct.sellPrice) },
                            {
                              label: "Margen",
                              value:
                                selectedProduct.sellPrice > 0
                                  ? `${(((selectedProduct.sellPrice - selectedProduct.costPrice) / selectedProduct.sellPrice) * 100).toFixed(1)}%`
                                  : "—",
                            },
                            { label: "Estado", value: selectedProduct.active ? "Activo" : "Inactivo" },
                          ].map((kpi) => (
                            <div key={kpi.label} style={ui.kpiCard}>
                              <div style={ui.kpiLabel}>{kpi.label}</div>
                              <div style={{ ...ui.kpiValue, fontSize: 17 }}>{kpi.value}</div>
                            </div>
                          ))}
                        </div>
                        <button
                          onClick={() => { setEditMode(true); setSaveError(null); }}
                          style={{
                            ...ui.ghostBtn,
                            fontSize: 12,
                            color: "#2563eb",
                            borderColor: "#93c5fd",
                          }}
                        >
                          ✏️ Editar precios
                        </button>
                      </>
                    ) : (
                      <>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                          <div>
                            <label style={ui.fieldLabel}>Costo</label>
                            <input
                              type="number"
                              value={editCost}
                              onChange={(e) => setEditCost(parseFloat(e.target.value) || 0)}
                              step="0.01"
                              style={ui.input}
                            />
                          </div>
                          <div>
                            <label style={ui.fieldLabel}>Precio venta</label>
                            <input
                              type="number"
                              value={editPrice}
                              onChange={(e) => setEditPrice(parseFloat(e.target.value) || 0)}
                              step="0.01"
                              style={ui.input}
                            />
                          </div>
                        </div>
                        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 12 }}>
                          Margen calculado: <strong style={{ color: "#0f172a" }}>{liveMargem}%</strong>
                        </div>
                        {saveError && (
                          <p style={{ fontSize: 12, color: "#b91c1c", marginBottom: 10 }}>{saveError}</p>
                        )}
                        <div style={{ display: "flex", gap: 8 }}>
                          <button onClick={saveProductChanges} style={ui.primaryBtn}>✓ Guardar</button>
                          <button onClick={() => { setEditMode(false); setSaveError(null); }} style={ui.ghostBtn}>✕ Cancelar</button>
                        </div>
                      </>
                    )}
                  </div>

                  {/* ── Badges de atributos ── */}
                  <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
                    {!selectedProduct.active && <Badge tone="red">Inactivo</Badge>}
                    {selectedProduct.isReturnable && (
                      <Badge tone="green">Retornable ({selectedProduct.returnWindowDays}d)</Badge>
                    )}
                    {selectedProduct.trackingType !== "NONE" && (
                      <Badge tone="blue">Tracking: {selectedProduct.trackingType}</Badge>
                    )}
                    {selectedProduct.description && (
                      <span style={{ fontSize: 12, color: "#64748b" }}>{selectedProduct.description}</span>
                    )}
                  </div>

                  {/* ── Stock por sucursal ── */}
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#1e3a8a", marginBottom: 10 }}>
                      Stock por sucursal
                    </div>
                    <div style={{ ...ui.tableWrap, boxShadow: "none" }}>
                      <table style={ui.table}>
                        <thead>
                          <tr style={ui.theadRow}>
                            <th style={ui.th}>Sucursal</th>
                            <th style={{ ...ui.th, textAlign: "center" }}>Stock</th>
                            <th style={{ ...ui.th, textAlign: "center" }}>Mín</th>
                            <th style={{ ...ui.th, textAlign: "center" }}>Máx</th>
                            <th style={{ ...ui.th, textAlign: "center" }}>Estado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedProduct.inventories.length === 0 && (
                            <tr>
                              <td colSpan={5} style={{ ...ui.td, textAlign: "center", color: "#94a3b8" }}>
                                Sin inventario registrado
                              </td>
                            </tr>
                          )}
                          {selectedProduct.inventories.map((inv) => (
                            <tr key={inv.id}>
                              <td style={ui.td}>{inv.branch}</td>
                              <td style={{ ...ui.td, textAlign: "center", fontWeight: 800, color: inv.quantity <= inv.minStock ? "#b45309" : "#0f172a" }}>
                                {inv.quantity}
                              </td>
                              <td style={{ ...ui.td, textAlign: "center", color: "#64748b" }}>{inv.minStock}</td>
                              <td style={{ ...ui.td, textAlign: "center", color: "#64748b" }}>{inv.maxStock}</td>
                              <td style={{ ...ui.td, textAlign: "center" }}>
                                {inv.quantity <= inv.minStock ? (
                                  <Badge tone="amber">Stock bajo</Badge>
                                ) : (
                                  <Badge tone="green">OK</Badge>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Action buttons under stock table */}
                    {selectedProduct.inventories.length > 0 && (
                      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                        <button
                          onClick={() => { setAdjustError(null); setAdjustOpen(true); }}
                          style={{
                            ...ui.ghostBtn,
                            color: "#b45309",
                            borderColor: "#fcd34d",
                            backgroundColor: "#fffbeb",
                          }}
                        >
                          ⚙️ Ajustar stock
                        </button>
                        {selectedProduct.inventories.length > 1 && (
                          <button
                            onClick={() => { setTransferError(null); setTransferOpen(true); }}
                            style={{
                              ...ui.ghostBtn,
                              color: "#7c3aed",
                              borderColor: "#c4b5fd",
                              backgroundColor: "#f5f3ff",
                            }}
                          >
                            🔄 Trasladar stock
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* ── Proveedores ── */}
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#1e3a8a" }}>Proveedores</div>
                      {!editingSuppliersMode && (
                        <button
                          onClick={() => { setEditingSuppliersMode(true); setSuppliersError(null); }}
                          style={{ ...ui.ghostBtn, fontSize: 12, padding: "4px 10px", color: "#2563eb", borderColor: "#93c5fd" }}
                        >
                          ✏️ Editar
                        </button>
                      )}
                    </div>

                    {!editingSuppliersMode ? (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {productSuppliers.length === 0 ? (
                          <span style={{ fontSize: 12, color: "#94a3b8" }}>Sin proveedores asignados</span>
                        ) : (
                          productSuppliers.map((sid) => {
                            const s = suppliers.find((x) => x.id === sid);
                            return (
                              <Badge key={sid} tone="blue">
                                {s?.name ?? `Proveedor ${sid}`}
                              </Badge>
                            );
                          })
                        )}
                      </div>
                    ) : (
                      <div>
                        <div style={{ maxHeight: 140, overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 12px", marginBottom: 12 }}>
                          {suppliers.length === 0 && (
                            <p style={{ fontSize: 12, color: "#94a3b8", margin: 0 }}>No hay proveedores disponibles</p>
                          )}
                          {suppliers.map((s) => (
                            <label key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "4px 0", fontSize: 13, color: "#334155" }}>
                              <input
                                type="checkbox"
                                checked={productSuppliers.includes(s.id)}
                                onChange={(e) =>
                                  setProductSuppliers(
                                    e.target.checked
                                      ? [...productSuppliers, s.id]
                                      : productSuppliers.filter((id) => id !== s.id)
                                  )
                                }
                                style={{ width: 15, height: 15, cursor: "pointer", flexShrink: 0 }}
                              />
                              {s.name}
                            </label>
                          ))}
                        </div>
                        {suppliersError && (
                          <p style={{ fontSize: 12, color: "#b91c1c", marginBottom: 10 }}>{suppliersError}</p>
                        )}
                        <div style={{ display: "flex", gap: 8 }}>
                          <button onClick={saveSuppliersChanges} style={ui.primaryBtn}>✓ Guardar</button>
                          <button onClick={() => { setEditingSuppliersMode(false); setSuppliersError(null); }} style={ui.ghostBtn}>✕ Cancelar</button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* ── Últimos movimientos kardex ── */}
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#1e3a8a", marginBottom: 10 }}>
                      Últimos 20 movimientos Kardex
                    </div>
                    <div style={{ ...ui.tableWrap, boxShadow: "none" }}>
                      <table style={ui.table}>
                        <thead>
                          <tr style={ui.theadRow}>
                            <th style={ui.th}>Fecha</th>
                            <th style={ui.th}>Sucursal</th>
                            <th style={{ ...ui.th, textAlign: "center" }}>Tipo</th>
                            <th style={{ ...ui.th, textAlign: "center" }}>Cambio</th>
                            <th style={{ ...ui.th, textAlign: "center" }}>Saldo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedProduct.recentKardex.length === 0 && (
                            <tr>
                              <td colSpan={5} style={{ ...ui.td, textAlign: "center", color: "#94a3b8" }}>
                                Sin movimientos registrados
                              </td>
                            </tr>
                          )}
                          {selectedProduct.recentKardex.map((k) => (
                            <tr key={k.id}>
                              <td style={ui.td}>
                                {fmtDate(k.date)}{" "}
                                <span style={{ color: "#94a3b8" }}>{fmtTime(k.date)}</span>
                              </td>
                              <td style={ui.td}>{k.branch}</td>
                              <td style={{ ...ui.td, textAlign: "center" }}>
                                <Badge tone={k.quantityChange >= 0 ? "green" : "red"}>
                                  {k.movementType.replace(/_/g, " ")}
                                </Badge>
                              </td>
                              <td style={{ ...ui.td, textAlign: "center", fontWeight: 800, color: k.quantityChange >= 0 ? "#15803d" : "#b91c1c" }}>
                                {k.quantityChange >= 0 ? "+" : ""}
                                {k.quantityChange}
                              </td>
                              <td style={{ ...ui.td, textAlign: "center", fontWeight: 700 }}>
                                {k.balanceAfter}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "14px 22px", borderTop: "1px solid #e2e8f0", alignItems: "center" }}>
              {selectedProduct && (
                <>
                  <button
                    onClick={() => handleToggleActive(selectedProduct)}
                    style={{
                      ...ui.ghostBtn,
                      color: selectedProduct.active ? "#b91c1c" : "#15803d",
                      borderColor: selectedProduct.active ? "#fca5a5" : "#86efac",
                      marginRight: "auto"
                    }}
                  >
                    {selectedProduct.active ? "Desactivar" : "Activar"}
                  </button>
                  <button
                    onClick={() => handleEdit(selectedProduct)}
                    style={{
                      ...ui.ghostBtn,
                      color: "#2563eb",
                      borderColor: "#93c5fd",
                    }}
                  >
                    Editar producto
                  </button>
                  <button onClick={printProduct} style={ui.primaryBtn}>
                    <Printer size={15} /> Imprimir ficha
                  </button>
                </>
              )}
              <button onClick={closeDetail} style={ui.ghostBtn}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* =================== SUB-MODAL: AJUSTAR STOCK =================== */}
      {adjustOpen && selectedProduct && (
        <div style={subModalStyle} onClick={() => setAdjustOpen(false)}>
          <div style={{ ...ui.modal, maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div style={ui.modalHeader}>
              <div style={ui.modalTitle}>⚙️ Ajustar stock — {selectedProduct.name}</div>
              <button onClick={() => setAdjustOpen(false)} style={{ ...ui.ghostBtn, padding: "6px 10px" }}>
                <X size={16} />
              </button>
            </div>
            <div style={ui.modalBody}>
              <div style={{ marginBottom: 16 }}>
                <label style={ui.fieldLabel}>Sucursal</label>
                <select
                  value={adjustBranch || ""}
                  onChange={(e) => setAdjustBranch(Number(e.target.value))}
                  style={{ ...ui.input, cursor: "pointer" }}
                >
                  <option value="">Selecciona sucursal</option>
                  {selectedProduct.inventories.map((inv) => (
                    <option key={inv.branchId} value={inv.branchId}>
                      {inv.branch} (Stock actual: {inv.quantity})
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={ui.fieldLabel}>Tipo de movimiento</label>
                <select
                  value={adjustType}
                  onChange={(e) => setAdjustType(e.target.value)}
                  style={{ ...ui.input, cursor: "pointer" }}
                >
                  <option value="">Selecciona tipo</option>
                  <option value="AJUSTE_INVENTARIO">Entrada / Ajuste positivo</option>
                  <option value="AJUSTE_MERMA">Salida / Merma o pérdida</option>
                </select>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={ui.fieldLabel}>Cantidad</label>
                <input
                  type="number"
                  min={1}
                  value={adjustQuantity || ""}
                  onChange={(e) => setAdjustQuantity(parseInt(e.target.value) || 0)}
                  style={ui.input}
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={ui.fieldLabel}>Motivo</label>
                <textarea
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="Describe el motivo del ajuste"
                  style={{
                    ...ui.input,
                    minHeight: 80,
                    resize: "vertical",
                    fontFamily: "inherit",
                  }}
                />
              </div>
              {adjustError && (
                <p style={{ fontSize: 13, color: "#b91c1c", marginBottom: 12 }}>{adjustError}</p>
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "14px 22px", borderTop: "1px solid #e2e8f0" }}>
              <button onClick={() => setAdjustOpen(false)} style={ui.ghostBtn}>Cancelar</button>
              <button onClick={submitAdjustment} style={ui.primaryBtn}>✓ Aplicar ajuste</button>
            </div>
          </div>
        </div>
      )}

      {/* =================== SUB-MODAL: TRASLADAR STOCK =================== */}
      {transferOpen && selectedProduct && (
        <div style={subModalStyle} onClick={() => setTransferOpen(false)}>
          <div style={{ ...ui.modal, maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div style={ui.modalHeader}>
              <div style={ui.modalTitle}>🔄 Trasladar stock — {selectedProduct.name}</div>
              <button onClick={() => setTransferOpen(false)} style={{ ...ui.ghostBtn, padding: "6px 10px" }}>
                <X size={16} />
              </button>
            </div>
            <div style={ui.modalBody}>
              <div style={{ marginBottom: 16 }}>
                <label style={ui.fieldLabel}>Desde (sucursal origen)</label>
                <select
                  value={transferFrom || ""}
                  onChange={(e) => setTransferFrom(Number(e.target.value))}
                  style={{ ...ui.input, cursor: "pointer" }}
                >
                  <option value="">Selecciona origen</option>
                  {selectedProduct.inventories.map((inv) => (
                    <option key={inv.branchId} value={inv.branchId}>
                      {inv.branch} (Stock: {inv.quantity})
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={ui.fieldLabel}>Hacia (sucursal destino)</label>
                <select
                  value={transferTo || ""}
                  onChange={(e) => setTransferTo(Number(e.target.value))}
                  style={{ ...ui.input, cursor: "pointer" }}
                >
                  <option value="">Selecciona destino</option>
                  {selectedProduct.inventories
                    .filter((inv) => inv.branchId !== transferFrom)
                    .map((inv) => (
                      <option key={inv.branchId} value={inv.branchId}>
                        {inv.branch}
                      </option>
                    ))}
                </select>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={ui.fieldLabel}>Cantidad a trasladar</label>
                <input
                  type="number"
                  min={1}
                  value={transferQty || ""}
                  onChange={(e) => setTransferQty(parseInt(e.target.value) || 0)}
                  style={ui.input}
                />
              </div>
              {transferError && (
                <p style={{ fontSize: 13, color: "#b91c1c", marginBottom: 12 }}>{transferError}</p>
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "14px 22px", borderTop: "1px solid #e2e8f0" }}>
              <button onClick={() => setTransferOpen(false)} style={ui.ghostBtn}>Cancelar</button>
              <button onClick={submitTransfer} style={ui.primaryBtn}>🔄 Trasladar</button>
            </div>
          </div>
        </div>
      )}
      {showForm && (
        <div style={ui.overlay} onClick={closeForm}>
          <form style={{ ...ui.modal, maxWidth: 600 }} onClick={(e) => e.stopPropagation()} onSubmit={submit}>
            <div style={ui.modalHeader}>
              <span style={ui.modalTitle}>
                {editingId !== null ? "Editar producto" : "Registrar nuevo producto"}
              </span>
              <button type="button" style={ui.linkBtn} onClick={closeForm}>
                <X size={18} color="#64748b" />
              </button>
            </div>
            <div style={ui.modalBody}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={ui.fieldLabel}>SKU *</label>
                  <input
                    style={{ ...ui.input, backgroundColor: editingId !== null ? "#f1f5f9" : "#ffffff" }}
                    value={form.sku}
                    onChange={set("sku")}
                    placeholder="SKU-XXX"
                    autoFocus={editingId === null}
                    readOnly={editingId !== null}
                  />
                </div>
                <div>
                  <label style={ui.fieldLabel}>Código de barras</label>
                  <input style={ui.input} value={form.barcode} onChange={set("barcode")} placeholder="7501000000000" />
                </div>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={ui.fieldLabel}>Nombre *</label>
                <input style={ui.input} value={form.name} onChange={set("name")} placeholder="Nombre del producto" />
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={ui.fieldLabel}>Descripción</label>
                <textarea
                  style={{ ...ui.input, resize: "vertical", minHeight: 60 }}
                  value={form.description}
                  onChange={set("description")}
                  placeholder="Detalle o descripción opcional"
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={ui.fieldLabel}>Precio Costo ($) *</label>
                  <input style={ui.input} value={form.costPrice} onChange={set("costPrice")} placeholder="0.00" />
                </div>
                <div>
                  <label style={ui.fieldLabel}>Precio Venta ($) *</label>
                  <input style={ui.input} value={form.sellPrice} onChange={set("sellPrice")} placeholder="0.00" />
                </div>
              </div>

              {editingId !== null && (
                <div style={styles.taxSection}>
                  <div style={styles.taxHeader}>
                    <div style={styles.taxTitleWrap}>
                      <BadgePercent size={16} color="#1e3a8a" />
                      <span style={styles.taxTitle}>Impuestos aplicables</span>
                    </div>
                    {!taxLoading && !taxError && (
                      <span style={styles.taxCounter}>
                        {taxOptions.filter((tax) => selectedTaxIds.includes(tax.id)).length} seleccionado(s)
                      </span>
                    )}
                  </div>

                  {taxLoading && <p style={styles.taxMuted}>Cargando impuestos aplicables...</p>}

                  {!taxLoading && taxError && (
                    <div style={styles.taxErrorBox}>
                      <span>{taxError}</span>
                      <button type="button" style={ui.linkBtn} onClick={() => void loadProductTaxes(editingId)}>
                        Reintentar
                      </button>
                    </div>
                  )}

                  {!taxLoading && !taxError && taxOptions.length === 0 && (
                    <p style={styles.taxMuted}>No hay impuestos activos para asignar.</p>
                  )}

                  {!taxLoading && !taxError && taxOptions.length > 0 && (
                    <div style={styles.taxGrid}>
                      {taxOptions.map((tax) => {
                        const checked = selectedTaxIds.includes(tax.id);
                        return (
                          <label
                            key={tax.id}
                            style={{
                              ...styles.taxOption,
                              borderColor: checked ? "#93c5fd" : "#e2e8f0",
                              backgroundColor: checked ? "#eff6ff" : "#ffffff",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={saving}
                              onChange={() => toggleTax(tax.id)}
                              style={styles.taxCheckbox}
                            />
                            <span style={styles.taxOptionText}>
                              <span style={styles.taxOptionName}>{tax.name}</span>
                              <span style={styles.taxOptionMeta}>{formatTaxRate(tax.rate)}</span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {formError && (
                <p style={{ color: "#b91c1c", fontSize: 13, fontWeight: 600, marginTop: 4, marginBottom: 14 }}>{formError}</p>
              )}

              <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                <button type="button" style={{ ...ui.ghostBtn, flex: 1, justifyContent: "center" }} onClick={closeForm}>
                  Cancelar
                </button>
                <button type="submit" disabled={saving} style={{ ...ui.primaryBtn, flex: 1, justifyContent: "center" }}>
                  {saving ? "Guardando..." : "Guardar producto"}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  taxSection: {
    border: "1px solid #e2e8f0",
    borderRadius: 10,
    backgroundColor: "#f8fafc",
    padding: 14,
    marginBottom: 14,
  },
  taxHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 10,
  },
  taxTitleWrap: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  taxTitle: {
    color: "#0f172a",
    fontSize: 13,
    fontWeight: 800,
  },
  taxCounter: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: 700,
  },
  taxMuted: {
    color: "#64748b",
    fontSize: 13,
    fontWeight: 600,
    margin: 0,
  },
  taxErrorBox: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    border: "1px solid #fecaca",
    borderRadius: 8,
    backgroundColor: "#fef2f2",
    color: "#b91c1c",
    fontSize: 13,
    fontWeight: 700,
    padding: "10px 12px",
  },
  taxGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 10,
  },
  taxOption: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    border: "1px solid #e2e8f0",
    borderRadius: 8,
    padding: "10px 12px",
    cursor: "pointer",
    minHeight: 46,
  },
  taxCheckbox: {
    width: 16,
    height: 16,
    accentColor: "#1e3a8a",
    cursor: "pointer",
    flexShrink: 0,
  },
  taxOptionText: {
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
  },
  taxOptionName: {
    color: "#0f172a",
    fontSize: 13,
    fontWeight: 800,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  taxOptionMeta: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: 700,
    marginTop: 2,
  },
};

export default InventarioView;
