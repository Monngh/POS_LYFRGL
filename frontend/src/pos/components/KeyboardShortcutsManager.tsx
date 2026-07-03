import { useEffect } from "react";

const isVisible = (el: Element | null): el is HTMLElement => {
  if (!(el instanceof HTMLElement)) return false;
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
  return el.getClientRects().length > 0;
};

const isEditable = (el: Element | null) =>
  !!el && el instanceof HTMLElement && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable || el.getAttribute("role") === "textbox");

const matchesShortcut = (value: string, key: string) => value.trim().toUpperCase() === key.trim().toUpperCase();

const getTopMostModal = () => {
  const candidates = Array.from(document.querySelectorAll('[data-pos-modal], .pos-cashier-modal-overlay')) as HTMLElement[];
  return candidates.filter(isVisible).pop() ?? null;
};

const getSearchScope = () => {
  const lock = document.querySelector('.pos-lock-overlay');
  if (lock && isVisible(lock)) return null;
  const modal = getTopMostModal();
  if (modal) return modal;
  return document.querySelector('[data-pos-view]') as HTMLElement | null;
};

const clickShortcut = (scope: HTMLElement | null, key: string) => {
  if (!scope) return false;
  const direct = scope.querySelector<HTMLElement>(`[data-shortcut-key="${key}"]`);
  if (direct && isVisible(direct) && !direct.hasAttribute("disabled")) {
    if (direct instanceof HTMLInputElement || direct instanceof HTMLTextAreaElement) {
      direct.focus();
    } else {
      direct.click();
    }
    return true;
  }
  const letter = scope.querySelector<HTMLElement>(`[data-shortcut-letter="${key}"]`);
  if (letter && isVisible(letter) && !letter.hasAttribute("disabled")) {
    letter.click();
    return true;
  }
  return false;
};

const resolveConfirmButton = (scope: HTMLElement | null) => {
  if (!scope) return null;
  return scope.querySelector<HTMLElement>('[data-shortcut="confirm"]');
};

const resolveCancelButton = (scope: HTMLElement | null) => {
  if (!scope) return null;
  return scope.querySelector<HTMLElement>('[data-shortcut="cancel"]');
};

export default function KeyboardShortcutsManager() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const scope = getSearchScope();
      const active = document.activeElement;

      if (e.ctrlKey && matchesShortcut(e.key, "L")) {
        const btn = document.querySelector<HTMLElement>('[data-shortcut-key="Ctrl+L"]') || document.querySelector<HTMLElement>('[data-shortcut-letter="L"]');
        if (btn && isVisible(btn) && !btn.hasAttribute("disabled")) {
          e.preventDefault();
          btn.click();
        }
        return;
      }

      if (e.altKey && /^[a-z]$/i.test(e.key)) {
        const letter = e.key.toUpperCase();
        if (letter === "B" && scope) {
          const searchBtn = scope.querySelector<HTMLElement>('[data-shortcut-letter="B"]');
          if (searchBtn && isVisible(searchBtn) && !searchBtn.hasAttribute("disabled")) {
            e.preventDefault();
            searchBtn.click();
            return;
          }
        }
        if (clickShortcut(scope, letter)) {
          e.preventDefault();
        }
        return;
      }

      if (e.key === "Escape") {
        const cancelBtn = resolveCancelButton(scope);
        if (cancelBtn && isVisible(cancelBtn) && !cancelBtn.hasAttribute("disabled")) {
          e.preventDefault();
          cancelBtn.click();
        }
        return;
      }

      if (e.key === "Enter") {
        if (isEditable(active)) return;
        const confirmBtn = resolveConfirmButton(scope);
        if (confirmBtn && isVisible(confirmBtn) && !confirmBtn.hasAttribute("disabled")) {
          e.preventDefault();
          confirmBtn.click();
        }
        return;
      }

      if (/^F\d{1,2}$/i.test(e.key)) {
        if (clickShortcut(scope, e.key.toUpperCase())) {
          e.preventDefault();
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return null;
}
