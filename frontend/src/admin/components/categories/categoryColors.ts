import type { CategoryLevel } from "../../services/categoryAdmin.service";

export const CATEGORY_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;
export const CATEGORY_COLOR_ERROR = "Ingresa un color hexadecimal válido.";
export const DEFAULT_CATEGORY_PICKER_COLOR = "#3B82F6";

export interface CategoryColorOption {
  label: string;
  value: string;
}

export const CATEGORY_COLOR_PALETTE: CategoryColorOption[] = [
  { label: "Azul", value: "#3B82F6" },
  { label: "Verde", value: "#22C55E" },
  { label: "Rojo", value: "#EF4444" },
  { label: "Naranja", value: "#F59E0B" },
  { label: "Morado", value: "#8B5CF6" },
  { label: "Rosa", value: "#EC4899" },
  { label: "Gris", value: "#64748B" },
];

const DEFAULT_LEVEL_COLORS: Record<CategoryLevel, string> = {
  DIVISION: "#334155",
  DEPARTMENT: "#64748B",
  CATEGORY: "#2563EB",
};

export const normalizeCategoryColor = (value: string): string => value.trim().toUpperCase();

export const isValidCategoryColor = (value: string | null | undefined): boolean =>
  Boolean(value && CATEGORY_COLOR_REGEX.test(value.trim()));

export const getCategoryDisplayColor = (
  color: string | null | undefined,
  level: CategoryLevel,
  active = true
): string => {
  if (!active) return "#94A3B8";
  if (isValidCategoryColor(color)) return normalizeCategoryColor(color ?? "");
  return DEFAULT_LEVEL_COLORS[level];
};

