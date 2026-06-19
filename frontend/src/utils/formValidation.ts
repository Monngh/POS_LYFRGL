export type FieldErrors<T extends string = string> = Partial<Record<T, string>>;

export type ValidatorRule =
  | { type: "required"; message?: string }
  | { type: "textSafe"; label?: string; min?: number; max?: number; required?: boolean }
  | { type: "referenceSafe"; label?: string; max?: number; required?: boolean }
  | { type: "rfc"; required?: boolean }
  | { type: "email"; required?: boolean; maxLength?: number }
  | { type: "phone"; required?: boolean; minDigits?: number; maxDigits?: number }
  | { type: "integer"; label?: string; required?: boolean; min?: number; max?: number }
  | { type: "decimalMoney"; label?: string; required?: boolean; min?: number; max?: number; minExclusive?: boolean }
  | { type: "sku"; required?: boolean }
  | { type: "barcode"; required?: boolean }
  | { type: "searchSafe"; label?: string; max?: number };

export const SAFE_TEXT_PATTERN = /^[A-Za-z\u00C1\u00C9\u00CD\u00D3\u00DA\u00E1\u00E9\u00ED\u00F3\u00FA\u00D1\u00F1\u00DC\u00FC0-9\s.,#\/()-]+$/;
export const SAFE_REFERENCE_PATTERN = /^[A-Za-z\u00C1\u00C9\u00CD\u00D3\u00DA\u00E1\u00E9\u00ED\u00F3\u00FA\u00D1\u00F1\u00DC\u00FC0-9\s.,#_\/:-]+$/;
export const SAFE_SEARCH_PATTERN = /^[A-Za-z\u00C1\u00C9\u00CD\u00D3\u00DA\u00E1\u00E9\u00ED\u00F3\u00FA\u00D1\u00F1\u00DC\u00FC0-9\s.,#_\/:@()+-]+$/;
export const RFC_PATTERN = /^[A-Z\u00D1&]{3,4}[0-9]{6}[A-Z0-9]{3}$/;
export const PHONE_PATTERN = /^[0-9\s()+-]+$/;
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const INTEGER_PATTERN = /^\d+$/;
export const DECIMAL_MONEY_INPUT_PATTERN = /^\d*(?:\.\d{0,3})?$/;
export const DECIMAL_MONEY_SAVE_PATTERN = /^\d+(?:\.\d{1,3})?$/;
export const SKU_PATTERN = /^[A-Za-z0-9_-]+$/;
export const BARCODE_PATTERN = /^[0-9]+$/;
export const DATE_INPUT_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const DANGEROUS_PATTERN = /[<>{}[\]`~|\\]/;
const EMOJI_PATTERN = /[\p{Extended_Pictographic}\uFE0F]/u;

export const normalizeSpaces = (value: string) => value.trim().replace(/\s+/g, " ");

export const hasEmoji = (value: string) => EMOJI_PATTERN.test(value);

export const hasDangerousChars = (value: string) => DANGEROUS_PATTERN.test(value);

export const normalizeRfcInput = (value: string) =>
  value.toUpperCase().replace(/\s+/g, "").replace(/[^A-Z\u00D1&0-9]/g, "");

export const normalizeEmailInput = (value: string) => value.trim().toLowerCase();

export const normalizePhoneInput = (value: string) => value.replace(/[^0-9\s()+-]/g, "");

export const normalizeIntegerInput = (value: string) => value.replace(/\D/g, "");

export const normalizeSkuInput = (value: string) => value.replace(/[^A-Za-z0-9_-]/g, "");

export const normalizeBarcodeInput = (value: string) => value.replace(/\D/g, "");

export const required = (value: string, message = "Este campo es obligatorio.") =>
  normalizeSpaces(value) ? undefined : message;

export const validateSafeText = (
  value: string,
  label: string,
  options: { required?: boolean; min?: number; max?: number } = {},
) => {
  const v = normalizeSpaces(value);
  if (!v) return options.required === false ? undefined : `${label} es obligatorio.`;
  if (options.min !== undefined && v.length < options.min) return `${label} debe tener al menos ${options.min} caracteres.`;
  if (options.max !== undefined && v.length > options.max) return `${label} no puede exceder ${options.max} caracteres.`;
  if (hasEmoji(v) || hasDangerousChars(v) || !SAFE_TEXT_PATTERN.test(v)) {
    return `${label} contiene caracteres no permitidos.`;
  }
  return undefined;
};

export const validateReference = (
  value: string,
  label = "La referencia",
  options: { required?: boolean; max?: number } = {},
) => {
  const v = normalizeSpaces(value);
  if (!v) return options.required ? `${label} es obligatoria.` : undefined;
  if (options.max !== undefined && v.length > options.max) return `${label} no puede exceder ${options.max} caracteres.`;
  if (hasEmoji(v) || hasDangerousChars(v) || !SAFE_REFERENCE_PATTERN.test(v)) {
    return `${label} contiene caracteres no permitidos.`;
  }
  return undefined;
};

export const validateSearchText = (
  value: string,
  label = "La busqueda",
  options: { max?: number } = {},
) => {
  const v = normalizeSpaces(value);
  if (!v) return undefined;
  if (options.max !== undefined && v.length > options.max) return `${label} no puede exceder ${options.max} caracteres.`;
  if (hasEmoji(v) || hasDangerousChars(v) || !SAFE_SEARCH_PATTERN.test(v)) {
    return `${label} contiene caracteres no permitidos.`;
  }
  return undefined;
};

export const validateRfc = (value: string, options: { required?: boolean } = {}) => {
  const v = normalizeRfcInput(value);
  if (!v) return options.required ? "El RFC es obligatorio." : undefined;
  if (v.length !== 12 && v.length !== 13) return "El RFC debe tener un formato valido.";
  if (!RFC_PATTERN.test(v)) return "El RFC debe tener un formato valido.";
  return undefined;
};

export const validatePhone = (value: string, options: { required?: boolean; minDigits?: number; maxDigits?: number } = {}) => {
  const v = normalizeSpaces(value);
  if (!v) return options.required ? "El telefono es obligatorio." : undefined;
  if (hasEmoji(v) || !PHONE_PATTERN.test(v)) {
    return "El telefono solo puede contener numeros, espacios, +, - y parentesis.";
  }
  const digits = v.replace(/\D/g, "");
  const min = options.minDigits ?? 10;
  const max = options.maxDigits ?? 15;
  if (digits.length < min || digits.length > max) return `El telefono debe tener entre ${min} y ${max} digitos.`;
  return undefined;
};

export const validateMexicanPhone = (value: string, options: { required?: boolean } = {}) => {
  const v = normalizeSpaces(value);
  if (!v) return options.required ? "El telefono es obligatorio." : undefined;
  if (hasEmoji(v) || !PHONE_PATTERN.test(v)) {
    return "El telefono solo puede contener numeros, espacios, +, - y parentesis.";
  }
  const digits = v.replace(/\D/g, "");
  if (digits.length !== 10) return "El telefono debe tener exactamente 10 digitos.";
  return undefined;
};

export const validateEmail = (
  value: string,
  options: { required?: boolean; maxLength?: number } = {},
) => {
  const v = normalizeEmailInput(value);
  if (!v) return options.required ? "El correo es obligatorio." : undefined;
  if (options.maxLength !== undefined && v.length > options.maxLength) {
    return `El correo no puede exceder ${options.maxLength} caracteres.`;
  }
  if (/\s/.test(v) || hasEmoji(v) || !EMAIL_PATTERN.test(v)) {
    return "El correo no tiene un formato valido.";
  }
  return undefined;
};

export const validateDateInput = (value: string, label = "La fecha") => {
  const raw = value.trim();
  if (!raw) return `${label} es obligatoria.`;
  if (!DATE_INPUT_PATTERN.test(raw)) return `${label} no es valida.`;

  const [year, month, day] = raw.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return `${label} no es valida.`;
  }
  return undefined;
};

export const validateDateRange = (
  startDate: string,
  endDate: string,
  options: { startLabel?: string; endLabel?: string } = {},
) => {
  const startLabel = options.startLabel ?? "La fecha inicial";
  const endLabel = options.endLabel ?? "La fecha final";
  const startError = validateDateInput(startDate, startLabel);
  if (startError) return startError;
  const endError = validateDateInput(endDate, endLabel);
  if (endError) return endError;
  if (startDate > endDate) return `${startLabel} no puede ser mayor que ${endLabel.toLowerCase()}.`;
  return undefined;
};

export const validateCatalogValue = (
  value: string,
  allowedValues: readonly string[],
  label: string,
  options: { required?: boolean } = {},
) => {
  const normalized = value.trim();
  if (!normalized) return options.required === false ? undefined : `Selecciona ${label}.`;
  if (!allowedValues.includes(normalized)) return `Selecciona ${label} valida.`;
  return undefined;
};

export const validatePassword = (
  value: string,
  options: {
    required?: boolean;
    minLength?: number;
    maxLength?: number;
    requireLetterAndNumber?: boolean;
  } = {},
) => {
  const minLength = options.minLength ?? 6;
  const maxLength = options.maxLength ?? 128;
  if (!value) return options.required === false ? undefined : "La contrasena es obligatoria.";
  if (value.length < minLength) return `La contrasena debe tener al menos ${minLength} caracteres.`;
  if (value.length > maxLength) return `La contrasena no puede exceder ${maxLength} caracteres.`;
  if (options.requireLetterAndNumber !== false && (!/[A-Za-z]/.test(value) || !/\d/.test(value))) {
    return "La contrasena debe incluir al menos una letra y un numero.";
  }
  return undefined;
};

export const validatePasswordConfirmation = (password: string, confirmation: string) => {
  if (!confirmation) return "Confirma la contrasena.";
  if (password !== confirmation) return "Las contrasenas no coinciden.";
  return undefined;
};

export const validateInteger = (
  value: string | number,
  label: string,
  options: { required?: boolean; min?: number; max?: number } = {},
) => {
  const raw = String(value).trim();
  if (!raw) return options.required === false ? undefined : `${label} es obligatorio.`;
  if (hasEmoji(raw) || !INTEGER_PATTERN.test(raw)) return `${label} solo puede contener numeros enteros.`;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed)) return `${label} no es un numero valido.`;
  if (options.min !== undefined && parsed < options.min) return `${label} no puede ser menor a ${options.min}.`;
  if (options.max !== undefined && parsed > options.max) return `${label} no puede ser mayor a ${options.max}.`;
  return undefined;
};

export const validateDecimalMoney = (
  value: string | number,
  label: string,
  options: { required?: boolean; min?: number; max?: number; minExclusive?: boolean } = {},
) => {
  const raw = String(value).trim();
  const min = options.min ?? 0;
  if (!raw) return options.required === false ? undefined : `${label} es obligatorio.`;
  if (hasEmoji(raw) || raw.startsWith("-") || !DECIMAL_MONEY_SAVE_PATTERN.test(raw)) {
    return `${label} debe ser un numero valido con maximo 3 decimales.`;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return `${label} no es un numero valido.`;
  if (options.minExclusive ? parsed <= min : parsed < min) {
    return options.minExclusive ? `${label} debe ser mayor a ${min}.` : `${label} no puede ser menor a ${min}.`;
  }
  if (options.max !== undefined && parsed > options.max) return `${label} no puede ser mayor a ${options.max}.`;
  return undefined;
};

export const validateSku = (value: string, options: { required?: boolean } = {}) => {
  const raw = value.trim();
  if (!raw) return options.required === false ? undefined : "El SKU es obligatorio.";
  if (hasEmoji(raw) || !SKU_PATTERN.test(raw)) return "El SKU solo permite letras, numeros, guion medio y guion bajo.";
  return undefined;
};

export const validateBarcode = (value: string, options: { required?: boolean } = {}) => {
  const raw = value.trim();
  if (!raw) return options.required ? "El codigo de barras es obligatorio." : undefined;
  if (hasEmoji(raw) || !BARCODE_PATTERN.test(raw)) return "El codigo de barras solo puede contener numeros.";
  return undefined;
};

export const validateField = (value: string, rules: ValidatorRule[]) => {
  for (const rule of rules) {
    let error: string | undefined;
    if (rule.type === "required") error = required(value, rule.message);
    if (rule.type === "textSafe") error = validateSafeText(value, rule.label || "El campo", rule);
    if (rule.type === "referenceSafe") error = validateReference(value, rule.label || "La referencia", rule);
    if (rule.type === "rfc") error = validateRfc(value, rule);
    if (rule.type === "email") error = validateEmail(value, rule);
    if (rule.type === "phone") error = validatePhone(value, rule);
    if (rule.type === "integer") error = validateInteger(value, rule.label || "El campo", rule);
    if (rule.type === "decimalMoney") error = validateDecimalMoney(value, rule.label || "El monto", rule);
    if (rule.type === "sku") error = validateSku(value, rule);
    if (rule.type === "barcode") error = validateBarcode(value, rule);
    if (rule.type === "searchSafe") error = validateSearchText(value, rule.label, rule);
    if (error) return error;
  }
  return undefined;
};

export const validateForm = <T extends Record<string, string>>(
  form: T,
  rules: Partial<Record<keyof T, ValidatorRule[]>>,
) => {
  const errors: FieldErrors<Extract<keyof T, string>> = {};
  (Object.keys(rules) as Array<keyof T>).forEach((key) => {
    const fieldRules = rules[key];
    if (!fieldRules) return;
    const error = validateField(String(form[key] ?? ""), fieldRules);
    if (error) errors[key as Extract<keyof T, string>] = error;
  });
  return errors;
};
