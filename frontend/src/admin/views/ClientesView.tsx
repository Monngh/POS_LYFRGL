import React, { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Pencil, Phone, Plus } from "lucide-react";
import api from "../../shared/services/api";
import { useAdminData } from "../../shared/hooks";
import { DataTable, ActionModal } from "../../shared/ui";
import type { Column } from "../../shared/ui";
import { useToast } from "../../shared/context/ToastContext";
import { PhoneField } from "../components/PhoneField";
import {
  DEFAULT_PHONE_COUNTRY_ISO,
  getCountryCodeByIso,
  normalizeLocalPhone,
  phoneToAdminFormValue,
  validateLocalPhone,
} from "../utils/phone";
import {
  ui,
  type ViewProps,
  Toolbar,
  SearchInput,
  SectionHeader,
  money,
  fmtDate,
  useMediaQuery,
  usePagination,
  Pagination,
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
  phoneCountryIso: DEFAULT_PHONE_COUNTRY_ISO,
  address: "",
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
  phoneCountryCode?: string;
  address?: string;
  zipCode?: string;
  taxRegime?: string;
  cfdiUse?: string;
};

const CUSTOMER_NAME_PATTERN = /^[A-Za-z0-9À-ſ\s.,'&-]+$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RFC_PATTERN = /^([A-ZÑ&]{3,4})\d{6}([A-Z0-9]{3})$/;
const ADDRESS_PATTERN = /^[A-Za-z0-9À-ſ\s.,#\-\/]+$/;
const ZIP_CODE_PATTERN = /^\d{5}$/;

const fieldErrorStyle: React.CSSProperties = {
  color: "var(--color-danger)",
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

  const phoneCountry = getCountryCodeByIso(form.phoneCountryIso);
  const phone = normalizeLocalPhone(form.phone, phoneCountry.code);
  const phoneError = validateLocalPhone(phone, phoneCountry.code, { required: false });
  if (phoneError) errors.phone = phoneError;

  const address = normalizeSpaces(form.address);
  if (address) {
    if (address.length > 200) {
      errors.address = "La direccion no puede superar 200 caracteres.";
    } else if (!ADDRESS_PATTERN.test(address)) {
      errors.address = "La direccion contiene caracteres no permitidos.";
    }
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
      phoneCountryCode: phone ? phoneCountry.code : undefined,
      address: address || undefined,
      zipCode: zipCode || undefined,
      taxRegime: taxRegime || undefined,
      cfdiUse: cfdiUse || undefined,
    },
    roundingMessages,
  };
};

const cliDetailRow: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  justifyContent: "flex-start",
  alignItems: "flex-start",
  gap: "2px",
  fontSize: 13,
  marginBottom: 8,
};

const cliDetailLabel: React.CSSProperties = {
  flexShrink: 0,
  fontWeight: 700,
  color: "var(--text-muted)",
  display: "block",
};

const cliDetailValue: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  overflowWrap: "anywhere",
  fontWeight: 600,
  color: "var(--text-secondary)",
};

