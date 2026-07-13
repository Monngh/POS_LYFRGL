import { useEffect } from "react";

// ============================================================================
// Bloquea el scroll del <body> mientras haya un overlay/modal abierto, para que
// el fondo no se desplace detrás del diálogo. Soporta varios modales abiertos a
// la vez (cuenta de referencias) y restaura el scroll sólo cuando todos cierran.
// ============================================================================

let lockCount = 0;
let previousOverflow = "";
let previousPaddingRight = "";

const applyLock = () => {
  const body = document.body;
  // Compensa el ancho de la scrollbar para evitar el "salto" de layout al ocultarla.
  const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
  previousOverflow = body.style.overflow;
  previousPaddingRight = body.style.paddingRight;
  body.style.overflow = "hidden";
  if (scrollbarWidth > 0) {
    const current = parseFloat(getComputedStyle(body).paddingRight) || 0;
    body.style.paddingRight = `${current + scrollbarWidth}px`;
  }
};

const releaseLock = () => {
  const body = document.body;
  body.style.overflow = previousOverflow;
  body.style.paddingRight = previousPaddingRight;
};

export function useBodyScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    if (lockCount === 0) applyLock();
    lockCount += 1;
    return () => {
      lockCount -= 1;
      if (lockCount === 0) releaseLock();
    };
  }, [active]);
}
