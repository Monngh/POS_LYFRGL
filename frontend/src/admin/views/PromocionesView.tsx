import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Eye, PackagePlus, Pencil, Plus, Power, Tags, X } from "lucide-react";
import api from "../../shared/services/api";
import AddProductsToPromotionModal from "../components/AddProductsToPromotionModal";
import type { PromotionAssociatedProductDetail } from "../types/promotions.types";
import {
  collectRoundedDecimalMessages,
  DECIMAL_INPUT_REGEX,
  handleDecimalInputChange,
  validateDecimalField,
} from "../../shared/utils/decimalInput";
import { normalizeIntegerInput, validateInteger, validateSafeText } from "../../shared/utils/formValidation";
import { useToast } from "../../shared/context/ToastContext";
import { ConfirmModal } from "../../shared/ui";
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
  useMediaQuery,
  filterProductsBySearch,
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
  product?: PromotionAssociatedProductDetail;
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

type FieldErrors = Partial<Record<keyof FormState, string>>;

type RuleKey = "percentage" | "fixedAmount" | "buyXPayY" | "specialPrice";

interface PromotionDecimalValues {
  value: number | null;
  specialPrice: number | null;
  roundingMessages: string[];
}

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
  const isMobile = useMediaQuery("(max-width: 1024px)");
  const filtered = useMemo(() => {
    return filterProductsBySearch(products, query);
  }, [products, query]);

  return (
    <div style={styles.productPicker}>
      <div style={styles.productPickerTop}>
        <SearchInput value={query} onChange={setQuery} placeholder="Buscar SKU o producto" />
        <span style={styles.selectedCount}>{selectedIds.length} seleccionado{selectedIds.length === 1 ? "" : "s"}</span>
      </div>
      {isMobile ? (
        <div style={{ border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "8px 12px",
              backgroundColor: "var(--surface-2)",
              borderBottom: "1px solid var(--border)",
              borderRadius: "6px 6px 0 0",
              position: "sticky",
              top: 0,
              zIndex: 1,
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.4px" }}>
              Producto
            </span>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.4px" }}>
              Precio
            </span>
          </div>
          <div style={{ maxHeight: 240, overflowY: "auto", overflowX: "hidden" }}>
            {filtered.length === 0 ? (
              <div style={styles.productEmpty}>
                {query.trim() ? "No se encontraron productos con esa búsqueda." : "No hay productos activos para mostrar."}
              </div>
            ) : (
              filtered.map((product) => (
                <div
                  key={product.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 12px",
                    borderBottom: "1px solid var(--border)",
                    width: "100%",
                    boxSizing: "border-box",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(product.id)}
                    disabled={disabled}
                    onChange={() => onToggle(product.id)}
                    style={{ width: 18, height: 18, flexShrink: 0 }}
                    aria-label={`Seleccionar ${product.name}`}
                  />
                  <div style={{ flex: 1, minWidth: 0, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: "var(--text)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {product.name}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                        SKU: {product.sku}
                      </div>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", flexShrink: 0 }}>
                      {moneyExact(Number(product.sellPrice))}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        <div style={styles.productList}>
          <div
            style={{
              ...ui.theadRow,
              ...styles.productGridRow,
              position: "sticky",
              top: 0,
              zIndex: 1,
              backgroundColor: "var(--surface-2)",
            }}
          >
            <div style={{ ...ui.th, ...styles.productColCheck }} />
            <div style={{ ...ui.th, ...styles.productColSku }}>SKU</div>
            <div style={{ ...ui.th, ...styles.productColName }}>Nombre</div>
            <div style={{ ...ui.th, ...styles.productColPrice }}>Precio</div>
          </div>
          <div style={styles.productTbody}>
            {filtered.length === 0 ? (
              <div style={styles.productEmpty}>
                {query.trim() ? "No se encontraron productos con esa búsqueda." : "No hay productos activos para mostrar."}
              </div>
            ) : (
              filtered.map((product) => (
                <div key={product.id} style={styles.productGridRow}>
                  <div style={{ ...ui.td, ...styles.productColCheck, textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(product.id)}
                      disabled={disabled}
                      onChange={() => onToggle(product.id)}
                      style={styles.check}
                      aria-label={`Seleccionar ${product.name}`}
                    />
                  </div>
                  <div style={{ ...ui.td, ...styles.productColSku }}>{product.sku}</div>
                  <div title={product.name} style={{ ...ui.td, ...styles.productColName }}>{product.name}</div>
                  <div style={{ ...ui.td, ...styles.productColPrice }}>{moneyExact(Number(product.sellPrice))}</div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const PromocionesView: React.FC<ViewProps> = ({ refreshToken }) => {
  const { showToast } = useToast();
  const [statusConfirmTarget, setStatusConfirmTarget] = useState<PromotionRow | null>(null);
  const [rows, setRows] = useState<PromotionRow[]>([]);
  const [promotionTypes, setPromotionTypes] = useState<PromotionTypeOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [editing, setEditing] = useState<"create" | PromotionRow | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadingActionId, setLoadingActionId] = useState<number | null>(null);

  const [detail, setDetail] = useState<PromotionRow | null>(null);
  // State for the products manager modal (associated + available products)
  const [addProductsTarget, setAddProductsTarget] = useState<PromotionRow | null>(null);

  const [expandedPromotions, setExpandedPromotions] = useState<Record<number, boolean>>({});
  const isMobile = useMediaQuery("(max-width: 1024px)");

  const toggleExpandPromotion = (id: number) =>
    setExpandedPromotions((prev) => ({ ...prev, [id]: !prev[id] }));

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

  const validateField = (key: keyof FormState, value: string): string | undefined => {
    if (key === "name") return validateSafeText(value, "El nombre de la promocion", { required: true, min: 3, max: 100 });
    if (key === "description") return validateSafeText(value, "La descripcion", { required: false, max: 180 });
    if (key === "promotionTypeId" && !value) return "Seleccione un tipo de promocion.";
    if (key === "startDate" && !value) return "La fecha inicial es obligatoria.";
    if (key === "endDate" && !value) return "La fecha final es obligatoria.";
    if (key === "minQuantity") {
      const min = selectedRule === "buyXPayY" ? 2 : 1;
      return validateInteger(value, "La cantidad minima", { min });
    }
    if (key === "payQuantity") return validateInteger(value, "La cantidad a pagar", { min: 1 });
    return undefined;
  };

  const setField =
    (key: keyof Omit<FormState, "isActive" | "productIds">) =>
      (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const value =
          key === "minQuantity" || key === "payQuantity"
            ? normalizeIntegerInput(event.target.value)
            : event.target.value;
        setForm((current) => ({ ...current, [key]: value }));
        setFormError(null);
        setFieldErrors((prev) => {
          const next = { ...prev };
          const error = validateField(key, value);
          if (error) next[key] = error;
          else delete next[key];
          return next;
        });
      };

  const setDecimalField =
    (key: "value" | "specialPrice") =>
      (event: React.ChangeEvent<HTMLInputElement>) => {
        const rawValue = event.target.value.trim();
        if (rawValue && !DECIMAL_INPUT_REGEX.test(rawValue)) {
          setFieldErrors((prev) => ({
            ...prev,
            [key]: key === "value"
              ? "El valor debe ser un numero valido con maximo 3 decimales."
              : "El precio especial debe ser un numero valido con maximo 3 decimales.",
          }));
          return;
        }
        handleDecimalInputChange(rawValue, (nextValue) => {
          setForm((current) => ({ ...current, [key]: nextValue }));
          setFormError(null);
          const validation =
            key === "value" && selectedRule === "percentage"
              ? validateDecimalField(nextValue, "El porcentaje", {
                min: 0,
                max: 100,
                minExclusive: true,
                invalidMessage: "El porcentaje debe ser un numero valido con maximo 3 decimales.",
                minMessage: "El porcentaje debe ser mayor a 0.",
                maxMessage: "El porcentaje debe ser menor o igual a 100.",
              })
              : key === "value" && selectedRule === "fixedAmount"
                ? validateDecimalField(nextValue, "El monto fijo", {
                  min: 0,
                  minExclusive: true,
                  invalidMessage: "El monto fijo debe ser un numero valido con maximo 3 decimales.",
                  minMessage: "El monto fijo debe ser mayor a 0.",
                })
                : key === "specialPrice" && selectedRule === "specialPrice"
                  ? validateDecimalField(nextValue, "El precio especial", {
                    min: 0,
                    minExclusive: true,
                    invalidMessage: "El precio especial debe ser un numero valido con maximo 3 decimales.",
                    minMessage: "El precio especial debe ser mayor a 0.",
                  })
                  : { ok: true as const };
          setFieldErrors((prev) => {
            const next = { ...prev };
            if (!validation.ok) next[key] = validation.error;
            else delete next[key];
            return next;
          });
        });
      };

  const validatePromotionDecimals = (): { ok: true; value: PromotionDecimalValues } | { ok: false; error: string } => {
    const emptyValues: PromotionDecimalValues = { value: null, specialPrice: null, roundingMessages: [] };

    if (selectedRule === "percentage") {
      const value = validateDecimalField(form.value, "El porcentaje", {
        min: 0,
        max: 100,
        minExclusive: true,
        invalidMessage: "El porcentaje debe ser un numero valido con maximo 3 decimales.",
        minMessage: "El porcentaje debe ser mayor a 0.",
        maxMessage: "El porcentaje debe ser menor o igual a 100.",
      });
      if (!value.ok) return { ok: false, error: value.error };
      const decimalValue = value.value;
      return {
        ok: true,
        value: {
          ...emptyValues,
          value: decimalValue.value,
          roundingMessages: collectRoundedDecimalMessages([decimalValue]),
        },
      };
    }

    if (selectedRule === "fixedAmount") {
      const value = validateDecimalField(form.value, "El monto fijo", {
        min: 0,
        minExclusive: true,
        invalidMessage: "El monto fijo debe ser un numero valido con maximo 3 decimales.",
        minMessage: "El monto fijo debe ser mayor a 0.",
      });
      if (!value.ok) return { ok: false, error: value.error };
      const decimalValue = value.value;
      return {
        ok: true,
        value: {
          ...emptyValues,
          value: decimalValue.value,
          roundingMessages: collectRoundedDecimalMessages([decimalValue]),
        },
      };
    }

    if (selectedRule === "specialPrice") {
      const specialPrice = validateDecimalField(form.specialPrice, "El precio especial", {
        min: 0,
        minExclusive: true,
        invalidMessage: "El precio especial debe ser un numero valido con maximo 3 decimales.",
        minMessage: "El precio especial debe ser mayor a 0.",
      });
      if (!specialPrice.ok) return { ok: false, error: specialPrice.error };
      const decimalValue = specialPrice.value;
      return {
        ok: true,
        value: {
          ...emptyValues,
          specialPrice: decimalValue.value,
          roundingMessages: collectRoundedDecimalMessages([decimalValue]),
        },
      };
    }

    return { ok: true, value: emptyValues };
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
    setFormError(null);
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next.promotionTypeId;
      delete next.value;
      delete next.minQuantity;
      delete next.payQuantity;
      delete next.specialPrice;
      return next;
    });
  };

  const toggleFormProduct = (productId: number) => {
    setForm((current) => ({
      ...current,
      productIds: current.productIds.includes(productId)
        ? current.productIds.filter((id) => id !== productId)
        : [...current.productIds, productId],
    }));
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next.productIds;
      return next;
    });
    setFormError(null);
  };

  const validateForm = () => {
    const errors: FieldErrors = {};

    const nameError = validateField("name", form.name);
    if (nameError) errors.name = nameError;

    const descriptionError = validateField("description", form.description);
    if (descriptionError) errors.description = descriptionError;

    const typeError = validateField("promotionTypeId", form.promotionTypeId);
    if (typeError) errors.promotionTypeId = typeError;

    const startError = validateField("startDate", form.startDate);
    if (startError) errors.startDate = startError;

    const endError = validateField("endDate", form.endDate);
    if (endError) errors.endDate = endError;

    const start = new Date(`${form.startDate}T00:00:00`);
    const end = new Date(`${form.endDate}T23:59:59`);
    if (form.startDate && form.endDate && end <= start) errors.endDate = "La fecha final debe ser mayor que la fecha inicial.";
    if (typeof form.isActive !== "boolean") errors.isActive = "El estado de la promocion es invalido.";
    if (form.productIds.length === 0) errors.productIds = "Seleccione al menos un producto activo.";

    if (selectedRule === "percentage") {
      const decimalValidation = validatePromotionDecimals();
      if (!decimalValidation.ok) errors.value = decimalValidation.error;
    }

    if (selectedRule === "fixedAmount") {
      const decimalValidation = validatePromotionDecimals();
      if (!decimalValidation.ok) errors.value = decimalValidation.error;
    }

    if (selectedRule === "buyXPayY") {
      const minQuantity = Number(form.minQuantity);
      const payQuantity = Number(form.payQuantity);
      if (!Number.isInteger(minQuantity) || minQuantity < 2) errors.minQuantity = "La cantidad minima debe ser mayor o igual a 2.";
      if (!Number.isInteger(payQuantity) || payQuantity < 1) errors.payQuantity = "La cantidad a pagar debe ser mayor o igual a 1.";
      if (Number.isInteger(minQuantity) && Number.isInteger(payQuantity) && payQuantity >= minQuantity) {
        errors.payQuantity = "La cantidad a pagar debe ser menor que la cantidad minima.";
      }
    }

    if (selectedRule === "specialPrice") {
      const minQuantity = Number(form.minQuantity);
      if (!Number.isInteger(minQuantity) || minQuantity < 1) errors.minQuantity = "La cantidad minima debe ser mayor o igual a 1.";
      const decimalValidation = validatePromotionDecimals();
      if (!decimalValidation.ok) errors.specialPrice = decimalValidation.error;
    }

    if (!selectedRule) errors.promotionTypeId = "El tipo de promocion seleccionado no esta soportado.";

    return errors;
  };

  const buildPayload = (decimalValues: PromotionDecimalValues) => ({
    name: form.name.trim(),
    description: form.description.trim() || null,
    promotionTypeId: Number(form.promotionTypeId),
    startDate: form.startDate,
    endDate: form.endDate,
    isActive: form.isActive,
    value: decimalValues.value,
    minQuantity: form.minQuantity.trim() ? Number(form.minQuantity) : null,
    payQuantity: form.payQuantity.trim() ? Number(form.payQuantity) : null,
    specialPrice: decimalValues.specialPrice,
    productIds: form.productIds,
  });

  const openCreate = () => {
    setEditing("create");
    setForm(emptyForm());
    setFieldErrors({});
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
    setFieldErrors({});
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

  /** Abre el modal de agregar productos con filtro por categoría */
  const openAddProducts = async (promotion: PromotionRow) => {
    setLoadingActionId(promotion.id);
    try {
      const fresh = await loadPromotionDetail(promotion.id);
      if (!fresh) throw new Error("PROMOTION_NOT_FOUND");
      setAddProductsTarget(fresh);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "No se pudo abrir el selector de productos."));
    } finally {
      setLoadingActionId(null);
    }
  };

  /** Llamada cuando el modal de agregar productos asocia productos con éxito */
  const handleAddProductsSuccess = async () => {
    if (addProductsTarget) {
      try {
        const fresh = await loadPromotionDetail(addProductsTarget.id);
        if (fresh) setAddProductsTarget(fresh);
      } catch {
        // silently ignore refresh error
      }
    }
    await load();
  };

  const closeForm = () => {
    if (saving) return;
    setEditing(null);
    setFieldErrors({});
    setFormError(null);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();

    const validation = validateForm();
    if (Object.keys(validation).length > 0) {
      setFieldErrors(validation);
      setFormError("Revisa los campos marcados antes de guardar.");
      return;
    }
    const decimalValidation = validatePromotionDecimals();
    if (!decimalValidation.ok) {
      setFieldErrors((prev) => ({
        ...prev,
        [selectedRule === "specialPrice" ? "specialPrice" : "value"]: decimalValidation.error,
      }));
      setFormError("Revisa los campos marcados antes de guardar.");
      return;
    }

    setSaving(true);
    setFormError(null);
    setFieldErrors({});
    try {
      if (decimalValidation.value.roundingMessages.length > 0) {
        showToast(decimalValidation.value.roundingMessages.join(" | "), "warning");
      }

      if (editing === "create") {
        await api.post("/api/admin-promotions/promotions", buildPayload(decimalValidation.value));
        setNotice("Promocion creada correctamente.");
      } else if (editing) {
        await api.put(`/api/admin-promotions/promotions/${editing.id}`, buildPayload(decimalValidation.value));
        setNotice("Promocion actualizada correctamente.");
      }

      setEditing(null);
      setForm(emptyForm());
      setFieldErrors({});
      await load();
    } catch (err: unknown) {
      setFormError(getErrorMessage(err, "No se pudo guardar la promocion."));
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = (promotion: PromotionRow) => {
    setStatusConfirmTarget(promotion);
  };

  const confirmToggleStatus = async () => {
    const promotion = statusConfirmTarget;
    if (!promotion) return;
    setStatusConfirmTarget(null);
    const next = !promotion.isActive;

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

      {isMobile ? (
        /* ── Mobile / Tablet: Card-based layout ── */
        <div style={{ overflowY: "auto", maxHeight: "62vh", padding: "8px 16px" }}>
          {/* Header row mirroring the fields */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr auto",
            padding: "12px 16px",
            fontWeight: 700,
            fontSize: 11,
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.4px",
          }}>
            <div>Promoción</div>
            <div style={{ textAlign: "right", paddingRight: 8 }}>Acciones</div>
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
              {search.trim() ? "No hay promociones que coincidan con la búsqueda." : "No hay promociones registradas."}
            </div>
          )}

          {!loading &&
            !error &&
            rows.map((promotion) => {
              const busy = loadingActionId === promotion.id;
              const isExpanded = expandedPromotions[promotion.id];

              return (
                <div
                  key={promotion.id}
                  style={{
                    backgroundColor: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    marginBottom: 10,
                    boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
                    overflow: "hidden",
                  }}
                >
                  {/* Header: Tipo de Promoción */}
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
                    <span>{typeLabel(promotion.promotionType.name).toUpperCase()}</span>
                  </div>

                  {/* Fila principal */}
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    padding: "12px 16px",
                    alignItems: "center",
                  }}>
                    {/* Promoción (Nombre + tipo + valor apilados) */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 2, overflow: "hidden" }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {promotion.name}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                        {typeLabel(promotion.promotionType.name)} · {formatPromotionValue(promotion)}
                      </div>
                    </div>

                    {/* Botones de Acción */}
                    <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8 }}>
                      {/* Ver */}
                      <button
                        onClick={() => openDetail(promotion)}
                        disabled={busy}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: "var(--surface-3)",
                          border: "1px solid var(--border-strong)",
                          borderRadius: 8,
                          width: 34,
                          height: 34,
                          cursor: "pointer",
                          color: "var(--text-secondary)",
                          padding: 0,
                          opacity: busy ? 0.55 : 1,
                        }}
                        className="active-tap"
                        title="Ver detalle"
                      >
                        <Eye size={14} />
                      </button>

                      {/* Chevron */}
                      <button
                        onClick={() => toggleExpandPromotion(promotion.id)}
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
                  </div>

                  {/* Detalle expandido */}
                  {isExpanded && (
                    <div style={{
                      padding: "16px",
                      margin: "0 16px 16px 16px",
                      backgroundColor: "var(--surface-2)",
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                      gap: 16,
                      textAlign: "left",
                    }}>
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase" as const, letterSpacing: "0.3px", marginBottom: 4 }}>ID de Promoción</div>
                        <div style={{ fontSize: 13, fontWeight: 800, color: "var(--accent-strong)" }}>{promotion.id}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase" as const, letterSpacing: "0.3px", marginBottom: 4 }}>Descripción</div>
                        <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{promotion.description || "Sin descripción"}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase" as const, letterSpacing: "0.3px", marginBottom: 4 }}>Vigencia</div>
                        <div style={{ fontSize: 13, color: "var(--text-secondary)", fontWeight: 700 }}>{fmtDate(promotion.startDate)} - {fmtDate(promotion.endDate)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase" as const, letterSpacing: "0.3px", marginBottom: 4 }}>Cantidad de Productos</div>
                        <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{promotion.products.length} producto{promotion.products.length === 1 ? "" : "s"}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase" as const, letterSpacing: "0.3px", marginBottom: 4 }}>Productos incluidos</div>
                        <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{productSummary(promotion)}</div>
                      </div>
                      {promotion.minQuantity !== null && (
                        <div>
                          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase" as const, letterSpacing: "0.3px", marginBottom: 4 }}>Cantidad mínima</div>
                          <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{promotion.minQuantity}</div>
                        </div>
                      )}
                      {promotion.payQuantity !== null && (
                        <div>
                          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase" as const, letterSpacing: "0.3px", marginBottom: 4 }}>Cantidad a pagar</div>
                          <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{promotion.payQuantity}</div>
                        </div>
                      )}
                      {promotion.createdAt && (
                        <div>
                          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase" as const, letterSpacing: "0.3px", marginBottom: 4 }}>Fecha de creación</div>
                          <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{fmtDate(promotion.createdAt)}</div>
                        </div>
                      )}
                      {promotion.updatedAt && (
                        <div>
                          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase" as const, letterSpacing: "0.3px", marginBottom: 4 }}>Última actualización</div>
                          <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{fmtDate(promotion.updatedAt)}</div>
                        </div>
                      )}

                      {/* Acciones del desplegable */}
                      <div style={{
                        gridColumn: "1 / -1",
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        marginTop: 8,
                        borderTop: "1px solid var(--border)",
                        paddingTop: 14,
                        flexWrap: "wrap",
                      }}>
                        {/* Editar */}
                        <button
                          onClick={() => openEdit(promotion)}
                          disabled={busy}
                          style={{
                            ...ui.linkBtn,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            backgroundColor: "#eff6ff",
                            border: "1px solid #bfdbfe",
                            borderRadius: 8,
                            padding: "8px 14px",
                            fontSize: 12,
                            fontWeight: 700,
                            color: "var(--accent-strong)",
                            cursor: "pointer",
                            opacity: busy ? 0.55 : 1,
                          }}
                          className="active-tap"
                        >
                          <Pencil size={13} /> Editar promoción
                        </button>

                        {/* Gestionar productos con filtro de categoria */}
                        <button
                          onClick={() => openAddProducts(promotion)}
                          disabled={busy}
                          style={{
                            ...ui.linkBtn,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            backgroundColor: "#f5f3ff",
                            border: "1px solid #ddd6fe",
                            borderRadius: 8,
                            padding: "8px 14px",
                            fontSize: 12,
                            fontWeight: 700,
                            color: "#6d28d9",
                            cursor: "pointer",
                            opacity: busy ? 0.55 : 1,
                          }}
                          className="active-tap"
                        >
                          <PackagePlus size={13} /> Gestionar productos
                        </button>

                        {/* Activar/Desactivar */}
                        <button
                          onClick={() => toggleStatus(promotion)}
                          disabled={busy}
                          style={{
                            ...ui.linkBtn,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            backgroundColor: promotion.isActive ? "#fef2f2" : "#f0fdf4",
                            border: `1px solid ${promotion.isActive ? "#fecaca" : "#bbf7d0"}`,
                            borderRadius: 8,
                            padding: "8px 14px",
                            fontSize: 12,
                            fontWeight: 700,
                            color: promotion.isActive ? "#b91c1c" : "#15803d",
                            cursor: "pointer",
                            opacity: busy ? 0.55 : 1,
                          }}
                          className="active-tap"
                        >
                          <Power size={13} /> {promotion.isActive ? "Desactivar" : "Activar"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      ) : (
        /* ── Desktop: Standard table ── */
        <div className="table-sticky-head" style={{ ...ui.tableWrap, overflowX: "auto", overflowY: "auto", maxHeight: "62vh" }}>
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
                      <td style={{ ...ui.td, fontWeight: 800, color: "var(--text)", whiteSpace: "normal", minWidth: 210 }}>
                        <div>{promotion.name}</div>
                        {promotion.description && <div style={styles.rowSubtext}>{promotion.description}</div>}
                      </td>
                      <td style={ui.td}>{typeLabel(promotion.promotionType.name)}</td>
                      <td style={{ ...ui.td, textAlign: "right", fontWeight: 800 }}>{formatPromotionValue(promotion)}</td>
                      <td style={{ ...ui.td, color: "var(--text-muted)" }}>
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
                          <button style={ui.linkBtn} className="active-tap" disabled={busy} onClick={() => openAddProducts(promotion)}>
                            <PackagePlus size={14} style={styles.iconInline} /> Gestionar productos
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
      )}

      {editing !== null && (
        <div style={ui.overlay} onClick={closeForm}>
          <form style={{ ...ui.modal, width: "calc(100% - 24px)", maxWidth: 710, maxHeight: "90vh" }} onClick={(event) => event.stopPropagation()} onSubmit={submit}>
            <div style={ui.modalHeader}>
              <span style={ui.modalTitle}>{editing === "create" ? "Nueva promocion" : "Editar promocion"}</span>
              <button type="button" style={ui.linkBtn} onClick={closeForm} aria-label="Cerrar">
                <X size={18} />
              </button>
            </div>
            <div style={ui.modalBody}>
              <div style={styles.formGrid}>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={ui.fieldLabel}>Nombre *</label>
                  <input
                    style={ui.input}
                    value={form.name}
                    onChange={setField("name")}
                    placeholder="Coca Cola 20% OFF"
                    autoFocus
                    maxLength={100}
                  />
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                    {fieldErrors.name ? (
                      <p style={{ ...styles.fieldError, marginTop: 0, marginBottom: 0 }}>{fieldErrors.name}</p>
                    ) : (
                      <div />
                    )}
                    <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: "auto", fontWeight: 600 }}>
                      {form.name.length} / 100
                    </span>
                  </div>
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={ui.fieldLabel}>Descripcion</label>
                  <textarea
                    style={{ ...ui.input, minHeight: 72, resize: "vertical" }}
                    value={form.description}
                    onChange={setField("description")}
                    placeholder="Descuento en refrescos"
                    maxLength={180}
                  />
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                    {fieldErrors.description ? (
                      <p style={{ ...styles.fieldError, marginTop: 0, marginBottom: 0 }}>{fieldErrors.description}</p>
                    ) : (
                      <div />
                    )}
                    <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: "auto", fontWeight: 600 }}>
                      {form.description.length} / 180
                    </span>
                  </div>
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
                  {fieldErrors.promotionTypeId && <p style={styles.fieldError}>{fieldErrors.promotionTypeId}</p>}
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
                  {fieldErrors.startDate && <p style={styles.fieldError}>{fieldErrors.startDate}</p>}
                </div>

                <div>
                  <label style={ui.fieldLabel}>Fin *</label>
                  <input type="date" style={ui.input} value={form.endDate} onChange={setField("endDate")} />
                  {fieldErrors.endDate && <p style={styles.fieldError}>{fieldErrors.endDate}</p>}
                </div>

                {(selectedRule === "percentage" || selectedRule === "fixedAmount") && (
                  <div>
                    <label style={ui.fieldLabel}>{selectedRule === "percentage" ? "Porcentaje *" : "Monto fijo *"}</label>
                    <input type="text" style={ui.input} value={form.value} onChange={setDecimalField("value")} placeholder={selectedRule === "percentage" ? "20" : "10.00"} inputMode="decimal" />
                    {fieldErrors.value && <p style={styles.fieldError}>{fieldErrors.value}</p>}
                  </div>
                )}

                {selectedRule === "buyXPayY" && (
                  <>
                    <div>
                      <label style={ui.fieldLabel}>Cantidad minima *</label>
                      <input style={ui.input} value={form.minQuantity} onChange={setField("minQuantity")} placeholder="3" inputMode="numeric" />
                      {fieldErrors.minQuantity && <p style={styles.fieldError}>{fieldErrors.minQuantity}</p>}
                    </div>
                    <div>
                      <label style={ui.fieldLabel}>Cantidad a pagar *</label>
                      <input style={ui.input} value={form.payQuantity} onChange={setField("payQuantity")} placeholder="2" inputMode="numeric" />
                      {fieldErrors.payQuantity && <p style={styles.fieldError}>{fieldErrors.payQuantity}</p>}
                    </div>
                  </>
                )}

                {selectedRule === "specialPrice" && (
                  <>
                    <div>
                      <label style={ui.fieldLabel}>Cantidad minima *</label>
                      <input style={ui.input} value={form.minQuantity} onChange={setField("minQuantity")} placeholder="2" inputMode="numeric" />
                      {fieldErrors.minQuantity && <p style={styles.fieldError}>{fieldErrors.minQuantity}</p>}
                    </div>
                    <div>
                      <label style={ui.fieldLabel}>Precio especial *</label>
                      <input type="text" style={ui.input} value={form.specialPrice} onChange={setDecimalField("specialPrice")} placeholder="38.00" inputMode="decimal" />
                      {fieldErrors.specialPrice && <p style={styles.fieldError}>{fieldErrors.specialPrice}</p>}
                    </div>
                  </>
                )}
              </div>

              <div style={{ marginTop: 18 }}>
                <label style={ui.fieldLabel}>Productos *</label>
                <ProductSelector products={products} selectedIds={form.productIds} onToggle={toggleFormProduct} disabled={saving} />
                {fieldErrors.productIds && <p style={styles.fieldError}>{fieldErrors.productIds}</p>}
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
          <div
            style={{
              ...ui.modal,
              width: "100%",
              maxWidth: "min(710px, calc(100vw - 32px))",
              maxHeight: "90vh",
              boxSizing: "border-box",
              wordBreak: "break-word",
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={ui.modalHeader}>
              <span
                style={{
                  ...ui.modalTitle,
                  minWidth: 0,
                  flex: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  maxWidth: "100%",
                }}
              >
                {detail.name}
              </span>
              <button type="button" style={ui.linkBtn} onClick={() => setDetail(null)} aria-label="Cerrar">
                <X size={18} />
              </button>
            </div>
            <div style={{ ...ui.modalBody, padding: "14px 20px" }}>
              <div style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(4, 1fr)",
                gap: 12,
                marginBottom: 16,
              }}>
                <div style={{ ...ui.kpiCard, padding: "10px 12px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                  <span style={{ ...styles.detailLabel, marginBottom: 4 }}>Tipo</span>
                  <strong style={{ fontSize: 13, color: "var(--text)" }}>{typeLabel(detail.promotionType.name)}</strong>
                </div>
                <div style={{ ...ui.kpiCard, padding: "10px 12px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                  <span style={{ ...styles.detailLabel, marginBottom: 4 }}>Valor</span>
                  <strong style={{ fontSize: 13, color: "var(--text)" }}>{formatPromotionValue(detail)}</strong>
                </div>
                <div style={{ ...ui.kpiCard, padding: "10px 12px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                  <span style={{ ...styles.detailLabel, marginBottom: 4 }}>Vigencia</span>
                  <strong style={{ fontSize: 12, color: "var(--text)" }}>{fmtDate(detail.startDate)} - {fmtDate(detail.endDate)}</strong>
                </div>
                <div style={{ ...ui.kpiCard, padding: "10px 12px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                  <span style={{ ...styles.detailLabel, marginBottom: 4 }}>Estado</span>
                  <div>
                    <Badge tone={getStatus(detail).tone}>{getStatus(detail).label}</Badge>
                  </div>
                </div>
              </div>

              {detail.description && (
                <div style={{
                  backgroundColor: "var(--surface-2)",
                  border: "1px solid var(--border-soft)",
                  borderRadius: 8,
                  padding: "10px 12px",
                  fontSize: 12.5,
                  color: "var(--text-secondary)",
                  lineHeight: 1.45,
                  marginBottom: 16,
                }}>
                  {detail.description}
                </div>
              )}

              <div style={{ marginTop: 0 }}>
                <label style={{ ...ui.fieldLabel, marginBottom: 6 }}>Productos asignados ({detail.products.length})</label>
                <div style={{
                  ...styles.assignedList,
                  maxHeight: "32vh",
                  overflowY: "auto",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                }}>
                  {detail.products.length === 0 ? (
                    <div style={{ padding: "16px", fontSize: 13, color: "var(--text-muted)", textAlign: "center" }}>
                      No hay productos asignados a esta promoción.
                    </div>
                  ) : (
                    detail.products.map((row) =>
                      isMobile ? (
                        <div
                          key={row.productId}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "flex-start",
                            padding: "10px 12px",
                            borderBottom: "1px solid var(--border)",
                            gap: 8,
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div
                              style={{
                                fontSize: 13,
                                fontWeight: 600,
                                color: "var(--text)",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {row.product?.name ?? `Producto #${row.productId}`}
                            </div>
                            <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                              {row.product?.sku ?? `#${row.productId}`}
                            </div>
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", flexShrink: 0 }}>
                            {row.product ? moneyExact(Number(row.product.sellPrice)) : ""}
                          </div>
                        </div>
                      ) : (
                        <div key={row.productId} style={styles.assignedRow}>
                          <span style={styles.sku}>{row.product?.sku ?? `#${row.productId}`}</span>
                          <span style={{ fontWeight: 800 }}>{row.product?.name ?? `Producto #${row.productId}`}</span>
                          <span style={{ marginLeft: "auto", color: "var(--text-muted)" }}>
                            {row.product ? moneyExact(Number(row.product.sellPrice)) : ""}
                          </span>
                        </div>
                      )
                    )
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={statusConfirmTarget !== null}
        onClose={() => setStatusConfirmTarget(null)}
        onConfirm={confirmToggleStatus}
        variant="warning"
        title="Cambiar estado de promoción"
        message={`¿Desea ${statusConfirmTarget?.isActive ? "desactivar" : "activar"} la promoción "${statusConfirmTarget?.name}"?`}
      />

      {/* Modal: Gestionar productos de la promocion (asociados + disponibles) */}
      {addProductsTarget && (
        <AddProductsToPromotionModal
          promotionId={addProductsTarget.id}
          promotionName={addProductsTarget.name}
          promotionStartDate={addProductsTarget.startDate}
          associatedProducts={addProductsTarget.products}
          onClose={() => setAddProductsTarget(null)}
          onSuccess={handleAddProductsSuccess}
        />
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
    color: "var(--text-muted)",
    fontWeight: 700,
  },
  resultCount: {
    marginLeft: "auto",
    fontSize: 13,
    color: "var(--text-muted)",
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
    color: "var(--text-muted)",
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
    color: "var(--text-secondary)",
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
    border: "1px solid var(--border)",
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "var(--surface)",
    width: "100%",
    maxWidth: "100%",
  },
  productPickerTop: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderBottom: "1px solid var(--border)",
    backgroundColor: "var(--surface-2)",
    flexWrap: "wrap",
  },
  selectedCount: {
    marginLeft: "auto",
    color: "var(--accent-strong)",
    fontSize: 12,
    fontWeight: 800,
  },
  productList: {
    width: "100%",
    maxWidth: "100%",
    border: "1px solid var(--border)",
    borderRadius: 6,
    overflow: "hidden",
  },
  productTbody: {
    display: "block",
    width: "100%",
    maxHeight: 220,
    overflowY: "auto",
    overflowX: "hidden",
  },
  productGridRow: {
    display: "flex",
    alignItems: "center",
    width: "100%",
    boxSizing: "border-box",
    borderBottom: "1px solid var(--border-soft)",
  },
  productColCheck: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flex: "0 0 28px",
    width: 28,
    boxSizing: "border-box",
  },
  productColSku: {
    flex: "0 0 100px",
    width: 100,
    minWidth: 90,
    boxSizing: "border-box",
    fontWeight: 800,
    color: "var(--accent-strong)",
    overflow: "visible",
    whiteSpace: "nowrap",
  },
  productColName: {
    flex: "1 1 auto",
    minWidth: 0,
    boxSizing: "border-box",
    fontWeight: 700,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  productColPrice: {
    flex: "0 0 80px",
    width: 80,
    boxSizing: "border-box",
    textAlign: "right",
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
  },
  productEmpty: {
    textAlign: "center",
    padding: "22px 14px",
    color: "var(--text-faint)",
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
  fieldError: {
    color: "#b91c1c",
    fontSize: 12,
    fontWeight: 600,
    marginTop: 5,
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
    color: "var(--text)",
  },
  detailLabel: {
    display: "block",
    color: "var(--text-muted)",
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: "0.4px",
    marginBottom: 5,
    textTransform: "uppercase",
  },
  detailDescription: {
    color: "var(--text-secondary)",
    fontSize: 13,
    fontWeight: 600,
    lineHeight: 1.55,
    marginTop: 18,
  },
  assignedList: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    overflow: "hidden",
  },
  assignedRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    borderBottom: "1px solid var(--border-soft)",
    color: "var(--text-secondary)",
    fontSize: 13,
    padding: "10px 12px",
    overflow: "hidden",
    wordBreak: "break-word",
  },
  sku: {
    backgroundColor: "var(--accent-soft)",
    borderRadius: 6,
    color: "var(--accent-strong)",
    fontSize: 11,
    fontWeight: 800,
    padding: "3px 7px",
  },
  managerTitle: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    color: "var(--text)",
    fontSize: 14,
    marginBottom: 14,
  },
};

export default PromocionesView;
