import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BadgePercent, ChevronDown, ChevronUp, Package, Pencil, Plus, Power, X } from "lucide-react";
import api from "../../shared/services/api";
import { useAdminData } from "../../shared/hooks";
import { DataTable, ActionModal } from "../../shared/ui";
import type { Column } from "../../shared/ui";
import {
  adminCategoryService,
  type AdminCategoryFlatItem,
} from "../services/categoryAdmin.service";
import {
  DECIMAL_INPUT_REGEX,
  getDecimalValidationValue,
  handleDecimalInputChange,
  validateDecimalField,
} from "../../shared/utils/decimalInput";
import { validateSafeText } from "../../shared/utils/formValidation";
import { useToast } from "../../shared/context/ToastContext";
import { ConfirmModal } from "../../shared/ui";
import {
  ui,
  type ViewProps,
  Toolbar,
  SearchInput,
  FilterSelect,
  MobileFilterDisclosure,
  Badge,
  SectionHeader,
  fmtDate,
  money,
  useMediaQuery,
  Pagination,
} from "./shared";

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

interface TaxRow {
  id: number;
  name: string;
  description: string | null;
  rate: number | string;
  active: boolean;
  createdAt: string;
  updatedAt?: string;
}

interface TaxResponse {
  success: boolean;
  message: string;
  data: TaxRow | TaxRow[];
}

interface LegacyTaxResponse {
  data?: unknown;
  taxes?: unknown;
}

type TaxProductScope = "ALL" | "DIVISION" | "DEPARTMENT" | "CATEGORY" | "UNCATEGORIZED";

interface TaxProductCategory {
  id: number;
  code: string;
  name: string;
  level: "DIVISION" | "DEPARTMENT" | "CATEGORY";
}

interface FormState {
  name: string;
  description: string;
  rate: string;
  active: boolean;
}

/** Producto para el modal de gestión de impuestos */
interface ProductForTax {
  id: number;
  sku: string;
  name: string;
  barcode: string | null;
  description: string | null;
  costPrice: number;
  sellPrice: number;
  active: boolean;
  assigned: boolean;
  categories: TaxProductCategory[];
}

interface TaxProductsPayload {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  assignedCount: number;
  assignedProductIds?: number[];
  products: ProductForTax[];
}

interface TaxProductsResponse {
  success: boolean;
  data: TaxProductsPayload;
}

type FieldErrors = Partial<Record<keyof FormState, string>>;

type TaxStatusFilter = "all" | "active" | "inactive";

const TAX_STATUS_OPTIONS: { value: TaxStatusFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "active", label: "Activos" },
  { value: "inactive", label: "Inactivos" },
];

const emptyForm: FormState = {
  name: "",
  description: "",
  rate: "",
  active: true,
};

const TAX_ENDPOINT = "/api/admin-tax/taxes";
const TAX_PRODUCT_LIMIT = 10;

const TAX_SCOPE_OPTIONS: Array<{ label: string; value: TaxProductScope }> = [
  { label: "Todos los productos", value: "ALL" },
  { label: "Por division", value: "DIVISION" },
  { label: "Por departamento", value: "DEPARTMENT" },
  { label: "Por categoria", value: "CATEGORY" },
  { label: "Productos sin categoria", value: "UNCATEGORIZED" },
];

const TAX_SCOPES_WITH_CATEGORY: TaxProductScope[] = ["DIVISION", "DEPARTMENT", "CATEGORY"];

const compactParams = (
  params: Record<string, string | number | boolean | undefined>
): Record<string, string | number | boolean> =>
  Object.fromEntries(
    Object.entries(params).filter(
      (entry): entry is [string, string | number | boolean] =>
        entry[1] !== undefined && entry[1] !== ""
    )
  );

const needsCategory = (scope: TaxProductScope) => TAX_SCOPES_WITH_CATEGORY.includes(scope);

const scopeLabel = (scope: TaxProductScope) => {
  if (scope === "DIVISION") return "Division";
  if (scope === "DEPARTMENT") return "Departamento";
  if (scope === "CATEGORY") return "Categoria";
  return "";
};

// ---------------------------------------------------------------------------
// Helpers de formato
// ---------------------------------------------------------------------------

const normalizeRate = (rate: number | string) => {
  const value = Number(rate);
  return Number.isFinite(value) ? value : 0;
};

const formatPercent = (rate: number | string) => {
  const percent = normalizeRate(rate) * 100;
  return `${percent.toLocaleString("es-MX", {
    minimumFractionDigits: percent % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 4,
  })}%`;
};

