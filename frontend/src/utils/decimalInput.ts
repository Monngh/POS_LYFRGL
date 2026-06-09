export const DECIMAL_INPUT_REGEX = /^\d*(?:\.\d{0,3})?$/;
export const DECIMAL_SAVE_REGEX = /^\d+(?:\.\d{0,3})?$/;

export type DecimalValidationResult = DecimalValidationSuccess | DecimalValidationFailure;

export interface DecimalValidationSuccess {
  ok: true;
  value: DecimalFieldValue;
}

export interface DecimalValidationFailure {
  ok: false;
  error: string;
}

export interface DecimalFieldValue {
  value: number;
  roundedMessage?: string;
}

export interface DecimalValidationOptions {
  min?: number;
  max?: number;
  minExclusive?: boolean;
  requiredMessage?: string;
  invalidMessage?: string;
  minMessage?: string;
  maxMessage?: string;
}

export const roundToTwoDecimals = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;

export const formatDecimalValue = (value: number) => value.toFixed(2);

export const handleDecimalInputChange = (value: string, setter: (nextValue: string) => void) => {
  const cleanValue = value.trim();

  if (cleanValue === "" || DECIMAL_INPUT_REGEX.test(cleanValue)) {
    setter(cleanValue);
  }
};

export const validateDecimalField = (
  rawValue: string | number,
  fieldLabel: string,
  options: DecimalValidationOptions = {},
): DecimalValidationResult => {
  const raw = String(rawValue).trim();
  const min = options.min ?? 0;

  if (!raw) {
    return { ok: false, error: options.requiredMessage || `${fieldLabel} es requerido.` };
  }

  if (raw.startsWith("-")) {
    return { ok: false, error: options.minMessage || `${fieldLabel} no puede ser negativo.` };
  }

  const parts = raw.split(".");
  if (parts.length > 2 || (parts.length === 2 && parts[1].length > 3) || !DECIMAL_SAVE_REGEX.test(raw)) {
    return {
      ok: false,
      error: options.invalidMessage || `${fieldLabel} debe ser un numero valido con maximo 3 decimales.`,
    };
  }

  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return {
      ok: false,
      error: options.invalidMessage || `${fieldLabel} debe ser un numero valido.`,
    };
  }

  const belowMin = options.minExclusive ? value <= min : value < min;
  if (belowMin) {
    return {
      ok: false,
      error:
        options.minMessage ||
        (options.minExclusive
          ? `${fieldLabel} debe ser mayor a ${formatDecimalValue(min)}.`
          : `${fieldLabel} no puede ser menor a ${formatDecimalValue(min)}.`),
    };
  }

  if (options.max !== undefined && value > options.max) {
    return {
      ok: false,
      error: options.maxMessage || `${fieldLabel} no puede ser mayor a ${formatDecimalValue(options.max)}.`,
    };
  }

  const rounded = roundToTwoDecimals(value);
  const decimalPart = parts.length === 2 ? parts[1] : "";

  return {
    ok: true,
    value: {
      value: rounded,
      roundedMessage:
        decimalPart.length > 2 && rounded !== value
          ? `${fieldLabel} fue redondeado a ${formatDecimalValue(rounded)} porque solo se permiten 2 decimales.`
          : undefined,
    },
  };
};

export const getDecimalValidationError = (result: DecimalValidationResult) =>
  result.ok ? null : result.error;

export const getDecimalValidationValue = (result: DecimalValidationResult) =>
  result.ok ? result.value : null;

export const collectRoundedDecimalMessages = (
  values: Array<DecimalFieldValue | null | undefined>,
) => values.map((value) => value?.roundedMessage).filter((message): message is string => Boolean(message));
