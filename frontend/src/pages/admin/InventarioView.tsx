import React, { useEffect, useRef, useState, useCallback } from "react";
import { AlertTriangle, BadgePercent, Plus, X } from "lucide-react";
import api from "../../services/api";
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
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

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

  const handleEdit = (p: ProductRow) => {
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

  const handleToggleActive = async (p: ProductRow) => {
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

  const lowCount = rows.filter((r) => r.low).length;
  const scope = branchId !== "all" ? "en la sucursal seleccionada" : "consolidado de todas las sucursales";

  return (
    <div>
      <SectionHeader
        title="Inventario"
        subtitle={`Existencias ${scope}`}
        right={
          <button style={ui.primaryBtn} className="active-tap" onClick={handleOpenCreate}>
            <Plus size={16} /> Nuevo producto
          </button>
        }
      />

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
              <th style={{ ...ui.th, textAlign: "center" }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            <TableState colSpan={8} loading={loading} error={error} empty={!loading && rows.length === 0} />
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
                  <td style={{ ...ui.td, textAlign: "center" }}>
                    <button
                      style={ui.linkBtn}
                      onClick={() => handleEdit(p)}
                      title="Editar producto"
                    >
                      Editar
                    </button>
                    <span style={{ margin: "0 8px", color: "#cbd5e1" }}>|</span>
                    <button
                      style={{
                        ...ui.linkBtn,
                        color: p.active ? "#b91c1c" : "#15803d",
                      }}
                      onClick={() => handleToggleActive(p)}
                      title={p.active ? "Desactivar producto" : "Activar producto"}
                    >
                      {p.active ? "Desactivar" : "Activar"}
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Modal de alta / edición */}
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
