import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Pencil, Plus } from "lucide-react";
import api from "../../shared/services/api";
import { useAdminData } from "../../shared/hooks";
import { DataTable, ActionModal } from "../../shared/ui";
import type { Column } from "../../shared/ui";
import { useToast } from "../../shared/context/ToastContext";
import {
  validateReference,
  validateSafeText,
} from "../../shared/utils/formValidation";
import { PhoneField } from "../components/PhoneField";
import {
  DEFAULT_PHONE_COUNTRY_ISO,
  getCountryCodeByIso,
  normalizeLocalPhone,
  phoneToAdminFormValue,
  validateLocalPhone,
} from "../utils/phone";
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

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------
interface BranchRow {
  id: number;
  name: string;
  address: string | null;
  phone: string | null;
  active: boolean;
  employees: number;
  sales: number;
  createdAt: string;
}

interface FormState {
  name: string;
  address: string;
  phone: string;
  phoneCountryIso: string;
  active: boolean;
}

interface FieldErrors {
  name?: string;
  address?: string;
  phone?: string;
}

const emptyForm: FormState = {
  name: "",
  address: "",
  phone: "",
  phoneCountryIso: DEFAULT_PHONE_COUNTRY_ISO,
  active: true,
};
const emptyErrors: FieldErrors = {};

// ---------------------------------------------------------------------------
// Validadores por campo (puros — reutilizables)
// ---------------------------------------------------------------------------
const validateName = (value: string): string | undefined => {
  return validateSafeText(value, "El nombre de la sucursal", { required: true, min: 3, max: 80 });
};

const validateAddress = (value: string): string | undefined => {
  const v = value.trim();
  if (!v) return "La dirección es obligatoria.";
  if (v.length > 150) return "La dirección no puede exceder 150 caracteres.";
  return validateReference(v, "La direccion", { required: true, max: 150 });
};

const validatePhone = (value: string, countryIso: string): string | undefined => {
  return validateLocalPhone(value, getCountryCodeByIso(countryIso).code, { required: true });
};

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------
const branchDetailRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-start",
  alignItems: "flex-start",
  gap: "8px",
  fontSize: 13,
  marginBottom: 6,
};

const branchDetailLabel: React.CSSProperties = {
  flexShrink: 0,
  fontWeight: 700,
  color: "var(--text-muted)",
  minWidth: "95px",
  display: "inline-block",
};

const branchDetailValue: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  overflowWrap: "anywhere",
  fontWeight: 600,
  color: "var(--text-secondary)",
};

const empLabel: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  color: "var(--text-faint)",
  textTransform: "uppercase",
  letterSpacing: "0.5px",
  marginBottom: 5,
};

