import React, { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Edit2, Pencil, Plus, FileText, Mail, Phone, User, Power, Package } from "lucide-react";
import api from "../../shared/services/api";
import { useAdminData } from "../../shared/hooks";
import { DataTable, ActionModal, ConfirmModal } from "../../shared/ui";
import type { Column } from "../../shared/ui";
import { useToast } from "../../shared/context/ToastContext";
import {
  normalizeEmailInput,
  normalizeIntegerInput,
  normalizeRfcInput,
  validateReference,
  validateRfc,
  validateSafeText,
} from "../../shared/utils/formValidation";
import { PhoneField } from "../components/PhoneField";
import {
  DEFAULT_PHONE_COUNTRY_ISO,
  getCountryCodeByIso,
  normalizeLocalPhone,
  phoneToAdminFormValue,
  validateLocalPhone,
} from "../utils/phone";
import { ui, type ViewProps, SectionHeader, Badge,
  useMediaQuery,
  fmtDate,
  money,
  usePagination,
  Pagination,
  Toolbar,
  SearchInput,
  FilterSelect,
} from "./shared";

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

interface SupplierProduct {
  sku: string;
  name: string;
  costPrice: number;
  sellPrice: number;
  active: boolean;
  satUnitKey: string | null;
}

type FormData = {
  name: string;
  rfc: string;
  email: string;
  phone: string;
  phoneCountryIso: string;
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
// CATÁLOGOS Y CONSTANTES
// =========================
const MEXICAN_STATES = [
  "Aguascalientes",
  "Baja California",
  "Baja California Sur",
  "Campeche",
  "Chiapas",
  "Chihuahua",
  "Coahuila",
  "Colima",
  "Ciudad de México",
  "Durango",
  "Guanajuato",
  "Guerrero",
  "Hidalgo",
  "Jalisco",
  "Estado de México",
  "Michoacán",
  "Morelos",
  "Nayarit",
  "Nuevo León",
  "Oaxaca",
  "Puebla",
  "Querétaro",
  "Quintana Roo",
  "San Luis Potosí",
  "Sinaloa",
  "Sonora",
  "Tabasco",
  "Tamaulipas",
  "Tlaxcala",
  "Veracruz",
  "Yucatán",
  "Zacatecas"
];

// =========================
// FUNCIONES UTILITARIAS
// =========================
const emptyErrors: FieldErrors = {};

const emptyForm = (): FormData => ({
  name: "",
  rfc: "",
  email: "",
  phone: "",
  phoneCountryIso: DEFAULT_PHONE_COUNTRY_ISO,
  address: "",
  city: "",
  state: "",
  zipCode: "",
  contactName: "",
  active: true,
});

const getCityStateByZip = (zip: string): { city: string; state: string } | null => {
  if (!/^\d{5}$/.test(zip)) return null;
  const zipNum = parseInt(zip, 10);
  
  // CDMX
  if (zipNum >= 1000 && zipNum <= 16999) {
    return { city: "Ciudad de México", state: "Ciudad de México" };
  }
  // Guadalajara / Jalisco
  if (zipNum >= 44000 && zipNum <= 45999) {
    return { city: "Guadalajara", state: "Jalisco" };
  }
  // Monterrey / NL
  if (zipNum >= 64000 && zipNum <= 66999) {
    return { city: "Monterrey", state: "Nuevo León" };
  }
  // Puebla
  if (zipNum >= 72000 && zipNum <= 72999) {
    return { city: "Puebla", state: "Puebla" };
  }
  // Querétaro
  if (zipNum >= 76000 && zipNum <= 76999) {
    return { city: "Querétaro", state: "Querétaro" };
  }
  // Tijuana / BC
  if (zipNum >= 22000 && zipNum <= 22999) {
    return { city: "Tijuana", state: "Baja California" };
  }
  // Mérida / Yucatán
  if (zipNum >= 97000 && zipNum <= 97999) {
    return { city: "Mérida", state: "Yucatán" };
  }
  // León / Guanajuato
  if (zipNum >= 37000 && zipNum <= 37999) {
    return { city: "León", state: "Guanajuato" };
  }
  // Toluca / Estado de México
  if (zipNum >= 50000 && zipNum <= 50999) {
    return { city: "Toluca", state: "Estado de México" };
  }
  // Cancún / Quintana Roo
  if (zipNum >= 77500 && zipNum <= 77599) {
    return { city: "Cancún", state: "Quintana Roo" };
  }
  // San Luis Potosí
  if (zipNum >= 78000 && zipNum <= 78999) {
    return { city: "San Luis Potosí", state: "San Luis Potosí" };
  }
  // Hermosillo / Sonora
  if (zipNum >= 83000 && zipNum <= 83999) {
    return { city: "Hermosillo", state: "Sonora" };
  }
  // Chihuahua
  if (zipNum >= 31000 && zipNum <= 31999) {
    return { city: "Chihuahua", state: "Chihuahua" };
  }
  // Ciudad Juárez
  if (zipNum >= 32000 && zipNum <= 32999) {
    return { city: "Ciudad Juárez", state: "Chihuahua" };
  }
  // Aguascalientes
  if (zipNum >= 20000 && zipNum <= 20999) {
    return { city: "Aguascalientes", state: "Aguascalientes" };
  }
  // Morelia / Michoacán
  if (zipNum >= 58000 && zipNum <= 58999) {
    return { city: "Morelia", state: "Michoacán" };
  }
  // Veracruz
  if (zipNum >= 91700 && zipNum <= 91999) {
    return { city: "Veracruz", state: "Veracruz" };
  }
  return null;
};

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
  const v = value.trim();
  if (!v) return "El correo es obligatorio.";
  if (v.length > 100) return "No puede exceder 100 caracteres.";
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(v)) return "El correo no tiene un formato válido.";
  return undefined;
};

