import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE_SELECTOR =
  'input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useModalInitialFocus(
  isOpen: boolean,
  options?: { preferSelector?: string; fallbackRef?: RefObject<HTMLElement | null> }
) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const timer = window.setTimeout(() => {
      const root = containerRef.current;
      if (!root) return;

      if (options?.preferSelector) {
        const preferred = root.querySelector<HTMLElement>(options.preferSelector);
        if (preferred && preferred.offsetParent !== null) {
          preferred.focus();
          return;
        }
      }

      const firstInput = root.querySelector<HTMLElement>(
        'input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled])'
      );
      if (firstInput) {
        firstInput.focus();
        return;
      }

      if (options?.fallbackRef?.current) {
        options.fallbackRef.current.focus();
        return;
      }

      if (root.tabIndex >= 0 || root.getAttribute("tabindex") === "-1") {
        root.focus();
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [isOpen, options?.preferSelector, options?.fallbackRef]);

  return containerRef;
}

export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => el.offsetParent !== null && !el.hasAttribute("disabled")
  );
}
