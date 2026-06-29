import React, { useEffect, useMemo, useRef, useState } from "react";
import { BadgePercent, ChevronDown, ChevronUp, Package, Pencil, Plus, Power, X } from "lucide-react";
import api from "../../shared/services/api";
import { useAdminData } from "../../shared/hooks";
import { DataTable, ActionModal } from "../../shared/ui";
import type { Column } from "../../shared/ui";
import {
  DECIMAL_INPUT_REGEX,
  getDecimalValidationValue,
  handleDecimalInputChange,
  validateDecimalField,
} from "../../shared/utils/decimalInput";
import { validateSafeText } from "../../shared/utils/formValidation";
import {
  ui,
  type ViewProps,
  Toolbar,
  SearchInput,
  Badge,
  SectionHeader,
  fmtDate,
  money,
  matchesProductSearch,
  useMediaQuery,
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
  sellPrice: number;
  assigned: boolean;
}

type FieldErrors = Partial<Record<keyof FormState, string>>;

const emptyForm: FormState = {
  name: "",
  description: "",
  rate: "",
  active: true,
};

const TAX_ENDPOINT = "/api/admin-tax/taxes";

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
  const [expandedTaxes, setExpandedTaxes] = useState<Record<number, boolean>>({});
  const isMobile = useMediaQuery("(max-width: 1024px)");

  const toggleExpandTax = (id: number) =>
    setExpandedTaxes((prev) => ({ ...prev, [id]: !prev[id] }));

  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [mutationError, setMutationError] = useState<string | null>(null);

  const [editing, setEditing] = useState<"create" | TaxRow | null>(null);
  const [form, setForm] = useState<FormState>({ ...emptyForm });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [statusUpdatingId, setStatusUpdatingId] = useState<number | null>(null);

  // ── Modal: Gestionar productos de un impuesto ──
  const [manageOpen, setManageOpen] = useState(false);
  const [managingTax, setManagingTax] = useState<TaxRow | null>(null);
  const [manageAllProducts, setManageAllProducts] = useState<ProductForTax[]>([]);
  const [manageLoading, setManageLoading] = useState(false);
  const [manageError, setManageError] = useState<string | null>(null);
  const [manageSaving, setManageSaving] = useState(false);
  const [manageNotice, setManageNotice] = useState<string | null>(null);
  const [manageSearch, setManageSearch] = useState("");
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());

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

  // ── Búsqueda local en el modal (multi-palabra) ──
  const filteredManageProducts = useMemo(() => {
    if (!manageSearch.trim()) return manageAllProducts;
    return manageAllProducts.filter((p) =>
      matchesProductSearch(
        { sku: p.sku, name: p.name, barcode: p.barcode ?? undefined },
        manageSearch
      )
    );
  }, [manageAllProducts, manageSearch]);

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
        alert(rateValue.roundedMessage);
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

  const toggleStatus = async (tax: TaxRow) => {
    const next = !tax.active;
    const label = next ? "activar" : "desactivar";
    const confirmed = window.confirm(`Desea ${label} el impuesto "${tax.name}"?`);
    if (!confirmed) return;

    setStatusUpdatingId(tax.id);
    setMutationError(null);
    setNotice(null);
    try {
      await syncStatus(tax.id, next);
      setNotice(`Impuesto ${next ? "activado" : "desactivado"} correctamente.`);
      await refetch();
    } catch (err: unknown) {
      setMutationError(getErrorMessage(err, "No se pudo actualizar el estado del impuesto."));
    } finally {
      setStatusUpdatingId(null);
    }
  };

  // ── Gestión masiva de productos ──
  const openManage = async (tax: TaxRow) => {
    setManagingTax(tax);
    setManageSearch("");
    setManageNotice(null);
    setManageError(null);
    setManageLoading(true);
    setManageOpen(true);
    setCheckedIds(new Set());
    setManageAllProducts([]);
    try {
      const res = await api.get<{ data: { products: ProductForTax[] } }>(
        `/api/admin-tax/taxes/${tax.id}/products`
      );
      const prods = res.data.data.products;
      setManageAllProducts(prods);
      setCheckedIds(new Set(prods.filter((p) => p.assigned).map((p) => p.id)));
    } catch (err: unknown) {
      setManageError(getErrorMessage(err, "No se pudo cargar los productos."));
    } finally {
      setManageLoading(false);
    }
  };

  const closeManage = () => {
    if (manageSaving) return;
    setManageOpen(false);
    setManagingTax(null);
    setManageAllProducts([]);
    setCheckedIds(new Set());
    setManageSearch("");
    setManageNotice(null);
    setManageError(null);
  };

  const saveManage = async () => {
    if (!managingTax || manageSaving) return;
    setManageSaving(true);
    setManageNotice(null);
    setManageError(null);
    try {
      await api.put(`/api/admin-tax/taxes/${managingTax.id}/products`, {
        productIds: [...checkedIds],
      });
      // Recargar lista para reflejar estado actualizado
      const res = await api.get<{ data: { products: ProductForTax[] } }>(
        `/api/admin-tax/taxes/${managingTax.id}/products`
      );
      const prods = res.data.data.products;
      setManageAllProducts(prods);
      setCheckedIds(new Set(prods.filter((p) => p.assigned).map((p) => p.id)));
      setManageNotice("Impuesto asignado correctamente a los productos seleccionados.");
    } catch (err: unknown) {
      setManageError(getErrorMessage(err, "No se pudo guardar la asignación."));
    } finally {
      setManageSaving(false);
    }
  };

  const toggleChecked = (id: number) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllVisible = () => {
    const ids = filteredManageProducts.map((p) => p.id);
    const allChecked = ids.every((id) => checkedIds.has(id));
    setCheckedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (allChecked ? next.delete(id) : next.add(id)));
      return next;
    });
  };

  const allVisibleChecked =
    filteredManageProducts.length > 0 &&
    filteredManageProducts.every((p) => checkedIds.has(p.id));

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
      render: (tax) => <span style={{ fontWeight: 800, color: "var(--accent-strong)" }}>{tax.id}</span>,
    },
    {
      key: "name",
      header: "Nombre",
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
      render: (tax) => (
        <Badge tone={tax.active ? "green" : "red"}>{tax.active ? "Activo" : "Inactivo"}</Badge>
      ),
    },
    {
      key: "createdAt",
      header: "Fecha de creacion",
      render: (tax) => <span style={{ color: "var(--text-muted)" }}>{fmtDate(tax.createdAt)}</span>,
    },
    {
      key: "actions",
      header: "Acciones",
      align: "center",
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

      <Toolbar>
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar por nombre o ID" />
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#15803d", fontSize: 13, fontWeight: 700 }}>
          <BadgePercent size={16} /> {activeCount} activo{activeCount === 1 ? "" : "s"}
        </span>
        {inactiveCount > 0 && (
          <span style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: 700 }}>
            {inactiveCount} inactivo{inactiveCount === 1 ? "" : "s"}
          </span>
        )}
        <span style={{ marginLeft: "auto", fontSize: 13, color: "var(--text-muted)", fontWeight: 600 }}>
          {rows.length} impuesto{rows.length === 1 ? "" : "s"}
        </span>
      </Toolbar>

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
            padding: "12px 16px",
            fontWeight: 700,
            fontSize: 11,
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
          {!loading && !loadError && rows.length === 0 && (
            <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--text-faint)", fontSize: 13, fontWeight: 500 }}>
              {search.trim() ? "No hay impuestos que coincidan con la búsqueda." : "No hay impuestos registrados."}
            </div>
          )}

          {!loading &&
            !loadError &&
            rows.map((tax) => {
              const isExpanded = expandedTaxes[tax.id];
              return (
                <div
                  key={tax.id}
                  style={{
                    backgroundColor: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    marginBottom: 10,
                    boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
                    overflow: "hidden",
                  }}
                >
                  {/* Fila principal */}
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "1.4fr 0.8fr 0.8fr 1fr",
                    padding: "12px 16px",
                    alignItems: "center",
                  }}>
                    {/* Nombre */}
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {tax.name}
                    </div>

                    {/* Tasa */}
                    <div style={{ textAlign: "center", fontSize: 13, fontWeight: 800, color: "var(--text)" }}>
                      {formatPercent(tax.rate)}
                    </div>

                    {/* Estado */}
                    <div style={{ textAlign: "center" }}>
                      <Badge tone={tax.active ? "green" : "red"}>{tax.active ? "Activo" : "Inactivo"}</Badge>
                    </div>

                    {/* Botones de Acción */}
                    <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 6 }}>
                      {/* Gestionar productos */}
                      <button
                        onClick={() => openManage(tax)}
                        style={{
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                          backgroundColor: "var(--accent-soft)", border: "1px solid var(--border)",
                          borderRadius: 8, width: 34, height: 34, cursor: "pointer",
                          color: "var(--accent-strong)", padding: 0,
                        }}
                        className="active-tap"
                        title="Gestionar productos"
                      >
                        <Package size={14} />
                      </button>

                      {/* Editar */}
                      <button
                        onClick={() => openEdit(tax)}
                        style={{
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                          backgroundColor: "#eff6ff", border: "1px solid #bfdbfe",
                          borderRadius: 8, width: 34, height: 34, cursor: "pointer",
                          color: "var(--accent-strong)", padding: 0,
                        }}
                        className="active-tap"
                        title="Editar impuesto"
                      >
                        <Pencil size={14} />
                      </button>

                      {/* Activar/Desactivar */}
                      <button
                        onClick={() => toggleStatus(tax)}
                        disabled={statusUpdatingId === tax.id}
                        style={{
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                          backgroundColor: tax.active ? "#fef2f2" : "#f0fdf4",
                          border: `1px solid ${tax.active ? "#fecaca" : "#bbf7d0"}`,
                          borderRadius: 8, width: 34, height: 34, cursor: "pointer",
                          color: tax.active ? "#b91c1c" : "#15803d", padding: 0,
                          opacity: statusUpdatingId === tax.id ? 0.55 : 1,
                        }}
                        className="active-tap"
                        title={tax.active ? "Desactivar" : "Activar"}
                      >
                        <Power size={14} />
                      </button>

                      {/* Chevron */}
                      <button
                        onClick={() => toggleExpandTax(tax.id)}
                        style={{
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                          backgroundColor: "var(--surface)", border: "1px solid var(--border-strong)",
                          borderRadius: 8, width: 34, height: 34, cursor: "pointer",
                          color: "var(--text-muted)", padding: 0,
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
                        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase" as const, letterSpacing: "0.3px", marginBottom: 4 }}>ID</div>
                        <div style={{ fontSize: 13, fontWeight: 800, color: "var(--accent-strong)" }}>{tax.id}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase" as const, letterSpacing: "0.3px", marginBottom: 4 }}>Tasa decimal</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-secondary)" }}>{formatDecimal(tax.rate)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase" as const, letterSpacing: "0.3px", marginBottom: 4 }}>Descripción</div>
                        <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{tax.description || "Sin descripción"}</div>
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
                  )}
                </div>
              );
            })}
        </div>
      ) : (
        <div className="table-sticky-head">
          <DataTable
            columns={columns}
            data={rows}
            loading={loading}
            error={loadError || mutationError}
            emptyMessage={debouncedSearch.trim() ? "No hay impuestos que coincidan con la busqueda." : "No hay impuestos registrados."}
            keyExtractor={(tax) => tax.id}
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
            <input style={ui.input} value={form.name} onChange={set("name")} placeholder="IVA" autoFocus />
            {fieldErrors.name && <p style={styles.fieldError}>{fieldErrors.name}</p>}
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={ui.fieldLabel}>Descripcion</label>
            <textarea
              style={{ ...ui.input, minHeight: 82, resize: "vertical" }}
              value={form.description}
              onChange={set("description")}
              placeholder="Impuesto al valor agregado"
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
          zIndex: 300, padding: 20,
        }}>
          <div style={{
            backgroundColor: "var(--surface)", borderRadius: 16,
            boxShadow: "0 24px 48px rgba(0,0,0,0.2)",
            width: "100%", maxWidth: 780, maxHeight: "90vh",
            display: "flex", flexDirection: "column", overflow: "hidden",
          }}>

            {/* Header */}
            <div style={{
              padding: "20px 24px 16px", borderBottom: "1px solid var(--border)",
              display: "flex", justifyContent: "space-between", alignItems: "flex-start",
              flexShrink: 0,
            }}>
              <div>
                <h2 style={{ fontSize: 17, fontWeight: 800, color: "var(--text)", margin: 0 }}>
                  Gestionar productos
                </h2>
                <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "4px 0 0", fontWeight: 600 }}>
                  {managingTax.name} · {formatPercent(managingTax.rate)}
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

            {/* Subheader: advertencia + stats + búsqueda + avisos */}
            <div style={{ padding: "14px 24px 12px", borderBottom: "1px solid var(--border-soft)", flexShrink: 0 }}>
              {!managingTax.active && (
                <div style={{
                  backgroundColor: "#fef3c7", border: "1px solid #fde68a",
                  borderRadius: 8, padding: "8px 12px", marginBottom: 12,
                  fontSize: 13, color: "#92400e", fontWeight: 600,
                }}>
                  ⚠️ Este impuesto está inactivo. No puedes asignar nuevos productos a él.
                </div>
              )}

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
                <span style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: 600 }}>
                  <span style={{ color: "var(--accent-strong)", fontWeight: 800 }}>{checkedIds.size}</span>{" "}
                  seleccionado{checkedIds.size !== 1 ? "s" : ""}{" "}
                  · {manageAllProducts.filter((p) => p.assigned).length} ya vinculado{manageAllProducts.filter((p) => p.assigned).length !== 1 ? "s" : ""}
                  {" "}· {manageAllProducts.length} total
                </span>
                {filteredManageProducts.length > 0 && (
                  <button
                    onClick={toggleAllVisible}
                    disabled={manageSaving}
                    style={{ ...ui.ghostBtn, fontSize: 12 }}
                    className="active-tap"
                  >
                    {allVisibleChecked ? "Deseleccionar visibles" : "Seleccionar visibles"}
                  </button>
                )}
              </div>

              <SearchInput
                value={manageSearch}
                onChange={setManageSearch}
                placeholder="Buscar por nombre, SKU o código de barras..."
              />

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
            <div style={{ flex: 1, overflowY: "auto" }}>
              {manageLoading && (
                <div style={{ textAlign: "center", padding: 40, color: "var(--text-faint)", fontSize: 13, fontWeight: 500 }}>
                  Cargando productos...
                </div>
              )}
              {!manageLoading && filteredManageProducts.length === 0 && (
                <div style={{ textAlign: "center", padding: 40, color: "var(--text-faint)", fontSize: 13, fontWeight: 500 }}>
                  {manageSearch.trim()
                    ? "No se encontraron productos con esa búsqueda."
                    : "No hay productos activos disponibles."}
                </div>
              )}

              {!manageLoading && filteredManageProducts.length > 0 && (
                isMobile ? (
                  /* ── Mobile: cards ── */
                  <div style={{ padding: "4px 16px" }}>
                    {filteredManageProducts.map((p) => {
                      const isChecked = checkedIds.has(p.id);
                      return (
                        <div
                          key={p.id}
                          onClick={() => toggleChecked(p.id)}
                          style={{
                            display: "flex", alignItems: "center", gap: 12,
                            padding: "10px 8px", borderBottom: "1px solid var(--border-soft)",
                            cursor: "pointer", borderRadius: 6,
                            backgroundColor: isChecked ? "rgba(59,130,246,0.06)" : undefined,
                            transition: "background-color 0.1s",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {}}
                            disabled={manageSaving}
                            style={{ width: 16, height: 16, accentColor: "var(--accent)", cursor: "pointer", flexShrink: 0 }}
                          />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {p.name}
                            </div>
                            <div style={{ fontSize: 11, color: "var(--text-faint)", fontFamily: "monospace" }}>{p.sku}</div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{money(p.sellPrice)}</span>
                            {p.assigned && <Badge tone="green">Vinculado</Badge>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  /* ── Desktop: tabla ── */
                  <table style={{ ...ui.table, width: "100%" }}>
                    <thead>
                      <tr style={ui.theadRow}>
                        <th style={{ ...ui.th, width: 44, textAlign: "center" }}>
                          <input
                            type="checkbox"
                            checked={allVisibleChecked}
                            onChange={toggleAllVisible}
                            disabled={manageSaving}
                            style={{ width: 15, height: 15, accentColor: "var(--accent)", cursor: "pointer" }}
                            title="Seleccionar / deseleccionar todos los visibles"
                          />
                        </th>
                        <th style={{ ...ui.th, width: 110 }}>SKU</th>
                        <th style={ui.th}>Nombre</th>
                        <th style={{ ...ui.th, textAlign: "right", width: 100 }}>Precio venta</th>
                        <th style={{ ...ui.th, textAlign: "center", width: 110 }}>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredManageProducts.map((p) => {
                        const isChecked = checkedIds.has(p.id);
                        return (
                          <tr
                            key={p.id}
                            onClick={() => toggleChecked(p.id)}
                            style={{
                              cursor: "pointer",
                              backgroundColor: isChecked ? "rgba(59,130,246,0.07)" : undefined,
                              transition: "background-color 0.1s",
                            }}
                          >
                            <td style={{ ...ui.td, textAlign: "center" }}>
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {}}
                                disabled={manageSaving}
                                style={{ width: 15, height: 15, accentColor: "var(--accent)", cursor: "pointer" }}
                              />
                            </td>
                            <td style={{ ...ui.td, fontFamily: "monospace", fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                              {p.sku}
                            </td>
                            <td style={{ ...ui.td, fontWeight: 600, color: "var(--text)", whiteSpace: "normal" }}>
                              {p.name}
                            </td>
                            <td style={{ ...ui.td, textAlign: "right", fontWeight: 700, whiteSpace: "nowrap" }}>
                              {money(p.sellPrice)}
                            </td>
                            <td style={{ ...ui.td, textAlign: "center" }}>
                              {p.assigned && <Badge tone="green">Vinculado</Badge>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )
              )}
            </div>

            {/* Footer */}
            <div style={{
              padding: "16px 24px", borderTop: "1px solid var(--border)",
              display: "flex", gap: 10, justifyContent: "flex-end", flexShrink: 0,
            }}>
              <button
                onClick={closeManage}
                disabled={manageSaving}
                style={ui.ghostBtn}
                className="active-tap"
              >
                Cancelar
              </button>
              <button
                onClick={saveManage}
                disabled={manageSaving || manageLoading}
                style={{ ...ui.primaryBtn, opacity: (manageSaving || manageLoading) ? 0.7 : 1 }}
                className="active-tap"
              >
                {manageSaving ? "Guardando..." : "Guardar asignación"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Estilos
// ---------------------------------------------------------------------------

const styles: { [key: string]: React.CSSProperties } = {
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
    marginTop: 7,
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
};

export default ImpuestosView;
