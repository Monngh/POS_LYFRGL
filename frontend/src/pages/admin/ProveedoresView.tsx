import React, { useEffect, useState, useCallback } from "react";
import { Plus, X, Edit2 } from "lucide-react";
import api from "../../services/api";
import { ui, type ViewProps, TableState, SectionHeader, Badge } from "./shared";

// =========================
// CONSTANTES Y REGEX 
// =========================
const NAME_REGEX = /^[a-zA-ZÀ-ÿÑñ][a-zA-ZÀ-ÿ0-9\s.-]*$/;
const ONLY_LETTERS_REGEX = /^[a-zA-ZÀ-ÿÑñ\s]*$/;
const RFC_REGEX = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const PHONE_REGEX = /^\d{10}$/;
const ZIP_REGEX = /^\d{5}$/;

// =========================
// TIPOS
// =========================
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

interface FieldErrors {
  name?: string;
  rfc?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  contactName?: string;
}

// =========================
// FUNCIONES UTILITARIAS
// =========================
const emptyErrors: FieldErrors = {};

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

// =========================
// VALIDADORES
// =========================
const validateName = (value: string): string | undefined => {
  const v = value.trim();

  if (!v) return "El nombre es obligatorio.";
  if (v.length < 3) return "Debe tener al menos 3 caracteres.";
  if (v.length > 100) return "No puede exceder 100 caracteres.";
  if (!/^[a-zA-ZÀ-ÿÑñ]/.test(v)) return "El nombre debe comenzar con una letra.";
  if (!NAME_REGEX.test(v)) return "Solo letras, números, espacios, puntos y guiones. No se permiten emojis.";

  return undefined;
};

const validateContactName = (value: string): string | undefined => {
  const v = value.trim();

  if (!v) return "El nombre de contacto es obligatorio.";
  if (v.length < 3) return "Debe tener al menos 3 caracteres.";
  if (!ONLY_LETTERS_REGEX.test(v)) return "Solo letras y espacios. No se permiten números, símbolos ni emojis.";

  return undefined;
};

const validateRFC = (value: string): string | undefined => {
  const v = value.trim();

  if (!v) return "El RFC es obligatorio.";
  if (v.length !== 12 && v.length !== 13) return "RFC debe tener 12 o 13 caracteres.";
  if (!RFC_REGEX.test(v)) return "Formato de RFC inválido.";

  return undefined;
};

const validateEmail = (value: string): string | undefined => {
  const v = value.trim().toLowerCase();

  if (!v) return "El correo es obligatorio.";
  if (v.length > 100) return "No puede exceder 100 caracteres.";
  if (!EMAIL_REGEX.test(v)) return "Correo electrónico inválido. Ejemplo: usuario@dominio.com";
  if (/[^\x00-\x7F]/.test(v)) return "El correo no debe contener caracteres especiales ni emojis.";

  return undefined;
};

const validatePhone = (value: string): string | undefined => {
  if (!value) return "El teléfono es obligatorio.";
  if (!PHONE_REGEX.test(value)) return "Debe contener exactamente 10 dígitos numéricos.";

  return undefined;
};

const validateAddress = (value: string): string | undefined => {
  const v = value.trim();

  if (!v) return "La dirección es obligatoria.";
  if (v.length < 5) return "Dirección muy corta.";
  if (v.length > 200) return "No puede exceder 200 caracteres.";

  return undefined;
};

const validateCity = (value: string): string | undefined => {
  const v = value.trim();

  if (!v) return "La ciudad es obligatoria.";
  if (v.length < 2) return "Ciudad muy corta.";
  if (!ONLY_LETTERS_REGEX.test(v)) return "Solo letras y espacios. No se permiten números, símbolos ni emojis.";

  return undefined;
};

const validateState = (value: string): string | undefined => {
  const v = value.trim();

  if (!v) return "El estado es obligatorio.";
  if (v.length < 2) return "Estado muy corto.";
  if (!ONLY_LETTERS_REGEX.test(v)) return "Solo letras y espacios. No se permiten números, símbolos ni emojis.";

  return undefined;
};

const validateZip = (value: string): string | undefined => {
  if (!value) return "El código postal es obligatorio.";
  if (!ZIP_REGEX.test(value)) return "Debe contener exactamente 5 dígitos numéricos.";

  return undefined;
};