const SucursalesView: React.FC<ViewProps> = ({ refreshToken }) => {
  const { showToast } = useToast();
  const isMobile = useMediaQuery("(max-width: 1024px)");
  const [expandedBranches, setExpandedBranches] = useState<Record<number, boolean>>({});

  const toggleExpandBranch = (id: number) => {
    setExpandedBranches((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");

  // Modal crear / editar sucursal
  const [editing, setEditing] = useState<"create" | number | null>(null);
  const [form, setForm] = useState<FormState>({ ...emptyForm });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({ ...emptyErrors });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Modal de empleados y reasignación
  const [selectedBranch, setSelectedBranch] = useState<BranchRow | null>(null);
  const [showEmployeesModal, setShowEmployeesModal] = useState(false);
  const [reassignId, setReassignId] = useState<number | null>(null);
  const [reassignTarget, setReassignTarget] = useState<string>("");
  const [reassigningEmployeeId, setReassigningEmployeeId] = useState<number | null>(null);
  // Acordeón de empleados dentro del modal (sustituye la tabla con scroll horizontal)
  const [expandedEmp, setExpandedEmp] = useState<Record<number, boolean>>({});

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data, loading, error, refetch } = useAdminData<{ branches: BranchRow[] }>(
    "/api/admin/branches",
    { params: debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {} }
  );
  const rows = data?.branches ?? [];

  const { data: employeesData, refetch: refetchEmployees } = useAdminData<{ employees: any[] }>(
    "/api/admin/employees"
  );
  const allEmployees = employeesData?.employees ?? [];

  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    refetch();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshToken]);

  // ---------------------------------------------------------------------------
  // Validez global reactiva — se recalcula cada vez que el formulario cambia
  // ---------------------------------------------------------------------------
  const isFormValid = useMemo(() => {
    return (
      !validateName(form.name) &&
      !validateAddress(form.address) &&
      !validatePhone(form.phone, form.phoneCountryIso)
    );
  }, [form.name, form.address, form.phone, form.phoneCountryIso]);

  // ---------------------------------------------------------------------------
  // Apertura de modales
  // ---------------------------------------------------------------------------
  const openEmployeesModal = (b: BranchRow) => {
    setSelectedBranch(b);
    setReassignId(null);
    setReassignTarget("");
    setShowEmployeesModal(true);
  };

  const handleReassign = async () => {
    if (!reassignId || !reassignTarget) {
      showToast("Selecciona un empleado y una sucursal destino.", "warning");
      return;
    }
    if (reassigningEmployeeId === reassignId) return;
    const employeeId = reassignId;
    setReassigningEmployeeId(employeeId);
    try {
      await api.put(`/api/admin/employees/${employeeId}`, { branchId: parseInt(reassignTarget) });
      await Promise.all([refetch(), refetchEmployees()]);
      setReassignId(null);
      setReassignTarget("");
      setSelectedBranch((prev) =>
        prev ? { ...prev, employees: prev.employees - 1 } : prev
      );
    } catch {
      // Manejado por el interceptor global de errores (api.ts) — mismo mensaje.
    } finally {
      setReassigningEmployeeId(null);
    }
  };

  const openCreate = () => {
    setForm({ ...emptyForm });
    setFieldErrors({ ...emptyErrors });
    setFormError(null);
    setEditing("create");
  };

  const openEdit = (b: BranchRow) => {
    const loadedForm: FormState = {
      name: b.name,
      address: b.address || "",
      phone: phoneToAdminFormValue(b.phone),
      phoneCountryIso: DEFAULT_PHONE_COUNTRY_ISO,
      active: b.active,
    };
    setForm(loadedForm);
    // Mostrar errores de campo solo si los datos actuales ya son inválidos
    setFieldErrors({
      name: validateName(loadedForm.name),
      address: validateAddress(loadedForm.address),
      phone: validatePhone(loadedForm.phone, loadedForm.phoneCountryIso),
    });
    setFormError(null);
    setEditing(b.id);
  };

  const closeModal = () => {
    if (saving) return;
    setEditing(null);
    setFieldErrors({ ...emptyErrors });
    setFormError(null);
  };

  // ---------------------------------------------------------------------------
  // Handlers de cambio de campo con validación en tiempo real
  // ---------------------------------------------------------------------------
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setForm((f) => ({ ...f, name: val }));
    setFieldErrors((fe) => ({ ...fe, name: validateName(val) }));
  };

  const handleAddressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setForm((f) => ({ ...f, address: val }));
    setFieldErrors((fe) => ({ ...fe, address: validateAddress(val) }));
  };

  const handlePhoneChange = (val: string) => {
    setForm((f) => ({ ...f, phone: val }));
    setFieldErrors((fe) => ({ ...fe, phone: validatePhone(val, form.phoneCountryIso) }));
  };

  const handlePhoneCountryChange = (phoneCountryIso: string) => {
    const countryCode = getCountryCodeByIso(phoneCountryIso).code;
    const phone = normalizeLocalPhone(form.phone, countryCode);
    setForm((current) => ({ ...current, phoneCountryIso, phone }));
    setFieldErrors((current) => ({
      ...current,
      phone: validatePhone(phone, phoneCountryIso),
    }));
  };

  // ---------------------------------------------------------------------------
  // Envío del formulario
  // ---------------------------------------------------------------------------
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Doble-guardia: si el formulario no es válido o ya se está guardando, no hacer nada
    if (!isFormValid || saving) return;

    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        name: form.name.trim(),
        address: form.address.trim(),
        phone: form.phone,
        phoneCountryCode: getCountryCodeByIso(form.phoneCountryIso).code,
        active: form.active,
      };
      if (editing === "create") {
        await api.post("/api/admin/branches", payload);
      } else {
        await api.put(`/api/admin/branches/${editing}`, payload);
      }
      setEditing(null);
      setFieldErrors({ ...emptyErrors });
      await refetch();
    } catch (err: any) {
      setFormError(err.response?.data?.message || "No se pudo guardar la sucursal.");
    } finally {
      setSaving(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Filtros de tabla
  // ---------------------------------------------------------------------------
  const activeCount = rows.filter((r) => r.active).length;
  const inactiveCount = rows.length - activeCount;

  const filteredRows = rows.filter((r) => {
    if (statusFilter === "active") return r.active;
    if (statusFilter === "inactive") return !r.active;
    return true;
  });

  // ---------------------------------------------------------------------------
  // Estilo del botón Guardar según estado
  // ---------------------------------------------------------------------------
  const saveButtonStyle: React.CSSProperties = {
    ...ui.primaryBtn,
    flex: 1,
    justifyContent: "center",
    opacity: saving || !isFormValid ? 0.55 : 1,
    cursor: saving || !isFormValid ? "not-allowed" : "pointer",
  };

  // Estilo inline para mensajes de error de campo (mismo color rojo del sistema)
  const fieldErrStyle: React.CSSProperties = {
    color: "var(--color-danger)",
    fontSize: 12,
    fontWeight: 600,
    marginTop: 4,
    display: "block",
  };

  // Borde rojo en input inválido (solo si hay error)
  const inputWithError = (hasError: boolean): React.CSSProperties => ({
    ...ui.input,
    borderColor: hasError ? "var(--color-danger)" : undefined,
  });

  // ---------------------------------------------------------------------------
  // Columnas de la tabla principal
  // ---------------------------------------------------------------------------
  const columns: Column<BranchRow>[] = [
    {
      key: "id",
      header: "#",
      render: (b) => <span style={{ fontWeight: 700, color: "var(--accent-strong)" }}>{b.id}</span>,
    },
    {
      key: "name",
      header: "Nombre",
      render: (b) => (
        <span style={{ fontWeight: 700, color: "var(--text)", whiteSpace: "normal" }}>{b.name}</span>
      ),
    },
    {
      key: "address",
      header: "Dirección",
      render: (b) => (
        <span style={{ color: "var(--text-secondary)", whiteSpace: "normal" }}>{b.address || "—"}</span>
      ),
    },
    {
      key: "phone",
      header: "Teléfono",
      render: (b) => <>{b.phone || "—"}</>,
    },
    {
      key: "employees",
      header: "Empleados",
      align: "center",
      render: (b) => <span style={{ fontWeight: 700 }}>{b.employees}</span>,
    },
    {
      key: "sales",
      header: "Ventas",
      align: "center",
      render: (b) => <span style={{ fontWeight: 700 }}>{b.sales}</span>,
    },
    {
      key: "active",
      header: "Estado",
      align: "center",
      render: (b) => (
        <Badge tone={b.active ? "green" : "red"}>{b.active ? "Activa" : "Inactiva"}</Badge>
      ),
    },
    {
      key: "createdAt",
      header: "Alta",
      render: (b) => <span style={{ color: "var(--text-muted)" }}>{fmtDate(b.createdAt)}</span>,
    },
    {
      key: "actions",
      header: "Acción",
      align: "center",
      render: (b) => (
        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          <button style={ui.linkBtn} className="active-tap" onClick={() => openEmployeesModal(b)}>
            Empleados
          </button>
          <button style={ui.linkBtn} className="active-tap" onClick={() => openEdit(b)}>
            <Pencil size={14} style={{ verticalAlign: "-2px" }} /> Editar
          </button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <SectionHeader
        title="Sucursales"
        subtitle="Administración de los puntos de venta registrados"
        right={
          <button style={ui.primaryBtn} className="active-tap" onClick={openCreate}>
            <Plus size={16} /> Nueva sucursal
          </button>
        }
      />

      <Toolbar>
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar por nombre o dirección" />
        <span style={{ fontSize: 13, color: "var(--color-success)", fontWeight: 700 }}>{activeCount} activa(s)</span>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "all" | "active" | "inactive")}
          style={{ ...ui.input, width: "auto", padding: "4px 10px", fontSize: 13 }}
        >
          <option value="all">Todas ({rows.length})</option>
          <option value="active">Solo activas ({activeCount})</option>
          <option value="inactive">Solo inactivas ({inactiveCount})</option>
        </select>
        <span style={{ marginLeft: "auto", fontSize: 13, color: "var(--text-muted)", fontWeight: 600 }}>
          {filteredRows.length} sucursal{filteredRows.length === 1 ? "" : "es"}
        </span>
      </Toolbar>

      {isMobile ? (
        /* ── Mobile / Tablet: Card-based layout ── */
        <div style={{ overflowY: "auto", maxHeight: "62vh", padding: "8px 16px" }}>
          {loading && (
            <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--text-faint)", fontSize: 13, fontWeight: 500 }}>
              Cargando información...
            </div>
          )}
          {!loading && error && (
            <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--color-danger)", fontSize: 13, fontWeight: 500 }}>
              {error}
            </div>
          )}
          {!loading && !error && filteredRows.length === 0 && (
            <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--text-faint)", fontSize: 13, fontWeight: 500 }}>
              No hay sucursales registradas.
            </div>
          )}

          {!loading &&
            !error &&
            filteredRows.map((b) => {
              const isExpanded = expandedBranches[b.id];
              return (
                <div
                  key={b.id}
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
                        {b.name}
                      </div>
                      {/* Badge estado */}
                      <div style={{ marginBottom: 8 }}>
                        <Badge tone={b.active ? "green" : "red"}>{b.active ? "Activa" : "Inactiva"}</Badge>
                      </div>

                      {/* Dirección */}
                      {b.address && (
                        <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 4, wordBreak: "break-word" }}>
                          📍 {b.address}
                        </div>
                      )}

                      {/* Teléfono */}
                      {b.phone && (
                        <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 6 }}>
                          📞 {b.phone}
                        </div>
                      )}

                      {/* Empleados y Ventas */}
                      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 4 }}>
                        <div>
                          <span style={{ fontSize: 10, color: "var(--text-faint)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.3px" }}>Empleados</span>
                          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>{b.employees}</div>
                        </div>
                        <div>
                          <span style={{ fontSize: 10, color: "var(--text-faint)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.3px" }}>Ventas</span>
                          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>{b.sales}</div>
                        </div>
                      </div>
                    </div>

                    {/* Acciones */}
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, paddingTop: 2 }}>
                      <button
                        onClick={() => openEdit(b)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: "var(--accent-soft)",
                          border: "1px solid var(--accent-soft)",
                          borderRadius: 8,
                          width: 34,
                          height: 34,
                          cursor: "pointer",
                          color: "var(--accent-strong)",
                          padding: 0,
                        }}
                        className="active-tap"
                        title="Editar sucursal"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => toggleExpandBranch(b.id)}
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
                    }}>
                      <div style={{
                        backgroundColor: "var(--surface-2)",
                        borderRadius: 12,
                        border: "1px solid var(--border)",
                        padding: 16,
                      }}>
                        <h4 style={{ fontSize: 13, fontWeight: 800, color: "var(--text)", marginBottom: 10 }}>Dirección y Alta</h4>
                        <div style={branchDetailRow}>
                          <span style={branchDetailLabel}>Dirección:</span>
                          <span style={branchDetailValue}>{b.address || "—"}</span>
                        </div>
                        <div style={branchDetailRow}>
                          <span style={branchDetailLabel}>F. Alta:</span>
                          <span style={branchDetailValue}>{fmtDate(b.createdAt)}</span>
                        </div>
                        <div style={{ marginTop: 14 }}>
                          <h4 style={{ fontSize: 13, fontWeight: 800, color: "var(--text)", marginBottom: 10 }}>Colaboradores</h4>
                          <button
                            onClick={() => openEmployeesModal(b)}
                            style={{
                              ...ui.ghostBtn,
                              color: "var(--accent)",
                              borderColor: "var(--accent-soft)",
                              fontSize: 12,
                              padding: "6px 12px",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                            }}
                            className="active-tap"
                          >
                            Ver y gestionar empleados ({b.employees})
                          </button>
                        </div>
                      </div>
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
            data={filteredRows}
            loading={loading}
            error={error}
            keyExtractor={(b) => b.id}
          />
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* Modal crear / editar                                                  */}
      {/* ------------------------------------------------------------------- */}
      <ActionModal
        isOpen={editing !== null}
        onClose={closeModal}
        title={editing === "create" ? "Registrar nueva sucursal" : "Editar sucursal"}
        size="md"
      >
        <form onSubmit={submit}>
          {/* Nombre */}
          <div style={{ marginBottom: 14 }}>
            <label style={ui.fieldLabel}>Nombre de la sucursal *</label>
            <input
              style={inputWithError(!!fieldErrors.name)}
              value={form.name}
              onChange={handleNameChange}
              placeholder="Ej. Sucursal Centro LYFRGL"
              autoFocus
              maxLength={80}
            />
            {fieldErrors.name && (
              <span style={fieldErrStyle}>{fieldErrors.name}</span>
            )}
          </div>

          {/* Dirección */}
          <div style={{ marginBottom: 14 }}>
            <label style={ui.fieldLabel}>Dirección *</label>
            <input
              style={inputWithError(!!fieldErrors.address)}
              value={form.address}
              onChange={handleAddressChange}
              placeholder="Calle, número, colonia, ciudad"
              maxLength={150}
            />
            {fieldErrors.address && (
              <span style={fieldErrStyle}>{fieldErrors.address}</span>
            )}
          </div>

          {/* Teléfono */}
          <div style={{ marginBottom: 14 }}>
            <PhoneField
              value={form.phone}
              onChange={handlePhoneChange}
              countryIso={form.phoneCountryIso}
              onCountryChange={handlePhoneCountryChange}
              error={fieldErrors.phone}
              required
              disabled={saving}
            />
          </div>

          {/* Sucursal activa */}
          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", marginTop: 4 }}>
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
              style={{ width: 16, height: 16, accentColor: "var(--accent)", cursor: "pointer" }}
            />
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>Sucursal activa</span>
          </label>

          {/* Error general del servidor */}
          {formError && (
            <p style={{ color: "var(--color-danger)", fontSize: 13, fontWeight: 600, marginTop: 14 }}>{formError}</p>
          )}

          {/* Botones */}
          <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
            <button
              type="button"
              style={{ ...ui.ghostBtn, flex: 1, justifyContent: "center" }}
              onClick={closeModal}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !isFormValid}
              style={saveButtonStyle}
            >
              {saving
                ? "Guardando..."
                : editing === "create"
                  ? "Guardar sucursal"
                  : "Guardar cambios"}
            </button>
          </div>
        </form>
      </ActionModal>

      {/* ------------------------------------------------------------------- */}
      {/* Modal de empleados y reasignación                                     */}
      {/* ------------------------------------------------------------------- */}
      <ActionModal
        isOpen={showEmployeesModal && !!selectedBranch}
        onClose={() => setShowEmployeesModal(false)}
        title={`Empleados — ${selectedBranch?.name ?? ""}`}
        size="lg"
        contentStyle={{
          width: "calc(100% - 24px)",
          maxWidth: 1080,
          padding: isMobile ? 16 : 24,
        }}
      >
        {selectedBranch && (() => {
          const branchEmployees = allEmployees.filter(
            (e: any) => e.branchId === selectedBranch.id
          );
          return branchEmployees.length === 0 ? (
            <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "16px 0" }}>
              No hay empleados en esta sucursal.
            </p>
          ) : (
            <>
              <div style={{ maxHeight: "56vh", overflowY: "auto", paddingRight: 4 }}>
                {branchEmployees.map((emp: any) => {
                  const open = !!expandedEmp[emp.id];
                  const roleTone = emp.role === "ADMIN" ? "red" : emp.role === "GERENTE" ? "amber" : "blue";
                  const initials = String(emp.name || "?")
                    .trim()
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((w: string) => w[0])
                    .join("")
                    .toUpperCase();
                  return (
                    <div
                      key={emp.id}
                      style={{
                        border: "1px solid var(--border)",
                        borderRadius: 10,
                        background: "var(--surface)",
                        overflow: "hidden",
                        marginBottom: 8,
                        flexShrink: 0,
                      }}
                    >
                      {/* Cabecera (flecha desplegable) */}
                      <button
                        type="button"
                        className="active-tap"
                        onClick={() => setExpandedEmp((p) => ({ ...p, [emp.id]: !p[emp.id] }))}
                        style={{
                          width: "100%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 10,
                          padding: "11px 13px",
                          background: "transparent",
                          border: "none",
                          cursor: "pointer",
                          textAlign: "left",
                          fontFamily: "inherit",
                        }}
                      >
                        <span style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0 }}>
                          <span
                            style={{
                              width: 34,
                              height: 34,
                              borderRadius: "50%",
                              background: "var(--accent-soft)",
                              color: "var(--accent-strong)",
                              fontSize: 12,
                              fontWeight: 800,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0,
                            }}
                          >
                            {initials}
                          </span>
                          <span style={{ minWidth: 0 }}>
                            <span style={{ display: "block", fontWeight: 700, fontSize: 14, color: "var(--text)", overflowWrap: "anywhere" }}>
                              {emp.name}
                            </span>
                            <span style={{ display: "block", fontSize: 11.5, color: "var(--text-muted)", fontWeight: 600 }}>{emp.role}</span>
                          </span>
                        </span>
                        <span style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                          <Badge tone={emp.active ? "green" : "red"}>{emp.active ? "Activo" : "Inactivo"}</Badge>
                          {open ? <ChevronUp size={16} color="var(--text-muted)" /> : <ChevronDown size={16} color="var(--text-muted)" />}
                        </span>
                      </button>

                      {/* Detalle desplegado */}
                      {open && (
                        <div style={{ padding: "12px 13px 13px", borderTop: "1px solid var(--border-soft)" }}>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                            <div>
                              <div style={empLabel}>Rol</div>
                              <Badge tone={roleTone}>{emp.role}</Badge>
                            </div>
                            <div>
                              <div style={empLabel}>Estado</div>
                              <Badge tone={emp.active ? "green" : "red"}>{emp.active ? "Activo" : "Inactivo"}</Badge>
                            </div>
                          </div>
                          <button
                            style={{ ...ui.ghostBtn, width: "100%", justifyContent: "center" }}
                            className="active-tap"
                            onClick={() => { setReassignId(emp.id); setReassignTarget(""); }}
                          >
                            Reasignar a otra sucursal
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Formulario de reasignación */}
              {reassignId !== null && (
                <div
                  style={{
                    marginTop: 18,
                    padding: 16,
                    background: "var(--accent-soft)",
                    borderRadius: 8,
                    border: "1px solid var(--accent-soft)",
                  }}
                >
                  <p style={{ fontWeight: 700, marginBottom: 10, fontSize: 14 }}>
                    Reasignar:{" "}
                    {branchEmployees.find((e: any) => e.id === reassignId)?.name}
                  </p>
                  <label style={ui.fieldLabel}>Sucursal destino</label>
                  <select
                    value={reassignTarget}
                    onChange={(e) => setReassignTarget(e.target.value)}
                    style={{ ...ui.input, marginBottom: 12 }}
                  >
                    <option value="">-- Seleccionar --</option>
                    {rows
                      .filter((b) => b.id !== selectedBranch.id)
                      .map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name} ({b.employees} empleado{b.employees === 1 ? "" : "s"})
                        </option>
                      ))}
                  </select>
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                    <button
                      style={ui.ghostBtn}
                      onClick={() => { setReassignId(null); setReassignTarget(""); }}
                    >
                      Cancelar
                    </button>
                    <button
                      style={{
                        ...ui.primaryBtn,
                        opacity: reassigningEmployeeId === reassignId ? 0.6 : 1,
                        cursor: reassigningEmployeeId === reassignId ? "not-allowed" : "pointer",
                      }}
                      onClick={handleReassign}
                      disabled={reassigningEmployeeId === reassignId}
                    >
                      {reassigningEmployeeId === reassignId ? "Reasignando..." : "Confirmar reasignación"}
                    </button>
                  </div>
                </div>
              )}
            </>
          );
        })()}
      </ActionModal>
    </div>
  );
};

export default SucursalesView;
