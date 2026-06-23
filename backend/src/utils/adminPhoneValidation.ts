const LATAM_COUNTRY_CODES = new Set([
  "+52",
  "+54",
  "+591",
  "+55",
  "+56",
  "+57",
  "+506",
  "+53",
  "+593",
  "+503",
  "+502",
  "+504",
  "+505",
  "+507",
  "+595",
  "+51",
  "+1",
  "+598",
  "+58",
]);

export const DEFAULT_PHONE_COUNTRY_CODE = "+52";

export const validateAdminLocalPhone = (
  phone: unknown,
  phoneCountryCode: unknown,
  options: { required?: boolean } = {},
): string | undefined => {
  const localPhone = typeof phone === "string" || typeof phone === "number"
    ? String(phone).trim()
    : "";
  const countryCode = typeof phoneCountryCode === "string" && phoneCountryCode.trim()
    ? phoneCountryCode.trim()
    : DEFAULT_PHONE_COUNTRY_CODE;

  if (!LATAM_COUNTRY_CODES.has(countryCode)) return "La LADA seleccionada no es válida.";
  if (!localPhone) return options.required ? "El teléfono es obligatorio." : undefined;
  if (!/^\d+$/.test(localPhone)) return "El teléfono solo puede contener números.";

  if (countryCode === DEFAULT_PHONE_COUNTRY_CODE) {
    return localPhone.length === 10
      ? undefined
      : "El teléfono debe tener exactamente 10 dígitos.";
  }

  return localPhone.length >= 7 && localPhone.length <= 15
    ? undefined
    : "El teléfono debe contener entre 7 y 15 dígitos.";
};
