import React, { useEffect, useState, useCallback } from "react";
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

const emptyForm: FormState = { name: "", address: "", phone: "", active: true };

const SucursalesView: React.FC<ViewProps> = ({ refreshToken }) => {
  const [rows, setRows] = useState<BranchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Modal: modo "create" o el id que se edita
  const [editing, setEditing] = useState<"create" | number | null>(null);
  const [form, setForm] = useState<FormState>({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

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

  const openCreate = () => {
    setForm({ ...emptyForm });
    setFormError(null);
    setEditing("create");
  };

  const openEdit = (b: BranchRow) => {
    setForm({ name: b.name, address: b.address || "", phone: b.phone || "", active: b.active });
    setFormError(null);
    setEditing(b.id);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setFormError("El nombre de la sucursal es obligatorio.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        name: form.name,
        address: form.address,
        phone: form.phone,
        active: form.active,
      };
      if (editing === "create") {
        await api.post("/api/admin/branches", payload);
      } else {
        await api.put(`/api/admin/branches/${editing}`, payload);
      }
      setEditing(null);
      await load();
    } catch (err: any) {
      setFormError(err.response?.data?.message || "No se pudo guardar la sucursal.");
    } finally {
      setSaving(false);
    }
  };

  const set =
    (k: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const activeCount = rows.filter((r) => r.active).length;

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
        <span style={{ marginLeft: "auto", fontSize: 13, color: "#64748b", fontWeight: 600 }}>
          {rows.length} sucursal{rows.length === 1 ? "" : "es"}
        </span>
      </Toolbar>

      <div style={ui.tableWrap}>
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
            <TableState colSpan={9} loading={loading} error={error} empty={!loading && rows.length === 0} />
            {!loading &&
              !error &&
              rows.map((b) => (
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
                    <button style={ui.linkBtn} className="active-tap" onClick={() => openEdit(b)}>
                      <Pencil size={14} style={{ verticalAlign: "-2px" }} /> Editar
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Modal crear / editar */}
      {editing !== null && (
        <div style={ui.overlay} onClick={() => !saving && setEditing(null)}>
          <form style={ui.modal} onClick={(e) => e.stopPropagation()} onSubmit={submit}>
            <div style={ui.modalHeader}>
              <span style={ui.modalTitle}>
                {editing === "create" ? "Registrar nueva sucursal" : "Editar sucursal"}
              </span>
              <button type="button" style={ui.linkBtn} onClick={() => setEditing(null)}>
                <X size={18} color="#64748b" />
              </button>
            </div>
            <div style={ui.modalBody}>
              <div style={{ marginBottom: 14 }}>
                <label style={ui.fieldLabel}>Nombre de la sucursal *</label>
                <input style={ui.input} value={form.name} onChange={set("name")} placeholder="Ej. Sucursal Centro LYFRGL" autoFocus />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={ui.fieldLabel}>Dirección</label>
                <input style={ui.input} value={form.address} onChange={set("address")} placeholder="Calle, número, colonia, ciudad" />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={ui.fieldLabel}>Teléfono</label>
                <input style={ui.input} value={form.phone} onChange={set("phone")} placeholder="771 000 0000" />
              </div>

              <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", marginTop: 4 }}>
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
                  style={{ width: 16, height: 16, accentColor: "#1e3a8a", cursor: "pointer" }}
                />
                <span style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>Sucursal activa</span>
              </label>

              {formError && (
                <p style={{ color: "#b91c1c", fontSize: 13, fontWeight: 600, marginTop: 14 }}>{formError}</p>
              )}

              <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
                <button type="button" style={{ ...ui.ghostBtn, flex: 1, justifyContent: "center" }} onClick={() => setEditing(null)}>
                  Cancelar
                </button>
                <button type="submit" disabled={saving} style={{ ...ui.primaryBtn, flex: 1, justifyContent: "center" }}>
                  {saving ? "Guardando..." : editing === "create" ? "Guardar sucursal" : "Guardar cambios"}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default SucursalesView;