const ClientesView: React.FC<ViewProps> = ({ refreshToken }) => {
  const { showToast } = useToast();
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
  const paged = usePagination(rows, { resetKey: debouncedSearch });

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
      phone: phoneToAdminFormValue(c.phone),
      phoneCountryIso: DEFAULT_PHONE_COUNTRY_ISO,
      address: c.address || "",
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
    const nextValue = k === "taxId"
      ? value.toUpperCase().replace(/\s+/g, "")
      : k === "phone"
        ? normalizeLocalPhone(value, getCountryCodeByIso(form.phoneCountryIso).code)
        : value;
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
        showToast(validation.roundingMessages.join(" | "), "warning");
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
      width: "250px",
      render: (c) => (
        <span style={{ fontWeight: 700, color: "var(--text)", whiteSpace: "normal" }}>{c.name}</span>
      ),
    },
    {
      key: "taxId",
      header: "RFC",
      width: "120px",
      render: (c) => (
        <span style={{ color: "var(--text-muted)", fontFamily: "monospace", fontSize: 12 }}>{c.taxId || "—"}</span>
      ),
    },
    {
      key: "cfdi",
      header: "CP · Régimen · Uso CFDI",
      width: "180px",
      render: (c) => (
        c.zipCode || c.taxRegime || c.cfdiUse ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 1, color: "var(--text-secondary)", fontSize: 12, whiteSpace: "normal" }}>
            {c.zipCode && <span>CP: {c.zipCode}</span>}
            {c.taxRegime && <span>Rég: {c.taxRegime}</span>}
            {c.cfdiUse && <span>CFDI: {c.cfdiUse}</span>}
          </div>
        ) : (
          <span style={{ color: "var(--border)" }}>—</span>
        )
      ),
    },
    {
      key: "email",
      header: "Contacto",
      width: "200px",
      render: (c) => (
        <div style={{ whiteSpace: "normal" }}>
          <div>{c.email || "—"}</div>
          <div style={{ fontSize: 11, color: "var(--text-faint)" }}>{c.phone || ""}</div>
        </div>
      ),
    },
    {
      key: "balance",
      header: "Saldo",
      align: "right",
      width: "100px",
      render: (c) => (
        <span style={{ fontWeight: 700, color: c.balance > 0 ? "var(--color-danger)" : "var(--text-secondary)" }}>
          {money(c.balance)}
        </span>
      ),
    },
    {
      key: "salesCount",
      header: "Compras",
      align: "center",
      width: "90px",
      render: (c) => <span style={{ fontWeight: 700 }}>{c.salesCount}</span>,
    },
    {
      key: "createdAt",
      header: "Alta",
      width: "100px",
      render: (c) => <span style={{ color: "var(--text-muted)" }}>{fmtDate(c.createdAt)}</span>,
    },
    {
      key: "edit",
      header: "",
      align: "center",
      width: "50px",
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
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
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
        <div style={{ padding: "8px 0" }}>
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
            paged.pageItems.map((c) => {
              const isExpanded = expandedCustomers[c.id];
              return (
                <div
                  key={c.id}
                  style={{
                    backgroundColor: "var(--surface)",
                    border: "1px solid var(--border-soft)",
                    borderRadius: 16,
                    padding: 16,
                    marginBottom: 12,
                    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Nombre */}
                      <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", marginBottom: 2, wordBreak: "break-word" }}>
                        {c.name}
                      </div>
                      {/* RFC */}
                      <div style={{ fontSize: 12, fontFamily: "monospace", color: "var(--accent-strong)", marginBottom: 8, fontWeight: 600 }}>
                        {c.taxId || "SIN RFC"}
                      </div>

                      {/* Contacto */}
                      {(c.phone || c.email) && (
                        <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 4, wordBreak: "break-word", display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                          {c.phone && <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><Phone size={12} style={{ flexShrink: 0 }} /> {c.phone}</span>}
                          {c.phone && c.email && <span style={{ margin: "0 6px", color: "var(--border-strong)" }}>·</span>}
                          {c.email && <span style={{ wordBreak: "break-all" }}>{c.email}</span>}
                        </div>
                      )}

                      {/* Compras y Saldo */}
                      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 4 }}>
                        <div>
                          <span style={{ fontSize: 10, color: "var(--text-faint)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.3px" }}>Compras</span>
                          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>{c.salesCount}</div>
                        </div>
                        <div>
                          <span style={{ fontSize: 10, color: "var(--text-faint)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.3px" }}>Saldo</span>
                          <div style={{ fontSize: 14, fontWeight: 700, color: c.balance > 0 ? "var(--color-danger)" : "var(--text-secondary)" }}>{money(c.balance)}</div>
                        </div>
                      </div>
                    </div>

                    {/* Botones de Acción */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
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
                          width: 38,
                          height: 38,
                          cursor: "pointer",
                          color: "var(--text-muted)",
                          padding: 0,
                        }}
                        className="active-tap"
                      >
                        {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </button>
                    </div>
                  </div>

                  {/* Detalle expandido */}
                  {isExpanded && (
                    <div style={{
                      padding: "16px",
                      margin: "16px 0 0 0",
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

                      {/* Historial */}
                      <div>
                        <h4 style={{ fontSize: 13, fontWeight: 800, color: "var(--text)", marginBottom: 10 }}>Historial</h4>
                        <div style={cliDetailRow}>
                          <span style={cliDetailLabel}>Saldo Actual:</span>
                          <span style={{ ...cliDetailValue, color: c.balance > 0 ? "var(--color-danger)" : "var(--text-secondary)" }}>{money(c.balance)}</span>
                        </div>
                        <div style={cliDetailRow}>
                          <span style={cliDetailLabel}>Compras:</span>
                          <span style={cliDetailValue}>{c.salesCount} compras</span>
                        </div>
                      </div>

                      {/* Acciones */}
                      <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end", borderTop: "1px solid var(--border-soft)", paddingTop: 12, marginTop: 4 }}>
                        <button
                          type="button"
                          onClick={() => openEdit(c)}
                          style={{
                            ...ui.primaryBtn,
                            padding: "8px 14px",
                            fontSize: 12,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6
                          }}
                        >
                          <Pencil size={13} /> Editar cliente
                        </button>
                      </div>
                    </div>
                  
                  )}
                </div>
              );
            })}
        </div>
      ) : (
        <div
          className="table-sticky-head"
          style={{
            ...ui.tableWrap,
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
          }}
        >
          <style>{`
            .table-sticky-head table {
              min-width: 820px;
            }
            .table-sticky-head thead th {
              position: sticky;
              top: 0;
              z-index: 1;
              background: var(--surface-2);
            }
          `}</style>
          <DataTable
            columns={columns}
            data={paged.pageItems}
            loading={loading}
            error={error}
            keyExtractor={(c) => c.id}
          />
        </div>
      )}

      {!loading && !error && (
        <Pagination page={paged.page} pageCount={paged.pageCount} total={paged.total} from={paged.from} to={paged.to} onPage={paged.setPage} itemLabel="clientes" />
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
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 14 }}>
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
              <PhoneField
                value={form.phone}
                onChange={(value) => updateFormField("phone", value)}
                countryIso={form.phoneCountryIso}
                onCountryChange={(phoneCountryIso) => {
                  const phone = normalizeLocalPhone(
                    form.phone,
                    getCountryCodeByIso(phoneCountryIso).code,
                  );
                  const nextForm = { ...form, phoneCountryIso, phone };
                  const validation = validateCustomerForm(nextForm);
                  setForm(nextForm);
                  setFormError(null);
                  setFieldErrors((prev) => {
                    const next = { ...prev };
                    if (validation.errors.phone) next.phone = validation.errors.phone;
                    else delete next.phone;
                    return next;
                  });
                }}
                error={fieldErrors.phone}
                disabled={saving}
              />
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

          {/* Código Postal fiscal */}
          <div style={{ marginBottom: 14 }}>
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

          {/* Sección CFDI */}
          <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "12px 14px", backgroundColor: "var(--surface-2)", marginBottom: 8 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: "var(--accent-strong)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Datos CFDI 4.0
            </p>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
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
            <p style={{ color: "var(--color-danger)", fontSize: 13, fontWeight: 600, marginTop: 4 }}>{formError}</p>
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
