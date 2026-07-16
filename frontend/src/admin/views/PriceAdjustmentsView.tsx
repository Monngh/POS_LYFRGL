/* eslint-disable react-hooks/set-state-in-effect */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  DollarSign,
  Eye,
  History,
  Loader2,
  PackageSearch,
  Percent,
  Search,
  Tags,
  X,
} from "lucide-react";
import api from "../../shared/services/api";
import { useToast } from "../../shared/context/ToastContext";
import { adminCategoryService, type AdminCategoryFlatItem } from "../services/categoryAdmin.service";
import {
  getApiErrorMessage,
  priceAdjustmentsApi,
  type ApplyPriceAdjustmentPayload,
} from "../utils/priceAdjustmentsApi";
import type {
  HistoryProductsResponse,
  InventoryProductForAdjustment,
  PreviewProduct,
  PreviewResult,
  PriceAdjustmentHistoryItem,
  PriceAdjustmentHistoryResponse,
  PriceAdjustmentOperation,
  PriceAdjustmentProduct,
  PriceAdjustmentScope,
} from "../types/priceAdjustments.types";
import {
  Badge,
  FilterSelect,
  SearchInput,
  SectionHeader,
  TableState,
  Toolbar,
  fmtDateTime,
  moneyExact,
  type ViewProps,
  ui,
  useMediaQuery,
} from "./shared";

type TabKey = "adjust" | "history";

interface EmployeeOption {
  id: number;
  name: string;
  email: string | null;
  role: string;
  active: boolean;
}

interface EmployeesResponse {
  employees: EmployeeOption[];
}

const CATEGORY_SCOPES: PriceAdjustmentScope[] = ["DIVISION", "DEPARTMENT", "CATEGORY"];
const VALUE_INPUT_REGEX = /^\d*(?:\.\d{0,2})?$/;

const scopeOptions: Array<{ value: PriceAdjustmentScope; label: string }> = [
  { value: "SELECTED_PRODUCTS", label: "Productos seleccionados" },
  { value: "DIVISION", label: "Division" },
  { value: "DEPARTMENT", label: "Departamento" },
  { value: "CATEGORY", label: "Categoria" },
  { value: "UNCATEGORIZED", label: "Productos sin categoria" },
];

const operationOptions: Array<{ value: PriceAdjustmentOperation; label: string }> = [
  { value: "PERCENT_INCREASE", label: "Aumentar porcentaje" },
  { value: "PERCENT_DECREASE", label: "Disminuir porcentaje" },
  { value: "FIXED_INCREASE", label: "Aumentar monto fijo" },
  { value: "FIXED_DECREASE", label: "Disminuir monto fijo" },
  { value: "SET_EXACT", label: "Establecer precio exacto" },
];

type ResolveProductsPayload = Parameters<typeof priceAdjustmentsApi.resolveProducts>[0];

const scopeLabel = (scope: PriceAdjustmentScope) =>
  scopeOptions.find((option) => option.value === scope)?.label ?? scope;

const operationLabel = (operation: PriceAdjustmentOperation | string) =>
  operationOptions.find((option) => option.value === operation)?.label ?? operation;

const adjustmentTypeLabel = (type: string, direction: string) => {
  if (type === "PERCENTAGE" && direction === "INCREASE") return "Aumento porcentual";
  if (type === "PERCENTAGE" && direction === "DECREASE") return "Descuento porcentual";
  if (type === "FIXED" && direction === "INCREASE") return "Aumento fijo";
  if (type === "FIXED" && direction === "DECREASE") return "Descuento fijo";
  if (type === "EXACT" && direction === "SET") return "Precio exacto";
  return `${type} ${direction}`;
};

const operationFilterOptions = [
  { value: "", label: "Todas las operaciones" },
  ...operationOptions,
];

const scopeFilterOptions = [
  { value: "", label: "Todos los alcances" },
  ...scopeOptions,
];

const isCategoryScope = (scope: PriceAdjustmentScope) => CATEGORY_SCOPES.includes(scope);

const formatAdjustmentValue = (operation: PriceAdjustmentOperation | string, value: number) =>
  operation === "PERCENT_INCREASE" || operation === "PERCENT_DECREASE"
    ? `${value.toLocaleString("es-MX", { maximumFractionDigits: 2 })}%`
    : moneyExact(Number(value));

const formatStoredAdjustmentValue = (type: string, value: number) =>
  type === "PERCENTAGE"
    ? `${value.toLocaleString("es-MX", { maximumFractionDigits: 2 })}%`
    : moneyExact(Number(value));

const getDifference = (product: PreviewProduct) => product.newSellPrice - product.currentSellPrice;

interface ProductSearchable {
  sku: string;
  barcode: string | null;
  name: string;
}

const normalizeSearchText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const filterAdjustmentProducts = <T extends ProductSearchable>(products: T[], query: string): T[] => {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return products;

  const terms = normalizedQuery.split(/\s+/).filter(Boolean);
  return products.filter((product) => {
    const searchableText = normalizeSearchText(`${product.sku} ${product.barcode ?? ""} ${product.name}`);
    return terms.every((term) => searchableText.includes(term));
  });
};

const buildCategoryText = (product: PriceAdjustmentProduct) =>
  product.categories.length
    ? product.categories.map((category) => `${category.code} ${category.name}`).join(", ")
    : "Sin categoria";

const formatCategoryOptionLabel = (category: Pick<AdminCategoryFlatItem, "code" | "name">) =>
  category.code ? `${category.code} · ${category.name}` : category.name;

const getValueError = (operation: PriceAdjustmentOperation, rawValue: string) => {
  const raw = rawValue.trim();
  if (!raw) return "El valor del ajuste es obligatorio.";
  if (!VALUE_INPUT_REGEX.test(raw)) return "El valor debe tener maximo dos decimales.";
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return "El valor debe ser mayor a cero.";
  if ((operation === "PERCENT_INCREASE" || operation === "PERCENT_DECREASE") && value >= 100) {
    return "El porcentaje debe ser mayor a 0 y menor a 100.";
  }
  return null;
};

const selectedArrayFromSet = (ids: Set<number>) => [...ids].sort((a, b) => a - b);

const Kpi: React.FC<{ label: string; value: React.ReactNode; icon: React.ReactNode }> = ({ label, value, icon }) => (
  <div style={styles.kpiCard}>
    <div style={styles.kpiIcon}>{icon}</div>
    <div>
      <div style={styles.kpiLabel}>{label}</div>
      <div style={styles.kpiValue}>{value}</div>
    </div>
  </div>
);

const InlineAlert: React.FC<{ tone: "success" | "warning" | "error" | "info"; children: React.ReactNode }> = ({
  tone,
  children,
}) => {
  const palette = {
    success: { bg: "#ecfdf5", border: "#bbf7d0", color: "#15803d" },
    warning: { bg: "#fffbeb", border: "#fde68a", color: "#92400e" },
    error: { bg: "#fef2f2", border: "#fecaca", color: "#b91c1c" },
    info: { bg: "#eff6ff", border: "#bfdbfe", color: "#1d4ed8" },
  }[tone];

  return (
    <div style={{ ...styles.inlineAlert, backgroundColor: palette.bg, borderColor: palette.border, color: palette.color }}>
      {children}
    </div>
  );
};

