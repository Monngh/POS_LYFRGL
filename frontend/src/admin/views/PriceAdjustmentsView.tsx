/* eslint-disable react-hooks/set-state-in-effect */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  Eye,
  History,
  Loader2,
  PackageSearch,
  Percent,
  RotateCcw,
  Search,
  ShieldCheck,
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
  PriceAdjustmentReversalConflict,
  PriceAdjustmentReversalPreviewResponse,
  PriceAdjustmentReversalProduct,
  PriceAdjustmentScope,
} from "../types/priceAdjustments.types";
import {
  Badge,
  SearchInput,
  SectionHeader,
  TableState,
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
const HISTORY_PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
const DETAIL_PAGE_SIZE = 10;
const REVERSAL_REASON_MAX_LENGTH = 500;

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
  if (type === "REVERSAL") return "Reversión";
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
  type === "REVERSAL"
    ? "-"
    : type === "PERCENTAGE"
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

const getReversalConflictsFromError = (error: unknown): PriceAdjustmentReversalConflict[] => {
  if (typeof error === "object" && error !== null && "response" in error) {
    const apiError = error as {
      response?: {
        data?: {
          conflicts?: PriceAdjustmentReversalConflict[];
        };
      };
    };
    return Array.isArray(apiError.response?.data?.conflicts) ? apiError.response.data.conflicts : [];
  }

  return [];
};

const Kpi: React.FC<{ label: string; value: React.ReactNode; icon: React.ReactNode }> = ({ label, value, icon }) => (
  <div style={styles.kpiCard}>
    <div style={styles.kpiIcon}>{icon}</div>
    <div style={styles.kpiContent}>
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
  const filtersStacked = useMediaQuery("(max-width: 640px)");
  const overlayStyle = filtersStacked ? styles.compactOverlay : ui.overlay;
  const modalBodyStyle = filtersStacked ? styles.compactModalBody : ui.modalBody;
  const responsiveActionButtonStyle = filtersStacked
    ? { ...styles.responsiveActionButton, ...styles.fullWidthActionButton }
    : styles.responsiveActionButton;
  const getResponsiveModalStyle = (maxWidth: number): React.CSSProperties => ({
    ...ui.modal,
    maxWidth,
    width: filtersStacked ? "calc(100% - 8px)" : `min(100% - 32px, ${maxWidth}px)`,
    maxHeight: filtersStacked ? "calc(100dvh - 12px)" : "calc(100dvh - 32px)",
  });

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
  const [valueTouched, setValueTouched] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [confirmBelowCost, setConfirmBelowCost] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [confirmApplyOpen, setConfirmApplyOpen] = useState(false);
  const resolveRequestIdRef = useRef(0);
  const previewRequestIdRef = useRef(0);
  const historyRequestIdRef = useRef(0);
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
  const [detailReloadToken, setDetailReloadToken] = useState(0);
  const [reversalMode, setReversalMode] = useState(false);
  const [reversalPreview, setReversalPreview] = useState<PriceAdjustmentReversalPreviewResponse | null>(null);
  const [reversalLoading, setReversalLoading] = useState(false);
  const [reversalError, setReversalError] = useState<string | null>(null);
  const [selectedReversalDetailIds, setSelectedReversalDetailIds] = useState<Set<number>>(new Set());
  const [reversalReason, setReversalReason] = useState("");
  const [reversalConfirmOpen, setReversalConfirmOpen] = useState(false);
  const [reversalCredential, setReversalCredential] = useState("");
  const [reverting, setReverting] = useState(false);
  const [reversalConflicts, setReversalConflicts] = useState<PriceAdjustmentReversalConflict[]>([]);

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

  const previewRequiresBelowCostConfirmation = preview?.requiresBelowCostConfirmation ?? false;
  const valueError = useMemo(() => {
    if (!adjustmentValue.trim() && !valueTouched) return null;
    return getValueError(operation, adjustmentValue);
  }, [adjustmentValue, operation, valueTouched]);
  const notesError = preview && !notes.trim() ? "El motivo del ajuste es obligatorio." : null;
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

  const previewStatusText = useMemo(() => {
    if (previewLoading) return "Calculando vista previa...";
    if (selectedProductIdArray.length === 0) return "Agrega productos para activar la vista previa.";
    if (!adjustmentValue.trim()) return "Ingresa un valor para calcular la vista previa.";
    if (valueError) return "Corrige el valor para recalcular la vista previa.";
    if (preview) return "Vista previa actualizada automaticamente.";
    return "La vista previa se generara automaticamente.";
  }, [adjustmentValue, preview, previewLoading, selectedProductIdArray.length, valueError]);

  const historyRows = history?.adjustments ?? [];
  const historyTotal = history?.total ?? 0;
  const historyPageNumber = history?.page ?? historyPage;
  const historyPageLimit = history?.limit ?? historyLimit;
  const historyTotalPages = Math.max(history?.totalPages ?? 0, 1);
  const historyRangeStart = historyTotal === 0 ? 0 : (historyPageNumber - 1) * historyPageLimit + 1;
  const historyRangeEnd = historyTotal === 0 ? 0 : Math.min(historyRangeStart + historyRows.length - 1, historyTotal);
  const detailTotalProducts = detailProducts?.total ?? 0;
  const detailTotalPages = Math.ceil(detailTotalProducts / DETAIL_PAGE_SIZE);
  const detailDisplayTotalPages = Math.max(detailTotalPages, 1);
  const detailPagePending = Boolean(detailProducts && detailProducts.page !== detailPage);
  const detailProductsBusy = detailProductsLoading || detailPagePending;
  const detailCurrentPage = detailProductsBusy ? detailPage : detailProducts?.page ?? detailPage;
  const showDetailPagination = detailTotalPages > 1;
  const detailRangeStart = detailTotalProducts === 0 ? 0 : (detailCurrentPage - 1) * DETAIL_PAGE_SIZE + 1;
  const detailRangeSize = detailProductsBusy ? DETAIL_PAGE_SIZE : detailProducts?.products.length ?? DETAIL_PAGE_SIZE;
  const detailRangeEnd =
    detailTotalProducts === 0
      ? 0
      : Math.min(detailRangeStart + detailRangeSize - 1, detailTotalProducts);
  const detailProductsSummary = detailProducts
    ? showDetailPagination
      ? `Mostrando ${detailRangeStart}-${detailRangeEnd} de ${detailTotalProducts} producto${detailTotalProducts === 1 ? "" : "s"} · pagina ${detailCurrentPage} de ${detailDisplayTotalPages}`
      : `${detailTotalProducts} producto${detailTotalProducts === 1 ? "" : "s"}`
    : "Sin datos";
  const reversalProductsByDetailId = useMemo(
    () => new Map((reversalPreview?.products ?? []).map((product) => [product.detailId, product])),
    [reversalPreview]
  );
  const reversibleProducts = useMemo(
    () => (reversalPreview?.products ?? []).filter((product) => product.reversible),
    [reversalPreview]
  );
  const selectedReversalProducts = useMemo(
    () =>
      (reversalPreview?.products ?? []).filter((product) =>
        selectedReversalDetailIds.has(product.detailId)
      ),
    [reversalPreview, selectedReversalDetailIds]
  );
  const reversalReasonTrimmed = reversalReason.trim();
  const detailReversalBlockReason = detail?.reversalStatus?.isReversal
    ? "Los ajustes de reversión no pueden revertirse."
    : reversalPreview?.adjustment.blockReason ?? null;
  const canContinueReversal =
    reversalMode &&
    selectedReversalDetailIds.size > 0 &&
    Boolean(reversalReasonTrimmed) &&
    reversalReason.length <= REVERSAL_REASON_MAX_LENGTH &&
    !detailReversalBlockReason &&
    !reversalLoading &&
    !reverting;

  const getHistoryCategoryText = (adjustment: PriceAdjustmentHistoryItem) =>
    adjustment.category ? `${adjustment.category.code} ${adjustment.category.name}` : "-";

  const getHistoryReasonText = (adjustment: PriceAdjustmentHistoryItem) =>
    adjustment.notes || "Sin motivo registrado";

  const getHistoryReversalText = (adjustment: PriceAdjustmentHistoryItem) => {
    if (adjustment.reversalStatus?.isReversal) {
      return adjustment.reversalOfId ? `Reversión de #${adjustment.reversalOfId}` : "Ajuste de reversión";
    }

    if (adjustment.reversalStatus?.status === "NOT_REVERTED") {
      return adjustment.reversalStatus.label;
    }

    const related = adjustment.reversals?.length
      ? ` · Rev. #${adjustment.reversals.map((item) => item.id).join(", #")}`
      : "";
    return `${adjustment.reversalStatus?.label ?? "No revertido"}${related}`;
  };

  const cancelPendingPreview = () => {
    previewRequestIdRef.current += 1;
    setPreviewLoading(false);
  };

  const resetPreviewState = () => {
    cancelPendingPreview();
    setPreview(null);
    setPreviewError(null);
    setApplyError(null);
    setNotes("");
    setConfirmBelowCost(false);
    setConfirmApplyOpen(false);
  };

  const resetReversalState = () => {
    setReversalMode(false);
    setReversalError(null);
    setSelectedReversalDetailIds(new Set());
    setReversalReason("");
    setReversalConfirmOpen(false);
    setReversalCredential("");
    setReverting(false);
    setReversalConflicts([]);
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
    setValueTouched(false);
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
      const requestId = historyRequestIdRef.current + 1;
      historyRequestIdRef.current = requestId;
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
        if (requestId !== historyRequestIdRef.current) return;
        setHistory(result);
      } catch (error: unknown) {
        if (requestId !== historyRequestIdRef.current) return;
        setHistoryError(getApiErrorMessage(error, "No se pudo cargar el historial de ajustes."));
      } finally {
        if (requestId === historyRequestIdRef.current) {
          setHistoryLoading(false);
        }
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

  const loadReversalPreview = useCallback(async () => {
    if (detailId === null) return null;

    setReversalLoading(true);
    setReversalError(null);
    try {
      const result = await priceAdjustmentsApi.getReversalPreview(detailId);
      setReversalPreview(result);
      setSelectedReversalDetailIds((current) => {
        const validIds = new Set(result.products.filter((product) => product.reversible).map((product) => product.detailId));
        return new Set([...current].filter((detailIdValue) => validIds.has(detailIdValue)));
      });
      return result;
    } catch (error: unknown) {
      setReversalPreview(null);
      setReversalError(getApiErrorMessage(error, "No se pudo cargar la elegibilidad de reversión."));
      return null;
    } finally {
      setReversalLoading(false);
    }
  }, [detailId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedHistorySearch(historySearch);
      setHistoryPage(1);
    }, 300);
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
  }, [detailOpen, detailId, detailReloadToken]);

  useEffect(() => {
    if (!detailOpen || detailId === null) return;
    let cancelled = false;
    setDetailProductsLoading(true);
    setDetailProductsError(null);
    priceAdjustmentsApi
      .getAdjustmentProducts(detailId, {
        search: debouncedDetailSearch.trim() || undefined,
        page: detailPage,
        limit: DETAIL_PAGE_SIZE,
        onlyBelowCost: detailOnlyBelowCost,
      })
      .then((result) => {
        if (cancelled) return;
        const nextTotalPages = Math.max(Math.ceil(result.total / DETAIL_PAGE_SIZE), 1);
        if (result.page > nextTotalPages) {
          setDetailPage(nextTotalPages);
          return;
        }
        setDetailProducts(result);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setDetailProductsError(getApiErrorMessage(error, "No se pudieron cargar los productos del ajuste."));
      })
      .finally(() => {
        if (!cancelled) {
          setDetailProductsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedDetailSearch, detailId, detailOpen, detailOnlyBelowCost, detailPage, detailReloadToken]);

  useEffect(() => {
    if (!detailOpen || detailId === null || !detail) return;
    if (detail.reversalStatus?.isReversal) return;
    void loadReversalPreview();
  }, [detail, detailId, detailOpen, detailReloadToken, loadReversalPreview]);

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
    setValueTouched(true);
    setAdjustmentValue(value);
    resetPreviewState();
  };

  const changeOperation = (nextOperation: PriceAdjustmentOperation) => {
    setOperation(nextOperation);
    resetPreviewState();
  };

  useEffect(() => {
    const rawValue = adjustmentValue.trim();
    if (selectedProductIdArray.length === 0 || !rawValue || valueError) {
      previewRequestIdRef.current += 1;
      setPreview(null);
      setPreviewError(null);
      setPreviewLoading(false);
      setApplyError(null);
      setConfirmApplyOpen(false);
      return;
    }

    const requestId = previewRequestIdRef.current + 1;
    previewRequestIdRef.current = requestId;
    setPreview(null);
    setPreviewError(null);
    setApplyError(null);
    setConfirmApplyOpen(false);

    const timer = window.setTimeout(() => {
      setPreviewLoading(true);
      priceAdjustmentsApi
        .preview({
          operation,
          value: Number(rawValue),
          productIds: selectedProductIdArray,
        })
        .then((result) => {
          if (requestId !== previewRequestIdRef.current) return;
          setPreview(result);
          setConfirmBelowCost(false);
          setNotes("");
        })
        .catch((error: unknown) => {
          if (requestId !== previewRequestIdRef.current) return;
          setPreview(null);
          setPreviewError(getApiErrorMessage(error, "No se pudo generar la vista previa."));
        })
        .finally(() => {
          if (requestId === previewRequestIdRef.current) {
            setPreviewLoading(false);
          }
        });
    }, 500);

    return () => window.clearTimeout(timer);
  }, [adjustmentValue, operation, selectedProductIdArray, valueError]);

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
      notes: notes.trim(),
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

  const startReversalMode = async () => {
    setReversalMode(true);
    setReversalConflicts([]);
    setReversalError(null);
    await loadReversalPreview();
  };

  const toggleReversalDetail = (product: PriceAdjustmentReversalProduct) => {
    if (!product.reversible || reverting) return;
    setSelectedReversalDetailIds((current) => {
      const next = new Set(current);
      if (next.has(product.detailId)) next.delete(product.detailId);
      else next.add(product.detailId);
      return next;
    });
    setReversalError(null);
  };

  const selectAllReversibleProducts = () => {
    setSelectedReversalDetailIds(new Set(reversibleProducts.map((product) => product.detailId)));
    setReversalError(null);
  };

  const clearReversalSelection = () => {
    setSelectedReversalDetailIds(new Set());
    setReversalError(null);
  };

  const openReversalConfirm = async () => {
    if (selectedReversalDetailIds.size === 0) {
      setReversalError("Selecciona al menos un producto reversible.");
      return;
    }

    if (!reversalReasonTrimmed) {
      setReversalError("El motivo de la reversión es obligatorio.");
      return;
    }

    if (reversalReason.length > REVERSAL_REASON_MAX_LENGTH) {
      setReversalError(`El motivo no puede exceder ${REVERSAL_REASON_MAX_LENGTH} caracteres.`);
      return;
    }

    const latestPreview = await loadReversalPreview();
    if (!latestPreview) return;

    const latestById = new Map(latestPreview.products.map((product) => [product.detailId, product]));
    const conflictingSelections = [...selectedReversalDetailIds]
      .map((detailIdValue) => ({
        detailId: detailIdValue,
        product: latestById.get(detailIdValue),
      }))
      .filter(({ product }) => !product?.reversible);

    if (conflictingSelections.length > 0) {
      setReversalConflicts(
        conflictingSelections.map(({ detailId: detailIdValue, product }) => ({
          detailId: product?.detailId ?? detailIdValue,
          productId: product?.productId,
          name: product?.name,
          sku: product?.sku,
          reasonCode: product?.reasonCode ?? "PRICE_CHANGED",
          reason: product?.reason ?? "El producto ya no puede revertirse.",
          originalNewPrice: product?.newSellPrice,
          currentPrice: product?.currentSellPrice ?? undefined,
          targetPrice: product?.targetSellPrice,
        }))
      );
      setReversalError("Algunos productos ya no pueden revertirse.");
      return;
    }

    setReversalConflicts([]);
    setReversalCredential("");
    setReversalConfirmOpen(true);
  };

  const confirmReversal = async () => {
    if (detailId === null || reverting) return;

    if (!reversalCredential.trim()) {
      setReversalError("Debes confirmar tu PIN o contraseña.");
      return;
    }

    setReverting(true);
    setReversalError(null);
    setReversalConflicts([]);
    try {
      const result = await priceAdjustmentsApi.revertAdjustment(detailId, {
        productDetailIds: selectedArrayFromSet(selectedReversalDetailIds),
        reason: reversalReasonTrimmed,
        credential: reversalCredential,
      });
      showToast(
        result.affectedRows === 1
          ? "El producto fue revertido correctamente."
          : `${result.affectedRows} productos fueron revertidos correctamente.`,
        "success"
      );
      setReversalConfirmOpen(false);
      setReversalCredential("");
      setSelectedReversalDetailIds(new Set());
      setReversalReason("");
      setDetailReloadToken((token) => token + 1);
      await Promise.all([loadReversalPreview(), loadHistory(historyPage)]);
    } catch (error: unknown) {
      const conflicts = getReversalConflictsFromError(error);
      setReversalConflicts(conflicts);
      setReversalError(getApiErrorMessage(error, "No se pudo revertir el ajuste."));
      showToast("No se pudo revertir el ajuste.", "error");
      void loadReversalPreview();
    } finally {
      setReverting(false);
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
    setDetailProductsLoading(false);
    resetReversalState();
    setReversalPreview(null);
    setReversalLoading(false);
    setDetailOpen(true);
  };

  const closeDetail = () => {
    if (reverting) return;
    setDetailOpen(false);
    setDetailId(null);
    setDetail(null);
    setDetailProducts(null);
    setDetailProductsLoading(false);
    resetReversalState();
    setReversalPreview(null);
    setReversalLoading(false);
  };

  const handleDetailPreviousPage = () => {
    if (detailProductsBusy || detailPage <= 1) return;
    setDetailPage((page) => Math.max(page - 1, 1));
  };

  const handleDetailNextPage = () => {
    if (detailProductsBusy || detailPage >= detailDisplayTotalPages) return;
    setDetailPage(detailPage + 1);
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
        <div
          style={{
            ...styles.manualPickerToolbar,
            gridTemplateColumns: filtersStacked
              ? "1fr"
              : isMobile
                ? "repeat(2, minmax(0, 1fr))"
                : "minmax(260px, 1fr) repeat(3, max-content) auto",
          }}
        >
          <div style={filtersStacked ? styles.fullWidthControl : styles.manualPickerSearchControl}>
            <SearchInput value={availableSearch} onChange={setAvailableSearch} placeholder="Buscar SKU, codigo o producto" />
          </div>
          <button type="button" style={{ ...ui.ghostBtn, ...responsiveActionButtonStyle }} onClick={toggleAllVisibleManual} disabled={availableLoading}>
            {allVisibleAvailableSelected ? "Limpiar visibles" : "Seleccionar visibles"}
          </button>
          <button type="button" style={{ ...ui.ghostBtn, ...responsiveActionButtonStyle }} onClick={() => setManualSelectedIds(new Set())} disabled={availableLoading}>
            Limpiar seleccion
          </button>
          <button
            type="button"
            style={{
              ...ui.primaryBtn,
              ...responsiveActionButtonStyle,
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
          <div style={filtersStacked ? { ...styles.inlineActions, ...styles.inlineActionsStacked } : styles.inlineActions}>
            <button type="button" style={{ ...ui.ghostBtn, ...responsiveActionButtonStyle }} onClick={selectAllResolved} disabled={resolvedProducts.length === 0}>
              Seleccionar todos
            </button>
            <button type="button" style={{ ...ui.ghostBtn, ...responsiveActionButtonStyle }} onClick={clearResolvedSelection} disabled={resolvedProducts.length === 0}>
              Limpiar seleccion
            </button>
          </div>
        </div>
      </div>
      <div style={styles.singleSearchToolbar}>
        <SearchInput value={productSearch} onChange={setProductSearch} placeholder="Buscar en productos cargados" />
      </div>
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
          <Kpi label="Motivo obligatorio" value="Si" icon={<Tags size={17} />} />
          <Kpi
            label="Confirmacion bajo costo"
            value={preview.requiresBelowCostConfirmation ? "Si" : "No"}
            icon={<CheckCircle2 size={17} />}
          />
        </div>

        {preview.requiresBelowCostConfirmation && (
          <InlineAlert tone="error">Hay productos que quedaran por debajo de su costo. Se requiere confirmacion explicita.</InlineAlert>
        )}
        <div style={{ ...ui.tableWrap, maxHeight: filtersStacked ? 300 : 390, overflowX: "auto", overflowY: "auto", marginTop: 16 }}>
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

        <div style={{ ...styles.confirmationGrid, gridTemplateColumns: filtersStacked ? "1fr" : "repeat(auto-fit, minmax(min(100%, 250px), 1fr))" }}>
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
            <div style={filtersStacked ? { ...styles.fieldFooter, ...styles.fieldFooterStacked } : styles.fieldFooter}>
              {notesError ? <p style={styles.fieldErrorInline}>{notesError}</p> : <span />}
              <span>{notes.length} / 500 caracteres</span>
            </div>
          </div>

          {preview.requiresBelowCostConfirmation && (
            <label style={{ ...styles.checkRow, ...styles.checkRowTop }}>
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
        <div style={filtersStacked ? { ...styles.footerActions, ...styles.footerActionsStacked } : styles.footerActions}>
          <button type="button" style={{ ...ui.ghostBtn, ...responsiveActionButtonStyle }} onClick={resetPreviewState} disabled={applying}>
            Descartar vista previa
          </button>
          <button
            type="button"
            style={{ ...ui.primaryBtn, ...responsiveActionButtonStyle, opacity: canApplyPreview ? 1 : 0.55, cursor: canApplyPreview ? "pointer" : "not-allowed" }}
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
              : "minmax(240px, 1fr) minmax(240px, 1fr)",
          }}
        >
          <div style={styles.adjustFieldGroup}>
            <label style={ui.fieldLabel}>Operacion</label>
            <select style={ui.input} value={operation} onChange={(event) => changeOperation(event.target.value as PriceAdjustmentOperation)}>
              {operationOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <div style={styles.adjustFieldMessage} aria-hidden="true" />
          </div>
          <div style={styles.adjustFieldGroup}>
            <label style={ui.fieldLabel}>Valor</label>
            <div style={styles.valueInputWrap}>
              <span style={styles.valuePrefix}>
                {operation === "PERCENT_INCREASE" || operation === "PERCENT_DECREASE" ? <Percent size={15} /> : <DollarSign size={15} />}
              </span>
              <input
                id="price-adjustment-value"
                aria-invalid={Boolean(valueError)}
                aria-describedby={valueError ? "price-adjustment-value-error" : undefined}
                style={styles.valueInput}
                value={adjustmentValue}
                onChange={(event) => changeAdjustmentValue(event.target.value)}
                inputMode="decimal"
                placeholder={operation === "PERCENT_INCREASE" || operation === "PERCENT_DECREASE" ? "10" : "25.00"}
              />
            </div>
            <div style={styles.adjustFieldMessage}>
              {valueError && (
                <p id="price-adjustment-value-error" style={styles.adjustFieldError}>
                  {valueError}
                </p>
              )}
            </div>
          </div>
        </div>
        <div style={styles.previewStatusRow} aria-live="polite">
          {previewLoading && <Loader2 size={14} />}
          <span>{previewStatusText}</span>
        </div>
        {previewError && <InlineAlert tone="error">{previewError}</InlineAlert>}
        {renderPreviewTable()}
      </div>
    </div>
  );

  const renderHistoryCards = () => {
    if (historyLoading || historyError || historyRows.length === 0) {
      return (
        <div style={styles.historyCardsList}>
          <div style={styles.historyCardState}>
            {historyLoading
              ? "Cargando historial..."
              : historyError || "No hay ajustes de precios registrados con los filtros seleccionados."}
          </div>
        </div>
      );
    }

    return (
      <div style={styles.historyCardsList}>
        {historyRows.map((adjustment) => (
          <article key={adjustment.id} style={styles.historyCard}>
            <div style={styles.historyCardHeader}>
              <div style={styles.historyCellStack}>
                <strong style={styles.historyCardTitle}>{fmtDateTime(adjustment.appliedAt)}</strong>
                <span style={styles.historyCardMuted}>{adjustment.appliedBy.name}</span>
                <span style={styles.historyCardMuted}>{adjustment.appliedBy.email || "-"}</span>
              </div>
              <button type="button" style={{ ...styles.historyActionButton, ...styles.historyCardActionButton }} onClick={() => openDetail(adjustment.id)}>
                <Eye size={14} /> Ver
              </button>
            </div>

            <div style={styles.historyCardGrid}>
              <div style={styles.historyCardField}>
                <span>Alcance</span>
                <strong style={styles.historyCardValue}>{scopeLabel(adjustment.scope)}</strong>
              </div>
              <div style={styles.historyCardField}>
                <span>Categoria</span>
                <strong style={styles.historyCardValue}>{getHistoryCategoryText(adjustment)}</strong>
              </div>
              <div style={styles.historyCardField}>
                <span>Operacion</span>
                <strong style={styles.historyCardValue}>{adjustmentTypeLabel(adjustment.type, adjustment.direction)}</strong>
              </div>
              <div style={styles.historyCardField}>
                <span>Valor</span>
                <strong style={styles.historyCardValue}>{formatStoredAdjustmentValue(adjustment.type, adjustment.value)}</strong>
              </div>
              <div style={styles.historyCardField}>
                <span>Productos</span>
                <strong style={styles.historyCardValue}>{adjustment.affectedRows}</strong>
              </div>
              <div style={styles.historyCardField}>
                <span>Debajo del costo</span>
                <Badge tone={adjustment.belowCostCount > 0 ? "red" : "green"}>{adjustment.belowCostCount}</Badge>
              </div>
              <div style={{ ...styles.historyCardField, ...styles.historyCardFieldWide }}>
                <span>Reversion</span>
                <strong style={styles.historyCardValue}>{getHistoryReversalText(adjustment)}</strong>
              </div>
              <div style={{ ...styles.historyCardField, ...styles.historyCardFieldWide }}>
                <span>Motivo</span>
                <strong style={styles.historyCardValue}>{getHistoryReasonText(adjustment)}</strong>
              </div>
            </div>
          </article>
        ))}
      </div>
    );
  };

  const renderHistoryTab = () => (
    <div style={styles.stack}>
      <div
        style={{
          ...styles.historyFilterGrid,
          gridTemplateColumns: filtersStacked
            ? "1fr"
            : isMobile
              ? "repeat(2, minmax(0, 1fr))"
              : "repeat(auto-fit, minmax(min(100%, 150px), 1fr))",
        }}
      >
        <div style={isMobile ? styles.historyFilterSearch : { ...styles.historyFilterSearch, gridColumn: "span 2" }}>
          <SearchInput
            value={historySearch}
            onChange={(value) => {
              setHistorySearch(value);
              setHistoryPage(1);
            }}
            placeholder="Buscar por motivo, usuario o categoria"
          />
        </div>
        <input
          style={styles.dateInput}
          type="date"
          value={historyFrom}
          onChange={(event) => {
            setHistoryFrom(event.target.value);
            setHistoryPage(1);
          }}
        />
        <input
          style={styles.dateInput}
          type="date"
          value={historyTo}
          onChange={(event) => {
            setHistoryTo(event.target.value);
            setHistoryPage(1);
          }}
        />
        <select
          style={styles.filterSelectFull}
          value={historyOperation}
          onChange={(event) => {
            setHistoryOperation(event.target.value as PriceAdjustmentOperation | "");
            setHistoryPage(1);
          }}
        >
          {operationFilterOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          style={styles.filterSelectFull}
          value={historyScope}
          onChange={(event) => {
            setHistoryScope(event.target.value as PriceAdjustmentScope | "");
            setHistoryPage(1);
          }}
        >
          {scopeFilterOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {userOptions.length > 0 && (
          <select
            style={styles.filterSelectFull}
            value={historyUserId}
            onChange={(event) => {
              setHistoryUserId(event.target.value);
              setHistoryPage(1);
            }}
          >
            {[
              { value: "", label: "Todos los usuarios" },
              ...userOptions.map((user) => ({ value: String(user.id), label: user.name })),
            ].map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        )}
      </div>

      {isMobile ? renderHistoryCards() : (
      <div className="table-sticky-head" style={styles.historyTableWrap}>
        <table style={styles.historyTable}>
          <colgroup>
            <col style={styles.historyDateColumn} />
            <col style={styles.historyUserColumn} />
            <col style={styles.historyScopeColumn} />
            <col style={styles.historyCategoryColumn} />
            <col style={styles.historyOperationColumn} />
            <col style={styles.historyValueColumn} />
            <col style={styles.historyCountColumn} />
            <col style={styles.historyBelowCostColumn} />
            <col style={styles.historyReversalColumn} />
            <col style={styles.historyReasonColumn} />
            <col style={styles.historyActionsColumn} />
          </colgroup>
          <thead>
            <tr style={ui.theadRow}>
              <th style={styles.historyTh}>Fecha</th>
              <th style={styles.historyTh}>Usuario</th>
              <th style={styles.historyTh}>Alcance</th>
              <th style={styles.historyTh}>Categoria</th>
              <th style={styles.historyTh}>Operacion</th>
              <th style={{ ...styles.historyTh, textAlign: "right" }}>Valor</th>
              <th style={{ ...styles.historyTh, textAlign: "right" }}>Productos</th>
              <th style={{ ...styles.historyTh, textAlign: "center" }}>Debajo</th>
              <th style={styles.historyTh}>Reversión</th>
              <th style={styles.historyTh}>Motivo</th>
              <th style={{ ...styles.historyTh, textAlign: "center" }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            <TableState
              colSpan={11}
              loading={historyLoading}
              error={historyError}
              empty={!historyLoading && historyRows.length === 0}
              emptyText="No hay ajustes de precios registrados con los filtros seleccionados."
            />
            {!historyLoading &&
              !historyError &&
              historyRows.map((adjustment) => (
                <tr key={adjustment.id}>
                  <td style={styles.historyNowrapTd}>{fmtDateTime(adjustment.appliedAt)}</td>
                  <td style={styles.historyTd}>
                    <div style={styles.historyCellStack}>
                      <strong style={styles.historyPrimaryText} title={adjustment.appliedBy.name}>
                        {adjustment.appliedBy.name}
                      </strong>
                      <span style={styles.historySecondaryText} title={adjustment.appliedBy.email || ""}>
                        {adjustment.appliedBy.email || "-"}
                      </span>
                    </div>
                  </td>
                  <td style={styles.historyNowrapTd}>{scopeLabel(adjustment.scope)}</td>
                  <td style={styles.historyTd}>
                    <span style={styles.historyTruncateText} title={getHistoryCategoryText(adjustment)}>
                      {getHistoryCategoryText(adjustment)}
                    </span>
                  </td>
                  <td style={styles.historyTd}>
                    <span style={styles.historyTruncateText} title={adjustmentTypeLabel(adjustment.type, adjustment.direction)}>
                      {adjustmentTypeLabel(adjustment.type, adjustment.direction)}
                    </span>
                  </td>
                  <td style={styles.historyMoneyTd}>{formatStoredAdjustmentValue(adjustment.type, adjustment.value)}</td>
                  <td style={styles.historyNumberTd}>{adjustment.affectedRows}</td>
                  <td style={styles.historyCenterTd}>
                    <Badge tone={adjustment.belowCostCount > 0 ? "red" : "green"}>{adjustment.belowCostCount}</Badge>
                  </td>
                  <td style={styles.historyTd}>
                    <span style={styles.historyReasonText} title={getHistoryReversalText(adjustment)}>
                      {getHistoryReversalText(adjustment)}
                    </span>
                  </td>
                  <td style={styles.historyTd}>
                    <span style={styles.historyReasonText} title={getHistoryReasonText(adjustment)}>
                      {getHistoryReasonText(adjustment)}
                    </span>
                  </td>
                  <td style={styles.historyActionTd}>
                    <button type="button" style={styles.historyActionButton} onClick={() => openDetail(adjustment.id)}>
                      <Eye size={14} /> Ver
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      )}

      <div style={filtersStacked ? { ...styles.historyPagination, ...styles.historyPaginationStacked } : styles.historyPagination}>
        <span style={styles.historyPaginationText}>
          {historyTotal > 0
            ? `Mostrando ${historyRangeStart}-${historyRangeEnd} de ${historyTotal} registro${historyTotal === 1 ? "" : "s"}`
            : "Mostrando 0 de 0 registros"}
        </span>
        {historyTotal > 0 && (
        <div style={filtersStacked ? { ...styles.historyPaginationControls, ...styles.historyPaginationControlsStacked } : styles.historyPaginationControls}>
          <label style={filtersStacked ? { ...styles.historyPageSizeLabel, ...styles.historyPageSizeLabelStacked } : styles.historyPageSizeLabel}>
            <span>Registros por pagina</span>
            <select
              style={styles.historyPageSizeSelect}
              value={historyLimit}
              onChange={(event) => {
                setHistoryLimit(Number(event.target.value));
                setHistoryPage(1);
              }}
            >
              {HISTORY_PAGE_SIZE_OPTIONS.map((limit) => (
                <option key={limit} value={limit}>
                  {limit}
                </option>
              ))}
            </select>
          </label>
            <button
              type="button"
              style={{
                ...styles.historyPagerButton,
                ...(filtersStacked ? styles.fullWidthActionButton : {}),
                opacity: historyLoading || historyPageNumber <= 1 ? 0.55 : 1,
                cursor: historyLoading || historyPageNumber <= 1 ? "not-allowed" : "pointer",
              }}
              onClick={() => setHistoryPage((page) => Math.max(page - 1, 1))}
              disabled={historyLoading || historyPageNumber <= 1}
              title="Pagina anterior"
          >
            <ChevronLeft size={14} /> Anterior
          </button>
          <span style={filtersStacked ? { ...styles.historyPageText, ...styles.historyPageTextStacked } : styles.historyPageText}>Pagina {historyPageNumber} de {historyTotalPages}</span>
            <button
              type="button"
              style={{
                ...styles.historyPagerButton,
                ...(filtersStacked ? styles.fullWidthActionButton : {}),
                opacity: historyLoading || historyPageNumber >= historyTotalPages ? 0.55 : 1,
                cursor: historyLoading || historyPageNumber >= historyTotalPages ? "not-allowed" : "pointer",
              }}
              onClick={() => setHistoryPage((page) => page + 1)}
              disabled={historyLoading || historyPageNumber >= historyTotalPages}
              title="Pagina siguiente"
          >
            Siguiente <ChevronRight size={14} />
          </button>
        </div>
        )}
      </div>
    </div>
  );

  return (
    <div>
      <SectionHeader
        title="Ajustes masivos de precios"
        subtitle="Actualiza precios de venta por producto, categoria o alcance completo con vista previa antes de aplicar"
      />

      <div style={filtersStacked ? { ...styles.tabs, ...styles.tabsStacked } : styles.tabs} role="tablist" aria-label="Ajustes masivos de precios">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "adjust"}
          style={{ ...styles.tabButton, ...(filtersStacked ? styles.tabButtonStacked : {}), ...(activeTab === "adjust" ? styles.tabButtonActive : {}) }}
          onClick={() => setActiveTab("adjust")}
        >
          <DollarSign size={16} /> Ajustar precios
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "history"}
          style={{ ...styles.tabButton, ...(filtersStacked ? styles.tabButtonStacked : {}), ...(activeTab === "history" ? styles.tabButtonActive : {}) }}
          onClick={() => setActiveTab("history")}
        >
          <History size={16} /> Historial
        </button>
      </div>

      {activeTab === "adjust" ? renderAdjustTab() : renderHistoryTab()}

      {confirmApplyOpen && preview && (
        <div style={overlayStyle} onClick={() => !applying && setConfirmApplyOpen(false)}>
          <div style={getResponsiveModalStyle(560)} onClick={(event) => event.stopPropagation()}>
            <div style={ui.modalHeader}>
              <span style={ui.modalTitle}>Confirmar ajuste de precios</span>
              <button type="button" style={{ ...ui.linkBtn, ...styles.closeButton }} onClick={() => setConfirmApplyOpen(false)} disabled={applying} aria-label="Cerrar confirmacion">
                <X size={18} />
              </button>
            </div>
            <div style={modalBodyStyle}>
              <div style={styles.confirmSummary}>
                <div><strong>Cantidad de productos:</strong> {selectedProductIds.size}</div>
                <div><strong>Tipo de ajuste:</strong> {operationLabel(operation)}</div>
                <div><strong>Valor aplicado:</strong> {formatAdjustmentValue(operation, Number(adjustmentValue))}</div>
                <div><strong>Debajo de costo:</strong> {preview.belowCostCount}</div>
                <div><strong>Motivo:</strong> {notes.trim()}</div>
              </div>
              <div style={filtersStacked ? { ...styles.footerActions, ...styles.footerActionsStacked } : styles.footerActions}>
                <button type="button" style={{ ...ui.ghostBtn, ...responsiveActionButtonStyle }} onClick={() => setConfirmApplyOpen(false)} disabled={applying}>
                  Cancelar
                </button>
                <button type="button" style={{ ...ui.primaryBtn, ...responsiveActionButtonStyle, opacity: applying ? 0.7 : 1 }} onClick={applyAdjustment} disabled={applying}>
                  {applying ? "Aplicando..." : "Si, aplicar ajuste"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {detailOpen && (
        <div style={overlayStyle} onClick={closeDetail}>
          <div
            style={getResponsiveModalStyle(980)}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={ui.modalHeader}>
              <span style={ui.modalTitle}>Detalle de ajuste</span>
              <button type="button" style={{ ...ui.linkBtn, ...styles.closeButton }} onClick={closeDetail} aria-label="Cerrar detalle de ajuste">
                <X size={18} />
              </button>
            </div>
            <div style={modalBodyStyle}>
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
                      <div><strong>Motivo:</strong> {detail.notes || "Sin motivo registrado"}</div>
                      <div><strong>Estado de reversión:</strong> {detail.reversalStatus?.label ?? "No revertido"}</div>
                      {detail.reversalOfId && (
                        <div><strong>Ajuste original:</strong> #{detail.reversalOfId}</div>
                      )}
                      {!detail.reversalOfId && detail.reversals?.length > 0 && (
                        <div>
                          <strong>Ajustes de reversión:</strong>{" "}
                          {detail.reversals.map((item) => `#${item.id}`).join(", ")}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {!detailLoading && detail && (
                <div style={styles.reversalHeader}>
                  <div style={styles.reversalHeaderText}>
                    <strong>{detail.reversalStatus?.label ?? "No revertido"}</strong>
                    {detailReversalBlockReason && (
                      <span>{detailReversalBlockReason}</span>
                    )}
                  </div>
                  {!detail.reversalStatus?.isReversal && (
                    <div style={filtersStacked ? { ...styles.inlineActions, ...styles.inlineActionsStacked } : styles.inlineActions}>
                      {reversalMode ? (
                        <>
                          <button type="button" style={{ ...ui.ghostBtn, ...responsiveActionButtonStyle }} onClick={() => void loadReversalPreview()} disabled={reversalLoading || reverting}>
                            {reversalLoading ? "Actualizando..." : "Actualizar elegibilidad"}
                          </button>
                          <button type="button" style={{ ...ui.ghostBtn, ...responsiveActionButtonStyle }} onClick={resetReversalState} disabled={reverting}>
                            Cancelar reversión
                          </button>
                        </>
                      ) : (
                        <button type="button" style={{ ...ui.primaryBtn, ...responsiveActionButtonStyle }} onClick={() => void startReversalMode()} disabled={reversalLoading || Boolean(detailReversalBlockReason)}>
                          <RotateCcw size={15} /> Revertir productos
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div style={filtersStacked ? { ...styles.detailFilterToolbar, ...styles.detailFilterToolbarStacked } : styles.detailFilterToolbar}>
                <div style={styles.detailSearchControl}>
                  <SearchInput value={detailSearch} onChange={(value) => { setDetailSearch(value); setDetailPage(1); }} placeholder="Buscar producto en este ajuste" />
                </div>
                <label style={{ ...styles.checkRow, ...styles.checkRowTop }}>
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
              </div>

              <div style={{ ...ui.tableWrap, maxHeight: filtersStacked ? 280 : 360, overflowX: "auto", overflowY: "auto" }}>
                <table style={{ ...ui.table, minWidth: reversalMode ? 980 : 760 }}>
                  <thead>
                    <tr style={ui.theadRow}>
                      {reversalMode && <th style={{ ...ui.th, width: 46, textAlign: "center" }}>Sel.</th>}
                      <th style={ui.th}>SKU</th>
                      <th style={ui.th}>Producto</th>
                      <th style={{ ...ui.th, textAlign: "right" }}>Precio anterior</th>
                      <th style={{ ...ui.th, textAlign: "right" }}>Precio aplicado</th>
                      {reversalMode ? (
                        <>
                          <th style={{ ...ui.th, textAlign: "right" }}>Precio actual</th>
                          <th style={{ ...ui.th, textAlign: "center" }}>Estado</th>
                        </>
                      ) : (
                        <>
                          <th style={{ ...ui.th, textAlign: "right" }}>Costo al cambio</th>
                          <th style={{ ...ui.th, textAlign: "center" }}>Debajo costo</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    <TableState
                      colSpan={reversalMode ? 7 : 6}
                      loading={detailProductsBusy}
                      error={detailProductsError}
                      empty={!detailProductsBusy && (detailProducts?.products.length ?? 0) === 0}
                      emptyText="No hay productos para estos filtros."
                    />
                    {!detailProductsBusy &&
                      !detailProductsError &&
                      detailProducts?.products.map((row) => {
                        const reversalProduct = reversalProductsByDetailId.get(row.id);
                        const isSelectable = Boolean(reversalProduct?.reversible);
                        const isSelected = selectedReversalDetailIds.has(row.id);
                        const disabledRow = reversalMode && !isSelectable;

                        return (
                          <tr key={row.id} style={disabledRow ? styles.reversalDisabledRow : undefined}>
                            {reversalMode && (
                              <td style={{ ...ui.td, textAlign: "center" }}>
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  disabled={!isSelectable || reverting}
                                  onChange={() => reversalProduct && toggleReversalDetail(reversalProduct)}
                                  style={{
                                    ...styles.checkbox,
                                    cursor: isSelectable && !reverting ? "pointer" : "not-allowed",
                                  }}
                                />
                              </td>
                            )}
                            <td style={styles.codeCell}>{row.producto.sku}</td>
                            <td style={{ ...ui.td, whiteSpace: "normal", color: "var(--text)", fontWeight: 700 }}>
                              {row.producto.name}
                              {reversalMode && reversalProduct?.reason && (
                                <div style={styles.reversalReasonText}>No disponible: {reversalProduct.reason.replace(/^No disponible:\s*/i, "")}</div>
                              )}
                            </td>
                            <td style={{ ...ui.td, textAlign: "right" }}>{moneyExact(Number(row.oldSellPrice))}</td>
                            <td style={{ ...ui.td, textAlign: "right", fontWeight: 800 }}>{moneyExact(Number(row.newSellPrice))}</td>
                            {reversalMode ? (
                              <>
                                <td style={{ ...ui.td, textAlign: "right" }}>
                                  {reversalProduct?.currentSellPrice === null || reversalProduct?.currentSellPrice === undefined
                                    ? "-"
                                    : moneyExact(Number(reversalProduct.currentSellPrice))}
                                </td>
                                <td style={{ ...ui.td, textAlign: "center" }}>
                                  <Badge tone={isSelectable ? "green" : "red"}>{isSelectable ? "Disponible" : "No disponible"}</Badge>
                                </td>
                              </>
                            ) : (
                              <>
                                <td style={{ ...ui.td, textAlign: "right" }}>{moneyExact(Number(row.costPriceAtChange))}</td>
                                <td style={{ ...ui.td, textAlign: "center" }}>
                                  <Badge tone={row.isBelowCost ? "red" : "green"}>{row.isBelowCost ? "Si" : "No"}</Badge>
                                </td>
                              </>
                            )}
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
              <div style={styles.pagination}>
                <span style={styles.mutedText}>{detailProductsSummary}</span>
                {showDetailPagination && (
                  <div style={filtersStacked ? { ...styles.inlineActions, ...styles.inlineActionsStacked } : styles.inlineActions}>
                    <button
                      type="button"
                      style={{ ...ui.ghostBtn, ...responsiveActionButtonStyle }}
                      onClick={handleDetailPreviousPage}
                      disabled={detailProductsBusy || detailPage <= 1}
                    >
                      Anterior
                    </button>
                    <button
                      type="button"
                      style={{ ...ui.ghostBtn, ...responsiveActionButtonStyle }}
                      onClick={handleDetailNextPage}
                      disabled={detailProductsBusy || detailPage >= detailDisplayTotalPages}
                    >
                      Siguiente
                    </button>
                  </div>
                )}
              </div>

              {reversalMode && (
                <div style={styles.reversalPanel}>
                  {reversalLoading && <div style={styles.reversalStatusLine}>Consultando elegibilidad actual...</div>}
                  {reversalError && <InlineAlert tone="error">{reversalError}</InlineAlert>}
                  {detailReversalBlockReason && (
                    <InlineAlert tone="warning">{detailReversalBlockReason}</InlineAlert>
                  )}
                  {reversalConflicts.length > 0 && (
                    <div style={styles.reversalConflictList}>
                      {reversalConflicts.slice(0, 5).map((conflict) => (
                        <div key={`${conflict.detailId ?? conflict.productId ?? conflict.reasonCode}-${conflict.reason}`} style={styles.reversalConflictItem}>
                          <strong>{conflict.sku || conflict.name || `Detalle #${conflict.detailId}`}</strong>
                          <span>{conflict.reason}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={filtersStacked ? { ...styles.reversalControls, ...styles.reversalControlsStacked } : styles.reversalControls}>
                    <div style={styles.reversalCounter}>
                      {selectedReversalDetailIds.size} producto{selectedReversalDetailIds.size === 1 ? "" : "s"} seleccionado{selectedReversalDetailIds.size === 1 ? "" : "s"} para revertir
                    </div>
                    <div style={filtersStacked ? { ...styles.inlineActions, ...styles.inlineActionsStacked } : styles.inlineActions}>
                      <button type="button" style={{ ...ui.ghostBtn, ...responsiveActionButtonStyle }} onClick={selectAllReversibleProducts} disabled={reversalLoading || reversibleProducts.length === 0 || reverting}>
                        Seleccionar todos los reversibles
                      </button>
                      <button type="button" style={{ ...ui.ghostBtn, ...responsiveActionButtonStyle }} onClick={clearReversalSelection} disabled={selectedReversalDetailIds.size === 0 || reverting}>
                        Deseleccionar todos
                      </button>
                    </div>
                  </div>
                  <label style={ui.fieldLabel}>Motivo de la reversion *</label>
                  <textarea
                    style={{ ...ui.input, minHeight: 78, resize: "vertical" }}
                    value={reversalReason}
                    onChange={(event) => {
                      setReversalReason(event.target.value);
                      setReversalError(null);
                    }}
                    maxLength={REVERSAL_REASON_MAX_LENGTH}
                    placeholder="Correccion de ajuste aplicado por error."
                    disabled={reverting}
                  />
                  <div style={filtersStacked ? { ...styles.fieldFooter, ...styles.fieldFooterStacked } : styles.fieldFooter}>
                    {!reversalReasonTrimmed && reversalReason.length > 0 ? (
                      <p style={styles.fieldErrorInline}>El motivo no puede quedar vacio.</p>
                    ) : (
                      <span />
                    )}
                    <span>{reversalReason.length} / {REVERSAL_REASON_MAX_LENGTH} caracteres</span>
                  </div>
                  <div style={filtersStacked ? { ...styles.footerActions, ...styles.footerActionsStacked } : styles.footerActions}>
                    <button type="button" style={{ ...ui.ghostBtn, ...responsiveActionButtonStyle }} onClick={resetReversalState} disabled={reverting}>
                      Cancelar
                    </button>
                    <button
                      type="button"
                      style={{ ...ui.primaryBtn, ...responsiveActionButtonStyle, opacity: canContinueReversal ? 1 : 0.65 }}
                      onClick={() => void openReversalConfirm()}
                      disabled={!canContinueReversal}
                    >
                      Continuar
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {reversalConfirmOpen && (
        <div style={overlayStyle} onClick={() => !reverting && setReversalConfirmOpen(false)}>
          <div style={getResponsiveModalStyle(620)} onClick={(event) => event.stopPropagation()}>
            <div style={ui.modalHeader}>
              <span style={ui.modalTitle}>Confirmar reversión</span>
              <button type="button" style={{ ...ui.linkBtn, ...styles.closeButton }} onClick={() => setReversalConfirmOpen(false)} disabled={reverting} aria-label="Cerrar confirmacion de reversion">
                <X size={18} />
              </button>
            </div>
            <div style={modalBodyStyle}>
              <div style={styles.reversalConfirmHeader}>
                <div style={styles.reversalConfirmIcon}>
                  <ShieldCheck size={18} />
                </div>
                <div>
                  <strong>Se revertirán {selectedReversalProducts.length} producto{selectedReversalProducts.length === 1 ? "" : "s"}.</strong>
                  <div style={styles.mutedSmall}>Ajuste original #{detailId} · {reversalReasonTrimmed}</div>
                </div>
              </div>
              <div style={styles.reversalSummaryList}>
                {selectedReversalProducts.map((product) => (
                  <div key={product.detailId} style={styles.reversalSummaryItem}>
                    <strong>{product.name}</strong>
                    <span>SKU: {product.sku}</span>
                    <span>
                      Precio actual: {product.currentSellPrice === null ? "-" : moneyExact(Number(product.currentSellPrice))} · Precio restaurado: {moneyExact(Number(product.targetSellPrice))}
                    </span>
                  </div>
                ))}
              </div>
              <label style={ui.fieldLabel}>PIN o contraseña *</label>
              <input
                type="password"
                style={ui.input}
                value={reversalCredential}
                onChange={(event) => {
                  setReversalCredential(event.target.value);
                  setReversalError(null);
                }}
                disabled={reverting}
                autoComplete="current-password"
              />
              {reversalError && <InlineAlert tone="error">{reversalError}</InlineAlert>}
              <div style={filtersStacked ? { ...styles.footerActions, ...styles.footerActionsStacked } : styles.footerActions}>
                <button type="button" style={{ ...ui.ghostBtn, ...responsiveActionButtonStyle }} onClick={() => setReversalConfirmOpen(false)} disabled={reverting}>
                  Volver
                </button>
                <button
                  type="button"
                  style={{ ...ui.primaryBtn, ...responsiveActionButtonStyle, opacity: reverting || !reversalCredential.trim() ? 0.65 : 1 }}
                  onClick={() => void confirmReversal()}
                  disabled={reverting || !reversalCredential.trim()}
                >
                  {reverting ? "Revirtiendo..." : "Revertir productos"}
                </button>
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
  tabsStacked: {
    width: "100%",
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  },
  tabButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    border: "none",
    borderRadius: 8,
    padding: "9px 14px",
    backgroundColor: "transparent",
    color: "var(--text-muted)",
    fontSize: 13,
    fontWeight: 800,
    cursor: "pointer",
    minWidth: 0,
    whiteSpace: "normal",
    textAlign: "center",
    lineHeight: 1.2,
  },
  tabButtonStacked: {
    width: "100%",
    padding: "10px 8px",
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
  compactOverlay: {
    ...ui.overlay,
    padding: 6,
    alignItems: "center",
    overflowY: "auto",
  },
  compactModalBody: {
    ...ui.modalBody,
    padding: 14,
  },
  closeButton: {
    width: 34,
    height: 34,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  responsiveActionButton: {
    height: "auto",
    minHeight: 38,
    maxWidth: "100%",
    whiteSpace: "normal",
    textAlign: "center",
    justifyContent: "center",
    lineHeight: 1.2,
    flexShrink: 0,
  },
  fullWidthActionButton: {
    width: "100%",
  },
  fullWidthControl: {
    width: "100%",
    minWidth: 0,
  },
  adjustFormGrid: {
    display: "grid",
    gap: 14,
    alignItems: "start",
  },
  adjustFieldGroup: {
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
  },
  adjustFieldMessage: {
    minHeight: 19,
    marginTop: 5,
    display: "flex",
    alignItems: "flex-start",
  },
  adjustFieldError: {
    color: "#b91c1c",
    fontSize: 12,
    fontWeight: 700,
    lineHeight: 1.25,
    margin: 0,
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
    minHeight: 30,
    padding: "5px 10px",
    borderRadius: 999,
    backgroundColor: "var(--surface-2)",
    border: "1px solid var(--border)",
    color: "var(--text-secondary)",
    fontSize: 12,
    fontWeight: 800,
    lineHeight: 1.2,
    whiteSpace: "normal",
    overflowWrap: "anywhere",
  },
  inlineActions: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  inlineActionsStacked: {
    width: "100%",
    alignItems: "stretch",
  },
  singleSearchToolbar: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
    width: "100%",
  },
  manualPickerToolbar: {
    display: "grid",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
    width: "100%",
  },
  manualPickerSearchControl: {
    minWidth: 0,
  },
  manualPickerCounter: {
    display: "inline-flex",
    alignItems: "center",
    minHeight: 30,
    padding: "5px 10px",
    borderRadius: 999,
    backgroundColor: "var(--surface-2)",
    border: "1px solid var(--border)",
    color: "var(--text-secondary)",
    fontSize: 12,
    fontWeight: 800,
    lineHeight: 1.2,
    whiteSpace: "normal",
    overflowWrap: "anywhere",
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
    overflowWrap: "anywhere",
  },
  mutedText: {
    color: "var(--text-muted)",
    fontSize: 13,
    fontWeight: 700,
    overflowWrap: "anywhere",
    minWidth: 0,
  },
  selectedRow: {
    backgroundColor: "rgba(59,130,246,0.06)",
  },
  valueInputWrap: {
    position: "relative",
  },
  valueInput: {
    ...ui.input,
    width: "100%",
    paddingLeft: 38,
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
  previewStatusRow: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    width: "100%",
    marginTop: 4,
    color: "var(--text-muted)",
    fontSize: 12,
    fontWeight: 800,
  },
  fieldError: {
    color: "#b91c1c",
    fontSize: 12,
    fontWeight: 700,
    marginTop: 5,
  },
  fieldErrorInline: {
    color: "#b91c1c",
    fontSize: 12,
    fontWeight: 700,
    margin: 0,
  },
  fieldFooter: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 5,
    color: "var(--text-faint)",
    fontSize: 12,
    fontWeight: 700,
  },
  fieldFooterStacked: {
    alignItems: "flex-start",
    flexDirection: "column",
    gap: 4,
  },
  inlineAlert: {
    border: "1px solid",
    borderRadius: 8,
    padding: "10px 12px",
    fontSize: 13,
    fontWeight: 700,
    marginTop: 12,
    overflowWrap: "anywhere",
    lineHeight: 1.35,
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
    minWidth: 0,
    overflowWrap: "anywhere",
    lineHeight: 1.3,
  },
  checkRowTop: {
    alignItems: "flex-start",
  },
  footerActions: {
    display: "flex",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
    marginTop: 18,
  },
  footerActionsStacked: {
    flexDirection: "column",
    alignItems: "stretch",
  },
  dateInput: {
    ...ui.filterSelect,
    width: "100%",
    minWidth: 0,
  },
  filterSelectFull: {
    ...ui.filterSelect,
    width: "100%",
    minWidth: 0,
    maxWidth: "100%",
  },
  historyFilterGrid: {
    display: "grid",
    gap: 10,
    alignItems: "start",
    width: "100%",
    marginBottom: 16,
  },
  historyFilterSearch: {
    minWidth: 0,
    width: "100%",
  },
  historyCardsList: {
    display: "grid",
    gap: 10,
    width: "100%",
  },
  historyCard: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    backgroundColor: "var(--surface)",
    padding: 12,
    display: "grid",
    gap: 12,
    minWidth: 0,
  },
  historyCardState: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    backgroundColor: "var(--surface)",
    padding: "24px 12px",
    textAlign: "center",
    color: "var(--text-muted)",
    fontSize: 13,
    fontWeight: 700,
  },
  historyCardHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
    minWidth: 0,
    flexWrap: "wrap",
  },
  historyCardTitle: {
    color: "var(--text)",
    fontSize: 13,
    fontWeight: 800,
    overflowWrap: "anywhere",
  },
  historyCardMuted: {
    color: "var(--text-faint)",
    fontSize: 12,
    fontWeight: 600,
    overflowWrap: "anywhere",
  },
  historyCardActionButton: {
    minHeight: 34,
    padding: "6px 8px",
    flexShrink: 0,
  },
  historyCardGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 150px), 1fr))",
    gap: 10,
  },
  historyCardField: {
    display: "grid",
    gap: 3,
    minWidth: 0,
    color: "var(--text-muted)",
    fontSize: 11,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: "0.2px",
    overflowWrap: "anywhere",
  },
  historyCardFieldWide: {
    gridColumn: "1 / -1",
  },
  historyCardValue: {
    color: "var(--text-secondary)",
    fontSize: 13,
    fontWeight: 800,
    textTransform: "none",
    letterSpacing: 0,
    lineHeight: 1.3,
    overflowWrap: "anywhere",
  },
  historyTableWrap: {
    ...ui.tableWrap,
    maxHeight: "64vh",
    overflowX: "auto",
    overflowY: "auto",
  },
  historyTable: {
    ...ui.table,
    minWidth: 1340,
    tableLayout: "fixed",
    marginTop: 0,
  },
  historyDateColumn: {
    width: 126,
  },
  historyUserColumn: {
    width: 150,
  },
  historyScopeColumn: {
    width: 96,
  },
  historyCategoryColumn: {
    width: 128,
  },
  historyOperationColumn: {
    width: 126,
  },
  historyValueColumn: {
    width: 82,
  },
  historyCountColumn: {
    width: 76,
  },
  historyBelowCostColumn: {
    width: 78,
  },
  historyReversalColumn: {
    width: 180,
  },
  historyReasonColumn: {
    width: 232,
  },
  historyActionsColumn: {
    width: 86,
  },
  historyTh: {
    ...ui.th,
    padding: "9px 10px",
    letterSpacing: "0.2px",
  },
  historyTd: {
    ...ui.td,
    padding: "9px 10px",
    verticalAlign: "middle",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  historyNowrapTd: {
    ...ui.td,
    padding: "9px 10px",
    verticalAlign: "middle",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  historyMoneyTd: {
    ...ui.td,
    padding: "9px 10px",
    textAlign: "right",
    verticalAlign: "middle",
    fontWeight: 800,
    whiteSpace: "nowrap",
  },
  historyNumberTd: {
    ...ui.td,
    padding: "9px 10px",
    textAlign: "right",
    verticalAlign: "middle",
    fontWeight: 800,
    whiteSpace: "nowrap",
  },
  historyCenterTd: {
    ...ui.td,
    padding: "9px 10px",
    textAlign: "center",
    verticalAlign: "middle",
    whiteSpace: "nowrap",
  },
  historyActionTd: {
    ...ui.td,
    padding: "9px 10px",
    textAlign: "center",
    verticalAlign: "middle",
    whiteSpace: "nowrap",
  },
  historyCellStack: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    minWidth: 0,
    lineHeight: 1.2,
  },
  historyPrimaryText: {
    display: "block",
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    color: "var(--text)",
    fontWeight: 800,
  },
  historySecondaryText: {
    display: "block",
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    color: "var(--text-faint)",
    fontSize: 11,
    fontWeight: 600,
  },
  historyTruncateText: {
    display: "block",
    minWidth: 0,
    maxWidth: "100%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  historyReasonText: {
    display: "block",
    minWidth: 0,
    maxWidth: "100%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    color: "var(--text-secondary)",
  },
  historyActionButton: {
    ...ui.linkBtn,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    padding: "4px 2px",
    whiteSpace: "nowrap",
  },
  historyPagination: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
    padding: "10px 12px",
    border: "1px solid var(--border)",
    borderRadius: 8,
    backgroundColor: "var(--surface)",
  },
  historyPaginationStacked: {
    alignItems: "stretch",
    flexDirection: "column",
  },
  historyPaginationText: {
    color: "var(--text-muted)",
    fontSize: 12,
    fontWeight: 700,
    overflowWrap: "anywhere",
  },
  historyPaginationControls: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
    flexWrap: "wrap",
  },
  historyPaginationControlsStacked: {
    width: "100%",
    alignItems: "stretch",
  },
  historyPageSizeLabel: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    color: "var(--text-muted)",
    fontSize: 12,
    fontWeight: 700,
  },
  historyPageSizeLabelStacked: {
    width: "100%",
    justifyContent: "space-between",
  },
  historyPageSizeSelect: {
    ...ui.filterSelect,
    height: 32,
    minWidth: 72,
    padding: "0 8px",
    fontSize: 12,
  },
  historyPagerButton: {
    ...ui.ghostBtn,
    height: 32,
    padding: "5px 10px",
    fontSize: 12,
    whiteSpace: "normal",
    justifyContent: "center",
  },
  historyPageText: {
    minWidth: 104,
    textAlign: "center",
    color: "var(--text-secondary)",
    fontSize: 12,
    fontWeight: 800,
  },
  historyPageTextStacked: {
    width: "100%",
    minWidth: 0,
  },
  pagination: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
    marginTop: 10,
    minWidth: 0,
  },
  detailFilterToolbar: {
    display: "grid",
    gridTemplateColumns: "minmax(240px, 400px) minmax(220px, 1fr)",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
    width: "100%",
  },
  detailFilterToolbarStacked: {
    gridTemplateColumns: "1fr",
    alignItems: "stretch",
  },
  detailSearchControl: {
    minWidth: 0,
  },
  reversalHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "10px 12px",
    backgroundColor: "var(--surface)",
    marginBottom: 12,
  },
  reversalHeaderText: {
    display: "flex",
    flexDirection: "column",
    gap: 3,
    color: "var(--text-secondary)",
    fontSize: 13,
    fontWeight: 700,
    minWidth: 0,
    overflowWrap: "anywhere",
  },
  reversalPanel: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: 12,
    backgroundColor: "var(--surface-2)",
    marginTop: 12,
    marginBottom: 12,
  },
  reversalStatusLine: {
    color: "var(--text-muted)",
    fontSize: 12,
    fontWeight: 800,
    marginBottom: 8,
  },
  reversalControls: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    flexWrap: "wrap",
    marginBottom: 12,
  },
  reversalControlsStacked: {
    alignItems: "stretch",
    flexDirection: "column",
  },
  reversalCounter: {
    color: "var(--text-secondary)",
    fontSize: 13,
    fontWeight: 800,
    overflowWrap: "anywhere",
  },
  reversalConflictList: {
    display: "grid",
    gap: 6,
    marginTop: 10,
    marginBottom: 10,
  },
  reversalConflictItem: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    border: "1px solid #fecaca",
    borderRadius: 8,
    padding: "8px 10px",
    backgroundColor: "#fef2f2",
    color: "#991b1b",
    fontSize: 12,
    fontWeight: 700,
  },
  reversalDisabledRow: {
    backgroundColor: "#fafafa",
    color: "var(--text-muted)",
  },
  reversalReasonText: {
    marginTop: 4,
    color: "#b91c1c",
    fontSize: 12,
    fontWeight: 700,
    lineHeight: 1.25,
  },
  reversalConfirmHeader: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    color: "var(--text)",
    marginBottom: 12,
    minWidth: 0,
  },
  reversalConfirmIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "var(--accent-soft)",
    color: "var(--accent-strong)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  kpiContent: {
    minWidth: 0,
  },
  reversalSummaryList: {
    display: "grid",
    gap: 8,
    maxHeight: 220,
    overflowY: "auto",
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: 10,
    marginBottom: 14,
    backgroundColor: "var(--surface)",
  },
  reversalSummaryItem: {
    display: "grid",
    gap: 2,
    color: "var(--text-secondary)",
    fontSize: 12,
    fontWeight: 700,
    overflowWrap: "anywhere",
    minWidth: 0,
  },
  confirmSummary: {
    display: "grid",
    gap: 9,
    color: "var(--text-secondary)",
    fontSize: 14,
    lineHeight: 1.45,
    overflowWrap: "anywhere",
    minWidth: 0,
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
