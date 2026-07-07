import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import { ConfirmModal, type ConfirmModalVariant } from "../ui/ConfirmModal";

// ============================================================================
// Confirmación imperativa de acciones peligrosas — evita ejecuciones por «error
// de dedo». Uso:
//
//   const confirm = useConfirm();
//   if (await confirm({ title, message, variant: "danger", confirmLabel })) {
//     await accionDestructiva();
//   }
//
// Un único <ConfirmProvider> monta el modal a nivel de app (como ToastProvider),
// de modo que cualquier vista puede pedir confirmación sin declarar su propio
// estado ni su propio modal.
// ============================================================================

export interface ConfirmOptions {
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmModalVariant;
  /** Confirmación de alto riesgo: obliga a escribir esta palabra/frase exacta. */
  requireText?: string;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export const useConfirm = (): ConfirmFn => {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm debe usarse dentro de un ConfirmProvider");
  }
  return ctx;
};

const EMPTY: ConfirmOptions = { title: "", message: "" };

export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions>(EMPTY);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((opts) => {
    setOptions(opts);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const settle = useCallback((value: boolean) => {
    setOpen(false);
    const resolve = resolverRef.current;
    resolverRef.current = null;
    resolve?.(value);
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <ConfirmModal
        isOpen={open}
        onClose={() => settle(false)}
        onConfirm={() => settle(true)}
        title={options.title}
        message={options.message}
        confirmLabel={options.confirmLabel}
        cancelLabel={options.cancelLabel}
        variant={options.variant}
        requireText={options.requireText}
      />
    </ConfirmContext.Provider>
  );
};
