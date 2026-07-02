import { createElement, type ReactElement } from "react";
import {
  Apple,
  Baby,
  Beer,
  Beef,
  BookOpen,
  BottleWine,
  CakeSlice,
  Car,
  Carrot,
  Candy,
  CircleDollarSign,
  Coffee,
  Cookie,
  CookingPot,
  CupSoda,
  Dumbbell,
  Fish,
  Flower2,
  Folder,
  FolderOpen,
  Gamepad2,
  Gift,
  GlassWater,
  Hammer,
  Headphones,
  HeartPulse,
  Laptop,
  Milk,
  NotebookPen,
  Package,
  PawPrint,
  Pill,
  Refrigerator,
  Sandwich,
  Shirt,
  ShoppingBag,
  ShoppingBasket,
  Sparkles,
  SprayCan,
  Smartphone,
  Snowflake,
  SoapDispenserDroplet,
  Sofa,
  Tag,
  Tv,
  Toilet as ToiletPaper,
  TreePine,
  WashingMachine,
  Wrench,
  type LucideIcon,
  type LucideProps,
} from "lucide-react";
import type { CategoryLevel } from "../../services/categoryAdmin.service";

export interface CategoryIconOption {
  value: string;
  label: string;
  Icon: LucideIcon;
  aliases?: string[];
}

export const CATEGORY_ICON_OPTIONS: CategoryIconOption[] = [
  { value: "tag", label: "Etiqueta", Icon: Tag, aliases: ["Tag"] },
  { value: "package", label: "Paquetes", Icon: Package, aliases: ["Package"] },
  { value: "shopping-basket", label: "Abarrotes", Icon: ShoppingBasket, aliases: ["ShoppingBasket"] },
  { value: "apple", label: "Frutas", Icon: Apple, aliases: ["Apple"] },
  { value: "carrot", label: "Verduras", Icon: Carrot, aliases: ["Carrot"] },
  { value: "beef", label: "Carnes", Icon: Beef, aliases: ["Beef"] },
  { value: "fish", label: "Pescados", Icon: Fish, aliases: ["Fish"] },
  { value: "milk", label: "Lácteos", Icon: Milk, aliases: ["Milk"] },
  { value: "snowflake", label: "Congelados", Icon: Snowflake, aliases: ["Snowflake"] },
  { value: "cake-slice", label: "Panadería", Icon: CakeSlice, aliases: ["CakeSlice"] },
  { value: "sandwich", label: "Comida preparada", Icon: Sandwich, aliases: ["Sandwich"] },
  { value: "cup-soda", label: "Bebidas", Icon: CupSoda, aliases: ["CupSoda"] },
  { value: "glass-water", label: "Agua", Icon: GlassWater, aliases: ["GlassWater"] },
  { value: "coffee", label: "Café", Icon: Coffee, aliases: ["Coffee"] },
  { value: "beer", label: "Cerveza", Icon: Beer, aliases: ["Beer"] },
  { value: "bottle-wine", label: "Vinos", Icon: BottleWine, aliases: ["BottleWine"] },
  { value: "candy", label: "Dulces", Icon: Candy, aliases: ["Candy"] },
  { value: "cookie", label: "Galletas", Icon: Cookie, aliases: ["Cookie"] },
  { value: "sparkles", label: "Belleza", Icon: Sparkles, aliases: ["Sparkles"] },
  { value: "heart-pulse", label: "Salud", Icon: HeartPulse, aliases: ["HeartPulse"] },
  { value: "pill", label: "Farmacia", Icon: Pill, aliases: ["Pill"] },
  { value: "baby", label: "Bebés", Icon: Baby, aliases: ["Baby"] },
  { value: "paw-print", label: "Mascotas", Icon: PawPrint, aliases: ["PawPrint"] },
  { value: "soap-dispenser-droplet", label: "Limpieza", Icon: SoapDispenserDroplet, aliases: ["SoapDispenserDroplet"] },
  { value: "spray-can", label: "Aerosoles", Icon: SprayCan, aliases: ["SprayCan"] },
  { value: "toilet-paper", label: "Papel higiénico", Icon: ToiletPaper, aliases: ["ToiletPaper", "Toilet"] },
  { value: "sofa", label: "Hogar", Icon: Sofa, aliases: ["Sofa"] },
  { value: "cooking-pot", label: "Cocina", Icon: CookingPot, aliases: ["CookingPot"] },
  { value: "refrigerator", label: "Línea blanca", Icon: Refrigerator, aliases: ["Refrigerator"] },
  { value: "washing-machine", label: "Lavandería", Icon: WashingMachine, aliases: ["WashingMachine"] },
  { value: "shirt", label: "Ropa", Icon: Shirt, aliases: ["Shirt"] },
  { value: "shopping-bag", label: "Moda", Icon: ShoppingBag, aliases: ["ShoppingBag"] },
  { value: "flower-2", label: "Jardín", Icon: Flower2, aliases: ["Flower2"] },
  { value: "tree-pine", label: "Exterior", Icon: TreePine, aliases: ["TreePine"] },
  { value: "hammer", label: "Ferretería", Icon: Hammer, aliases: ["Hammer"] },
  { value: "wrench", label: "Herramientas", Icon: Wrench, aliases: ["Wrench"] },
  { value: "car", label: "Auto", Icon: Car, aliases: ["Car"] },
  { value: "tv", label: "Electrónica", Icon: Tv, aliases: ["Tv"] },
  { value: "smartphone", label: "Celulares", Icon: Smartphone, aliases: ["Smartphone"] },
  { value: "laptop", label: "Computación", Icon: Laptop, aliases: ["Laptop"] },
  { value: "gamepad-2", label: "Videojuegos", Icon: Gamepad2, aliases: ["Gamepad2"] },
  { value: "headphones", label: "Audio", Icon: Headphones, aliases: ["Headphones"] },
  { value: "gift", label: "Juguetes", Icon: Gift, aliases: ["Gift"] },
  { value: "dumbbell", label: "Deportes", Icon: Dumbbell, aliases: ["Dumbbell"] },
  { value: "notebook-pen", label: "Papelería", Icon: NotebookPen, aliases: ["NotebookPen"] },
  { value: "book-open", label: "Libros", Icon: BookOpen, aliases: ["BookOpen"] },
  { value: "circle-dollar-sign", label: "Ofertas", Icon: CircleDollarSign, aliases: ["CircleDollarSign"] },
];

