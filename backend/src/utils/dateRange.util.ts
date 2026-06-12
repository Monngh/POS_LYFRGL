interface QueryDateRange {
  [key: string]: unknown;
}

export interface ValidatedDateRange {
  from: Date;
  to: Date;
  errorStatus?: number;
  errorMessage?: string;
}

export interface OptionalDateRange {
  from?: Date;
  to?: Date;
  errorStatus?: number;
  errorMessage?: string;
}

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const INVALID_DATE_MESSAGE = "Fecha inicial o fecha final invalida.";

const readDateParam = (query: QueryDateRange, keys: string[]): { present: boolean; value?: string; invalidType?: boolean } => {
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(query, key)) continue;
    const raw = query[key];
    if (typeof raw !== "string") return { present: true, invalidType: true };
    const value = raw.trim();
    return value ? { present: true, value } : { present: true, invalidType: true };
  }

  return { present: false };
};

const parseDateOnly = (value: string, endOfDay: boolean): Date | null => {
  if (!DATE_ONLY_PATTERN.test(value)) return null;

  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const parsed = endOfDay
    ? new Date(year, month - 1, day, 23, 59, 59, 999)
    : new Date(year, month - 1, day, 0, 0, 0, 0);

  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }

  return parsed;
};

export const parseReportDateRange = (query: QueryDateRange, defaultDaysBack = 29): ValidatedDateRange => {
  const startDateParam = readDateParam(query, ["startDate", "from"]);
  const endDateParam = readDateParam(query, ["endDate", "to"]);

  if (startDateParam.invalidType || endDateParam.invalidType) {
    return { from: new Date(), to: new Date(), errorStatus: 400, errorMessage: INVALID_DATE_MESSAGE };
  }

  const now = new Date();
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate() - defaultDaysBack, 0, 0, 0, 0);
  const from = startDateParam.value ? parseDateOnly(startDateParam.value, false) : defaultFrom;
  const to = endDateParam.value ? parseDateOnly(endDateParam.value, true) : now;

  if (!from || !to) {
    return { from: new Date(), to: new Date(), errorStatus: 400, errorMessage: INVALID_DATE_MESSAGE };
  }

  if (from.getTime() > to.getTime()) {
    return { from, to, errorStatus: 400, errorMessage: "La fecha inicial no puede ser mayor que la fecha final." };
  }

  return { from, to };
};

export const parseOptionalDateRange = (query: QueryDateRange): OptionalDateRange => {
  const startDateParam = readDateParam(query, ["startDate", "from"]);
  const endDateParam = readDateParam(query, ["endDate", "to"]);

  if (!startDateParam.present && !endDateParam.present) return {};

  if (startDateParam.invalidType || endDateParam.invalidType) {
    return { errorStatus: 400, errorMessage: INVALID_DATE_MESSAGE };
  }

  let from: Date | undefined;
  let to: Date | undefined;

  if (startDateParam.value) {
    const parsedFrom = parseDateOnly(startDateParam.value, false);
    if (!parsedFrom) return { errorStatus: 400, errorMessage: INVALID_DATE_MESSAGE };
    from = parsedFrom;
  }

  if (endDateParam.value) {
    const parsedTo = parseDateOnly(endDateParam.value, true);
    if (!parsedTo) return { errorStatus: 400, errorMessage: INVALID_DATE_MESSAGE };
    to = parsedTo;
  }

  if (from && to && from.getTime() > to.getTime()) {
    return { from, to, errorStatus: 400, errorMessage: "La fecha inicial no puede ser mayor que la fecha final." };
  }

  return { from, to };
};
