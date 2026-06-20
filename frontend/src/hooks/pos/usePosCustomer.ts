import { useState, useEffect } from "react";
import api from "../../services/api";
import {
  normalizePhoneInput,
  normalizeEmailInput,
  validateSafeText,
  validatePhone,
  validateEmail,
  validateSearchText,
} from "../../utils/formValidation";

interface Customer {
  id: number;
  name: string;
  phone: string;
  email?: string;
  points: number;
}

type NewCustomerForm = { name: string; phone: string; email: string };

const validateNameInput = (value: string): string =>
  value
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, "")
    .replace(/[^a-záéíóúàèìòùäëïöüâêîôûñçA-ZÁÉÍÓÚÀÈÌÒÙÄËÏÖÜÂÊÎÔÛÑÇ\s]/g, "");

interface UsePosCustomerProps {
  onToast: (msg: string, type?: "error" | "success" | "info") => void;
  view: "dashboard" | "apertura" | "sales-terminal";
}

export function usePosCustomer({ onToast, view }: UsePosCustomerProps) {
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerSearchError, setCustomerSearchError] = useState("");
  const [customerSearchResults, setCustomerSearchResults] = useState<Customer[]>([]);
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
  const [isNewCustomerModalOpen, setIsNewCustomerModalOpen] = useState(false);
  const [newCustomerForm, setNewCustomerFormState] = useState<NewCustomerForm>({
    name: "",
    phone: "",
    email: "",
  });
  const [newCustomerFieldErrors, setNewCustomerFieldErrors] = useState<
    Partial<Record<keyof NewCustomerForm, string>>
  >({});
  const [newCustomerLoading, setNewCustomerLoading] = useState(false);
  const [newCustomerError, setNewCustomerError] = useState<string | null>(null);

  const validateNewCustomerField = (field: keyof NewCustomerForm, value: string) => {
    if (field === "name") return validateSafeText(value, "El nombre", { required: true, min: 2, max: 100 });
    if (field === "phone") return validatePhone(value, { required: true });
    if (field === "email") return validateEmail(value, { required: false });
    return undefined;
  };

  const validateNewCustomerForm = () => {
    const errors: Partial<Record<keyof NewCustomerForm, string>> = {};
    (Object.keys(newCustomerForm) as Array<keyof NewCustomerForm>).forEach((field) => {
      const error = validateNewCustomerField(field, newCustomerForm[field]);
      if (error) errors[field] = error;
    });
    return errors;
  };

  const setNewCustomerField =
    (field: keyof NewCustomerForm) =>
    (value: string) => {
      const nextValue =
        field === "phone"
          ? normalizePhoneInput(value).slice(0, 20)
          : field === "email"
          ? normalizeEmailInput(value)
          : field === "name"
          ? validateNameInput(value)
          : value;
      setNewCustomerFormState((prev) => ({ ...prev, [field]: nextValue }));
      setNewCustomerError(null);
      setNewCustomerFieldErrors((prev) => {
        const next = { ...prev };
        const error = validateNewCustomerField(field, nextValue);
        if (error) next[field] = error;
        else delete next[field];
        return next;
      });
    };

  const setNewCustomerForm = (form: NewCustomerForm) => setNewCustomerFormState(form);

  const handleSelectCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    setCustomerSearch("");
    setCustomerSearchResults([]);
    setIsCustomerDropdownOpen(false);
  };

  const handleClearCustomer = (onExtra?: () => void) => {
    setSelectedCustomer(null);
    onToast("Cliente removido del carrito.", "info");
    if (onExtra) onExtra();
  };

  const handleRegisterCustomerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors = validateNewCustomerForm();
    if (Object.keys(errors).length > 0) {
      setNewCustomerFieldErrors(errors);
      setNewCustomerError(null);
      return;
    }
    const { name, phone, email } = newCustomerForm;
    if (!name.trim() || !phone.trim()) {
      setNewCustomerError("El nombre y el teléfono son obligatorios.");
      return;
    }
    setNewCustomerLoading(true);
    setNewCustomerError(null);
    try {
      const res = await api.post("/api/sales/customers", {
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
      });
      setSelectedCustomer(res.data.customer);
      setCustomerSearch("");
      setCustomerSearchResults([]);
      setIsCustomerDropdownOpen(false);
      setIsNewCustomerModalOpen(false);
      setNewCustomerFormState({ name: "", phone: "", email: "" });
      setNewCustomerFieldErrors({});
      onToast("Cliente registrado y seleccionado.", "success");
    } catch (err: any) {
      setNewCustomerError(err.response?.data?.message || "Error al registrar cliente.");
    } finally {
      setNewCustomerLoading(false);
    }
  };

  useEffect(() => {
    if (view !== "sales-terminal") return;
    const query = customerSearch.trim();
    const searchError = validateSearchText(query, "La busqueda de cliente", { max: 120 });
    setCustomerSearchError(searchError || "");
    if (!query) {
      setCustomerSearchResults([]);
      setIsCustomerDropdownOpen(false);
      return;
    }
    if (searchError) {
      setCustomerSearchResults([]);
      setIsCustomerDropdownOpen(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await api.get(`/api/sales/customers/search?query=${query}`);
        setCustomerSearchResults(res.data.customers || []);
        setIsCustomerDropdownOpen(true);
      } catch (err) {
        console.error("Error al buscar clientes:", err);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [customerSearch, view]);

  return {
    selectedCustomer,
    setSelectedCustomer,
    customerSearch,
    setCustomerSearch,
    customerSearchError,
    setCustomerSearchError,
    customerSearchResults,
    setCustomerSearchResults,
    isCustomerDropdownOpen,
    setIsCustomerDropdownOpen,
    isNewCustomerModalOpen,
    setIsNewCustomerModalOpen,
    newCustomerForm,
    setNewCustomerForm,
    setNewCustomerField,
    newCustomerFieldErrors,
    setNewCustomerFieldErrors,
    newCustomerLoading,
    newCustomerError,
    setNewCustomerError,
    handleSelectCustomer,
    handleClearCustomer,
    handleRegisterCustomerSubmit,
  };
}
