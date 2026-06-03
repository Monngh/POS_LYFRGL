import React, { useEffect, useState, useCallback } from "react";
import { X, Plus } from "lucide-react";
import api from "../../services/api";
import {
  ui,
  type ViewProps,
  Toolbar,
  SearchInput,
  TableState,
  SectionHeader,
  money,
  fmtDate,
} from "./shared";

interface CustomerRow {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  taxId: string | null;
  address: string | null;
  creditLimit: number;
  balance: number;
  salesCount: number;
  createdAt: string;
}

const emptyForm = { name: "", taxId: "", email: "", phone: "", address: "", creditLimit: "" };

const ClientesView: React.FC<ViewProps> = ({ refreshToken }) => {
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ customers: CustomerRow[] }>("/api/admin/customers", {
        params: search.trim() ? { search: search.trim() } : {},
      });
      setRows(res.data.customers);
    } catch (err: any) {
      setError(err.response?.data?.message || "No se pudieron cargar los clientes.");
    } finally {
      setLoading(false);
    }
  }, [search, refreshToken]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setFormError("El nombre es obligatorio.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await api.post("/api/admin/customers", {
        name: form.name,
        taxId: form.taxId,
        email: form.email,
        phone: form.phone,
        address: form.address,
        creditLimit: form.creditLimit,
      });
      setShowForm(false);
      setForm({ ...emptyForm });
      await load();
    } catch (err: any) {
      setFormError(err.response?.data?.message || "No se pudo registrar el cliente.");
    } finally {
      setSaving(false);
    }
  };

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div>
      <SectionHeader
        title="Clientes"
        subtitle="Directorio de clientes registrados"
        right={
          <button style={ui.primaryBtn} className="active-tap" onClick={() => setShowForm(true)}>
            <Plus size={16} /> Nuevo cliente
          </button>
        }
      />

      <Toolbar>
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar por nombre, RFC, correo o teléfono" />
        <span style={{ marginLeft: "auto", fontSize: 13, color: "#64748b", fontWeight: 600 }}>
          {rows.length} cliente{rows.length === 1 ? "" : "s"}
        </span>
      </Toolbar>

      <div style={ui.tableWrap}>
        <table style={ui.table}>
          <thead>
            <tr style={ui.theadRow}>
              <th style={ui.th}>Nombre</th>
              <th style={ui.th}>RFC</th>
              <th style={ui.th}>Contacto</th>
              <th style={{ ...ui.th, textAlign: "right" }}>Límite crédito</th>
              <th style={{ ...ui.th, textAlign: "right" }}>Saldo</th>
              <th style={{ ...ui.th, textAlign: "center" }}>Compras</th>
              <th style={ui.th}>Alta</th>
            </tr>
          </thead>
          <tbody>
            <TableState colSpan={7} loading={loading} error={error} empty={!loading && rows.length === 0} />
            {!loading &&
              !error &&
              rows.map((c) => (
                <tr key={c.id}>
                  <td style={{ ...ui.td, fontWeight: 700, color: "#0f172a", whiteSpace: "normal" }}>{c.name}</td>
                  <td style={{ ...ui.td, color: "#64748b" }}>{c.taxId || "—"}</td>
                  <td style={{ ...ui.td, whiteSpace: "normal" }}>
                    <div>{c.email || "—"}</div>
                    <div style={{ fontSize: 11, color: "#94a3b8" }}>{c.phone || ""}</div>
                  </td>
                  <td style={{ ...ui.td, textAlign: "right" }}>{money(c.creditLimit)}</td>
                  <td style={{ ...ui.td, textAlign: "right", fontWeight: 700, color: c.balance > 0 ? "#b91c1c" : "#334155" }}>
                    {money(c.balance)}
                  </td>
                  <td style={{ ...ui.td, textAlign: "center", fontWeight: 700 }}>{c.salesCount}</td>
                  <td style={{ ...ui.td, color: "#64748b" }}>{fmtDate(c.createdAt)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Modal de alta */}
      {showForm && (
        <div style={ui.overlay} onClick={() => !saving && setShowForm(false)}>
          <form style={ui.modal} onClick={(e) => e.stopPropagation()} onSubmit={submit}>
            <div style={ui.modalHeader}>
              <span style={ui.modalTitle}>Registrar nuevo cliente</span>
              <button type="button" style={ui.linkBtn} onClick={() => setShowForm(false)}>
                <X size={18} color="#64748b" />
              </button>
            </div>
            <div style={ui.modalBody}>
              <div style={{ marginBottom: 14 }}>
                <label style={ui.fieldLabel}>Nombre / Razón social *</label>
                <input style={ui.input} value={form.name} onChange={set("name")} placeholder="Nombre del cliente" autoFocus />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={ui.fieldLabel}>RFC</label>
                  <input style={ui.input} value={form.taxId} onChange={set("taxId")} placeholder="XAXX010101000" />
                </div>
                <div>
                  <label style={ui.fieldLabel}>Teléfono</label>
                  <input style={ui.input} value={form.phone} onChange={set("phone")} placeholder="771 000 0000" />
                </div>
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={ui.fieldLabel}>Correo electrónico</label>
                <input style={ui.input} value={form.email} onChange={set("email")} placeholder="correo@dominio.com" />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={ui.fieldLabel}>Dirección</label>
                <input style={ui.input} value={form.address} onChange={set("address")} placeholder="Calle, número, colonia" />
              </div>
              <div style={{ marginBottom: 8 }}>
                <label style={ui.fieldLabel}>Límite de crédito ($)</label>
                <input style={ui.input} value={form.creditLimit} onChange={set("creditLimit")} placeholder="0.00" />
              </div>

              {formError && (
                <p style={{ color: "#b91c1c", fontSize: 13, fontWeight: 600, marginTop: 4 }}>{formError}</p>
              )}

              <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                <button type="button" style={{ ...ui.ghostBtn, flex: 1, justifyContent: "center" }} onClick={() => setShowForm(false)}>
                  Cancelar
                </button>
                <button type="submit" disabled={saving} style={{ ...ui.primaryBtn, flex: 1, justifyContent: "center" }}>
                  {saving ? "Guardando..." : "Guardar cliente"}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default ClientesView;
