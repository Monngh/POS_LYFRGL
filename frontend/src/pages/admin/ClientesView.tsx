import React, { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Pencil, Plus } from "lucide-react";
import api from "../../services/api";
import { useAdminData } from "../../hooks";
import { DataTable, ActionModal } from "../../components/common";
import type { Column } from "../../components/common";
import {
  collectRoundedDecimalMessages,
  DECIMAL_INPUT_REGEX,
  getDecimalValidationValue,
  handleDecimalInputChange,
  validateDecimalField,
} from "../../utils/decimalInput";
import {
  ui,
  type ViewProps,
  Toolbar,
  SearchInput,
  SectionHeader,
  money,
  fmtDate,
  useMediaQuery
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

type CustomerPayload = {
  name: string;
  taxId?: string;
  email?: string;
  phone?: string;
  address?: string;
  creditLimit: number;
  zipCode?: string;
  taxRegime?: string;
  cfdiUse?: string;
};

const CUSTOMER_NAME_PATTERN = /^[A-Za-z0-9À-ſ\s.,'&-]+$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[0-9\s()+-]+$/;
const RFC_PATTERN = /^([A-ZÑ&]{3,4})\d{6}([A-Z0-9]{3})$/;
const ADDRESS_PATTERN = /^[A-Za-z0-9À-ſ\s.,#\-\/]+$/;
const ZIP_CODE_PATTERN = /^\d{5}$/;

const fieldErrorStyle: React.CSSProperties = {
  color: "#b91c1c",
  fontSize: 12,
  fontWeight: 600,
  marginTop: 5,
};

const normalizeSpaces = (value: string) => value.trim().replace(/\s+/g, " ");

const validateCustomerForm = (form: FormState): {
  errors: FieldErrors;
  payload: CustomerPayload | null;
  roundingMessages: string[];
} => {
  const errors: FieldErrors = {};
  const roundingMessages: string[] = [];

  const name = normalizeSpaces(form.name);
  if (!name) {
    errors.name = "El nombre del cliente es requerido.";
  } else if (name.length < 2) {
    errors.name = "El nombre debe tener al menos 2 caracteres.";
  } else if (name.length > 100) {
    errors.name = "El nombre no puede superar 100 caracteres.";
  } else if (!CUSTOMER_NAME_PATTERN.test(name)) {
    errors.name = "El nombre contiene caracteres no permitidos.";
  }

  const taxId = form.taxId.trim().toUpperCase().replace(/\s+/g, "");
  if (taxId && !RFC_PATTERN.test(taxId)) {
    errors.taxId = "El RFC debe tener formato valido de 12 o 13 caracteres.";
  }

  const email = form.email.trim().toLowerCase();
  if (email && (!EMAIL_PATTERN.test(email) || /\s/.test(email))) {
    errors.email = "El correo no tiene un formato valido.";
  }

  const phone = normalizeSpaces(form.phone);
  if (phone) {
    const digits = phone.replace(/\D/g, "");
    if (!PHONE_PATTERN.test(phone)) {
      errors.phone = "El telefono solo puede contener numeros, espacios, +, - y parentesis.";
    } else if (digits.length < 10 || digits.length > 15) {
      errors.phone = "El telefono debe tener entre 10 y 15 digitos.";
    }
  }

  const address = normalizeSpaces(form.address);
  if (address) {
    if (address.length > 200) {
      errors.address = "La direccion no puede superar 200 caracteres.";
    } else if (!ADDRESS_PATTERN.test(address)) {
      errors.address = "La direccion contiene caracteres no permitidos.";
    }
  }

  const creditLimitText = form.creditLimit.trim();
  const creditLimitValidation = validateDecimalField(creditLimitText || "0", "El limite de credito", {
    invalidMessage: "El limite de credito debe ser numerico con maximo 3 decimales.",
  });
  const creditLimitValue = getDecimalValidationValue(creditLimitValidation);
  if (!creditLimitValidation.ok) {
    errors.creditLimit = creditLimitValidation.error;
  } else {
    roundingMessages.push(...collectRoundedDecimalMessages([creditLimitValue]));
  }

  const zipCode = form.zipCode.trim();
  if (zipCode && !ZIP_CODE_PATTERN.test(zipCode)) {
    errors.zipCode = "El codigo postal debe tener exactamente 5 digitos.";
  }

  const taxRegime = form.taxRegime.trim();
  if (taxRegime && !TAX_REGIMES.some((r) => r.value === taxRegime)) {
    errors.taxRegime = "Seleccione un regimen fiscal valido.";
  }

  const cfdiUse = form.cfdiUse.trim();
  if (cfdiUse && !CFDI_USES.some((u) => u.value === cfdiUse)) {
    errors.cfdiUse = "Seleccione un uso de CFDI valido.";
  }

  if (Object.keys(errors).length > 0) {
    return { errors, payload: null, roundingMessages: [] };
  }

  return {
    errors,
    payload: {
      name,
      taxId: taxId || undefined,
      email: email || undefined,
      phone: phone || undefined,
      address: address || undefined,
      creditLimit: creditLimitValue?.value ?? 0,
      zipCode: zipCode || undefined,
      taxRegime: taxRegime || undefined,
      cfdiUse: cfdiUse || undefined,
    },
    roundingMessages,
  };
};

const cliDetailRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-start",
  alignItems: "center",
  gap: "8px",
  fontSize: 13,
  marginBottom: 6,
};

const cliDetailLabel: React.CSSProperties = {
  fontWeight: 700,
  color: "var(--text-muted)",
  minWidth: "95px",
  display: "inline-block",
};

const cliDetailValue: React.CSSProperties = {
  fontWeight: 600,
  color: "var(--text-secondary)",
};

const ClientesView: React.FC<ViewProps> = ({ refreshToken }) => {
  const isMobile = useMediaQuery("(max-width: 1024px)");
  const [expandedCustomers, setExpandedCustomers] = useState<Record<number, boolean>>({});

  const toggleExpandCustomer = (id: number) => {
    setExpandedCustomers((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data, loading, error, refetch } = useAdminData<{ customers: CustomerRow[] }>(
    "/api/admin/customers",
    { params: debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {} }
  );
  const rows = data?.customers ?? [];

  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    refetch();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshToken]);

  const openCreate = () => {
    setForm({ ...emptyForm });
    setEditingId(null);
    setFormError(null);
    setFieldErrors({});
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
    setFieldErrors({});
    setShowForm(true);
  };

  const closeForm = () => {
    if (saving) return;
    setShowForm(false);
    setEditingId(null);
    setFormError(null);
    setFieldErrors({});
  };

  const updateFormField = (k: keyof typeof emptyForm, value: string) => {
    const nextValue = k === "taxId" ? value.toUpperCase().replace(/\s+/g, "") : value;
    const nextForm = { ...form, [k]: nextValue };
    const validation = validateCustomerForm(nextForm);
    setForm(nextForm);
    setFormError(null);
    setFieldErrors((prev) => {
      const next = { ...prev };
      if (validation.errors[k]) next[k] = validation.errors[k];
      else delete next[k];
      return next;
    });
  };

  const set =
    (k: keyof typeof emptyForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      updateFormField(k, e.target.value);

  const setCreditLimit = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value.trim();
    if (rawValue && !DECIMAL_INPUT_REGEX.test(rawValue)) {
      setFieldErrors((prev) => ({
        ...prev,
        creditLimit: "El limite de credito debe ser numerico con maximo 3 decimales.",
      }));
      return;
    }
    handleDecimalInputChange(rawValue, (nextValue) => updateFormField("creditLimit", nextValue));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    const validation = validateCustomerForm(form);
    if (!validation.payload) {
      setFieldErrors(validation.errors);
      setFormError("Revisa los campos marcados antes de guardar.");
      return;
    }
    if (!form.name.trim()) {
      setFormError("El nombre / razón social es obligatorio.");
      return;
    }
    setSaving(true);
    setFormError(null);
    setFieldErrors({});
    try {
      const payload = validation.payload;
      if (validation.roundingMessages.length > 0) {
        alert(validation.roundingMessages.join("\n"));
      }

      if (editingId !== null) {
        await api.put(`/api/admin/customers/${editingId}`, payload);
      } else {
        await api.post("/api/admin/customers", payload);
      }

      setShowForm(false);
      setForm({ ...emptyForm });
      setEditingId(null);
      setFieldErrors({});
      await refetch();
    } catch (err: any) {
      setFormError(err.response?.data?.message || "No se pudo guardar el cliente.");
    } finally {
      setSaving(false);
    }
  };

  const columns: Column<CustomerRow>[] = [
    {
      key: "name",
      header: "Nombre / Razón Social",
      render: (c) => (
        <span style={{ fontWeight: 700, color: "var(--text)", whiteSpace: "normal" }}>{c.name}</span>
      ),
    },
    {
      key: "taxId",
      header: "RFC",
      render: (c) => (
        <span style={{ color: "var(--text-muted)", fontFamily: "monospace", fontSize: 12 }}>{c.taxId || "—"}</span>
      ),
    },
    {
      key: "cfdi",
      header: "CP · Régimen · Uso CFDI",
      render: (c) => (
        c.zipCode || c.taxRegime || c.cfdiUse ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 1, color: "#475569", fontSize: 12, whiteSpace: "normal" }}>
            {c.zipCode && <span>CP: {c.zipCode}</span>}
            {c.taxRegime && <span>Rég: {c.taxRegime}</span>}
            {c.cfdiUse && <span>CFDI: {c.cfdiUse}</span>}
          </div>
        ) : (
          <span style={{ color: "#cbd5e1" }}>—</span>
        )
      ),
    },
    {
      key: "email",
      header: "Contacto",
      render: (c) => (
        <div style={{ whiteSpace: "normal" }}>
          <div>{c.email || "—"}</div>
          <div style={{ fontSize: 11, color: "var(--text-faint)" }}>{c.phone || ""}</div>
        </div>
      ),
    },
    {
      key: "creditLimit",
      header: "Crédito",
      align: "right",
      render: (c) => <>{money(c.creditLimit)}</>,
    },
    {
      key: "balance",
      header: "Saldo",
      align: "right",
      render: (c) => (
        <span style={{ fontWeight: 700, color: c.balance > 0 ? "#b91c1c" : "#334155" }}>
          {money(c.balance)}
        </span>
      ),
    },
    {
      key: "salesCount",
      header: "Compras",
      align: "center",
      render: (c) => <span style={{ fontWeight: 700 }}>{c.salesCount}</span>,
    },
    {
      key: "createdAt",
      header: "Alta",
      render: (c) => <span style={{ color: "var(--text-muted)" }}>{fmtDate(c.createdAt)}</span>,
    },
    {
      key: "edit",
      header: "",
      align: "center",
      render: (c) => (
        <button
          onClick={() => openEdit(c)}
          style={{ background: "none", border: "none", cursor: "pointer", padding: "4px 6px", borderRadius: 4, color: "var(--accent-strong)" }}
          title="Editar cliente"
        >
          <Pencil size={14} />
        </button>
      ),
    },
  ];

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
        <span style={{ marginLeft: "auto", fontSize: 13, color: "var(--text-muted)", fontWeight: 600 }}>
          {rows.length} cliente{rows.length === 1 ? "" : "s"}
        </span>
      </Toolbar>

      {isMobile ? (
        /* ── Mobile / Tablet: Card-based layout ── */
        <div style={{ overflowY: "auto", maxHeight: "62vh", padding: "8px 16px" }}>
          {/* Header row mirroring the fields */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "1.2fr 1fr 2fr 1.6fr",
            padding: "12px 16px",
            fontWeight: 700,
            fontSize: 11,
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.4px",
          }}>
            <div>Saldo</div>
            <div style={{ textAlign: "center" }}>Compras</div>
            <div>Contacto</div>
            <div style={{ textAlign: "right", paddingRight: 8 }}>Acción</div>
          </div>

          {loading && (
            <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--text-faint)", fontSize: 13, fontWeight: 500 }}>
              Cargando información...
            </div>
          )}
          {!loading && rows.length === 0 && (
            <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--text-faint)", fontSize: 13, fontWeight: 500 }}>
              No hay clientes registrados.
            </div>
          )}

          {!loading &&
            rows.map((c) => {
              const isExpanded = expandedCustomers[c.id];
              return (
                <div
                  key={c.id}
                  style={{
                    backgroundColor: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    marginBottom: 10,
                    boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
                    overflow: "hidden",
                  }}
                >
                  {/* Header: Nombre y RFC */}
                  <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "8px 16px 6px 16px",
                    fontSize: 11,
                    fontWeight: 700,
                    color: "var(--text-muted)",
                    borderBottom: "1px solid #f1f5f9",
                    backgroundColor: "var(--surface-2)",
                    letterSpacing: "0.2px",
                  }}>
                    <span>{c.name.toUpperCase()}</span>
                    <span style={{ fontFamily: "monospace" }}>{c.taxId || "SIN RFC"}</span>
                  </div>

                  {/* Fila principal */}
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "1.2fr 1fr 2fr 1.6fr",
                    padding: "12px 16px",
                    alignItems: "center",
                  }}>
                    {/* Saldo */}
                    <div style={{ fontSize: 13, fontWeight: 700, color: c.balance > 0 ? "#b91c1c" : "#334155" }}>
                      {money(c.balance)}
                    </div>

                    {/* Compras */}
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", textAlign: "center" }}>
                      {c.salesCount}
                    </div>

                    {/* Contacto */}
                    <div style={{ fontSize: 12, color: "#475569", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {c.phone || c.email || "—"}
                    </div>

                    {/* Botones de Acción */}
                    <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8 }}>
                      {/* Pencil/Editar */}
                      <button
                        onClick={() => openEdit(c)}
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
                        title="Editar cliente"
                      >
                        <Pencil size={14} />
                      </button>

                      {/* Chevron */}
                      <button
                        onClick={() => toggleExpandCustomer(c.id)}
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
                      {/* Datos Fiscales */}
                      <div>
                        <h4 style={{ fontSize: 13, fontWeight: 800, color: "var(--text)", marginBottom: 10 }}>Datos CFDI</h4>
                        <div style={cliDetailRow}>
                          <span style={cliDetailLabel}>RFC:</span>
                          <span style={{ ...cliDetailValue, fontFamily: "monospace" }}>{c.taxId || "—"}</span>
                        </div>
                        <div style={cliDetailRow}>
                          <span style={cliDetailLabel}>C. Postal:</span>
                          <span style={cliDetailValue}>{c.zipCode || "—"}</span>
                        </div>
                        <div style={cliDetailRow}>
                          <span style={cliDetailLabel}>Régimen:</span>
                          <span style={cliDetailValue}>{c.taxRegime || "—"}</span>
                        </div>
                        <div style={cliDetailRow}>
                          <span style={cliDetailLabel}>Uso CFDI:</span>
                          <span style={cliDetailValue}>{c.cfdiUse || "—"}</span>
                        </div>
                      </div>

                      {/* Información de Contacto */}
                      <div>
                        <h4 style={{ fontSize: 13, fontWeight: 800, color: "var(--text)", marginBottom: 10 }}>Contacto y Alta</h4>
                        <div style={cliDetailRow}>
                          <span style={cliDetailLabel}>Correo:</span>
                          <span style={cliDetailValue}>{c.email || "—"}</span>
                        </div>
                        <div style={cliDetailRow}>
                          <span style={cliDetailLabel}>Teléfono:</span>
                          <span style={cliDetailValue}>{c.phone || "—"}</span>
                        </div>
                        <div style={cliDetailRow}>
                          <span style={cliDetailLabel}>Dirección:</span>
                          <span style={cliDetailValue}>{c.address || "—"}</span>
                        </div>
                        <div style={cliDetailRow}>
                          <span style={cliDetailLabel}>F. Alta:</span>
                          <span style={cliDetailValue}>{fmtDate(c.createdAt)}</span>
                        </div>
                      </div>

                      {/* Límites de Crédito */}
                      <div>
                        <h4 style={{ fontSize: 13, fontWeight: 800, color: "var(--text)", marginBottom: 10 }}>Crédito y Historial</h4>
                        <div style={cliDetailRow}>
                          <span style={cliDetailLabel}>Límite Crédito:</span>
                          <span style={cliDetailValue}>{money(c.creditLimit)}</span>
                        </div>
                        <div style={cliDetailRow}>
                          <span style={cliDetailLabel}>Saldo Actual:</span>
                          <span style={{ ...cliDetailValue, color: c.balance > 0 ? "#b91c1c" : "#334155" }}>{money(c.balance)}</span>
                        </div>
                        <div style={cliDetailRow}>
                          <span style={cliDetailLabel}>Compras:</span>
                          <span style={cliDetailValue}>{c.salesCount} compras</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      ) : (
        <div className="table-sticky-head">
          <DataTable
            columns={columns}
            data={rows}
            loading={loading}
            error={error}
            keyExtractor={(c) => c.id}
          />
        </div>
      )}

      <ActionModal
        isOpen={showForm}
        onClose={closeForm}
        title={editingId !== null ? "Editar cliente" : "Registrar nuevo cliente"}
        size="md"
      >
        <form onSubmit={submit}>

          {/* Nombre */}
          <div style={{ marginBottom: 14 }}>
            <label style={ui.fieldLabel}>Nombre / Razón Social *</label>
            <input style={ui.input} value={form.name} onChange={set("name")} placeholder="Nombre del cliente" autoFocus />
            {fieldErrors.name && <p style={fieldErrorStyle}>{fieldErrors.name}</p>}
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
              {fieldErrors.taxId && <p style={fieldErrorStyle}>{fieldErrors.taxId}</p>}
            </div>
            <div>
              <label style={ui.fieldLabel}>Teléfono</label>
              <input style={ui.input} value={form.phone} onChange={set("phone")} placeholder="771 000 0000" />
              {fieldErrors.phone && <p style={fieldErrorStyle}>{fieldErrors.phone}</p>}
            </div>
          </div>

          {/* Email + Dirección */}
          <div style={{ marginBottom: 14 }}>
            <label style={ui.fieldLabel}>Correo electrónico</label>
            <input type="email" style={ui.input} value={form.email} onChange={set("email")} placeholder="correo@dominio.com" />
            {fieldErrors.email && <p style={fieldErrorStyle}>{fieldErrors.email}</p>}
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={ui.fieldLabel}>Dirección</label>
            <input style={ui.input} value={form.address} onChange={set("address")} placeholder="Calle, número, colonia" />
            {fieldErrors.address && <p style={fieldErrorStyle}>{fieldErrors.address}</p>}
          </div>

          {/* Límite crédito + CP */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
            <div>
              <label style={ui.fieldLabel}>Límite de crédito ($)</label>
              <input type="text" inputMode="decimal" style={ui.input} value={form.creditLimit} onChange={setCreditLimit} placeholder="0.00" />
              {fieldErrors.creditLimit && <p style={fieldErrorStyle}>{fieldErrors.creditLimit}</p>}
            </div>
            <div>
              <label style={ui.fieldLabel}>Código Postal fiscal</label>
              <input
                inputMode="numeric"
                style={ui.input}
                value={form.zipCode}
                onChange={set("zipCode")}
                placeholder="12345"
                maxLength={5}
              />
              {fieldErrors.zipCode && <p style={fieldErrorStyle}>{fieldErrors.zipCode}</p>}
            </div>
          </div>

          {/* Sección CFDI */}
          <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "12px 14px", backgroundColor: "var(--surface-2)", marginBottom: 8 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: "var(--accent-strong)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>
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
                {fieldErrors.taxRegime && <p style={fieldErrorStyle}>{fieldErrors.taxRegime}</p>}
              </div>
              <div>
                <label style={ui.fieldLabel}>Uso de CFDI</label>
                <select style={{ ...ui.input, cursor: "pointer" }} value={form.cfdiUse} onChange={set("cfdiUse")}>
                  <option value="">— Sin especificar —</option>
                  {CFDI_USES.map((u) => (
                    <option key={u.value} value={u.value}>{u.label}</option>
                  ))}
                </select>
                {fieldErrors.cfdiUse && <p style={fieldErrorStyle}>{fieldErrors.cfdiUse}</p>}
              </div>
            </div>
          </div>

          {formError && (
            <p style={{ color: "#b91c1c", fontSize: 13, fontWeight: 600, marginTop: 4 }}>{formError}</p>
          )}

          <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
            <button type="button" disabled={saving} style={{ ...ui.ghostBtn, flex: 1, justifyContent: "center" }} onClick={closeForm}>
              Cancelar
            </button>
            <button type="submit" disabled={saving} style={{ ...ui.primaryBtn, flex: 1, justifyContent: "center" }}>
              {saving ? "Guardando..." : editingId !== null ? "Actualizar cliente" : "Guardar cliente"}
            </button>
          </div>
        </form>
      </ActionModal>
    </div>
  );
};

export default ClientesView;
