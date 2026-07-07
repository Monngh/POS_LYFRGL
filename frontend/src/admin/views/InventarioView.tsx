import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { AlertTriangle, ArrowLeftRight, Check, Settings, Printer, X, Plus, Eye, ChevronDown, ChevronUp, Search, Tags, FolderTree } from "lucide-react";
import api from "../../shared/services/api";
import { useAuth } from "../../auth";
import {
  DECIMAL_INPUT_REGEX,
  handleDecimalInputChange,
  validateDecimalField,
} from "../../shared/utils/decimalInput";
import { validateInteger } from "../../shared/utils/formValidation";
import { useToast } from "../../shared/context/ToastContext";
import { ConfirmModal } from "../../shared/ui";
import KardexView from "./KardexView";
import { CategoryManagementView } from "../components/categories/CategoryManagementView";
import { getCategoryDisplayColor } from "../components/categories/categoryColors";
import type { CategoryLevel } from "../services/categoryAdmin.service";
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
  useMediaQuery,
  normalizeProductSearchText,
  usePagination,
  Pagination,
} from "./shared";

interface ProductCategorySummary {
  id: number;
  code: string;
  name: string;
  level: CategoryLevel;
  active: boolean;
  color?: string | null;
}

interface CategoryPathNode extends ProductCategorySummary {
  parent?: CategoryPathNode | null;
}

interface CategoryOption extends ProductCategorySummary {
  description: string | null;
  parent: CategoryPathNode | null;
  path?: string[];
  pathLabel?: string;
}

interface CategoryListResponse {
  data: CategoryOption[];
}

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
  categories: ProductCategorySummary[];
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
  satProductKey?: string;
  satUnitKey?: string;
  createdAt: string;
  updatedAt: string;
  categories: ProductCategorySummary[];
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

interface PromotionTypeSummary {
  id: number;
  name: string;
  description: string | null;
}

interface PromotionProductSummary {
  id?: number;
  promotionId?: number;
  productId: number;
  product?: {
    id: number;
    sku: string;
    name: string;
    sellPrice: number;
    active: boolean;
  } | null;
}

interface ProductPromotion {
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
  promotionType: PromotionTypeSummary;
  products: PromotionProductSummary[];
}

interface ProductCategoryMapRow {
  id: number;
  categories: ProductCategorySummary[];
}

