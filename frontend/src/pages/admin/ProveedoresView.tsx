import React, { useEffect, useState, useCallback } from "react";
import { Plus, X, Edit2, Pencil, ChevronDown, ChevronUp } from "lucide-react";
import api from "../../services/api";
import {
  normalizeEmailInput,
  normalizeIntegerInput,
  normalizePhoneInput,
  normalizeRfcInput,
  validateEmail as validateEmailFormat,
  validatePhone as validatePhoneFormat,
  validateReference,
  validateRfc,
  validateSafeText,
} from "../../utils/formValidation";
import { ui, type ViewProps, TableState, SectionHeader, Badge, useMediaQuery, fmtDate } from "./shared";

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
// VALIDADORES MEJORADOS
// =========================
const validateName = (value: string): string | undefined => {
  return validateSafeText(value, "El nombre", { required: true, min: 3, max: 100 });
};

const validateContactName = (value: string): string | undefined => {
  return validateSafeText(value, "El nombre de contacto", { required: true, min: 3, max: 100 });
};

const validateRFC = (value: string): string | undefined => {
  return validateRfc(value, { required: true });
};

const validateEmail = (value: string): string | undefined => {
  if (value.trim().length > 100) return "No puede exceder 100 caracteres.";
  return validateEmailFormat(value, { required: true });
};

const validatePhone = (value: string): string | undefined => {
  return validatePhoneFormat(value, { required: true });
};

const validateAddress = (value: string): string | undefined => {
  const v = value.trim();

  if (!v) return "La dirección es obligatoria.";
  if (v.length < 5) return "Dirección muy corta.";
  if (v.length > 200) return "No puede exceder 200 caracteres.";
  const referenceError = validateReference(v, "La direccion", { required: true, max: 200 });
  if (referenceError) return referenceError;

  return undefined;
};

const validateCity = (value: string): string | undefined => {
  return validateSafeText(value, "La ciudad", { required: true, min: 2, max: 80 });
};

const validateState = (value: string): string | undefined => {
  return validateSafeText(value, "El estado", { required: true, min: 2, max: 80 });
};

const validateZip = (value: string): string | undefined => {
  if (!value) return "El código postal es obligatorio.";
  if (!/^\d{5}$/.test(value)) return "Debe contener exactamente 5 digitos numericos.";

  return undefined;
};