// =========================
// COMPONENTE PRINCIPAL
// =========================
const ProveedoresView: React.FC<ViewProps> = ({ refreshToken }) => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [originalForm, setOriginalForm] = useState<FormData | null>(null);

  const isFormValid =
    !validateName(form.name) &&
    !validateContactName(form.contactName) &&
    !validateRFC(form.rfc) &&
    !validateEmail(form.email) &&
    !validatePhone(form.phone) &&
    !validateAddress(form.address) &&
    !validateCity(form.city) &&
    !validateState(form.state) &&
    !validateZip(form.zipCode);

  const hasFormChanged = (): boolean => {
    if (!originalForm) return true;
    return JSON.stringify(form) !== JSON.stringify(originalForm);
  };

  const isSaveEnabled = () => {
    if (saving) return false;
    if (!isFormValid) return false;
    if (editingId !== null && !hasFormChanged()) return false;
    return true;
  };

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

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setOriginalForm(null);
    setFormError(null);
    setModalOpen(true);
    setFieldErrors(emptyErrors);
    setTouched({});
  };

  const openEdit = (s: Supplier) => {
    const editForm = {
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
    };

    setEditingId(s.id);
    setForm(editForm);
    setOriginalForm(JSON.parse(JSON.stringify(editForm)));
    setFieldErrors({
      name: validateName(s.name),
      contactName: validateContactName(s.contactName || ""),
      rfc: validateRFC(s.rfc || ""),
      email: validateEmail(s.email || ""),
      phone: validatePhone(s.phone || ""),
      address: validateAddress(s.address || ""),
      city: validateCity(s.city || ""),
      state: validateState(s.state || ""),
      zipCode: validateZip(s.zipCode || "")
    });

    setTouched({
      name: true,
      contactName: true,
      rfc: true,
      email: true,
      phone: true,
      address: true,
      city: true,
      state: true,
      zipCode: true
    });

    setFormError(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setModalOpen(false);
    setEditingId(null);
    setForm(emptyForm());
    setOriginalForm(null);
    setFormError(null);
    setTouched({});
  };

  const handleSubmit = async () => {
    if (!isSaveEnabled()) return;

    setSaving(true);
    setFormError(null);

    try {
      const payload = {
        name: form.name.trim(),
        rfc: form.rfc.trim() || null,
        email: form.email.trim().toLowerCase() || null,
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

  // HANDLERS
  const handleName = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value;
    value = value.replace(/[^\w\s\u00C0-\u00FF.-]/g, '');

    if (value.length === 1 && !/^[a-zA-ZÀ-ÿÑñ]$/.test(value)) {
      return;
    }

    setForm(f => ({ ...f, name: value }));
    if (touched.name) {
      setFieldErrors(f => ({ ...f, name: validateName(value) }));
    }
  };

  const handleContactName = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value;
    value = value.replace(/[^a-zA-ZÀ-ÿÑñ\s]/g, '');
    setForm(f => ({ ...f, contactName: value }));
    if (touched.contactName) {
      setFieldErrors(f => ({ ...f, contactName: validateContactName(value) }));
    }
  };

  const handleRFC = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value
      .toUpperCase()
      .replace(/[^A-Z0-9Ñ&]/g, "")
      .slice(0, 13);

    setForm(f => ({ ...f, rfc: value }));
    if (touched.rfc) {
      setFieldErrors(f => ({ ...f, rfc: validateRFC(value) }));
    }
  };

  const handleEmail = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value;
    value = value.replace(/[^\w\s@.-]/g, '');
    setForm(f => ({ ...f, email: value }));
    if (touched.email) {
      setFieldErrors(f => ({ ...f, email: validateEmail(value) }));
    }
  };

  const handlePhone = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (!/^\d*$/.test(value)) return;

    const phone = value.slice(0, 10);
    setForm(f => ({ ...f, phone }));
    if (touched.phone) {
      setFieldErrors(f => ({ ...f, phone: validatePhone(phone) }));
    }
  };

  const handleAddress = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setForm(f => ({ ...f, address: value }));
    if (touched.address) {
      setFieldErrors(f => ({ ...f, address: validateAddress(value) }));
    }
  };

  const handleCity = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value;
    value = value.replace(/[^a-zA-ZÀ-ÿÑñ\s]/g, '');
    setForm(f => ({ ...f, city: value }));
    if (touched.city) {
      setFieldErrors(f => ({ ...f, city: validateCity(value) }));
    }
  };

  const handleState = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value;
    value = value.replace(/[^a-zA-ZÀ-ÿÑñ\s]/g, '');
    setForm(f => ({ ...f, state: value }));
    if (touched.state) {
      setFieldErrors(f => ({ ...f, state: validateState(value) }));
    }
  };

  const handleZip = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (!/^\d*$/.test(value)) return;

    const zip = value.slice(0, 5);
    setForm(f => ({ ...f, zipCode: zip }));
    if (touched.zipCode) {
      setFieldErrors(f => ({ ...f, zipCode: validateZip(zip) }));
    }
  };

  const handleBlur = (field: keyof FieldErrors) => {
    setTouched(prev => ({ ...prev, [field]: true }));

    let error: string | undefined;
    switch (field) {
      case 'name':
        error = validateName(form.name);
        break;
      case 'contactName':
        error = validateContactName(form.contactName);
        break;
      case 'rfc':
        error = validateRFC(form.rfc);
        break;
      case 'email':
        error = validateEmail(form.email);
        break;
      case 'phone':
        error = validatePhone(form.phone);
        break;
      case 'address':
        error = validateAddress(form.address);
        break;
      case 'city':
        error = validateCity(form.city);
        break;
      case 'state':
        error = validateState(form.state);
        break;
      case 'zipCode':
        error = validateZip(form.zipCode);
        break;
    }

    if (error) {
      setFieldErrors(prev => ({ ...prev, [field]: error }));
    }
  };

  useEffect(() => {
    loadSuppliers();
  }, [loadSuppliers]);

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

      <div style={ui.tableWrap}>
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
            {!loading && !error && suppliers.map((s) => (
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
                    <Edit2 size={13} style={{ marginRight: 4, verticalAlign: "middle" }} />
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
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ ...ui.modal, maxWidth: 550 }}>
            <div style={ui.modalHeader}>
              <span style={ui.modalTitle}>
                {editingId ? "Editar Proveedor" : "Nuevo Proveedor"}
              </span>
              <button
                onClick={closeModal}
                disabled={saving}
                style={{ background: "none", border: "none", cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.5 : 1 }}
              >
                <X size={18} color="#64748b" />
              </button>
            </div>

            <div style={ui.modalBody}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={ui.fieldLabel}>Nombre *</label>
                  <input
                    style={{ ...ui.input, borderColor: touched.name && fieldErrors.name ? "#dc2626" : "#d1d5db" }}
                    value={form.name}
                    onChange={handleName}
                    onBlur={() => handleBlur('name')}
                    placeholder="Razón social o nombre comercial (debe empezar con letra)"
                    autoFocus
                    disabled={saving}
                  />
                  {touched.name && fieldErrors.name && (
                    <span style={{ color: "#dc2626", fontSize: "12px", marginTop: "4px", display: "block" }}>
                      {fieldErrors.name}
                    </span>
                  )}
                </div>

                <div>
                  <label style={ui.fieldLabel}>RFC *</label>
                  <input
                    style={{ ...ui.input, borderColor: touched.rfc && fieldErrors.rfc ? "#dc2626" : "#d1d5db" }}
                    value={form.rfc}
                    onChange={handleRFC}
                    onBlur={() => handleBlur('rfc')}
                    placeholder="RFC del proveedor"
                    disabled={saving}
                  />
                  {touched.rfc && fieldErrors.rfc && (
                    <span style={{ color: "#dc2626", fontSize: "12px", marginTop: "4px", display: "block" }}>
                      {fieldErrors.rfc}
                    </span>
                  )}
                </div>

                <div>
                  <label style={ui.fieldLabel}>Persona de contacto *</label>
                  <input
                    style={{ ...ui.input, borderColor: touched.contactName && fieldErrors.contactName ? "#dc2626" : "#d1d5db" }}
                    value={form.contactName}
                    onChange={handleContactName}
                    onBlur={() => handleBlur('contactName')}
                    placeholder="Nombre del contacto (solo letras)"
                    disabled={saving}
                  />
                  {touched.contactName && fieldErrors.contactName && (
                    <span style={{ color: "#dc2626", fontSize: "12px", marginTop: "4px", display: "block" }}>
                      {fieldErrors.contactName}
                    </span>
                  )}
                </div>

                <div>
                  <label style={ui.fieldLabel}>Email *</label>
                  <input
                    style={{ ...ui.input, borderColor: touched.email && fieldErrors.email ? "#dc2626" : "#d1d5db" }}
                    type="email"
                    value={form.email}
                    onChange={handleEmail}
                    onBlur={() => handleBlur('email')}
                    placeholder="correo@proveedor.com"
                    disabled={saving}
                  />
                  {touched.email && fieldErrors.email && (
                    <span style={{ color: "#dc2626", fontSize: "12px", marginTop: "4px", display: "block" }}>
                      {fieldErrors.email}
                    </span>
                  )}
                </div>

                <div>
                  <label style={ui.fieldLabel}>Teléfono *</label>
                  <input
                    style={{ ...ui.input, borderColor: touched.phone && fieldErrors.phone ? "#dc2626" : "#d1d5db" }}
                    value={form.phone}
                    onChange={handlePhone}
                    onBlur={() => handleBlur('phone')}
                    placeholder="5512345678"
                    disabled={saving}
                  />
                  {touched.phone && fieldErrors.phone && (
                    <span style={{ color: "#dc2626", fontSize: "12px", marginTop: "4px", display: "block" }}>
                      {fieldErrors.phone}
                    </span>
                  )}
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={ui.fieldLabel}>Dirección *</label>
                  <input
                    style={{ ...ui.input, borderColor: touched.address && fieldErrors.address ? "#dc2626" : "#d1d5db" }}
                    value={form.address}
                    onChange={handleAddress}
                    onBlur={() => handleBlur('address')}
                    placeholder="Calle, número, colonia"
                    disabled={saving}
                  />
                  {touched.address && fieldErrors.address && (
                    <span style={{ color: "#dc2626", fontSize: "12px", marginTop: "4px", display: "block" }}>
                      {fieldErrors.address}
                    </span>
                  )}
                </div>

                <div>
                  <label style={ui.fieldLabel}>Ciudad *</label>
                  <input
                    style={{ ...ui.input, borderColor: touched.city && fieldErrors.city ? "#dc2626" : "#d1d5db" }}
                    value={form.city}
                    onChange={handleCity}
                    onBlur={() => handleBlur('city')}
                    placeholder="Ciudad (solo letras)"
                    disabled={saving}
                  />
                  {touched.city && fieldErrors.city && (
                    <span style={{ color: "#dc2626", fontSize: "12px", marginTop: "4px", display: "block" }}>
                      {fieldErrors.city}
                    </span>
                  )}
                </div>

                <div>
                  <label style={ui.fieldLabel}>Estado *</label>
                  <input
                    style={{ ...ui.input, borderColor: touched.state && fieldErrors.state ? "#dc2626" : "#d1d5db" }}
                    value={form.state}
                    onChange={handleState}
                    onBlur={() => handleBlur('state')}
                    placeholder="Estado (solo letras)"
                    disabled={saving}
                  />
                  {touched.state && fieldErrors.state && (
                    <span style={{ color: "#dc2626", fontSize: "12px", marginTop: "4px", display: "block" }}>
                      {fieldErrors.state}
                    </span>
                  )}
                </div>

                <div>
                  <label style={ui.fieldLabel}>C.P. *</label>
                  <input
                    style={{ ...ui.input, borderColor: touched.zipCode && fieldErrors.zipCode ? "#dc2626" : "#d1d5db" }}
                    value={form.zipCode}
                    onChange={handleZip}
                    onBlur={() => handleBlur('zipCode')}
                    placeholder="00000"
                    disabled={saving}
                  />
                  {touched.zipCode && fieldErrors.zipCode && (
                    <span style={{ color: "#dc2626", fontSize: "12px", marginTop: "4px", display: "block" }}>
                      {fieldErrors.zipCode}
                    </span>
                  )}
                </div>

                <div>
                  <label style={{ display: "block", marginBottom: "8px", fontSize: "12px", fontWeight: "600", color: "#1e3a8a" }}>
                    ESTATUS
                  </label>
                  <select
                    value={form.active ? "active" : "inactive"}
                    onChange={(e) => setForm({ ...form, active: e.target.value === "active" })}
                    disabled={saving}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      border: "1px solid #d1d5db",
                      borderRadius: "6px",
                      fontSize: "14px",
                      fontFamily: "system-ui",
                      backgroundColor: saving ? "#f3f4f6" : "white"
                    }}
                  >
                    <option value="active">Activo</option>
                    <option value="inactive">Inactivo</option>
                  </select>
                </div>
              </div>

              {formError && (
                <p style={{ color: "#b91c1c", fontSize: 13, fontWeight: 600, marginTop: 14 }}>
                  {formError}
                </p>
              )}

              <div style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 10,
                marginTop: 22,
              }}>
                <button
                  style={ui.ghostBtn}
                  onClick={closeModal}
                  disabled={saving}
                >
                  Cancelar
                </button>
                <button
                  style={{
                    ...ui.primaryBtn,
                    opacity: isSaveEnabled() ? 1 : 0.6,
                    cursor: isSaveEnabled() ? "pointer" : "not-allowed"
                  }}
                  onClick={handleSubmit}
                  disabled={!isSaveEnabled()}
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