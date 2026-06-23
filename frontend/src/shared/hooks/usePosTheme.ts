import { useEffect, useState } from "react";

/**
 * Tema claro/oscuro del POS (cajero), persistente y compartido.
 *
 * Usa la misma clave que el panel admin ("fmb_pos_theme") para recordar la
 * preferencia. Es un store en memoria con suscriptores, de modo que el wrapper
 * del POS y los botones de las barras se mantienen sincronizados sin tener que
 * pasar props por toda la jerarquía (la parte del POS es delicada, así que se
 * evita tocar su estructura/funciones).
 */
const KEY = "fmb_pos_theme";
type Theme = "light" | "dark";

let current: Theme =
  typeof localStorage !== "undefined" && localStorage.getItem(KEY) === "dark" ? "dark" : "light";

const listeners = new Set<(t: Theme) => void>();

export const togglePosTheme = (): void => {
  current = current === "dark" ? "light" : "dark";
  try {
    localStorage.setItem(KEY, current);
  } catch {
    /* almacenamiento no disponible: el cambio sigue vigente en memoria */
  }
  listeners.forEach((l) => l(current));
};

export const usePosTheme = (): Theme => {
  const [theme, setTheme] = useState<Theme>(current);
  useEffect(() => {
    const l = (t: Theme) => setTheme(t);
    listeners.add(l);
    setTheme(current); // sincronizar por si cambió antes de montar
    return () => {
      listeners.delete(l);
    };
  }, []);
  return theme;
};
