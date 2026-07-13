/** Accesos rápidos del terminal: siempre activos en vista de ventas (aunque el carrusel esté en otra página). */
export const GLOBAL_QUICK_ACTION_LETTERS = ["Q", "G", "N", "D", "H", "U", "I"] as const;

export type GlobalQuickActionLetter = (typeof GLOBAL_QUICK_ACTION_LETTERS)[number];

export const GLOBAL_QUICK_ACTIONS: Record<GlobalQuickActionLetter, string> = {
  Q: "price-lookup",
  G: "bank-deposit",
  N: "cancel-sale",
  D: "returns",
  H: "ticket-history",
  U: "partial-cut-summary",
  I: "autofacturacion",
};

/** Atajos reservados del POS que deben hacer preventDefault antes que el navegador. */
export const POS_ALT_LETTERS = [
  ...GLOBAL_QUICK_ACTION_LETTERS,
  "A",
  "E",
  "B",
  "R",
  "M",
  "K",
  "T",
  "P",
  "X",
  "C",
  "S",
  "W",
  "J",
  "Z",
  "L", // Cerrar sesión
  "V", // Cancelar compra
  "F", // Bloquear Alt+F del navegador (menú archivo en Firefox)
] as const;
