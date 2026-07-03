/** Accesos rápidos del terminal: siempre activos en vista de ventas (aunque el carrusel esté en otra página). */
export const GLOBAL_QUICK_ACTION_LETTERS = ["Q", "G", "N", "E", "H", "U", "I"] as const;

export type GlobalQuickActionLetter = (typeof GLOBAL_QUICK_ACTION_LETTERS)[number];

export const GLOBAL_QUICK_ACTIONS: Record<GlobalQuickActionLetter, string> = {
  Q: "price-lookup",
  G: "bank-deposit",
  N: "cancel-sale",
  E: "returns",
  H: "ticket-history",
  U: "partial-cut-summary",
  I: "autofacturacion",
};

/** Atajos reservados del POS que deben hacer preventDefault antes que el navegador. */
export const POS_ALT_LETTERS = [
  ...GLOBAL_QUICK_ACTION_LETTERS,
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
] as const;
