export type ReportPeriod =
  | "daily"
  | "weekly"
  | "monthly"
  | "bimonthly"
  | "quarterly"
  | "semester"
  | "yearly"
  | "custom";

export const REPORT_PERIOD_OPTIONS: { value: ReportPeriod; label: string }[] = [
  { value: "daily", label: "Diario" },
  { value: "weekly", label: "Semanal" },
  { value: "monthly", label: "Mensual" },
  { value: "bimonthly", label: "Bimestral" },
  { value: "quarterly", label: "Trimestral" },
  { value: "semester", label: "Semestral" },
  { value: "yearly", label: "Anual" },
  { value: "custom", label: "Personalizado" },
];

export const isReportPeriod = (value: string): value is ReportPeriod =>
  REPORT_PERIOD_OPTIONS.some((option) => option.value === value);

export const CUSTOM_REPORT_PERIOD = "custom" as const;

const pad = (value: number): string => String(value).padStart(2, "0");
const DATE_INPUT_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const toDateInputValue = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const dateAtLocalMidnight = (year: number, month: number, day: number): Date =>
  new Date(year, month, day, 0, 0, 0, 0);

export const daysAgoInputValue = (days: number, baseDate = new Date()): string => {
  const date = dateAtLocalMidnight(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());
  date.setDate(date.getDate() - days);
  return toDateInputValue(date);
};

export const getReportDateRange = (
  period: Exclude<ReportPeriod, "custom">,
  baseDate = new Date()
): { startDate: string; endDate: string } => {
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth();
  const day = baseDate.getDate();

  if (period === "daily") {
    const today = dateAtLocalMidnight(year, month, day);
    return { startDate: toDateInputValue(today), endDate: toDateInputValue(today) };
  }

  if (period === "weekly") {
    const start = dateAtLocalMidnight(year, month, day);
    const mondayBasedDay = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - mondayBasedDay);
    const end = dateAtLocalMidnight(start.getFullYear(), start.getMonth(), start.getDate() + 6);
    return { startDate: toDateInputValue(start), endDate: toDateInputValue(end) };
  }

  if (period === "monthly") {
    return {
      startDate: toDateInputValue(dateAtLocalMidnight(year, month, 1)),
      endDate: toDateInputValue(dateAtLocalMidnight(year, month + 1, 0)),
    };
  }

  if (period === "bimonthly") {
    const startMonth = Math.floor(month / 2) * 2;
    return {
      startDate: toDateInputValue(dateAtLocalMidnight(year, startMonth, 1)),
      endDate: toDateInputValue(dateAtLocalMidnight(year, startMonth + 2, 0)),
    };
  }

  if (period === "quarterly") {
    const startMonth = Math.floor(month / 3) * 3;
    return {
      startDate: toDateInputValue(dateAtLocalMidnight(year, startMonth, 1)),
      endDate: toDateInputValue(dateAtLocalMidnight(year, startMonth + 3, 0)),
    };
  }

  if (period === "semester") {
    const startMonth = month < 6 ? 0 : 6;
    return {
      startDate: toDateInputValue(dateAtLocalMidnight(year, startMonth, 1)),
      endDate: toDateInputValue(dateAtLocalMidnight(year, startMonth + 6, 0)),
    };
  }

  return {
    startDate: toDateInputValue(dateAtLocalMidnight(year, 0, 1)),
    endDate: toDateInputValue(dateAtLocalMidnight(year, 11, 31)),
  };
};

export const formatDateInputForDisplay = (value: string): string => {
  const parts = value.split("-");
  if (parts.length !== 3) return value;
  const [year, month, day] = parts;
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
};

export const formatReportRangeLabel = (startDate: string, endDate: string): string =>
  startDate && endDate
    ? `${formatDateInputForDisplay(startDate)} - ${formatDateInputForDisplay(endDate)}`
    : "Rango incompleto";

export const validateReportDateRange = (startDate: string, endDate: string): string | null => {
  if (!startDate || !endDate) return "Seleccione fecha inicial y fecha final.";
  if (!isValidDateInputValue(startDate) || !isValidDateInputValue(endDate)) {
    return "Fecha inicial o fecha final invalida.";
  }
  if (startDate > endDate) return "La fecha inicial no puede ser mayor que la fecha final.";
  return null;
};

const isValidDateInputValue = (value: string): boolean => {
  if (!DATE_INPUT_PATTERN.test(value)) return false;

  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const parsed = new Date(year, month - 1, day);

  return (
    parsed.getFullYear() === year &&
    parsed.getMonth() === month - 1 &&
    parsed.getDate() === day
  );
};
