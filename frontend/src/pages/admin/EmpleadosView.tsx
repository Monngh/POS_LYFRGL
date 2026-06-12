import React, { useEffect, useState, useCallback, useRef } from "react";
import { X, Plus, Activity, Pencil } from "lucide-react";
import api from "../../services/api";
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
  roleTone,
  statusTone,
} from "./shared";

interface EmployeeRow {
  id: number;
  name: string;
  email: string;
  role: string;
  active: boolean;
  branch: string;
  createdAt: string;
  phone?: string | null;
  baseSalary?: number | null;
  commissionRate?: number | null;
}

interface BranchOption {
  id: number;
  name: string;
}

interface Operations {
  employee: { id: number; name: string; email: string; role: string; active: boolean; branch: string };
  summary: {
    salesCount: number;
    salesTotal: number;
    cancelledCount: number;
    sessionsCount: number;
    openSessions: number;
    depositsCount: number;
    depositsTotal: number;
    avgPerTicket?: number;
    estimatedCommission?: number;
  };
  recentSales: { id: number; invoiceNumber: string; createdAt: string; totalAmount: number; paymentMethod: string; status: string }[];
  recentSessions: { id: number; openedAt: string; closedAt: string | null; initialAmount: number; difference: number | null; status: string }[];
}

const emptyForm = {
  name: "",
  email: "",
  password: "",
  role: "CAJERO",
  branchId: "",
  pinCode: "",
  phone: "",
  baseSalary: "",
  commissionRate: "",
  newPin: "",
};

type FormState = typeof emptyForm;
type FieldErrors = Partial<Record<keyof FormState, string>>;

