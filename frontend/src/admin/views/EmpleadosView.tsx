import React, { useEffect, useRef, useState } from "react";
import {
  Activity,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Pencil,
  Plus,
  Check,
  AlertCircle,
  User,
  Mail,
  Phone,
  Calendar,
  Building,
  Briefcase,
  DollarSign,
  Percent,
  CreditCard,
  Clock,
  XCircle,
} from "lucide-react";
import api from "../../shared/services/api";
import { useAdminData } from "../../shared/hooks";
import { DataTable, ActionModal } from "../../shared/ui";
import type { Column } from "../../shared/ui";
import {
  collectRoundedDecimalMessages,
  DECIMAL_INPUT_REGEX,
  getDecimalValidationValue,
  handleDecimalInputChange,
  validateDecimalField,
} from "../../shared/utils/decimalInput";
import {
  normalizeEmailInput,
  normalizeIntegerInput,
  normalizePhoneInput,
  validateEmail,
  validatePhone,
} from "../../shared/utils/formValidation";
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
  useMediaQuery,
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
  recentSales: {
    id: number;
    invoiceNumber: string;
    createdAt: string;
    totalAmount: number;
    paymentMethod: string;
    status: string;
  }[];
  recentSessions: {
    id: number;
    openedAt: string;
    closedAt: string | null;
    initialAmount: number;
    difference: number | null;
    status: string;
  }[];
}
// CONSTANTES Y VALIDACIONES
const PASSWORD_LENGTH = 14;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-zñÑ\d@$!%*?&]{14}$/;
const PIN_REGEX = /^\d{4}$/;
const NAME_REGEX = /^[A-Za-zÁÉÍÓÚáéíóúñÑ\s]+$/;

const getPasswordRequirements = () => [
  { id: "length", label: `Exactamente ${PASSWORD_LENGTH} caracteres`, test: (p: string) => p.length === PASSWORD_LENGTH },
  { id: "uppercase", label: "Al menos una mayúscula", test: (p: string) => /[A-Z]/.test(p) },
  { id: "lowercase", label: "Al menos una minúscula", test: (p: string) => /[a-z]/.test(p) },
  { id: "number", label: "Al menos un número", test: (p: string) => /\d/.test(p) },
  { id: "special", label: "Al menos un carácter especial (@$!%*?&)", test: (p: string) => /[@$!%*?&]/.test(p) },
];

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
  currentPin: "",
  currentPassword: "",
  confirmPassword: "",
};

const needsPassword = (role: string) => role === "ADMIN" || role === "GERENTE";
// ESTILOS REUTILIZABLES
const empDetailRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-start",
  alignItems: "center",
  gap: "6px",
  fontSize: 12,
  marginBottom: 4,
};

const empDetailLabel: React.CSSProperties = {
  flexShrink: 0,
  fontWeight: 700,
  color: "var(--text-muted)",
  minWidth: "70px",
  display: "inline-block",
  fontSize: "inherit",
};

