export interface LatamCountryCode {
  code: string;
  country: string;
  iso: string;
}

export const LATAM_COUNTRY_CODES: readonly LatamCountryCode[] = [
  { code: "+52", country: "México", iso: "MX" },
  { code: "+54", country: "Argentina", iso: "AR" },
  { code: "+591", country: "Bolivia", iso: "BO" },
  { code: "+55", country: "Brasil", iso: "BR" },
  { code: "+56", country: "Chile", iso: "CL" },
  { code: "+57", country: "Colombia", iso: "CO" },
  { code: "+506", country: "Costa Rica", iso: "CR" },
  { code: "+53", country: "Cuba", iso: "CU" },
  { code: "+593", country: "Ecuador", iso: "EC" },
  { code: "+503", country: "El Salvador", iso: "SV" },
  { code: "+502", country: "Guatemala", iso: "GT" },
  { code: "+504", country: "Honduras", iso: "HN" },
  { code: "+505", country: "Nicaragua", iso: "NI" },
  { code: "+507", country: "Panamá", iso: "PA" },
  { code: "+595", country: "Paraguay", iso: "PY" },
  { code: "+51", country: "Perú", iso: "PE" },
  { code: "+1", country: "Puerto Rico", iso: "PR" },
  { code: "+1", country: "República Dominicana", iso: "DO" },
  { code: "+598", country: "Uruguay", iso: "UY" },
  { code: "+58", country: "Venezuela", iso: "VE" },
];

export const DEFAULT_PHONE_COUNTRY_ISO = "MX";
export const MEXICO_COUNTRY_CODE = "+52";
export const MEXICAN_PHONE_ERROR = "El teléfono debe tener exactamente 10 dígitos.";
export const INTERNATIONAL_PHONE_ERROR = "El teléfono debe contener entre 7 y 15 dígitos.";

export const getCountryCodeByIso = (iso: string): LatamCountryCode =>
  LATAM_COUNTRY_CODES.find((country) => country.iso === iso) ?? LATAM_COUNTRY_CODES[0];

export const countryFlag = (iso: string): string =>
  String.fromCodePoint(...iso.toUpperCase().split("").map((letter) => 127397 + letter.charCodeAt(0)));

export const normalizeLocalPhone = (value: string, countryCode: string): string => {
  const digits = value.replace(/\D/g, "");
  const localDigits = countryCode === MEXICO_COUNTRY_CODE && digits.length > 10 && digits.startsWith("52")
    ? digits.slice(2)
    : digits;

  return localDigits.slice(0, countryCode === MEXICO_COUNTRY_CODE ? 10 : 15);
};

export const phoneToAdminFormValue = (value: string | null | undefined): string => {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length <= 10) return digits;
  if (digits.startsWith("52")) return digits.slice(2, 12);
  return digits.slice(-10);
};

export const validateLocalPhone = (
  value: string,
  countryCode: string,
  options: { required?: boolean } = {},
): string | undefined => {
  if (!value) return options.required ? "El teléfono es obligatorio." : undefined;
  if (countryCode === MEXICO_COUNTRY_CODE) {
    return /^\d{10}$/.test(value) ? undefined : MEXICAN_PHONE_ERROR;
  }
  return /^\d{7,15}$/.test(value) ? undefined : INTERNATIONAL_PHONE_ERROR;
};