const PriceAdjustmentsView: React.FC<ViewProps> = ({ refreshToken }) => {
  const { showToast } = useToast();
  const isMobile = useMediaQuery("(max-width: 1024px)");
  const filtersTwoColumn = useMediaQuery("(max-width: 1180px)");
  const filtersStacked = useMediaQuery("(max-width: 640px)");

  const [activeTab, setActiveTab] = useState<TabKey>("adjust");

  const [scope, setScope] = useState<PriceAdjustmentScope>("SELECTED_PRODUCTS");
  const [scopeDivisionId, setScopeDivisionId] = useState("");
  const [scopeDepartmentId, setScopeDepartmentId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [categories, setCategories] = useState<AdminCategoryFlatItem[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(null);

  const [availableProducts, setAvailableProducts] = useState<InventoryProductForAdjustment[]>([]);
  const [availableLoading, setAvailableLoading] = useState(false);
  const [availableError, setAvailableError] = useState<string | null>(null);
  const [availableSearch, setAvailableSearch] = useState("");
  const [manualSelectedIds, setManualSelectedIds] = useState<Set<number>>(new Set());

  const [resolvedProducts, setResolvedProducts] = useState<PriceAdjustmentProduct[]>([]);
  const [selectedProductIds, setSelectedProductIds] = useState<Set<number>>(new Set());
  const [productSearch, setProductSearch] = useState("");
  const [resolveLoading, setResolveLoading] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);

  const [operation, setOperation] = useState<PriceAdjustmentOperation>("PERCENT_INCREASE");
  const [adjustmentValue, setAdjustmentValue] = useState("");
  const [valueError, setValueError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [confirmBelowCost, setConfirmBelowCost] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [confirmApplyOpen, setConfirmApplyOpen] = useState(false);
  const resolveRequestIdRef = useRef(0);
  const removedProductToastGuardRef = useRef<Set<number>>(new Set());

  const [historySearch, setHistorySearch] = useState("");
  const [debouncedHistorySearch, setDebouncedHistorySearch] = useState("");
  const [historyFrom, setHistoryFrom] = useState("");
  const [historyTo, setHistoryTo] = useState("");
  const [historyOperation, setHistoryOperation] = useState<PriceAdjustmentOperation | "">("");
  const [historyScope, setHistoryScope] = useState<PriceAdjustmentScope | "">("");
  const [historyUserId, setHistoryUserId] = useState("");
  const [historyPage, setHistoryPage] = useState(1);
  const [historyLimit, setHistoryLimit] = useState(10);
  const [history, setHistory] = useState<PriceAdjustmentHistoryResponse | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [userOptions, setUserOptions] = useState<EmployeeOption[]>([]);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [detail, setDetail] = useState<PriceAdjustmentHistoryItem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailSearch, setDetailSearch] = useState("");
  const [debouncedDetailSearch, setDebouncedDetailSearch] = useState("");
  const [detailOnlyBelowCost, setDetailOnlyBelowCost] = useState(false);
  const [detailPage, setDetailPage] = useState(1);
  const [detailProducts, setDetailProducts] = useState<HistoryProductsResponse | null>(null);
  const [detailProductsLoading, setDetailProductsLoading] = useState(false);
  const [detailProductsError, setDetailProductsError] = useState<string | null>(null);

  const selectedProductIdArray = useMemo(() => selectedArrayFromSet(selectedProductIds), [selectedProductIds]);
  const manualSelectedArray = useMemo(() => selectedArrayFromSet(manualSelectedIds), [manualSelectedIds]);

  const filteredAvailableProducts = useMemo(
    () => filterAdjustmentProducts(availableProducts, availableSearch),
    [availableProducts, availableSearch]
  );

  const filteredResolvedProducts = useMemo(
    () => filterAdjustmentProducts(resolvedProducts, productSearch),
    [resolvedProducts, productSearch]
  );

  const allVisibleResolvedSelected = useMemo(
    () =>
      filteredResolvedProducts.length > 0 &&
      filteredResolvedProducts.every((product) => selectedProductIds.has(product.id)),
    [filteredResolvedProducts, selectedProductIds]
  );

  const allVisibleAvailableSelected = useMemo(
    () =>
      filteredAvailableProducts.length > 0 &&
      filteredAvailableProducts.every((product) => manualSelectedIds.has(product.id)),
    [filteredAvailableProducts, manualSelectedIds]
  );

  const selectedScopeCategory = useMemo(
    () => categories.find((category) => String(category.id) === categoryId) ?? null,
    [categories, categoryId]
  );
  const scopeDivisionOptions = useMemo(
    () => categories.filter((category) => category.level === "DIVISION"),
    [categories]
  );
  const scopeDepartmentOptions = useMemo(
    () =>
      categories.filter(
        (category) => category.level === "DEPARTMENT" && (!scopeDivisionId || String(category.parentId) === scopeDivisionId)
      ),
    [categories, scopeDivisionId]
  );
  const scopeCategoryOptions = useMemo(
    () =>
      categories.filter(
        (category) => category.level === "CATEGORY" && (!scopeDepartmentId || String(category.parentId) === scopeDepartmentId)
      ),
    [categories, scopeDepartmentId]
  );

  const previewRequiresNotes = preview?.requiresReason ?? false;
  const previewRequiresBelowCostConfirmation = preview?.requiresBelowCostConfirmation ?? false;
  const notesError = previewRequiresNotes && !notes.trim() ? "El motivo es obligatorio para este ajuste." : null;
  const canApplyPreview =
    Boolean(preview) &&
    !applying &&
    !notesError &&
    (!previewRequiresBelowCostConfirmation || confirmBelowCost);

  const resolvedEmptyState = useMemo(() => {
    if (scope === "DIVISION" && !scopeDivisionId) {
      return {
        title: "Selecciona una division para cargar productos.",
        text: "La lista se actualizara automaticamente cuando el valor sea valido.",
      };
    }
    if (scope === "DEPARTMENT" && !scopeDepartmentId) {
      return {
        title: scopeDivisionId ? "Selecciona un departamento para cargar productos." : "Selecciona una division para continuar.",
        text: "La lista se actualizara automaticamente al completar el alcance.",
      };
    }
    if (scope === "CATEGORY" && !categoryId) {
      return {
        title: scopeDepartmentId ? "Selecciona una categoria para cargar productos." : "Completa division y departamento para continuar.",
        text: "La lista se actualizara automaticamente al elegir la categoria.",
      };
    }
    return {
      title:
        resolvedProducts.length === 0
          ? "Aun no hay productos agregados al ajuste."
          : "No hay productos cargados con esa busqueda.",
      text:
        resolvedProducts.length === 0
          ? "Selecciona productos en la seccion superior para comenzar."
          : "Ajusta la busqueda para ver productos seleccionados.",
    };
  }, [categoryId, resolvedProducts.length, scope, scopeDepartmentId, scopeDivisionId]);

  const resetPreviewState = () => {
    setPreview(null);
    setPreviewError(null);
    setApplyError(null);
    setNotes("");
    setConfirmBelowCost(false);
    setConfirmApplyOpen(false);
  };

  const cancelPendingResolve = () => {
    resolveRequestIdRef.current += 1;
    setResolveLoading(false);
  };

  const resetResolvedProducts = () => {
    cancelPendingResolve();
    setResolvedProducts([]);
    setSelectedProductIds(new Set());
    setProductSearch("");
    setResolveError(null);
    resetPreviewState();
  };

  const resetAdjustmentForm = () => {
    setScopeDivisionId("");
    setScopeDepartmentId("");
    setCategoryId("");
    setManualSelectedIds(new Set());
    setAvailableSearch("");
    setResolvedProducts([]);
    setSelectedProductIds(new Set());
    setProductSearch("");
    setOperation("PERCENT_INCREASE");
    setAdjustmentValue("");
    setValueError(null);
    resetPreviewState();
  };

  const loadAvailableProducts = useCallback(async () => {
    setAvailableLoading(true);
    setAvailableError(null);
    try {
      const products = await priceAdjustmentsApi.listActiveInventoryProducts();
      setAvailableProducts(products);
    } catch (error: unknown) {
      setAvailableError(getApiErrorMessage(error, "No se pudieron cargar los productos activos."));
    } finally {
      setAvailableLoading(false);
    }
  }, []);

  const loadCategories = useCallback(async (nextScope: PriceAdjustmentScope) => {
    if (!isCategoryScope(nextScope)) {
      setCategories([]);
      setCategoryError(null);
      setCategoriesLoading(false);
      return;
    }

    setCategoriesLoading(true);
    setCategoryError(null);
    try {
      const rows = await adminCategoryService.listFlat({
        active: true,
      });
      setCategories(rows);
    } catch (error: unknown) {
      setCategoryError(getApiErrorMessage(error, "No se pudieron cargar las categorias."));
      setCategories([]);
    } finally {
      setCategoriesLoading(false);
    }
  }, []);

  const loadHistory = useCallback(
    async (pageOverride?: number) => {
      setHistoryLoading(true);
      setHistoryError(null);
      try {
        const result = await priceAdjustmentsApi.getHistory({
          search: debouncedHistorySearch.trim() || undefined,
          from: historyFrom || undefined,
          to: historyTo || undefined,
          operation: historyOperation,
          scope: historyScope,
          userId: historyUserId ? Number(historyUserId) : undefined,
          page: pageOverride ?? historyPage,
          limit: historyLimit,
        });
        setHistory(result);
      } catch (error: unknown) {
        setHistoryError(getApiErrorMessage(error, "No se pudo cargar el historial de ajustes."));
      } finally {
        setHistoryLoading(false);
      }
    },
    [
      debouncedHistorySearch,
      historyFrom,
      historyLimit,
      historyOperation,
      historyPage,
      historyScope,
      historyTo,
      historyUserId,
    ]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedHistorySearch(historySearch), 300);
    return () => window.clearTimeout(timer);
  }, [historySearch]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedDetailSearch(detailSearch), 300);
    return () => window.clearTimeout(timer);
  }, [detailSearch]);

  useEffect(() => {
    void loadAvailableProducts();
  }, [loadAvailableProducts]);

  useEffect(() => {
    void loadCategories(scope);
  }, [loadCategories, scope]);

  useEffect(() => {
    api
      .get<EmployeesResponse>("/api/admin/employees", { params: { role: "ADMIN" } })
      .then((response) => setUserOptions(response.data.employees.filter((user) => user.active)))
      .catch(() => setUserOptions([]));
  }, []);

  useEffect(() => {
    if (activeTab === "history") {
      void loadHistory();
    }
  }, [activeTab, loadHistory]);

  useEffect(() => {
    if (activeTab === "history") {
      void loadHistory(1);
      setHistoryPage(1);
    }
  }, [
    debouncedHistorySearch,
    historyFrom,
    historyLimit,
    historyOperation,
    historyScope,
    historyTo,
    historyUserId,
    activeTab,
    loadHistory,
  ]);

  useEffect(() => {
    if (activeTab === "adjust") {
      void loadAvailableProducts();
    } else {
      void loadHistory();
    }
  }, [activeTab, loadAvailableProducts, loadHistory, refreshToken]);

  useEffect(() => {
    if (!detailOpen || detailId === null) return;
    setDetailLoading(true);
    setDetailError(null);
    priceAdjustmentsApi
      .getAdjustment(detailId)
      .then(setDetail)
      .catch((error: unknown) => setDetailError(getApiErrorMessage(error, "No se pudo cargar el detalle del ajuste.")))
      .finally(() => setDetailLoading(false));
  }, [detailOpen, detailId]);

  useEffect(() => {
    if (!detailOpen || detailId === null) return;
    setDetailProductsLoading(true);
    setDetailProductsError(null);
    priceAdjustmentsApi
      .getAdjustmentProducts(detailId, {
        search: debouncedDetailSearch.trim() || undefined,
        page: detailPage,
        limit: 10,
        onlyBelowCost: detailOnlyBelowCost,
      })
      .then(setDetailProducts)
      .catch((error: unknown) =>
        setDetailProductsError(getApiErrorMessage(error, "No se pudieron cargar los productos del ajuste."))
      )
      .finally(() => setDetailProductsLoading(false));
  }, [debouncedDetailSearch, detailId, detailOpen, detailOnlyBelowCost, detailPage]);

  useEffect(() => {
    removedProductToastGuardRef.current.forEach((productId) => {
      if (resolvedProducts.some((product) => product.id === productId)) {
        removedProductToastGuardRef.current.delete(productId);
      }
    });
  }, [resolvedProducts]);

  const changeScope = (nextScope: PriceAdjustmentScope) => {
    setScope(nextScope);
    setScopeDivisionId("");
    setScopeDepartmentId("");
    setCategoryId("");
    if (nextScope !== "SELECTED_PRODUCTS") {
      setManualSelectedIds(new Set());
      setAvailableSearch("");
      resetResolvedProducts();
    } else {
      cancelPendingResolve();
      setResolveError(null);
      resetPreviewState();
    }

    if (nextScope === "UNCATEGORIZED") {
      void resolveProductsWithPayload({ scope: "UNCATEGORIZED" });
    }
  };

  const changeScopeDivision = (nextDivisionId: string) => {
    setScopeDivisionId(nextDivisionId);
    setScopeDepartmentId("");
    setCategoryId(scope === "DIVISION" ? nextDivisionId : "");
    if (!nextDivisionId || scope !== "DIVISION") {
      resetResolvedProducts();
      return;
    }
    resetResolvedProducts();
    void resolveProductsWithPayload({ scope: "DIVISION", categoryId: Number(nextDivisionId) });
  };

  const changeScopeDepartment = (nextDepartmentId: string) => {
    setScopeDepartmentId(nextDepartmentId);
    setCategoryId(scope === "DEPARTMENT" ? nextDepartmentId : "");
    if (!nextDepartmentId || scope !== "DEPARTMENT") {
      resetResolvedProducts();
      return;
    }
    resetResolvedProducts();
    void resolveProductsWithPayload({ scope: "DEPARTMENT", categoryId: Number(nextDepartmentId) });
  };

  const changeScopeCategory = (nextCategoryId: string) => {
    setCategoryId(nextCategoryId);
    if (!nextCategoryId) {
      resetResolvedProducts();
      return;
    }
    resetResolvedProducts();
    void resolveProductsWithPayload({ scope: "CATEGORY", categoryId: Number(nextCategoryId) });
  };

  const toggleManualProduct = (productId: number) => {
    setManualSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  };

  const toggleResolvedProduct = (productId: number) => {
    setSelectedProductIds((current) => {
      const next = new Set(current);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
    resetPreviewState();
  };

  const removeResolvedProduct = (productToRemove: PriceAdjustmentProduct) => {
    if (removedProductToastGuardRef.current.has(productToRemove.id)) return;
    if (!resolvedProducts.some((product) => product.id === productToRemove.id)) return;

    removedProductToastGuardRef.current.add(productToRemove.id);
    setResolvedProducts((current) => current.filter((product) => product.id !== productToRemove.id));
    setSelectedProductIds((current) => {
      const next = new Set(current);
      next.delete(productToRemove.id);
      return next;
    });
    resetPreviewState();
    showToast(`"${productToRemove.name}" fue eliminado del ajuste.`, "success");
  };

  const toggleAllVisibleManual = () => {
    const ids = filteredAvailableProducts.map((product) => product.id);
    setManualSelectedIds((current) => {
      const next = new Set(current);
      const allSelected = ids.length > 0 && ids.every((id) => next.has(id));
      ids.forEach((id) => {
        if (allSelected) next.delete(id);
        else next.add(id);
      });
      return next;
    });
  };

  const selectAllResolved = () => {
    setSelectedProductIds(new Set(resolvedProducts.map((product) => product.id)));
    resetPreviewState();
  };

  const clearResolvedSelection = () => {
    setSelectedProductIds(new Set());
    resetPreviewState();
  };

  const toggleAllVisibleResolved = () => {
    const ids = filteredResolvedProducts.map((product) => product.id);
    setSelectedProductIds((current) => {
      const next = new Set(current);
      const allSelected = ids.length > 0 && ids.every((id) => next.has(id));
      ids.forEach((id) => {
        if (allSelected) next.delete(id);
        else next.add(id);
      });
      return next;
    });
    resetPreviewState();
  };

  const resolveProductsWithPayload = async (
    payload: ResolveProductsPayload,
    options: { successMessage?: string } = {}
  ) => {
    const requestId = resolveRequestIdRef.current + 1;
    resolveRequestIdRef.current = requestId;
    setResolveLoading(true);
    setResolveError(null);
    resetPreviewState();
    try {
      const result = await priceAdjustmentsApi.resolveProducts(payload);
      if (requestId !== resolveRequestIdRef.current) return;
      setResolvedProducts(result.products);
      setSelectedProductIds(new Set(result.products.map((product) => product.id)));
      setProductSearch("");
      if (result.products.length === 0) {
        setResolveError("No se encontraron productos activos para el alcance seleccionado.");
      } else if (options.successMessage) {
        showToast(options.successMessage, "success");
      }
    } catch (error: unknown) {
      if (requestId !== resolveRequestIdRef.current) return;
      setResolvedProducts([]);
      setSelectedProductIds(new Set());
      setResolveError(getApiErrorMessage(error, "No se pudieron resolver los productos."));
    } finally {
      if (requestId === resolveRequestIdRef.current) {
        setResolveLoading(false);
      }
    }
  };

  const addSelectedToAdjustment = async () => {
    if (manualSelectedArray.length === 0) return;
    await resolveProductsWithPayload(
      {
        scope: "SELECTED_PRODUCTS",
        productIds: manualSelectedArray,
      },
      { successMessage: "Productos agregados al ajuste correctamente." }
    );
  };

  const changeAdjustmentValue = (value: string) => {
    if (!VALUE_INPUT_REGEX.test(value)) return;
    setAdjustmentValue(value);
    setValueError(getValueError(operation, value));
    resetPreviewState();
  };

  const changeOperation = (nextOperation: PriceAdjustmentOperation) => {
    setOperation(nextOperation);
    setValueError(getValueError(nextOperation, adjustmentValue));
    resetPreviewState();
  };

  const generatePreview = async () => {
    const error = getValueError(operation, adjustmentValue);
    if (error) {
      setValueError(error);
      return;
    }
    if (selectedProductIdArray.length === 0) {
      setPreviewError("Selecciona al menos un producto para generar la vista previa.");
      return;
    }

    setPreviewLoading(true);
    setPreviewError(null);
    setApplyError(null);
    try {
      const result = await priceAdjustmentsApi.preview({
        operation,
        value: Number(adjustmentValue),
        productIds: selectedProductIdArray,
      });
      setPreview(result);
      setConfirmBelowCost(false);
      setNotes("");
    } catch (error: unknown) {
      setPreview(null);
      setPreviewError(getApiErrorMessage(error, "No se pudo generar la vista previa."));
    } finally {
      setPreviewLoading(false);
    }
  };

  const openApplyConfirm = () => {
    if (!canApplyPreview) {
      setApplyError(notesError || "Confirma los requisitos antes de aplicar el ajuste.");
      return;
    }
    setApplyError(null);
    setConfirmApplyOpen(true);
  };

  const applyAdjustment = async () => {
    if (!preview || applying) return;
    const payload: ApplyPriceAdjustmentPayload = {
      scope,
      categoryId: isCategoryScope(scope) ? Number(categoryId) : undefined,
      operation,
      value: Number(adjustmentValue),
      productIds: selectedProductIdArray,
      notes: notes.trim() || undefined,
      confirmBelowCost,
    };

    setApplying(true);
    setApplyError(null);
    try {
      const result = await priceAdjustmentsApi.apply(payload);
      showToast(`Ajuste #${result.id} aplicado correctamente.`, "success");
      resetAdjustmentForm();
      setActiveTab("history");
      setHistoryPage(1);
      await loadHistory(1);
    } catch (error: unknown) {
      setApplyError(getApiErrorMessage(error, "No se pudo aplicar el ajuste de precios."));
    } finally {
      setApplying(false);
      setConfirmApplyOpen(false);
    }
  };

  const openDetail = (adjustmentId: number) => {
    setDetailId(adjustmentId);
    setDetail(null);
    setDetailProducts(null);
    setDetailSearch("");
    setDebouncedDetailSearch("");
    setDetailOnlyBelowCost(false);
    setDetailPage(1);
    setDetailError(null);
    setDetailProductsError(null);
    setDetailOpen(true);
  };

  const closeDetail = () => {
    setDetailOpen(false);
    setDetailId(null);
    setDetail(null);
    setDetailProducts(null);
  };

  const renderManualProductPicker = () => {
    if (scope !== "SELECTED_PRODUCTS") return null;

    return (
      <div style={styles.manualPickerSection}>
        <div style={styles.manualPickerHeader}>
          <div>
            <h3 style={styles.subsectionTitle}>Productos activos disponibles</h3>
            <p style={styles.helpText}>Busca y selecciona productos para agregarlos al ajuste.</p>
          </div>
        </div>
        <div style={styles.manualPickerToolbar}>
          <SearchInput value={availableSearch} onChange={setAvailableSearch} placeholder="Buscar SKU, codigo o producto" />
          <button type="button" style={ui.ghostBtn} onClick={toggleAllVisibleManual} disabled={availableLoading}>
            {allVisibleAvailableSelected ? "Limpiar visibles" : "Seleccionar visibles"}
          </button>
          <button type="button" style={ui.ghostBtn} onClick={() => setManualSelectedIds(new Set())} disabled={availableLoading}>
            Limpiar seleccion
          </button>
          <button
            type="button"
            style={{
              ...ui.primaryBtn,
              opacity: manualSelectedIds.size === 0 || resolveLoading ? 0.6 : 1,
              cursor: manualSelectedIds.size === 0 || resolveLoading ? "not-allowed" : "pointer",
            }}
            onClick={addSelectedToAdjustment}
            disabled={manualSelectedIds.size === 0 || resolveLoading}
          >
            {resolveLoading ? <Loader2 size={16} /> : <Search size={16} />}
            Agregar seleccionados al ajuste
          </button>
          <span style={styles.manualPickerCounter}>
            {manualSelectedIds.size} seleccionado{manualSelectedIds.size === 1 ? "" : "s"}
          </span>
        </div>

        <div style={styles.adjustTableWrap}>
          <table style={styles.availableProductsTable}>
            <colgroup>
              <col style={styles.availableSelectColumn} />
              <col style={styles.availableSkuColumn} />
              <col style={styles.availableProductColumn} />
              <col style={styles.availableCostColumn} />
              <col style={styles.availablePriceColumn} />
              <col style={styles.availableCategoryColumn} />
            </colgroup>
            <thead>
              <tr style={ui.theadRow}>
                <th style={styles.compactCheckboxHeaderCell}>
                  <input
                    type="checkbox"
                    checked={allVisibleAvailableSelected}
                    onChange={toggleAllVisibleManual}
                    disabled={availableLoading || filteredAvailableProducts.length === 0}
                    style={styles.checkbox}
                  />
                </th>
                <th style={styles.compactTh}>SKU</th>
                <th style={styles.compactTh}>Producto</th>
                <th style={{ ...styles.compactTh, textAlign: "right" }}>Costo</th>
                <th style={{ ...styles.compactTh, textAlign: "right" }}>Precio actual</th>
                <th style={styles.compactTh}>Categorias</th>
              </tr>
            </thead>
            <tbody>
              <TableState
                colSpan={6}
                loading={availableLoading}
                error={availableError}
                empty={!availableLoading && filteredAvailableProducts.length === 0}
                emptyText={availableSearch.trim() ? "No hay productos con esa busqueda." : "No hay productos activos disponibles."}
              />
              {!availableLoading &&
                !availableError &&
                filteredAvailableProducts.map((product) => (
                  <tr key={product.id} style={styles.compactTableRow}>
                    <td style={styles.compactCheckboxCell}>
                      <input
                        type="checkbox"
                        checked={manualSelectedIds.has(product.id)}
                        onChange={() => toggleManualProduct(product.id)}
                        style={styles.checkbox}
                      />
                    </td>
                    <td style={styles.compactCodeCell}>{product.sku}</td>
                    <td style={styles.compactProductCell}>
                      {product.name}
                      {product.barcode && <div style={styles.compactProductMeta}>{product.barcode}</div>}
                    </td>
                    <td style={{ ...styles.compactMoneyCell, fontWeight: 700 }}>{moneyExact(Number(product.costPrice))}</td>
                    <td style={{ ...styles.compactMoneyCell, fontWeight: 800, color: "var(--text)" }}>
                      {moneyExact(Number(product.sellPrice))}
                    </td>
                    <td style={styles.compactCategoryCell}>{buildCategoryText(product)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderCategoryScopeOptions = () => {
    if (!isCategoryScope(scope)) return null;

    return (
      <div style={styles.scopeOptionControls}>
        <div style={{ ...styles.scopeOptionField, ...(filtersStacked ? styles.scopeOptionFieldFull : {}) }}>
          <label style={ui.fieldLabel}>Division</label>
          <select
            style={styles.scopeSelectInput}
            value={scopeDivisionId}
            onChange={(event) => changeScopeDivision(event.target.value)}
            disabled={categoriesLoading}
          >
            <option value="">{categoriesLoading ? "Cargando divisiones..." : "Selecciona una division"}</option>
            {scopeDivisionOptions.map((division) => {
              const label = formatCategoryOptionLabel(division);
              return (
                <option key={division.id} value={division.id} title={label}>
                  {label}
                </option>
              );
            })}
          </select>
        </div>

        {(scope === "DEPARTMENT" || scope === "CATEGORY") && (
          <div style={{ ...styles.scopeOptionField, ...(filtersStacked ? styles.scopeOptionFieldFull : {}) }}>
            <label style={ui.fieldLabel}>Departamento</label>
            <select
              style={styles.scopeSelectInput}
              value={scopeDepartmentId}
              onChange={(event) => changeScopeDepartment(event.target.value)}
              disabled={categoriesLoading || !scopeDivisionId}
            >
              <option value="">
                {!scopeDivisionId
                  ? "Selecciona una division primero"
                  : categoriesLoading
                    ? "Cargando departamentos..."
                    : "Selecciona un departamento"}
              </option>
              {scopeDepartmentOptions.map((department) => {
                const label = formatCategoryOptionLabel(department);
                return (
                  <option key={department.id} value={department.id} title={label}>
                    {label}
                  </option>
                );
              })}
            </select>
          </div>
        )}

        {scope === "CATEGORY" && (
          <div style={{ ...styles.scopeOptionField, ...(filtersStacked ? styles.scopeOptionFieldFull : {}) }}>
            <label style={ui.fieldLabel}>Categoria</label>
            <select
              style={styles.scopeSelectInput}
              value={categoryId}
              onChange={(event) => changeScopeCategory(event.target.value)}
              disabled={categoriesLoading || !scopeDepartmentId}
            >
              <option value="">
                {!scopeDepartmentId
                  ? "Selecciona un departamento primero"
                  : categoriesLoading
                    ? "Cargando categorias..."
                    : "Selecciona una categoria"}
              </option>
              {scopeCategoryOptions.map((category) => {
                const label = formatCategoryOptionLabel(category);
                return (
                  <option key={category.id} value={category.id} title={label}>
                    {label}
                  </option>
                );
              })}
            </select>
          </div>
        )}

        {selectedScopeCategory && <p style={styles.scopeSelectionHint}>Codigo: {selectedScopeCategory.code}</p>}
        {resolveLoading && <p style={styles.scopeLoadingText}>Cargando productos...</p>}
        {categoryError && <p style={{ ...styles.scopeSelectionHint, ...styles.fieldError }}>{categoryError}</p>}
      </div>
    );
  };

  const renderScopeOptions = () => (
    <div style={styles.scopeOptions}>
      {scope === "SELECTED_PRODUCTS" && renderManualProductPicker()}
      {renderCategoryScopeOptions()}
      {scope === "UNCATEGORIZED" && (
        <div style={styles.scopeUncategorizedOptions}>
          <InlineAlert tone="info">Se buscaran productos activos sin registros en categorias.</InlineAlert>
          {resolveLoading && <p style={styles.scopeLoadingText}>Cargando productos...</p>}
        </div>
      )}
    </div>
  );

  const renderResolvedProductsTable = () => (
    <div style={styles.panel}>
      <div style={styles.groupedSectionHeader}>
        <div>
          <h3 style={styles.subsectionTitle}>Productos del ajuste</h3>
          <p style={styles.helpText}>Estos son los productos que recibirán el cambio de precio.</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={styles.counterPill}>
            {selectedProductIds.size} productos seleccionados de {resolvedProducts.length}
          </span>
          <div style={styles.inlineActions}>
            <button type="button" style={ui.ghostBtn} onClick={selectAllResolved} disabled={resolvedProducts.length === 0}>
              Seleccionar todos
            </button>
            <button type="button" style={ui.ghostBtn} onClick={clearResolvedSelection} disabled={resolvedProducts.length === 0}>
              Limpiar seleccion
            </button>
          </div>
        </div>
      </div>
      <Toolbar>
        <SearchInput value={productSearch} onChange={setProductSearch} placeholder="Buscar en productos cargados" />
      </Toolbar>
      <div style={styles.adjustTableWrap}>
        <table style={styles.selectedProductsTable}>
          <colgroup>
            <col style={styles.selectedSelectColumn} />
            <col style={styles.selectedSkuColumn} />
            <col style={styles.selectedBarcodeColumn} />
            <col style={styles.selectedProductColumn} />
            <col style={styles.selectedCostColumn} />
            <col style={styles.selectedPriceColumn} />
            <col style={styles.selectedCategoryColumn} />
            <col style={styles.selectedStatusColumn} />
            <col style={styles.selectedActionsColumn} />
          </colgroup>
          <thead>
            <tr style={ui.theadRow}>
              <th style={styles.compactCheckboxHeaderCell}>
                <input
                  type="checkbox"
                  checked={allVisibleResolvedSelected}
                  onChange={toggleAllVisibleResolved}
                  disabled={filteredResolvedProducts.length === 0}
                  style={styles.checkbox}
                />
              </th>
              <th style={styles.compactTh}>SKU</th>
              <th style={styles.compactTh}>Codigo de barras</th>
              <th style={styles.compactTh}>Producto</th>
              <th style={{ ...styles.compactTh, textAlign: "right" }}>Costo</th>
              <th style={{ ...styles.compactTh, textAlign: "right" }}>Precio actual</th>
              <th style={styles.compactTh}>Categorias</th>
              <th style={{ ...styles.compactTh, textAlign: "center" }}>Estado</th>
              <th style={{ ...styles.compactTh, textAlign: "center" }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            <TableState
              colSpan={9}
              loading={resolveLoading}
              error={resolveError}
              empty={false}
            />
            {!resolveLoading && !resolveError && filteredResolvedProducts.length === 0 && (
              <tr>
                <td colSpan={9} style={styles.compactEmptyCell}>
                  <strong style={styles.compactEmptyTitle}>{resolvedEmptyState.title}</strong>
                  <div style={styles.compactEmptyText}>{resolvedEmptyState.text}</div>
                </td>
              </tr>
            )}
            {!resolveLoading &&
              filteredResolvedProducts.map((product) => (
                <tr
                  key={product.id}
                  style={selectedProductIds.has(product.id) ? { ...styles.compactTableRow, ...styles.selectedRow } : styles.compactTableRow}
                >
                  <td style={styles.compactCheckboxCell}>
                    <input
                      type="checkbox"
                      checked={selectedProductIds.has(product.id)}
                      onChange={() => toggleResolvedProduct(product.id)}
                      style={styles.checkbox}
                    />
                  </td>
                  <td style={styles.compactCodeCell}>{product.sku}</td>
                  <td style={styles.compactBarcodeCell}>{product.barcode || "-"}</td>
                  <td style={styles.compactProductCell}>{product.name}</td>
                  <td style={{ ...styles.compactMoneyCell, fontWeight: 700 }}>{moneyExact(Number(product.costPrice))}</td>
                  <td style={{ ...styles.compactMoneyCell, fontWeight: 800, color: "var(--text)" }}>
                    {moneyExact(Number(product.sellPrice))}
                  </td>
                  <td style={styles.compactCategoryCell}>{buildCategoryText(product)}</td>
                  <td style={styles.compactStatusCell}>
                    <Badge tone={product.active ? "green" : "red"}>{product.active ? "Activo" : "Inactivo"}</Badge>
                  </td>
                  <td style={styles.compactActionCell}>
                    <button
                      type="button"
                      style={ui.linkBtn}
                      onClick={() => removeResolvedProduct(product)}
                    >
                      <X size={14} style={{ verticalAlign: "-2px", color: "#b91c1c" }} />
                      <span style={{ color: "#b91c1c", marginLeft: 4 }}>Quitar</span>
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderPreviewTable = () => {
    if (!preview) return null;

    return (
      <div style={styles.previewBlock}>
        <div style={ui.kpiGrid}>
          <Kpi label="Productos afectados" value={preview.affectedCount} icon={<PackageSearch size={17} />} />
          <Kpi label="Debajo del costo" value={preview.belowCostCount} icon={<AlertTriangle size={17} />} />
          <Kpi label="Requiere motivo" value={preview.requiresReason ? "Si" : "No"} icon={<Tags size={17} />} />
          <Kpi
            label="Confirmacion bajo costo"
            value={preview.requiresBelowCostConfirmation ? "Si" : "No"}
            icon={<CheckCircle2 size={17} />}
          />
        </div>

        {preview.requiresBelowCostConfirmation && (
          <InlineAlert tone="error">Hay productos que quedaran por debajo de su costo. Se requiere confirmacion explicita.</InlineAlert>
        )}
        {preview.requiresReason && (
          <InlineAlert tone="warning">Este ajuste requiere un motivo antes de aplicarse.</InlineAlert>
        )}

        <div style={{ ...ui.tableWrap, maxHeight: 390, overflowY: "auto", marginTop: 16 }}>
          <table style={{ ...ui.table, minWidth: 980 }}>
            <thead>
              <tr style={ui.theadRow}>
                <th style={ui.th}>SKU</th>
                <th style={ui.th}>Producto</th>
                <th style={{ ...ui.th, textAlign: "right" }}>Costo</th>
                <th style={{ ...ui.th, textAlign: "right" }}>Precio actual</th>
                <th style={{ ...ui.th, textAlign: "right" }}>Precio nuevo</th>
                <th style={{ ...ui.th, textAlign: "right" }}>Diferencia</th>
                <th style={{ ...ui.th, textAlign: "right" }}>Descuento %</th>
                <th style={{ ...ui.th, textAlign: "center" }}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {preview.products.map((product) => {
                const difference = getDifference(product);
                const highDiscount = product.discountPercentage >= 50;
                return (
                  <tr key={product.id}>
                    <td style={styles.codeCell}>{product.sku}</td>
                    <td style={{ ...ui.td, whiteSpace: "normal", color: "var(--text)", fontWeight: 700 }}>{product.name}</td>
                    <td style={{ ...ui.td, textAlign: "right" }}>{moneyExact(Number(product.costPrice))}</td>
                    <td style={{ ...ui.td, textAlign: "right" }}>{moneyExact(Number(product.currentSellPrice))}</td>
                    <td style={{ ...ui.td, textAlign: "right", color: "var(--text)", fontWeight: 800 }}>
                      {moneyExact(Number(product.newSellPrice))}
                    </td>
                    <td
                      style={{
                        ...ui.td,
                        textAlign: "right",
                        color: difference > 0 ? "#15803d" : difference < 0 ? "#b91c1c" : "var(--text-muted)",
                        fontWeight: 800,
                      }}
                    >
                      <span style={styles.priceTrend}>
                        {difference > 0 && <ArrowUp size={14} />}
                        {difference < 0 && <ArrowDown size={14} />}
                        {moneyExact(Math.abs(difference))}
                      </span>
                    </td>
                    <td style={{ ...ui.td, textAlign: "right", fontWeight: highDiscount ? 800 : 600 }}>
                      {product.discountPercentage.toLocaleString("es-MX", { maximumFractionDigits: 2 })}%
                    </td>
                    <td style={{ ...ui.td, textAlign: "center" }}>
                      <div style={styles.badgeStack}>
                        {product.isBelowCost && <Badge tone="red">Debajo del costo</Badge>}
                        {highDiscount && <Badge tone="amber">Descuento alto</Badge>}
                        {!product.isBelowCost && !highDiscount && (
                          <Badge tone={difference > 0 ? "green" : difference < 0 ? "blue" : "slate"}>
                            {difference > 0 ? "Aumento" : difference < 0 ? "Descuento" : "Sin cambio"}
                          </Badge>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div style={styles.confirmationGrid}>
          {preview.requiresReason && (
            <div>
              <label style={ui.fieldLabel}>Motivo del ajuste *</label>
              <textarea
                style={{ ...ui.input, minHeight: 84, resize: "vertical" }}
                value={notes}
                onChange={(event) => {
                  setNotes(event.target.value);
                  setApplyError(null);
                }}
                maxLength={500}
                placeholder="Describe el motivo del ajuste"
              />
              {notesError && <p style={styles.fieldError}>{notesError}</p>}
            </div>
          )}

          {preview.requiresBelowCostConfirmation && (
            <label style={styles.checkRow}>
              <input
                type="checkbox"
                checked={confirmBelowCost}
                onChange={(event) => {
                  setConfirmBelowCost(event.target.checked);
                  setApplyError(null);
                }}
                style={styles.checkbox}
              />
              <span>Entiendo que algunos productos quedaran por debajo de su costo.</span>
            </label>
          )}
        </div>

        {applyError && <InlineAlert tone="error">{applyError}</InlineAlert>}
        <div style={styles.footerActions}>
          <button type="button" style={ui.ghostBtn} onClick={resetPreviewState} disabled={applying}>
            Descartar vista previa
          </button>
          <button
            type="button"
            style={{ ...ui.primaryBtn, opacity: canApplyPreview ? 1 : 0.55, cursor: canApplyPreview ? "pointer" : "not-allowed" }}
            onClick={openApplyConfirm}
            disabled={!canApplyPreview}
          >
            {applying ? <Loader2 size={16} /> : <DollarSign size={16} />}
            Aplicar ajuste de precios
          </button>
        </div>
      </div>
    );
  };

  const renderAdjustTab = () => (
    <div style={styles.adjustStack}>
      <div style={styles.panel}>
        <div style={styles.scopeSection}>
          <div style={{ ...styles.scopeSelectField, ...(filtersStacked ? styles.scopeSelectFieldFull : {}) }}>
            <label style={ui.fieldLabel}>Alcance</label>
            <select style={ui.input} value={scope} onChange={(event) => changeScope(event.target.value as PriceAdjustmentScope)}>
              {scopeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          {renderScopeOptions()}
        </div>
      </div>

      {renderResolvedProductsTable()}

      <div style={styles.panel}>
        <div style={styles.groupedSectionHeader}>
          <div>
            <h3 style={styles.subsectionTitle}>Configurar ajuste</h3>
            <p style={styles.helpText}>La vista previa recalcula precios desde el backend antes de aplicar cambios.</p>
          </div>
          <span style={styles.counterPill}>
            {selectedProductIds.size} producto{selectedProductIds.size === 1 ? "" : "s"}
          </span>
        </div>
        <div
          style={{
            ...styles.adjustFormGrid,
            gridTemplateColumns: filtersStacked
              ? "1fr"
              : filtersTwoColumn
                ? "minmax(220px, 1fr) minmax(220px, 1fr)"
                : "minmax(240px, 1fr) minmax(240px, 1fr) max-content",
          }}
        >
          <div>
            <label style={ui.fieldLabel}>Operacion</label>
            <select style={ui.input} value={operation} onChange={(event) => changeOperation(event.target.value as PriceAdjustmentOperation)}>
              {operationOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={ui.fieldLabel}>Valor</label>
            <div style={styles.valueInputWrap}>
              <span style={styles.valuePrefix}>
                {operation === "PERCENT_INCREASE" || operation === "PERCENT_DECREASE" ? <Percent size={15} /> : <DollarSign size={15} />}
              </span>
              <input
                style={{ ...ui.input, paddingLeft: 42 }}
                value={adjustmentValue}
                onChange={(event) => changeAdjustmentValue(event.target.value)}
                inputMode="decimal"
                placeholder={operation === "PERCENT_INCREASE" || operation === "PERCENT_DECREASE" ? "10" : "25.00"}
              />
            </div>
            {valueError && <p style={styles.fieldError}>{valueError}</p>}
          </div>
          <div style={styles.formActionCell}>
            <button
              type="button"
              style={{
                ...ui.primaryBtn,
                justifyContent: "center",
                minWidth: 190,
                opacity: selectedProductIds.size === 0 || previewLoading ? 0.6 : 1,
              }}
              onClick={generatePreview}
              disabled={selectedProductIds.size === 0 || previewLoading}
            >
              {previewLoading ? <Loader2 size={16} /> : <Eye size={16} />}
              Generar vista previa
            </button>
          </div>
        </div>
        {previewError && <InlineAlert tone="error">{previewError}</InlineAlert>}
        {renderPreviewTable()}
      </div>
    </div>
  );

  const renderHistoryTab = () => (
    <div style={styles.stack}>
      <Toolbar>
        <SearchInput value={historySearch} onChange={setHistorySearch} placeholder="Buscar por motivo, usuario o categoria" />
        <input style={styles.dateInput} type="date" value={historyFrom} onChange={(event) => setHistoryFrom(event.target.value)} />
        <input style={styles.dateInput} type="date" value={historyTo} onChange={(event) => setHistoryTo(event.target.value)} />
        <FilterSelect
          value={historyOperation}
          onChange={(value) => setHistoryOperation(value as PriceAdjustmentOperation | "")}
          options={operationFilterOptions}
        />
        <FilterSelect
          value={historyScope}
          onChange={(value) => setHistoryScope(value as PriceAdjustmentScope | "")}
          options={scopeFilterOptions}
        />
        {userOptions.length > 0 && (
          <FilterSelect
            value={historyUserId}
            onChange={setHistoryUserId}
            options={[
              { value: "", label: "Todos los usuarios" },
              ...userOptions.map((user) => ({ value: String(user.id), label: user.name })),
            ]}
          />
        )}
      </Toolbar>

      <div style={{ ...ui.tableWrap, maxHeight: "64vh", overflowY: "auto" }}>
        <table style={{ ...ui.table, minWidth: 1080 }}>
          <thead>
            <tr style={ui.theadRow}>
              <th style={ui.th}>Fecha</th>
              <th style={ui.th}>Usuario</th>
              <th style={ui.th}>Alcance</th>
              <th style={ui.th}>Categoria</th>
              <th style={ui.th}>Tipo de ajuste</th>
              <th style={{ ...ui.th, textAlign: "right" }}>Valor</th>
              <th style={{ ...ui.th, textAlign: "right" }}>Productos</th>
              <th style={{ ...ui.th, textAlign: "right" }}>Debajo costo</th>
              <th style={ui.th}>Motivo</th>
              <th style={{ ...ui.th, textAlign: "center" }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            <TableState
              colSpan={10}
              loading={historyLoading}
              error={historyError}
              empty={!historyLoading && (history?.adjustments.length ?? 0) === 0}
              emptyText="No hay ajustes de precios con los filtros seleccionados."
            />
            {!historyLoading &&
              !historyError &&
              history?.adjustments.map((adjustment) => (
                <tr key={adjustment.id}>
                  <td style={ui.td}>{fmtDateTime(adjustment.appliedAt)}</td>
                  <td style={{ ...ui.td, whiteSpace: "normal" }}>
                    <strong style={{ color: "var(--text)" }}>{adjustment.appliedBy.name}</strong>
                    <div style={styles.mutedSmall}>{adjustment.appliedBy.email}</div>
                  </td>
                  <td style={ui.td}>{scopeLabel(adjustment.scope)}</td>
                  <td style={{ ...ui.td, whiteSpace: "normal" }}>
                    {adjustment.category ? `${adjustment.category.code} ${adjustment.category.name}` : "-"}
                  </td>
                  <td style={ui.td}>{adjustmentTypeLabel(adjustment.type, adjustment.direction)}</td>
                  <td style={{ ...ui.td, textAlign: "right", fontWeight: 800 }}>{formatStoredAdjustmentValue(adjustment.type, adjustment.value)}</td>
                  <td style={{ ...ui.td, textAlign: "right", fontWeight: 800 }}>{adjustment.affectedRows}</td>
                  <td style={{ ...ui.td, textAlign: "right" }}>
                    <Badge tone={adjustment.belowCostCount > 0 ? "red" : "green"}>{adjustment.belowCostCount}</Badge>
                  </td>
                  <td style={{ ...ui.td, whiteSpace: "normal", maxWidth: 230 }}>{adjustment.notes || "-"}</td>
                  <td style={{ ...ui.td, textAlign: "center" }}>
                    <button type="button" style={ui.linkBtn} onClick={() => openDetail(adjustment.id)}>
                      <Eye size={14} style={{ verticalAlign: "-2px" }} /> Ver detalle
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <div style={styles.pagination}>
        <span style={styles.mutedText}>
          {history ? `${history.total} ajuste${history.total === 1 ? "" : "s"} · pagina ${history.page} de ${Math.max(history.totalPages, 1)}` : "Sin datos"}
        </span>
        <div style={styles.inlineActions}>
          <select style={ui.filterSelect} value={historyLimit} onChange={(event) => setHistoryLimit(Number(event.target.value))}>
            {[10, 20, 50].map((limit) => (
              <option key={limit} value={limit}>
                {limit} por pagina
              </option>
            ))}
          </select>
          <button
            type="button"
            style={ui.ghostBtn}
            onClick={() => setHistoryPage((page) => Math.max(page - 1, 1))}
            disabled={historyLoading || historyPage <= 1}
          >
            Anterior
          </button>
          <button
            type="button"
            style={ui.ghostBtn}
            onClick={() => setHistoryPage((page) => page + 1)}
            disabled={historyLoading || Boolean(history && historyPage >= history.totalPages)}
          >
            Siguiente
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div>
      <SectionHeader
        title="Ajustes masivos de precios"
        subtitle="Actualiza precios de venta por producto, categoria o alcance completo con vista previa antes de aplicar"
      />

      <div style={styles.tabs} role="tablist" aria-label="Ajustes masivos de precios">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "adjust"}
          style={{ ...styles.tabButton, ...(activeTab === "adjust" ? styles.tabButtonActive : {}) }}
          onClick={() => setActiveTab("adjust")}
        >
          <DollarSign size={16} /> Ajustar precios
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "history"}
          style={{ ...styles.tabButton, ...(activeTab === "history" ? styles.tabButtonActive : {}) }}
          onClick={() => setActiveTab("history")}
        >
          <History size={16} /> Historial
        </button>
      </div>

      {activeTab === "adjust" ? renderAdjustTab() : renderHistoryTab()}

      {confirmApplyOpen && preview && (
        <div style={ui.overlay} onClick={() => !applying && setConfirmApplyOpen(false)}>
          <div style={{ ...ui.modal, maxWidth: 560 }} onClick={(event) => event.stopPropagation()}>
            <div style={ui.modalHeader}>
              <span style={ui.modalTitle}>Confirmar ajuste de precios</span>
              <button type="button" style={ui.linkBtn} onClick={() => setConfirmApplyOpen(false)} disabled={applying}>
                <X size={18} />
              </button>
            </div>
            <div style={ui.modalBody}>
              <div style={styles.confirmSummary}>
                <div><strong>Cantidad de productos:</strong> {selectedProductIds.size}</div>
                <div><strong>Tipo de ajuste:</strong> {operationLabel(operation)}</div>
                <div><strong>Valor aplicado:</strong> {formatAdjustmentValue(operation, Number(adjustmentValue))}</div>
                <div><strong>Debajo de costo:</strong> {preview.belowCostCount}</div>
                <div><strong>Motivo:</strong> {notes.trim() || "Sin motivo capturado"}</div>
              </div>
              <InlineAlert tone="warning">Esta accion actualizara Product.sellPrice y guardara historial. No modifica costos.</InlineAlert>
              <div style={styles.footerActions}>
                <button type="button" style={ui.ghostBtn} onClick={() => setConfirmApplyOpen(false)} disabled={applying}>
                  Cancelar
                </button>
                <button type="button" style={{ ...ui.primaryBtn, opacity: applying ? 0.7 : 1 }} onClick={applyAdjustment} disabled={applying}>
                  {applying ? "Aplicando..." : "Si, aplicar ajuste"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {detailOpen && (
        <div style={ui.overlay} onClick={closeDetail}>
          <div
            style={{ ...ui.modal, maxWidth: isMobile ? "100%" : 980, width: "100%" }}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={ui.modalHeader}>
              <span style={ui.modalTitle}>Detalle de ajuste</span>
              <button type="button" style={ui.linkBtn} onClick={closeDetail}>
                <X size={18} />
              </button>
            </div>
            <div style={ui.modalBody}>
              {detailLoading && <div style={styles.loadingBlock}>Cargando detalle...</div>}
              {detailError && <InlineAlert tone="error">{detailError}</InlineAlert>}
              {!detailLoading && detail && (
                <div style={styles.detailGrid}>
                  <Kpi label="Usuario" value={detail.appliedBy.name} icon={<CheckCircle2 size={17} />} />
                  <Kpi label="Fecha" value={fmtDateTime(detail.appliedAt)} icon={<History size={17} />} />
                  <Kpi label="Alcance" value={scopeLabel(detail.scope)} icon={<PackageSearch size={17} />} />
                  <Kpi label="Debajo costo" value={detail.belowCostCount} icon={<AlertTriangle size={17} />} />
                  <div style={styles.detailWide}>
                    <div style={styles.metaGrid}>
                      <div><strong>Categoria:</strong> {detail.category ? `${detail.category.code} ${detail.category.name}` : "-"}</div>
                      <div><strong>Tipo:</strong> {detail.type}</div>
                      <div><strong>Direccion:</strong> {detail.direction}</div>
                      <div><strong>Valor:</strong> {formatStoredAdjustmentValue(detail.type, detail.value)}</div>
                      <div><strong>Productos afectados:</strong> {detail.affectedRows}</div>
                      <div><strong>Motivo:</strong> {detail.notes || "-"}</div>
                    </div>
                  </div>
                </div>
              )}

              <Toolbar>
                <SearchInput value={detailSearch} onChange={(value) => { setDetailSearch(value); setDetailPage(1); }} placeholder="Buscar producto en este ajuste" />
                <label style={styles.checkRow}>
                  <input
                    type="checkbox"
                    checked={detailOnlyBelowCost}
                    onChange={(event) => {
                      setDetailOnlyBelowCost(event.target.checked);
                      setDetailPage(1);
                    }}
                    style={styles.checkbox}
                  />
                  <span>Solo productos debajo del costo</span>
                </label>
              </Toolbar>

              <div style={{ ...ui.tableWrap, maxHeight: 360, overflowY: "auto" }}>
                <table style={{ ...ui.table, minWidth: 760 }}>
                  <thead>
                    <tr style={ui.theadRow}>
                      <th style={ui.th}>SKU</th>
                      <th style={ui.th}>Producto</th>
                      <th style={{ ...ui.th, textAlign: "right" }}>Precio anterior</th>
                      <th style={{ ...ui.th, textAlign: "right" }}>Precio nuevo</th>
                      <th style={{ ...ui.th, textAlign: "right" }}>Costo al cambio</th>
                      <th style={{ ...ui.th, textAlign: "center" }}>Debajo costo</th>
                    </tr>
                  </thead>
                  <tbody>
                    <TableState
                      colSpan={6}
                      loading={detailProductsLoading}
                      error={detailProductsError}
                      empty={!detailProductsLoading && (detailProducts?.products.length ?? 0) === 0}
                      emptyText="No hay productos para estos filtros."
                    />
                    {!detailProductsLoading &&
                      !detailProductsError &&
                      detailProducts?.products.map((row) => (
                        <tr key={row.id}>
                          <td style={styles.codeCell}>{row.producto.sku}</td>
                          <td style={{ ...ui.td, whiteSpace: "normal", color: "var(--text)", fontWeight: 700 }}>
                            {row.producto.name}
                          </td>
                          <td style={{ ...ui.td, textAlign: "right" }}>{moneyExact(Number(row.oldSellPrice))}</td>
                          <td style={{ ...ui.td, textAlign: "right", fontWeight: 800 }}>{moneyExact(Number(row.newSellPrice))}</td>
                          <td style={{ ...ui.td, textAlign: "right" }}>{moneyExact(Number(row.costPriceAtChange))}</td>
                          <td style={{ ...ui.td, textAlign: "center" }}>
                            <Badge tone={row.isBelowCost ? "red" : "green"}>{row.isBelowCost ? "Si" : "No"}</Badge>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              <div style={styles.pagination}>
                <span style={styles.mutedText}>
                  {detailProducts
                    ? `${detailProducts.total} producto${detailProducts.total === 1 ? "" : "s"} · pagina ${detailProducts.page} de ${Math.max(detailProducts.totalPages, 1)}`
                    : "Sin datos"}
                </span>
                <div style={styles.inlineActions}>
                  <button type="button" style={ui.ghostBtn} onClick={() => setDetailPage((page) => Math.max(page - 1, 1))} disabled={detailPage <= 1}>
                    Anterior
                  </button>
                  <button
                    type="button"
                    style={ui.ghostBtn}
                    onClick={() => setDetailPage((page) => page + 1)}
                    disabled={Boolean(detailProducts && detailPage >= detailProducts.totalPages)}
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  tabs: {
    display: "inline-flex",
    gap: 4,
    padding: 4,
    backgroundColor: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    marginBottom: 18,
  },
  tabButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    border: "none",
    borderRadius: 8,
    padding: "9px 14px",
    backgroundColor: "transparent",
    color: "var(--text-muted)",
    fontSize: 13,
    fontWeight: 800,
    cursor: "pointer",
  },
  tabButtonActive: {
    backgroundColor: "var(--accent-soft)",
    color: "var(--accent-strong)",
  },
  stack: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  adjustStack: {
    display: "flex",
    flexDirection: "column",
    gap: 18,
    width: "100%",
    maxWidth: 1280,
  },
  panel: {
    ...ui.panel,
    padding: 18,
  },
  adjustFormGrid: {
    display: "grid",
    gap: 14,
    alignItems: "end",
  },
  scopeSection: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    width: "100%",
  },
  scopeSelectField: {
    width: "100%",
    maxWidth: 340,
  },
  scopeSelectFieldFull: {
    maxWidth: "100%",
  },
  scopeSelectInput: {
    ...ui.input,
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    paddingRight: 36,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  scopeOptions: {
    minHeight: 44,
    width: "100%",
  },
  scopeOptionControls: {
    display: "flex",
    alignItems: "flex-end",
    gap: 12,
    flexWrap: "wrap",
    width: "100%",
  },
  scopeOptionField: {
    flex: "1 1 230px",
    minWidth: 0,
    maxWidth: 340,
  },
  scopeOptionFieldFull: {
    flexBasis: "100%",
    maxWidth: "100%",
  },
  scopeSelectionHint: {
    flexBasis: "100%",
    margin: "0",
    color: "var(--text-muted)",
    fontSize: 12,
    fontWeight: 700,
  },
  scopeUncategorizedOptions: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  scopeLoadingText: {
    margin: 0,
    color: "var(--text-muted)",
    fontSize: 12,
    fontWeight: 800,
  },
  formActionCell: {
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "flex-start",
    minHeight: 64,
  },
  manualPickerSection: {
    marginTop: 14,
  },
  groupedSectionHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "flex-start",
    gap: 12,
    flexWrap: "wrap",
    marginBottom: 12,
  },
  manualPickerHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "flex-start",
    gap: 12,
    flexWrap: "wrap",
    marginBottom: 9,
  },
  subsectionTitle: {
    margin: 0,
    fontSize: 16,
    fontWeight: 800,
    color: "var(--text)",
  },
  helpText: {
    margin: "4px 0 0",
    color: "var(--text-muted)",
    fontSize: 12,
    fontWeight: 600,
  },
  counterPill: {
    display: "inline-flex",
    alignItems: "center",
    height: 30,
    padding: "0 10px",
    borderRadius: 999,
    backgroundColor: "var(--surface-2)",
    border: "1px solid var(--border)",
    color: "var(--text-secondary)",
    fontSize: 12,
    fontWeight: 800,
  },
  inlineActions: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  manualPickerToolbar: {
    ...ui.toolbar,
    gap: 8,
    marginBottom: 10,
  },
  manualPickerCounter: {
    display: "inline-flex",
    alignItems: "center",
    height: 30,
    padding: "0 10px",
    borderRadius: 999,
    backgroundColor: "var(--surface-2)",
    border: "1px solid var(--border)",
    color: "var(--text-secondary)",
    fontSize: 12,
    fontWeight: 800,
  },
  adjustTableWrap: {
    ...ui.tableWrap,
    width: "100%",
    maxWidth: "100%",
    maxHeight: 340,
    overflowX: "auto",
    overflowY: "auto",
  },
  availableProductsTable: {
    ...ui.table,
    width: "100%",
    minWidth: 920,
    tableLayout: "fixed",
  },
  availableSelectColumn: {
    width: 44,
  },
  availableSkuColumn: {
    width: 108,
  },
  availableProductColumn: {
    width: "35%",
  },
  availableCostColumn: {
    width: 104,
  },
  availablePriceColumn: {
    width: 120,
  },
  availableCategoryColumn: {
    width: "25%",
  },
  selectedProductsTable: {
    ...ui.table,
    width: "100%",
    minWidth: 1120,
    tableLayout: "fixed",
  },
  selectedSelectColumn: {
    width: 44,
  },
  selectedSkuColumn: {
    width: 92,
  },
  selectedBarcodeColumn: {
    width: 130,
  },
  selectedProductColumn: {
    width: "25%",
  },
  selectedCostColumn: {
    width: 104,
  },
  selectedPriceColumn: {
    width: 120,
  },
  selectedCategoryColumn: {
    width: "19%",
  },
  selectedStatusColumn: {
    width: 86,
  },
  selectedActionsColumn: {
    width: 86,
  },
  compactTableRow: {
    minHeight: 42,
  },
  compactTh: {
    ...ui.th,
    padding: "8px 12px",
    verticalAlign: "middle",
  },
  compactMoneyCell: {
    ...ui.td,
    padding: "8px 12px",
    textAlign: "right",
    verticalAlign: "middle",
    lineHeight: 1.25,
  },
  compactCategoryCell: {
    ...ui.td,
    padding: "8px 12px",
    whiteSpace: "normal",
    verticalAlign: "middle",
    lineHeight: 1.25,
    overflowWrap: "break-word",
  },
  compactCheckboxHeaderCell: {
    ...ui.th,
    width: 44,
    padding: "8px",
    textAlign: "center",
    verticalAlign: "middle",
  },
  compactCheckboxCell: {
    ...ui.td,
    width: 44,
    padding: "8px",
    textAlign: "center",
    verticalAlign: "middle",
    lineHeight: 1,
  },
  compactCodeCell: {
    ...ui.td,
    padding: "8px 12px",
    verticalAlign: "middle",
    lineHeight: 1.25,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    fontSize: 12,
    color: "var(--text-muted)",
  },
  compactBarcodeCell: {
    ...ui.td,
    padding: "8px 12px",
    verticalAlign: "middle",
    lineHeight: 1.25,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    fontSize: 12,
    color: "var(--text-muted)",
    overflowWrap: "break-word",
    whiteSpace: "normal",
  },
  compactProductCell: {
    ...ui.td,
    padding: "8px 12px",
    whiteSpace: "normal",
    verticalAlign: "middle",
    color: "var(--text)",
    fontWeight: 700,
    lineHeight: 1.2,
    overflowWrap: "break-word",
  },
  compactProductMeta: {
    color: "var(--text-faint)",
    fontSize: 11,
    fontWeight: 600,
    marginTop: 1,
    lineHeight: 1.15,
  },
  compactStatusCell: {
    ...ui.td,
    padding: "8px 12px",
    textAlign: "center",
    verticalAlign: "middle",
    lineHeight: 1.25,
  },
  compactActionCell: {
    ...ui.td,
    padding: "8px 12px",
    textAlign: "center",
    verticalAlign: "middle",
    lineHeight: 1.25,
  },
  compactEmptyCell: {
    textAlign: "center",
    padding: "24px 16px",
    color: "var(--text-muted)",
    fontSize: 13,
    fontWeight: 600,
    borderBottom: "1px solid var(--border-soft)",
  },
  compactEmptyTitle: {
    display: "block",
    color: "var(--text-secondary)",
    fontSize: 13,
    fontWeight: 800,
  },
  compactEmptyText: {
    marginTop: 4,
    color: "var(--text-faint)",
    fontSize: 12,
    fontWeight: 600,
  },
  checkbox: {
    width: 16,
    height: 16,
    accentColor: "#1e3a8a",
    cursor: "pointer",
  },
  codeCell: {
    ...ui.td,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    fontSize: 12,
    color: "var(--text-muted)",
  },
  mutedSmall: {
    color: "var(--text-faint)",
    fontSize: 11,
    fontWeight: 600,
    marginTop: 3,
  },
  mutedText: {
    color: "var(--text-muted)",
    fontSize: 13,
    fontWeight: 700,
  },
  selectedRow: {
    backgroundColor: "rgba(59,130,246,0.06)",
  },
  valueInputWrap: {
    position: "relative",
  },
  valuePrefix: {
    position: "absolute",
    left: 12,
    top: "50%",
    transform: "translateY(-50%)",
    color: "var(--text-muted)",
    display: "inline-flex",
    alignItems: "center",
    zIndex: 1,
  },
  fieldError: {
    color: "#b91c1c",
    fontSize: 12,
    fontWeight: 700,
    marginTop: 5,
  },
  inlineAlert: {
    border: "1px solid",
    borderRadius: 8,
    padding: "10px 12px",
    fontSize: 13,
    fontWeight: 700,
    marginTop: 12,
  },
  previewBlock: {
    marginTop: 18,
  },
  kpiCard: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "12px 14px",
    backgroundColor: "var(--surface)",
    minWidth: 0,
  },
  kpiIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: "var(--accent-soft)",
    color: "var(--accent-strong)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  kpiLabel: {
    fontSize: 11,
    color: "var(--text-muted)",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.3px",
  },
  kpiValue: {
    marginTop: 3,
    fontSize: 17,
    color: "var(--text)",
    fontWeight: 800,
    overflowWrap: "anywhere",
  },
  priceTrend: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
  },
  badgeStack: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  confirmationGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
    gap: 14,
    marginTop: 16,
  },
  checkRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    color: "var(--text-secondary)",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 700,
  },
  footerActions: {
    display: "flex",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
    marginTop: 18,
  },
  dateInput: {
    ...ui.filterSelect,
    minWidth: 150,
  },
  pagination: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  confirmSummary: {
    display: "grid",
    gap: 9,
    color: "var(--text-secondary)",
    fontSize: 14,
    lineHeight: 1.45,
  },
  loadingBlock: {
    textAlign: "center",
    padding: "28px 16px",
    color: "var(--text-muted)",
    fontSize: 13,
    fontWeight: 700,
  },
  detailGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
    gap: 12,
    marginBottom: 16,
  },
  detailWide: {
    gridColumn: "1 / -1",
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: 14,
    backgroundColor: "var(--surface-2)",
  },
  metaGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 10,
    color: "var(--text-secondary)",
    fontSize: 13,
    lineHeight: 1.45,
  },
};

export default PriceAdjustmentsView;