const empDetailValue: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  overflowWrap: "anywhere",
  fontWeight: 600,
  color: "var(--text-secondary)",
  fontSize: "inherit",
  wordBreak: "break-word",
};
// COMPONENTE PRINCIPAL
const EmpleadosView: React.FC<ViewProps> = ({ branchId, refreshToken }) => {
  const isMobile = useMediaQuery("(max-width: 1024px)");
  const [expandedEmployees, setExpandedEmployees] = useState<Record<number, boolean>>({});
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [showNewPin, setShowNewPin] = useState(false);
  const [showCurrentPin, setShowCurrentPin] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editActive, setEditActive] = useState(true);
  const [form, setForm] = useState({ ...emptyForm });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [showConfirmClose, setShowConfirmClose] = useState(false);

  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeRow | null>(null);
  const [ops, setOps] = useState<Operations | null>(null);
  const [opsLoading, setOpsLoading] = useState(false);
  const [showOps, setShowOps] = useState(false);


  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const employeeParams: Record<string, unknown> = {};
  if (branchId !== "all") employeeParams.branchId = branchId;
  if (roleFilter !== "all") employeeParams.role = roleFilter;
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
  }, [refreshToken, refetch]);

  const toggleExpandEmployee = (id: number) => {
    setExpandedEmployees((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // ============================================================
  // VALIDACIONES
  // ============================================================
  const validateName = (name: string): string | null => {
    if (!name.trim()) return "El nombre es requerido.";
    if (name.trim().length < 3) return "El nombre debe tener al menos 3 caracteres.";
    if (name.trim().length > 50) return "El nombre no puede exceder 50 caracteres.";
    if (!NAME_REGEX.test(name.trim())) return "El nombre solo puede contener letras y espacios.";
    return null;
  };

  const validatePassword = (password: string): string | null => {
    if (!password) return "La contraseña es requerida.";
    if (password.length !== PASSWORD_LENGTH) return `La contraseña debe tener exactamente ${PASSWORD_LENGTH} caracteres.`;
    if (!PASSWORD_REGEX.test(password)) return "La contraseña debe contener mayúscula, minúscula, número y carácter especial.";
    return null;
  };

  const validatePin = (pin: string): string | null => {
    if (!pin) return "El PIN es requerido.";
    if (!PIN_REGEX.test(pin)) return "El PIN debe tener exactamente 4 dígitos.";
    return null;
  };

  const validateForm = (candidate: typeof emptyForm): Record<string, string> => {
    const errors: Record<string, string> = {};

    const nameErr = validateName(candidate.name);
    if (nameErr) errors.name = nameErr;

    const emailErr = validateEmail(candidate.email, { required: true });
    if (emailErr) errors.email = emailErr;

    const phoneErr = validatePhone(candidate.phone, { required: false });
    if (phoneErr) errors.phone = phoneErr;

    if (editingId === null) {
      if (!candidate.branchId) errors.branchId = "Seleccione una sucursal.";
      if (!["CAJERO", "GERENTE", "ADMIN"].includes(candidate.role)) errors.role = "Seleccione un rol válido.";

      const pinErr = validatePin(candidate.pinCode);
      if (pinErr) errors.pinCode = pinErr;

      if (needsPassword(candidate.role)) {
        const pwdErr = validatePassword(candidate.password);
        if (pwdErr) errors.password = pwdErr;
        if (candidate.password && candidate.confirmPassword && candidate.password !== candidate.confirmPassword) {
          errors.confirmPassword = "Las contraseñas no coinciden.";
        }
      }
    } else {
      if (candidate.newPin) {
        if (!candidate.currentPin) errors.currentPin = "Ingrese su PIN actual para cambiarlo.";
        else if (!PIN_REGEX.test(candidate.currentPin)) errors.currentPin = "El PIN actual debe tener 4 dígitos.";
        const pinErr = validatePin(candidate.newPin);
        if (pinErr) errors.newPin = pinErr;
      }

      if (needsPassword(candidate.role) && candidate.password) {
        if (!candidate.currentPassword) errors.currentPassword = "Ingrese su contraseña actual para cambiarla.";
        const pwdErr = validatePassword(candidate.password);
        if (pwdErr) errors.password = pwdErr;
        if (candidate.password !== candidate.confirmPassword) errors.confirmPassword = "Las contraseñas no coinciden.";
      }
    }

    const baseSalVal = candidate.baseSalary.trim()
      ? validateDecimalField(candidate.baseSalary, "El sueldo base", {
        invalidMessage: "El sueldo base debe ser un número válido con máximo 3 decimales.",
      })
      : null;
    if (baseSalVal && !baseSalVal.ok) errors.baseSalary = baseSalVal.error;

    const commVal = candidate.commissionRate.trim()
      ? validateDecimalField(candidate.commissionRate, "La comisión de ventas", {
        max: 100,
        invalidMessage: "La comisión de ventas debe ser un número válido con máximo 3 decimales.",
        maxMessage: "La comisión de ventas no puede ser mayor a 100.",
      })
      : null;
    if (commVal && !commVal.ok) errors.commissionRate = commVal.error;

    return errors;
  };
  // ACCIONES DEL FORMULARIO
  const openCreate = () => {
    setForm({ ...emptyForm, role: "CAJERO" });
    setEditingId(null);
    setEditActive(true);
    setFieldErrors({});
    setFormError(null);
    setHasChanges(false);
    setShowConfirmClose(false);
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
      currentPin: "",
      currentPassword: "",
      confirmPassword: "",
    });
    setEditingId(u.id);
    setEditActive(u.active);
    setFieldErrors({});
    setFormError(null);
    setHasChanges(false);
    setShowConfirmClose(false);
    setShowForm(true);
  };

  const closeForm = () => {
    if (saving) return;
    setShowForm(false);
    setEditingId(null);
    setFieldErrors({});
    setFormError(null);
    setHasChanges(false);
    setShowConfirmClose(false);
  };

  const handleCloseRequest = () => {
    if (hasChanges && !saving) setShowConfirmClose(true);
    else closeForm();
  };
  // ENVÍO DEL FORMULARIO
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    if (editingId !== null && !hasChanges) {
      setFormError("No hay cambios para guardar.");
      return;
    }

    const validation = validateForm(form);
    if (Object.keys(validation).length > 0) {
      setFieldErrors(validation);
      setFormError("Revisa los campos marcados antes de guardar.");
      return;
    }

    const baseSalVal = form.baseSalary.trim()
      ? validateDecimalField(form.baseSalary, "El sueldo base", {
        invalidMessage: "El sueldo base debe ser un número válido con máximo 3 decimales.",
      })
      : null;
    if (baseSalVal && !baseSalVal.ok) {
      setFormError(baseSalVal.error);
      return;
    }
    const baseSalaryValue = baseSalVal ? getDecimalValidationValue(baseSalVal) : null;

    const commVal = form.commissionRate.trim()
      ? validateDecimalField(form.commissionRate, "La comisión de ventas", {
        max: 100,
        invalidMessage: "La comisión de ventas debe ser un número válido con máximo 3 decimales.",
        maxMessage: "La comisión de ventas no puede ser mayor a 100.",
      })
      : null;
    if (commVal && !commVal.ok) {
      setFormError(commVal.error);
      return;
    }
    const commissionValue = commVal ? getDecimalValidationValue(commVal) : null;

    const roundingMessages = collectRoundedDecimalMessages([baseSalaryValue, commissionValue]);

    setSaving(true);
    setFormError(null);
    setFieldErrors({});

    try {
      if (roundingMessages.length > 0) alert(roundingMessages.join("\n"));

      if (editingId !== null) {
        const payload: Record<string, any> = {
          name: form.name,
          email: form.email,
          phone: form.phone || undefined,
          baseSalary: baseSalaryValue?.value ?? undefined,
          commissionRate: commissionValue?.value ?? undefined,
          active: editActive,
        };
        if (form.newPin) {
          payload.newPin = form.newPin;
          payload.currentPin = form.currentPin;
        }
        if (needsPassword(form.role) && form.password) {
          payload.password = form.password;
          payload.currentPassword = form.currentPassword;
        }
        await api.put(`/api/admin/employees/${editingId}`, payload);
      } else {
        const payload: Record<string, any> = {
          name: form.name,
          email: form.email,
          role: form.role,
          branchId: Number(form.branchId),
          phone: form.phone || undefined,
          baseSalary: baseSalaryValue?.value ?? undefined,
          commissionRate: commissionValue?.value ?? undefined,
          pinCode: form.pinCode,
        };
        if (needsPassword(form.role)) payload.password = form.password;
        await api.post("/api/admin/employees", payload);
      }

      setShowForm(false);
      setForm({ ...emptyForm });
      setEditingId(null);
      setFieldErrors({});
      setHasChanges(false);
      await refetch();
    } catch (err: any) {
      setFormError(err.response?.data?.message || "No se pudo guardar el empleado.");
    } finally {
      setSaving(false);
    }
  };

  // ============================================================
  // VER EMPLEADO (OPERACIONES)
  // ============================================================
  const openViewEmployee = async (employee: EmployeeRow) => {
    setSelectedEmployee(employee);
    setOps(null);
    setOpsLoading(true);
    setShowOps(true);

    if (employee.role === "CAJERO") {
      try {
        const res = await api.get<Operations>(`/api/admin/employees/${employee.id}/operations`);
        setOps(res.data);
      } catch {
        setOps(null);
      } finally {
        setOpsLoading(false);
      }
    } else {
      setOpsLoading(false);
    }
  };

  const closeOps = () => {
    setShowOps(false);
    setSelectedEmployee(null);
    setOps(null);
    setOpsLoading(false);
  };

  // ============================================================
  // HANDLERS DE INPUT
  // ============================================================
  const handleInputChange =
    (k: keyof typeof emptyForm) =>
      (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const raw = e.target.value;
        let value: string;

        if (k === "email") value = normalizeEmailInput(raw);
        else if (k === "phone") value = normalizePhoneInput(raw).slice(0, 15);
        else if (k === "pinCode" || k === "newPin" || k === "currentPin") value = normalizeIntegerInput(raw).slice(0, 4);
        else if (k === "name") value = raw.slice(0, 50);
        else if (k === "password" || k === "confirmPassword" || k === "currentPassword") value = raw.slice(0, PASSWORD_LENGTH);
        else value = raw;

        const nextForm = { ...form, [k]: value };
        const validation = validateForm(nextForm);
        setForm(nextForm);
        setHasChanges(true);
        setFormError(null);
        setFieldErrors((prev) => {
          const next = { ...prev };
          if (validation[k]) next[k] = validation[k];
          else delete next[k];
          return next;
        });
      };

  const handleDecimalChange =
    (k: "baseSalary" | "commissionRate") =>
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const rawValue = e.target.value.trim();
        if (rawValue && !DECIMAL_INPUT_REGEX.test(rawValue)) {
          setFieldErrors((prev) => ({
            ...prev,
            [k]: k === "baseSalary"
              ? "El sueldo base debe ser un número válido con máximo 3 decimales."
              : "La comisión de ventas debe ser un número válido con máximo 3 decimales.",
          }));
          return;
        }
        handleDecimalInputChange(rawValue, (nextValue) => {
          const nextForm = { ...form, [k]: nextValue };
          const validation = validateForm(nextForm);
          setForm(nextForm);
          setHasChanges(true);
          setFormError(null);
          setFieldErrors((prev) => {
            const next = { ...prev };
            if (validation[k]) next[k] = validation[k];
            else delete next[k];
            return next;
          });
        });
      };

  const checkPasswordRequirements = (password: string) => {
    return getPasswordRequirements().map((req) => ({ ...req, passed: req.test(password) }));
  };

  // ============================================================
  // COLUMNAS DE LA TABLA
  // ============================================================
  const columns: Column<EmployeeRow>[] = [
    {
      key: "name",
      header: "Nombre",
      render: (u) => <span style={{ fontWeight: 700, color: "var(--text)", whiteSpace: "normal" }}>{u.name}</span>,
    },
    {
      key: "email",
      header: "Correo",
      render: (u) => <span style={{ color: "var(--text-secondary)" }}>{u.email}</span>,
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
      render: (u) => <Badge tone={u.active ? "green" : "red"}>{u.active ? "Activo" : "Inactivo"}</Badge>,
    },
    {
      key: "createdAt",
      header: "Alta",
      render: (u) => <span style={{ color: "var(--text-muted)" }}>{fmtDate(u.createdAt)}</span>,
    },
    {
      key: "view",
      header: "Ver",
      align: "center",
      render: (u) => (
        <button style={ui.linkBtn} className="active-tap" onClick={() => openViewEmployee(u)}>
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
          style={{ background: "none", border: "none", cursor: "pointer", padding: "4px 6px", borderRadius: 4, color: "var(--accent-strong)" }}
          className="active-tap"
          title="Editar empleado"
        >
          <Pencil size={14} />
        </button>
      ),
    },
  ];

  // ============================================================
  // RENDER DE CAMPOS DE AUTENTICACIÓN
  // ============================================================
  const renderAuthFields = () => {
    const passwordRequired = needsPassword(form.role);

    if (editingId === null) {
      return (
        <>
          <div style={{ marginBottom: 10 }}>
            <label style={ui.fieldLabel}>PIN de acceso * (4 dígitos)</label>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                style={{ ...ui.input, flex: 1 }}
                type={showPin ? "text" : "password"}
                value={form.pinCode}
                onChange={handleInputChange("pinCode")}
                maxLength={4}
                placeholder="0000"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                style={{ ...ui.ghostBtn, padding: "8px 10px", flexShrink: 0 }}
              >
                {showPin ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {fieldErrors.pinCode && <p style={styles.fieldError}>{fieldErrors.pinCode}</p>}
          </div>

          {passwordRequired && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10, marginBottom: 10 }}>
                <div>
                  <label style={ui.fieldLabel}>Contraseña * (14 caracteres)</label>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      style={{ ...ui.input, flex: 1 }}
                      type={showPassword ? "text" : "password"}
                      value={form.password}
                      onChange={handleInputChange("password")}
                      placeholder="14 caracteres exactos"
                      maxLength={PASSWORD_LENGTH}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      style={{ ...ui.ghostBtn, padding: "8px 10px", flexShrink: 0 }}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  {fieldErrors.password && <p style={styles.fieldError}>{fieldErrors.password}</p>}
                </div>
                <div>
                  <label style={ui.fieldLabel}>Confirmar contraseña *</label>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      style={{ ...ui.input, flex: 1 }}
                      type={showConfirmPassword ? "text" : "password"}
                      value={form.confirmPassword}
                      onChange={handleInputChange("confirmPassword")}
                      placeholder="Repite la contraseña"
                      maxLength={PASSWORD_LENGTH}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      style={{ ...ui.ghostBtn, padding: "8px 10px", flexShrink: 0 }}
                    >
                      {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  {fieldErrors.confirmPassword && <p style={styles.fieldError}>{fieldErrors.confirmPassword}</p>}
                </div>
              </div>
              {form.password && (
                <div style={{ marginBottom: 10, fontSize: 11 }}>
                  {checkPasswordRequirements(form.password).map((req) => (
                    <div
                      key={req.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        color: req.passed ? "var(--color-success)" : "var(--text-muted)",
                        marginBottom: 2,
                      }}
                    >
                      {req.passed ? <Check size={14} /> : <AlertCircle size={14} />}
                      <span>{req.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {!passwordRequired && (
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: -4, marginBottom: 10 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <AlertCircle size={14} /> Los cajeros solo usan PIN.
              </span>
            </p>
          )}
        </>
      );
    } else {
      const twoCol = !isMobile;

      return (
        <>
          <div style={{ marginBottom: 10 }}>
            <label style={ui.fieldLabel}>Estado del empleado</label>
            <select
              style={ui.input}
              value={editActive ? "true" : "false"}
              onChange={(e) => {
                setEditActive(e.target.value === "true");
                setHasChanges(true);
              }}
            >
              <option value="true">Activo</option>
              <option value="false">Inactivo</option>
            </select>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: twoCol ? "1fr 1fr" : "1fr", gap: 10, marginBottom: 10 }}>
            <div>
              <label style={ui.fieldLabel}>PIN actual *</label>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  style={{ ...ui.input, flex: 1 }}
                  type={showCurrentPin ? "text" : "password"}
                  value={form.currentPin}
                  onChange={handleInputChange("currentPin")}
                  maxLength={4}
                  placeholder="0000"
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPin(!showCurrentPin)}
                  style={{ ...ui.ghostBtn, padding: "8px 10px", flexShrink: 0 }}
                >
                  {showCurrentPin ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {fieldErrors.currentPin && <p style={styles.fieldError}>{fieldErrors.currentPin}</p>}
            </div>
            <div>
              <label style={ui.fieldLabel}>Nuevo PIN</label>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  style={{ ...ui.input, flex: 1 }}
                  type={showNewPin ? "text" : "password"}
                  value={form.newPin}
                  onChange={handleInputChange("newPin")}
                  maxLength={4}
                  placeholder="0000"
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPin(!showNewPin)}
                  style={{ ...ui.ghostBtn, padding: "8px 10px", flexShrink: 0 }}
                >
                  {showNewPin ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {fieldErrors.newPin && <p style={styles.fieldError}>{fieldErrors.newPin}</p>}
            </div>
          </div>

          {passwordRequired && (
            <div style={{ display: "grid", gridTemplateColumns: twoCol ? "1fr 1fr" : "1fr", gap: 10, marginBottom: 10 }}>
              <div>
                <label style={ui.fieldLabel}>Contraseña actual *</label>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    style={{ ...ui.input, flex: 1 }}
                    type={showCurrentPassword ? "text" : "password"}
                    value={form.currentPassword}
                    onChange={handleInputChange("currentPassword")}
                    placeholder="Ingrese su contraseña actual"
                    maxLength={PASSWORD_LENGTH}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    style={{ ...ui.ghostBtn, padding: "8px 10px", flexShrink: 0 }}
                  >
                    {showCurrentPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {fieldErrors.currentPassword && <p style={styles.fieldError}>{fieldErrors.currentPassword}</p>}
              </div>
              <div>
                <label style={ui.fieldLabel}>Nueva contraseña (14 caracteres)</label>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    style={{ ...ui.input, flex: 1 }}
                    type={showPassword ? "text" : "password"}
                    value={form.password}
                    onChange={handleInputChange("password")}
                    placeholder="14 caracteres exactos"
                    maxLength={PASSWORD_LENGTH}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{ ...ui.ghostBtn, padding: "8px 10px", flexShrink: 0 }}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {fieldErrors.password && <p style={styles.fieldError}>{fieldErrors.password}</p>}
              </div>
              <div style={{ gridColumn: twoCol ? "span 2" : "span 1" }}>
                <label style={ui.fieldLabel}>Confirmar nueva contraseña</label>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    style={{ ...ui.input, flex: 1 }}
                    type={showConfirmPassword ? "text" : "password"}
                    value={form.confirmPassword}
                    onChange={handleInputChange("confirmPassword")}
                    placeholder="Repite la nueva contraseña"
                    maxLength={PASSWORD_LENGTH}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    style={{ ...ui.ghostBtn, padding: "8px 10px", flexShrink: 0 }}
                  >
                    {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {fieldErrors.confirmPassword && <p style={styles.fieldError}>{fieldErrors.confirmPassword}</p>}
              </div>
            </div>
          )}

          {!passwordRequired && (
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: -4, marginBottom: 10 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <AlertCircle size={14} /> Los cajeros solo pueden cambiar su PIN.
              </span>
            </p>
          )}
        </>
      );
    }
  };
  const renderMobileView = () => (
    <div style={{ overflowY: "auto", maxHeight: "62vh", padding: "8px 4px" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.2fr 1fr 1fr 1.2fr",
          padding: "10px 12px",
          fontWeight: 700,
          fontSize: 10,
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.3px",
        }}
      >
        <div>Sucursal</div>
        <div style={{ textAlign: "center" }}>Estado</div>
        <div style={{ textAlign: "center" }}>Ver</div>
        <div style={{ textAlign: "right" }}>Acción</div>
      </div>

      {loading && <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--text-faint)", fontSize: 13, fontWeight: 500 }}>Cargando...</div>}
      {!loading && error && <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--color-danger)", fontSize: 13, fontWeight: 500 }}>{error}</div>}
      {!loading && !error && rows.length === 0 && <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--text-faint)", fontSize: 13, fontWeight: 500 }}>No hay empleados registrados.</div>}

      {!loading &&
        !error &&
        rows.map((u) => {
          const isExpanded = expandedEmployees[u.id];
          return (
            <div
              key={u.id}
              style={{
                backgroundColor: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                marginBottom: 10,
                boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "6px 12px 5px 12px",
                  fontSize: 10,
                  fontWeight: 700,
                  color: "var(--text-muted)",
                  borderBottom: "1px solid var(--surface-3)",
                  backgroundColor: "var(--surface-2)",
                  letterSpacing: "0.2px",
                  textTransform: "uppercase",
                }}
              >
                <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "55%" }}>{u.name}</span>
                <span style={{ fontSize: 9 }}><Badge tone={roleTone(u.role)}>{u.role}</Badge></span>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.2fr 1fr 1fr 1.2fr",
                  padding: "10px 12px",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--text-secondary)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {u.branch}
                </div>
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <span style={{ fontSize: 9 }}>
                    <Badge tone={u.active ? "green" : "red"}>{u.active ? "Activo" : "Inactivo"}</Badge>
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <button style={{ ...ui.linkBtn, fontSize: 11, padding: "4px 8px" }} className="active-tap" onClick={() => openViewEmployee(u)}>
                    <Activity size={13} style={{ verticalAlign: "-2px" }} /> Ver
                  </button>
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 6 }}>
                  <button
                    onClick={() => openEdit(u)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: "var(--accent-soft)",
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                      width: 30,
                      height: 30,
                      cursor: "pointer",
                      color: "var(--accent-strong)",
                      padding: 0,
                    }}
                    className="active-tap"
                    title="Editar"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => toggleExpandEmployee(u.id)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: "var(--surface)",
                      border: "1px solid var(--border-strong)",
                      borderRadius: 6,
                      width: 30,
                      height: 30,
                      cursor: "pointer",
                      color: "var(--text-muted)",
                      padding: 0,
                    }}
                    className="active-tap"
                  >
                    {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                </div>
              </div>
              {isExpanded && (
                <div
                  style={{
                    padding: "12px",
                    margin: "0 12px 12px 12px",
                    backgroundColor: "var(--surface-2)",
                    borderRadius: "8px",
                    border: "1px solid var(--border)",
                    display: "grid",
                    gridTemplateColumns: "1fr",
                    gap: "10px",
                    textAlign: "left",
                  }}
                >
                  <div>
                    <h4 style={{ fontSize: 11, fontWeight: 800, color: "var(--text)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.3px" }}>
                      Contacto y Registro
                    </h4>
                    <div style={{ ...empDetailRow, fontSize: 12 }}>
                      <span style={empDetailLabel}>Correo:</span>
                      <span style={{ ...empDetailValue, wordBreak: "break-word" }}>{u.email}</span>
                    </div>
                    <div style={{ ...empDetailRow, fontSize: 12 }}>
                      <span style={empDetailLabel}>Teléfono:</span>
                      <span style={empDetailValue}>{u.phone || "—"}</span>
                    </div>
                    <div style={{ ...empDetailRow, fontSize: 12 }}>
                      <span style={empDetailLabel}>F. Alta:</span>
                      <span style={empDetailValue}>{fmtDate(u.createdAt)}</span>
                    </div>
                  </div>
                  <div>
                    <h4 style={{ fontSize: 11, fontWeight: 800, color: "var(--text)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.3px" }}>
                      Sueldo y Comisiones
                    </h4>
                    <div style={{ ...empDetailRow, fontSize: 12 }}>
                      <span style={empDetailLabel}>Sueldo base:</span>
                      <span style={empDetailValue}>{u.baseSalary != null ? money(u.baseSalary) : "—"}</span>
                    </div>
                    <div style={{ ...empDetailRow, fontSize: 12 }}>
                      <span style={empDetailLabel}>Comisión:</span>
                      <span style={empDetailValue}>{u.commissionRate != null ? `${u.commissionRate}%` : "—"}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
    </div>
  );

  // ============================================================
  // RENDER PRINCIPAL
  // ============================================================
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
          value={roleFilter}
          onChange={setRoleFilter}
          options={[
            { value: "all", label: "Todos los roles" },
            { value: "ADMIN", label: "Administradores" },
            { value: "GERENTE", label: "Gerentes" },
            { value: "CAJERO", label: "Cajeros" },
          ]}
        />
        <span style={{ marginLeft: "auto", fontSize: 13, color: "var(--text-muted)", fontWeight: 600 }}>
          {rows.length} empleado{rows.length === 1 ? "" : "s"}
        </span>
      </Toolbar>

      {isMobile ? renderMobileView() : (
        <div className="table-sticky-head">
          <DataTable columns={columns} data={rows} loading={loading} error={error} keyExtractor={(u) => u.id} />
        </div>
      )}

      {/* MODAL DE EMPLEADO */}
      <ActionModal
        isOpen={showForm}
        onClose={handleCloseRequest}
        title={editingId !== null ? "Editar empleado" : "Registrar nuevo empleado"}
        size="lg"
      >
        <form onSubmit={submit} style={{ padding: "4px 0" }}>
          {/* Fila 1: Nombre + Correo */}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <div>
              <label style={ui.fieldLabel}>Nombre completo *</label>
              <input style={ui.input} value={form.name} onChange={handleInputChange("name")} placeholder="Nombre" maxLength={50} autoFocus />
              {fieldErrors.name && <p style={styles.fieldError}>{fieldErrors.name}</p>}
            </div>
            <div>
              <label style={ui.fieldLabel}>Correo electrónico *</label>
              <input style={ui.input} value={form.email} onChange={handleInputChange("email")} placeholder="correo@empresa.com" />
              {fieldErrors.email && <p style={styles.fieldError}>{fieldErrors.email}</p>}
            </div>
          </div>

          {/* Fila 2: Teléfono + Rol (si es nuevo) o Teléfono + Rol (deshabilitado) */}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <div>
              <label style={ui.fieldLabel}>Teléfono</label>
              <input style={ui.input} value={form.phone} onChange={handleInputChange("phone")} placeholder="771 000 0000" maxLength={15} />
              {fieldErrors.phone && <p style={styles.fieldError}>{fieldErrors.phone}</p>}
            </div>
            <div>
              <label style={ui.fieldLabel}>Rol *</label>
              <select
                style={ui.input}
                value={form.role}
                onChange={(e) => {
                  handleInputChange("role")(e);
                  setForm((prev) => ({ ...prev, password: "", pinCode: "", confirmPassword: "" }));
                  setFieldErrors((prev) => {
                    const next = { ...prev };
                    delete next.password;
                    delete next.pinCode;
                    delete next.confirmPassword;
                    return next;
                  });
                }}
                disabled={editingId !== null}
              >
                <option value="CAJERO">Cajero</option>
                <option value="GERENTE">Gerente</option>
                <option value="ADMIN">Administrador</option>
              </select>
              {fieldErrors.role && <p style={styles.fieldError}>{fieldErrors.role}</p>}
            </div>
          </div>

          {/* Fila 3: Sucursal + Sueldo (si es nuevo) o Sueldo + Comisión (si es edición) */}
          {editingId === null ? (
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10, marginBottom: 10 }}>
              <div>
                <label style={ui.fieldLabel}>Sucursal *</label>
                <select style={ui.input} value={form.branchId} onChange={handleInputChange("branchId")}>
                  <option value="">Seleccione...</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
                {fieldErrors.branchId && <p style={styles.fieldError}>{fieldErrors.branchId}</p>}
              </div>
              <div>
                <label style={ui.fieldLabel}>Sueldo base ($)</label>
                <input
                  style={ui.input}
                  type="text"
                  inputMode="decimal"
                  value={form.baseSalary}
                  onChange={handleDecimalChange("baseSalary")}
                  placeholder="0.00"
                  maxLength={10}
                />
                {fieldErrors.baseSalary && <p style={styles.fieldError}>{fieldErrors.baseSalary}</p>}
              </div>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10, marginBottom: 10 }}>
              <div>
                <label style={ui.fieldLabel}>Sueldo base ($)</label>
                <input
                  style={ui.input}
                  type="text"
                  inputMode="decimal"
                  value={form.baseSalary}
                  onChange={handleDecimalChange("baseSalary")}
                  placeholder="0.00"
                  maxLength={10}
                />
                {fieldErrors.baseSalary && <p style={styles.fieldError}>{fieldErrors.baseSalary}</p>}
              </div>
              <div>
                <label style={ui.fieldLabel}>% Comisión de ventas</label>
                <input
                  style={ui.input}
                  type="text"
                  inputMode="decimal"
                  value={form.commissionRate}
                  onChange={handleDecimalChange("commissionRate")}
                  placeholder="0.00"
                  maxLength={5}
                />
                <p style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 2 }}>Ej: 2.5 para 2.5%</p>
                {fieldErrors.commissionRate && <p style={styles.fieldError}>{fieldErrors.commissionRate}</p>}
              </div>
            </div>
          )}
          {renderAuthFields()}

          {formError && (
            <div
              style={{
                backgroundColor: "var(--icon-bg-red)",
                color: "var(--color-danger)",
                padding: "8px 12px",
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                marginTop: 8,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <AlertCircle size={18} /> {formError}
            </div>
          )}

          <div style={{ display: "flex", gap: 10, marginTop: 14, flexDirection: isMobile ? "column" : "row" }}>
            <button
              type="button"
              style={{ ...ui.ghostBtn, flex: 1, justifyContent: "center", width: isMobile ? "100%" : "auto" }}
              onClick={handleCloseRequest}
              disabled={saving}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{
                ...ui.primaryBtn,
                flex: 1,
                justifyContent: "center",
                width: isMobile ? "100%" : "auto",
                opacity: saving ? 0.6 : 1,
                cursor: saving ? "not-allowed" : "pointer",
              }}
            >
              {saving ? "Guardando..." : editingId !== null ? "Actualizar" : "Registrar"}
            </button>
          </div>
        </form>
      </ActionModal>

      {/* MODAL DE CONFIRMACIÓN */}
      <ActionModal
        isOpen={showConfirmClose}
        onClose={() => setShowConfirmClose(false)}
        title="¿Descartar cambios?"
        size="sm"
      >
        <div style={{ padding: "10px 0" }}>
          <p style={{ color: "var(--text-secondary)", marginBottom: 20 }}>Tienes cambios sin guardar. ¿Estás seguro de que quieres salir?</p>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button style={{ ...ui.ghostBtn }} onClick={() => setShowConfirmClose(false)}>Seguir editando</button>
            <button style={{ ...ui.primaryBtn, backgroundColor: "var(--color-danger)", borderColor: "var(--color-danger)" }} onClick={closeForm}>Descartar</button>
          </div>
        </div>
      </ActionModal>

      {/* MODAL DE VER EMPLEADO */}
      <ActionModal
        isOpen={showOps}
        onClose={closeOps}
        title={selectedEmployee ? `Detalles de ${selectedEmployee.name}` : "Información del empleado"}
        size="lg"
      >
        {selectedEmployee && (
          <div style={{ padding: "4px 0" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)",
                gap: "16px 24px",
                backgroundColor: "var(--surface-2)",
                padding: "20px 24px",
                borderRadius: 12,
                border: "1px solid var(--border)",
                marginBottom: 24,
              }}
            >
              {[
                { icon: User, label: "Nombre", value: selectedEmployee.name },
                { icon: Briefcase, label: "Rol", value: <Badge tone={roleTone(selectedEmployee.role)}>{selectedEmployee.role}</Badge> },
                { icon: Mail, label: "Correo", value: selectedEmployee.email },
                { icon: Phone, label: "Teléfono", value: selectedEmployee.phone || "—" },
                { icon: Building, label: "Sucursal", value: selectedEmployee.branch },
                { icon: Calendar, label: "Fecha alta", value: fmtDate(selectedEmployee.createdAt) },
                { icon: Activity, label: "Estado", value: <Badge tone={selectedEmployee.active ? "green" : "red"}>{selectedEmployee.active ? "Activo" : "Inactivo"}</Badge> },
                { icon: DollarSign, label: "Sueldo / Comisión", value: `${selectedEmployee.baseSalary != null ? money(selectedEmployee.baseSalary) : "—"}${selectedEmployee.commissionRate != null ? ` · ${selectedEmployee.commissionRate}%` : ""}` },
              ].map((item, idx) => (
                <div
                  key={idx}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 0" }}
                >
                  <div
                    style={{
                      backgroundColor: "var(--accent-soft)",
                      padding: 8,
                      borderRadius: 8,
                      color: "var(--accent-strong)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <item.icon size={18} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 10,
                        color: "var(--text-muted)",
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.3px",
                      }}
                    >
                      {item.label}
                    </div>
                    <div style={{ fontWeight: 500, color: "var(--text)", wordBreak: "break-word", fontSize: 14 }}>
                      {item.value}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {selectedEmployee.role === "CAJERO" && (
              <>
                {opsLoading ? (
                  <div style={{ textAlign: "center", padding: "30px", color: "var(--text-faint)" }}>Cargando operaciones...</div>
                ) : ops ? (
                  <>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(4, 1fr)",
                        gap: 10,
                        marginBottom: 20,
                      }}
                    >
                      <Mini label="Ventas" value={String(ops.summary.salesCount)} icon={CreditCard} />
                      <Mini label="Total vendido" value={money(ops.summary.salesTotal)} icon={DollarSign} accent="blue" />
                      <Mini label="Canceladas" value={String(ops.summary.cancelledCount)} icon={XCircle} accent="red" />
                      <Mini label="Turnos" value={String(ops.summary.sessionsCount)} icon={Clock} />
                      <Mini label="Depósitos" value={String(ops.summary.depositsCount)} icon={Building} />
                      <Mini label="Monto depósitos" value={money(ops.summary.depositsTotal)} icon={DollarSign} />
                      {ops.summary.avgPerTicket !== undefined && (
                        <Mini label="Promedio por ticket" value={money(ops.summary.avgPerTicket)} icon={Activity} accent="blue" />
                      )}
                      {ops.summary.estimatedCommission !== undefined && ops.summary.estimatedCommission > 0 && (
                        <Mini label="Comisión estimada" value={money(ops.summary.estimatedCommission)} icon={Percent} accent="green" />
                      )}
                    </div>

                    <h4 style={{ fontSize: 13, fontWeight: 700, color: "var(--accent-strong)", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                      <CreditCard size={16} /> Últimas ventas
                    </h4>
                    <div style={{ ...ui.tableWrap, boxShadow: "none", marginBottom: 18, borderRadius: 8, overflowX: "auto" }}>
                      <table style={{ ...ui.table, minWidth: 400 }}>
                        <thead>
                          <tr style={ui.theadRow}>
                            <th style={{ ...ui.th, minWidth: 100 }}>Folio</th>
                            <th style={{ ...ui.th, minWidth: 150 }}>Fecha</th>
                            <th style={{ ...ui.th, textAlign: "right", minWidth: 100 }}>Total</th>
                            <th style={{ ...ui.th, textAlign: "center", minWidth: 100 }}>Estado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ops.recentSales.length === 0 && <TableState colSpan={4} empty emptyText="Sin ventas registradas." />}
                          {ops.recentSales.map((s) => (
                            <tr key={s.id}>
                              <td style={{ ...ui.td, fontWeight: 700, color: "var(--accent-strong)" }}>{s.invoiceNumber}</td>
                              <td style={ui.td}>{fmtDate(s.createdAt)} {fmtTime(s.createdAt)}</td>
                              <td style={{ ...ui.td, textAlign: "right", fontWeight: 700 }}>{money(s.totalAmount)}</td>
                              <td style={{ ...ui.td, textAlign: "center" }}><Badge tone={statusTone(s.status)}>{s.status}</Badge></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <h4 style={{ fontSize: 13, fontWeight: 700, color: "var(--accent-strong)", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                      <Clock size={16} /> Últimos turnos
                    </h4>
                    <div style={{ ...ui.tableWrap, boxShadow: "none", borderRadius: 8, overflowX: "auto" }}>
                      <table style={{ ...ui.table, minWidth: 400 }}>
                        <thead>
                          <tr style={ui.theadRow}>
                            <th style={{ ...ui.th, minWidth: 60 }}>#</th>
                            <th style={{ ...ui.th, minWidth: 150 }}>Apertura</th>
                            <th style={{ ...ui.th, textAlign: "right", minWidth: 100 }}>Diferencia</th>
                            <th style={{ ...ui.th, textAlign: "center", minWidth: 100 }}>Estado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ops.recentSessions.length === 0 && <TableState colSpan={4} empty emptyText="Sin turnos registrados." />}
                          {ops.recentSessions.map((s) => (
                            <tr key={s.id}>
                              <td style={{ ...ui.td, fontWeight: 700, color: "var(--accent-strong)" }}>{s.id}</td>
                              <td style={ui.td}>{fmtDate(s.openedAt)} {fmtTime(s.openedAt)}</td>
                              <td style={{ ...ui.td, textAlign: "right", fontWeight: 700, color: s.difference && s.difference < 0 ? "var(--color-danger)" : "var(--text-secondary)" }}>
                                {s.difference !== null ? money(s.difference) : "—"}
                              </td>
                              <td style={{ ...ui.td, textAlign: "center" }}><Badge tone={statusTone(s.status)}>{s.status}</Badge></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <div style={{ textAlign: "center", padding: "20px", color: "var(--text-faint)" }}>No se pudieron cargar las operaciones.</div>
                )}
              </>
            )}

            {selectedEmployee.role !== "CAJERO" && (
              <div style={{ textAlign: "center", padding: "24px", color: "var(--text-muted)", fontSize: 14, backgroundColor: "var(--surface-2)", borderRadius: 8, border: "1px solid var(--border)" }}>
                <AlertCircle size={20} style={{ verticalAlign: "middle", marginRight: 8 }} />
                Este empleado no tiene operaciones de venta.
              </div>
            )}
          </div>
        )}
      </ActionModal>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  fieldError: {
    color: "var(--color-danger)",
    fontSize: 12,
    fontWeight: 600,
    marginTop: 5,
  },
};

const Mini: React.FC<{
  label: string;
  value: string;
  accent?: "blue" | "green" | "red";
  icon?: React.ElementType;
}> = ({ label, value, accent, icon: Icon }) => {
  const isMobile = useMediaQuery("(max-width: 1024px)");
  const accentStyles = {
    blue: { background: "var(--icon-bg-blue)", borderLeft: "4px solid var(--accent)", valueColor: "var(--accent)" },
    green: { background: "var(--icon-bg-green)", borderLeft: "4px solid var(--color-success)", valueColor: "var(--color-success)" },
    red: { background: "var(--icon-bg-red)", borderLeft: "4px solid var(--color-danger)", valueColor: "var(--color-danger)" },
  };
  const defaultStyle = { background: "var(--surface-2)", borderLeft: "4px solid var(--border)", valueColor: "var(--text)" };
  const style = accent ? accentStyles[accent] : defaultStyle;


  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: "10px 14px",
        background: style.background,
        borderLeft: style.borderLeft,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
        {Icon && <Icon size={14} style={{ color: "var(--text-muted)" }} />}
        <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.3px" }}>
          {label}
        </div>
      </div>
      <div style={{ fontSize: isMobile ? 16 : 18, fontWeight: 700, color: style.valueColor, marginTop: 2 }}>
        {value}
      </div>
    </div>
  );
};

export default EmpleadosView;