import React, { useEffect, useState, useCallback } from "react";
import { X, Plus, Activity } from "lucide-react";
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
  };
  recentSales: { id: number; invoiceNumber: string; createdAt: string; totalAmount: number; paymentMethod: string; status: string }[];
  recentSessions: { id: number; openedAt: string; closedAt: string | null; initialAmount: number; difference: number | null; status: string }[];
}

const emptyForm = { name: "", email: "", password: "", role: "CAJERO", branchId: "", pinCode: "" };

const EmpleadosView: React.FC<ViewProps> = ({ branchId, refreshToken }) => {
  const [rows, setRows] = useState<EmployeeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("all");

  const [branches, setBranches] = useState<BranchOption[]>([]);

  // Alta de empleado
  const [showForm, setShowForm] = useState(false);
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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.password || !form.branchId) {
      setFormError("Nombre, correo, contraseña y sucursal son obligatorios.");
      return;
    }
    if (form.role === "CAJERO" && !/^\d{4}$/.test(form.pinCode)) {
      setFormError("Los cajeros requieren un PIN de 4 dígitos.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await api.post("/api/admin/employees", {
        name: form.name,
        email: form.email,
        password: form.password,
        role: form.role,
        branchId: Number(form.branchId),
        pinCode: form.pinCode || undefined,
      });
      setShowForm(false);
      setForm({ ...emptyForm });
      await load();
    } catch (err: any) {
      setFormError(err.response?.data?.message || "No se pudo registrar el empleado.");
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

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div>
      <SectionHeader
        title="Empleados"
        subtitle="Usuarios del sistema y sus permisos por sucursal"
        right={
          <button style={ui.primaryBtn} className="active-tap" onClick={() => { setForm({ ...emptyForm }); setFormError(null); setShowForm(true); }}>
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

      <div style={ui.tableWrap}>
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
            </tr>
          </thead>
          <tbody>
            <TableState colSpan={7} loading={loading} error={error} empty={!loading && rows.length === 0} />
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
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Modal alta de empleado */}
      {showForm && (
        <div style={ui.overlay} onClick={() => !saving && setShowForm(false)}>
          <form style={ui.modal} onClick={(e) => e.stopPropagation()} onSubmit={submit}>
            <div style={ui.modalHeader}>
              <span style={ui.modalTitle}>Registrar nuevo empleado</span>
              <button type="button" style={ui.linkBtn} onClick={() => setShowForm(false)}>
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
                <input style={ui.input} value={form.email} onChange={set("email")} placeholder="correo@fmb.com" />
              </div>
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

              {formError && <p style={{ color: "#b91c1c", fontSize: 13, fontWeight: 600, marginTop: 10 }}>{formError}</p>}

              <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                <button type="button" style={{ ...ui.ghostBtn, flex: 1, justifyContent: "center" }} onClick={() => setShowForm(false)}>
                  Cancelar
                </button>
                <button type="submit" disabled={saving} style={{ ...ui.primaryBtn, flex: 1, justifyContent: "center" }}>
                  {saving ? "Guardando..." : "Registrar empleado"}
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

const Mini: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 12px" }}>
    <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>{label}</div>
    <div style={{ fontSize: 18, fontWeight: 800, color: "#0f172a", marginTop: 3 }}>{value}</div>
  </div>
);

export default EmpleadosView;