const subModalStyle: React.CSSProperties = {
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

const emptyForm = { sku: "", barcode: "", name: "", description: "", costPrice: "", sellPrice: "", satProductKey: "", satUnitKey: "" };
type ProductFieldErrors = Partial<Record<keyof typeof emptyForm | "categoryIds", string>>;
const PRODUCT_TEXT_REGEX = /^[A-Za-zÁÉÍÓÚáéíóúÑñÜü0-9\s.,#\-/()]+$/;
const SKU_REGEX = /^[A-Za-z0-9_-]+$/;
const BARCODE_REGEX = /^[0-9]+$/;
const SAT_PRODUCT_KEY_REGEX = /^[0-9]{8}$/;
const SAT_UNIT_KEY_REGEX = /^[A-Za-z0-9]+$/;
const PRODUCT_NAME_MAX_LENGTH = 50;
const PRODUCT_DESCRIPTION_MAX_LENGTH = 100;
const BARCODE_MAX_LENGTH = 13;

type ValidationSuccess<T> = {
  ok: true;
  value: T;
};

type ValidationFailure = {
  ok: false;
  error: string;
};

type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

interface MoneyField {
  value: number;
  roundedMessage?: string;
}

interface ValidatedProductForm {
  sku: string;
  barcode?: string;
  name: string;
  description?: string;
  costPrice: number;
  sellPrice: number;
  satProductKey: string;
  satUnitKey: string;
  roundingMessages: string[];
}

const getValidationError = <T,>(result: ValidationResult<T>) => {
  if (result.ok === true) return null;
  return result.error;
};

const getValidationValue = <T,>(result: ValidationResult<T>) => {
  if (result.ok === true) return result.value;
  return null;
};

const validateMoneyField = (rawValue: string | number, field: "costo" | "precio"): ValidationResult<MoneyField> => {
  const label = field === "costo" ? "El costo" : "El precio";
  return validateDecimalField(rawValue, label, {
    invalidMessage: `${label} debe ser un número válido con máximo 3 decimales.`,
  });
};

const validateProductForm = (form: typeof emptyForm, requireSku: boolean): ValidationResult<ValidatedProductForm> => {
  const sku = form.sku.trim();
  const barcode = form.barcode.trim();
  const name = form.name.trim();
  const description = form.description.trim();
  const satProductKey = form.satProductKey.trim() || "01010101";
  const satUnitKey = form.satUnitKey.trim() || "H87";

  if (requireSku && !sku) {
    return { ok: false, error: "El SKU es obligatorio." };
  }
  if (sku && !SKU_REGEX.test(sku)) {
    return { ok: false, error: "El SKU solo puede contener letras, números, guion medio y guion bajo." };
  }
  if (!name) {
    return { ok: false, error: "El nombre del producto es requerido." };
  }
  if (name.length > PRODUCT_NAME_MAX_LENGTH) {
    return { ok: false, error: "El nombre del producto no puede tener más de 20 caracteres." };
  }
  if (!PRODUCT_TEXT_REGEX.test(name)) {
    return { ok: false, error: "El nombre contiene caracteres no permitidos." };
  }
  if (barcode && (!BARCODE_REGEX.test(barcode) || barcode.length > BARCODE_MAX_LENGTH)) {
    return { ok: false, error: "El código de barras solo puede contener números y no debe exceder 13 dígitos." };
  }
  if (description.length > PRODUCT_DESCRIPTION_MAX_LENGTH) {
    return { ok: false, error: "La descripción no puede tener más de 50 caracteres." };
  }
  if (description && !PRODUCT_TEXT_REGEX.test(description)) {
    return { ok: false, error: "La descripción contiene caracteres no permitidos." };
  }
  if (!SAT_PRODUCT_KEY_REGEX.test(satProductKey)) {
    return { ok: false, error: "La clave SAT debe contener 8 números." };
  }
  if (!SAT_UNIT_KEY_REGEX.test(satUnitKey)) {
    return { ok: false, error: "La clave de unidad SAT solo puede contener letras y números." };
  }

  const cost = validateMoneyField(form.costPrice, "costo");
  const costError = getValidationError(cost);
  if (costError) {
    return { ok: false, error: costError };
  }
  const costValue = getValidationValue(cost);
  if (!costValue) {
    return { ok: false, error: "El costo debe ser un número válido." };
  }

  const sell = validateMoneyField(form.sellPrice, "precio");
  const sellError = getValidationError(sell);
  if (sellError) {
    return { ok: false, error: sellError };
  }
  const sellValue = getValidationValue(sell);
  if (!sellValue) {
    return { ok: false, error: "El precio debe ser un número válido." };
  }

  return {
    ok: true,
    value: {
      sku,
      barcode: barcode || undefined,
      name,
      description: description || undefined,
      costPrice: costValue.value,
      sellPrice: sellValue.value,
      satProductKey,
      satUnitKey,
      roundingMessages: [costValue.roundedMessage, sellValue.roundedMessage].filter((message): message is string => Boolean(message)),
    },
  };
};

const validateProductFormFields = (form: typeof emptyForm, requireSku: boolean): ProductFieldErrors => {
  const errors: ProductFieldErrors = {};
  const sku = form.sku.trim();
  const barcode = form.barcode.trim();
  const name = form.name.trim();
  const description = form.description.trim();
  const satProductKey = form.satProductKey.trim() || "01010101";
  const satUnitKey = form.satUnitKey.trim() || "H87";

  if (requireSku && !sku) errors.sku = "El SKU es obligatorio.";
  else if (sku && !SKU_REGEX.test(sku)) errors.sku = "El SKU solo puede contener letras, numeros, guion medio y guion bajo.";

  if (!name) errors.name = "El nombre del producto es requerido.";
  else if (name.length > PRODUCT_NAME_MAX_LENGTH) errors.name = "El nombre del producto no puede tener más de 20 caracteres.";
  else if (!PRODUCT_TEXT_REGEX.test(name)) errors.name = "El nombre contiene caracteres no permitidos.";

  if (barcode && (!BARCODE_REGEX.test(barcode) || barcode.length > BARCODE_MAX_LENGTH)) {
    errors.barcode = "El código de barras solo puede contener números y no debe exceder 13 dígitos.";
  }
  if (description.length > PRODUCT_DESCRIPTION_MAX_LENGTH) errors.description = "La descripción no puede tener más de 50 caracteres.";
  else if (description && !PRODUCT_TEXT_REGEX.test(description)) errors.description = "La descripcion contiene caracteres no permitidos.";
  if (!SAT_PRODUCT_KEY_REGEX.test(satProductKey)) errors.satProductKey = "La clave SAT debe contener 8 numeros.";
  if (!SAT_UNIT_KEY_REGEX.test(satUnitKey)) errors.satUnitKey = "La clave de unidad SAT solo puede contener letras y numeros.";

  const cost = validateMoneyField(form.costPrice, "costo");
  const costError = getValidationError(cost);
  if (costError) errors.costPrice = costError;

  const sell = validateMoneyField(form.sellPrice, "precio");
  const sellError = getValidationError(sell);
  if (sellError) errors.sellPrice = sellError;

  return errors;
};

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

const extractCategoryOptions = (payload: CategoryListResponse | { data?: unknown }) => {
  return Array.isArray(payload.data) ? payload.data as CategoryOption[] : [];
};

const getCategoryPathLabel = (category: CategoryOption | ProductCategorySummary): string => {
  if ("pathLabel" in category && category.pathLabel) return category.pathLabel;
  if ("path" in category && Array.isArray(category.path) && category.path.length > 0) return category.path.join(" > ");
  if ("parent" in category && category.parent) {
    const parts = [category.parent.parent?.name, category.parent.name, category.name].filter(Boolean);
    return parts.join(" > ");
  }
  return category.name;
};

const getPromotionRule = (typeName: string) => {
  const normalized = typeName.toLowerCase().replace(/\s+/g, "");
  if (normalized.includes("percentage") || normalized.includes("porcentaje")) return "percentage";
  if (normalized.includes("fixedamount") || normalized.includes("montofijo") || normalized.includes("fixed")) return "fixedAmount";
  if (normalized.includes("buyxpayy") || normalized.includes("nxm") || normalized.includes("2x1") || normalized.includes("3x2")) return "buyXPayY";
  if (normalized.includes("specialprice") || normalized.includes("precioespecial")) return "specialPrice";
  return null;
};

const getPromotionTypeLabel = (type: string) => {
  const rule = getPromotionRule(type);
  if (rule === "percentage") return "Porcentaje";
  if (rule === "fixedAmount") return "Monto fijo";
  if (rule === "buyXPayY") return "NxM";
  if (rule === "specialPrice") return "Precio especial";
  return type;
};

const getPromotionStatus = (promo: ProductPromotion) => {
  const now = new Date();
  const start = new Date(promo.startDate);
  const end = new Date(promo.endDate);

  if (!promo.isActive) return { label: "Inactiva", tone: "red" as const };
  if (Number.isFinite(end.getTime()) && end < now) return { label: "Vencida", tone: "slate" as const };
  if (Number.isFinite(start.getTime()) && start > now) return { label: "Programada", tone: "amber" as const };

  return { label: "Vigente", tone: "green" as const };
};

const canSelectPromotion = (promotion: ProductPromotion) => {
  const status = getPromotionStatus(promotion).label;
  return status !== "Inactiva" && status !== "Vencida";
};

const getPromotionProductSummary = (promotion: ProductPromotion) => {
  if (promotion.products.length === 0) return "Sin productos asociados";
  const names = promotion.products.map((row) => row.product?.name ?? `Producto #${row.productId}`);
  return names.length <= 3 ? names.join(", ") : `${names.slice(0, 3).join(", ")} +${names.length - 3} mas`;
};

const matchesPromotionSearch = (promotion: ProductPromotion, search: string): boolean => {
  const query = normalizeProductSearchText(search);
  if (!query) return true;
  return normalizeProductSearchText(promotion.name).includes(query);
};

const getPromotionRelatedCategoryIds = (
  promotion: ProductPromotion,
  productCategoryMap: Record<number, number[]>,
  currentProductId: number | null
): Set<number> => {
  const categoryIds = new Set<number>();
  promotion.products.forEach((row) => {
    if (row.productId === currentProductId) return;
    (productCategoryMap[row.productId] || []).forEach((categoryId) => categoryIds.add(categoryId));
  });
  return categoryIds;
};

const isPromotionCompatibleWithCategories = (
  promotion: ProductPromotion,
  selectedFinalCategoryIds: number[],
  productCategoryMap: Record<number, number[]>,
  currentProductId: number | null
): boolean => {
  if (selectedFinalCategoryIds.length === 0) return false;
  const relatedCategoryIds = getPromotionRelatedCategoryIds(promotion, productCategoryMap, currentProductId);
  if (relatedCategoryIds.size === 0) return false;
  return selectedFinalCategoryIds.some((categoryId) => relatedCategoryIds.has(categoryId));
};

const mergeCategoryOptions = (
  activeOptions: CategoryOption[],
  selectedCategories: ProductCategorySummary[]
): CategoryOption[] => {
  const optionsById = new Map<number, CategoryOption>();
  activeOptions.forEach((category) => optionsById.set(category.id, category));
  selectedCategories.forEach((category) => {
    if (!optionsById.has(category.id)) {
      optionsById.set(category.id, {
        ...category,
        description: null,
        parent: null,
        path: [category.name],
        pathLabel: category.name,
      });
    }
  });
  return [...optionsById.values()].sort((a, b) => a.code.localeCompare(b.code));
};

const matchesCategorySearch = (category: CategoryOption, search: string): boolean => {
  const terms = normalizeProductSearchText(search).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;

  const text = normalizeProductSearchText([
    category.code,
    category.name,
    category.description ?? "",
    category.parent?.name ?? "",
    category.parent?.parent?.name ?? "",
    category.pathLabel ?? "",
  ].join(" "));

  return terms.every((term) => text.includes(term));
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
  const { showToast } = useToast();
  const { user } = useAuth();
  const isMobile = useMediaQuery("(max-width: 1024px)");
  const [expandedProducts, setExpandedProducts] = useState<Record<number, boolean>>({});

  const toggleExpandProduct = (id: number) => {
    setExpandedProducts((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

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
  const [statusSaving, setStatusSaving] = useState(false);

  // Feature 1: edit prices
  const [editMode, setEditMode] = useState(false);
  const [editCost, setEditCost] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [priceFieldErrors, setPriceFieldErrors] = useState<Partial<Record<"cost" | "price", string>>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [priceSaving, setPriceSaving] = useState(false);

  // Feature 2: adjust stock
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustBranch, setAdjustBranch] = useState(0);
  const [adjustType, setAdjustType] = useState("");
  const [adjustQuantity, setAdjustQuantity] = useState(0);
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustObservations, setAdjustObservations] = useState("");
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [adjustFieldErrors, setAdjustFieldErrors] = useState<Partial<Record<"quantity", string>>>({});
  const [adjustSaving, setAdjustSaving] = useState(false);

  // Feature 3: transfer
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferFrom, setTransferFrom] = useState(0);
  const [transferTo, setTransferTo] = useState(0);
  const [transferQty, setTransferQty] = useState(0);
  const [transferConfirm, setTransferConfirm] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [transferFieldErrors, setTransferFieldErrors] = useState<Partial<Record<"quantity", string>>>({});
  const [transferSaving, setTransferSaving] = useState(false);


  // Suppliers catalog (shared between create + detail modals)
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);

  const [productSuppliers, setProductSuppliers] = useState<number[]>([]);
  const [editingSuppliersMode, setEditingSuppliersMode] = useState(false);
  const [suppliersError, setSuppliersError] = useState<string | null>(null);
  const [suppliersSaving, setSuppliersSaving] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [categoryAdminOpen, setCategoryAdminOpen] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [fieldErrors, setFieldErrors] = useState<ProductFieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [taxOptions, setTaxOptions] = useState<TaxOption[]>([]);
  const [selectedTaxIds, setSelectedTaxIds] = useState<number[]>([]);
  const [taxLoading, setTaxLoading] = useState(false);
  const [taxError, setTaxError] = useState<string | null>(null);
  const taxRequestId = useRef(0);
  const [categoryOptions, setCategoryOptions] = useState<CategoryOption[]>([]);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>([]);
  const [initialCategoryIds, setInitialCategoryIds] = useState<number[]>([]);
  const [categoryLoading, setCategoryLoading] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [categorySearch, setCategorySearch] = useState("");
  const [categoryPanelOpen, setCategoryPanelOpen] = useState(false);
  const [categoryRemovalConfirm, setCategoryRemovalConfirm] = useState<{
    message: string;
    categoryIds: number[];
    validatedProduct: ValidatedProductForm;
  } | null>(null);
  const [promotionCompatibilityConfirm, setPromotionCompatibilityConfirm] = useState<{
    message: string;
    categoryIds: number[];
    validatedProduct: ValidatedProductForm;
  } | null>(null);
  const categoryRequestId = useRef(0);
  const [skuLoading, setSkuLoading] = useState(false);
  const skuRequestId = useRef(0);

  const [promotions, setPromotions] = useState<ProductPromotion[]>([]);
  const [selectedPromotionIds, setSelectedPromotionIds] = useState<number[]>([]);
  const [initialPromotionIds, setInitialPromotionIds] = useState<number[]>([]);
  const [promotionsLoading, setPromotionsLoading] = useState(false);
  const [promotionsError, setPromotionsError] = useState<string | null>(null);
  const [promotionSearch, setPromotionSearch] = useState("");
  const [productCategoryMap, setProductCategoryMap] = useState<Record<number, number[]>>({});

  const loadPromotions = async (productId?: number) => {
    setPromotionsLoading(true);
    setPromotionsError(null);
    try {
      const res = await api.get<{ promotions: ProductPromotion[] }>("/api/admin-promotions/promotions");
      const promos = res.data.promotions || [];
      setPromotions(promos);

      if (productId) {
        const associated = promos
          .filter((promo) => (promo.products || []).some((product) => product.productId === productId))
          .map((promo) => promo.id);
        setSelectedPromotionIds(associated);
        setInitialPromotionIds(associated);
      } else {
        setSelectedPromotionIds([]);
        setInitialPromotionIds([]);
      }
    } catch (err: unknown) {
      setPromotionsError(getErrorMessage(err, "No se pudieron cargar las promociones."));
    } finally {
      setPromotionsLoading(false);
    }
  };

  const loadProductCategoryMap = async () => {
    try {
      const res = await api.get<{ products: ProductCategoryMapRow[] }>("/api/admin/products", {
        params: { includeInactive: true },
      });
      const map: Record<number, number[]> = {};
      (res.data.products || []).forEach((product) => {
        map[product.id] = (product.categories || [])
          .filter((category) => category.level === "CATEGORY")
          .map((category) => category.id);
      });
      setProductCategoryMap(map);
    } catch {
      // silently ignore
    }
  };

  const isPromotionCompatible = useCallback(
    (promotion: ProductPromotion, selectedCatIds: number[], currentProductId: number | null) =>
      isPromotionCompatibleWithCategories(promotion, selectedCatIds, productCategoryMap, currentProductId),
    [productCategoryMap]
  );

  const selectedCategories = useMemo(
    () => selectedCategoryIds
      .map((categoryId) => categoryOptions.find((category) => category.id === categoryId))
      .filter((category): category is CategoryOption => Boolean(category)),
    [categoryOptions, selectedCategoryIds]
  );

  const selectedFinalCategories = useMemo(
    () => selectedCategories.filter((category) => category.level === "CATEGORY"),
    [selectedCategories]
  );

  const selectedFinalCategoryIds = useMemo(
    () => selectedFinalCategories.map((category) => category.id),
    [selectedFinalCategories]
  );

  const visibleCategoryOptions = useMemo(
    () => categoryOptions.filter((category) => matchesCategorySearch(category, categorySearch)),
    [categoryOptions, categorySearch]
  );

  const visiblePromotionOptions = useMemo(() => {
    return promotions.filter((promotion) => {
      if (!matchesPromotionSearch(promotion, promotionSearch)) return false;

      const selected = selectedPromotionIds.includes(promotion.id);
      if (selected) return true;

      return isPromotionCompatible(promotion, selectedFinalCategoryIds, editingId);
    });
  }, [editingId, promotions, promotionSearch, selectedFinalCategoryIds, selectedPromotionIds, isPromotionCompatible]);

  const selectedIncompatiblePromotions = useMemo(
    () => promotions.filter((promotion) =>
      selectedPromotionIds.includes(promotion.id) &&
      selectedFinalCategoryIds.length > 0 &&
      !isPromotionCompatible(promotion, selectedFinalCategoryIds, editingId)
    ),
    [editingId, promotions, selectedFinalCategoryIds, selectedPromotionIds, isPromotionCompatible]
  );

  const togglePromotion = (promotion: ProductPromotion) => {
    const selected = selectedPromotionIds.includes(promotion.id);
    if (!selected && !canSelectPromotion(promotion)) return;

    setSelectedPromotionIds((current) =>
      current.includes(promotion.id)
        ? current.filter((id) => id !== promotion.id)
        : [...current, promotion.id]
    );
    setFormError(null);
  };

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = k === "barcode"
      ? e.target.value.replace(/\D/g, "").slice(0, BARCODE_MAX_LENGTH)
      : k === "satProductKey"
        ? e.target.value.replace(/\D/g, "")
        : e.target.value;
    const nextForm = { ...form, [k]: value };
    const validation = validateProductFormFields(nextForm, editingId === null);
    setForm(nextForm);
    setFormError(null);
    setFieldErrors((prev) => {
      const next = { ...prev };
      if (validation[k]) next[k] = validation[k];
      else delete next[k];
      return next;
    });
  };

  const setMoney = (k: "costPrice" | "sellPrice") => (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value.trim();
    if (rawValue && !DECIMAL_INPUT_REGEX.test(rawValue)) {
      setFieldErrors((prev) => ({
        ...prev,
        [k]: k === "costPrice"
          ? "El costo debe ser un numero valido con maximo 3 decimales."
          : "El precio debe ser un numero valido con maximo 3 decimales.",
      }));
      return;
    }
    handleDecimalInputChange(rawValue, (nextValue) => {
      const nextForm = { ...form, [k]: nextValue };
      const validation = validateProductFormFields(nextForm, editingId === null);
      setForm(nextForm);
      setFormError(null);
      setFieldErrors((prev) => {
        const next = { ...prev };
        if (validation[k]) next[k] = validation[k];
        else delete next[k];
        return next;
      });
    });
  };

  const setEditMoney = (key: "cost" | "price") => (value: string) => {
    const rawValue = value.trim();
    if (rawValue && !DECIMAL_INPUT_REGEX.test(rawValue)) {
      setPriceFieldErrors((prev) => ({
        ...prev,
        [key]: key === "cost"
          ? "El costo debe ser un numero valido con maximo 3 decimales."
          : "El precio debe ser un numero valido con maximo 3 decimales.",
      }));
      return;
    }
    handleDecimalInputChange(rawValue, (nextValue) => {
      if (key === "cost") setEditCost(nextValue);
      else setEditPrice(nextValue);
      const validation = validateMoneyField(nextValue, key === "cost" ? "costo" : "precio");
      const error = getValidationError(validation);
      setPriceFieldErrors((prev) => {
        const next = { ...prev };
        if (error) next[key] = error;
        else delete next[key];
        return next;
      });
      setSaveError(null);
    });
  };

  const handleAdjustQuantityChange = (value: string) => {
    if (!value) {
      setAdjustQuantity(0);
      setAdjustFieldErrors((prev) => ({ ...prev, quantity: undefined }));
      return;
    }
    const error = validateInteger(value, "La cantidad", { min: 1 });
    if (error) {
      setAdjustFieldErrors((prev) => ({ ...prev, quantity: error }));
      return;
    }
    setAdjustQuantity(Number(value));
    setAdjustFieldErrors((prev) => ({ ...prev, quantity: undefined }));
    setAdjustError(null);
  };

  const handleTransferQuantityChange = (value: string) => {
    if (!value) {
      setTransferQty(0);
      setTransferFieldErrors((prev) => ({ ...prev, quantity: undefined }));
      return;
    }
    const error = validateInteger(value, "La cantidad", { min: 1 });
    if (error) {
      setTransferFieldErrors((prev) => ({ ...prev, quantity: error }));
      return;
    }
    setTransferQty(Number(value));
    setTransferFieldErrors((prev) => ({ ...prev, quantity: undefined }));
    setTransferError(null);
  };

  const closeForm = () => {
    if (saving) return;
    taxRequestId.current += 1;
    categoryRequestId.current += 1;
    skuRequestId.current += 1;
    setSkuLoading(false);
    setShowForm(false);
    setEditingId(null);
    setFieldErrors({});
    setFormError(null);
    setPromotionCompatibilityConfirm(null);
    setTaxError(null);
    setTaxOptions([]);
    setSelectedTaxIds([]);
    setCategoryLoading(false);
    setCategoryError(null);
    setCategoryOptions([]);
    setSelectedCategoryIds([]);
    setInitialCategoryIds([]);
    setCategorySearch("");
    setCategoryPanelOpen(false);

    setPromotions([]);
    setSelectedPromotionIds([]);
    setInitialPromotionIds([]);
    setPromotionsError(null);
    setPromotionSearch("");
    setProductCategoryMap({});
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

  const loadTaxList = async () => {
    const requestId = taxRequestId.current + 1;
    taxRequestId.current = requestId;
    setTaxLoading(true);
    setTaxError(null);
    setTaxOptions([]);

    try {
      const taxesRes = await api.get<TaxListResponse>("/api/admin-tax/taxes");
      if (taxRequestId.current !== requestId) return;
      const activeTaxes = extractTaxOptions(taxesRes.data).filter((tax) => tax.active);
      setTaxOptions(activeTaxes);
    } catch (err: unknown) {
      if (taxRequestId.current !== requestId) return;
      setTaxError(getErrorMessage(err, "No se pudieron cargar los impuestos."));
    } finally {
      if (taxRequestId.current === requestId) {
        setTaxLoading(false);
      }
    }
  };

  const loadCategoryList = async (selectedProductCategories: ProductCategorySummary[] = []) => {
    const requestId = categoryRequestId.current + 1;
    categoryRequestId.current = requestId;
    setCategoryLoading(true);
    setCategoryError(null);

    try {
      const categoriesRes = await api.get<CategoryListResponse>("/api/admin-categories/flat", {
        params: { onlyFinal: true },
      });
      if (categoryRequestId.current !== requestId) return;

      const activeFinalCategories = extractCategoryOptions(categoriesRes.data).filter(
        (category) => category.level === "CATEGORY" && category.active
      );
      setCategoryOptions(mergeCategoryOptions(activeFinalCategories, selectedProductCategories));
    } catch (err: unknown) {
      if (categoryRequestId.current !== requestId) return;
      setCategoryError(getErrorMessage(err, "No se pudieron cargar las categorias."));
      setCategoryOptions(mergeCategoryOptions([], selectedProductCategories));
    } finally {
      if (categoryRequestId.current === requestId) {
        setCategoryLoading(false);
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

  const toggleCategory = (category: CategoryOption) => {
    if (selectedCategoryIds.includes(category.id)) {
      setSelectedCategoryIds((current) => current.filter((id) => id !== category.id));
      return;
    }

    if (!category.active) {
      setFieldErrors((prev) => ({ ...prev, categoryIds: "No puedes asignar una categoria inactiva." }));
      return;
    }

    setSelectedCategoryIds((current) => current.includes(category.id) ? current : [...current, category.id]);
    setFieldErrors((prev) => {
      const nextErrors = { ...prev };
      delete nextErrors.categoryIds;
      return nextErrors;
    });
    setFormError(null);
  };

  const removeSelectedCategory = (categoryId: number) => {
    setSelectedCategoryIds((current) => current.filter((id) => id !== categoryId));
    if (editingId !== null) {
      setFieldErrors((prev) => {
        const nextErrors = { ...prev };
        delete nextErrors.categoryIds;
        return nextErrors;
      });
    }
  };

  const loadNextSku = async () => {
    const requestId = skuRequestId.current + 1;
    skuRequestId.current = requestId;
    setSkuLoading(true);
    setFormError(null);
    setFieldErrors((current) => {
      const next = { ...current };
      delete next.sku;
      return next;
    });

    try {
      const response = await api.get<{ sku: string }>("/api/admin/products/next-sku");
      if (skuRequestId.current !== requestId) return;
      setForm((current) => ({ ...current, sku: response.data.sku }));
    } catch (err: unknown) {
      if (skuRequestId.current !== requestId) return;
      const message = getErrorMessage(err, "No se pudo generar el siguiente SKU.");
      setFieldErrors((current) => ({ ...current, sku: message }));
      setFormError(message);
    } finally {
      if (skuRequestId.current === requestId) {
        setSkuLoading(false);
      }
    }
  };

  const handleOpenCreate = () => {
    taxRequestId.current += 1;
    categoryRequestId.current += 1;
    skuRequestId.current += 1;
    setForm({ ...emptyForm, satProductKey: "01010101", satUnitKey: "H87" });
    setEditingId(null);
    setFieldErrors({});
    setFormError(null);
    setPromotionCompatibilityConfirm(null);
    setTaxError(null);
    setSelectedTaxIds([]);
    setCategoryError(null);
    setCategorySearch("");
    setCategoryPanelOpen(false);
    setSelectedCategoryIds([]);
    setInitialCategoryIds([]);
    setCategoryOptions([]);

    setSelectedPromotionIds([]);
    setInitialPromotionIds([]);
    setPromotionSearch("");

    setShowForm(true);
    void loadTaxList();
    void loadCategoryList();
    void loadNextSku();

    void loadPromotions();
    void loadProductCategoryMap();
  };

  const handleEdit = (p: ProductRow | ProductDetail) => {
    skuRequestId.current += 1;
    setSkuLoading(false);
    closeDetail();
    setForm({
      sku: p.sku,
      barcode: p.barcode || "",
      name: p.name,
      description: p.description || "",
      costPrice: String(p.costPrice),
      sellPrice: String(p.sellPrice),
      satProductKey: "satProductKey" in p ? p.satProductKey || "01010101" : "01010101",
      satUnitKey: "satUnitKey" in p ? p.satUnitKey || "H87" : "H87",
    });
    setEditingId(p.id);
    setFieldErrors({});
    setFormError(null);
    setPromotionCompatibilityConfirm(null);
    setCategorySearch("");
    setCategoryPanelOpen(false);
    const productCategoryIds = p.categories.map((category) => category.id);
    setSelectedCategoryIds(productCategoryIds);
    setInitialCategoryIds(productCategoryIds);
    setCategoryOptions(mergeCategoryOptions([], p.categories));

    setSelectedPromotionIds([]);
    setInitialPromotionIds([]);
    setPromotionSearch("");

    setShowForm(true);
    void loadProductTaxes(p.id);
    void loadCategoryList(p.categories);

    void loadPromotions(p.id);
    void loadProductCategoryMap();
  };

  const handleClassifyProductFromCategoryAdmin = async (productId: number) => {
    try {
      const response = await api.get<{ product: ProductDetail }>(`/api/admin/products/${productId}`, { skipGlobalErrorToast: true });
      setCategoryAdminOpen(false);
      handleEdit(response.data.product);
    } catch (err: unknown) {
      showToast(getErrorMessage(err, "No se pudo abrir el producto para clasificarlo."), "error");
      throw err;
    }
  };

  const handleToggleActive = async (p: ProductRow | ProductDetail) => {
    if (statusSaving) return;
    setStatusSaving(true);
    try {
      if (p.active) {
        // Soft delete (desactivar)
        await api.delete(`/api/admin/products/${p.id}`, { skipGlobalErrorToast: true });
      } else {
        // Activar (usando PUT con active: true)
        await api.put(`/api/admin/products/${p.id}`, {
          active: true,
        }, { skipGlobalErrorToast: true });
      }
      if (detailOpen && selectedProduct?.id === p.id) {
        await fetchDetail(p.id);
      }
      await load();
    } catch (err: unknown) {
      showToast(getErrorMessage(err, "No se pudo cambiar el estado del producto."), "error");
    } finally {
      setStatusSaving(false);
    }
  };

  const syncProductPromotions = async (productId: number) => {
    const nextPromotionIds = [...new Set(selectedPromotionIds)];
    const previousPromotionIds = [...new Set(initialPromotionIds)];
    const toRemove = previousPromotionIds.filter((promotionId) => !nextPromotionIds.includes(promotionId));
    const toAdd = nextPromotionIds.filter((promotionId) => !previousPromotionIds.includes(promotionId));

    for (const promotionId of toRemove) {
      await api.delete(`/api/admin-promotions/promotions/${promotionId}/products/${productId}`);
    }

    for (const promotionId of toAdd) {
      await api.post(`/api/admin-promotions/promotions/${promotionId}/products`, {
        productIds: [productId],
      });
    }
  };

  const saveAfterPromotionReview = async (
    categoryIds: number[],
    validatedProduct: ValidatedProductForm
  ) => {
    if (selectedIncompatiblePromotions.length > 0) {
      const names = selectedIncompatiblePromotions.map((promotion) => promotion.name).join(", ");
      const categoryLabels = selectedFinalCategories.map((category) => `${category.code} - ${category.name}`).join(", ");
      setPromotionCompatibilityConfirm({
        categoryIds,
        validatedProduct,
        message: [
          "Esta promoción podría no corresponder a las categorías seleccionadas.",
          names ? `Promociones: ${names}` : "",
          categoryLabels ? `Categorías seleccionadas: ${categoryLabels}` : "",
          "Continua solo si deseas conservarla para este producto.",
        ].filter(Boolean).join("\n"),
      });
      return;
    }

    await saveProduct(categoryIds, validatedProduct);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    const fieldValidation = validateProductFormFields(form, editingId === null);
    if (editingId === null && selectedCategoryIds.length === 0) {
      fieldValidation.categoryIds = "Selecciona al menos una categoria para el producto.";
    }
    if (Object.keys(fieldValidation).length > 0) {
      setFieldErrors(fieldValidation);
      setFormError("Revisa los campos marcados antes de guardar.");
      return;
    }

    const validated = validateProductForm(form, editingId === null);
    const validationError = getValidationError(validated);
    if (validationError) {
      setFormError(validationError);
      return;
    }
    const validatedProduct = getValidationValue(validated);
    if (!validatedProduct) return;
    if (editingId !== null && taxLoading) {
      setFormError("Espere a que terminen de cargar los impuestos del producto.");
      return;
    }
    if (editingId !== null && taxError) {
      setFormError("No se puede guardar hasta cargar correctamente los impuestos aplicables.");
      return;
    }
    if (categoryLoading) {
      setFormError("Espere a que terminen de cargar las categorias del producto.");
      return;
    }
    if (editingId === null && categoryError) {
      setFormError("No se puede guardar hasta cargar correctamente las categorias.");
      return;
    }

    const categoryIds = [...new Set(selectedCategoryIds)];
    if (editingId !== null) {
      const removedCategoryIds = initialCategoryIds.filter((categoryId) => !categoryIds.includes(categoryId));
      if (removedCategoryIds.length > 0) {
        const removedLabels = removedCategoryIds
          .map((categoryId) => categoryOptions.find((category) => category.id === categoryId))
          .filter((category): category is CategoryOption => Boolean(category))
          .map((category) => `${category.code} - ${category.name}`);
        const remainingLabels = selectedCategories.map((category) => `${category.code} - ${category.name}`);
        const message = [
          `Se quitaran ${removedCategoryIds.length} categoria(s) del producto.`,
          removedLabels.length > 0 ? `Se quitaran: ${removedLabels.join(", ")}` : "",
          remainingLabels.length > 0 ? `Quedaran: ${remainingLabels.join(", ")}` : "El producto quedara sin categorias nuevas.",
        ].filter(Boolean).join("\n");
        setCategoryRemovalConfirm({ message, categoryIds, validatedProduct });
        return;
      }
    }

    await saveAfterPromotionReview(categoryIds, validatedProduct);
  };

  const confirmCategoryRemoval = async () => {
    if (!categoryRemovalConfirm) return;
    const { categoryIds, validatedProduct } = categoryRemovalConfirm;
    setCategoryRemovalConfirm(null);
    await saveAfterPromotionReview(categoryIds, validatedProduct);
  };

  const confirmPromotionCompatibility = async () => {
    if (!promotionCompatibilityConfirm) return;
    const { categoryIds, validatedProduct } = promotionCompatibilityConfirm;
    setPromotionCompatibilityConfirm(null);
    await saveProduct(categoryIds, validatedProduct);
  };

  const saveProduct = async (categoryIds: number[], validatedProduct: ValidatedProductForm) => {
    setSaving(true);
    setFormError(null);
    setFieldErrors({});
    try {
      if (validatedProduct.roundingMessages.length > 0) {
        showToast(validatedProduct.roundingMessages.join(" | "), "warning");
      }

      if (editingId !== null) {
        // Modo Edición
        await api.put(`/api/admin/products/${editingId}`, {
          name: validatedProduct.name,
          barcode: validatedProduct.barcode,
          description: validatedProduct.description,
          costPrice: validatedProduct.costPrice,
          sellPrice: validatedProduct.sellPrice,
          satProductKey: validatedProduct.satProductKey,
          satUnitKey: validatedProduct.satUnitKey,
          categoryIds,
        });
        await api.put(`/api/admin-tax/products/${editingId}/taxes`, {
          taxIds: selectedTaxIds,
        });
        await syncProductPromotions(editingId);
      } else {
        // Modo Creación
        const createRes = await api.post<{ product: { id: number } }>("/api/admin/products", {
          barcode: validatedProduct.barcode,
          name: validatedProduct.name,
          description: validatedProduct.description,
          costPrice: validatedProduct.costPrice,
          sellPrice: validatedProduct.sellPrice,
          satProductKey: validatedProduct.satProductKey,
          satUnitKey: validatedProduct.satUnitKey,
          categoryIds,
        });
        const newProductId = createRes.data.product.id;
        if (selectedTaxIds.length > 0) {
          await api.put(`/api/admin-tax/products/${newProductId}/taxes`, {
            taxIds: selectedTaxIds,
          });
        }
        await syncProductPromotions(newProductId);
      }
      setShowForm(false);
      setForm({ ...emptyForm });
      setEditingId(null);
      setFieldErrors({});
      setTaxOptions([]);
      setSelectedTaxIds([]);
      setCategoryOptions([]);
      setSelectedCategoryIds([]);
      setInitialCategoryIds([]);
      setCategorySearch("");
      setCategoryPanelOpen(false);
      setPromotions([]);
      setSelectedPromotionIds([]);
      setInitialPromotionIds([]);
      setPromotionsError(null);
      setPromotionSearch("");
      setProductCategoryMap({});
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
    setEditCost(String(res.data.product.costPrice));
    setEditPrice(String(res.data.product.sellPrice));
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
    } catch (err: unknown) {
      setDetailError(getErrorMessage(err, "No se pudo cargar el detalle del producto."));
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const closeDetail = () => {
    if (priceSaving || adjustSaving || transferSaving || suppliersSaving || statusSaving) return;
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
      </table>`,
      showToast
    );
  }, [selectedProduct]);

  // Feature 1: save price/cost edits
  const saveProductChanges = async () => {
    if (!selectedProduct || priceSaving) return;
    setSaveError(null);

    const cost = validateMoneyField(editCost, "costo");
    const costError = getValidationError(cost);
    if (costError) {
      setPriceFieldErrors((prev) => ({ ...prev, cost: costError }));
      setSaveError("Revisa los campos marcados antes de guardar.");
      return;
    }
    const price = validateMoneyField(editPrice, "precio");
    const priceError = getValidationError(price);
    if (priceError) {
      setPriceFieldErrors((prev) => ({ ...prev, price: priceError }));
      setSaveError("Revisa los campos marcados antes de guardar.");
      return;
    }
    const costValue = getValidationValue(cost);
    const priceValue = getValidationValue(price);
    if (!costValue || !priceValue) return;

    const roundingMessages = [costValue.roundedMessage, priceValue.roundedMessage].filter((message): message is string => Boolean(message));
    setPriceSaving(true);
    try {
      if (roundingMessages.length > 0) {
        showToast(roundingMessages.join(" | "), "warning");
      }

      await api.put(`/api/admin/products/${selectedProduct.id}`, {
        costPrice: costValue.value,
        sellPrice: priceValue.value,
      });
      await fetchDetail(selectedProduct.id);
      setEditMode(false);
      setPriceFieldErrors({});
      await load();
    } catch (err: unknown) {
      setSaveError(getErrorMessage(err, "Error al guardar."));
    } finally {
      setPriceSaving(false);
    }
  };

  // Feature 2: submit stock adjustment
  const submitAdjustment = async () => {
    if (!selectedProduct || adjustSaving) return;
    setAdjustError(null);
    if (!adjustBranch || !adjustType || !adjustReason.trim()) {
      setAdjustError("Completa todos los campos obligatorios.");
      return;
    }
    const adjustQuantityError = validateInteger(adjustQuantity ? String(adjustQuantity) : "", "La cantidad", { min: 1 });
    if (adjustQuantityError || !Number.isFinite(adjustQuantity) || !Number.isInteger(adjustQuantity) || adjustQuantity <= 0) {
      setAdjustFieldErrors((prev) => ({ ...prev, quantity: adjustQuantityError || "La cantidad debe ser un entero mayor a 0." }));
      setAdjustError("Revisa los campos marcados antes de aplicar el ajuste.");
      return;
    }
    setAdjustFieldErrors({});

    const currentStock = selectedProduct.inventories.find((inv) => inv.branchId === adjustBranch)?.quantity ?? 0;

    let quantityChange = 0;
    let movementType = "";
    if (adjustType === "RECOUNT") {
      quantityChange = adjustQuantity - currentStock;
      movementType = "AJUSTE_INVENTARIO";
    } else if (adjustType === "ENTRADA") {
      quantityChange = adjustQuantity;
      movementType = "AJUSTE_INVENTARIO";
    } else if (adjustType === "SALIDA") {
      quantityChange = -adjustQuantity;
      movementType = "AJUSTE_INVENTARIO";
    } else if (adjustType === "MERMA") {
      quantityChange = -adjustQuantity;
      movementType = "AJUSTE_MERMA";
    }

    if (quantityChange === 0 && adjustType !== "RECOUNT") {
      setAdjustError("La cantidad no puede ser 0.");
      return;
    }
    if (currentStock + quantityChange < 0) {
      setAdjustError("El ajuste resultaría en stock negativo.");
      return;
    }

    const cleanReason = adjustObservations.trim()
      ? `${adjustReason.trim()} - ${adjustObservations.trim()}`
      : adjustReason.trim();

    if (!PRODUCT_TEXT_REGEX.test(cleanReason)) {
      setAdjustError("El motivo u observaciones contiene caracteres no permitidos.");
      return;
    }

    setAdjustSaving(true);
    try {
      await api.post("/api/admin/inventory/adjust", {
        productId: selectedProduct.id,
        branchId: adjustBranch,
        quantityChange,
        movementType,
        reason: cleanReason,
      });
      await fetchDetail(selectedProduct.id);
      await load();
      setAdjustOpen(false);
      setAdjustBranch(0);
      setAdjustType("");
      setAdjustQuantity(0);
      setAdjustFieldErrors({});
      setAdjustReason("");
      setAdjustObservations("");
    } catch (err: unknown) {
      setAdjustError(getErrorMessage(err, "Error al aplicar ajuste."));
    } finally {
      setAdjustSaving(false);
    }
  };

  // Feature 3: submit transfer
  const submitTransfer = async () => {
    if (!selectedProduct || transferSaving) return;
    setTransferError(null);
    if (!transferFrom || !transferTo || !transferQty) {
      setTransferError("Completa todos los campos.");
      return;
    }
    const transferQuantityError = validateInteger(transferQty ? String(transferQty) : "", "La cantidad", { min: 1 });
    if (transferQuantityError) {
      setTransferFieldErrors((prev) => ({ ...prev, quantity: transferQuantityError }));
      setTransferError("Revisa los campos marcados antes de trasladar.");
      return;
    }
    const fromInventory = selectedProduct.inventories.find((inv) => inv.branchId === transferFrom);
    if (fromInventory && transferQty > fromInventory.quantity) {
      setTransferFieldErrors((prev) => ({ ...prev, quantity: "La cantidad supera el stock disponible." }));
      setTransferError("Revisa los campos marcados antes de trasladar.");
      return;
    }
    setTransferFieldErrors({});
    setTransferSaving(true);
    try {
      await api.post("/api/admin/inventory/transfer", {
        productId: selectedProduct.id,
        fromBranch: transferFrom,
        toBranch: transferTo,
        quantity: transferQty,
      });
      await fetchDetail(selectedProduct.id);
      await load();
      setTransferOpen(false);
      setTransferFrom(0);
      setTransferTo(0);
      setTransferQty(0);
      setTransferFieldErrors({});
      setTransferConfirm(false);
    } catch (err: unknown) {
      setTransferConfirm(false);
      setTransferError(getErrorMessage(err, "Error al trasladar."));
    } finally {
      setTransferSaving(false);
    }
  };

  const saveSuppliersChanges = async () => {
    if (!selectedProduct || suppliersSaving) return;
    setSuppliersError(null);
    setSuppliersSaving(true);
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
    } catch (err: unknown) {
      setSuppliersError(getErrorMessage(err, "Error al guardar proveedores."));
    } finally {
      setSuppliersSaving(false);
    }
  };

  const filteredRows = rows.filter((p) => {
    if (statusFilter === "disponible") return p.active && !p.low;
    if (statusFilter === "bajo") return p.active && p.low;
    if (statusFilter === "inactivo") return !p.active;
    return true;
  });

  const paged = usePagination(filteredRows, { resetKey: `${branchId}|${search}|${statusFilter}` });

  const lowCount = filteredRows.filter((r) => r.low).length;
  const scope = branchId !== "all" ? "en la sucursal seleccionada" : "consolidado de todas las sucursales";

  const editCostNumber = Number(editCost);
  const editPriceNumber = Number(editPrice);
  const hasValidEditPrices =
    editCost.trim() !== "" &&
    editPrice.trim() !== "" &&
    Number.isFinite(editCostNumber) &&
    Number.isFinite(editPriceNumber) &&
    editPriceNumber > 0;
  const liveMargem =
    hasValidEditPrices
      ? (((editPriceNumber - editCostNumber) / editPriceNumber) * 100).toFixed(1)
      : "—";

  return (
    <div>
      <SectionHeader
        title="Inventario"
        subtitle={activeTab === "existencias" ? `Existencias ${scope}` : undefined}
      />

      <div style={{ display: "flex", gap: 0, marginBottom: 18, borderBottom: "1px solid var(--border)" }}>
        {(["existencias", "kardex"] as const).map((tab) => {
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                background: "none",
                border: "none",
                borderBottom: isActive ? "2px solid var(--accent)" : "2px solid transparent",
                marginBottom: -1,
                padding: "8px 20px",
                fontSize: 14,
                fontWeight: isActive ? 700 : 500,
                color: isActive ? "var(--accent-strong)" : "var(--text-muted)",
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
            <span style={{ marginLeft: "auto", fontSize: 13, color: "var(--text-muted)", fontWeight: 600 }}>
              {filteredRows.length} producto{filteredRows.length === 1 ? "" : "s"}
            </span>
            {user?.role === "ADMIN" && (
              <button onClick={() => setCategoryAdminOpen(true)} style={ui.ghostBtn}>
                <FolderTree size={15} /> Administrar categorias
              </button>
            )}
            {user?.role !== "GERENTE" && (
              <button onClick={handleOpenCreate} style={ui.primaryBtn}>
                <Plus size={15} /> Nuevo producto
              </button>
            )}
          </Toolbar>

          {isMobile ? (
            /* ── Mobile / Tablet: Card-based layout ── */
            <div style={{ overflowY: "auto", maxHeight: "62vh", padding: "8px 16px" }}>
              {loading && (
                <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--text-faint)", fontSize: 13, fontWeight: 500 }}>
                  Cargando información...
                </div>
              )}
              {!loading && filteredRows.length === 0 && (
                <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--text-faint)", fontSize: 13, fontWeight: 500 }}>
                  {search.trim()
                    ? "No se encontraron productos con esa b\u00fasqueda."
                    : "No hay productos registrados."}
                </div>
              )}

              {!loading &&
                paged.pageItems.map((p) => {
                  const isExpanded = expandedProducts[p.id];
                  return (
                    <div
                      key={p.id}
                      style={{
                        backgroundColor: p.low ? "var(--icon-bg-amber, rgba(251,191,36,0.12))" : "var(--surface)",
                        border: "1px solid var(--border-soft)",
                        borderRadius: 16,
                        marginBottom: 12,
                        boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)",
                        overflow: "hidden",
                      }}
                    >
                      {/* Header: SKU y Estado */}
                      <div style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "10px 16px",
                        fontSize: 11,
                        fontWeight: 700,
                        color: "var(--text-muted)",
                        borderBottom: "1px solid var(--border-soft)",
                        backgroundColor: "var(--surface-2)",
                        letterSpacing: "0.2px",
                      }}>
                        <span style={{ wordBreak: "break-all", overflowWrap: "anywhere", marginRight: 8 }}>{p.sku}</span>
                        {!p.active ? (
                          <Badge tone="red">Inactivo</Badge>
                        ) : p.low ? (
                          <Badge tone="amber">Stock bajo</Badge>
                        ) : (
                          <Badge tone="green">Disponible</Badge>
                        )}
                      </div>

                      {/* Cuerpo principal */}
                      <div style={{ padding: 16 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            {/* Nombre del Producto */}
                            <div style={{ marginBottom: 6 }}>
                              <button
                                onClick={() => openProductDetail(p.id)}
                                style={{
                                  background: "none",
                                  border: "none",
                                  color: "var(--accent)",
                                  fontWeight: 700,
                                  cursor: "pointer",
                                  padding: 0,
                                  fontSize: 16,
                                  textAlign: "left",
                                  wordBreak: "break-word",
                                  overflowWrap: "anywhere",
                                }}
                                className="active-tap"
                              >
                                {p.name}
                              </button>
                            </div>

                            {/* Precio */}
                            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 4, fontWeight: 600 }}>
                              Precio: <span style={{ color: "var(--text)", fontWeight: 700 }}>{money(p.sellPrice)}</span>
                            </div>

                            {/* Stock actual */}
                            <div style={{ fontSize: 13, color: "var(--text-secondary)", fontWeight: 600 }}>
                              Stock: <span style={{ fontWeight: 800, color: p.low ? "var(--color-warning)" : "var(--color-success)" }}>{p.stock}</span>
                            </div>
                          </div>

                          {/* Acciones */}
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                            {/* Botón Ver Detalle */}
                            <button
                              onClick={() => openProductDetail(p.id)}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                backgroundColor: "var(--accent-soft)",
                                border: "1px solid var(--border)",
                                borderRadius: 8,
                                width: 34,
                                height: 34,
                                cursor: "pointer",
                                color: "var(--accent)",
                                padding: 0,
                              }}
                              className="active-tap"
                              title="Ver detalle"
                            >
                              <Eye size={16} />
                            </button>

                            {/* Botón Expandir */}
                            <button
                              onClick={() => toggleExpandProduct(p.id)}
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
                            marginTop: 12,
                            paddingTop: 12,
                            borderTop: "1px solid var(--border-soft)",
                            display: "flex",
                            flexDirection: "column",
                            gap: 8,
                          }}>
                            <div style={invDetailRow}>
                              <span style={invDetailLabel}>Código Barras:</span>
                              <span style={{ ...invDetailValue, wordBreak: "break-all", overflowWrap: "anywhere" }}>{p.barcode || "—"}</span>
                            </div>
                            <div style={invDetailRow}>
                              <span style={invDetailLabel}>Descripción:</span>
                              <span style={{ ...invDetailValue, wordBreak: "break-word", overflowWrap: "anywhere" }}>{p.description || "—"}</span>
                            </div>
                            <div style={invDetailRow}>
                              <span style={invDetailLabel}>Costo:</span>
                              <span style={invDetailValue}>{money(p.costPrice)}</span>
                            </div>
                            <div style={invDetailRow}>
                              <span style={invDetailLabel}>Precio:</span>
                              <span style={invDetailValue}>{money(p.sellPrice)}</span>
                            </div>
                            <div style={invDetailRow}>
                              <span style={invDetailLabel}>Margen:</span>
                              <span style={{ ...invDetailValue, color: "var(--color-success)" }}>
                                {p.sellPrice > 0
                                  ? `${(((p.sellPrice - p.costPrice) / p.sellPrice) * 100).toFixed(1)}%`
                                  : "—"}
                              </span>
                            </div>
                            <div style={invDetailRow}>
                              <span style={invDetailLabel}>Stock Mínimo:</span>
                              <span style={invDetailValue}>{p.minStock}</span>
                            </div>
                            <div style={invDetailRow}>
                              <span style={invDetailLabel}>Sucursales:</span>
                              <span style={invDetailValue}>{p.branchCount || "—"}</span>
                            </div>
                          </div>
                        )}
                      </div>
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
                  <TableState
                    colSpan={7}
                    loading={loading}
                    error={error}
                    empty={!loading && filteredRows.length === 0}
                    emptyText={search.trim() ? "No se encontraron productos con esa b\u00fasqueda." : "No hay productos registrados."}
                  />
                  {!loading &&
                    !error &&
                    paged.pageItems.map((p) => (
                      <tr
                        key={p.id}
                        onClick={() => openProductDetail(p.id)}
                        onMouseEnter={() => setHoveredRow(p.id)}
                        onMouseLeave={() => setHoveredRow(null)}
                        style={{
                          cursor: "pointer",
                          backgroundColor:
                            hoveredRow === p.id
                              ? "var(--accent-soft)"
                              : p.low
                                ? "var(--icon-bg-amber, rgba(251,191,36,0.12))"
                                : undefined,
                        }}
                      >
                        <td style={{ ...ui.td, color: "var(--text-faint)", fontWeight: 600 }}>{p.sku}</td>
                        <td style={{ ...ui.td, fontWeight: 600, color: "var(--text)", whiteSpace: "normal" }}>{p.name}</td>
                        <td style={{ ...ui.td, textAlign: "right" }}>{money(p.costPrice)}</td>
                        <td style={{ ...ui.td, textAlign: "right", fontWeight: 700 }}>{money(p.sellPrice)}</td>
                        <td
                          style={{
                            ...ui.td,
                            textAlign: "center",
                            fontWeight: 800,
                            color: p.low ? "var(--color-warning)" : "var(--text)",
                          }}
                        >
                          {p.stock}
                        </td>
                        <td style={{ ...ui.td, textAlign: "center", color: "var(--text-muted)" }}>{p.minStock}</td>
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
          )}

          {!loading && !error && (
            <Pagination page={paged.page} pageCount={paged.pageCount} total={paged.total} from={paged.from} to={paged.to} onPage={paged.setPage} itemLabel="productos" />
          )}
        </>
      )}

      {categoryAdminOpen && user?.role === "ADMIN" && (
        <CategoryManagementView
          onClose={() => setCategoryAdminOpen(false)}
          onClassifyProduct={handleClassifyProductFromCategoryAdmin}
        />
      )}

      {/* =================== MODAL DETALLE =================== */}
      {detailOpen && (
        <div style={ui.overlay} onClick={closeDetail}>
          <div style={{ ...ui.modal, maxWidth: isMobile ? "100%" : 680, display: "flex", flexDirection: "column", overflowY: "hidden", ...(isMobile ? { width: "100%", height: "100%", borderRadius: 0, margin: 0 } : {}) }} onClick={(e) => e.stopPropagation()}>
            <div style={ui.modalHeader}>
              <div>
                <div style={{ ...ui.modalTitle, wordBreak: "break-word", overflowWrap: "anywhere" }}>
                  {selectedProduct ? selectedProduct.name : "Cargando…"}
                </div>
                {selectedProduct && (
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3, wordBreak: "break-all", overflowWrap: "anywhere" }}>
                    SKU: {selectedProduct.sku}
                    {selectedProduct.barcode ? ` · Barcode: ${selectedProduct.barcode}` : ""}
                  </div>
                )}
              </div>
              <button onClick={closeDetail} style={{ ...ui.ghostBtn, padding: "6px 10px" }}>
                <X size={16} />
              </button>
            </div>

            <div style={{ ...ui.modalBody, overflowY: "auto", flex: 1 }}>
              {detailLoading && (
                <p style={{ textAlign: "center", color: "var(--text-faint)", padding: "32px 0" }}>Cargando detalle…</p>
              )}
              {detailError && (
                <p style={{ textAlign: "center", color: "var(--color-danger)", padding: "32px 0" }}>{detailError}</p>
              )}
              {selectedProduct && !detailLoading && (
                <>
                  {/* ── Precios (con modo edición) ── */}
                  <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 16, marginBottom: 20 }}>
                    {!editMode ? (
                      <>
                        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(4, 1fr)", gap: 12, marginBottom: 12 }}>
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
                        {user?.role !== "GERENTE" && (
                          <button
                            onClick={() => { setEditMode(true); setSaveError(null); setPriceFieldErrors({}); }}
                            style={{
                              ...ui.ghostBtn,
                              fontSize: 12,
                              color: "var(--accent)",
                              borderColor: "#93c5fd",
                            }}
                          >
                            Editar precios
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                          <div>
                            <label style={ui.fieldLabel}>Costo</label>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={editCost}
                              onChange={(e) => setEditMoney("cost")(e.target.value)}
                              placeholder="0.00"
                              style={ui.input}
                            />
                            {priceFieldErrors.cost && <p style={styles.fieldError}>{priceFieldErrors.cost}</p>}
                          </div>
                          <div>
                            <label style={ui.fieldLabel}>Precio venta</label>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={editPrice}
                              onChange={(e) => setEditMoney("price")(e.target.value)}
                              placeholder="0.00"
                              style={ui.input}
                            />
                            {priceFieldErrors.price && <p style={styles.fieldError}>{priceFieldErrors.price}</p>}
                          </div>
                        </div>
                        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
                          Margen calculado: <strong style={{ color: "var(--text)" }}>{liveMargem}%</strong>
                        </div>
                        {saveError && (
                          <p style={{ fontSize: 12, color: "var(--color-danger)", marginBottom: 10 }}>{saveError}</p>
                        )}
                        <div style={{ display: "flex", gap: 8 }}>
                          <button onClick={saveProductChanges} style={{ ...ui.primaryBtn, display: "inline-flex", alignItems: "center", gap: 5 }}><Check size={13} /> Guardar</button>
                          <button onClick={() => { setEditMode(false); setSaveError(null); setPriceFieldErrors({}); }} style={{ ...ui.ghostBtn, display: "inline-flex", alignItems: "center", gap: 5 }}><X size={13} /> Cancelar</button>
                        </div>
                      </>
                    )}
                  </div>

                  {/* ── Badges de atributos ── */}
                  <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap", alignItems: "center" }}>
                    {!selectedProduct.active && <Badge tone="red">Inactivo</Badge>}
                    {selectedProduct.isReturnable && (
                      <Badge tone="green">Retornable ({selectedProduct.returnWindowDays}d)</Badge>
                    )}
                    {selectedProduct.trackingType !== "NONE" && (
                      <Badge tone="blue">Tracking: {selectedProduct.trackingType}</Badge>
                    )}
                    <Badge tone="slate">SAT: {selectedProduct.satProductKey || "01010101"} ({selectedProduct.satUnitKey || "H87"})</Badge>
                    {selectedProduct.description && (
                      <span style={{ fontSize: 12, color: "var(--text-muted)", wordBreak: "break-word", overflowWrap: "anywhere" }}>{selectedProduct.description}</span>
                    )}
                  </div>

                  {/* ── Stock por sucursal ── */}
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--accent-strong)", marginBottom: 10 }}>
                      Stock por sucursal
                    </div>

                    {isMobile ? (
                      /* ── Mobile: card-based branch stock ── */
                      <div style={{ maxHeight: 300, overflowY: "auto", paddingRight: 4 }}>
                        {selectedProduct.inventories.length === 0 && (
                          <div style={{ textAlign: "center", padding: "20px 16px", color: "var(--text-faint)", fontSize: 13 }}>
                            Sin inventario registrado
                          </div>
                        )}
                        {selectedProduct.inventories.map((inv) => (
                          <div key={inv.id} style={{
                            backgroundColor: inv.quantity <= inv.minStock ? "var(--icon-bg-amber)" : "var(--surface)",
                            border: "1px solid var(--border)",
                            borderRadius: 10,
                            marginBottom: 8,
                            padding: "12px 14px",
                          }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", wordBreak: "break-word", overflowWrap: "anywhere" }}>{inv.branch}</span>
                              {inv.quantity <= inv.minStock ? (
                                <Badge tone="amber">Stock bajo</Badge>
                              ) : (
                                <Badge tone="green">OK</Badge>
                              )}
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                              <div style={{ textAlign: "center" }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.3px" }}>Stock</div>
                                <div style={{ fontSize: 15, fontWeight: 800, color: inv.quantity <= inv.minStock ? "var(--color-warning)" : "var(--text)" }}>{inv.quantity}</div>
                              </div>
                              <div style={{ textAlign: "center" }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.3px" }}>Mín</div>
                                <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-muted)" }}>{inv.minStock}</div>
                              </div>
                              <div style={{ textAlign: "center" }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.3px" }}>Máx</div>
                                <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-muted)" }}>{inv.maxStock}</div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      /* ── Desktop: standard table ── */
                      <div style={{ ...ui.tableWrap, boxShadow: "none" }}>
                        <table style={{ ...ui.table, minWidth: 500 }}>
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
                                <td colSpan={5} style={{ ...ui.td, textAlign: "center", color: "var(--text-faint)" }}>
                                  Sin inventario registrado
                                </td>
                              </tr>
                            )}
                            {selectedProduct.inventories.map((inv) => (
                              <tr key={inv.id}>
                                <td style={ui.td}>{inv.branch}</td>
                                <td style={{ ...ui.td, textAlign: "center", fontWeight: 800, color: inv.quantity <= inv.minStock ? "var(--color-warning)" : "var(--text)" }}>
                                  {inv.quantity}
                                </td>
                                <td style={{ ...ui.td, textAlign: "center", color: "var(--text-muted)" }}>{inv.minStock}</td>
                                <td style={{ ...ui.td, textAlign: "center", color: "var(--text-muted)" }}>{inv.maxStock}</td>
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
                    )}

                    {/* Action buttons under stock table */}
                    {selectedProduct.inventories.length > 0 && (
                      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: isMobile ? "wrap" : undefined }}>
                        <button
                          onClick={() => {
                            setAdjustError(null);
                            setAdjustOpen(true);
                            if (user?.role === "GERENTE" && user.branch?.id) {
                              setAdjustBranch(user.branch.id);
                            } else {
                              setAdjustBranch(0);
                            }
                          }}
                          disabled={user?.role === "GERENTE" && !selectedProduct.inventories.some((inv) => inv.branchId === user.branch?.id)}
                          style={{
                            ...ui.ghostBtn,
                            color: "#b45309",
                            borderColor: "#fcd34d",
                            backgroundColor: "#fffbeb",
                            opacity: (user?.role === "GERENTE" && !selectedProduct.inventories.some((inv) => inv.branchId === user.branch?.id)) ? 0.5 : 1,
                            ...(isMobile ? { flex: 1, justifyContent: "center" } : {}),
                          }}
                        >
                          Ajustar stock
                        </button>
                        {selectedProduct.inventories.length > 1 &&
                          (user?.role !== "GERENTE" ||
                            selectedProduct.inventories.some((inv) => inv.branchId === user.branch?.id)) && (
                            <button
                              onClick={() => { setTransferError(null); setTransferOpen(true); }}
                              style={{
                                ...ui.ghostBtn,
                                color: "#7c3aed",
                                borderColor: "#c4b5fd",
                                backgroundColor: "#f5f3ff",
                              }}
                            >
                              Trasladar stock
                            </button>
                          )}
                      </div>
                    )}
                  </div>

                  {/* ── Proveedores ── */}
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--accent-strong)" }}>Proveedores</div>
                      {!editingSuppliersMode && user?.role !== "GERENTE" && (
                        <button
                          onClick={() => { setEditingSuppliersMode(true); setSuppliersError(null); }}
                          style={{ ...ui.ghostBtn, fontSize: 12, padding: "4px 10px", color: "var(--accent)", borderColor: "#93c5fd" }}
                        >
                          Editar
                        </button>
                      )}
                    </div>

                    {!editingSuppliersMode ? (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {productSuppliers.length === 0 ? (
                          <span style={{ fontSize: 12, color: "var(--text-faint)" }}>Sin proveedores asignados</span>
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
                        <div style={{ maxHeight: 140, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px", marginBottom: 12 }}>
                          {suppliers.length === 0 && (
                            <p style={{ fontSize: 12, color: "var(--text-faint)", margin: 0 }}>No hay proveedores disponibles</p>
                          )}
                          {suppliers.map((s) => (
                            <label key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "4px 0", fontSize: 13, color: "var(--text-secondary)" }}>
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
                          <button onClick={saveSuppliersChanges} style={{ ...ui.primaryBtn, display: "inline-flex", alignItems: "center", gap: 5 }}><Check size={13} /> Guardar</button>
                          <button onClick={() => { setEditingSuppliersMode(false); setSuppliersError(null); }} style={{ ...ui.ghostBtn, display: "inline-flex", alignItems: "center", gap: 5 }}><X size={13} /> Cancelar</button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* ── Últimos movimientos kardex ── */}
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--accent-strong)", marginBottom: 10 }}>
                      Últimos 20 movimientos Kardex
                    </div>

                    {isMobile ? (
                      /* ── Mobile: card-based kardex ── */
                      <div style={{ maxHeight: 320, overflowY: "auto", paddingRight: 4 }}>
                        {selectedProduct.recentKardex.length === 0 && (
                          <div style={{ textAlign: "center", padding: "20px 16px", color: "var(--text-faint)", fontSize: 13 }}>
                            Sin movimientos registrados
                          </div>
                        )}
                        {selectedProduct.recentKardex.map((k) => (
                          <div key={k.id} style={{
                            backgroundColor: "var(--surface)",
                            border: "1px solid var(--border)",
                            borderRadius: 10,
                            marginBottom: 8,
                            overflow: "hidden",
                          }}>
                            {/* Header: Fecha y Badge tipo */}
                            <div style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              padding: "8px 14px 6px 14px",
                              borderBottom: "1px solid var(--border-soft)",
                              backgroundColor: "var(--surface-2)",
                            }}>
                              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)" }}>
                                {fmtDate(k.date)} <span style={{ color: "var(--text-faint)" }}>{fmtTime(k.date)}</span>
                              </span>
                              <Badge tone={k.quantityChange >= 0 ? "green" : "red"}>
                                {k.movementType.replace(/_/g, " ")}
                              </Badge>
                            </div>
                            {/* Body: Sucursal, Cambio, Saldo */}
                            <div style={{ padding: "10px 14px", display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 8, alignItems: "center" }}>
                              <div>
                                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.3px" }}>Sucursal</div>
                                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", wordBreak: "break-word", overflowWrap: "anywhere" }}>{k.branch}</div>
                              </div>
                              <div style={{ textAlign: "center" }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.3px" }}>Cambio</div>
                                <div style={{ fontSize: 15, fontWeight: 800, color: k.quantityChange >= 0 ? "var(--color-success)" : "var(--color-danger)" }}>
                                  {k.quantityChange >= 0 ? "+" : ""}{k.quantityChange}
                                </div>
                              </div>
                              <div style={{ textAlign: "center" }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.3px" }}>Saldo</div>
                                <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>{k.balanceAfter}</div>
                              </div>
                            </div>
                            {/* Reason if present */}
                            {k.reason && (
                              <div style={{ padding: "0 14px 10px 14px", fontSize: 12, color: "var(--text-muted)", wordBreak: "break-word", overflowWrap: "anywhere" }}>
                                <span style={{ fontWeight: 700, color: "var(--text-faint)" }}>Motivo:</span> {k.reason}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      /* ── Desktop: standard table ── */
                      <div style={{ ...ui.tableWrap, boxShadow: "none" }}>
                        <table style={{ ...ui.table, minWidth: 550 }}>
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
                                <td colSpan={5} style={{ ...ui.td, textAlign: "center", color: "var(--text-faint)" }}>
                                  Sin movimientos registrados
                                </td>
                              </tr>
                            )}
                            {selectedProduct.recentKardex.map((k) => (
                              <tr key={k.id}>
                                <td style={ui.td}>
                                  {fmtDate(k.date)}{" "}
                                  <span style={{ color: "var(--text-faint)" }}>{fmtTime(k.date)}</span>
                                </td>
                                <td style={ui.td}>{k.branch}</td>
                                <td style={{ ...ui.td, textAlign: "center" }}>
                                  <Badge tone={k.quantityChange >= 0 ? "green" : "red"}>
                                    {k.movementType.replace(/_/g, " ")}
                                  </Badge>
                                </td>
                                <td style={{ ...ui.td, textAlign: "center", fontWeight: 800, color: k.quantityChange >= 0 ? "var(--color-success)" : "var(--color-danger)" }}>
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
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div style={{ borderTop: "1px solid var(--border)", backgroundColor: "var(--surface-2)", flexShrink: 0 }}>
              <div
                style={
                  isMobile
                    ? {
                      display: "grid",
                      gridTemplateColumns: selectedProduct ? "1fr 1fr" : "1fr",
                      gap: 8,
                      padding: "12px 16px",
                    }
                    : {
                      display: "flex",
                      gap: 10,
                      padding: "14px 22px",
                      alignItems: "center",
                    }
                }
              >
                {selectedProduct && (
                  <>
                    <button
                      onClick={() => handleToggleActive(selectedProduct)}
                      disabled={statusSaving}
                      style={{
                        ...ui.ghostBtn,
                        color: selectedProduct.active ? "#b91c1c" : "#15803d",
                        borderColor: selectedProduct.active ? "#fca5a5" : "#86efac",
                        marginRight: "auto",
                        whiteSpace: "nowrap",
                        ...(isMobile
                          ? {
                            width: "100%",
                            justifyContent: "center",
                            fontSize: 12,
                            padding: "8px 10px",
                            order: 3,
                          }
                          : {}),
                      }}
                    >
                      {statusSaving ? "Procesando..." : selectedProduct.active ? "Desactivar" : "Activar"}
                    </button>
                    {!isMobile && <span style={{ flex: 1 }} />}
                    {user?.role !== "GERENTE" && (
                      <button
                        onClick={() => handleEdit(selectedProduct)}
                        style={{
                          ...ui.ghostBtn,
                          color: "var(--accent)",
                          borderColor: "#93c5fd",
                          whiteSpace: "nowrap",
                          ...(isMobile
                            ? {
                              width: "100%",
                              justifyContent: "center",
                              fontSize: 12,
                              padding: "8px 10px",
                              order: 1,
                            }
                            : {}),
                        }}
                      >
                        Editar producto
                      </button>
                    )}
                    <button
                      onClick={printProduct}
                      style={{
                        ...ui.primaryBtn,
                        ...(user?.role === "GERENTE" ? { marginLeft: "auto" } : {}),
                        whiteSpace: "nowrap",
                        ...(isMobile
                          ? {
                            width: "100%",
                            justifyContent: "center",
                            fontSize: 12,
                            padding: "8px 10px",
                            order: 2,
                          }
                          : {}),
                      }}
                    >
                      <Printer size={15} /> Imprimir ficha
                    </button>
                  </>
                )}
                <button
                  onClick={closeDetail}
                  style={{
                    ...ui.ghostBtn,
                    whiteSpace: "nowrap",
                    ...(isMobile
                      ? {
                        width: "100%",
                        justifyContent: "center",
                        fontSize: 12,
                        padding: "8px 10px",
                        order: 4,
                      }
                      : {}),
                  }}
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =================== SUB-MODAL: AJUSTAR STOCK =================== */}
      {adjustOpen && selectedProduct && (() => {
        const currentStock = selectedProduct.inventories.find((inv) => inv.branchId === adjustBranch)?.quantity ?? 0;
        const expectedStock = adjustType === "RECOUNT"
          ? adjustQuantity
          : adjustType === "ENTRADA"
            ? currentStock + adjustQuantity
            : currentStock - adjustQuantity;
        const diff = adjustType === "RECOUNT" ? adjustQuantity - currentStock : null;

        return (
          <div style={subModalStyle} onClick={() => { if (!adjustSaving) setAdjustOpen(false); }}>
            <div style={{ ...ui.modal, maxWidth: 500 }} onClick={(e) => e.stopPropagation()}>
              <div style={ui.modalHeader}>
                <div style={{ ...ui.modalTitle, display: "flex", alignItems: "center", gap: 8 }}><Settings size={16} /> Ajustar stock — {selectedProduct.name}</div>
                <button onClick={() => setAdjustOpen(false)} style={{ ...ui.ghostBtn, padding: "6px 10px" }} disabled={adjustSaving}>
                  <X size={16} />
                </button>
              </div>
              <div style={ui.modalBody}>
                {/* Sucursal */}
                <div style={{ marginBottom: 16 }}>
                  <label style={ui.fieldLabel}>Sucursal *</label>
                  <select
                    value={adjustBranch || ""}
                    onChange={(e) => { setAdjustBranch(Number(e.target.value)); setAdjustType(""); setAdjustQuantity(0); setAdjustReason(""); }}
                    disabled={user?.role === "GERENTE"}
                    style={{ ...ui.input, cursor: user?.role === "GERENTE" ? "default" : "pointer" }}
                  >
                    <option value="">Selecciona sucursal</option>
                    {selectedProduct.inventories
                      .filter((inv) => user?.role !== "GERENTE" || inv.branchId === user.branch?.id)
                      .map((inv) => (
                        <option key={inv.branchId} value={inv.branchId}>
                          {inv.branch} — Stock actual: {inv.quantity} uds.
                        </option>
                      ))}
                  </select>
                </div>

                {adjustBranch > 0 && (
                  <>
                    {/* Stock actual destacado */}
                    <div style={{ background: "var(--accent-soft)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "var(--accent)" }}>
                      Stock actual: <strong>{currentStock} unidades</strong>
                    </div>

                    {/* Tipo de movimiento */}
                    <div style={{ marginBottom: 16 }}>
                      <label style={ui.fieldLabel}>Tipo de movimiento *</label>
                      <select
                        value={adjustType}
                        onChange={(e) => { setAdjustType(e.target.value); setAdjustQuantity(0); setAdjustReason(""); }}
                        style={{ ...ui.input, cursor: "pointer" }}
                      >
                        <option value="">Selecciona tipo...</option>
                        <option value="RECOUNT">RECONTEO — Declarar stock final real</option>
                        <option value="ENTRADA">ENTRADA — Agregar unidades</option>
                        <option value="SALIDA">SALIDA — Quitar unidades</option>
                        <option value="MERMA">MERMA — Rotura, expiración, pérdida</option>
                      </select>
                    </div>

                    {/* Cantidad con preview */}
                    {adjustType && (
                      <div style={{ marginBottom: 16 }}>
                        <label style={ui.fieldLabel}>
                          {adjustType === "RECOUNT" ? "Stock final declarado (reconteo) *" : `Cantidad a ${adjustType === "ENTRADA" ? "agregar" : "retirar"} *`}
                        </label>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={adjustQuantity || ""}
                          onChange={(e) => handleAdjustQuantityChange(e.target.value)}
                          style={ui.input}
                          placeholder="0"
                          autoFocus
                        />
                        {adjustFieldErrors.quantity && <p style={styles.fieldError}>{adjustFieldErrors.quantity}</p>}
                        {adjustQuantity > 0 && (
                          adjustType === "RECOUNT" ? (
                            <p style={{ fontSize: 12, color: diff === 0 ? "var(--text-muted)" : diff! > 0 ? "var(--color-success)" : "var(--color-danger)", marginTop: 4 }}>
                              Diferencia: {diff! > 0 ? "+" : ""}{diff} uds. → Stock quedará en <strong>{expectedStock}</strong>
                            </p>
                          ) : (
                            <p style={{ fontSize: 12, color: "var(--accent-strong)", marginTop: 4 }}>
                              Stock esperado: <strong>{expectedStock}</strong> uds.
                              {expectedStock < 0 && <span style={{ color: "#b91c1c" }}> (stock negativo — no permitido)</span>}
                            </p>
                          )
                        )}
                      </div>
                    )}

                    {/* Motivo como SELECT contextual */}
                    {adjustType && (
                      <div style={{ marginBottom: 16 }}>
                        <label style={ui.fieldLabel}>Motivo *</label>
                        <select
                          value={adjustReason}
                          onChange={(e) => setAdjustReason(e.target.value)}
                          style={{ ...ui.input, cursor: "pointer" }}
                        >
                          <option value="">Selecciona motivo...</option>
                          {adjustType === "RECOUNT" && (
                            <>
                              <option value="Reconteo físico periódico">Reconteo físico periódico</option>
                              <option value="Corrección de conteo anterior">Corrección de conteo anterior</option>
                              <option value="Auditoría de inventario">Auditoría de inventario</option>
                            </>
                          )}
                          {adjustType === "ENTRADA" && (
                            <>
                              <option value="Mercancía sin factura">Mercancía sin factura</option>
                              <option value="Devolución de proveedor">Devolución de proveedor</option>
                              <option value="Mercancía encontrada">Mercancía encontrada</option>
                              <option value="Otro">Otro</option>
                            </>
                          )}
                          {adjustType === "SALIDA" && (
                            <>
                              <option value="Muestreo / Prueba">Muestreo / Prueba</option>
                              <option value="Obsequio">Obsequio</option>
                              <option value="Ajuste de conteo">Ajuste de conteo</option>
                              <option value="Otro">Otro</option>
                            </>
                          )}
                          {adjustType === "MERMA" && (
                            <>
                              <option value="Producto expirado">Producto expirado</option>
                              <option value="Producto dañado / roto">Producto dañado / roto</option>
                              <option value="Hurto / pérdida">Hurto / pérdida</option>
                              <option value="Otro">Otro</option>
                            </>
                          )}
                        </select>
                      </div>
                    )}

                    {/* Observaciones libres */}
                    {adjustType && (
                      <div style={{ marginBottom: 16 }}>
                        <label style={ui.fieldLabel}>Observaciones adicionales</label>
                        <textarea
                          value={adjustObservations}
                          onChange={(e) => setAdjustObservations(e.target.value)}
                          placeholder="Detalles adicionales (opcional)"
                          style={{ ...ui.input, minHeight: 60, resize: "vertical", fontFamily: "inherit" }}
                        />
                      </div>
                    )}
                  </>
                )}

                {adjustError && (
                  <p style={{ fontSize: 13, color: "var(--color-danger)", marginBottom: 12 }}>{adjustError}</p>
                )}
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "14px 22px", borderTop: "1px solid var(--border)" }}>
                <button onClick={() => setAdjustOpen(false)} style={ui.ghostBtn}>Cancelar</button>
                <button onClick={submitAdjustment} style={ui.primaryBtn} disabled={!adjustBranch || !adjustType || !adjustReason}>
                  {transferSaving ? "Aplicando..." : <><Check size={13} /> Aplicar ajuste</>}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* =================== SUB-MODAL: TRASLADAR STOCK =================== */}
      {transferOpen && selectedProduct && (() => {
        const fromInv = selectedProduct.inventories.find((inv) => inv.branchId === transferFrom);
        const toInv = selectedProduct.inventories.find((inv) => inv.branchId === transferTo);

        return (
          <div style={subModalStyle} onClick={() => { if (!transferConfirm && !transferSaving) setTransferOpen(false); }}>
            <div style={{ ...ui.modal, maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
              <div style={ui.modalHeader}>
                <div style={{ ...ui.modalTitle, display: "flex", alignItems: "center", gap: 8 }}><ArrowLeftRight size={16} /> Trasladar stock — {selectedProduct.name}</div>
                <button onClick={() => setTransferOpen(false)} style={{ ...ui.ghostBtn, padding: "6px 10px" }} disabled={transferSaving}>
                  <X size={16} />
                </button>
              </div>

              {/* Overlay de confirmación dentro del modal */}
              {transferConfirm && fromInv && toInv ? (
                <div style={{ padding: "24px 22px" }}>
                  <p style={{ fontWeight: 700, fontSize: 15, marginBottom: 16, color: "var(--accent-strong)", display: "flex", alignItems: "center", gap: 6 }}><AlertTriangle size={15} /> Confirmar traslado</p>
                  <p style={{ fontSize: 14, marginBottom: 16 }}>
                    Trasladar <strong>{transferQty} uds.</strong> de <strong>{fromInv.branch}</strong> a <strong>{toInv.branch}</strong>
                  </p>
                  <div style={{ background: "var(--accent-soft)", border: "1px solid var(--border)", borderRadius: 8, padding: "12px 16px", marginBottom: 20, fontSize: 13, lineHeight: 1.8 }}>
                    <div><strong>{fromInv.branch}:</strong> {fromInv.quantity} → {fromInv.quantity - transferQty} uds.</div>
                    <div><strong>{toInv.branch}:</strong> {toInv.quantity} → {toInv.quantity + transferQty} uds.</div>
                  </div>
                  {transferError && (
                    <p style={{ fontSize: 13, color: "var(--color-danger)", marginBottom: 12 }}>{transferError}</p>
                  )}
                  <div style={{ display: "flex", gap: 10 }}>
                    <button onClick={() => setTransferConfirm(false)} style={{ ...ui.ghostBtn, flex: 1, justifyContent: "center" }} disabled={transferSaving}>
                      Volver
                    </button>
                    <button onClick={submitTransfer} style={{ ...ui.primaryBtn, flex: 1, justifyContent: "center" }} disabled={transferSaving}>
                      {transferSaving ? "Procesando..." : <><Check size={13} /> Confirmar traslado</>}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={ui.modalBody}>
                    <div style={{ marginBottom: 16 }}>
                      <label style={ui.fieldLabel}>Desde (sucursal origen)</label>
                      <select
                        value={transferFrom || ""}
                        onChange={(e) => { setTransferFrom(Number(e.target.value)); setTransferQty(0); }}
                        style={{ ...ui.input, cursor: "pointer" }}
                      >
                        <option value="">Selecciona origen</option>
                        {selectedProduct.inventories.map((inv) => (
                          <option key={inv.branchId} value={inv.branchId}>
                            {inv.branch} — Stock: {inv.quantity} uds.
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
                          .filter((inv) => {
                            if (user?.role === "GERENTE" && user.branch?.id) {
                              if (transferFrom !== user.branch.id) {
                                return inv.branchId === user.branch.id;
                              }
                            }
                            return true;
                          })
                          .map((inv) => (
                            <option key={inv.branchId} value={inv.branchId}>
                              {inv.branch} — Stock: {inv.quantity} uds.
                            </option>
                          ))}
                      </select>
                    </div>
                    <div style={{ marginBottom: 16 }}>
                      <label style={ui.fieldLabel}>Cantidad a trasladar</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={transferQty || ""}
                        onChange={(e) => handleTransferQuantityChange(e.target.value)}
                        style={ui.input}
                      />
                      {transferFieldErrors.quantity && <p style={styles.fieldError}>{transferFieldErrors.quantity}</p>}
                      {fromInv && transferQty > 0 && (
                        <p style={{ fontSize: 12, color: transferQty > fromInv.quantity ? "var(--color-danger)" : "var(--accent-strong)", marginTop: 4 }}>
                          {transferQty > fromInv.quantity
                            ? <><AlertTriangle size={12} /> Stock insuficiente — hay {fromInv.quantity} uds. disponibles</>
                            : `Quedarán ${fromInv.quantity - transferQty} uds. en ${fromInv.branch}`}
                        </p>
                      )}
                    </div>
                    {transferError && (
                      <p style={{ fontSize: 13, color: "var(--color-danger)", marginBottom: 12 }}>{transferError}</p>
                    )}
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "14px 22px", borderTop: "1px solid var(--border)" }}>
                    <button onClick={() => setTransferOpen(false)} style={ui.ghostBtn} disabled={transferSaving}>Cancelar</button>
                    <button
                      onClick={() => { setTransferError(null); setTransferConfirm(true); }}
                      style={ui.primaryBtn}
                      disabled={transferSaving || !transferFrom || !transferTo || !transferQty || (fromInv ? transferQty > fromInv.quantity : false)}
                    >
                      <ArrowLeftRight size={13} /> Trasladar
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })()}
      {showForm && (
        <div style={ui.overlay} onClick={closeForm}>
          <form style={{ ...ui.modal, maxWidth: 600 }} onClick={(e) => e.stopPropagation()} onSubmit={submit}>
            <div style={ui.modalHeader}>
              <span style={ui.modalTitle}>
                {editingId !== null ? "Editar producto" : "Registrar nuevo producto"}
              </span>
              <button type="button" style={{ ...ui.linkBtn, opacity: saving ? 0.6 : 1, color: "var(--text-muted)" }} onClick={closeForm} disabled={saving}>
                <X size={18} />
              </button>
            </div>
            <div style={{ ...ui.modalBody, maxHeight: "90vh", overflowY: "auto", padding: isMobile ? "16px" : "24px" }}>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12, marginBottom: 14 }}>
                <div style={{ minWidth: 0 }}>
                  <label style={ui.fieldLabel}>SKU *</label>
                  <input
                    style={{ ...ui.input, backgroundColor: "var(--surface-3)", cursor: "default", fontFamily: "monospace" }}
                    value={form.sku}
                    placeholder={skuLoading ? "Generando..." : "PROD-001"}
                    readOnly
                    aria-readonly="true"
                  />
                  {skuLoading && <p style={styles.fieldHint}>Generando SKU automático...</p>}
                  {!skuLoading && fieldErrors.sku && (
                    <div style={styles.skuErrorRow}>
                      <p style={{ ...styles.fieldError, marginTop: 0 }}>{fieldErrors.sku}</p>
                      {editingId === null && (
                        <button type="button" style={ui.linkBtn} onClick={() => void loadNextSku()}>
                          Reintentar
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <div style={{ minWidth: 0 }}>
                  <label style={ui.fieldLabel}>Código de barras</label>
                  <input style={ui.input} value={form.barcode} onChange={set("barcode")} placeholder="7501000000000" />
                  {fieldErrors.barcode && <p style={styles.fieldError}>{fieldErrors.barcode}</p>}
                </div>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={ui.fieldLabel}>Nombre *</label>
                <input
                  style={ui.input}
                  value={form.name}
                  onChange={set("name")}
                  placeholder="Nombre del producto"
                  maxLength={PRODUCT_NAME_MAX_LENGTH}
                  autoFocus={editingId === null}
                />
                <div style={styles.fieldFeedbackRow}>
                  {fieldErrors.name ? <p style={{ ...styles.fieldError, marginTop: 0 }}>{fieldErrors.name}</p> : <span />}
                  <span style={styles.characterCounter}>{form.name.length}/{PRODUCT_NAME_MAX_LENGTH}</span>
                </div>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={ui.fieldLabel}>Descripción</label>
                <textarea
                  style={{ ...ui.input, resize: "vertical", minHeight: 60 }}
                  value={form.description}
                  onChange={set("description")}
                  placeholder="Detalle o descripción opcional"
                  maxLength={PRODUCT_DESCRIPTION_MAX_LENGTH}
                />
                <div style={styles.fieldFeedbackRow}>
                  {fieldErrors.description ? <p style={{ ...styles.fieldError, marginTop: 0 }}>{fieldErrors.description}</p> : <span />}
                  <span style={styles.characterCounter}>{form.description.length}/{PRODUCT_DESCRIPTION_MAX_LENGTH}</span>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={ui.fieldLabel}>Precio Costo ($) *</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    style={ui.input}
                    value={form.costPrice}
                    onChange={setMoney("costPrice")}
                    placeholder="0.00"
                  />
                  {fieldErrors.costPrice && <p style={styles.fieldError}>{fieldErrors.costPrice}</p>}
                </div>
                <div>
                  <label style={ui.fieldLabel}>Precio Venta ($) *</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    style={ui.input}
                    value={form.sellPrice}
                    onChange={setMoney("sellPrice")}
                    placeholder="0.00"
                  />
                  {fieldErrors.sellPrice && <p style={styles.fieldError}>{fieldErrors.sellPrice}</p>}
                </div>
              </div>

              <div style={{ display: "none" }}>
                <div>
                  <label style={ui.fieldLabel}>Clave SAT (ClaveProdServ) *</label>
                  <input style={ui.input} value={form.satProductKey} onChange={set("satProductKey")} placeholder="01010101" />
                  {fieldErrors.satProductKey && <p style={styles.fieldError}>{fieldErrors.satProductKey}</p>}
                </div>
                <div>
                  <label style={ui.fieldLabel}>Clave Unidad SAT (ClaveUnidad) *</label>
                  <input style={ui.input} value={form.satUnitKey} onChange={set("satUnitKey")} placeholder="H87" />
                  {fieldErrors.satUnitKey && <p style={styles.fieldError}>{fieldErrors.satUnitKey}</p>}
                </div>
              </div>

              <div style={styles.categorySection}>
                <div style={styles.categoryHeader}>
                  <div style={styles.categoryTitleWrap}>
                    <Tags size={16} color="var(--accent)" />
                    <span style={styles.categoryTitle}>Categorias *</span>
                  </div>
                  <span style={styles.categoryCounter}>
                    {selectedCategories.length} categoria(s) seleccionada(s)
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setCategoryPanelOpen((open) => !open)}
                  style={styles.categoryPickerButton}
                  disabled={saving}
                >
                  <span style={styles.categoryPickerText}>
                    {selectedCategories.length > 0 ? "Editar categorias seleccionadas" : "Seleccionar categorias"}
                  </span>
                  {categoryPanelOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>

                {selectedCategories.length > 0 && (
                  <div style={styles.categoryChips}>
                    {selectedCategories.map((category) => {
                      const categoryColor = getCategoryDisplayColor(category.color, category.level, category.active);
                      return (
                        <button
                          key={category.id}
                          type="button"
                          onClick={() => removeSelectedCategory(category.id)}
                          style={{
                            ...styles.categoryChip,
                            opacity: category.active ? 1 : 0.78,
                            borderColor: category.active ? "var(--border)" : "var(--color-warning, #f59e0b)",
                          }}
                          disabled={saving}
                          title={category.active ? "Quitar categoria" : "Categoria inactiva; puedes quitarla, pero no volver a asignarla"}
                        >
                          <span
                            style={{
                              ...styles.categoryColorDot,
                              backgroundColor: categoryColor,
                              opacity: category.active ? 1 : 0.45,
                            }}
                          />
                          <span style={styles.categoryChipText}>{category.code} - {category.name}</span>
                          {!category.active && <span style={styles.categoryInactiveMark}>Inactiva</span>}
                          <X size={13} />
                        </button>
                      );
                    })}
                  </div>
                )}

                {fieldErrors.categoryIds && <p style={styles.fieldError}>{fieldErrors.categoryIds}</p>}

                {categoryPanelOpen && (
                  <div style={styles.categoryPanel}>
                    <div style={styles.categorySearchWrap}>
                      <Search size={15} color="var(--text-muted)" />
                      <input
                        style={styles.categorySearchInput}
                        value={categorySearch}
                        onChange={(event) => setCategorySearch(event.target.value)}
                        placeholder="Buscar categoria por codigo o nombre"
                      />
                    </div>

                    {categoryLoading && <p style={styles.taxMuted}>Cargando categorias...</p>}

                    {!categoryLoading && categoryError && (
                      <div style={styles.taxErrorBox}>
                        <span>{categoryError}</span>
                        <button
                          type="button"
                          style={ui.linkBtn}
                          onClick={() => void loadCategoryList(selectedCategories)}
                        >
                          Reintentar
                        </button>
                      </div>
                    )}

                    {!categoryLoading && !categoryError && visibleCategoryOptions.length === 0 && (
                      <p style={styles.taxMuted}>No se encontraron categorias con esa busqueda.</p>
                    )}

                    {!categoryLoading && !categoryError && visibleCategoryOptions.length > 0 && (
                      <div style={styles.categoryOptionList}>
                        {visibleCategoryOptions.map((category) => {
                          const checked = selectedCategoryIds.includes(category.id);
                          const inactiveAndUnavailable = !category.active && !checked;
                          const categoryColor = getCategoryDisplayColor(category.color, category.level, category.active);
                          return (
                            <label
                              key={category.id}
                              style={{
                                ...styles.categoryOption,
                                backgroundColor: checked ? "var(--accent-soft)" : "var(--surface)",
                                borderColor: checked ? "#93c5fd" : "var(--border)",
                                cursor: inactiveAndUnavailable ? "not-allowed" : "pointer",
                                opacity: inactiveAndUnavailable ? 0.62 : 1,
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={saving || inactiveAndUnavailable}
                                onChange={() => toggleCategory(category)}
                                style={styles.taxCheckbox}
                              />
                              <span
                                style={{
                                  ...styles.categoryColorDot,
                                  backgroundColor: categoryColor,
                                  opacity: category.active ? 1 : 0.45,
                                }}
                              />
                              <span style={styles.categoryOptionText}>
                                <span style={styles.categoryOptionName}>
                                  {category.code} - {category.name}
                                  {!category.active && <span style={styles.categoryInactiveInline}>Inactiva</span>}
                                </span>
                                <span style={styles.categoryOptionPath}>{getCategoryPathLabel(category)}</span>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div style={styles.promotionSection}>
                <div style={styles.categoryHeader}>
                  <div style={styles.categoryTitleWrap}>
                    <Tags size={16} color="var(--accent)" />
                    <span style={styles.categoryTitle}>Promociones del producto</span>
                  </div>
                  <span style={styles.categoryCounter}>
                    {selectedPromotionIds.length} promocion(es) seleccionada(s)
                  </span>
                </div>

                <div style={styles.promotionCategorySummary}>
                  <span style={styles.promotionCategoryLabel}>Categorías del producto:</span>
                  {selectedFinalCategories.length > 0 ? (
                    <div style={styles.promotionCategoryBadges}>
                      {selectedFinalCategories.map((category) => (
                        <span key={category.id} style={styles.promotionCategoryBadge}>
                          {category.code} {category.name}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span style={styles.taxMuted}>Sin categorías seleccionadas</span>
                  )}
                </div>

                <p style={styles.promotionHelp}>
                  {selectedFinalCategories.length > 0
                    ? "Las promociones disponibles se muestran según las categorías seleccionadas del producto."
                    : "Primero selecciona al menos una categoría para ver promociones relacionadas."}
                </p>

                {(selectedFinalCategories.length > 0 || selectedPromotionIds.length > 0) && (
                  <div style={styles.promotionPanel}>
                    <div style={styles.categorySearchWrap}>
                      <Search size={15} color="var(--text-muted)" />
                      <input
                        style={styles.categorySearchInput}
                        value={promotionSearch}
                        onChange={(event) => setPromotionSearch(event.target.value)}
                        placeholder="Buscar promoción por nombre"
                        disabled={saving}
                      />
                    </div>

                    {promotionsLoading && <p style={styles.taxMuted}>Cargando promociones...</p>}

                    {!promotionsLoading && promotionsError && (
                      <div style={styles.taxErrorBox}>
                        <span>{promotionsError}</span>
                        <button
                          type="button"
                          style={ui.linkBtn}
                          onClick={() => void loadPromotions(editingId ?? undefined)}
                        >
                          Reintentar
                        </button>
                      </div>
                    )}

                    {!promotionsLoading && !promotionsError && selectedIncompatiblePromotions.length > 0 && (
                      <div style={styles.promotionWarningBox}>
                        <AlertTriangle size={15} />
                        <span>Esta promoción podría no corresponder a las categorías seleccionadas.</span>
                      </div>
                    )}

                    {!promotionsLoading && !promotionsError && visiblePromotionOptions.length === 0 && (
                      <p style={styles.taxMuted}>
                        {promotionSearch.trim()
                          ? "No se encontraron promociones con ese nombre."
                          : "No hay promociones relacionadas con las categorías seleccionadas."}
                      </p>
                    )}

                    {!promotionsLoading && !promotionsError && visiblePromotionOptions.length > 0 && (
                      <div style={styles.promotionOptionList}>
                        {visiblePromotionOptions.map((promotion) => {
                          const checked = selectedPromotionIds.includes(promotion.id);
                          const status = getPromotionStatus(promotion);
                          const selectable = canSelectPromotion(promotion);
                          const disabled = saving || (!checked && !selectable);
                          const incompatible = selectedIncompatiblePromotions.some((item) => item.id === promotion.id);

                          return (
                            <label
                              key={promotion.id}
                              style={{
                                ...styles.promotionOption,
                                backgroundColor: checked ? "var(--accent-soft)" : "var(--surface)",
                                borderColor: checked ? "#93c5fd" : "var(--border)",
                                cursor: disabled ? "not-allowed" : "pointer",
                                opacity: disabled ? 0.62 : 1,
                              }}
                              title={!selectable ? "Promoción inactiva o vencida" : undefined}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={disabled}
                                onChange={() => togglePromotion(promotion)}
                                style={styles.taxCheckbox}
                              />
                              <span style={styles.promotionOptionBody}>
                                <span style={styles.promotionOptionHeader}>
                                  <span style={styles.promotionOptionName}>{promotion.name}</span>
                                  <Badge tone={status.tone}>{status.label}</Badge>
                                </span>
                                <span style={styles.promotionMetaGrid}>
                                  <span style={styles.promotionMetaItem}>
                                    Tipo: {getPromotionTypeLabel(promotion.promotionType.name)}
                                  </span>
                                  <span style={styles.promotionMetaItem}>
                                    Vigencia: {fmtDate(promotion.startDate)} - {fmtDate(promotion.endDate)}
                                  </span>
                                  <span style={styles.promotionMetaItem}>
                                    Productos asociados: {promotion.products.length} - {getPromotionProductSummary(promotion)}
                                  </span>
                                </span>
                                {incompatible && (
                                  <span style={styles.promotionInlineWarning}>
                                    Esta promoción podría no corresponder a las categorías seleccionadas.
                                  </span>
                                )}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div style={{ border: "1px solid var(--border)", borderRadius: 10, backgroundColor: "var(--surface-2)", padding: 14, marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ color: "var(--text)", fontSize: 13, fontWeight: 800 }}>Impuestos aplicables</span>
                  </div>
                  {!taxLoading && !taxError && (
                    <span style={{ color: "var(--text-muted)", fontSize: 12, fontWeight: 700 }}>
                      {taxOptions.filter((tax) => selectedTaxIds.includes(tax.id)).length} seleccionado(s)
                    </span>
                  )}
                </div>

                {taxLoading && <p style={styles.taxMuted}>Cargando impuestos aplicables...</p>}

                {!taxLoading && taxError && (
                  <div style={styles.taxErrorBox}>
                    <span>{taxError}</span>
                    <button
                      type="button"
                      style={ui.linkBtn}
                      onClick={() => editingId !== null ? void loadProductTaxes(editingId) : void loadTaxList()}
                    >
                      Reintentar
                    </button>
                  </div>
                )}

                {!taxLoading && !taxError && taxOptions.length === 0 && (
                  <p style={styles.taxMuted}>No hay impuestos activos para asignar.</p>
                )}

                {!taxLoading && !taxError && taxOptions.length > 0 && (
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
                    {taxOptions.map((tax) => {
                      const checked = selectedTaxIds.includes(tax.id);
                      return (
                        <label
                          key={tax.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 12,
                            border: `1px solid ${checked ? "#93c5fd" : "var(--border)"}`,
                            borderRadius: 8,
                            padding: "12px 14px",
                            cursor: "pointer",
                            minHeight: 52,
                            backgroundColor: checked ? "var(--accent-soft)" : "var(--surface)",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={saving}
                            onChange={() => toggleTax(tax.id)}
                            style={{ width: 16, height: 16, accentColor: "var(--accent)", cursor: "pointer", flexShrink: 0, alignSelf: "center", marginTop: 0 }}
                          />
                          <span style={{ display: "flex", flexDirection: "column", minWidth: 0, gap: 3 }}>
                            <span style={{ color: "var(--text)", fontSize: 13, fontWeight: 800, wordBreak: "break-word", overflowWrap: "anywhere" }}>{tax.name}</span>
                            <span style={{ color: "var(--text-muted)", fontSize: 12, fontWeight: 700, marginTop: 2 }}>{formatTaxRate(tax.rate)}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              {formError && (
                <p style={{ color: "var(--color-danger)", fontSize: 13, fontWeight: 600, marginTop: 4, marginBottom: 14 }}>{formError}</p>
              )}

              <div style={{ display: "flex", gap: 10, marginTop: 20, flexWrap: isMobile ? "wrap" : "nowrap" }}>
                <button type="button" disabled={saving} style={{ ...ui.ghostBtn, flex: 1, justifyContent: "center", width: isMobile ? "100%" : "auto" }} onClick={closeForm}>
                  Cancelar
                </button>
                <button type="submit" disabled={saving || (editingId === null && skuLoading)} style={{ ...ui.primaryBtn, flex: 1, justifyContent: "center", width: isMobile ? "100%" : "auto" }}>
                  {saving ? (editingId !== null ? "Actualizando..." : "Guardando...") : editingId !== null ? "Actualizar producto" : "Guardar producto"}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      <ConfirmModal
        isOpen={categoryRemovalConfirm !== null}
        onClose={() => setCategoryRemovalConfirm(null)}
        onConfirm={confirmCategoryRemoval}
        variant="warning"
        title="Quitar categorías del producto"
        message={categoryRemovalConfirm?.message || ""}
        confirmLabel="Continuar"
      />

      <ConfirmModal
        isOpen={promotionCompatibilityConfirm !== null}
        onClose={() => setPromotionCompatibilityConfirm(null)}
        onConfirm={confirmPromotionCompatibility}
        variant="warning"
        title="Conservar promoción"
        message={promotionCompatibilityConfirm?.message || ""}
        confirmLabel="Conservar"
      />
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  fieldError: {
    color: "var(--color-danger)",
    fontSize: 12,
    fontWeight: 600,
    marginTop: 5,
  },
  fieldHint: {
    color: "var(--text-muted)",
    fontSize: 12,
    fontWeight: 600,
    marginTop: 5,
  },
  fieldFeedbackRow: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    minHeight: 20,
    marginTop: 5,
  },
  characterCounter: {
    color: "var(--text-muted)",
    fontSize: 12,
    fontWeight: 700,
    marginLeft: "auto",
    whiteSpace: "nowrap",
  },
  skuErrorRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 5,
  },
  categorySection: {
    border: "1px solid var(--border)",
    borderRadius: 10,
    backgroundColor: "var(--surface-2)",
    padding: 14,
    marginBottom: 14,
  },
  categoryHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 10,
  },
  categoryTitleWrap: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  categoryTitle: {
    color: "var(--text)",
    fontSize: 13,
    fontWeight: 800,
  },
  categoryCounter: {
    color: "var(--text-muted)",
    fontSize: 12,
    fontWeight: 700,
    textAlign: "right",
  },
  categoryPickerButton: {
    width: "100%",
    minHeight: 42,
    border: "1px solid var(--border)",
    borderRadius: 8,
    backgroundColor: "var(--surface)",
    color: "var(--text)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: "10px 12px",
    cursor: "pointer",
    fontWeight: 700,
  },
  categoryPickerText: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  categoryChips: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  categoryChip: {
    border: "1px solid var(--border)",
    borderRadius: 999,
    backgroundColor: "var(--surface)",
    color: "var(--text)",
    minHeight: 30,
    maxWidth: "100%",
    padding: "5px 8px 5px 10px",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 800,
  },
  categoryChipText: {
    minWidth: 0,
    wordBreak: "break-word",
    overflowWrap: "anywhere",
  },
  categoryColorDot: {
    width: 9,
    height: 9,
    borderRadius: "50%",
    border: "1px solid rgba(15, 23, 42, 0.14)",
    flexShrink: 0,
  },
  categoryInactiveMark: {
    borderRadius: 999,
    backgroundColor: "rgba(245, 158, 11, 0.14)",
    color: "#b45309",
    padding: "2px 6px",
    fontSize: 10,
    fontWeight: 900,
    textTransform: "uppercase",
  },
  categoryPanel: {
    borderTop: "1px solid var(--border)",
    marginTop: 12,
    paddingTop: 12,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  categorySearchWrap: {
    minHeight: 40,
    border: "1px solid var(--border)",
    borderRadius: 8,
    backgroundColor: "var(--input-bg)",
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "0 10px",
  },
  categorySearchInput: {
    border: 0,
    outline: "none",
    backgroundColor: "transparent",
    color: "var(--text)",
    fontFamily: "inherit",
    fontSize: 13,
    width: "100%",
    minWidth: 0,
  },
  categoryOptionList: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 8,
    maxHeight: 260,
    overflowY: "auto",
    paddingRight: 2,
  },
  categoryOption: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "10px 12px",
    minHeight: 58,
  },
  categoryOptionText: {
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    gap: 3,
  },
  categoryOptionName: {
    color: "var(--text)",
    fontSize: 13,
    fontWeight: 800,
    wordBreak: "break-word",
    overflowWrap: "anywhere",
  },
  categoryInactiveInline: {
    color: "#b45309",
    fontSize: 10,
    fontWeight: 900,
    marginLeft: 8,
    textTransform: "uppercase",
  },
  categoryOptionPath: {
    color: "var(--text-muted)",
    fontSize: 12,
    fontWeight: 700,
    wordBreak: "break-word",
    overflowWrap: "anywhere",
  },
  promotionSection: {
    border: "1px solid var(--border)",
    borderRadius: 10,
    backgroundColor: "var(--surface-2)",
    padding: 14,
    marginBottom: 14,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  promotionCategorySummary: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    flexWrap: "wrap",
    marginBottom: 8,
  },
  promotionCategoryLabel: {
    color: "var(--text)",
    fontSize: 12,
    fontWeight: 800,
    paddingTop: 4,
  },
  promotionCategoryBadges: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    minWidth: 0,
  },
  promotionCategoryBadge: {
    border: "1px solid var(--border)",
    borderRadius: 999,
    backgroundColor: "var(--surface)",
    color: "var(--text)",
    fontSize: 11,
    fontWeight: 800,
    padding: "4px 8px",
    maxWidth: "100%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  promotionHelp: {
    color: "var(--text-muted)",
    fontSize: 12,
    fontWeight: 600,
    margin: "0 0 10px",
    lineHeight: 1.45,
  },
  promotionPanel: {
    borderTop: "1px solid var(--border)",
    marginTop: 12,
    paddingTop: 12,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  promotionOptionList: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 8,
    maxHeight: 320,
    overflowY: "auto",
    paddingRight: 2,
  },
  promotionOption: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "10px 12px",
    minHeight: 78,
  },
  promotionOptionBody: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    minWidth: 0,
    flex: 1,
  },
  promotionOptionHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    minWidth: 0,
  },
  promotionOptionName: {
    color: "var(--text)",
    fontSize: 13,
    fontWeight: 850,
    minWidth: 0,
    wordBreak: "break-word",
    overflowWrap: "anywhere",
  },
  promotionMetaGrid: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 3,
    minWidth: 0,
  },
  promotionMetaItem: {
    color: "var(--text-muted)",
    fontSize: 12,
    fontWeight: 700,
    wordBreak: "break-word",
    overflowWrap: "anywhere",
  },
  promotionWarningBox: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    border: "1px solid #f59e0b",
    borderRadius: 8,
    backgroundColor: "rgba(245,158,11,0.12)",
    color: "#b45309",
    fontSize: 12,
    fontWeight: 800,
    padding: "9px 10px",
  },
  promotionInlineWarning: {
    color: "#b45309",
    fontSize: 12,
    fontWeight: 800,
    lineHeight: 1.35,
  },
  taxSection: {
    border: "1px solid var(--border)",
    borderRadius: 10,
    backgroundColor: "var(--surface-2)",
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
    color: "var(--text)",
    fontSize: 13,
    fontWeight: 800,
  },
  taxCounter: {
    color: "var(--text-muted)",
    fontSize: 12,
    fontWeight: 700,
  },
  taxMuted: {
    color: "var(--text-muted)",
    fontSize: 13,
    fontWeight: 600,
    margin: 0,
  },
  taxErrorBox: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    border: "1px solid var(--color-danger)",
    borderRadius: 8,
    backgroundColor: "rgba(248,113,113,0.12)",
    color: "var(--color-danger)",
    fontSize: 13,
    fontWeight: 700,
    padding: "10px 12px",
  },
  taxGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
  },
  taxOption: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "12px 14px",
    cursor: "pointer",
    minHeight: 52,
  },
  taxCheckbox: {
    width: 16,
    height: 16,
    accentColor: "var(--accent)",
    cursor: "pointer",
    flexShrink: 0,
    alignSelf: "center",
    marginTop: 0,
  },
  taxOptionText: {
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    gap: 3,
  },
  taxOptionName: {
    color: "var(--text)",
    fontSize: 13,
    fontWeight: 800,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  taxOptionMeta: {
    color: "var(--text-muted)",
    fontSize: 12,
    fontWeight: 700,
    marginTop: 2,
  },
};

const invDetailRow: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "2px",
  marginBottom: 8,
};

const invDetailLabel: React.CSSProperties = {
  fontWeight: 500,
  color: "var(--text-muted)",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.3px",
};

const invDetailValue: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  fontWeight: 600,
  color: "var(--text)",
  fontSize: 13,
  wordBreak: "break-word",
  overflowWrap: "break-word",
};

export default InventarioView;

