import React, { useEffect, useState, useCallback } from "react";
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

const EmpleadosView: React.FC<ViewProps> = ({ branchId, refreshToken }) => {
  const [rows, setRows] = useState<EmployeeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("all");

  const [branches, setBranches] = useState<BranchOption[]>([]);

  // Alta / edición de empleado
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editActive, setEditActive] = useState(true);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Operaciones del vendedor
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
    api.get<{ branches: BranchOption[] }>("/api/auth/branches").then((r) => setBranches(r.data.branches)).catch(() => {});
  }, []);

  const openCreate = () => {
    setForm({ ...emptyForm });
    setEditingId(null);
    setEditActive(true);
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
    setFormError(null);
    setShowForm(true);
  };

  const closeForm = () => {
    if (saving) return;
    setShowForm(false);
    setEditingId(null);
    setFormError(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.name.trim() || !form.email.trim()) {
      setFormError("Nombre y correo son obligatorios.");
      return;
    }

    if (editingId === null) {
      // Validaciones solo para creación
      if (!form.password || !form.branchId) {
        setFormError("Contraseña y sucursal son obligatorios.");
        return;
      }
      if (form.role === "CAJERO" && !/^\d{4}$/.test(form.pinCode)) {
        setFormError("Los cajeros requieren un PIN de 4 dígitos.");
        return;
      }
    }

    setSaving(true);
    setFormError(null);
    try {
      if (editingId !== null) {
        await api.put(`/api/admin/employees/${editingId}`, {
          name: form.name,
          email: form.email,
          phone: form.phone || undefined,
          baseSalary: form.baseSalary || undefined,
          commissionRate: form.commissionRate || undefined,
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
          baseSalary: form.baseSalary || undefined,
          commissionRate: form.commissionRate || undefined,
        });
      }
      setShowForm(false);
      setForm({ ...emptyForm });
      setEditingId(null);
      await load();
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

  const set = (k: keyof typeof emptyForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

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
            {!loading &&
              !error &&
              rows.map((u) => (
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

      {/* Modal alta / edición de empleado */}
      {showForm && (
        <div style={ui.overlay} onClick={closeForm}>
          <form style={ui.modal} onClick={(e) => e.stopPropagation()} onSubmit={submit}>
            <div style={ui.modalHeader}>
              <span style={ui.modalTitle}>{editingId !== null ? "Editar empleado" : "Registrar nuevo empleado"}</span>
              <button type="button" style={ui.linkBtn} onClick={closeForm}>
                <X size={18} color="#64748b" />
              </button>
            </div>
            <div style={ui.modalBody}>
              <div style={{ marginBottom: 14 }}>
                <label style={ui.fieldLabel}>Nombre completo *</label>
                <input style={ui.input} value={form.name} onChange={set("name")} placeholder="Nombre del empleado" autoFocus />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={ui.fieldLabel}>Correo electrónico *</label>
                <input style={ui.input} value={form.email} onChange={set("email")} placeholder="correo@empresa.com" />
              </div>

              {/* Teléfono */}
              <div style={{ marginBottom: 14 }}>
                <label style={ui.fieldLabel}>Teléfono</label>
                <input style={ui.input} value={form.phone} onChange={set("phone")} placeholder="771 000 0000" />
              </div>

              {/* Sueldo base + % comisión */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={ui.fieldLabel}>Sueldo base ($)</label>
                  <input style={ui.input} type="number" step="0.01" min="0" value={form.baseSalary} onChange={set("baseSalary")} placeholder="0.00" />
                </div>
                <div>
                  <label style={ui.fieldLabel}>% Comisión de ventas</label>
                  <input style={ui.input} type="number" step="0.01" min="0" max="100" value={form.commissionRate} onChange={set("commissionRate")} placeholder="0.00" />
                  <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>Ej: 2.5 para 2.5%</p>
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
                    </div>
                    <div>
                      <label style={ui.fieldLabel}>Sucursal *</label>
                      <select style={ui.input} value={form.branchId} onChange={set("branchId")}>
                        <option value="">Seleccione...</option>
                        {branches.map((b) => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 6 }}>
                    <div>
                      <label style={ui.fieldLabel}>Contraseña *</label>
                      <input style={ui.input} type="password" value={form.password} onChange={set("password")} placeholder="Mínimo 6 caracteres" />
                    </div>
                    <div>
                      <label style={ui.fieldLabel}>PIN {form.role === "CAJERO" ? "(4 dígitos) *" : "(opcional)"}</label>
                      <input style={ui.input} value={form.pinCode} onChange={set("pinCode")} maxLength={4} placeholder="0000" />
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
                <table style={{ ...ui.table, marginBottom: 18 }}>
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
