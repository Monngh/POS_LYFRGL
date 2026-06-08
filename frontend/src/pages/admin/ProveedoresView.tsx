import React, { useEffect, useState, useCallback } from "react";
import { Plus, X, Edit2 } from "lucide-react";
import api from "../../services/api";
import { ui, type ViewProps, TableState, SectionHeader, Badge } from "./shared";

interface Supplier {
  id: number;
  name: string;
  rfc: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  contactName: string | null;
  active: boolean;
  createdAt: string;
}

type FormData = {
  name: string;
  rfc: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  contactName: string;
  active: boolean;
};

const emptyForm = (): FormData => ({
  name: "",
  rfc: "",
  email: "",
  phone: "",
  address: "",
  city: "",
  state: "",
  zipCode: "",
  contactName: "",
  active: true,
});

const ProveedoresView: React.FC<ViewProps> = ({ refreshToken }) => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadSuppliers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<Supplier[]>("/api/admin/suppliers");
      setSuppliers(res.data);
    } catch {
      setError("No se pudieron cargar los proveedores.");
    } finally {
      setLoading(false);
    }
  }, [refreshToken]);

  useEffect(() => {
    loadSuppliers();
  }, [loadSuppliers]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (s: Supplier) => {
    setEditingId(s.id);
    setForm({
      name: s.name,
      rfc: s.rfc || "",
      email: s.email || "",
      phone: s.phone || "",
      address: s.address || "",
      city: s.city || "",
      state: s.state || "",
      zipCode: s.zipCode || "",
      contactName: s.contactName || "",
      active: s.active,
    });
    setFormError(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
    setForm(emptyForm());
    setFormError(null);
  };

  const setField = (k: keyof FormData, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      setFormError("El nombre del proveedor es requerido.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        name: form.name.trim(),
        rfc: form.rfc.trim() || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
        city: form.city.trim() || null,
        state: form.state.trim() || null,
        zipCode: form.zipCode.trim() || null,
        contactName: form.contactName.trim() || null,
        active: form.active,
      };
      if (editingId) {
        await api.put(`/api/admin/suppliers/${editingId}`, payload);
      } else {
        await api.post("/api/admin/suppliers", payload);
      }
      closeModal();
      await loadSuppliers();
    } catch (err: any) {
      setFormError(err.response?.data?.message || "Error al guardar el proveedor.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <SectionHeader
        title="Proveedores"
        subtitle="Catálogo de proveedores para órdenes de compra"
        right={
          <button style={ui.primaryBtn} className="active-tap" onClick={openCreate}>
            <Plus size={15} /> Agregar Proveedor
          </button>
        }
      />

      <div className="table-sticky-head" style={{ ...ui.tableWrap, overflowX: "auto", overflowY: "auto", maxHeight: "62vh" }}>
        <table style={ui.table}>
          <thead>
            <tr style={ui.theadRow}>
              <th style={ui.th}>Nombre</th>
              <th style={ui.th}>RFC</th>
              <th style={ui.th}>Contacto</th>
              <th style={ui.th}>Email</th>
              <th style={ui.th}>Teléfono</th>
              <th style={ui.th}>Ciudad / Estado</th>
              <th style={{ ...ui.th, textAlign: "center" }}>Estatus</th>
              <th style={ui.th}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            <TableState
              colSpan={8}
              loading={loading}
              error={error}
              empty={!loading && !error && suppliers.length === 0}
              emptyText="Aún no hay proveedores registrados."
            />
            {!loading &&
              !error &&
              suppliers.map((s) => (
                <tr key={s.id}>
                  <td style={{ ...ui.td, fontWeight: 700, color: "#0f172a" }}>{s.name}</td>
                  <td style={{ ...ui.td, color: "#475569" }}>{s.rfc || "—"}</td>
                  <td style={ui.td}>{s.contactName || "—"}</td>
                  <td style={ui.td}>{s.email || "—"}</td>
                  <td style={ui.td}>{s.phone || "—"}</td>
                  <td style={ui.td}>
                    {s.city ? `${s.city}${s.state ? `, ${s.state}` : ""}` : "—"}
                  </td>
                  <td style={{ ...ui.td, textAlign: "center" }}>
                    <Badge tone={s.active ? "green" : "slate"}>
                      {s.active ? "Activo" : "Inactivo"}
                    </Badge>
                  </td>
                  <td style={ui.td}>
                    <button style={ui.linkBtn} onClick={() => openEdit(s)}>
                      <Edit2
                        size={13}
                        style={{ marginRight: 4, verticalAlign: "middle" }}
                      />
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div
          style={ui.overlay}
          onClick={(e) => e.target === e.currentTarget && closeModal()}
        >
          <div style={{ ...ui.modal, maxWidth: 520 }}>
            <div style={ui.modalHeader}>
              <span style={ui.modalTitle}>
                {editingId ? "Editar Proveedor" : "Nuevo Proveedor"}
              </span>
              <button
                onClick={closeModal}
                style={{ background: "none", border: "none", cursor: "pointer" }}
              >
                <X size={18} color="#64748b" />
              </button>
            </div>

            <div style={ui.modalBody}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={ui.fieldLabel}>Nombre *</label>
                  <input
                    style={ui.input}
                    value={form.name}
                    onChange={(e) => setField("name", e.target.value)}
                    placeholder="Razón social o nombre comercial"
                    autoFocus
                  />
                </div>
                <div>
                  <label style={ui.fieldLabel}>RFC</label>
                  <input
                    style={ui.input}
                    value={form.rfc}
                    onChange={(e) => setField("rfc", e.target.value)}
                    placeholder="RFC del proveedor"
                  />
                </div>
                <div>
                  <label style={ui.fieldLabel}>Persona de contacto</label>
                  <input
                    style={ui.input}
                    value={form.contactName}
                    onChange={(e) => setField("contactName", e.target.value)}
                    placeholder="Nombre del contacto"
                  />
                </div>
                <div>
                  <label style={ui.fieldLabel}>Email</label>
                  <input
                    style={ui.input}
                    type="email"
                    value={form.email}
                    onChange={(e) => setField("email", e.target.value)}
                    placeholder="correo@proveedor.com"
                  />
                </div>
                <div>
                  <label style={ui.fieldLabel}>Teléfono</label>
                  <input
                    style={ui.input}
                    value={form.phone}
                    onChange={(e) => setField("phone", e.target.value)}
                    placeholder="55 1234 5678"
                  />
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={ui.fieldLabel}>Dirección</label>
                  <input
                    style={ui.input}
                    value={form.address}
                    onChange={(e) => setField("address", e.target.value)}
                    placeholder="Calle, número, colonia"
                  />
                </div>
                <div>
                  <label style={ui.fieldLabel}>Ciudad</label>
                  <input
                    style={ui.input}
                    value={form.city}
                    onChange={(e) => setField("city", e.target.value)}
                    placeholder="Ciudad"
                  />
                </div>
                <div>
                  <label style={ui.fieldLabel}>Estado</label>
                  <input
                    style={ui.input}
                    value={form.state}
                    onChange={(e) => setField("state", e.target.value)}
                    placeholder="Estado"
                  />
                </div>
                <div>
                  <label style={ui.fieldLabel}>C.P.</label>
                  <input
                    style={ui.input}
                    value={form.zipCode}
                    onChange={(e) => setField("zipCode", e.target.value)}
                    placeholder="00000"
                  />
                </div>
                <div style={{ marginBottom: "16px" }}>
                  <label style={{ display: "block", marginBottom: "8px", fontSize: "12px", fontWeight: "600", color: "#1e3a8a" }}>
                    ESTATUS
                  </label>
                  <select
                    value={form.active ? "active" : "inactive"}
                    onChange={(e) => setForm({ ...form, active: e.target.value === "active" })}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      border: "1px solid #d1d5db",
                      borderRadius: "6px",
                      fontSize: "14px",
                      fontFamily: "system-ui"
                    }}
                  >
                    <option value="active">Activo</option>
                    <option value="inactive">Inactivo</option>
                  </select>
                </div>
              </div>

              {formError && (
                <p
                  style={{ color: "#b91c1c", fontSize: 13, fontWeight: 600, marginTop: 14 }}
                >
                  {formError}
                </p>
              )}

              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 10,
                  marginTop: 22,
                }}
              >
                <button
                  style={ui.ghostBtn}
                  onClick={closeModal}
                  disabled={saving}
                >
                  Cancelar
                </button>
                <button
                  style={ui.primaryBtn}
                  onClick={handleSubmit}
                  disabled={saving}
                >
                  {saving
                    ? "Guardando..."
                    : editingId
                    ? "Guardar cambios"
                    : "Agregar Proveedor"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProveedoresView;
