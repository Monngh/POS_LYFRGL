import React, { useEffect, useState, useCallback, useRef } from "react";
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

type FormState = typeof emptyForm;
type FieldErrors = Partial<Record<keyof FormState, string>>;

const NAME_PATTERN = /^[A-Za-z0-9\u00C0-\u017F\s.,'&-]+$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\d{10}$/;
const RFC_PATTERN = /^([A-Z\u00D1&]{3,4})\d{6}([A-Z0-9]{3})$/;
const ZIP_CODE_PATTERN = /^\d{5}$/;

const fieldErrorStyle: React.CSSProperties = {
  color: "#b91c1c",
  fontSize: 12,
  fontWeight: 600,
  marginTop: 5,
};

const normalizeSpaces = (value: string) => value.trim().replace(/\s+/g, " ");

const ClientesView: React.FC<ViewProps> = ({ refreshToken }) => {
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [originalForm, setOriginalForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const submitClickedRef = useRef(false);

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
    setOriginalForm(null);
    setEditingId(null);
    setFormError(null);
    setFieldErrors({});
    setShowForm(true);
  };

  const openEdit = (c: CustomerRow) => {
    const editForm = {
      name: c.name,
      taxId: c.taxId || "",
      email: c.email || "",
      phone: c.phone || "",
      address: c.address || "",
      creditLimit: String(c.creditLimit),
      zipCode: c.zipCode || "",
      taxRegime: c.taxRegime || "",
      cfdiUse: c.cfdiUse || "",
    };
    setForm(editForm);
    setOriginalForm(JSON.parse(JSON.stringify(editForm)));
    setEditingId(c.id);
    setFormError(null);
    setFieldErrors({});
    setShowForm(true);
  };

  const closeForm = () => {
    if (saving) return;
    setShowForm(false);
    setEditingId(null);
    setOriginalForm(null);
    setFormError(null);
    setFieldErrors({});
  };

  // 🔥 IMPORTANTE: El overlay NO cierra el modal al hacer clic fuera
  const handleOverlayClick = (e: React.MouseEvent) => {
    // No hacemos nada - el modal NO se cierra
    e.stopPropagation();
  };

  const hasChanges = (): boolean => {
    if (!originalForm) return true;
    return JSON.stringify(form) !== JSON.stringify(originalForm);
  };

  const validateForm = (): boolean => {
    const errors: FieldErrors = {};
    let isValid = true;

    const name = normalizeSpaces(form.name);
    if (!name) {
      errors.name = "El nombre del cliente es requerido.";
      isValid = false;
    } else if (name.length < 2) {
      errors.name = "El nombre debe tener al menos 2 caracteres.";
      isValid = false;
    } else if (!NAME_PATTERN.test(name)) {
      errors.name = "El nombre contiene caracteres no permitidos.";
      isValid = false;
    }

    const phoneDigits = form.phone.replace(/\D/g, "");
    if (!phoneDigits) {
      errors.phone = "El teléfono es obligatorio.";
      isValid = false;
    } else if (!PHONE_PATTERN.test(phoneDigits)) {
      errors.phone = "El teléfono debe tener exactamente 10 dígitos.";
      isValid = false;
    }

    const taxId = form.taxId.trim().toUpperCase();
    if (taxId && !RFC_PATTERN.test(taxId)) {
      errors.taxId = "Formato de RFC inválido.";
      isValid = false;
    }

    const email = form.email.trim();
    if (email && !EMAIL_PATTERN.test(email)) {
      errors.email = "Correo electrónico inválido.";
      isValid = false;
    }

    const zipCode = form.zipCode.trim();
    if (zipCode && !ZIP_CODE_PATTERN.test(zipCode)) {
      errors.zipCode = "Código postal debe tener 5 dígitos.";
      isValid = false;
    }

    const creditLimitText = form.creditLimit.trim();
    if (creditLimitText) {
      const num = parseFloat(creditLimitText);
      if (isNaN(num)) {
        errors.creditLimit = "Debe ser un número válido.";
        isValid = false;
      } else if (num < 0) {
        errors.creditLimit = "No puede ser negativo.";
        isValid = false;
      }
    }

    setFieldErrors(errors);
    return isValid;
  };

  const isSaveEnabled = () => {
    if (saving) return false;

    if (!form.name.trim()) return false;
    const phoneDigits = form.phone.replace(/\D/g, "");
    if (phoneDigits.length !== 10) return false;

    if (editingId !== null && !hasChanges()) return false;

    return true;
  };

  const updateField = (k: keyof typeof emptyForm, value: string) => {
    let nextValue = value;
    if (k === "taxId") nextValue = value.toUpperCase().replace(/\s+/g, "");
    if (k === "phone") nextValue = value.replace(/\D/g, "").slice(0, 10);
    if (k === "zipCode") nextValue = value.replace(/\D/g, "").slice(0, 5);
    setForm({ ...form, [k]: nextValue });
    setFieldErrors({ ...fieldErrors, [k]: undefined });
    if (formError === "No hubo cambios para guardar.") {
      setFormError(null);
    }
  };

  const setField = (k: keyof typeof emptyForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    updateField(k, e.target.value);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (saving || submitClickedRef.current) return;

    if (editingId !== null && !hasChanges()) {
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
      const payload = {
        name: normalizeSpaces(form.name),
        taxId: form.taxId.trim().toUpperCase() || undefined,
        email: form.email.trim() || undefined,
        phone: form.phone.replace(/\D/g, ""),
        address: normalizeSpaces(form.address) || undefined,
        creditLimit: parseFloat(form.creditLimit) || 0,
        zipCode: form.zipCode.trim() || undefined,
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

      <div className="table-sticky-head" style={{ ...ui.tableWrap, overflowX: "auto", overflowY: "auto", maxHeight: "62vh" }}>
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
            {!loading && !error && rows.map((c) => (
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
                  ) : <span style={{ color: "#cbd5e1" }}>—</span>}
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
                  <button onClick={() => openEdit(c)} style={{ background: "none", border: "none", cursor: "pointer", padding: "4px 6px", borderRadius: 4, color: "#1e3a8a" }} title="Editar cliente">
                    <Pencil size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 🔥 Modal - NO se cierra al hacer clic fuera */}
      {showForm && (
        <div style={ui.overlay} onClick={handleOverlayClick}>
          <form style={{ ...ui.modal, maxWidth: 560 }} onClick={(e) => e.stopPropagation()} onSubmit={submit}>
            <div style={ui.modalHeader}>
              <span style={ui.modalTitle}>{editingId !== null ? "Editar cliente" : "Registrar nuevo cliente"}</span>
              <button type="button" style={{ ...ui.linkBtn, opacity: saving ? 0.6 : 1 }} onClick={closeForm} disabled={saving}>
                <X size={18} color="#64748b" />
              </button>
            </div>
            <div style={ui.modalBody}>
              <div style={{ marginBottom: 14 }}>
                <label style={ui.fieldLabel}>Nombre / Razón Social *</label>
                <input style={{ ...ui.input, borderColor: fieldErrors.name ? "#dc2626" : "#d1d5db" }} value={form.name} onChange={setField("name")} placeholder="Nombre del cliente" autoFocus disabled={saving} />
                {fieldErrors.name && <p style={fieldErrorStyle}>{fieldErrors.name}</p>}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={ui.fieldLabel}>RFC</label>
                  <input style={{ ...ui.input, fontFamily: "monospace" }} value={form.taxId} onChange={setField("taxId")} placeholder="XAXX010101000" maxLength={13} disabled={saving} />
                  {fieldErrors.taxId && <p style={fieldErrorStyle}>{fieldErrors.taxId}</p>}
                </div>
                <div>
                  <label style={ui.fieldLabel}>Teléfono *</label>
                  <input style={{ ...ui.input, borderColor: fieldErrors.phone ? "#dc2626" : "#d1d5db" }} value={form.phone} onChange={setField("phone")} placeholder="7710000000" maxLength={10} disabled={saving} />
                  {fieldErrors.phone && <p style={fieldErrorStyle}>{fieldErrors.phone}</p>}
                </div>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={ui.fieldLabel}>Correo electrónico</label>
                <input type="email" style={ui.input} value={form.email} onChange={setField("email")} placeholder="correo@dominio.com" disabled={saving} />
                {fieldErrors.email && <p style={fieldErrorStyle}>{fieldErrors.email}</p>}
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={ui.fieldLabel}>Dirección</label>
                <input style={ui.input} value={form.address} onChange={setField("address")} placeholder="Calle, número, colonia" disabled={saving} />
                {fieldErrors.address && <p style={fieldErrorStyle}>{fieldErrors.address}</p>}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={ui.fieldLabel}>Límite de crédito ($)</label>
                  <input type="text" inputMode="decimal" style={ui.input} value={form.creditLimit} onChange={setField("creditLimit")} placeholder="0.00" disabled={saving} />
                  {fieldErrors.creditLimit && <p style={fieldErrorStyle}>{fieldErrors.creditLimit}</p>}
                </div>
                <div>
                  <label style={ui.fieldLabel}>Código Postal fiscal</label>
                  <input inputMode="numeric" style={ui.input} value={form.zipCode} onChange={setField("zipCode")} placeholder="12345" maxLength={5} disabled={saving} />
                  {fieldErrors.zipCode && <p style={fieldErrorStyle}>{fieldErrors.zipCode}</p>}
                </div>
              </div>

              <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "12px 14px", backgroundColor: "#f8fafc", marginBottom: 8 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: "#1e3a8a", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>Datos CFDI 4.0</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={ui.fieldLabel}>Régimen Fiscal</label>
                    <select style={{ ...ui.input, cursor: "pointer" }} value={form.taxRegime} onChange={setField("taxRegime")} disabled={saving}>
                      <option value="">— Sin especificar —</option>
                      {TAX_REGIMES.map((r) => (<option key={r.value} value={r.value}>{r.label}</option>))}
                    </select>
                    {fieldErrors.taxRegime && <p style={fieldErrorStyle}>{fieldErrors.taxRegime}</p>}
                  </div>
                  <div>
                    <label style={ui.fieldLabel}>Uso de CFDI</label>
                    <select style={{ ...ui.input, cursor: "pointer" }} value={form.cfdiUse} onChange={setField("cfdiUse")} disabled={saving}>
                      <option value="">— Sin especificar —</option>
                      {CFDI_USES.map((u) => (<option key={u.value} value={u.value}>{u.label}</option>))}
                    </select>
                    {fieldErrors.cfdiUse && <p style={fieldErrorStyle}>{fieldErrors.cfdiUse}</p>}
                  </div>
                </div>
              </div>

              {formError && <p style={{ color: "#b91c1c", fontSize: 13, fontWeight: 600, marginTop: 4 }}>{formError}</p>}

              <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                <button type="button" disabled={saving} style={{ ...ui.ghostBtn, flex: 1, justifyContent: "center" }} onClick={closeForm}>Cancelar</button>
                <button type="submit" disabled={!isSaveEnabled()} style={{ ...ui.primaryBtn, flex: 1, justifyContent: "center", opacity: isSaveEnabled() ? 1 : 0.6, cursor: isSaveEnabled() ? "pointer" : "not-allowed" }}>
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