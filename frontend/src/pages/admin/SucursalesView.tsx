import React, { useEffect, useState, useCallback, useMemo } from "react";
import { X, Plus, Pencil } from "lucide-react";
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
} from "./shared";

// ---------------------------------------------------------------------------
// Regex para nombre de sucursal: letras, números, espacios, acentos, puntos y guiones
// ---------------------------------------------------------------------------
const NAME_REGEX = /^[a-zA-ZÀ-ÿ0-9 .\-]+$/;

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
  const v = value.trim();
  if (!v) return "El nombre de la sucursal es obligatorio.";
  if (v.length < 3) return "El nombre debe tener al menos 3 caracteres.";
  if (v.length > 80) return "El nombre no puede exceder 80 caracteres.";
  if (!NAME_REGEX.test(v))
    return "Solo se permiten letras, números, espacios, acentos, puntos y guiones.";
  return undefined;
};

const validateAddress = (value: string): string | undefined => {
  const v = value.trim();
  if (!v) return "La dirección es obligatoria.";
  if (v.length > 150) return "La dirección no puede exceder 150 caracteres.";
  return undefined;
};

const validatePhone = (value: string): string | undefined => {
  if (!value) return "El teléfono es obligatorio.";
  if (!/^\d{10}$/.test(value)) return "El teléfono debe tener exactamente 10 dígitos.";
  return undefined;
};

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------
const SucursalesView: React.FC<ViewProps> = ({ refreshToken }) => {
  const [rows, setRows] = useState<BranchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

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
  const [allEmployees, setAllEmployees] = useState<any[]>([]);
  const [reassignId, setReassignId] = useState<number | null>(null);
  const [reassignTarget, setReassignTarget] = useState<string>("");
  const [reassigning, setReassigning] = useState(false);

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
  // Carga de datos
  // ---------------------------------------------------------------------------
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ branches: BranchRow[] }>("/api/admin/branches", {
        params: search.trim() ? { search: search.trim() } : {},
      });
      setRows(res.data.branches);
    } catch (err: any) {
      setError(err.response?.data?.message || "No se pudieron cargar las sucursales.");
    } finally {
      setLoading(false);
    }
  }, [search, refreshToken]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  const loadEmployees = useCallback(async () => {
    try {
      const res = await api.get<{ employees: any[] }>("/api/admin/employees");
      setAllEmployees(res.data.employees);
    } catch {
      // silencioso; no bloquea el resto de la vista
    }
  }, []);

  useEffect(() => { loadEmployees(); }, [loadEmployees]);

  // ---------------------------------------------------------------------------
  // Apertura de modales
  // ---------------------------------------------------------------------------
  const openEmployeesModal = (b: BranchRow) => {
    setSelectedBranch(b);
    setReassignId(null);
    setReassignTarget("");
    setShowEmployeesModal(true);
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

  // Solo dígitos — bloquea letras mientras el usuario escribe
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, "").slice(0, 10);
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
      await load();
    } catch (err: any) {
      setFormError(err.response?.data?.message || "No se pudo guardar la sucursal.");
    } finally {
      setSaving(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Reasignación de empleados
  // ---------------------------------------------------------------------------
  const handleReassign = async () => {
    if (!reassignId || !reassignTarget || reassigning) {
      return;
    }
    setReassigning(true);
    try {
      await api.put(`/api/admin/employees/${reassignId}`, {
        branchId: parseInt(reassignTarget),
      });
      await Promise.all([
        load(),
        loadEmployees()
      ]);
      setReassignId(null);
      setReassignTarget("");
      setSelectedBranch((prev) =>
        prev
          ? { ...prev, employees: prev.employees - 1 }
          : prev
      );
    } catch (err: any) {
      alert(err.response?.data?.message || "Error al reasignar empleado.");
    } finally {
      setReassigning(false);
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
        <span style={{ marginLeft: "auto", fontSize: 13, color: "#64748b", fontWeight: 600 }}>
          {filteredRows.length} sucursal{filteredRows.length === 1 ? "" : "es"}
        </span>
      </Toolbar>

      <div className="table-sticky-head" style={{ ...ui.tableWrap, overflowX: "auto", overflowY: "auto", maxHeight: "62vh" }}>
        <table style={ui.table}>
          <thead>
            <tr style={ui.theadRow}>
              <th style={ui.th}>#</th>
              <th style={ui.th}>Nombre</th>
              <th style={ui.th}>Dirección</th>
              <th style={ui.th}>Teléfono</th>
              <th style={{ ...ui.th, textAlign: "center" }}>Empleados</th>
              <th style={{ ...ui.th, textAlign: "center" }}>Ventas</th>
              <th style={{ ...ui.th, textAlign: "center" }}>Estado</th>
              <th style={ui.th}>Alta</th>
              <th style={{ ...ui.th, textAlign: "center" }}>Acción</th>
            </tr>
          </thead>
          <tbody>
            <TableState colSpan={9} loading={loading} error={error} empty={!loading && filteredRows.length === 0} />
            {!loading &&
              !error &&
              filteredRows.map((b) => (
                <tr key={b.id}>
                  <td style={{ ...ui.td, fontWeight: 700, color: "#1e3a8a" }}>{b.id}</td>
                  <td style={{ ...ui.td, fontWeight: 700, color: "#0f172a", whiteSpace: "normal" }}>{b.name}</td>
                  <td style={{ ...ui.td, color: "#475569", whiteSpace: "normal" }}>{b.address || "—"}</td>
                  <td style={ui.td}>{b.phone || "—"}</td>
                  <td style={{ ...ui.td, textAlign: "center", fontWeight: 700 }}>{b.employees}</td>
                  <td style={{ ...ui.td, textAlign: "center", fontWeight: 700 }}>{b.sales}</td>
                  <td style={{ ...ui.td, textAlign: "center" }}>
                    <Badge tone={b.active ? "green" : "red"}>{b.active ? "Activa" : "Inactiva"}</Badge>
                  </td>
                  <td style={{ ...ui.td, color: "#64748b" }}>{fmtDate(b.createdAt)}</td>
                  <td style={{ ...ui.td, textAlign: "center" }}>
                    <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                      <button style={ui.linkBtn} className="active-tap" onClick={() => openEmployeesModal(b)}>
                        Empleados
                      </button>
                      <button style={ui.linkBtn} className="active-tap" onClick={() => openEdit(b)}>
                        <Pencil size={14} style={{ verticalAlign: "-2px" }} /> Editar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* ------------------------------------------------------------------- */}
      {/* Modal crear / editar                                                  */}
      {/* ------------------------------------------------------------------- */}
      {editing !== null && (
        <div
          style={ui.overlay}
          onClick={(e) => e.stopPropagation()}
        >
          <form
            style={ui.modal}
            onClick={(e) => e.stopPropagation()}
            onSubmit={submit}
          >
            <div style={ui.modalHeader}>
              <span style={ui.modalTitle}>
                {editing === "create" ? "Registrar nueva sucursal" : "Editar sucursal"}
              </span>
              <button type="button" style={ui.linkBtn} onClick={closeModal}>
                <X size={18} color="#64748b" />
              </button>
            </div>
            <div style={ui.modalBody}>

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
                <span style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>Sucursal activa</span>
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
            </div>
          </form>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* Modal de empleados y reasignación                                     */}
      {/* ------------------------------------------------------------------- */}
      {showEmployeesModal && selectedBranch && (
        <div style={ui.overlay} onClick={() => setShowEmployeesModal(false)}>
          <div
            style={{ ...ui.modal, maxWidth: 640, width: "100%", maxHeight: "80vh", overflowY: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={ui.modalHeader}>
              <span style={ui.modalTitle}>Empleados — {selectedBranch.name}</span>
              <button style={ui.linkBtn} onClick={() => setShowEmployeesModal(false)}>
                <X size={18} color="#64748b" />
              </button>
            </div>

            <div style={ui.modalBody}>
              {(() => {
                const branchEmployees = allEmployees.filter(
                  (e: any) => e.branchId === selectedBranch.id
                );
                return branchEmployees.length === 0 ? (
                  <p style={{ color: "#64748b", textAlign: "center", padding: "16px 0" }}>
                    No hay empleados en esta sucursal.
                  </p>
                ) : (
                  <>
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
                              opacity: reassigning ? 0.6 : 1,
                              cursor: reassigning ? "not-allowed" : "pointer",
                            }}
                            disabled={reassigning}
                            onClick={handleReassign}
                          >
                            {reassigning
                              ? "Reasignando..."
                              : "Confirmar reasignación"}
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SucursalesView;