// =========================
// COMPONENTE PRINCIPAL
// =========================
const ProveedoresView: React.FC<ViewProps> = ({ refreshToken }) => {
  const isMobile = useMediaQuery("(max-width: 1024px)");
  const [expandedSuppliers, setExpandedSuppliers] = useState<Record<number, boolean>>({});

  const toggleExpandSupplier = (id: number) => {
    setExpandedSuppliers((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Estados
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  // Computed - Validación completa del formulario
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

  // =========================
  // CRUD
  // =========================
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
    setFormError(null);
    setModalOpen(true);
    setFieldErrors(emptyErrors);
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

    // Validar campos al abrir edición
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

    setFormError(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return; // No cerrar mientras se guarda
    setModalOpen(false);
    setEditingId(null);
    setForm(emptyForm());
    setFormError(null);
  };

  const handleSubmit = async () => {
    // Prevenir múltiples envíos
    if (saving) return;

    // Validar todo antes de enviar
    const errors = {
      name: validateName(form.name),
      contactName: validateContactName(form.contactName),
      rfc: validateRFC(form.rfc),
      email: validateEmail(form.email),
      phone: validatePhone(form.phone),
      address: validateAddress(form.address),
      city: validateCity(form.city),
      state: validateState(form.state),
      zipCode: validateZip(form.zipCode)
    };

    setFieldErrors(errors);

    // Verificar si hay errores
    const hasErrors = Object.values(errors).some(error => error !== undefined);
    if (hasErrors) {
      setFormError("Por favor, corrige los errores antes de guardar.");
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

  // =========================
  // HANDLERS MEJORADOS
  // =========================
  const handleName = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setForm(f => ({ ...f, name: value }));
    setFieldErrors(f => ({ ...f, name: validateName(value) }));
  };

  const handleContactName = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Solo permitir letras y espacios
    const filteredValue = value.replace(/[^a-zA-ZÀ-ÿÑñ\s]/g, '');
    setForm(f => ({ ...f, contactName: filteredValue }));
    setFieldErrors(f => ({ ...f, contactName: validateContactName(filteredValue) }));
  };

  const handleRFC = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = normalizeRfcInput(e.target.value).slice(0, 13);

    setForm(f => ({ ...f, rfc: value }));
    setFieldErrors(f => ({ ...f, rfc: validateRFC(value) }));
  };

  const handleEmail = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = normalizeEmailInput(e.target.value);
    setForm(f => ({ ...f, email: value }));
    setFieldErrors(f => ({ ...f, email: validateEmail(value) }));
  };

  const handlePhone = (e: React.ChangeEvent<HTMLInputElement>) => {
    const phone = normalizePhoneInput(e.target.value).slice(0, 20);
    setForm(f => ({ ...f, phone }));
    setFieldErrors(f => ({ ...f, phone: validatePhone(phone) }));
  };

  const handleAddress = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setForm(f => ({ ...f, address: value }));
    setFieldErrors(f => ({ ...f, address: validateAddress(value) }));
  };

  const handleCity = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Solo permitir letras y espacios
    const filteredValue = value.replace(/[^a-zA-ZÀ-ÿÑñ\s]/g, '');
    setForm(f => ({ ...f, city: filteredValue }));
    setFieldErrors(f => ({ ...f, city: validateCity(filteredValue) }));
  };

  const handleState = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Solo permitir letras y espacios
    const filteredValue = value.replace(/[^a-zA-ZÀ-ÿÑñ\s]/g, '');
    setForm(f => ({ ...f, state: filteredValue }));
    setFieldErrors(f => ({ ...f, state: validateState(filteredValue) }));
  };

  const handleZip = (e: React.ChangeEvent<HTMLInputElement>) => {
    const zip = normalizeIntegerInput(e.target.value).slice(0, 5);
    setForm(f => ({ ...f, zipCode: zip }));
    setFieldErrors(f => ({ ...f, zipCode: validateZip(zip) }));
  };

  const handleBlur = (field: keyof FieldErrors) => {
    // Validar el campo al perder el foco
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

  // =========================
  // RENDER
  // =========================
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

      {isMobile ? (
        /* ── Mobile / Tablet: Card-based layout ── */
        <div style={{ overflowY: "auto", maxHeight: "62vh", padding: "8px 16px" }}>
          {/* Header row mirroring the fields */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "1.2fr 1fr 1.6fr 1.6fr",
            padding: "12px 16px",
            fontWeight: 700,
            fontSize: 11,
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.4px",
          }}>
            <div>Contacto</div>
            <div>Teléfono</div>
            <div>Email</div>
            <div style={{ textAlign: "right", paddingRight: 8 }}>Acción</div>
          </div>

          {loading && (
            <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--text-faint)", fontSize: 13, fontWeight: 500 }}>
              Cargando información...
            </div>
          )}
          {!loading && error && (
            <div style={{ textAlign: "center", padding: "32px 16px", color: "#b91c1c", fontSize: 13, fontWeight: 500 }}>
              {error}
            </div>
          )}
          {!loading && !error && suppliers.length === 0 && (
            <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--text-faint)", fontSize: 13, fontWeight: 500 }}>
              No hay proveedores registrados.
            </div>
          )}

          {!loading &&
            !error &&
            suppliers.map((s) => {
              const isExpanded = expandedSuppliers[s.id];
              return (
                <div
                  key={s.id}
                  style={{
                    backgroundColor: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    marginBottom: 10,
                    boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
                    overflow: "hidden",
                  }}
                >
                  {/* Header: Nombre y Estatus */}
                  <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "8px 16px 6px 16px",
                    fontSize: 11,
                    fontWeight: 700,
                    color: "var(--text-muted)",
                    borderBottom: "1px solid var(--surface-3)",
                    backgroundColor: "var(--surface-2)",
                    letterSpacing: "0.2px",
                  }}>
                    <span>{s.name.toUpperCase()}</span>
                    <Badge tone={s.active ? "green" : "slate"}>
                      {s.active ? "Activo" : "Inactivo"}
                    </Badge>
                  </div>

                  {/* Fila principal */}
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "1.2fr 1fr 1.6fr 1.6fr",
                    padding: "12px 16px",
                    alignItems: "center",
                  }}>
                    {/* Contacto */}
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {s.contactName || "—"}
                    </div>

                    {/* Teléfono */}
                    <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                      {s.phone || "—"}
                    </div>

                    {/* Email */}
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {s.email || "—"}
                    </div>

                    {/* Botones de Acción */}
                    <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8 }}>
                      {/* Pencil/Editar */}
                      <button
                        onClick={() => openEdit(s)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: "#eff6ff",
                          border: "1px solid #bfdbfe",
                          borderRadius: 8,
                          width: 34,
                          height: 34,
                          cursor: "pointer",
                          color: "var(--accent-strong)",
                          padding: 0,
                        }}
                        className="active-tap"
                        title="Editar proveedor"
                      >
                        <Pencil size={14} />
                      </button>

                      {/* Chevron */}
                      <button
                        onClick={() => toggleExpandSupplier(s.id)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: "var(--surface)",
                          border: "1px solid var(--border-strong)",
                          borderRadius: 8,
                          width: 34,
                          height: 34,
                          cursor: "pointer",
                          color: "var(--text-muted)",
                          padding: 0,
                        }}
                        className="active-tap"
                      >
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                    </div>
                  </div>

                  {/* Detalle expandido */}
                  {isExpanded && (
                    <div style={{
                      padding: "16px",
                      margin: "0 16px 16px 16px",
                      backgroundColor: "var(--surface-2)",
                      borderRadius: "8px",
                      border: "1px solid var(--border)",
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                      gap: "16px",
                      textAlign: "left",
                    }}>
                      {/* Datos de Identificación */}
                      <div>
                        <h4 style={{ fontSize: 13, fontWeight: 800, color: "var(--text)", marginBottom: 10 }}>Identificación y Alta</h4>
                        <div style={supDetailRow}>
                          <span style={supDetailLabel}>RFC:</span>
                          <span style={{ ...supDetailValue, fontFamily: "monospace" }}>{s.rfc || "—"}</span>
                        </div>
                        <div style={supDetailRow}>
                          <span style={supDetailLabel}>Contacto:</span>
                          <span style={supDetailValue}>{s.contactName || "—"}</span>
                        </div>
                        <div style={supDetailRow}>
                          <span style={supDetailLabel}>F. Alta:</span>
                          <span style={supDetailValue}>{fmtDate(s.createdAt)}</span>
                        </div>
                      </div>

                      {/* Dirección y Ubicación */}
                      <div>
                        <h4 style={{ fontSize: 13, fontWeight: 800, color: "var(--text)", marginBottom: 10 }}>Dirección y Ubicación</h4>
                        <div style={supDetailRow}>
                          <span style={supDetailLabel}>Dirección:</span>
                          <span style={supDetailValue}>{s.address || "—"}</span>
                        </div>
                        <div style={supDetailRow}>
                          <span style={supDetailLabel}>Ciudad/Edo:</span>
                          <span style={supDetailValue}>
                            {s.city ? `${s.city}${s.state ? `, ${s.state}` : ""}` : "—"}
                          </span>
                        </div>
                        <div style={supDetailRow}>
                          <span style={supDetailLabel}>C. Postal:</span>
                          <span style={supDetailValue}>{s.zipCode || "—"}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      ) : (
        /* ── Desktop: Standard table ── */
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
              {!loading && !error && suppliers.map((s) => (
                <tr key={s.id}>
                  <td style={{ ...ui.td, fontWeight: 700, color: "var(--text)" }}>{s.name}</td>
                  <td style={{ ...ui.td, color: "var(--text-secondary)" }}>{s.rfc || "—"}</td>
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
      )}

      {/* Modal */}
      {modalOpen && (
        <div
          style={ui.overlay}
          onClick={(e) => {
            //el modal SOLO se cierra con los botones de X o Cancelar
            e.stopPropagation();
          }}
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
                {/* Nombre */}
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={ui.fieldLabel}>Nombre *</label>
                  <input
                    style={{ ...ui.input, borderColor: fieldErrors.name ? "#dc2626" : "#d1d5db" }}
                    value={form.name}
                    onChange={handleName}
                    onBlur={() => handleBlur('name')}
                    placeholder="Razón social o nombre comercial"
                    autoFocus
                    disabled={saving}
                  />
                  {fieldErrors.name && (
                    <span style={{ color: "#dc2626", fontSize: "12px", marginTop: "4px", display: "block" }}>
                      {fieldErrors.name}
                    </span>
                  )}
                </div>

                {/* RFC */}
                <div>
                  <label style={ui.fieldLabel}>RFC *</label>
                  <input
                    style={{ ...ui.input, borderColor: fieldErrors.rfc ? "#dc2626" : "#d1d5db" }}
                    value={form.rfc}
                    onChange={handleRFC}
                    onBlur={() => handleBlur('rfc')}
                    placeholder="RFC del proveedor"
                    disabled={saving}
                  />
                  {fieldErrors.rfc && (
                    <span style={{ color: "#dc2626", fontSize: "12px", marginTop: "4px", display: "block" }}>
                      {fieldErrors.rfc}
                    </span>
                  )}
                </div>

                {/* Persona de contacto */}
                <div>
                  <label style={ui.fieldLabel}>Persona de contacto *</label>
                  <input
                    style={{ ...ui.input, borderColor: fieldErrors.contactName ? "#dc2626" : "#d1d5db" }}
                    value={form.contactName}
                    onChange={handleContactName}
                    onBlur={() => handleBlur('contactName')}
                    placeholder="Nombre del contacto"
                    disabled={saving}
                  />
                  {fieldErrors.contactName && (
                    <span style={{ color: "#dc2626", fontSize: "12px", marginTop: "4px", display: "block" }}>
                      {fieldErrors.contactName}
                    </span>
                  )}
                </div>

                {/* Email */}
                <div>
                  <label style={ui.fieldLabel}>Email *</label>
                  <input
                    style={{ ...ui.input, borderColor: fieldErrors.email ? "#dc2626" : "#d1d5db" }}
                    type="email"
                    value={form.email}
                    onChange={handleEmail}
                    onBlur={() => handleBlur('email')}
                    placeholder="correo@proveedor.com"
                    disabled={saving}
                  />
                  {fieldErrors.email && (
                    <span style={{ color: "#dc2626", fontSize: "12px", marginTop: "4px", display: "block" }}>
                      {fieldErrors.email}
                    </span>
                  )}
                </div>

                {/* Teléfono */}
                <div>
                  <label style={ui.fieldLabel}>Teléfono (con LADA) *</label>
                  <input
                    style={{ ...ui.input, borderColor: fieldErrors.phone ? "#dc2626" : "#d1d5db" }}
                    value={form.phone}
                    onChange={handlePhone}
                    onBlur={() => handleBlur('phone')}
                    placeholder="Ej. 5512345678 o 525512345678"
                    disabled={saving}
                  />
                  {fieldErrors.phone && (
                    <span style={{ color: "#dc2626", fontSize: "12px", marginTop: "4px", display: "block" }}>
                      {fieldErrors.phone}
                    </span>
                  )}
                </div>

                {/* Dirección */}
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={ui.fieldLabel}>Dirección *</label>
                  <input
                    style={{ ...ui.input, borderColor: fieldErrors.address ? "#dc2626" : "#d1d5db" }}
                    value={form.address}
                    onChange={handleAddress}
                    onBlur={() => handleBlur('address')}
                    placeholder="Calle, número, colonia"
                    disabled={saving}
                  />
                  {fieldErrors.address && (
                    <span style={{ color: "#dc2626", fontSize: "12px", marginTop: "4px", display: "block" }}>
                      {fieldErrors.address}
                    </span>
                  )}
                </div>

                {/* Ciudad */}
                <div>
                  <label style={ui.fieldLabel}>Ciudad *</label>
                  <input
                    style={{ ...ui.input, borderColor: fieldErrors.city ? "#dc2626" : "#d1d5db" }}
                    value={form.city}
                    onChange={handleCity}
                    onBlur={() => handleBlur('city')}
                    placeholder="Ciudad"
                    disabled={saving}
                  />
                  {fieldErrors.city && (
                    <span style={{ color: "#dc2626", fontSize: "12px", marginTop: "4px", display: "block" }}>
                      {fieldErrors.city}
                    </span>
                  )}
                </div>

                {/* Estado */}
                <div>
                  <label style={ui.fieldLabel}>Estado *</label>
                  <input
                    style={{ ...ui.input, borderColor: fieldErrors.state ? "#dc2626" : "#d1d5db" }}
                    value={form.state}
                    onChange={handleState}
                    onBlur={() => handleBlur('state')}
                    placeholder="Estado"
                    disabled={saving}
                  />
                  {fieldErrors.state && (
                    <span style={{ color: "#dc2626", fontSize: "12px", marginTop: "4px", display: "block" }}>
                      {fieldErrors.state}
                    </span>
                  )}
                </div>

                {/* Código Postal */}
                <div>
                  <label style={ui.fieldLabel}>C.P. *</label>
                  <input
                    style={{ ...ui.input, borderColor: fieldErrors.zipCode ? "#dc2626" : "#d1d5db" }}
                    value={form.zipCode}
                    onChange={handleZip}
                    onBlur={() => handleBlur('zipCode')}
                    placeholder="00000"
                    disabled={saving}
                  />
                  {fieldErrors.zipCode && (
                    <span style={{ color: "#dc2626", fontSize: "12px", marginTop: "4px", display: "block" }}>
                      {fieldErrors.zipCode}
                    </span>
                  )}
                </div>

                {/* Estatus */}
                <div>
                  <label style={{ display: "block", marginBottom: "8px", fontSize: "12px", fontWeight: "600", color: "var(--accent-strong)" }}>
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
                    opacity: saving ? 0.6 : 1,
                    cursor: saving ? "not-allowed" : "pointer"
                  }}
                  onClick={handleSubmit}
                  disabled={saving || !isFormValid}
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

const supDetailRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-start",
  alignItems: "center",
  gap: "8px",
  fontSize: 13,
  marginBottom: 6,
};

const supDetailLabel: React.CSSProperties = {
  fontWeight: 700,
  color: "var(--text-muted)",
  minWidth: "95px",
  display: "inline-block",
};

const supDetailValue: React.CSSProperties = {
  fontWeight: 600,
  color: "var(--text-secondary)",
};

export default ProveedoresView;

