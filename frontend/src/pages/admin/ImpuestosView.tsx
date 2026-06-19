import React, { useEffect, useMemo, useRef, useState } from "react";
import { BadgePercent, ChevronDown, ChevronUp, Pencil, Plus, Power } from "lucide-react";
import api from "../../services/api";
import { useAdminData } from "../../hooks";
import { DataTable, ActionModal } from "../../components/common";
import type { Column } from "../../components/common";
import {
  DECIMAL_INPUT_REGEX,
  getDecimalValidationValue,
  handleDecimalInputChange,
  validateDecimalField,
} from "../../utils/decimalInput";
import { validateSafeText } from "../../utils/formValidation";
import {
  ui,
  type ViewProps,
  Toolbar,
  SearchInput,
  Badge,
  SectionHeader,
  fmtDate,
  useMediaQuery
} from "./shared";

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

type FieldErrors = Partial<Record<keyof FormState, string>>;

const emptyForm: FormState = {
  name: "",
  description: "",
  rate: "",
  active: true,
};

const TAX_ENDPOINT = "/api/admin-tax/taxes";

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

  // TODO: integrar asignacion de impuestos desde la pantalla de Productos.

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

  const columns: Column<TaxRow>[] = [
    {
      key: "id",
      header: "ID",
      render: (tax) => <span style={{ fontWeight: 800, color: "#1e3a8a" }}>{tax.id}</span>,
    },
    {
      key: "name",
      header: "Nombre",
      render: (tax) => (
        <span style={{ fontWeight: 800, color: "#0f172a", whiteSpace: "normal" }}>{tax.name}</span>
      ),
    },
    {
      key: "description",
      header: "Descripcion",
      render: (tax) => (
        <span style={{ color: "#475569", whiteSpace: "normal" }}>{tax.description || "Sin descripcion"}</span>
      ),
    },
    {
      key: "rate",
      header: "Tasa",
      align: "right",
      render: (tax) => (
        <div>
          <div style={{ fontWeight: 800, color: "#0f172a" }}>{formatPercent(tax.rate)}</div>
          <div style={{ fontSize: 11, color: "#94a3b8" }}>decimal {formatDecimal(tax.rate)}</div>
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
      render: (tax) => <span style={{ color: "#64748b" }}>{fmtDate(tax.createdAt)}</span>,
    },
    {
      key: "actions",
      header: "Acciones",
      align: "center",
      render: (tax) => (
        <div style={styles.actions}>
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
          <span style={{ fontSize: 13, color: "#64748b", fontWeight: 700 }}>
            {inactiveCount} inactivo{inactiveCount === 1 ? "" : "s"}
          </span>
        )}
        <span style={{ marginLeft: "auto", fontSize: 13, color: "#64748b", fontWeight: 600 }}>
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
            color: "#64748b",
            textTransform: "uppercase" as const,
            letterSpacing: "0.4px",
          }}>
            <div>Nombre</div>
            <div style={{ textAlign: "center" }}>Tasa</div>
            <div style={{ textAlign: "center" }}>Estado</div>
            <div style={{ textAlign: "right", paddingRight: 8 }}>Acción</div>
          </div>

          {loading && (
            <div style={{ textAlign: "center", padding: "32px 16px", color: "#94a3b8", fontSize: 13, fontWeight: 500 }}>
              Cargando información...
            </div>
          )}
          {!loading && loadError && (
            <div style={{ textAlign: "center", padding: "32px 16px", color: "#b91c1c", fontSize: 13, fontWeight: 500 }}>
              {loadError}
            </div>
          )}
          {!loading && !loadError && rows.length === 0 && (
            <div style={{ textAlign: "center", padding: "32px 16px", color: "#94a3b8", fontSize: 13, fontWeight: 500 }}>
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
                    backgroundColor: "#ffffff",
                    border: "1px solid #e2e8f0",
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
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {tax.name}
                    </div>

                    {/* Tasa */}
                    <div style={{ textAlign: "center", fontSize: 13, fontWeight: 800, color: "#0f172a" }}>
                      {formatPercent(tax.rate)}
                    </div>

                    {/* Estado */}
                    <div style={{ textAlign: "center" }}>
                      <Badge tone={tax.active ? "green" : "red"}>{tax.active ? "Activo" : "Inactivo"}</Badge>
                    </div>

                    {/* Botones de Acción */}
                    <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8 }}>
                      {/* Editar */}
                      <button
                        onClick={() => openEdit(tax)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: "#eff6ff",
                          border: "1px solid #bfdbfe",
                          borderRadius: 8,
                          width: 34,
                          height: 34,
                          cursor: "pointer",
                          color: "#1e3a8a",
                          padding: 0,
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
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: tax.active ? "#fef2f2" : "#f0fdf4",
                          border: `1px solid ${tax.active ? "#fecaca" : "#bbf7d0"}`,
                          borderRadius: 8,
                          width: 34,
                          height: 34,
                          cursor: "pointer",
                          color: tax.active ? "#b91c1c" : "#15803d",
                          padding: 0,
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
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: "#ffffff",
                          border: "1px solid #cbd5e1",
                          borderRadius: 8,
                          width: 34,
                          height: 34,
                          cursor: "pointer",
                          color: "#64748b",
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
                      backgroundColor: "#f8fafc",
                      borderRadius: 8,
                      border: "1px solid #e2e8f0",
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                      gap: 16,
                      textAlign: "left",
                    }}>
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase" as const, letterSpacing: "0.3px", marginBottom: 4 }}>ID</div>
                        <div style={{ fontSize: 13, fontWeight: 800, color: "#1e3a8a" }}>{tax.id}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase" as const, letterSpacing: "0.3px", marginBottom: 4 }}>Tasa decimal</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#475569" }}>{formatDecimal(tax.rate)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase" as const, letterSpacing: "0.3px", marginBottom: 4 }}>Descripción</div>
                        <div style={{ fontSize: 13, color: "#475569" }}>{tax.description || "Sin descripción"}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase" as const, letterSpacing: "0.3px", marginBottom: 4 }}>Fecha de creación</div>
                        <div style={{ fontSize: 13, color: "#475569" }}>{fmtDate(tax.createdAt)}</div>
                      </div>
                      {tax.updatedAt && (
                        <div>
                          <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase" as const, letterSpacing: "0.3px", marginBottom: 4 }}>Última actualización</div>
                          <div style={{ fontSize: 13, color: "#475569" }}>{fmtDate(tax.updatedAt)}</div>
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
    </div>
  );
};

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
    color: "#64748b",
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
    color: "#334155",
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
