import React, { useEffect, useState, useCallback } from "react";
import { X, Plus, Pencil } from "lucide-react";
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
  zipCode: string | null;
  taxRegime: string | null;
  cfdiUse: string | null;
  createdAt: string;
}

const TAX_REGIMES = [
  { value: "601", label: "601 — General de Ley Personas Morales" },
  { value: "603", label: "603 — Personas Morales con Fines no Lucrativos" },
  { value: "605", label: "605 — Sueldos y Salarios" },
  { value: "606", label: "606 — Arrendamiento" },
  { value: "608", label: "608 — Demás Ingresos" },
  { value: "612", label: "612 — Personas Físicas con Act. Empresariales" },
  { value: "616", label: "616 — Sin obligaciones fiscales" },
  { value: "621", label: "621 — Incorporación Fiscal" },
  { value: "625", label: "625 — Actividades Agrícolas/Ganaderas/Silvícolas" },
  { value: "626", label: "626 — RESICO" },
];

const CFDI_USES = [
  { value: "G01", label: "G01 — Adquisición de mercancías" },
  { value: "G02", label: "G02 — Devoluciones, descuentos o bonificaciones" },
  { value: "G03", label: "G03 — Gastos en general" },
  { value: "I01", label: "I01 — Construcciones" },
  { value: "I02", label: "I02 — Mobiliario y equipo" },
  { value: "I03", label: "I03 — Equipo de transporte" },
  { value: "I08", label: "I08 — Otra maquinaria y equipo" },
  { value: "D01", label: "D01 — Honorarios médicos y dentales" },
  { value: "D10", label: "D10 — Pagos por servicios educativos" },
  { value: "S01", label: "S01 — Sin efectos fiscales" },
  { value: "CP01", label: "CP01 — Pagos" },
  { value: "P01", label: "P01 — Por definir" },
];

const emptyForm = {
  name: "",
  taxId: "",
  email: "",
  phone: "",
  address: "",
  creditLimit: "",
  zipCode: "",
  taxRegime: "",
  cfdiUse: "",
};