const validatePhone = (value: string, countryIso: string): string | undefined => {
  return validateLocalPhone(value, getCountryCodeByIso(countryIso).code, { required: true });
};

const validateAddress = (value: string): string | undefined => {
  const v = value.trim();
  if (!v) return "La dirección es obligatoria.";
  if (v.length < 5) return "Dirección muy corta.";
  if (v.length > 150) return "No puede exceder 150 caracteres.";
  const referenceError = validateReference(v, "La direccion", { required: true, max: 150 });
  if (referenceError) return referenceError;
  return undefined;
};

const validateCity = (value: string): string | undefined => {
  return validateSafeText(value, "La ciudad", { required: true, min: 2, max: 100 });
};

const validateState = (value: string): string | undefined => {
  return validateSafeText(value, "El estado", { required: true, min: 2, max: 100 });
};

const validateZip = (value: string): string | undefined => {
  if (!value) return "El código postal es obligatorio.";
  if (!/^\d{5}$/.test(value)) return "Debe contener exactamente 5 digitos numericos.";
  return undefined;
};

// =========================
// COMPONENTE PRINCIPAL
// =========================
const supDetailRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-start",
  alignItems: "flex-start",
  gap: "8px",
  fontSize: 13,
  marginBottom: 6,
};

const supDetailLabel: React.CSSProperties = {
  flexShrink: 0,
  fontWeight: 700,
  color: "var(--text-muted)",
  minWidth: "95px",
  display: "inline-block",
};

const supDetailValue: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  overflowWrap: "anywhere",
  fontWeight: 600,
  color: "var(--text-secondary)",
};

const supplierProductColumns: Column<SupplierProduct>[] = [
  {
    key: "sku",
    header: "SKU",
    render: (p) => <span style={{ fontFamily: "monospace", color: "var(--text-secondary)" }}>{p.sku}</span>,
  },
  {
    key: "name",
    header: "Nombre",
    render: (p) => <span style={{ fontWeight: 700, color: "var(--text)" }}>{p.name}</span>,
  },
  {
    key: "sellPrice",
    header: "Precio de venta",
    align: "right",
    render: (p) => <span>{money(p.sellPrice)}</span>,
  },
  {
    key: "active",
    header: "Estatus",
    align: "center",
    render: (p) => <Badge tone={p.active ? "green" : "slate"}>{p.active ? "Activo" : "Inactivo"}</Badge>,
  },
];

