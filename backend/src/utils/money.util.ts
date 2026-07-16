export const MONEY_DECIMAL_PLACES = 2;
export const MONEY_SCALE = 100;

export const roundMoney = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Number((Math.round((value + Number.EPSILON) * MONEY_SCALE) / MONEY_SCALE).toFixed(MONEY_DECIMAL_PLACES));
};

export const toMoneyCents = (value: number): number => {
  if (!Number.isFinite(value)) {
    throw new Error("INVALID_MONEY_VALUE");
  }
  return Math.round((value + Number.EPSILON) * MONEY_SCALE);
};

export const fromMoneyCents = (cents: number): number =>
  Number((cents / MONEY_SCALE).toFixed(MONEY_DECIMAL_PLACES));

export const hasMaxDecimalPlaces = (value: unknown, places = MONEY_DECIMAL_PLACES): boolean => {
  if (value === null || value === undefined || value === "") return true;
  if (typeof value === "boolean") return false;

  const raw = String(value).trim();
  if (!raw || raw.includes("e") || raw.includes("E")) return false;

  const [, decimalPart = ""] = raw.split(".");
  return decimalPart.length <= places;
};

export const formatMoney = (value: number): string => `$${roundMoney(value).toFixed(MONEY_DECIMAL_PLACES)}`;