const ClientesView: React.FC<ViewProps> = ({ refreshToken }) => {
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
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

  const openCreate = () => {
    setForm({ ...emptyForm });
    setEditingId(null);
    setFormError(null);
    setShowForm(true);
  };

  const openEdit = (c: CustomerRow) => {
    setForm({
      name: c.name,
      taxId: c.taxId || "",
      email: c.email || "",
      phone: c.phone || "",
      address: c.address || "",
      creditLimit: String(c.creditLimit),
      zipCode: c.zipCode || "",
      taxRegime: c.taxRegime || "",
      cfdiUse: c.cfdiUse || "",
    });
    setEditingId(c.id);
    setFormError(null);
    setShowForm(true);
  };

  const closeForm = () => {
    if (saving) return;
    setShowForm(false);
    setEditingId(null);
    setFormError(null);
  };

  const set =
    (k: keyof typeof emptyForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setFormError("El nombre / razón social es obligatorio.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        name: form.name,
        taxId: form.taxId || undefined,
        email: form.email || undefined,
        phone: form.phone || undefined,
        address: form.address || undefined,
        creditLimit: form.creditLimit || undefined,
        zipCode: form.zipCode || undefined,
        taxRegime: form.taxRegime || undefined,
        cfdiUse: form.cfdiUse || undefined,
      };

      if (editingId !== null) {
        await api.put(`/api/admin/customers/${editingId}`, payload);
      } else {
        await api.post("/api/admin/customers", payload);
      }

      setShowForm(false);
      setForm({ ...emptyForm });
      setEditingId(null);
      await load();
    } catch (err: any) {
      setFormError(err.response?.data?.message || "No se pudo guardar el cliente.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <SectionHeader
        title="Clientes"
        subtitle="Directorio de clientes — incluye datos CFDI 4.0 para facturación"
        right={
          <button style={ui.primaryBtn} className="active-tap" onClick={openCreate}>
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
              <th style={ui.th}>Nombre / Razón Social</th>
              <th style={ui.th}>RFC</th>
              <th style={ui.th}>CP · Régimen · Uso CFDI</th>
              <th style={ui.th}>Contacto</th>
              <th style={{ ...ui.th, textAlign: "right" }}>Crédito</th>
              <th style={{ ...ui.th, textAlign: "right" }}>Saldo</th>
              <th style={{ ...ui.th, textAlign: "center" }}>Compras</th>
              <th style={ui.th}>Alta</th>
              <th style={{ ...ui.th, textAlign: "center" }}></th>
            </tr>
          </thead>
          <tbody>
            <TableState colSpan={9} loading={loading} error={error} empty={!loading && rows.length === 0} />
            {!loading &&
              !error &&
              rows.map((c) => (
                <tr key={c.id}>
                  <td style={{ ...ui.td, fontWeight: 700, color: "#0f172a", whiteSpace: "normal" }}>{c.name}</td>
                  <td style={{ ...ui.td, color: "#64748b", fontFamily: "monospace", fontSize: 12 }}>{c.taxId || "—"}</td>
                  <td style={{ ...ui.td, whiteSpace: "normal", fontSize: 12 }}>
                    {c.zipCode || c.taxRegime || c.cfdiUse ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 1, color: "#475569" }}>
                        {c.zipCode && <span>CP: {c.zipCode}</span>}
                        {c.taxRegime && <span>Rég: {c.taxRegime}</span>}
                        {c.cfdiUse && <span>CFDI: {c.cfdiUse}</span>}
                      </div>
                    ) : (
                      <span style={{ color: "#cbd5e1" }}>—</span>
                    )}
                  </td>
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
                  <td style={{ ...ui.td, textAlign: "center" }}>
                    <button
                      onClick={() => openEdit(c)}
                      style={{ background: "none", border: "none", cursor: "pointer", padding: "4px 6px", borderRadius: 4, color: "#1e3a8a" }}
                      title="Editar cliente"
                    >
                      <Pencil size={14} />
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Modal crear / editar */}
      {showForm && (
        <div style={ui.overlay} onClick={closeForm}>
          <form style={{ ...ui.modal, maxWidth: 560 }} onClick={(e) => e.stopPropagation()} onSubmit={submit}>
            <div style={ui.modalHeader}>
              <span style={ui.modalTitle}>{editingId !== null ? "Editar cliente" : "Registrar nuevo cliente"}</span>
              <button type="button" style={ui.linkBtn} onClick={closeForm}>
                <X size={18} color="#64748b" />
              </button>
            </div>
            <div style={ui.modalBody}>

              {/* Nombre */}
              <div style={{ marginBottom: 14 }}>
                <label style={ui.fieldLabel}>Nombre / Razón Social *</label>
                <input style={ui.input} value={form.name} onChange={set("name")} placeholder="Nombre del cliente" autoFocus />
              </div>

              {/* RFC + Teléfono */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={ui.fieldLabel}>RFC</label>
                  <input
                    style={{ ...ui.input, fontFamily: "monospace", textTransform: "uppercase" }}
                    value={form.taxId}
                    onChange={set("taxId")}
                    placeholder="XAXX010101000"
                    maxLength={13}
                  />
                </div>
                <div>
                  <label style={ui.fieldLabel}>Teléfono</label>
                  <input style={ui.input} value={form.phone} onChange={set("phone")} placeholder="771 000 0000" />
                </div>
              </div>

              {/* Email + Dirección */}
              <div style={{ marginBottom: 14 }}>
                <label style={ui.fieldLabel}>Correo electrónico</label>
                <input style={ui.input} value={form.email} onChange={set("email")} placeholder="correo@dominio.com" />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={ui.fieldLabel}>Dirección</label>
                <input style={ui.input} value={form.address} onChange={set("address")} placeholder="Calle, número, colonia" />
              </div>

              {/* Límite crédito + CP */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={ui.fieldLabel}>Límite de crédito ($)</label>
                  <input style={ui.input} value={form.creditLimit} onChange={set("creditLimit")} placeholder="0.00" />
                </div>
                <div>
                  <label style={ui.fieldLabel}>Código Postal fiscal</label>
                  <input
                    style={ui.input}
                    value={form.zipCode}
                    onChange={set("zipCode")}
                    placeholder="12345"
                    maxLength={5}
                  />
                </div>
              </div>

              {/* Sección CFDI */}
              <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "12px 14px", backgroundColor: "#f8fafc", marginBottom: 8 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: "#1e3a8a", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Datos CFDI 4.0
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={ui.fieldLabel}>Régimen Fiscal</label>
                    <select style={{ ...ui.input, cursor: "pointer" }} value={form.taxRegime} onChange={set("taxRegime")}>
                      <option value="">— Sin especificar —</option>
                      {TAX_REGIMES.map((r) => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={ui.fieldLabel}>Uso de CFDI</label>
                    <select style={{ ...ui.input, cursor: "pointer" }} value={form.cfdiUse} onChange={set("cfdiUse")}>
                      <option value="">— Sin especificar —</option>
                      {CFDI_USES.map((u) => (
                        <option key={u.value} value={u.value}>{u.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {formError && (
                <p style={{ color: "#b91c1c", fontSize: 13, fontWeight: 600, marginTop: 4 }}>{formError}</p>
              )}

              <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                <button type="button" style={{ ...ui.ghostBtn, flex: 1, justifyContent: "center" }} onClick={closeForm}>
                  Cancelar
                </button>
                <button type="submit" disabled={saving} style={{ ...ui.primaryBtn, flex: 1, justifyContent: "center" }}>
                  {saving ? "Guardando..." : editingId !== null ? "Actualizar cliente" : "Guardar cliente"}
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