const formatDecimal = (rate: number | string) => {
  const value = normalizeRate(rate);
  return value.toLocaleString("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
};

const extractTaxes = (payload: TaxResponse | LegacyTaxResponse): TaxRow[] => {
  if (Array.isArray(payload?.data)) return payload.data as TaxRow[];
  if ("taxes" in payload && Array.isArray(payload.taxes)) return payload.taxes as TaxRow[];
  return [];
};

const getErrorMessage = (err: unknown, fallback: string) => {
  if (typeof err === "object" && err !== null && "response" in err) {
    const apiError = err as { response?: { data?: { message?: string } } };
    return apiError.response?.data?.message || fallback;
  }
  return fallback;
};

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

const ImpuestosView: React.FC<ViewProps> = ({ refreshToken }) => {
  const { showToast } = useToast();
  const [statusConfirmTarget, setStatusConfirmTarget] = useState<TaxRow | null>(null);
  const [expandedTaxes, setExpandedTaxes] = useState<Record<number, boolean>>({});
  const isMobile = useMediaQuery("(max-width: 1024px)");
  const isPhone = useMediaQuery("(max-width: 767px)");
  const isModalNarrow = useMediaQuery("(max-width: 1023px)");

  const toggleExpandTax = (id: number) =>
    setExpandedTaxes((prev) => ({ ...prev, [id]: !prev[id] }));

  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<TaxStatusFilter>("all");
  const [taxFiltersOpen, setTaxFiltersOpen] = useState(false);

  const [editing, setEditing] = useState<"create" | TaxRow | null>(null);
  const [form, setForm] = useState<FormState>({ ...emptyForm });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [statusUpdatingId, setStatusUpdatingId] = useState<number | null>(null);

  // ── Modal: Gestionar productos de un impuesto ──
  const [manageOpen, setManageOpen] = useState(false);
  const [managingTax, setManagingTax] = useState<TaxRow | null>(null);
  const [manageProducts, setManageProducts] = useState<ProductForTax[]>([]);
  const [managePagination, setManagePagination] = useState({
    page: 1,
    limit: TAX_PRODUCT_LIMIT,
    total: 0,
    totalPages: 1,
  });
  const [manageScope, setManageScope] = useState<TaxProductScope>("ALL");
  const [manageCategoryId, setManageCategoryId] = useState<number | undefined>(undefined);
  const [manageCategories, setManageCategories] = useState<AdminCategoryFlatItem[]>([]);
  const [manageCategoriesLoading, setManageCategoriesLoading] = useState(false);
  const [manageLoading, setManageLoading] = useState(false);
  const [manageError, setManageError] = useState<string | null>(null);
  const [manageSaving, setManageSaving] = useState(false);
  const [manageNotice, setManageNotice] = useState<string | null>(null);
  const [manageSearchInput, setManageSearchInput] = useState("");
  const [debouncedManageSearch, setDebouncedManageSearch] = useState("");
  const [managePage, setManagePage] = useState(1);
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());
  const [assignedProductIds, setAssignedProductIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data, loading, error: loadError, refetch } = useAdminData<TaxResponse | LegacyTaxResponse>(
    TAX_ENDPOINT,
    { params: debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {} }
  );
  const rows: TaxRow[] = data ? extractTaxes(data) : [];

  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshToken]);

  const activeCount = useMemo(() => rows.filter((r) => r.active).length, [rows]);
  const inactiveCount = rows.length - activeCount;

  const filteredRows = useMemo(
    () =>
      rows.filter((tax) =>
        statusFilter === "all" ? true : statusFilter === "active" ? tax.active : !tax.active
      ),
    [rows, statusFilter]
  );

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedManageSearch(manageSearchInput);
      setManagePage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [manageSearchInput]);

  const manageFilteredCategories = useMemo(() => {
    if (!needsCategory(manageScope)) return [];
    return manageCategories.filter((category) => category.level === manageScope);
  }, [manageCategories, manageScope]);

  const manageFilterColumns = isPhone
    ? "1fr"
    : isModalNarrow
      ? "minmax(0, 1fr) minmax(0, 1fr)"
      : needsCategory(manageScope)
        ? "minmax(180px, 240px) minmax(220px, 1fr) minmax(280px, 1.55fr)"
        : "minmax(190px, 260px) minmax(280px, 1fr)";

  // ── Formulario de impuesto ──
  const openCreate = () => {
    setForm({ ...emptyForm });
    setFieldErrors({});
    setFormError(null);
    setNotice(null);
    setEditing("create");
  };

  const openEdit = (tax: TaxRow) => {
    setForm({
      name: tax.name,
      description: tax.description || "",
      rate: String(normalizeRate(tax.rate)),
      active: tax.active,
    });
    setFieldErrors({});
    setFormError(null);
    setNotice(null);
    setEditing(tax);
  };

  const closeForm = () => {
    if (!saving) {
      setEditing(null);
      setFieldErrors({});
      setFormError(null);
    }
  };

  const validateForm = () => {
    const errors: FieldErrors = {};

    const nameError = validateSafeText(form.name, "El nombre del impuesto", { required: true, min: 2, max: 80 });
    if (nameError) errors.name = nameError;

    const descriptionError = validateSafeText(form.description, "La descripcion", { required: false, max: 180 });
    if (descriptionError) errors.description = descriptionError;

    const rate = validateDecimalField(form.rate, "La tasa del impuesto", {
      invalidMessage: "La tasa debe ser un numero valido con maximo 3 decimales.",
      minMessage: "La tasa no puede ser negativa.",
      max: 1,
      maxMessage: "La tasa no puede ser mayor a 100%.",
    });
    if (!rate.ok) {
      errors.rate = rate.error;
    }

    return errors;
  };

  const syncStatus = async (id: number, active: boolean) => {
    await api.put(`${TAX_ENDPOINT}/status`, { id, status: active });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validation = validateForm();
    if (Object.keys(validation).length > 0) {
      setFieldErrors(validation);
      setFormError("Revisa los campos marcados antes de guardar.");
      return;
    }
    const rate = validateDecimalField(form.rate, "La tasa del impuesto", {
      invalidMessage: "La tasa debe ser un numero valido con maximo 3 decimales.",
      minMessage: "La tasa no puede ser negativa.",
      max: 1,
      maxMessage: "La tasa no puede ser mayor a 100%.",
    });
    const rateValue = getDecimalValidationValue(rate);
    if (!rateValue) return;

    const desiredActive = form.active;
    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      rate: rateValue.value,
      active: true,
    };

    setSaving(true);
    setFormError(null);
    setFieldErrors({});
    try {
      if (rateValue.roundedMessage) {
        showToast(rateValue.roundedMessage, "warning");
      }

      if (editing === "create") {
        const res = await api.post<TaxResponse>(TAX_ENDPOINT, payload);
        const created = Array.isArray(res.data.data) ? null : res.data.data;
        if (created?.id && !desiredActive) {
          await syncStatus(created.id, false);
        }
        setNotice("Impuesto creado correctamente.");
      } else if (editing) {
        await api.put(TAX_ENDPOINT, {
          id: editing.id,
          ...payload,
        });
        if (!desiredActive) {
          await syncStatus(editing.id, false);
        }
        setNotice("Impuesto actualizado correctamente.");
      }

      setEditing(null);
      setForm({ ...emptyForm });
      setFieldErrors({});
      await refetch();
    } catch (err: unknown) {
      setFormError(getErrorMessage(err, "No se pudo guardar el impuesto."));
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = (tax: TaxRow) => {
    setStatusConfirmTarget(tax);
  };

  const confirmToggleStatus = async () => {
    const tax = statusConfirmTarget;
    if (!tax) return;
    setStatusConfirmTarget(null);
    const next = !tax.active;

    setStatusUpdatingId(tax.id);
    setMutationError(null);
    setNotice(null);
    try {
      await syncStatus(tax.id, next);
      showToast(`Impuesto ${next ? "activado" : "desactivado"} correctamente.`, "error");
      await refetch();
    } catch (err: unknown) {
      setMutationError(getErrorMessage(err, "No se pudo actualizar el estado del impuesto."));
    } finally {
      setStatusUpdatingId(null);
    }
  };

  // ── Gestión masiva de productos ──
  const loadManageCategories = useCallback(async () => {
    setManageCategoriesLoading(true);
    try {
      const categories = await adminCategoryService.listFlat({ active: true });
      setManageCategories(categories);
    } catch (err: unknown) {
      setManageCategories([]);
      setManageError(getErrorMessage(err, "No se pudieron cargar las categorias."));
    } finally {
      setManageCategoriesLoading(false);
    }
  }, []);

  const loadManageProducts = useCallback(async () => {
    if (!manageOpen || !managingTax) return;

    if (needsCategory(manageScope) && !manageCategoryId) {
      setManageProducts([]);
      setManagePagination({ page: 1, limit: TAX_PRODUCT_LIMIT, total: 0, totalPages: 1 });
      setManageError(null);
      return;
    }

    setManageLoading(true);
    setManageError(null);
    try {
      const res = await api.get<TaxProductsResponse>(
        `/api/admin-tax/taxes/${managingTax.id}/products`,
        {
          params: compactParams({
            search: debouncedManageSearch.trim() || undefined,
            scope: manageScope,
            categoryId: manageCategoryId,
            page: managePage,
            limit: TAX_PRODUCT_LIMIT,
            includeAssociated: true,
          }),
        }
      );

      const payload = res.data.data;
      setManageProducts(payload.products);
      setManagePagination({
        page: payload.page,
        limit: payload.limit,
        total: payload.total,
        totalPages: Math.max(payload.totalPages, 1),
      });
      setAssignedProductIds(
        new Set(payload.assignedProductIds ?? payload.products.filter((product) => product.assigned).map((product) => product.id))
      );
    } catch (err: unknown) {
      setManageProducts([]);
      setManageError(getErrorMessage(err, "No se pudieron cargar los productos."));
    } finally {
      setManageLoading(false);
    }
  }, [
    debouncedManageSearch,
    manageCategoryId,
    manageOpen,
    managePage,
    manageScope,
    managingTax,
  ]);

  useEffect(() => {
    if (manageOpen) void loadManageProducts();
  }, [loadManageProducts, manageOpen]);

  const openManage = (tax: TaxRow) => {
    setManagingTax(tax);
    setManageScope("ALL");
    setManageCategoryId(undefined);
    setManageSearchInput("");
    setDebouncedManageSearch("");
    setManagePage(1);
    setManagePagination({ page: 1, limit: TAX_PRODUCT_LIMIT, total: 0, totalPages: 1 });
    setManageNotice(null);
    setManageError(null);
    setManageOpen(true);
    setCheckedIds(new Set());
    setAssignedProductIds(new Set());
    setManageProducts([]);
    void loadManageCategories();
  };

  const closeManage = () => {
    if (manageSaving) return;
    setManageOpen(false);
    setManagingTax(null);
    setManageProducts([]);
    setManageCategories([]);
    setManageScope("ALL");
    setManageCategoryId(undefined);
    setManagePagination({ page: 1, limit: TAX_PRODUCT_LIMIT, total: 0, totalPages: 1 });
    setManagePage(1);
    setDebouncedManageSearch("");
    setCheckedIds(new Set());
    setAssignedProductIds(new Set());
    setManageSearchInput("");
    setManageNotice(null);
    setManageError(null);
  };

  const saveManage = async () => {
    if (!managingTax || manageSaving || checkedIds.size === 0) return;
    setManageSaving(true);
    setManageNotice(null);
    setManageError(null);
    try {
      const productIds = [...new Set([...assignedProductIds, ...checkedIds])];
      await api.put(`/api/admin-tax/taxes/${managingTax.id}/products`, {
        productIds,
      });
      setManageNotice("Impuesto asignado correctamente a los productos seleccionados.");
      setCheckedIds(new Set());
      await loadManageProducts();
    } catch (err: unknown) {
      setManageError(getErrorMessage(err, "No se pudo guardar la asignación."));
    } finally {
      setManageSaving(false);
    }
  };

  const changeManageScope = (scope: TaxProductScope) => {
    setManageScope(scope);
    setManageCategoryId(undefined);
    setCheckedIds(new Set());
    setManagePage(1);
  };

  const changeManageCategory = (categoryId: number | undefined) => {
    setManageCategoryId(categoryId);
    setCheckedIds(new Set());
    setManagePage(1);
  };

  const toggleChecked = (product: ProductForTax) => {
    if (product.assigned || !product.active || !managingTax?.active) return;
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(product.id)) next.delete(product.id);
      else next.add(product.id);
      return next;
    });
  };

  const selectableVisibleProducts = manageProducts.filter(
    (product) => product.active && !product.assigned && Boolean(managingTax?.active)
  );
  const allVisibleChecked =
    selectableVisibleProducts.length > 0 &&
    selectableVisibleProducts.every((product) => checkedIds.has(product.id));

  const selectVisible = () => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      selectableVisibleProducts.forEach((product) => next.add(product.id));
      return next;
    });
  };

  const clearSelection = () => setCheckedIds(new Set());

  const toggleAllVisible = () => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      selectableVisibleProducts.forEach((product) => {
        if (allVisibleChecked) next.delete(product.id);
        else next.add(product.id);
      });
      return next;
    });
  };

  // ── Input handlers ──
  const set =
    (key: keyof FormState) =>
      (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const value = e.target.value;
        setForm((f) => ({ ...f, [key]: value }));
        setFormError(null);
        setFieldErrors((prev) => {
          const next = { ...prev };
          const error =
            key === "name"
              ? validateSafeText(value, "El nombre del impuesto", { required: true, min: 2, max: 80 })
              : key === "description"
                ? validateSafeText(value, "La descripcion", { required: false, max: 180 })
                : undefined;
          if (error) next[key] = error;
          else delete next[key];
          return next;
        });
      };

  const setRate = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value.trim();
    if (rawValue && !DECIMAL_INPUT_REGEX.test(rawValue)) {
      setFieldErrors((prev) => ({ ...prev, rate: "La tasa debe ser un numero valido con maximo 3 decimales." }));
      return;
    }
    handleDecimalInputChange(rawValue, (nextValue) => {
      setForm((f) => ({ ...f, rate: nextValue }));
      setFormError(null);
      const rate = validateDecimalField(nextValue, "La tasa del impuesto", {
        invalidMessage: "La tasa debe ser un numero valido con maximo 3 decimales.",
        minMessage: "La tasa no puede ser negativa.",
        max: 1,
        maxMessage: "La tasa no puede ser mayor a 100%.",
      });
      setFieldErrors((prev) => {
        const next = { ...prev };
        if (!rate.ok) next.rate = rate.error;
        else delete next.rate;
        return next;
      });
    });
  };

  // ── Columnas para tabla desktop ──
  const columns: Column<TaxRow>[] = [
    {
      key: "id",
      header: "ID",
      width: "70px",
      render: (tax) => <span style={{ fontWeight: 800, color: "var(--accent-strong)" }}>{tax.id}</span>,
    },
    {
      key: "name",
      header: "Nombre",
      width: "200px",
      render: (tax) => (
        <span style={{ fontWeight: 800, color: "var(--text)", whiteSpace: "normal" }}>{tax.name}</span>
      ),
    },
    {
      key: "description",
      header: "Descripcion",
      render: (tax) => (
        <span style={{ color: "var(--text-secondary)", whiteSpace: "normal" }}>{tax.description || "Sin descripcion"}</span>
      ),
    },
    {
      key: "rate",
      header: "Tasa",
      align: "right",
      width: "140px",
      render: (tax) => (
        <div>
          <div style={{ fontWeight: 800, color: "var(--text)" }}>{formatPercent(tax.rate)}</div>
          <div style={{ fontSize: 11, color: "var(--text-faint)" }}>decimal {formatDecimal(tax.rate)}</div>
        </div>
      ),
    },
    {
      key: "active",
      header: "Estado",
      align: "center",
      width: "110px",
      render: (tax) => (
        <Badge tone={tax.active ? "green" : "red"}>{tax.active ? "Activo" : "Inactivo"}</Badge>
      ),
    },
    {
      key: "createdAt",
      header: "Fecha de creacion",
      width: "160px",
      render: (tax) => <span style={{ color: "var(--text-muted)" }}>{fmtDate(tax.createdAt)}</span>,
    },
    {
      key: "actions",
      header: "Acciones",
      align: "center",
      width: "260px",
      render: (tax) => (
        <div style={styles.actions}>
          <button
            style={{ ...ui.linkBtn, color: "var(--accent-strong)" }}
            className="active-tap"
            onClick={() => openManage(tax)}
            title="Gestionar productos"
          >
            <Package size={14} style={{ verticalAlign: "-2px" }} /> Productos
          </button>
          <button style={ui.linkBtn} className="active-tap" onClick={() => openEdit(tax)}>
            <Pencil size={14} style={{ verticalAlign: "-2px" }} /> Editar
          </button>
          <button
            style={{
              ...ui.linkBtn,
              color: tax.active ? "#b91c1c" : "#15803d",
              opacity: statusUpdatingId === tax.id ? 0.55 : 1,
            }}
            className="active-tap"
            disabled={statusUpdatingId === tax.id}
            onClick={() => toggleStatus(tax)}
          >
            <Power size={14} style={{ verticalAlign: "-2px" }} /> {tax.active ? "Desactivar" : "Activar"}
          </button>
        </div>
      ),
    },
  ];

  // ── JSX ──
  return (
    <div>
      <SectionHeader
        title="Impuestos"
        subtitle="Catalogo de tasas fiscales usadas por el punto de venta"
        right={
          <button style={ui.primaryBtn} className="active-tap" onClick={openCreate}>
            <Plus size={16} /> Nuevo impuesto
          </button>
        }
      />

      {isMobile ? (
        <div style={styles.mobileFilterStack}>
          <SearchInput value={search} onChange={setSearch} placeholder="Buscar por nombre o ID" />
          <MobileFilterDisclosure
            id="impuestos-mobile-filters"
            title="Filtros"
            activeCount={statusFilter !== "all" ? 1 : 0}
            isOpen={taxFiltersOpen}
            onToggle={() => setTaxFiltersOpen((current) => !current)}
          >
            <FilterSelect
              value={statusFilter}
              onChange={(value) => setStatusFilter(value as TaxStatusFilter)}
              options={TAX_STATUS_OPTIONS}
              style={{ width: "100%" }}
            />
          </MobileFilterDisclosure>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#15803d", fontSize: 13, fontWeight: 700 }}>
              <BadgePercent size={16} /> {activeCount} activo{activeCount === 1 ? "" : "s"}
            </span>
            {inactiveCount > 0 && (
              <span style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: 700 }}>
                {inactiveCount} inactivo{inactiveCount === 1 ? "" : "s"}
              </span>
            )}
            <span style={{ marginLeft: "auto", fontSize: 13, color: "var(--text-muted)", fontWeight: 600 }}>
              {filteredRows.length} impuesto{filteredRows.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>
      ) : (
        <Toolbar>
          <SearchInput value={search} onChange={setSearch} placeholder="Buscar por nombre o ID" />
          <FilterSelect
            value={statusFilter}
            onChange={(value) => setStatusFilter(value as TaxStatusFilter)}
            options={TAX_STATUS_OPTIONS}
          />
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#15803d", fontSize: 13, fontWeight: 700 }}>
            <BadgePercent size={16} /> {activeCount} activo{activeCount === 1 ? "" : "s"}
          </span>
          {inactiveCount > 0 && (
            <span style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: 700 }}>
              {inactiveCount} inactivo{inactiveCount === 1 ? "" : "s"}
            </span>
          )}
          <span style={{ marginLeft: "auto", fontSize: 13, color: "var(--text-muted)", fontWeight: 600 }}>
            {filteredRows.length} impuesto{filteredRows.length === 1 ? "" : "s"}
          </span>
        </Toolbar>
      )}

      {notice && (
        <div style={styles.notice} role="status">
          {notice}
        </div>
      )}

      {isMobile ? (
        /* ── Mobile / Tablet: Card-based layout ── */
        <div style={{ overflowY: "auto", maxHeight: "62vh", padding: "8px 16px" }}>
          {/* Header row */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "1.4fr 0.8fr 0.8fr 1fr",
            padding: isPhone ? "8px 10px" : "12px 16px",
            fontWeight: 700,
            fontSize: isPhone ? 9 : 11,
            color: "var(--text-muted)",
            textTransform: "uppercase" as const,
            letterSpacing: "0.4px",
          }}>
            <div>Nombre</div>
            <div style={{ textAlign: "center" }}>Tasa</div>
            <div style={{ textAlign: "center" }}>Estado</div>
            <div style={{ textAlign: "right", paddingRight: 8 }}>Acción</div>
          </div>

          {loading && (
            <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--text-faint)", fontSize: 13, fontWeight: 500 }}>
              Cargando información...
            </div>
          )}
          {!loading && loadError && (
            <div style={{ textAlign: "center", padding: "32px 16px", color: "#b91c1c", fontSize: 13, fontWeight: 500 }}>
              {loadError}
            </div>
          )}
          {!loading && !loadError && filteredRows.length === 0 && (
            <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--text-faint)", fontSize: 13, fontWeight: 500 }}>
              {search.trim() || statusFilter !== "all" ? "No hay impuestos que coincidan con la búsqueda." : "No hay impuestos registrados."}
            </div>
          )}

          {!loading &&
            !loadError &&
            filteredRows.map((tax) => {
              const isExpanded = expandedTaxes[tax.id];
              return (
                <div
                  key={tax.id}
                  style={{
                    backgroundColor: "var(--surface)",
                    border: "1px solid var(--border-soft)",
                    borderRadius: 16,
                    padding: 16,
                    marginBottom: 12,
                    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Nombre */}
                      <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", marginBottom: 4, wordBreak: "break-word" }}>
                        {tax.name}
                      </div>
                      {/* Tasa */}
                      <div style={{ fontSize: 13, fontWeight: 800, color: "var(--accent-strong)", marginBottom: 6 }}>
                        {formatPercent(tax.rate)}
                      </div>
                      {/* Estado */}
                      <div>
                        <Badge tone={tax.active ? "green" : "red"}>{tax.active ? "Activo" : "Inactivo"}</Badge>
                      </div>
                    </div>

                    {/* Solo Chevron en la fila principal */}
                    <div style={{ display: "flex", alignItems: "center", paddingTop: 2 }}>
                      <button
                        onClick={() => toggleExpandTax(tax.id)}
                        style={{
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                          backgroundColor: "var(--surface)", border: "1px solid var(--border-strong)",
                          borderRadius: 8, width: 38, height: 38, cursor: "pointer",
                          color: "var(--text-muted)", padding: 0,
                        }}
                        className="active-tap"
                      >
                        {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </button>
                    </div>
                  </div>

                  {/* Detalle expandido */}
                  {isExpanded && (
                    <div style={{
                      marginTop: 12,
                      paddingTop: 12,
                      borderTop: "1px solid var(--border-soft)",
                    }}>
                      {/* Botones de acción (solo iconos) antes del ID */}
                      <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                        {/* Gestionar productos */}
                        <button
                          onClick={() => openManage(tax)}
                          style={{
                            display: "inline-flex", alignItems: "center", justifyContent: "center",
                            backgroundColor: "var(--accent-soft)", border: "1px solid var(--border)",
                            borderRadius: 8, width: 38, height: 38, cursor: "pointer",
                            color: "var(--accent-strong)", padding: 0,
                          }}
                          className="active-tap"
                          title="Gestionar productos"
                        >
                          <Package size={16} />
                        </button>

                        {/* Editar */}
                        <button
                          onClick={() => openEdit(tax)}
                          style={{
                            display: "inline-flex", alignItems: "center", justifyContent: "center",
                            backgroundColor: "#eff6ff", border: "1px solid #bfdbfe",
                            borderRadius: 8, width: 38, height: 38, cursor: "pointer",
                            color: "var(--accent-strong)", padding: 0,
                          }}
                          className="active-tap"
                          title="Editar impuesto"
                        >
                          <Pencil size={16} />
                        </button>

                        {/* Activar/Desactivar */}
                        <button
                          onClick={() => toggleStatus(tax)}
                          disabled={statusUpdatingId === tax.id}
                          style={{
                            display: "inline-flex", alignItems: "center", justifyContent: "center",
                            backgroundColor: tax.active ? "#fef2f2" : "#f0fdf4",
                            border: `1px solid ${tax.active ? "#fecaca" : "#bbf7d0"}`,
                            borderRadius: 8, width: 38, height: 38, cursor: "pointer",
                            color: tax.active ? "#b91c1c" : "#15803d", padding: 0,
                            opacity: statusUpdatingId === tax.id ? 0.55 : 1,
                          }}
                          className="active-tap"
                          title={tax.active ? "Desactivar" : "Activar"}
                        >
                          <Power size={16} />
                        </button>
                      </div>

                      <div style={{
                        backgroundColor: "var(--surface-2)",
                        borderRadius: 8,
                        border: "1px solid var(--border)",
                        padding: 16,
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                        gap: 16,
                        textAlign: "left",
                      }}>
                        <div>
                          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase" as const, letterSpacing: "0.3px", marginBottom: 4 }}>ID</div>
                          <div style={{ fontSize: 13, fontWeight: 800, color: "var(--accent-strong)" }}>{tax.id}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase" as const, letterSpacing: "0.3px", marginBottom: 4 }}>Tasa decimal</div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-secondary)" }}>{formatDecimal(tax.rate)}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase" as const, letterSpacing: "0.3px", marginBottom: 4 }}>Descripción</div>
                          <div style={{ fontSize: 13, color: "var(--text-secondary)", wordBreak: "break-word" }}>{tax.description || "Sin descripción"}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase" as const, letterSpacing: "0.3px", marginBottom: 4 }}>Fecha de creación</div>
                          <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{fmtDate(tax.createdAt)}</div>
                        </div>
                        {tax.updatedAt && (
                          <div>
                            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase" as const, letterSpacing: "0.3px", marginBottom: 4 }}>Última actualización</div>
                            <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{fmtDate(tax.updatedAt)}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      ) : (
        <div className="table-sticky-head">
          <style>{`
            .table-sticky-head table {
              width: 100%;
            }
            .table-sticky-head thead th {
              position: sticky;
              top: 0;
              z-index: 1;
              background: var(--surface-2);
            }
            /* Permite que el scrollbar vertical se superponga (overlay) para que las filas ocupen el 100% del ancho */
            .table-sticky-head > div {
              overflow-y: overlay !important;
            }
            /* Estilos premium para los scrollbars del contenedor de la tabla */
            .table-sticky-head > div::-webkit-scrollbar {
              width: 8px;
              height: 8px;
            }
            .table-sticky-head > div::-webkit-scrollbar-track {
              background: transparent;
            }
            .table-sticky-head > div::-webkit-scrollbar-thumb {
              background: var(--border-strong);
              border-radius: 4px;
            }
            .table-sticky-head > div::-webkit-scrollbar-thumb:hover {
              background: var(--accent);
            }
          `}</style>
          <DataTable
            columns={columns}
            data={filteredRows}
            loading={loading}
            error={loadError || mutationError}
            emptyMessage={
              debouncedSearch.trim() || statusFilter !== "all"
                ? "No hay impuestos que coincidan con la busqueda."
                : "No hay impuestos registrados."
            }
            keyExtractor={(tax) => tax.id}
            height="calc(100vh - 275px)"
          />
        </div>
      )}

      {/* ── Modal: Editar / Crear impuesto ── */}
      <ActionModal
        isOpen={editing !== null}
        onClose={closeForm}
        title={editing === "create" ? "Registrar nuevo impuesto" : "Editar impuesto"}
        size="md"
      >
        <form onSubmit={submit}>
          <div style={{ marginBottom: 14 }}>
            <label style={ui.fieldLabel}>Nombre *</label>
            <input style={ui.input} value={form.name} onChange={set("name")} placeholder="IVA" maxLength={80} autoFocus />
            {fieldErrors.name && <p style={styles.fieldError}>{fieldErrors.name}</p>}
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={ui.fieldLabel}>Descripcion</label>
            <textarea
              style={{ ...ui.input, minHeight: 82, resize: "vertical" }}
              value={form.description}
              onChange={set("description")}
              placeholder="Impuesto al valor agregado"
              maxLength={180}
            />
            {fieldErrors.description && <p style={styles.fieldError}>{fieldErrors.description}</p>}
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={ui.fieldLabel}>Tasa decimal *</label>
            <input type="text" style={ui.input} value={form.rate} onChange={setRate} placeholder="0.16" inputMode="decimal" />
            <p style={styles.helpText}>Use formato decimal: IVA 16% = 0.16, IEPS 8% = 0.08.</p>
            {fieldErrors.rate && <p style={styles.fieldError}>{fieldErrors.rate}</p>}
          </div>

          <label style={styles.checkRow}>
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
              style={styles.check}
            />
            <span>Impuesto activo</span>
          </label>

          {formError && <p style={styles.formError}>{formError}</p>}

          <div style={styles.formActions}>
            <button type="button" style={{ ...ui.ghostBtn, flex: 1, justifyContent: "center" }} onClick={closeForm}>
              Cancelar
            </button>
            <button type="submit" disabled={saving} style={{ ...ui.primaryBtn, flex: 1, justifyContent: "center" }}>
              {saving ? "Guardando..." : editing === "create" ? "Guardar impuesto" : "Guardar cambios"}
            </button>
          </div>
        </form>
      </ActionModal>

      {/* ── Modal: Gestionar productos de un impuesto ── */}
      {manageOpen && managingTax && (
        <div style={{
          position: "fixed", inset: 0,
          backgroundColor: "rgba(15,23,42,0.55)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 300, padding: isPhone ? 8 : 20,
        }}>
          <div style={{
            backgroundColor: "var(--surface)", borderRadius: 16,
            boxShadow: "0 24px 48px rgba(0,0,0,0.2)",
            width: "100%", maxWidth: 1040, maxHeight: isPhone ? "96vh" : "88vh",
            display: "flex", flexDirection: "column", overflow: "hidden",
          }}>

            {/* Header */}
            <div style={{
              padding: isPhone ? "16px 16px 12px" : "18px 24px 14px", borderBottom: "1px solid var(--border)",
              display: "flex", justifyContent: "space-between", alignItems: "flex-start",
              flexShrink: 0,
            }}>
              <div>
                <h2 style={{ fontSize: 17, fontWeight: 800, color: "var(--text)", margin: 0 }}>
                  Gestionar productos
                </h2>
                <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "4px 0 0", fontWeight: 600 }}>
                  {managingTax.name}
                  {!managingTax.active && (
                    <span style={{ marginLeft: 8, color: "#b91c1c" }}>· Inactivo</span>
                  )}
                </p>
              </div>
              <button
                onClick={closeManage}
                disabled={manageSaving}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  color: "var(--text-muted)", padding: 4, lineHeight: 1,
                  opacity: manageSaving ? 0.5 : 1, borderRadius: 6,
                }}
                className="active-tap"
              >
                <X size={20} />
              </button>
            </div>

            {/* Subheader: advertencia + filtros + avisos */}
            <div style={{
              padding: isPhone ? "12px 16px 10px" : "12px 24px 10px",
              borderBottom: "1px solid var(--border-soft)",
              flexShrink: 0,
            }}>
              {!managingTax.active && (
                <div style={{
                  backgroundColor: "#fef3c7", border: "1px solid #fde68a",
                  borderRadius: 8, padding: "8px 12px", marginBottom: 12,
                  fontSize: 13, color: "#92400e", fontWeight: 600,
                }}>
                  Este impuesto esta inactivo. No puedes asignar nuevos productos a el.
                </div>
              )}

              <div style={{ ...styles.manageFilters, gridTemplateColumns: manageFilterColumns }}>
                <div style={styles.manageFilterGroup}>
                  <label style={ui.fieldLabel}>Alcance</label>
                  <select
                    style={{ ...ui.input, height: 38 }}
                    value={manageScope}
                    onChange={(event) => changeManageScope(event.target.value as TaxProductScope)}
                    disabled={manageSaving}
                  >
                    {TAX_SCOPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                {needsCategory(manageScope) && (
                  <div style={styles.manageFilterGroup}>
                    <label style={ui.fieldLabel}>{scopeLabel(manageScope)}</label>
                    {manageCategoriesLoading ? (
                      <div style={styles.manageSelectPlaceholder}>Cargando categorias...</div>
                    ) : (
                      <select
                        style={{ ...ui.input, height: 38 }}
                        value={manageCategoryId ?? ""}
                        onChange={(event) =>
                          changeManageCategory(event.target.value ? Number(event.target.value) : undefined)
                        }
                        disabled={manageSaving}
                      >
                        <option value="">Selecciona {scopeLabel(manageScope).toLowerCase()}...</option>
                        {manageFilteredCategories.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.pathLabel || `${category.code} ${category.name}`}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}

                <div style={{
                  ...styles.manageSearchGroup,
                  gridColumn: isModalNarrow ? "1 / -1" : undefined,
                }}>
                  <label style={{ ...ui.fieldLabel, display: "block", marginBottom: 4 }}>Buscar</label>
                  <SearchInput
                    value={manageSearchInput}
                    onChange={setManageSearchInput}
                    placeholder="Buscar por SKU, codigo, nombre o descripcion"
                  />
                </div>
              </div>

              <p style={styles.helpText}>
                Los productos se muestran segun el alcance de categorias seleccionado. El filtro solo ayuda a encontrarlos; la asignacion sigue siendo manual.
              </p>

              <div style={styles.manageSelectionBar}>
                <span style={{
                  ...styles.manageCounter,
                  flexBasis: isPhone ? "100%" : "auto",
                }}>
                  <span style={{ color: "var(--accent-strong)", fontWeight: 800 }}>{checkedIds.size}</span>{" "}
                  seleccionado{checkedIds.size !== 1 ? "s" : ""}{" "}
                  · {assignedProductIds.size} ya asociado{assignedProductIds.size !== 1 ? "s" : ""}
                  {" "}· {managePagination.total} resultado{managePagination.total !== 1 ? "s" : ""}
                </span>
                <div style={{
                  ...styles.manageSelectionActions,
                  width: isPhone ? "100%" : undefined,
                }}>
                  <button
                    onClick={selectVisible}
                    disabled={manageSaving || manageLoading || selectableVisibleProducts.length === 0 || allVisibleChecked}
                    style={{
                      ...ui.ghostBtn,
                      ...styles.manageSmallButton,
                      flex: isPhone ? 1 : undefined,
                      opacity: selectableVisibleProducts.length === 0 || allVisibleChecked ? 0.55 : 1,
                    }}
                    className="active-tap"
                  >
                    Seleccionar visibles
                  </button>
                  <button
                    onClick={clearSelection}
                    disabled={manageSaving || checkedIds.size === 0}
                    style={{
                      ...ui.ghostBtn,
                      ...styles.manageSmallButton,
                      flex: isPhone ? 1 : undefined,
                      opacity: checkedIds.size === 0 ? 0.55 : 1,
                    }}
                    className="active-tap"
                  >
                    Limpiar seleccion
                  </button>
                </div>
              </div>

              {manageNotice && (
                <div style={{
                  backgroundColor: "#ecfdf5", border: "1px solid #bbf7d0",
                  borderRadius: 8, padding: "8px 12px", marginTop: 10,
                  fontSize: 13, color: "#15803d", fontWeight: 700,
                }}>
                  {manageNotice}
                </div>
              )}
              {manageError && (
                <div style={{
                  backgroundColor: "#fef2f2", border: "1px solid #fecaca",
                  borderRadius: 8, padding: "8px 12px", marginTop: 10,
                  fontSize: 13, color: "#b91c1c", fontWeight: 700,
                }}>
                  {manageError}
                </div>
              )}
            </div>

            {/* Lista de productos */}
            <div style={{
              ...styles.manageProductsArea,
              padding: isPhone ? "0 16px 12px" : "0 24px 14px",
            }}>
              {manageLoading && (
                <div style={{ textAlign: "center", padding: 40, color: "var(--text-faint)", fontSize: 13, fontWeight: 500 }}>
                  Cargando productos...
                </div>
              )}
              {!manageLoading && needsCategory(manageScope) && !manageCategoryId && (
                <div style={{ textAlign: "center", padding: 40, color: "var(--text-faint)", fontSize: 13, fontWeight: 500 }}>
                  Selecciona una {scopeLabel(manageScope).toLowerCase()} para ver productos.
                </div>
              )}
              {!manageLoading && (!needsCategory(manageScope) || manageCategoryId) && manageProducts.length === 0 && (
                <div style={{ textAlign: "center", padding: 40, color: "var(--text-faint)", fontSize: 13, fontWeight: 500 }}>
                  {debouncedManageSearch.trim()
                    ? "No se encontraron productos con esa busqueda."
                    : "No hay productos activos disponibles con estos filtros."}
                </div>
              )}

              {!manageLoading && manageProducts.length > 0 && (
                isPhone ? (
                  /* ── Mobile: cards ── */
                  <div style={styles.manageCardsScroll}>
                    {manageProducts.map((p) => {
                      const isChecked = checkedIds.has(p.id);
                      const disabled = p.assigned || !p.active || !managingTax.active;
                      return (
                        <div
                          key={p.id}
                          onClick={() => toggleChecked(p)}
                          style={{
                            display: "grid", gridTemplateColumns: "24px 1fr auto", gap: 12,
                            padding: "12px 8px", borderBottom: "1px solid var(--border-soft)",
                            cursor: disabled ? "default" : "pointer", borderRadius: 6,
                            backgroundColor: isChecked ? "rgba(59,130,246,0.06)" : undefined,
                            opacity: disabled ? 0.68 : 1,
                            transition: "background-color 0.1s",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => { }}
                            disabled={manageSaving || disabled}
                            style={{ width: 16, height: 16, accentColor: "var(--accent)", cursor: "pointer", flexShrink: 0 }}
                          />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {p.name}
                            </div>
                            <div style={{ fontSize: 11, color: "var(--text-faint)", fontFamily: "monospace" }}>
                              {p.sku} · {p.barcode || "Sin codigo"}
                            </div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                              {p.categories.length === 0 ? (
                                <span style={styles.noCatBadge}>Sin categoria</span>
                              ) : (
                                p.categories.map((category) => (
                                  <span key={category.id} style={styles.manageCategoryBadge}>
                                    {category.code ? `${category.code} ${category.name}` : category.name}
                                  </span>
                                ))
                              )}
                            </div>
                          </div>
                          <div style={{ display: "grid", gap: 5, justifyItems: "end", flexShrink: 0 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)" }}>Costo {money(p.costPrice)}</span>
                            <span style={{ fontSize: 13, fontWeight: 800, color: "var(--text)" }}>{money(p.sellPrice)}</span>
                            {p.assigned ? <Badge tone="blue">Ya asociado</Badge> : <Badge tone="green">Activo</Badge>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  /* ── Desktop: tabla ── */
                  <div style={styles.manageTableScroll}>
                    <table style={{ ...ui.table, width: "100%", minWidth: 900, marginTop: 0 }}>
                      <thead>
                        <tr style={ui.theadRow}>
                          <th style={{ ...ui.th, width: 44, textAlign: "center" }}>
                            <input
                              type="checkbox"
                              checked={allVisibleChecked}
                              onChange={toggleAllVisible}
                              disabled={manageSaving || selectableVisibleProducts.length === 0}
                              style={{ width: 15, height: 15, accentColor: "var(--accent)", cursor: "pointer" }}
                              title="Seleccionar / quitar productos visibles"
                            />
                          </th>
                          <th style={{ ...ui.th, width: 100 }}>SKU</th>
                          <th style={{ ...ui.th, minWidth: 260 }}>Producto</th>
                          <th style={{ ...ui.th, textAlign: "right", width: 90 }}>Costo</th>
                          <th style={{ ...ui.th, textAlign: "right", width: 100 }}>Precio venta</th>
                          <th style={{ ...ui.th, width: 170 }}>Categorias</th>
                          <th style={{ ...ui.th, textAlign: "center", width: 100 }}>Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {manageProducts.map((p) => {
                          const isChecked = checkedIds.has(p.id);
                          const disabled = p.assigned || !p.active || !managingTax.active;
                          return (
                            <tr
                              key={p.id}
                              onClick={() => toggleChecked(p)}
                              style={{
                                cursor: disabled ? "default" : "pointer",
                                backgroundColor: isChecked ? "rgba(59,130,246,0.07)" : undefined,
                                opacity: disabled ? 0.68 : 1,
                                transition: "background-color 0.1s",
                              }}
                            >
                              <td style={{ ...ui.td, textAlign: "center" }}>
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => { }}
                                  disabled={manageSaving || disabled}
                                  style={{ width: 15, height: 15, accentColor: "var(--accent)", cursor: disabled ? "default" : "pointer" }}
                                />
                              </td>
                              <td style={{ ...ui.td, fontFamily: "monospace", fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                                {p.sku}
                              </td>
                              <td style={{ ...ui.td, color: "var(--text)", whiteSpace: "normal" }}>
                                <div style={{ fontWeight: 700 }}>{p.name}</div>
                                {p.description && (
                                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{p.description}</div>
                                )}
                              </td>
                              <td style={{ ...ui.td, textAlign: "right", fontWeight: 700, whiteSpace: "nowrap" }}>
                                {money(p.costPrice)}
                              </td>
                              <td style={{ ...ui.td, textAlign: "right", fontWeight: 800, whiteSpace: "nowrap" }}>
                                {money(p.sellPrice)}
                              </td>
                              <td style={{ ...ui.td, whiteSpace: "normal" }}>
                                {p.categories.length === 0 ? (
                                  <span style={styles.noCatBadge}>Sin categoria</span>
                                ) : (
                                  <div style={styles.manageCategoryList}>
                                    {p.categories.map((category) => (
                                      <span key={category.id} style={styles.manageCategoryBadge}>
                                        {category.code ? `${category.code} ${category.name}` : category.name}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </td>
                              <td style={{ ...ui.td, textAlign: "center" }}>
                                {p.assigned ? (
                                  <Badge tone="blue">Ya asociado</Badge>
                                ) : p.active ? (
                                  <Badge tone="green">Activo</Badge>
                                ) : (
                                  <Badge tone="slate">Inactivo</Badge>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              )}

              {!manageLoading && (
                <Pagination
                  page={managePagination.page}
                  pageCount={Math.max(managePagination.totalPages, 1)}
                  total={managePagination.total}
                  from={managePagination.total === 0 ? 0 : (managePagination.page - 1) * TAX_PRODUCT_LIMIT + 1}
                  to={Math.min(managePagination.total, managePagination.page * TAX_PRODUCT_LIMIT)}
                  onPage={(p) => {
                    if (!manageSaving) setManagePage(p);
                  }}
                  itemLabel="productos"
                />
              )}
            </div>

            {/* Footer */}
            <div style={{
              ...styles.manageFooter,
              flexDirection: isPhone ? "column-reverse" : "row",
              padding: isPhone ? "12px 16px" : "14px 24px",
            }}>
              <button
                onClick={closeManage}
                disabled={manageSaving}
                style={{
                  ...ui.ghostBtn,
                  justifyContent: "center",
                  width: isPhone ? "100%" : undefined,
                }}
                className="active-tap"
              >
                Cancelar
              </button>
              <button
                onClick={saveManage}
                disabled={manageSaving || manageLoading || checkedIds.size === 0 || !managingTax.active}
                style={{
                  ...ui.primaryBtn,
                  justifyContent: "center",
                  width: isPhone ? "100%" : undefined,
                  opacity: (manageSaving || manageLoading || checkedIds.size === 0 || !managingTax.active) ? 0.7 : 1,
                }}
                className="active-tap"
              >
                {manageSaving ? "Guardando..." : `Guardar ${checkedIds.size || ""} seleccion${checkedIds.size === 1 ? "" : "es"}`}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={statusConfirmTarget !== null}
        onClose={() => setStatusConfirmTarget(null)}
        onConfirm={confirmToggleStatus}
        variant="warning"
        title="Cambiar estado de impuesto"
        message={`¿Desea ${statusConfirmTarget?.active ? "desactivar" : "activar"} el impuesto "${statusConfirmTarget?.name}"?`}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Estilos
// ---------------------------------------------------------------------------

const styles: { [key: string]: React.CSSProperties } = {
  mobileFilterStack: {
    display: "grid",
    gap: 10,
    marginBottom: 16,
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
  actions: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  helpText: {
    color: "var(--text-muted)",
    fontSize: 12,
    fontWeight: 600,
    margin: "6px 0 0",
  },
  fieldError: {
    color: "#b91c1c",
    fontSize: 12,
    fontWeight: 600,
    marginTop: 5,
  },
  checkRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    color: "var(--text-secondary)",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 700,
    marginTop: 4,
  },
  check: {
    width: 16,
    height: 16,
    accentColor: "#1e3a8a",
    cursor: "pointer",
  },
  formError: {
    color: "#b91c1c",
    fontSize: 13,
    fontWeight: 700,
    marginTop: 14,
  },
  formActions: {
    display: "flex",
    gap: 10,
    marginTop: 22,
  },
  manageFilters: {
    alignItems: "end",
    display: "grid",
    gap: 10,
    marginBottom: 8,
  },
  manageFilterGroup: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    minWidth: 0,
  },
  manageSearchGroup: {
    minWidth: 0,
  },
  manageSelectPlaceholder: {
    alignItems: "center",
    backgroundColor: "var(--input-bg)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    color: "var(--text-muted)",
    display: "flex",
    fontSize: 13,
    fontWeight: 600,
    height: 38,
    padding: "0 12px",
  },
  manageSelectionBar: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "flex-start",
    marginTop: 10,
  },
  manageCounter: {
    color: "var(--text-muted)",
    fontSize: 13,
    fontWeight: 600,
    marginRight: "auto",
  },
  manageSelectionActions: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
  },
  manageSmallButton: {
    fontSize: 12,
    justifyContent: "center",
    minHeight: 34,
    whiteSpace: "nowrap",
  },
  manageProductsArea: {
    display: "flex",
    flex: "1 1 auto",
    flexDirection: "column",
    minHeight: 0,
    overflow: "hidden",
    paddingTop: 0,
  },
  manageTableScroll: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    maxHeight: "clamp(220px, 42vh, 430px)",
    overflow: "auto",
  },
  manageCardsScroll: {
    maxHeight: "clamp(240px, 48vh, 440px)",
    overflowY: "auto",
    padding: "4px 0",
  },
  manageCategoryList: {
    display: "flex",
    flexWrap: "wrap",
    gap: 4,
  },
  manageCategoryBadge: {
    backgroundColor: "var(--surface-2)",
    border: "1px solid var(--border)",
    borderRadius: 4,
    color: "var(--text-secondary)",
    display: "inline-flex",
    fontSize: 10,
    fontWeight: 700,
    lineHeight: 1.2,
    maxWidth: "100%",
    padding: "2px 6px",
    whiteSpace: "normal",
  },
  noCatBadge: {
    color: "var(--text-faint)",
    fontSize: 11,
    fontStyle: "italic",
    fontWeight: 700,
  },
  manageFooter: {
    alignItems: "center",
    borderTop: "1px solid var(--border)",
    display: "flex",
    flexShrink: 0,
    gap: 10,
    justifyContent: "flex-end",
  },
};

export default ImpuestosView;
