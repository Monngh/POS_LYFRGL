import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, PackagePlus, Pencil, Plus, Power, Tags, X } from "lucide-react";
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
  moneyExact,
} from "./shared";

interface PromotionTypeOption {
  id: number;
  name: string;
  description: string | null;
}

interface ProductOption {
  id: number;
  sku: string;
  name: string;
  sellPrice: number;
  active: boolean;
}

interface PromotionProduct {
  id?: number;
  promotionId?: number;
  productId: number;
  product?: ProductOption;
}

interface PromotionRow {
  id: number;
  name: string;
  description: string | null;
  promotionTypeId: number;
  startDate: string;
  endDate: string;
  isActive: boolean;
  value: number | string | null;
  minQuantity: number | null;
  payQuantity: number | null;
  specialPrice: number | string | null;
  createdAt?: string;
  updatedAt?: string;
  promotionType: PromotionTypeOption;
  products: PromotionProduct[];
}

interface FormState {
  name: string;
  description: string;
  promotionTypeId: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  value: string;
  minQuantity: string;
  payQuantity: string;
  specialPrice: string;
  productIds: number[];
}

type RuleKey = "percentage" | "fixedAmount" | "buyXPayY" | "specialPrice";

const todayInput = () => new Date().toISOString().slice(0, 10);

const addDaysInput = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

const toInputDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
};

const emptyForm = (): FormState => ({
  name: "",
  description: "",
  promotionTypeId: "",
  startDate: todayInput(),
  endDate: addDaysInput(30),
  isActive: true,
  value: "",
  minQuantity: "",
  payQuantity: "",
  specialPrice: "",
  productIds: [],
});

const getErrorMessage = (err: unknown, fallback: string) => {
  if (typeof err === "object" && err !== null && "response" in err) {
    const apiError = err as { response?: { data?: { message?: string; error?: string } } };
    return apiError.response?.data?.message || apiError.response?.data?.error || fallback;
  }

  return fallback;
};

const getRule = (typeName: string): RuleKey | null => {
  const normalized = typeName.toLowerCase().replace(/\s+/g, "");

  if (normalized.includes("percentage") || normalized.includes("porcentaje")) return "percentage";
  if (normalized.includes("fixedamount") || normalized.includes("montofijo") || normalized.includes("fixed")) return "fixedAmount";
  if (
    normalized.includes("buyxpayy") ||
    normalized.includes("nxm") ||
    normalized.includes("2x1") ||
    normalized.includes("3x2")
  ) return "buyXPayY";
  if (normalized.includes("specialprice") || normalized.includes("precioespecial")) return "specialPrice";

  return null;
};

const typeLabel = (type: string) => {
  const rule = getRule(type);
  if (rule === "percentage") return "Porcentaje";
  if (rule === "fixedAmount") return "Monto fijo";
  if (rule === "buyXPayY") return "NxM";
  if (rule === "specialPrice") return "Precio especial";
  return type;
};

const formatPromotionValue = (promotion: PromotionRow) => {
  const rule = getRule(promotion.promotionType.name);

  if (rule === "percentage") return `${Number(promotion.value ?? 0)}%`;
  if (rule === "fixedAmount") return moneyExact(Number(promotion.value ?? 0));
  if (rule === "buyXPayY") return `${promotion.minQuantity ?? "-"}x${promotion.payQuantity ?? "-"}`;
  if (rule === "specialPrice") return moneyExact(Number(promotion.specialPrice ?? 0));

  return "Regla configurada";
};

const getStatus = (promotion: PromotionRow) => {
  const now = new Date();
  const start = new Date(promotion.startDate);
  const end = new Date(promotion.endDate);

  if (!promotion.isActive) return { label: "Inactiva", tone: "red" as const };
  if (Number.isFinite(end.getTime()) && end < now) return { label: "Vencida", tone: "slate" as const };
  if (Number.isFinite(start.getTime()) && start > now) return { label: "Programada", tone: "amber" as const };

  return { label: "Vigente", tone: "green" as const };
};