const ProveedoresView: React.FC<ViewProps> = ({ refreshToken }) => {
  const { showToast } = useToast();
  const { data, loading, error, refetch } = useAdminData<Supplier[]>("/api/admin/suppliers");
  const suppliers = data ?? [];

  // =========================
  // ESTADOS Y FILTROS
  // =========================
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("name_asc");

  // Sugerencias dinámicas basadas en proveedores existentes
  const uniqueAddresses = React.useMemo(() => {
    return Array.from(new Set(suppliers.map(s => s.address).filter(Boolean))) as string[];
  }, [suppliers]);

  const uniqueCities = React.useMemo(() => {
    return Array.from(new Set(suppliers.map(s => s.city).filter(Boolean))) as string[];
  }, [suppliers]);

  const uniqueStates = React.useMemo(() => {
    const fromSuppliers = suppliers.map(s => s.state).filter(Boolean) as string[];
    return Array.from(new Set([...fromSuppliers, ...MEXICAN_STATES])) as string[];
  }, [suppliers]);

  const uniqueZips = React.useMemo(() => {
    return Array.from(new Set(suppliers.map(s => s.zipCode).filter(Boolean))) as string[];
  }, [suppliers]);

  // Filtrado y ordenamiento de proveedores
  const filteredAndSortedSuppliers = React.useMemo(() => {
    let list = [...suppliers];

    // 1. Buscador general
    const query = search.trim().toLowerCase();
    if (query) {
      list = list.filter((s) => {
        return (
          s.name.toLowerCase().includes(query) ||
          (s.rfc || "").toLowerCase().includes(query) ||
          (s.contactName || "").toLowerCase().includes(query) ||
          (s.email || "").toLowerCase().includes(query) ||
          (s.phone || "").toLowerCase().includes(query) ||
          (s.address || "").toLowerCase().includes(query) ||
          (s.city || "").toLowerCase().includes(query) ||
          (s.state || "").toLowerCase().includes(query) ||
          (s.zipCode || "").toLowerCase().includes(query)
        );
      });
    }

    // 2. Filtro de estado
    if (statusFilter === "active") {
      list = list.filter((s) => s.active);
    } else if (statusFilter === "inactive") {
      list = list.filter((s) => !s.active);
    }

    // 3. Ordenamiento
    list.sort((a, b) => {
      if (sortBy === "name_asc") {
        return a.name.localeCompare(b.name, "es");
      }
      if (sortBy === "name_desc") {
        return b.name.localeCompare(a.name, "es");
      }
      if (sortBy === "recent") {
        return b.id - a.id;
      }
      if (sortBy === "oldest") {
        return a.id - b.id;
      }
      return 0;
    });

    return list;
  }, [suppliers, search, statusFilter, sortBy]);

  // Calcula cuántas filas caben en pantalla según la altura disponible.
  // 64px topbar + 24px padding-top + 24px padding-bottom + ~60px sectionHeader
  // + ~54px toolbar + ~46px pagination (reservado) + 42px thead = 314px fijos.
  // Cada fila ocupa ~50px (padding 13px×2 + contenido ~24px).
  const [dynPageSize, setDynPageSize] = useState(10);
  useEffect(() => {
    const ROW_H = 50;
    const FIXED = 314; // offsets fijos arriba descritos
    const compute = () =>
      setDynPageSize(Math.max(5, Math.floor((window.innerHeight - FIXED) / ROW_H)));
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);

  const paged = usePagination(filteredAndSortedSuppliers, {
    resetKey: `${search}|${statusFilter}|${sortBy}`,
    pageSize: dynPageSize,
  });

  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    refetch();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshToken]);

  const isMobile = useMediaQuery("(max-width: 1024px)");
  const [expandedSuppliers, setExpandedSuppliers] = useState<Record<number, boolean>>({});
  const [hoveredToggleId, setHoveredToggleId] = useState<number | null>(null);

  const toggleExpandSupplier = (id: number) => {
    setExpandedSuppliers((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  // Modal de productos asociados (solo lectura)
  const [productsModalOpen, setProductsModalOpen] = useState(false);
  const [productsModalSupplier, setProductsModalSupplier] = useState<Supplier | null>(null);
  const [supplierProducts, setSupplierProducts] = useState<SupplierProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState<string | null>(null);

  // Computed - Validación completa del formulario
  const isFormValid =
    !validateName(form.name) &&
    !validateContactName(form.contactName) &&
    !validateRFC(form.rfc) &&
    !validateEmail(form.email) &&
    !validatePhone(form.phone, form.phoneCountryIso) &&
    !validateAddress(form.address) &&
    !validateCity(form.city) &&
    !validateState(form.state) &&
    !validateZip(form.zipCode);

  // =========================
  // CRUD Y ACCIONES
  // =========================
  const [confirmToggleSupplier, setConfirmToggleSupplier] = useState<Supplier | null>(null);
  const [togglingActive, setTogglingActive] = useState(false);

  const handleToggleActive = async (s: Supplier) => {
    if (s.active) {
      try {
        const res = await api.get<any[]>(`/api/admin/suppliers/${s.id}/products`);
        if (res.data.length > 0) {
          showToast(`No se puede desactivar el proveedor "${s.name}". Tiene ${res.data.length} producto(s) asociado(s).`, "warning");
          return;
        }
      } catch (err: any) {
        showToast(err.response?.data?.message || "Error al verificar los productos asociados del proveedor.", "error");
        return;
      }
    }
    setConfirmToggleSupplier(s);
  };

  const handleConfirmToggle = async () => {
    if (!confirmToggleSupplier) return;
    const s = confirmToggleSupplier;
    const nextActive = !s.active;

    setTogglingActive(true);
    try {
      await api.put(`/api/admin/suppliers/${s.id}`, { ...s, active: nextActive });
      showToast(`Proveedor "${s.name}" ${nextActive ? "activado" : "desactivado"} correctamente.`, "success");
      setConfirmToggleSupplier(null);
      await refetch();
    } catch (err: any) {
      showToast(err.response?.data?.message || `Error al ${nextActive ? "activar" : "desactivar"} el proveedor.`, "error");
    } finally {
      setTogglingActive(false);
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setFormError(null);
    setModalOpen(true);
    setFieldErrors(emptyErrors);
  };

  const openEdit = (s: Supplier) => {
    setEditingId(s.id);
    const loadedForm: FormData = {
      name: s.name,
      rfc: s.rfc || "",
      email: s.email || "",
      phone: phoneToAdminFormValue(s.phone),
      phoneCountryIso: DEFAULT_PHONE_COUNTRY_ISO,
      address: s.address || "",
      city: s.city || "",
      state: s.state || "",
      zipCode: s.zipCode || "",
      contactName: s.contactName || "",
      active: s.active,
    };
    setForm(loadedForm);

    setFieldErrors({
      name: validateName(s.name),
      contactName: validateContactName(s.contactName || ""),
      rfc: validateRFC(s.rfc || ""),
      email: validateEmail(s.email || ""),
      phone: validatePhone(loadedForm.phone, loadedForm.phoneCountryIso),
      address: validateAddress(s.address || ""),
      city: validateCity(s.city || ""),
      state: validateState(s.state || ""),
      zipCode: validateZip(s.zipCode || "")
    });

    setFormError(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setModalOpen(false);
    setEditingId(null);
    setForm(emptyForm());
    setFormError(null);
  };

  const openProductsModal = async (s: Supplier) => {
    setProductsModalSupplier(s);
    setProductsModalOpen(true);
    setSupplierProducts([]);
    setProductsError(null);
    setProductsLoading(true);
    try {
      const res = await api.get<SupplierProduct[]>(`/api/admin/suppliers/${s.id}/products`);
      setSupplierProducts(res.data);
    } catch (err: any) {
      setProductsError(err.response?.data?.message || "Error al cargar los productos asociados.");
    } finally {
      setProductsLoading(false);
    }
  };

  const closeProductsModal = () => {
    setProductsModalOpen(false);
    setProductsModalSupplier(null);
    setSupplierProducts([]);
    setProductsError(null);
  };

  const handleSubmit = async () => {
    if (saving) return;

    // Validación de desactivación en edición
    if (editingId && !form.active) {
      const original = suppliers.find(s => s.id === editingId);
      if (original && original.active) {
        try {
          setSaving(true);
          const res = await api.get<any[]>(`/api/admin/suppliers/${editingId}/products`);
          if (res.data.length > 0) {
            showToast(`No se puede desactivar este proveedor. Tiene ${res.data.length} producto(s) asociado(s).`, "warning");
            setFormError(`No se puede desactivar. Tiene ${res.data.length} productos asociados.`);
            setSaving(false);
            return;
          }
        } catch (err) {
          setFormError("Error al verificar los productos asociados del proveedor.");
          setSaving(false);
          return;
        } finally {
          setSaving(false);
        }
      }
    }

    const errors = {
      name: validateName(form.name),
      contactName: validateContactName(form.contactName),
      rfc: validateRFC(form.rfc),
      email: validateEmail(form.email),
      phone: validatePhone(form.phone, form.phoneCountryIso),
      address: validateAddress(form.address),
      city: validateCity(form.city),
      state: validateState(form.state),
      zipCode: validateZip(form.zipCode)
    };

    setFieldErrors(errors);

    const hasErrors = Object.values(errors).some(e => e !== undefined);
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
        phoneCountryCode: getCountryCodeByIso(form.phoneCountryIso).code,
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
      await refetch();
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
    let value = e.target.value;
    let limitReached = false;
    if (value.length > 100) {
      value = value.slice(0, 100);
      limitReached = true;
    }
    setForm(f => ({ ...f, name: value }));
    setFieldErrors(f => ({ 
      ...f, 
      name: limitReached ? "Límite de 100 caracteres alcanzado." : validateName(value) 
    }));
  };

  const handleContactName = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/[^a-zA-ZÀ-ÿÑñ\s]/g, '');
    let limitReached = false;
    if (value.length > 100) {
      value = value.slice(0, 100);
      limitReached = true;
    }
    setForm(f => ({ ...f, contactName: value }));
    setFieldErrors(f => ({ 
      ...f, 
      contactName: limitReached ? "Límite de 100 caracteres alcanzado." : validateContactName(value) 
    }));
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

  const handlePhone = (phone: string) => {
    setForm(f => ({ ...f, phone }));
    setFieldErrors(f => ({ ...f, phone: validatePhone(phone, form.phoneCountryIso) }));
  };

  const handlePhoneCountry = (phoneCountryIso: string) => {
    const phone = normalizeLocalPhone(form.phone, getCountryCodeByIso(phoneCountryIso).code);
    setForm((current) => ({ ...current, phoneCountryIso, phone }));
    setFieldErrors((current) => ({
      ...current,
      phone: validatePhone(phone, phoneCountryIso),
    }));
  };

  const handleAddress = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value;
    let limitReached = false;
    if (value.length > 150) {
      value = value.slice(0, 150);
      limitReached = true;
    }
    setForm(f => ({ ...f, address: value }));
    setFieldErrors(f => ({ 
      ...f, 
      address: limitReached ? "Límite de 150 caracteres alcanzado." : validateAddress(value) 
    }));
  };

  const handleCity = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/[^a-zA-ZÀ-ÿÑñ\s]/g, '');
    let limitReached = false;
    if (value.length > 100) {
      value = value.slice(0, 100);
      limitReached = true;
    }
    setForm(f => ({ ...f, city: value }));
    setFieldErrors(f => ({ 
      ...f, 
      city: limitReached ? "Límite de 100 caracteres alcanzado." : validateCity(value) 
    }));
  };

  const handleState = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/[^a-zA-ZÀ-ÿÑñ\s]/g, '');
    let limitReached = false;
    if (value.length > 100) {
      value = value.slice(0, 100);
      limitReached = true;
    }
    setForm(f => ({ ...f, state: value }));
    setFieldErrors(f => ({ 
      ...f, 
      state: limitReached ? "Límite de 100 caracteres alcanzado." : validateState(value) 
    }));
  };

  const handleZip = (e: React.ChangeEvent<HTMLInputElement>) => {
    const zip = normalizeIntegerInput(e.target.value).slice(0, 5);
    let newCity = form.city;
    let newState = form.state;
    if (zip.length === 5) {
      const match = getCityStateByZip(zip);
      if (match) {
        if (!form.city.trim()) newCity = match.city;
        if (!form.state.trim()) newState = match.state;
      }
    }
    setForm(f => ({ ...f, zipCode: zip, city: newCity, state: newState }));
    setFieldErrors(f => ({ 
      ...f, 
      zipCode: validateZip(zip),
      city: newCity ? undefined : f.city,
      state: newState ? undefined : f.state
    }));
  };

  const handleBlur = (field: keyof FieldErrors) => {
    let fieldError: string | undefined;
    switch (field) {
      case 'name':
        fieldError = validateName(form.name);
        break;
      case 'contactName':
        fieldError = validateContactName(form.contactName);
        break;
      case 'rfc':
        fieldError = validateRFC(form.rfc);
        break;
      case 'email':
        fieldError = validateEmail(form.email);
        break;
      case 'phone':
        fieldError = validatePhone(form.phone, form.phoneCountryIso);
        break;
      case 'address':
        fieldError = validateAddress(form.address);
        break;
      case 'city':
        fieldError = validateCity(form.city);
        break;
      case 'state':
        fieldError = validateState(form.state);
        break;
      case 'zipCode':
        fieldError = validateZip(form.zipCode);
        break;
    }

    if (fieldError) {
      setFieldErrors(prev => ({ ...prev, [field]: fieldError }));
    }
  };

  // =========================
  // COLUMNAS DE LA TABLA
  // =========================
  const columns: Column<Supplier>[] = [
    {
      key: "name",
      header: "Nombre",
      render: (s) => <span style={{ fontWeight: 700, color: "var(--text)" }}>{s.name}</span>,
    },
    {
      key: "rfc",
      header: "RFC",
      render: (s) => <span style={{ color: "var(--text-secondary)" }}>{s.rfc || "—"}</span>,
    },
    {
      key: "contactName",
      header: "Contacto",
      render: (s) => <span>{s.contactName || "—"}</span>,
    },
    {
      key: "email",
      header: "Email",
      render: (s) => <span>{s.email || "—"}</span>,
    },
    {
      key: "phone",
      header: "Teléfono",
      render: (s) => <span>{s.phone || "—"}</span>,
    },
    {
      key: "city",
      header: "Ciudad / Estado",
      render: (s) => (
        <span>{s.city ? `${s.city}${s.state ? `, ${s.state}` : ""}` : "—"}</span>
      ),
    },
    {
      key: "products",
      header: "Productos",
      align: "center",
      render: (s) => (
        <button
          style={{
            ...ui.linkBtn,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            border: "1px solid var(--border-strong)",
            borderRadius: "6px",
            padding: "6px 10px",
          }}
          onClick={() => openProductsModal(s)}
          title="Ver productos asociados"
        >
          <Package size={14} />
        </button>
      ),
    },
    {
      key: "actions",
      header: "Acciones",
      render: (s) => {
        const isHovered = hoveredToggleId === s.id;
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button style={ui.linkBtn} onClick={() => openEdit(s)}>
                <Edit2 size={13} style={{ marginRight: 4, verticalAlign: "middle" }} />
                Editar
              </button>
              <button
                style={{
                  ...ui.linkBtn,
                  color: s.active ? "var(--color-danger)" : "var(--color-success)",
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "4px 8px",
                  borderRadius: "6px",
                  backgroundColor: isHovered
                    ? (s.active ? "rgba(239, 68, 68, 0.08)" : "rgba(34, 197, 94, 0.08)")
                    : "transparent",
                  transition: "background-color 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                }}
                onMouseEnter={() => setHoveredToggleId(s.id)}
                onMouseLeave={() => setHoveredToggleId(null)}
                onClick={() => handleToggleActive(s)}
                title={s.active ? "Desactivar" : "Activar"}
              >
                <Power size={14} style={{ flexShrink: 0 }} />
              </button>
            </div>
            <Badge tone={s.active ? "green" : "slate"}>{s.active ? "Activo" : "Inactivo"}</Badge>
          </div>
        );
      },
    },
  ];

  // =========================
  // RENDER
  // =========================
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

      <Toolbar>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Buscar por nombre, RFC, contacto, correo, ciudad..."
        />
        <FilterSelect
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: "all", label: "Todos los estatus" },
            { value: "active", label: "Activos" },
            { value: "inactive", label: "Inactivos" },
          ]}
        />
        <FilterSelect
          value={sortBy}
          onChange={setSortBy}
          options={[
            { value: "name_asc", label: "Nombre (A-Z)" },
            { value: "name_desc", label: "Nombre (Z-A)" },
            { value: "recent", label: "Más reciente" },
            { value: "oldest", label: "Más antiguo" },
          ]}
        />
        <span style={{ marginLeft: "auto", fontSize: 13, color: "var(--text-muted)", fontWeight: 600 }}>
          {filteredAndSortedSuppliers.length} proveedor{filteredAndSortedSuppliers.length === 1 ? "" : "es"}
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
          {!loading && error && (
            <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--color-danger)", fontSize: 13, fontWeight: 500 }}>
              {error}
            </div>
          )}
          {!loading && !error && filteredAndSortedSuppliers.length === 0 && (
            <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--text-faint)", fontSize: 13, fontWeight: 500 }}>
              No hay proveedores que coincidan con la búsqueda o filtros.
            </div>
          )}

          {!loading &&
            !error &&
            paged.pageItems.map((s) => {
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
                  {/* Header: RFC y Estado */}
                  <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "8px 16px 6px 16px",
                    fontSize: 11,
                    fontWeight: 700,
                    color: "var(--text-muted)",
                    borderBottom: "1px solid var(--border-soft)",
                    backgroundColor: "var(--surface-2)",
                    letterSpacing: "0.2px",
                  }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "monospace" }}>
                      <FileText size={12} color="var(--text-muted)" />
                      RFC: {s.rfc || "Sin RFC"}
                    </span>
                    <Badge tone={s.active ? "green" : "slate"}>
                      {s.active ? "Activo" : "Inactivo"}
                    </Badge>
                  </div>

                  {/* Fila principal */}
                  <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "12px 16px",
                    gap: 12,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Nombre */}
                      <div style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: "var(--text)",
                        wordBreak: "break-word",
                        overflowWrap: "anywhere",
                        whiteSpace: "normal",
                      }}>
                        {s.name}
                      </div>

                      {/* Contacto */}
                      <div style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        fontSize: 13,
                        color: "var(--text-secondary)",
                        marginTop: 4,
                        wordBreak: "break-word",
                        overflowWrap: "anywhere",
                        whiteSpace: "normal",
                      }}>
                        <User size={14} color="#2563eb" style={{ flexShrink: 0 }} />
                        <span>Contacto: {s.contactName || "—"}</span>
                      </div>

                      {/* Email y Teléfono */}
                      <div style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        flexWrap: "wrap",
                        fontSize: 12,
                        color: "var(--text-secondary)",
                        marginTop: 4,
                      }}>
                        <span style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          wordBreak: "break-all",
                          overflowWrap: "anywhere",
                          whiteSpace: "normal",
                        }}>
                          <Mail size={13} color="#2563eb" style={{ flexShrink: 0 }} />
                          {s.email || "Sin email"}
                        </span>
                        {s.phone && (
                          <span style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            wordBreak: "break-word",
                          }}>
                            <Phone size={13} color="#2563eb" style={{ flexShrink: 0 }} />
                            {s.phone}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Chevron Button */}
                    <div style={{ display: "flex", alignItems: "center", alignSelf: "center" }}>
                      <button
                        onClick={() => toggleExpandSupplier(s.id)}
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
                          color: "var(--accent)",
                          padding: 0,
                        }}
                        className="active-tap"
                      >
                        {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </button>
                    </div>
                  </div>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div style={{
                      padding: "16px",
                      margin: "0 16px 16px 16px",
                      backgroundColor: "var(--surface-2)",
                      borderRadius: "12px",
                      border: "1px solid var(--border)",
                    }}>
                      <div style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                        gap: 16,
                        textAlign: "left",
                      }}>
                        {/* Identificación */}
                        <div>
                          <h4 style={{ fontSize: 13, fontWeight: 800, color: "var(--text)", marginBottom: 10 }}>Identificación</h4>
                          <div style={supDetailRow}>
                            <span style={supDetailLabel}>RFC:</span>
                            <span style={{ ...supDetailValue, fontFamily: "monospace" }}>{s.rfc || "—"}</span>
                          </div>
                          <div style={supDetailRow}>
                            <span style={supDetailLabel}>Contacto:</span>
                            <span style={supDetailValue}>{s.contactName || "—"}</span>
                          </div>
                          <div style={supDetailRow}>
                            <span style={supDetailLabel}>Teléfono:</span>
                            <span style={supDetailValue}>{s.phone || "—"}</span>
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

                      {/* Acción principal: Editar / Desactivar */}
                      <div style={{
                        marginTop: 14,
                        borderTop: "1px solid var(--border)",
                        paddingTop: 14,
                        display: "flex",
                        gap: 12,
                      }}>
                        <button
                          onClick={() => openEdit(s)}
                          style={{
                            ...ui.linkBtn,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            backgroundColor: "#eff6ff",
                            border: "1px solid #bfdbfe",
                            borderRadius: 8,
                            padding: "8px 14px",
                            fontSize: 12,
                            fontWeight: 700,
                            color: "var(--accent-strong)",
                            cursor: "pointer",
                          }}
                          className="active-tap"
                        >
                          <Pencil size={13} /> Editar proveedor
                        </button>
                        <button
                          onClick={() => openProductsModal(s)}
                          style={{
                            ...ui.linkBtn,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            backgroundColor: "var(--surface)",
                            border: "1px solid var(--border-strong)",
                            borderRadius: 8,
                            padding: "8px 14px",
                            fontSize: 12,
                            fontWeight: 700,
                            color: "var(--accent)",
                            cursor: "pointer",
                          }}
                          className="active-tap"
                        >
                          <Package size={13} /> Ver productos
                        </button>
                        <button
                          onClick={() => handleToggleActive(s)}
                          onMouseEnter={() => setHoveredToggleId(s.id)}
                          onMouseLeave={() => setHoveredToggleId(null)}
                          style={{
                            ...ui.linkBtn,
                            display: "inline-flex",
                            alignItems: "center",
                            backgroundColor: s.active ? "rgba(239,68,68,0.08)" : "rgba(34,197,94,0.08)",
                            border: `1px solid ${s.active ? "rgba(239,68,68,0.2)" : "rgba(34,197,94,0.2)"}`,
                            borderRadius: 8,
                            padding: "8px 14px",
                            color: s.active ? "var(--color-danger)" : "var(--color-success)",
                            cursor: "pointer",
                          }}
                          title={s.active ? "Desactivar" : "Activar"}
                          className="active-tap"
                        >
                          <Power size={13} style={{ flexShrink: 0 }} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      ) : (
        <div className="table-sticky-head">
          <style>{`
            .table-sticky-head table {
              min-width: 900px;
              width: 100%;
            }
            .table-sticky-head thead th {
              position: sticky;
              top: 0;
              z-index: 1;
              background: var(--surface-2);
            }
            /* Permite que el scrollbar vertical se superponga (overlay) para que las filas ocupen el 100% del ancho */
            .table-sticky-head > div {
              overflow-y: overlay !important;
            }
            /* Estilos premium para los scrollbars del contenedor de la tabla */
            .table-sticky-head > div::-webkit-scrollbar {
              width: 8px;
              height: 8px;
            }
            .table-sticky-head > div::-webkit-scrollbar-track {
              background: transparent;
            }
            .table-sticky-head > div::-webkit-scrollbar-thumb {
              background: var(--border-strong);
              border-radius: 4px;
            }
            .table-sticky-head > div::-webkit-scrollbar-thumb:hover {
              background: var(--accent);
            }
          `}</style>
          <DataTable
            columns={columns}
            data={paged.pageItems}
            loading={loading}
            error={error}
            emptyMessage="Aún no hay proveedores registrados con esos filtros."
            keyExtractor={(s) => s.id}
            height="calc(100vh - 275px)"
          />
        </div>
      )}

      {!loading && !error && (
        <Pagination
          page={paged.page}
          pageCount={paged.pageCount}
          total={paged.total}
          from={paged.from}
          to={paged.to}
          onPage={paged.setPage}
          itemLabel="proveedores"
        />
      )}

      {/* Modal alta / edición de proveedor */}
      <ActionModal
        isOpen={modalOpen}
        onClose={closeModal}
        title={editingId ? "Editar Proveedor" : "Nuevo Proveedor"}
        size="md"
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
          {/* Nombre */}
          <div style={{ gridColumn: "1 / -1" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <label style={ui.fieldLabel}>Nombre *</label>
              <span style={{ fontSize: "11px", color: form.name.length >= 100 ? "var(--color-danger)" : "var(--text-muted)" }}>
                {form.name.length}/100 {form.name.length >= 100 && "(Límite alcanzado)"}
              </span>
            </div>
            <input
              style={{ ...ui.input, borderColor: fieldErrors.name ? "var(--color-danger)" : "var(--border)" }}
              value={form.name}
              onChange={handleName}
              onBlur={() => handleBlur('name')}
              placeholder="Razón social o nombre comercial"
              autoFocus
              disabled={saving}
              maxLength={100}
            />
            {fieldErrors.name && (
              <span style={{ color: "var(--color-danger)", fontSize: "12px", marginTop: "4px", display: "block" }}>
                {fieldErrors.name}
              </span>
            )}
          </div>

          {/* RFC */}
          <div>
            <label style={ui.fieldLabel}>RFC *</label>
            <input
              style={{ ...ui.input, borderColor: fieldErrors.rfc ? "var(--color-danger)" : "var(--border)" }}
              value={form.rfc}
              onChange={handleRFC}
              onBlur={() => handleBlur('rfc')}
              placeholder="RFC del proveedor"
              disabled={saving}
              maxLength={13}
            />
            {fieldErrors.rfc && (
              <span style={{ color: "var(--color-danger)", fontSize: "12px", marginTop: "4px", display: "block" }}>
                {fieldErrors.rfc}
              </span>
            )}
          </div>

          {/* Persona de contacto */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <label style={ui.fieldLabel}>Persona de contacto *</label>
              <span style={{ fontSize: "11px", color: form.contactName.length >= 100 ? "var(--color-danger)" : "var(--text-muted)" }}>
                {form.contactName.length}/100 {form.contactName.length >= 100 && "(Límite alcanzado)"}
              </span>
            </div>
            <input
              style={{ ...ui.input, borderColor: fieldErrors.contactName ? "var(--color-danger)" : "var(--border)" }}
              value={form.contactName}
              onChange={handleContactName}
              onBlur={() => handleBlur('contactName')}
              placeholder="Nombre del contacto"
              disabled={saving}
              maxLength={100}
            />
            {fieldErrors.contactName && (
              <span style={{ color: "var(--color-danger)", fontSize: "12px", marginTop: "4px", display: "block" }}>
                {fieldErrors.contactName}
              </span>
            )}
          </div>

          {/* Email */}
          <div>
            <label style={ui.fieldLabel}>Email *</label>
            <input
              style={{ ...ui.input, borderColor: fieldErrors.email ? "var(--color-danger)" : "var(--border)" }}
              type="email"
              value={form.email}
              onChange={handleEmail}
              onBlur={() => handleBlur('email')}
              placeholder="correo@proveedor.com"
              disabled={saving}
              maxLength={100}
            />
            {fieldErrors.email && (
              <span style={{ color: "var(--color-danger)", fontSize: "12px", marginTop: "4px", display: "block" }}>
                {fieldErrors.email}
              </span>
            )}
          </div>

          {/* Teléfono */}
          <div>
            <PhoneField
              value={form.phone}
              onChange={handlePhone}
              countryIso={form.phoneCountryIso}
              onCountryChange={handlePhoneCountry}
              onBlur={() => handleBlur('phone')}
              error={fieldErrors.phone}
              required
              disabled={saving}
            />
          </div>

          {/* Dirección */}
          <div style={{ gridColumn: "1 / -1" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <label style={ui.fieldLabel}>Dirección *</label>
              <span style={{ fontSize: "11px", color: form.address.length >= 150 ? "var(--color-danger)" : "var(--text-muted)" }}>
                {form.address.length}/150 {form.address.length >= 150 && "(Límite alcanzado)"}
              </span>
            </div>
            <input
              style={{ ...ui.input, borderColor: fieldErrors.address ? "var(--color-danger)" : "var(--border)" }}
              value={form.address}
              onChange={handleAddress}
              onBlur={() => handleBlur('address')}
              placeholder="Calle, número, colonia"
              disabled={saving}
              maxLength={150}
              list="supplier-addresses"
            />
            {fieldErrors.address && (
              <span style={{ color: "var(--color-danger)", fontSize: "12px", marginTop: "4px", display: "block" }}>
                {fieldErrors.address}
              </span>
            )}
          </div>

          {/* Ciudad */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <label style={ui.fieldLabel}>Ciudad *</label>
              <span style={{ fontSize: "11px", color: form.city.length >= 100 ? "var(--color-danger)" : "var(--text-muted)" }}>
                {form.city.length}/100 {form.city.length >= 100 && "(Límite alcanzado)"}
              </span>
            </div>
            <input
              style={{ ...ui.input, borderColor: fieldErrors.city ? "var(--color-danger)" : "var(--border)" }}
              value={form.city}
              onChange={handleCity}
              onBlur={() => handleBlur('city')}
              placeholder="Ciudad"
              disabled={saving}
              maxLength={100}
              list="supplier-cities"
            />
            {fieldErrors.city && (
              <span style={{ color: "var(--color-danger)", fontSize: "12px", marginTop: "4px", display: "block" }}>
                {fieldErrors.city}
              </span>
            )}
          </div>

          {/* Estado */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <label style={ui.fieldLabel}>Estado *</label>
              <span style={{ fontSize: "11px", color: form.state.length >= 100 ? "var(--color-danger)" : "var(--text-muted)" }}>
                {form.state.length}/100 {form.state.length >= 100 && "(Límite alcanzado)"}
              </span>
            </div>
            <input
              style={{ ...ui.input, borderColor: fieldErrors.state ? "var(--color-danger)" : "var(--border)" }}
              value={form.state}
              onChange={handleState}
              onBlur={() => handleBlur('state')}
              placeholder="Estado"
              disabled={saving}
              maxLength={100}
              list="supplier-states"
            />
            {fieldErrors.state && (
              <span style={{ color: "var(--color-danger)", fontSize: "12px", marginTop: "4px", display: "block" }}>
                {fieldErrors.state}
              </span>
            )}
          </div>

          {/* Código Postal */}
          <div>
            <label style={ui.fieldLabel}>C.P. *</label>
            <input
              style={{ ...ui.input, borderColor: fieldErrors.zipCode ? "var(--color-danger)" : "var(--border)" }}
              value={form.zipCode}
              onChange={handleZip}
              onBlur={() => handleBlur('zipCode')}
              placeholder="00000"
              disabled={saving}
              maxLength={5}
              list="supplier-zips"
            />
            {fieldErrors.zipCode && (
              <span style={{ color: "var(--color-danger)", fontSize: "12px", marginTop: "4px", display: "block" }}>
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
                border: "1px solid var(--border)",
                borderRadius: "6px",
                fontSize: "14px",
                fontFamily: "system-ui",
                color: "var(--text)",
                backgroundColor: saving ? "var(--surface-3)" : "var(--input-bg)"
              }}
            >
              <option value="active">Activo</option>
              <option value="inactive">Inactivo</option>
            </select>
          </div>
        </div>

        {formError && (
          <p style={{ color: "var(--color-danger)", fontSize: 13, fontWeight: 600, marginTop: 14 }}>
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
      </ActionModal>

      {/* Modal de productos asociados (solo lectura) */}
      <ActionModal
        isOpen={productsModalOpen}
        onClose={closeProductsModal}
        title={`Productos de ${productsModalSupplier?.name ?? ""}`}
        size="md"
      >
        <div className="supplier-products-table">
          {/* Padding compacto exclusivo de esta tabla: DataTable usa estilos inline,
              así que se sobreescribe con !important solo dentro de este wrapper para
              no afectar el DataTable de la vista principal ni el de otras vistas. */}
          <style>{`
            .supplier-products-table table th {
              padding: 8px 12px !important;
            }
            .supplier-products-table table td {
              padding: 8px 12px !important;
              font-size: 13px !important;
            }
          `}</style>
          <DataTable
            columns={supplierProductColumns}
            data={supplierProducts}
            loading={productsLoading}
            error={productsError}
            emptyMessage="Este proveedor no tiene productos asociados."
            keyExtractor={(p) => p.sku}
            maxHeight="45vh"
          />
        </div>
      </ActionModal>

      {/* Confirmación de activar/desactivar proveedor */}
      <ConfirmModal
        isOpen={confirmToggleSupplier !== null}
        title={`${confirmToggleSupplier?.active ? "Desactivar" : "Activar"} proveedor`}
        message={`¿Confirmar ${confirmToggleSupplier?.active ? "desactivación" : "activación"} del proveedor "${confirmToggleSupplier?.name}"?`}
        confirmLabel="Confirmar"
        cancelLabel="Cancelar"
        variant={confirmToggleSupplier?.active ? "danger" : "info"}
        loading={togglingActive}
        onConfirm={handleConfirmToggle}
        onClose={() => setConfirmToggleSupplier(null)}
      />

      {/* Sugerencias de Autocompletado */}
      <datalist id="supplier-addresses">
        {uniqueAddresses.map((addr) => (
          <option key={addr} value={addr} />
        ))}
      </datalist>
      <datalist id="supplier-cities">
        {uniqueCities.map((city) => (
          <option key={city} value={city} />
        ))}
      </datalist>
      <datalist id="supplier-states">
        {uniqueStates.map((state) => (
          <option key={state} value={state} />
        ))}
      </datalist>
      <datalist id="supplier-zips">
        {uniqueZips.map((zip) => (
          <option key={zip} value={zip} />
        ))}
      </datalist>
    </div>
  );
};

export default ProveedoresView;
