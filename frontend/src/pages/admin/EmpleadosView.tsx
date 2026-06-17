import React, { useEffect, useRef, useState } from "react";
import { Plus, Activity, Pencil } from "lucide-react";
import api from "../../services/api";
import { useAdminData } from "../../hooks";
import { DataTable, ActionModal } from "../../components/common";
import type { Column } from "../../components/common";
import {
  collectRoundedDecimalMessages,
  DECIMAL_INPUT_REGEX,
  getDecimalValidationValue,
  handleDecimalInputChange,
  validateDecimalField,
} from "../../utils/decimalInput";
import {
  normalizeEmailInput,
  normalizeIntegerInput,
  normalizePhoneInput,
  validateEmail,
  validatePhone,
  validateSafeText,
} from "../../utils/formValidation";
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

const EmpleadosView: React.FC<ViewProps> = ({ branchId, refreshToken }) => {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [role, setRole] = useState("all");

  // Alta / edición de empleado
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editActive, setEditActive] = useState(true);
  const [form, setForm] = useState({ ...emptyForm });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Operaciones del vendedor
  const [ops, setOps] = useState<Operations | null>(null);
  const [opsLoading, setOpsLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const employeeParams: Record<string, unknown> = {};
  if (branchId !== "all") employeeParams.branchId = branchId;
  if (role !== "all") employeeParams.role = role;
  if (debouncedSearch.trim()) employeeParams.search = debouncedSearch.trim();

  const { data, loading, error, refetch } = useAdminData<{ employees: EmployeeRow[] }>(
    "/api/admin/employees",
    { params: employeeParams }
  );
  const rows = data?.employees ?? [];

  const { data: branchesData } = useAdminData<{ branches: BranchOption[] }>("/api/auth/branches");
  const branches = branchesData?.branches ?? [];

  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    refetch();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshToken]);

  const validateEmployeeForm = (candidate: FormState = form) => {
    const errors: FieldErrors = {};
    const nameError = validateSafeText(candidate.name, "El nombre", { required: true, min: 3, max: 100 });
    if (nameError) errors.name = nameError;

    const emailError = validateEmail(candidate.email, { required: true });
    if (emailError) errors.email = emailError;

    const phoneError = validatePhone(candidate.phone, { required: false, minDigits: 10, maxDigits: 15 });
    if (phoneError) errors.phone = phoneError;

    if (editingId === null) {
      if (!candidate.password || candidate.password.length < 6) errors.password = "La contrasena debe tener al menos 6 caracteres.";
      if (!candidate.branchId) errors.branchId = "Seleccione una sucursal.";
      if (!["CAJERO", "GERENTE", "ADMIN"].includes(candidate.role)) errors.role = "Seleccione un rol valido.";
      if (candidate.role === "CAJERO") {
        if (!/^\d{4}$/.test(candidate.pinCode)) errors.pinCode = "Los cajeros requieren un PIN de 4 digitos.";
      }
    }

    if (editingId !== null && candidate.newPin) {
      if (!/^\d{4}$/.test(candidate.newPin)) errors.newPin = "El nuevo PIN debe tener 4 digitos.";
    }

    const baseSalaryValidation = candidate.baseSalary.trim()
      ? validateDecimalField(candidate.baseSalary, "El sueldo base", {
          invalidMessage: "El sueldo base debe ser un numero valido con maximo 3 decimales.",
        })
      : null;
    if (baseSalaryValidation && !baseSalaryValidation.ok) errors.baseSalary = baseSalaryValidation.error;

    const commissionValidation = candidate.commissionRate.trim()
      ? validateDecimalField(candidate.commissionRate, "La comision de ventas", {
          max: 100,
          invalidMessage: "La comision de ventas debe ser un numero valido con maximo 3 decimales.",
          maxMessage: "La comision de ventas no puede ser mayor a 100.",
        })
      : null;
    if (commissionValidation && !commissionValidation.ok) errors.commissionRate = commissionValidation.error;

    return errors;
  };

  const openCreate = () => {
    setForm({ ...emptyForm });
    setEditingId(null);
    setEditActive(true);
    setFieldErrors({});
    setFormError(null);
    setShowForm(true);
  };

  const openEdit = (u: EmployeeRow) => {
    setForm({
      name: u.name,
      email: u.email,
      password: "",
      role: u.role,
      branchId: "",
      pinCode: "",
      phone: u.phone || "",
      baseSalary: u.baseSalary != null ? String(u.baseSalary) : "",
      commissionRate: u.commissionRate != null ? String(u.commissionRate) : "",
      newPin: "",
    });
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
    setFieldErrors({});
    setFormError(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validation = validateEmployeeForm();
    if (Object.keys(validation).length > 0) {
      setFieldErrors(validation);
      setFormError("Revisa los campos marcados antes de guardar.");
      return;
    }

    const baseSalaryValidation = form.baseSalary.trim()
      ? validateDecimalField(form.baseSalary, "El sueldo base", {
          invalidMessage: "El sueldo base debe ser un numero valido con maximo 3 decimales.",
        })
      : null;
    if (baseSalaryValidation && !baseSalaryValidation.ok) {
      setFormError(baseSalaryValidation.error);
      return;
    }
    const baseSalaryValue = baseSalaryValidation ? getDecimalValidationValue(baseSalaryValidation) : null;

    const commissionValidation = form.commissionRate.trim()
      ? validateDecimalField(form.commissionRate, "La comision de ventas", {
          max: 100,
          invalidMessage: "La comision de ventas debe ser un numero valido con maximo 3 decimales.",
          maxMessage: "La comision de ventas no puede ser mayor a 100.",
        })
      : null;
    if (commissionValidation && !commissionValidation.ok) {
      setFormError(commissionValidation.error);
      return;
    }
    const commissionValue = commissionValidation ? getDecimalValidationValue(commissionValidation) : null;

    const roundingMessages = collectRoundedDecimalMessages([baseSalaryValue, commissionValue]);

    setSaving(true);
    setFormError(null);
    setFieldErrors({});
    try {
      if (roundingMessages.length > 0) {
        alert(roundingMessages.join("\n"));
      }

      if (editingId !== null) {
        await api.put(`/api/admin/employees/${editingId}`, {
          name: form.name,
          email: form.email,
          phone: form.phone || undefined,
          baseSalary: baseSalaryValue?.value ?? undefined,
          commissionRate: commissionValue?.value ?? undefined,
          active: editActive,
          newPin: form.newPin || undefined,
        });
      } else {
        await api.post("/api/admin/employees", {
          name: form.name,
          email: form.email,
          password: form.password,
          role: form.role,
          branchId: Number(form.branchId),
          pinCode: form.pinCode || undefined,
          phone: form.phone || undefined,
          baseSalary: baseSalaryValue?.value ?? undefined,
          commissionRate: commissionValue?.value ?? undefined,
        });
      }
      setShowForm(false);
      setForm({ ...emptyForm });
      setEditingId(null);
      setFieldErrors({});
      await refetch();
    } catch (err: any) {
      setFormError(err.response?.data?.message || "No se pudo guardar el empleado.");
    } finally {
      setSaving(false);
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

  const set = (k: keyof typeof emptyForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const raw = e.target.value;
    const value =
      k === "email"
        ? normalizeEmailInput(raw)
        : k === "phone"
          ? normalizePhoneInput(raw).slice(0, 20)
          : k === "pinCode" || k === "newPin"
            ? normalizeIntegerInput(raw).slice(0, 4)
            : raw;
    const nextForm = { ...form, [k]: value };
    const validation = validateEmployeeForm(nextForm);
    setForm(nextForm);
    setFormError(null);
    setFieldErrors((prev) => {
      const next = { ...prev };
      if (validation[k]) next[k] = validation[k];
      else delete next[k];
      return next;
    });
  };

  const setDecimal = (k: "baseSalary" | "commissionRate") => (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value.trim();
    if (rawValue && !DECIMAL_INPUT_REGEX.test(rawValue)) {
      setFieldErrors((prev) => ({
        ...prev,
        [k]: k === "baseSalary"
          ? "El sueldo base debe ser un numero valido con maximo 3 decimales."
          : "La comision de ventas debe ser un numero valido con maximo 3 decimales.",
      }));
      return;
    }
    handleDecimalInputChange(rawValue, (nextValue) => {
      const nextForm = { ...form, [k]: nextValue };
      const validation = validateEmployeeForm(nextForm);
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

  // ---------------------------------------------------------------------------
  // Columnas de la tabla principal
  // ---------------------------------------------------------------------------
  const columns: Column<EmployeeRow>[] = [
    {
      key: "name",
      header: "Nombre",
      render: (u) => (
        <span style={{ fontWeight: 700, color: "#0f172a", whiteSpace: "normal" }}>{u.name}</span>
      ),
    },
    {
      key: "email",
      header: "Correo",
      render: (u) => <span style={{ color: "#475569" }}>{u.email}</span>,
    },
    {
      key: "role",
      header: "Rol",
      align: "center",
      render: (u) => <Badge tone={roleTone(u.role)}>{u.role}</Badge>,
    },
    {
      key: "branch",
      header: "Sucursal",
    },
    {
      key: "active",
      header: "Estado",
      align: "center",
      render: (u) => (
        <Badge tone={u.active ? "green" : "red"}>{u.active ? "Activo" : "Inactivo"}</Badge>
      ),
    },
    {
      key: "createdAt",
      header: "Alta",
      render: (u) => <span style={{ color: "#64748b" }}>{fmtDate(u.createdAt)}</span>,
    },
    {
      key: "ops",
      header: "Operaciones",
      align: "center",
      render: (u) => (
        <button style={ui.linkBtn} className="active-tap" onClick={() => openOps(u.id)}>
          <Activity size={14} style={{ verticalAlign: "-2px" }} /> Ver
        </button>
      ),
    },
    {
      key: "edit",
      header: "",
      align: "center",
      render: (u) => (
        <button
          onClick={() => openEdit(u)}
          style={{ background: "none", border: "none", cursor: "pointer", padding: "4px 6px", borderRadius: 4, color: "#1e3a8a" }}
          title="Editar empleado"
        >
          <Pencil size={14} />
        </button>
      ),
    },
  ];

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

      <div className="table-sticky-head">
        <DataTable
          columns={columns}
          data={rows}
          loading={loading}
          error={error}
          keyExtractor={(u) => u.id}
        />
      </div>

      {/* Modal alta / edición de empleado */}
      <ActionModal
        isOpen={showForm}
        onClose={closeForm}
        title={editingId !== null ? "Editar empleado" : "Registrar nuevo empleado"}
        size="md"
      >
        <form onSubmit={submit}>
          <div style={{ marginBottom: 14 }}>
            <label style={ui.fieldLabel}>Nombre completo *</label>
            <input style={ui.input} value={form.name} onChange={set("name")} placeholder="Nombre del empleado" autoFocus />
            {fieldErrors.name && <p style={styles.fieldError}>{fieldErrors.name}</p>}
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={ui.fieldLabel}>Correo electrónico *</label>
            <input style={ui.input} value={form.email} onChange={set("email")} placeholder="correo@empresa.com" />
            {fieldErrors.email && <p style={styles.fieldError}>{fieldErrors.email}</p>}
          </div>

          {/* Teléfono */}
          <div style={{ marginBottom: 14 }}>
            <label style={ui.fieldLabel}>Teléfono</label>
            <input style={ui.input} value={form.phone} onChange={set("phone")} placeholder="771 000 0000" />
            {fieldErrors.phone && <p style={styles.fieldError}>{fieldErrors.phone}</p>}
          </div>

          {/* Sueldo base + % comisión */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
            <div>
              <label style={ui.fieldLabel}>Sueldo base ($)</label>
              <input style={ui.input} type="text" inputMode="decimal" value={form.baseSalary} onChange={setDecimal("baseSalary")} placeholder="0.00" />
              {fieldErrors.baseSalary && <p style={styles.fieldError}>{fieldErrors.baseSalary}</p>}
            </div>
            <div>
              <label style={ui.fieldLabel}>% Comisión de ventas</label>
              <input style={ui.input} type="text" inputMode="decimal" value={form.commissionRate} onChange={setDecimal("commissionRate")} placeholder="0.00" />
              <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>Ej: 2.5 para 2.5%</p>
              {fieldErrors.commissionRate && <p style={styles.fieldError}>{fieldErrors.commissionRate}</p>}
            </div>
          </div>

          {/* Solo en creación: rol, sucursal, contraseña, PIN */}
          {editingId === null && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={ui.fieldLabel}>Rol *</label>
                  <select style={ui.input} value={form.role} onChange={set("role")}>
                    <option value="CAJERO">Cajero</option>
                    <option value="GERENTE">Gerente</option>
                    <option value="ADMIN">Administrador</option>
                  </select>
                  {fieldErrors.role && <p style={styles.fieldError}>{fieldErrors.role}</p>}
                </div>
                <div>
                  <label style={ui.fieldLabel}>Sucursal *</label>
                  <select style={ui.input} value={form.branchId} onChange={set("branchId")}>
                    <option value="">Seleccione...</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                  {fieldErrors.branchId && <p style={styles.fieldError}>{fieldErrors.branchId}</p>}
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 6 }}>
                <div>
                  <label style={ui.fieldLabel}>Contraseña *</label>
                  <input style={ui.input} type="password" value={form.password} onChange={set("password")} placeholder="Mínimo 6 caracteres" />
                  {fieldErrors.password && <p style={styles.fieldError}>{fieldErrors.password}</p>}
                </div>
                <div>
                  <label style={ui.fieldLabel}>PIN {form.role === "CAJERO" ? "(4 dígitos) *" : "(opcional)"}</label>
                  <input style={ui.input} value={form.pinCode} onChange={set("pinCode")} maxLength={4} placeholder="0000" />
                  {fieldErrors.pinCode && <p style={styles.fieldError}>{fieldErrors.pinCode}</p>}
                </div>
              </div>
              <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 8 }}>
                Los cajeros acceden con correo + PIN; administradores y gerentes con correo + contraseña.
              </p>
            </>
          )}

          {/* Solo en edición: nuevo PIN + estado activo */}
          {editingId !== null && (
            <>
              <div style={{ marginBottom: 14 }}>
                <label style={ui.fieldLabel}>Nuevo PIN (dejar vacío para no cambiar)</label>
                <input style={ui.input} value={form.newPin} onChange={set("newPin")} maxLength={4} placeholder="0000" />
                {fieldErrors.newPin && <p style={styles.fieldError}>{fieldErrors.newPin}</p>}
                <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>4 dígitos numéricos</p>
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={ui.fieldLabel}>Estado del empleado</label>
                <select
                  style={ui.input}
                  value={editActive ? "true" : "false"}
                  onChange={(e) => setEditActive(e.target.value === "true")}
                >
                  <option value="true">Activo</option>
                  <option value="false">Inactivo (baja lógica)</option>
                </select>
              </div>
            </>
          )}

          {formError && <p style={{ color: "#b91c1c", fontSize: 13, fontWeight: 600, marginTop: 10 }}>{formError}</p>}

          <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
            <button type="button" style={{ ...ui.ghostBtn, flex: 1, justifyContent: "center" }} onClick={closeForm}>
              Cancelar
            </button>
            <button type="submit" disabled={saving} style={{ ...ui.primaryBtn, flex: 1, justifyContent: "center" }}>
              {saving ? "Guardando..." : editingId !== null ? "Actualizar empleado" : "Registrar empleado"}
            </button>
          </div>
        </form>
      </ActionModal>

      {/* Modal operaciones del vendedor */}
      <ActionModal
        isOpen={!!(ops || opsLoading)}
        onClose={() => setOps(null)}
        title={opsLoading ? "Cargando operaciones..." : `Operaciones · ${ops?.employee.name ?? ""}`}
        size="md"
      >
        {ops && (
          <>
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
          </>
        )}
      </ActionModal>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  fieldError: {
    color: "#b91c1c",
    fontSize: 12,
    fontWeight: 600,
    marginTop: 5,
  },
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
