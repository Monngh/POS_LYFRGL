import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Pencil, Plus } from "lucide-react";
import api from "../../shared/services/api";
import { useAdminData } from "../../shared/hooks";
import { DataTable, ActionModal } from "../../shared/ui";
import type { Column } from "../../shared/ui";
import {
  normalizePhoneInput,
  validatePhone as validatePhoneFormat,
  validateReference,
  validateSafeText,
} from "../../shared/utils/formValidation";
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
  active: boolean;
}

interface FieldErrors {
  name?: string;
  address?: string;
  phone?: string;
}

const emptyForm: FormState = { name: "", address: "", phone: "", active: true };
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

const validatePhone = (value: string): string | undefined => {
  return validatePhoneFormat(value, { required: true });
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

const SucursalesView: React.FC<ViewProps> = ({ refreshToken }) => {
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
      !validatePhone(form.phone)
    );
  }, [form.name, form.address, form.phone]);

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
      alert("Selecciona un empleado y una sucursal destino.");
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
    } catch (err: any) {
      alert(err.response?.data?.message || "Error al reasignar empleado.");
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
      phone: b.phone || "",
      active: b.active,
    };
    setForm(loadedForm);
    // Mostrar errores de campo solo si los datos actuales ya son inválidos
    setFieldErrors({
      name: validateName(loadedForm.name),
      address: validateAddress(loadedForm.address),
      phone: validatePhone(loadedForm.phone),
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

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = normalizePhoneInput(e.target.value).slice(0, 20);
    setForm((f) => ({ ...f, phone: val }));
    setFieldErrors((fe) => ({ ...fe, phone: validatePhone(val) }));
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
    color: "#b91c1c",
    fontSize: 12,
    fontWeight: 600,
    marginTop: 4,
    display: "block",
  };

  // Borde rojo en input inválido (solo si hay error)
  const inputWithError = (hasError: boolean): React.CSSProperties => ({
    ...ui.input,
    borderColor: hasError ? "#fca5a5" : undefined,
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
        <span style={{ fontSize: 13, color: "#15803d", fontWeight: 700 }}>{activeCount} activa(s)</span>
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
          {/* Header row mirroring the fields */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1.5fr 1.6fr",
            padding: "12px 16px",
            fontWeight: 700,
            fontSize: 11,
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.4px",
          }}>
            <div>Emp.</div>
            <div style={{ textAlign: "center" }}>Ventas</div>
            <div>Teléfono</div>
            <div style={{ textAlign: "right", paddingRight: 8 }}>Acción</div>
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
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    marginBottom: 10,
                    boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
                    overflow: "hidden",
                  }}
                >
                  {/* Header: Nombre y Estado */}
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
                    <span>{b.name.toUpperCase()}</span>
                    <Badge tone={b.active ? "green" : "red"}>{b.active ? "Activa" : "Inactiva"}</Badge>
                  </div>

                  {/* Fila principal */}
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1.5fr 1.6fr",
                    padding: "12px 16px",
                    alignItems: "center",
                  }}>
                    {/* Empleados */}
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-secondary)" }}>
                      {b.employees}
                    </div>

                    {/* Ventas */}
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", textAlign: "center" }}>
                      {b.sales}
                    </div>

                    {/* Teléfono */}
                    <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                      {b.phone || "—"}
                    </div>

                    {/* Botones de Acción */}
                    <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8 }}>
                      {/* Pencil/Editar */}
                      <button
                        onClick={() => openEdit(b)}
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
                          color: "var(--accent-strong)",
                          padding: 0,
                        }}
                        className="active-tap"
                        title="Editar sucursal"
                      >
                        <Pencil size={14} />
                      </button>

                      {/* Chevron */}
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
                      padding: "16px",
                      margin: "0 16px 16px 16px",
                      backgroundColor: "var(--surface-2)",
                      borderRadius: "8px",
                      border: "1px solid var(--border)",
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(185px, 1fr))",
                      gap: "16px",
                      textAlign: "left",
                    }}>
                      {/* Datos Generales */}
                      <div>
                        <h4 style={{ fontSize: 13, fontWeight: 800, color: "var(--text)", marginBottom: 10 }}>Dirección y Alta</h4>
                        <div style={branchDetailRow}>
                          <span style={branchDetailLabel}>Dirección:</span>
                          <span style={branchDetailValue}>{b.address || "—"}</span>
                        </div>
                        <div style={branchDetailRow}>
                          <span style={branchDetailLabel}>F. Alta:</span>
                          <span style={branchDetailValue}>{fmtDate(b.createdAt)}</span>
                        </div>
                      </div>

                      {/* Gestión de Personal */}
                      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "flex-start" }}>
                        <h4 style={{ fontSize: 13, fontWeight: 800, color: "var(--text)", marginBottom: 10 }}>Colaboradores</h4>
                        <button
                          onClick={() => openEmployeesModal(b)}
                          style={{
                            ...ui.ghostBtn,
                            color: "var(--accent)",
                            borderColor: "#93c5fd",
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

          {/* Teléfono — solo acepta dígitos */}
          <div style={{ marginBottom: 14 }}>
            <label style={ui.fieldLabel}>Teléfono * (10 dígitos)</label>
            <input
              style={inputWithError(!!fieldErrors.phone)}
              value={form.phone}
              onChange={handlePhoneChange}
              placeholder="7710000000"
              inputMode="numeric"
            />
            {fieldErrors.phone && (
              <span style={fieldErrStyle}>{fieldErrors.phone}</span>
            )}
          </div>

          {/* Sucursal activa */}
          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", marginTop: 4 }}>
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
              style={{ width: 16, height: 16, accentColor: "#1e3a8a", cursor: "pointer" }}
            />
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>Sucursal activa</span>
          </label>

          {/* Error general del servidor */}
          {formError && (
            <p style={{ color: "#b91c1c", fontSize: 13, fontWeight: 600, marginTop: 14 }}>{formError}</p>
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
        size="md"
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
              <div style={{ ...ui.tableWrap, boxShadow: "none" }}>
                <table style={ui.table}>
                  <thead>
                    <tr style={ui.theadRow}>
                      <th style={ui.th}>Nombre</th>
                      <th style={{ ...ui.th, textAlign: "center" }}>Rol</th>
                      <th style={{ ...ui.th, textAlign: "center" }}>Estado</th>
                      <th style={{ ...ui.th, textAlign: "center" }}>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {branchEmployees.map((emp: any) => (
                      <tr key={emp.id}>
                        <td style={ui.td}>{emp.name}</td>
                        <td style={{ ...ui.td, textAlign: "center" }}>
                          <Badge
                            tone={
                              emp.role === "ADMIN"
                                ? "red"
                                : emp.role === "GERENTE"
                                  ? "amber"
                                  : "blue"
                            }
                          >
                            {emp.role}
                          </Badge>
                        </td>
                        <td style={{ ...ui.td, textAlign: "center" }}>
                          <Badge tone={emp.active ? "green" : "red"}>
                            {emp.active ? "Activo" : "Inactivo"}
                          </Badge>
                        </td>
                        <td style={{ ...ui.td, textAlign: "center" }}>
                          <button
                            style={ui.linkBtn}
                            onClick={() => {
                              setReassignId(emp.id);
                              setReassignTarget("");
                            }}
                          >
                            Reasignar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Formulario de reasignación */}
              {reassignId !== null && (
                <div
                  style={{
                    marginTop: 18,
                    padding: 16,
                    background: "#eff6ff",
                    borderRadius: 8,
                    border: "1px solid #bfdbfe",
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
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
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