const PHONE_PATTERN = /^\d{10}$/;
const NAME_PATTERN = /^[A-Za-z\u00C0-\u017F\s]+$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const EmpleadosView: React.FC<ViewProps> = ({ branchId, refreshToken }) => {
  const [rows, setRows] = useState<EmployeeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("all");
  const [branches, setBranches] = useState<BranchOption[]>([]);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editActive, setEditActive] = useState(true);
  const [form, setForm] = useState({ ...emptyForm });
  const [originalForm, setOriginalForm] = useState<FormState | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const submitClickedRef = useRef(false);
  const [ops, setOps] = useState<Operations | null>(null);
  const [opsLoading, setOpsLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ employees: EmployeeRow[] }>("/api/admin/employees", {
        params: {
          ...(branchId !== "all" ? { branchId } : {}),
          ...(role !== "all" ? { role } : {}),
          ...(search.trim() ? { search: search.trim() } : {}),
        },
      });
      setRows(res.data.employees);
    } catch (err: any) {
      setError(err.response?.data?.message || "No se pudieron cargar los empleados.");
    } finally {
      setLoading(false);
    }
  }, [branchId, role, search, refreshToken]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    api.get<{ branches: BranchOption[] }>("/api/auth/branches").then((r) => setBranches(r.data.branches)).catch(() => { });
  }, []);

  // 🔥 Verificar si hay cambios reales en edición
  const hasChanges = (): boolean => {
    if (!originalForm) return true;

    const compareCurrent = {
      name: form.name.trim(),
      email: form.email.trim(),
      role: form.role,
      branchId: form.branchId,
      phone: form.phone,
      baseSalary: form.baseSalary,
      commissionRate: form.commissionRate,
      active: editActive,
    };
    const compareOriginal = {
      name: originalForm.name?.trim() || "",
      email: originalForm.email?.trim() || "",
      role: originalForm.role || "",
      branchId: originalForm.branchId || "",
      phone: originalForm.phone || "",
      baseSalary: originalForm.baseSalary || "",
      commissionRate: originalForm.commissionRate || "",
      active: editActive,
    };

    return JSON.stringify(compareCurrent) !== JSON.stringify(compareOriginal);
  };

  // 🔥 Validar formulario
  const validateForm = (): boolean => {
    const errors: FieldErrors = {};
    let isValid = true;

    // Nombre
    if (!form.name.trim()) {
      errors.name = "El nombre es obligatorio.";
      isValid = false;
    } else if (form.name.length < 3) {
      errors.name = "Mínimo 3 caracteres.";
      isValid = false;
    } else if (!NAME_PATTERN.test(form.name)) {
      errors.name = "Solo letras y espacios.";
      isValid = false;
    }

    // Email
    if (!form.email.trim()) {
      errors.email = "El correo es obligatorio.";
      isValid = false;
    } else if (!EMAIL_PATTERN.test(form.email)) {
      errors.email = "Correo inválido.";
      isValid = false;
    }

    // Teléfono (opcional)
    if (form.phone) {
      const phoneDigits = form.phone.replace(/\D/g, "");
      if (!PHONE_PATTERN.test(phoneDigits)) {
        errors.phone = "Debe tener 10 dígitos.";
        isValid = false;
      }
    }

    // Rol
    if (!form.role) {
      errors.role = "Seleccione un rol.";
      isValid = false;
    }

    // Sucursal
    if (!form.branchId) {
      errors.branchId = "Seleccione una sucursal.";
      isValid = false;
    }

    // Contraseña (solo en creación)
    if (!editingId && (!form.password || form.password.length < 6)) {
      errors.password = "Mínimo 6 caracteres.";
      isValid = false;
    }

    // PIN para cajeros (solo en creación)
    if (!editingId && form.role === "CAJERO" && (!form.pinCode || form.pinCode.length !== 4)) {
      errors.pinCode = "PIN de 4 dígitos requerido.";
      isValid = false;
    }

    // Nuevo PIN (edición)
    if (editingId && form.newPin && !/^\d{4}$/.test(form.newPin)) {
      errors.newPin = "PIN debe tener 4 dígitos.";
      isValid = false;
    }

    // Sueldo base
    if (form.baseSalary && isNaN(parseFloat(form.baseSalary))) {
      errors.baseSalary = "Número inválido.";
      isValid = false;
    }

    // Comisión
    if (form.commissionRate) {
      const num = parseFloat(form.commissionRate);
      if (isNaN(num)) {
        errors.commissionRate = "Número inválido.";
        isValid = false;
      } else if (num > 100) {
        errors.commissionRate = "No puede ser mayor a 100.";
        isValid = false;
      }
    }

    setFieldErrors(errors);
    return isValid;
  };

  // 🔥 Verificar si el botón debe estar habilitado
  const isSaveEnabled = () => {
    if (saving) return false;

    // Validar campos obligatorios
    if (!form.name.trim()) return false;
    if (!form.email.trim()) return false;
    if (!form.role) return false;
    if (!form.branchId) return false;

    // En creación, validar contraseña
    if (!editingId) {
      if (!form.password || form.password.length < 6) return false;
      if (form.role === "CAJERO" && (!form.pinCode || form.pinCode.length !== 4)) return false;
    }

    // En edición, solo habilitar si HAY CAMBIOS
    if (editingId && !hasChanges()) return false;

    // Si hay errores, no habilitar
    if (Object.keys(fieldErrors).length > 0) return false;

    return true;
  };

  const updateField = (k: keyof typeof emptyForm, value: string) => {
    let nextValue = value;
    if (k === "phone") nextValue = value.replace(/\D/g, "").slice(0, 10);
    if (k === "pinCode" || k === "newPin") nextValue = value.replace(/\D/g, "").slice(0, 4);
    if (k === "name") nextValue = value.replace(/[^A-Za-z\u00C0-\u017F\s]/g, '');

    const newForm = { ...form, [k]: nextValue };
    setForm(newForm);
    setFieldErrors({ ...fieldErrors, [k]: undefined });

    // Limpiar mensaje de "no hubo cambios" cuando el usuario empieza a editar
    if (formError === "No hubo cambios para guardar.") {
      setFormError(null);
    }
  };

  const setField = (k: keyof typeof emptyForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    updateField(k, e.target.value);

  const openCreate = () => {
    setForm({ ...emptyForm });
    setOriginalForm(null);
    setEditingId(null);
    setEditActive(true);
    setFieldErrors({});
    setFormError(null);
    setShowForm(true);
  };

  const openEdit = (u: EmployeeRow) => {
    const branch = branches.find(b => b.name === u.branch);
    const editForm = {
      name: u.name,
      email: u.email,
      password: "",
      role: u.role,
      branchId: branch ? String(branch.id) : "",
      pinCode: "",
      phone: u.phone || "",
      baseSalary: u.baseSalary != null ? String(u.baseSalary) : "",
      commissionRate: u.commissionRate != null ? String(u.commissionRate) : "",
      newPin: "",
    };
    setForm(editForm);
    setOriginalForm(JSON.parse(JSON.stringify(editForm)));
    setEditingId(u.id);
    setEditActive(u.active);
    setFieldErrors({});
    setFormError(null);
    setShowForm(true);
  };

  const closeForm = () => {
    if (saving) return;
    setShowForm(false);
    setEditingId(null);
    setOriginalForm(null);
    setFieldErrors({});
    setFormError(null);
  };

  // 🔥 IMPORTANTE: El overlay NO cierra el modal al hacer clic fuera
  const handleOverlayClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (saving || submitClickedRef.current) return;

    // 🔥 Verificar cambios en edición ANTES de validar
    if (editingId && !hasChanges()) {
      setFormError("No hubo cambios para guardar.");
      return;
    }

    if (!validateForm()) {
      setFormError("Revisa los campos marcados.");
      return;
    }

    setSaving(true);
    submitClickedRef.current = true;
    setFormError(null);

    try {
      const baseSalaryValue = form.baseSalary ? parseFloat(form.baseSalary) : undefined;
      const commissionValue = form.commissionRate ? parseFloat(form.commissionRate) : undefined;

      if (editingId) {
        await api.put(`/api/admin/employees/${editingId}`, {
          name: form.name.trim(),
          email: form.email.trim().toLowerCase(),
          phone: form.phone || undefined,
          role: form.role,
          branchId: Number(form.branchId),
          baseSalary: baseSalaryValue,
          commissionRate: commissionValue,
          active: editActive,
          newPin: form.newPin || undefined,
        });
      } else {
        await api.post("/api/admin/employees", {
          name: form.name.trim(),
          email: form.email.trim().toLowerCase(),
          password: form.password,
          role: form.role,
          branchId: Number(form.branchId),
          pinCode: form.pinCode || undefined,
          phone: form.phone || undefined,
          baseSalary: baseSalaryValue,
          commissionRate: commissionValue,
        });
      }
      setShowForm(false);
      setForm({ ...emptyForm });
      setOriginalForm(null);
      setEditingId(null);
      setFieldErrors({});
      await load();
    } catch (err: any) {
      setFormError(err.response?.data?.message || "Error al guardar.");
    } finally {
      setSaving(false);
      submitClickedRef.current = false;
    }
  };

  const openOps = async (id: number) => {
    setOpsLoading(true);
    setOps(null);
    try {
      const res = await api.get<Operations>(`/api/admin/employees/${id}/operations`);
      setOps(res.data);
    } catch {
      setOps(null);
    } finally {
      setOpsLoading(false);
    }
  };

  return (
    <div>
      <SectionHeader
        title="Empleados"
        subtitle="Usuarios del sistema y sus permisos por sucursal"
        right={
          <button style={ui.primaryBtn} className="active-tap" onClick={openCreate}>
            <Plus size={16} /> Nuevo empleado
          </button>
        }
      />

      <Toolbar>
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar por nombre o correo" />
        <FilterSelect
          value={role}
          onChange={setRole}
          options={[
            { value: "all", label: "Todos los roles" },
            { value: "ADMIN", label: "Administradores" },
            { value: "GERENTE", label: "Gerentes" },
            { value: "CAJERO", label: "Cajeros" },
          ]}
        />
        <span style={{ marginLeft: "auto", fontSize: 13, color: "#64748b", fontWeight: 600 }}>
          {rows.length} empleado{rows.length === 1 ? "" : "s"}
        </span>
      </Toolbar>

      <div className="table-sticky-head" style={{ ...ui.tableWrap, overflowX: "auto", overflowY: "auto", maxHeight: "62vh" }}>
        <table style={ui.table}>
          <thead>
            <tr style={ui.theadRow}>
              <th style={ui.th}>Nombre</th>
              <th style={ui.th}>Correo</th>
              <th style={{ ...ui.th, textAlign: "center" }}>Rol</th>
              <th style={ui.th}>Sucursal</th>
              <th style={{ ...ui.th, textAlign: "center" }}>Estado</th>
              <th style={ui.th}>Alta</th>
              <th style={{ ...ui.th, textAlign: "center" }}>Operaciones</th>
              <th style={{ ...ui.th, textAlign: "center" }}></th>
            </tr>
          </thead>
          <tbody>
            <TableState colSpan={8} loading={loading} error={error} empty={!loading && rows.length === 0} />
            {!loading && !error && rows.map((u) => (
              <tr key={u.id}>
                <td style={{ ...ui.td, fontWeight: 700, color: "#0f172a", whiteSpace: "normal" }}>{u.name}</td>
                <td style={{ ...ui.td, color: "#475569" }}>{u.email}</td>
                <td style={{ ...ui.td, textAlign: "center" }}>
                  <Badge tone={roleTone(u.role)}>{u.role}</Badge>
                </td>
                <td style={ui.td}>{u.branch}</td>
                <td style={{ ...ui.td, textAlign: "center" }}>
                  <Badge tone={u.active ? "green" : "red"}>{u.active ? "Activo" : "Inactivo"}</Badge>
                </td>
                <td style={{ ...ui.td, color: "#64748b" }}>{fmtDate(u.createdAt)}</td>
                <td style={{ ...ui.td, textAlign: "center" }}>
                  <button style={ui.linkBtn} className="active-tap" onClick={() => openOps(u.id)}>
                    <Activity size={14} style={{ verticalAlign: "-2px" }} /> Ver
                  </button>
                </td>
                <td style={{ ...ui.td, textAlign: "center" }}>
                  <button
                    onClick={() => openEdit(u)}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: "4px 6px", borderRadius: 4, color: "#1e3a8a" }}
                    title="Editar empleado"
                  >
                    <Pencil size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal - NO se cierra al hacer clic fuera */}
      {showForm && (
        <div style={ui.overlay} onClick={handleOverlayClick}>
          <form
            style={{
              ...ui.modal,
              maxWidth: 700,
              width: "90%",
              maxHeight: "90vh",
              overflowY: "auto"
            }}
            onClick={(e) => e.stopPropagation()}
            onSubmit={submit}
          >
            <div style={ui.modalHeader}>
              <span style={ui.modalTitle}>{editingId !== null ? "Editar empleado" : "Registrar nuevo empleado"}</span>
              <button type="button" style={ui.linkBtn} onClick={closeForm} disabled={saving}>
                <X size={18} color="#64748b" />
              </button>
            </div>
            <div style={ui.modalBody}>
              {/* Fila 1: Nombre completo */}
              <div style={{ marginBottom: 16 }}>
                <label style={ui.fieldLabel}>Nombre completo *</label>
                <input
                  style={{ ...ui.input, borderColor: fieldErrors.name ? "#dc2626" : "#d1d5db" }}
                  value={form.name}
                  onChange={setField("name")}
                  placeholder="Nombre del empleado"
                  autoFocus
                  disabled={saving}
                />
                {fieldErrors.name && <p style={{ color: "#b91c1c", fontSize: 12, marginTop: 5 }}>{fieldErrors.name}</p>}
              </div>

              {/* Fila 2: Correo + Teléfono */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                <div>
                  <label style={ui.fieldLabel}>Correo electrónico *</label>
                  <input
                    style={{ ...ui.input, borderColor: fieldErrors.email ? "#dc2626" : "#d1d5db" }}
                    value={form.email}
                    onChange={setField("email")}
                    placeholder="correo@empresa.com"
                    disabled={saving}
                  />
                  {fieldErrors.email && <p style={{ color: "#b91c1c", fontSize: 12, marginTop: 5 }}>{fieldErrors.email}</p>}
                </div>
                <div>
                  <label style={ui.fieldLabel}>Teléfono</label>
                  <input
                    style={{ ...ui.input, borderColor: fieldErrors.phone ? "#dc2626" : "#d1d5db" }}
                    value={form.phone}
                    onChange={setField("phone")}
                    placeholder="7710000000"
                    maxLength={10}
                    disabled={saving}
                  />
                  {fieldErrors.phone && <p style={{ color: "#b91c1c", fontSize: 12, marginTop: 5 }}>{fieldErrors.phone}</p>}
                  <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>10 dígitos (opcional)</p>
                </div>
              </div>

              {/* Fila 3: Rol + Sucursal */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                <div>
                  <label style={ui.fieldLabel}>Rol *</label>
                  <select
                    style={{ ...ui.input, borderColor: fieldErrors.role ? "#dc2626" : "#d1d5db" }}
                    value={form.role}
                    onChange={setField("role")}
                    disabled={saving}
                  >
                    <option value="CAJERO">Cajero</option>
                    <option value="GERENTE">Gerente</option>
                    <option value="ADMIN">Administrador</option>
                  </select>
                  {fieldErrors.role && <p style={{ color: "#b91c1c", fontSize: 12, marginTop: 5 }}>{fieldErrors.role}</p>}
                </div>
                <div>
                  <label style={ui.fieldLabel}>Sucursal *</label>
                  <select
                    style={{ ...ui.input, borderColor: fieldErrors.branchId ? "#dc2626" : "#d1d5db" }}
                    value={form.branchId}
                    onChange={setField("branchId")}
                    disabled={saving}
                  >
                    <option value="">Seleccione...</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                  {fieldErrors.branchId && <p style={{ color: "#b91c1c", fontSize: 12, marginTop: 5 }}>{fieldErrors.branchId}</p>}
                </div>
              </div>

              {/* Fila 4: Sueldo base + % Comisión */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                <div>
                  <label style={ui.fieldLabel}>Sueldo base ($)</label>
                  <input
                    style={ui.input}
                    type="text"
                    inputMode="decimal"
                    value={form.baseSalary}
                    onChange={setField("baseSalary")}
                    placeholder="0.00"
                    disabled={saving}
                  />
                  {fieldErrors.baseSalary && <p style={{ color: "#b91c1c", fontSize: 12, marginTop: 5 }}>{fieldErrors.baseSalary}</p>}
                </div>
                <div>
                  <label style={ui.fieldLabel}>% Comisión de ventas</label>
                  <input
                    style={ui.input}
                    type="text"
                    inputMode="decimal"
                    value={form.commissionRate}
                    onChange={setField("commissionRate")}
                    placeholder="0.00"
                    disabled={saving}
                  />
                  <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>Ej: 2.5 = 2.5%</p>
                  {fieldErrors.commissionRate && <p style={{ color: "#b91c1c", fontSize: 12, marginTop: 5 }}>{fieldErrors.commissionRate}</p>}
                </div>
              </div>

              {/* Sección CREACIÓN (solo para nuevo empleado) */}
              {!editingId && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                  <div>
                    <label style={ui.fieldLabel}>Contraseña *</label>
                    <input
                      style={{ ...ui.input, borderColor: fieldErrors.password ? "#dc2626" : "#d1d5db" }}
                      type="password"
                      value={form.password}
                      onChange={setField("password")}
                      placeholder="Mínimo 6 caracteres"
                      disabled={saving}
                    />
                    {fieldErrors.password && <p style={{ color: "#b91c1c", fontSize: 12, marginTop: 5 }}>{fieldErrors.password}</p>}
                  </div>
                  <div>
                    <label style={ui.fieldLabel}>PIN {form.role === "CAJERO" ? "(4 dígitos) *" : "(opcional)"}</label>
                    <input
                      style={{ ...ui.input, borderColor: fieldErrors.pinCode ? "#dc2626" : "#d1d5db" }}
                      value={form.pinCode}
                      onChange={setField("pinCode")}
                      maxLength={4}
                      placeholder="0000"
                      disabled={saving}
                    />
                    {fieldErrors.pinCode && <p style={{ color: "#b91c1c", fontSize: 12, marginTop: 5 }}>{fieldErrors.pinCode}</p>}
                  </div>
                </div>
              )}

              {/* Sección EDICIÓN */}
              {editingId && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                  <div>
                    <label style={ui.fieldLabel}>Nuevo PIN (dejar vacío)</label>
                    <input
                      style={{ ...ui.input, borderColor: fieldErrors.newPin ? "#dc2626" : "#d1d5db" }}
                      value={form.newPin}
                      onChange={setField("newPin")}
                      maxLength={4}
                      placeholder="0000"
                      disabled={saving}
                    />
                    {fieldErrors.newPin && <p style={{ color: "#b91c1c", fontSize: 12, marginTop: 5 }}>{fieldErrors.newPin}</p>}
                    <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>4 dígitos numéricos</p>
                  </div>
                  <div>
                    <label style={ui.fieldLabel}>Estado del empleado</label>
                    <select
                      style={ui.input}
                      value={editActive ? "true" : "false"}
                      onChange={(e) => setEditActive(e.target.value === "true")}
                      disabled={saving}
                    >
                      <option value="true">Activo</option>
                      <option value="false">Inactivo (baja lógica)</option>
                    </select>
                  </div>
                </div>
              )}

              {formError && <p style={{ color: "#b91c1c", fontSize: 13, fontWeight: 600, marginTop: 10 }}>{formError}</p>}

              {/* Botones */}
              <div style={{ display: "flex", gap: 10, marginTop: 24, borderTop: "1px solid #e2e8f0", paddingTop: 20 }}>
                <button type="button" style={{ ...ui.ghostBtn, flex: 1, justifyContent: "center" }} onClick={closeForm} disabled={saving}>
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!isSaveEnabled()}
                  style={{
                    ...ui.primaryBtn,
                    flex: 1,
                    justifyContent: "center",
                    opacity: isSaveEnabled() ? 1 : 0.6,
                    cursor: isSaveEnabled() ? "pointer" : "not-allowed"
                  }}
                >
                  {saving ? "Guardando..." : editingId !== null ? "Actualizar empleado" : "Registrar empleado"}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Modal operaciones del vendedor */}
      {(ops || opsLoading) && (
        <div style={ui.overlay} onClick={() => setOps(null)}>
          <div style={{ ...ui.modal, maxWidth: 600 }} onClick={(e) => e.stopPropagation()}>
            <div style={ui.modalHeader}>
              <span style={ui.modalTitle}>{opsLoading ? "Cargando operaciones..." : `Operaciones · ${ops?.employee.name}`}</span>
              <button style={ui.linkBtn} onClick={() => setOps(null)}>
                <X size={18} color="#64748b" />
              </button>
            </div>
            {ops && (
              <div style={ui.modalBody}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 18 }}>
                  <Mini label="Ventas" value={String(ops.summary.salesCount)} />
                  <Mini label="Total vendido" value={money(ops.summary.salesTotal)} />
                  <Mini label="Canceladas" value={String(ops.summary.cancelledCount)} />
                  <Mini label="Turnos" value={String(ops.summary.sessionsCount)} />
                  <Mini label="Depósitos" value={String(ops.summary.depositsCount)} />
                  <Mini label="Monto depósitos" value={money(ops.summary.depositsTotal)} />
                  {ops.summary.avgPerTicket !== undefined && (
                    <Mini label="Promedio por ticket" value={money(ops.summary.avgPerTicket)} accent="blue" />
                  )}
                  {ops.summary.estimatedCommission !== undefined && ops.summary.estimatedCommission > 0 && (
                    <Mini label="Comisión estimada" value={money(ops.summary.estimatedCommission)} accent="green" />
                  )}
                </div>

                <h4 style={{ fontSize: 13, fontWeight: 800, color: "#1e3a8a", marginBottom: 8 }}>Últimas ventas</h4>
                <div style={{ ...ui.tableWrap, boxShadow: "none", marginBottom: 18 }}>
                  <table style={ui.table}>
                    <thead>
                      <tr style={ui.theadRow}>
                        <th style={ui.th}>Folio</th>
                        <th style={ui.th}>Fecha</th>
                        <th style={{ ...ui.th, textAlign: "right" }}>Total</th>
                        <th style={{ ...ui.th, textAlign: "center" }}>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ops.recentSales.length === 0 && <TableState colSpan={4} empty emptyText="Sin ventas registradas." />}
                      {ops.recentSales.map((s) => (
                        <tr key={s.id}>
                          <td style={{ ...ui.td, fontWeight: 700, color: "#1e3a8a" }}>{s.invoiceNumber}</td>
                          <td style={ui.td}>{fmtDate(s.createdAt)} {fmtTime(s.createdAt)}</td>
                          <td style={{ ...ui.td, textAlign: "right", fontWeight: 700 }}>{money(s.totalAmount)}</td>
                          <td style={{ ...ui.td, textAlign: "center" }}><Badge tone={statusTone(s.status)}>{s.status}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <h4 style={{ fontSize: 13, fontWeight: 800, color: "#1e3a8a", marginBottom: 8 }}>Últimos turnos de caja</h4>
                <table style={ui.table}>
                  <thead>
                    <tr style={ui.theadRow}>
                      <th style={ui.th}>#</th>
                      <th style={ui.th}>Apertura</th>
                      <th style={{ ...ui.th, textAlign: "right" }}>Diferencia</th>
                      <th style={{ ...ui.th, textAlign: "center" }}>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ops.recentSessions.length === 0 && <TableState colSpan={4} empty emptyText="Sin turnos registrados." />}
                    {ops.recentSessions.map((s) => (
                      <tr key={s.id}>
                        <td style={{ ...ui.td, fontWeight: 700, color: "#1e3a8a" }}>{s.id}</td>
                        <td style={ui.td}>{fmtDate(s.openedAt)} {fmtTime(s.openedAt)}</td>
                        <td style={{ ...ui.td, textAlign: "right", fontWeight: 700, color: s.difference && s.difference < 0 ? "#b91c1c" : "#334155" }}>
                          {s.difference !== null ? money(s.difference) : "—"}
                        </td>
                        <td style={{ ...ui.td, textAlign: "center" }}><Badge tone={statusTone(s.status)}>{s.status}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const Mini: React.FC<{ label: string; value: string; accent?: "blue" | "green" }> = ({ label, value, accent }) => {
  const accentStyles = {
    blue: { background: "#eff6ff", borderLeft: "4px solid #60a5fa" },
    green: { background: "#f0fdf4", borderLeft: "4px solid #4ade80" },
  };
  const valueColor = accent === "blue" ? "#2563eb" : accent === "green" ? "#16a34a" : "#0f172a";
  return (
    <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 12px", ...(accent ? accentStyles[accent] : {}) }}>
      <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: valueColor, marginTop: 3 }}>{value}</div>
    </div>
  );
};

export default EmpleadosView;