const normalizeIconValue = (value: string): string =>
  value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();

const iconOptionsByValue = new Map<string, CategoryIconOption>();

CATEGORY_ICON_OPTIONS.forEach((option) => {
  iconOptionsByValue.set(option.value, option);
  iconOptionsByValue.set(normalizeIconValue(option.label), option);
  option.aliases?.forEach((alias) => {
    iconOptionsByValue.set(normalizeIconValue(alias), option);
  });
});

const defaultLevelIcons: Record<CategoryLevel, LucideIcon> = {
  DIVISION: FolderOpen,
  DEPARTMENT: Folder,
  CATEGORY: Tag,
};

export const getCategoryIconOption = (icon: string | null | undefined): CategoryIconOption | null => {
  if (!icon?.trim()) return null;
  return iconOptionsByValue.get(normalizeIconValue(icon)) ?? null;
};

export const getCategoryIconValue = (icon: string | null | undefined): string | null =>
  getCategoryIconOption(icon)?.value ?? null;

export const isUnsupportedCategoryIcon = (icon: string | null | undefined): boolean =>
  Boolean(icon?.trim()) && !getCategoryIconOption(icon);

export const getCategoryIconComponent = (
  icon: string | null | undefined,
  level: CategoryLevel
): LucideIcon => {
  const option = getCategoryIconOption(icon);
  if (option) return option.Icon;
  if (icon?.trim()) return Tag;
  return defaultLevelIcons[level];
};

export const renderLucideIcon = (
  Icon: LucideIcon,
  props: Omit<LucideProps, "ref"> = {}
): ReactElement => createElement(Icon, props);

export const renderCategoryIcon = (
  icon: string | null | undefined,
  level: CategoryLevel,
  props: Omit<LucideProps, "ref"> = {}
): ReactElement => renderLucideIcon(getCategoryIconComponent(icon, level), props);