const promotionToForm = (promotion: PromotionRow): FormState => ({
  name: promotion.name,
  description: promotion.description || "",
  promotionTypeId: String(promotion.promotionTypeId),
  startDate: toInputDate(promotion.startDate),
  endDate: toInputDate(promotion.endDate),
  isActive: promotion.isActive,
  value: promotion.value !== null ? String(promotion.value) : "",
  minQuantity: promotion.minQuantity !== null ? String(promotion.minQuantity) : "",
  payQuantity: promotion.payQuantity !== null ? String(promotion.payQuantity) : "",
  specialPrice: promotion.specialPrice !== null ? String(promotion.specialPrice) : "",
  productIds: promotion.products.map((row) => row.productId),
});

const extractPromotions = (payload: { promotions?: PromotionRow[] } | PromotionRow[]) =>
  Array.isArray(payload) ? payload : payload.promotions ?? [];

const isPromotionEnvelope = (payload: unknown): payload is { promotion?: PromotionRow } =>
  typeof payload === "object" && payload !== null && "promotion" in payload;

const extractPromotion = (payload: { promotion?: PromotionRow } | PromotionRow): PromotionRow | null =>
  isPromotionEnvelope(payload) ? payload.promotion ?? null : payload;

const productSummary = (promotion: PromotionRow) => {
  if (promotion.products.length === 0) return "Sin productos";
  const names = promotion.products.map((row) => row.product?.name ?? `Producto #${row.productId}`);
  return names.length <= 2 ? names.join(", ") : `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
};

const ProductSelector: React.FC<{
  products: ProductOption[];
  selectedIds: number[];
  onToggle: (productId: number) => void;
  disabled?: boolean;
}> = ({ products, selectedIds, onToggle, disabled }) => {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;

    return products.filter((product) =>
      `${product.sku} ${product.name}`.toLowerCase().includes(q)
    );
  }, [products, query]);

  return (
    <div style={styles.productPicker}>
      <div style={styles.productPickerTop}>
        <SearchInput value={query} onChange={setQuery} placeholder="Buscar SKU o producto" />
        <span style={styles.selectedCount}>{selectedIds.length} seleccionado{selectedIds.length === 1 ? "" : "s"}</span>
      </div>
      <div style={styles.productList}>
        <table style={ui.table}>
          <thead>
            <tr style={ui.theadRow}>
              <th style={{ ...ui.th, width: 44 }} />
              <th style={ui.th}>SKU</th>
              <th style={ui.th}>Nombre</th>
              <th style={{ ...ui.th, textAlign: "right" }}>Precio</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={4} style={styles.productEmpty}>No hay productos activos para mostrar.</td>
              </tr>
            ) : (
              filtered.map((product) => (
                <tr key={product.id}>
                  <td style={{ ...ui.td, textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(product.id)}
                      disabled={disabled}
                      onChange={() => onToggle(product.id)}
                      style={styles.check}
                      aria-label={`Seleccionar ${product.name}`}
                    />
                  </td>
                  <td style={{ ...ui.td, fontWeight: 800, color: "#1e3a8a" }}>{product.sku}</td>
                  <td style={{ ...ui.td, whiteSpace: "normal", fontWeight: 700 }}>{product.name}</td>
                  <td style={{ ...ui.td, textAlign: "right" }}>{moneyExact(Number(product.sellPrice))}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const PromocionesView: React.FC<ViewProps> = ({ refreshToken }) => {
  const [rows, setRows] = useState<PromotionRow[]>([]);
  const [promotionTypes, setPromotionTypes] = useState<PromotionTypeOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [editing, setEditing] = useState<"create" | PromotionRow | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadingActionId, setLoadingActionId] = useState<number | null>(null);

  const [detail, setDetail] = useState<PromotionRow | null>(null);
  const [productEditor, setProductEditor] = useState<PromotionRow | null>(null);
  const [productEditorIds, setProductEditorIds] = useState<number[]>([]);
  const [productError, setProductError] = useState<string | null>(null);
  const [productSaving, setProductSaving] = useState(false);

  const load = useCallback(async () => {
    void refreshToken;
    setLoading(true);
    setError(null);

    try {
      const [promotionsRes, typesRes, productsRes] = await Promise.all([
        api.get<{ promotions: PromotionRow[] }>("/api/admin-promotions/promotions", {
          params: search.trim() ? { search: search.trim() } : {},
        }),
        api.get<{ promotionTypes: PromotionTypeOption[] }>("/api/admin-promotions/promotion-types"),
        api.get<{ products: ProductOption[] }>("/api/admin-promotions/products/active"),
      ]);

      setRows(extractPromotions(promotionsRes.data));
      setPromotionTypes(typesRes.data.promotionTypes ?? []);
      setProducts(productsRes.data.products ?? []);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "No se pudieron cargar las promociones."));
    } finally {
      setLoading(false);
    }
  }, [search, refreshToken]);

  useEffect(() => {
    const timer = window.setTimeout(load, 300);
    return () => window.clearTimeout(timer);
  }, [load]);

  const selectedType = useMemo(
    () => promotionTypes.find((type) => type.id === Number(form.promotionTypeId)) ?? null,
    [promotionTypes, form.promotionTypeId],
  );

  const selectedRule = selectedType ? getRule(selectedType.name) : null;
  const activeCount = rows.filter((promotion) => getStatus(promotion).label === "Vigente").length;
  const inactiveCount = rows.filter((promotion) => !promotion.isActive).length;

  const setField =
    (key: keyof Omit<FormState, "isActive" | "productIds">) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      const value = event.target.value;
      setForm((current) => ({ ...current, [key]: value }));
    };

  const changeType = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const type = promotionTypes.find((item) => item.id === Number(event.target.value));
    const rule = type ? getRule(type.name) : null;
    setForm((current) => ({
      ...current,
      promotionTypeId: event.target.value,
      value: rule === "percentage" || rule === "fixedAmount" ? current.value : "",
      minQuantity: rule === "buyXPayY" || rule === "specialPrice" ? current.minQuantity : "",
      payQuantity: rule === "buyXPayY" ? current.payQuantity : "",
      specialPrice: rule === "specialPrice" ? current.specialPrice : "",
    }));
  };

  const toggleFormProduct = (productId: number) => {
    setForm((current) => ({
      ...current,
      productIds: current.productIds.includes(productId)
        ? current.productIds.filter((id) => id !== productId)
        : [...current.productIds, productId],
    }));
  };

  const validateForm = () => {
    if (!form.name.trim()) return "El nombre de la promocion es obligatorio.";
    if (!form.promotionTypeId) return "Seleccione un tipo de promocion.";
    if (!form.startDate) return "La fecha inicial es obligatoria.";
    if (!form.endDate) return "La fecha final es obligatoria.";

    const start = new Date(`${form.startDate}T00:00:00`);
    const end = new Date(`${form.endDate}T23:59:59`);
    if (end <= start) return "La fecha final debe ser mayor que la fecha inicial.";
    if (typeof form.isActive !== "boolean") return "El estado de la promocion es invalido.";
    if (form.productIds.length === 0) return "Seleccione al menos un producto activo.";

    if (selectedRule === "percentage") {
      const value = Number(form.value);
      if (!Number.isFinite(value) || value <= 0 || value > 100) {
        return "El porcentaje debe ser mayor a 0 y menor o igual a 100.";
      }
    }

    if (selectedRule === "fixedAmount") {
      const value = Number(form.value);
      if (!Number.isFinite(value) || value <= 0) return "El monto fijo debe ser mayor a 0.";
    }

    if (selectedRule === "buyXPayY") {
      const minQuantity = Number(form.minQuantity);
      const payQuantity = Number(form.payQuantity);
      if (!Number.isInteger(minQuantity) || minQuantity < 2) return "La cantidad minima debe ser mayor o igual a 2.";
      if (!Number.isInteger(payQuantity) || payQuantity < 1) return "La cantidad a pagar debe ser mayor o igual a 1.";
      if (payQuantity >= minQuantity) return "La cantidad a pagar debe ser menor que la cantidad minima.";
    }

    if (selectedRule === "specialPrice") {
      const minQuantity = Number(form.minQuantity);
      const specialPrice = Number(form.specialPrice);
      if (!Number.isInteger(minQuantity) || minQuantity < 1) return "La cantidad minima debe ser mayor o igual a 1.";
      if (!Number.isFinite(specialPrice) || specialPrice <= 0) return "El precio especial debe ser mayor a 0.";
    }

    if (!selectedRule) return "El tipo de promocion seleccionado no esta soportado.";

    return null;
  };

  const buildPayload = () => ({
    name: form.name.trim(),
    description: form.description.trim() || null,
    promotionTypeId: Number(form.promotionTypeId),
    startDate: form.startDate,
    endDate: form.endDate,
    isActive: form.isActive,
    value: form.value.trim() ? Number(form.value) : null,
    minQuantity: form.minQuantity.trim() ? Number(form.minQuantity) : null,
    payQuantity: form.payQuantity.trim() ? Number(form.payQuantity) : null,
    specialPrice: form.specialPrice.trim() ? Number(form.specialPrice) : null,
    productIds: form.productIds,
  });

  const openCreate = () => {
    setEditing("create");
    setForm(emptyForm());
    setFormError(null);
    setNotice(null);
  };

  const loadPromotionDetail = async (promotionId: number) => {
    const res = await api.get<{ promotion: PromotionRow }>(`/api/admin-promotions/promotions/${promotionId}`);
    return extractPromotion(res.data);
  };

  const openEdit = async (promotion: PromotionRow) => {
    setLoadingActionId(promotion.id);
    setNotice(null);
    setFormError(null);
    try {
      const fresh = await loadPromotionDetail(promotion.id);
      if (!fresh) throw new Error("PROMOTION_NOT_FOUND");
      setForm(promotionToForm(fresh));
      setEditing(fresh);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "No se pudo cargar la promocion para editar."));
    } finally {
      setLoadingActionId(null);
    }
  };

  const openDetail = async (promotion: PromotionRow) => {
    setLoadingActionId(promotion.id);
    try {
      const fresh = await loadPromotionDetail(promotion.id);
      if (!fresh) throw new Error("PROMOTION_NOT_FOUND");
      setDetail(fresh);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "No se pudo cargar el detalle de la promocion."));
    } finally {
      setLoadingActionId(null);
    }
  };

  const openProductEditor = async (promotion: PromotionRow) => {
    setLoadingActionId(promotion.id);
    setProductError(null);
    try {
      const fresh = await loadPromotionDetail(promotion.id);
      if (!fresh) throw new Error("PROMOTION_NOT_FOUND");
      setProductEditor(fresh);
      setProductEditorIds(fresh.products.map((row) => row.productId));
    } catch (err: unknown) {
      setError(getErrorMessage(err, "No se pudieron cargar los productos de la promocion."));
    } finally {
      setLoadingActionId(null);
    }
  };

  const closeForm = () => {
    if (saving) return;
    setEditing(null);
    setFormError(null);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();

    const validation = validateForm();
    if (validation) {
      setFormError(validation);
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      if (editing === "create") {
        await api.post("/api/admin-promotions/promotions", buildPayload());
        setNotice("Promocion creada correctamente.");
      } else if (editing) {
        await api.put(`/api/admin-promotions/promotions/${editing.id}`, buildPayload());
        setNotice("Promocion actualizada correctamente.");
      }

      setEditing(null);
      await load();
    } catch (err: unknown) {
      setFormError(getErrorMessage(err, "No se pudo guardar la promocion."));
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (promotion: PromotionRow) => {
    const next = !promotion.isActive;
    const action = next ? "activar" : "desactivar";
    const confirmed = window.confirm(`Desea ${action} la promocion "${promotion.name}"?`);
    if (!confirmed) return;

    setLoadingActionId(promotion.id);
    setError(null);
    setNotice(null);
    try {
      await api.patch(`/api/admin-promotions/promotions/${promotion.id}/status`, { isActive: next });
      setNotice(`Promocion ${next ? "activada" : "desactivada"} correctamente.`);
      await load();
    } catch (err: unknown) {
      setError(getErrorMessage(err, "No se pudo cambiar el estado de la promocion."));
    } finally {
      setLoadingActionId(null);
    }
  };

  const toggleProductEditorId = (productId: number) => {
    setProductEditorIds((current) =>
      current.includes(productId)
        ? current.filter((id) => id !== productId)
        : [...current, productId]
    );
  };

  const submitProducts = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!productEditor) return;

    if (productEditorIds.length === 0) {
      setProductError("Seleccione al menos un producto activo.");
      return;
    }

    setProductSaving(true);
    setProductError(null);
    try {
      await api.put(`/api/admin-promotions/promotions/${productEditor.id}/products`, {
        productIds: productEditorIds,
      });
      setNotice("Productos de la promocion actualizados correctamente.");
      setProductEditor(null);
      await load();
    } catch (err: unknown) {
      setProductError(getErrorMessage(err, "No se pudieron actualizar los productos."));
    } finally {
      setProductSaving(false);
    }
  };

  return (
    <div>
      <SectionHeader
        title="Promociones"
        subtitle="CRUD administrativo de reglas y productos promocionados"
        right={
          <button style={ui.primaryBtn} className="active-tap" onClick={openCreate}>
            <Plus size={16} /> Nueva promocion
          </button>
        }
      />

      <Toolbar>
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar por promocion, tipo o producto" />
        <span style={styles.metricGreen}>
          <Tags size={16} /> {activeCount} vigente{activeCount === 1 ? "" : "s"}
        </span>
        {inactiveCount > 0 && <span style={styles.metricMuted}>{inactiveCount} inactiva{inactiveCount === 1 ? "" : "s"}</span>}
        <span style={styles.resultCount}>{rows.length} resultado{rows.length === 1 ? "" : "s"}</span>
      </Toolbar>

      {notice && (
        <div style={styles.notice} role="status">
          {notice}
        </div>
      )}

      <div style={ui.tableWrap}>
        <table style={ui.table}>
          <thead>
            <tr style={ui.theadRow}>
              <th style={ui.th}>Promocion</th>
              <th style={ui.th}>Tipo</th>
              <th style={{ ...ui.th, textAlign: "right" }}>Valor</th>
              <th style={ui.th}>Vigencia</th>
              <th style={ui.th}>Productos</th>
              <th style={{ ...ui.th, textAlign: "center" }}>Estado</th>
              <th style={{ ...ui.th, textAlign: "center" }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            <TableState
              colSpan={7}
              loading={loading}
              error={error}
              empty={!loading && rows.length === 0}
              emptyText={search.trim() ? "No hay promociones que coincidan con la busqueda." : "No hay promociones registradas."}
            />
            {!loading &&
              !error &&
              rows.map((promotion) => {
                const status = getStatus(promotion);
                const busy = loadingActionId === promotion.id;

                return (
                  <tr key={promotion.id}>
                    <td style={{ ...ui.td, fontWeight: 800, color: "#0f172a", whiteSpace: "normal", minWidth: 210 }}>
                      <div>{promotion.name}</div>
                      {promotion.description && <div style={styles.rowSubtext}>{promotion.description}</div>}
                    </td>
                    <td style={ui.td}>{typeLabel(promotion.promotionType.name)}</td>
                    <td style={{ ...ui.td, textAlign: "right", fontWeight: 800 }}>{formatPromotionValue(promotion)}</td>
                    <td style={{ ...ui.td, color: "#64748b" }}>
                      {fmtDate(promotion.startDate)} - {fmtDate(promotion.endDate)}
                    </td>
                    <td style={{ ...ui.td, whiteSpace: "normal", minWidth: 180 }}>
                      <div style={{ fontWeight: 800 }}>{promotion.products.length} producto{promotion.products.length === 1 ? "" : "s"}</div>
                      <div style={styles.rowSubtext}>{productSummary(promotion)}</div>
                    </td>
                    <td style={{ ...ui.td, textAlign: "center" }}>
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </td>
                    <td style={{ ...ui.td, textAlign: "center" }}>
                      <div style={styles.actions}>
                        <button style={ui.linkBtn} className="active-tap" disabled={busy} onClick={() => openDetail(promotion)}>
                          <Eye size={14} style={styles.iconInline} /> Ver
                        </button>
                        <button style={ui.linkBtn} className="active-tap" disabled={busy} onClick={() => openEdit(promotion)}>
                          <Pencil size={14} style={styles.iconInline} /> Editar
                        </button>
                        <button style={ui.linkBtn} className="active-tap" disabled={busy} onClick={() => openProductEditor(promotion)}>
                          <PackagePlus size={14} style={styles.iconInline} /> Productos
                        </button>
                        <button
                          style={{ ...ui.linkBtn, color: promotion.isActive ? "#b91c1c" : "#15803d", opacity: busy ? 0.55 : 1 }}
                          className="active-tap"
                          disabled={busy}
                          onClick={() => toggleStatus(promotion)}
                        >
                          <Power size={14} style={styles.iconInline} /> {promotion.isActive ? "Desactivar" : "Activar"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {editing !== null && (
        <div style={ui.overlay} onClick={closeForm}>
          <form style={{ ...ui.modal, maxWidth: 860 }} onClick={(event) => event.stopPropagation()} onSubmit={submit}>
            <div style={ui.modalHeader}>
              <span style={ui.modalTitle}>{editing === "create" ? "Nueva promocion" : "Editar promocion"}</span>
              <button type="button" style={ui.linkBtn} onClick={closeForm} aria-label="Cerrar">
                <X size={18} color="#64748b" />
              </button>
            </div>
            <div style={ui.modalBody}>
              <div style={styles.formGrid}>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={ui.fieldLabel}>Nombre *</label>
                  <input style={ui.input} value={form.name} onChange={setField("name")} placeholder="Coca Cola 20% OFF" autoFocus />
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={ui.fieldLabel}>Descripcion</label>
                  <textarea
                    style={{ ...ui.input, minHeight: 72, resize: "vertical" }}
                    value={form.description}
                    onChange={setField("description")}
                    placeholder="Descuento en refrescos"
                  />
                </div>

                <div>
                  <label style={ui.fieldLabel}>Tipo *</label>
                  <select style={ui.input} value={form.promotionTypeId} onChange={changeType}>
                    <option value="">Seleccione tipo</option>
                    {promotionTypes.map((type) => (
                      <option key={type.id} value={type.id}>
                        {typeLabel(type.name)}
                      </option>
                    ))}
                  </select>
                </div>

                <label style={styles.checkRow}>
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))}
                    style={styles.check}
                  />
                  <span>Promocion activa</span>
                </label>

                <div>
                  <label style={ui.fieldLabel}>Inicio *</label>
                  <input type="date" style={ui.input} value={form.startDate} onChange={setField("startDate")} />
                </div>

                <div>
                  <label style={ui.fieldLabel}>Fin *</label>
                  <input type="date" style={ui.input} value={form.endDate} onChange={setField("endDate")} />
                </div>

                {(selectedRule === "percentage" || selectedRule === "fixedAmount") && (
                  <div>
                    <label style={ui.fieldLabel}>{selectedRule === "percentage" ? "Porcentaje *" : "Monto fijo *"}</label>
                    <input style={ui.input} value={form.value} onChange={setField("value")} placeholder={selectedRule === "percentage" ? "20" : "10.00"} inputMode="decimal" />
                  </div>
                )}

                {selectedRule === "buyXPayY" && (
                  <>
                    <div>
                      <label style={ui.fieldLabel}>Cantidad minima *</label>
                      <input style={ui.input} value={form.minQuantity} onChange={setField("minQuantity")} placeholder="3" inputMode="numeric" />
                    </div>
                    <div>
                      <label style={ui.fieldLabel}>Cantidad a pagar *</label>
                      <input style={ui.input} value={form.payQuantity} onChange={setField("payQuantity")} placeholder="2" inputMode="numeric" />
                    </div>
                  </>
                )}

                {selectedRule === "specialPrice" && (
                  <>
                    <div>
                      <label style={ui.fieldLabel}>Cantidad minima *</label>
                      <input style={ui.input} value={form.minQuantity} onChange={setField("minQuantity")} placeholder="2" inputMode="numeric" />
                    </div>
                    <div>
                      <label style={ui.fieldLabel}>Precio especial *</label>
                      <input style={ui.input} value={form.specialPrice} onChange={setField("specialPrice")} placeholder="38.00" inputMode="decimal" />
                    </div>
                  </>
                )}
              </div>

              <div style={{ marginTop: 18 }}>
                <label style={ui.fieldLabel}>Productos *</label>
                <ProductSelector products={products} selectedIds={form.productIds} onToggle={toggleFormProduct} disabled={saving} />
              </div>

              {formError && <p style={styles.formError}>{formError}</p>}

              <div style={styles.formActions}>
                <button type="button" style={{ ...ui.ghostBtn, flex: 1, justifyContent: "center" }} onClick={closeForm}>
                  Cancelar
                </button>
                <button type="submit" disabled={saving} style={{ ...ui.primaryBtn, flex: 1, justifyContent: "center" }}>
                  {saving ? "Guardando..." : editing === "create" ? "Crear promocion" : "Guardar cambios"}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {detail && (
        <div style={ui.overlay} onClick={() => setDetail(null)}>
          <div style={{ ...ui.modal, maxWidth: 720 }} onClick={(event) => event.stopPropagation()}>
            <div style={ui.modalHeader}>
              <span style={ui.modalTitle}>{detail.name}</span>
              <button type="button" style={ui.linkBtn} onClick={() => setDetail(null)} aria-label="Cerrar">
                <X size={18} color="#64748b" />
              </button>
            </div>
            <div style={ui.modalBody}>
              <div style={styles.detailGrid}>
                <div>
                  <span style={styles.detailLabel}>Tipo</span>
                  <strong>{typeLabel(detail.promotionType.name)}</strong>
                </div>
                <div>
                  <span style={styles.detailLabel}>Valor</span>
                  <strong>{formatPromotionValue(detail)}</strong>
                </div>
                <div>
                  <span style={styles.detailLabel}>Vigencia</span>
                  <strong>{fmtDate(detail.startDate)} - {fmtDate(detail.endDate)}</strong>
                </div>
                <div>
                  <span style={styles.detailLabel}>Estado</span>
                  <Badge tone={getStatus(detail).tone}>{getStatus(detail).label}</Badge>
                </div>
              </div>

              {detail.description && <p style={styles.detailDescription}>{detail.description}</p>}

              <div style={{ marginTop: 18 }}>
                <label style={ui.fieldLabel}>Productos asignados</label>
                <div style={styles.assignedList}>
                  {detail.products.map((row) => (
                    <div key={row.productId} style={styles.assignedRow}>
                      <span style={styles.sku}>{row.product?.sku ?? `#${row.productId}`}</span>
                      <span style={{ fontWeight: 800 }}>{row.product?.name ?? `Producto #${row.productId}`}</span>
                      <span style={{ marginLeft: "auto", color: "#64748b" }}>
                        {row.product ? moneyExact(Number(row.product.sellPrice)) : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {productEditor && (
        <div style={ui.overlay} onClick={() => !productSaving && setProductEditor(null)}>
          <form style={{ ...ui.modal, maxWidth: 760 }} onClick={(event) => event.stopPropagation()} onSubmit={submitProducts}>
            <div style={ui.modalHeader}>
              <span style={ui.modalTitle}>Gestionar productos</span>
              <button type="button" style={ui.linkBtn} onClick={() => setProductEditor(null)} aria-label="Cerrar">
                <X size={18} color="#64748b" />
              </button>
            </div>
            <div style={ui.modalBody}>
              <div style={styles.managerTitle}>
                <strong>{productEditor.name}</strong>
                <span>{typeLabel(productEditor.promotionType.name)} - {formatPromotionValue(productEditor)}</span>
              </div>
              <ProductSelector products={products} selectedIds={productEditorIds} onToggle={toggleProductEditorId} disabled={productSaving} />
              {productError && <p style={styles.formError}>{productError}</p>}
              <div style={styles.formActions}>
                <button type="button" style={{ ...ui.ghostBtn, flex: 1, justifyContent: "center" }} onClick={() => setProductEditor(null)}>
                  Cancelar
                </button>
                <button type="submit" disabled={productSaving} style={{ ...ui.primaryBtn, flex: 1, justifyContent: "center" }}>
                  {productSaving ? "Guardando..." : "Guardar productos"}
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
  metricGreen: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    color: "#15803d",
    fontSize: 13,
    fontWeight: 700,
  },
  metricMuted: {
    fontSize: 13,
    color: "#64748b",
    fontWeight: 700,
  },
  resultCount: {
    marginLeft: "auto",
    fontSize: 13,
    color: "#64748b",
    fontWeight: 600,
  },
  notice: {
    backgroundColor: "#ecfdf5",
    border: "1px solid #bbf7d0",
    borderRadius: 8,
    color: "#15803d",
    fontSize: 13,
    fontWeight: 700,
    marginBottom: 14,
    padding: "10px 12px",
  },
  rowSubtext: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: 600,
    marginTop: 3,
  },
  actions: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 11,
    flexWrap: "wrap",
  },
  iconInline: {
    verticalAlign: "-2px",
  },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 14,
  },
  checkRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    color: "#334155",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 700,
    minHeight: 40,
    marginTop: 18,
  },
  check: {
    width: 16,
    height: 16,
    accentColor: "#1e3a8a",
    cursor: "pointer",
  },
  productPicker: {
    border: "1px solid #e2e8f0",
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#ffffff",
  },
  productPickerTop: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderBottom: "1px solid #e2e8f0",
    backgroundColor: "#f8fafc",
    flexWrap: "wrap",
  },
  selectedCount: {
    marginLeft: "auto",
    color: "#1e3a8a",
    fontSize: 12,
    fontWeight: 800,
  },
  productList: {
    maxHeight: 260,
    overflowY: "auto",
  },
  productEmpty: {
    textAlign: "center",
    padding: "22px 14px",
    color: "#94a3b8",
    fontSize: 13,
    fontWeight: 600,
  },
  formError: {
    backgroundColor: "#fef2f2",
    border: "1px solid #fecaca",
    borderRadius: 8,
    color: "#b91c1c",
    fontSize: 13,
    fontWeight: 700,
    marginTop: 14,
    padding: "10px 12px",
  },
  formActions: {
    display: "flex",
    gap: 10,
    marginTop: 18,
  },
  detailGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 14,
  },
  detailLabel: {
    display: "block",
    color: "#64748b",
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: "0.4px",
    marginBottom: 5,
    textTransform: "uppercase",
  },
  detailDescription: {
    color: "#475569",
    fontSize: 13,
    fontWeight: 600,
    lineHeight: 1.55,
    marginTop: 18,
  },
  assignedList: {
    border: "1px solid #e2e8f0",
    borderRadius: 8,
    overflow: "hidden",
  },
  assignedRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    borderBottom: "1px solid #f1f5f9",
    color: "#334155",
    fontSize: 13,
    padding: "10px 12px",
  },
  sku: {
    backgroundColor: "#eff6ff",
    borderRadius: 6,
    color: "#1e3a8a",
    fontSize: 11,
    fontWeight: 800,
    padding: "3px 7px",
  },
  managerTitle: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    color: "#0f172a",
    fontSize: 14,
    marginBottom: 14,
  },
};

export default PromocionesView;
