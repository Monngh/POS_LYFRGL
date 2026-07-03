import { useEffect } from "react";
import { GLOBAL_QUICK_ACTION_LETTERS, POS_ALT_LETTERS } from "../constants/posShortcuts";

const isVisible = (el: Element | null): el is HTMLElement => {
  if (!(el instanceof HTMLElement)) return false;
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
  return el.getClientRects().length > 0;
};

const isLockScreenActive = () => {
  const lock = document.querySelector(".pos-lock-overlay");
  return !!lock && isVisible(lock);
};

const isEditable = (el: Element | null) =>
  !!el &&
  el instanceof HTMLElement &&
  (el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.tagName === "SELECT" ||
    el.isContentEditable ||
    el.getAttribute("role") === "textbox");

const isDisabled = (el: HTMLElement) => el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true";

const matchesShortcut = (value: string, key: string) => value.trim().toUpperCase() === key.trim().toUpperCase();

const getTopMostModal = () => {
  const candidates = Array.from(
    document.querySelectorAll("[data-pos-modal], .pos-cashier-modal-overlay")
  ) as HTMLElement[];
  return candidates.filter(isVisible).pop() ?? null;
};

const getSearchScope = () => {
  if (isLockScreenActive()) return null;
  const modal = getTopMostModal();
  if (modal) return modal;
  return document.querySelector("[data-pos-view]") as HTMLElement | null;
};

const clickElement = (el: HTMLElement) => {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    el.focus();
  } else {
    el.click();
  }
};

const findGlobalAction = (letter: string) => {
  const btn = document.querySelector<HTMLElement>(`[data-shortcut-global="${letter}"]`);
  if (btn && !isDisabled(btn)) return btn;
  return null;
};

const findActionInScope = (scope: HTMLElement, action: string) => {
  const footer = scope.querySelector("[data-pos-modal-footer]");
  if (footer) {
    const inFooter = footer.querySelector<HTMLElement>(`[data-shortcut-action="${action}"]:not([disabled])`);
    if (inFooter && !isDisabled(inFooter)) return inFooter;
  }
  const match = scope.querySelector<HTMLElement>(`[data-shortcut-action="${action}"]:not([disabled])`);
  if (match && !isDisabled(match)) return match;
  return null;
};

const clickShortcut = (scope: HTMLElement | null, key: string, options?: { allowHidden?: boolean }) => {
  if (!scope) return false;

  const canUse = (el: HTMLElement) => (options?.allowHidden || isVisible(el)) && !isDisabled(el);

  const direct = scope.querySelector<HTMLElement>(`[data-shortcut-key="${key}"]`);
  if (direct && canUse(direct)) {
    clickElement(direct);
    return true;
  }

  const letter = scope.querySelector<HTMLElement>(`[data-shortcut-letter="${key}"]`);
  if (letter && canUse(letter)) {
    letter.click();
    return true;
  }

  return false;
};

const queryShortcutInScope = (scope: HTMLElement, selector: string) => {
  const footer = scope.querySelector("[data-pos-modal-footer]");
  if (footer) {
    const inFooter = footer.querySelector<HTMLElement>(selector);
    if (inFooter && isVisible(inFooter) && !isDisabled(inFooter)) return inFooter;
  }
  const priority = scope.querySelector<HTMLElement>(`${selector}[data-shortcut-priority="primary"]`);
  if (priority && isVisible(priority) && !isDisabled(priority)) return priority;
  const match = scope.querySelector<HTMLElement>(selector);
  if (match && isVisible(match) && !isDisabled(match)) return match;
  return null;
};

const resolveConfirmButton = (scope: HTMLElement | null) => {
  if (!scope) return null;
  const sendEmail = findActionInScope(scope, "send-email");
  if (sendEmail) return sendEmail;
  return queryShortcutInScope(scope, '[data-shortcut="confirm"]');
};

const resolveCancelButton = (scope: HTMLElement | null) => {
  if (!scope) return null;
  const cancel = queryShortcutInScope(scope, '[data-shortcut="cancel"]');
  if (cancel) return cancel;
  return queryShortcutInScope(scope, '[data-shortcut="dismiss"]');
};

export default function KeyboardShortcutsManager() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isLockScreenActive()) return;
      if (e.defaultPrevented) return;

      const scope = getSearchScope();
      const active = document.activeElement;
      const modal = getTopMostModal();

      if (matchesShortcut(e.key, "F10") && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const viewScope = document.querySelector("[data-pos-view]");
        const btn =
          viewScope?.querySelector<HTMLElement>('[data-shortcut-key="F10"]') ??
          document.querySelector<HTMLElement>('[data-shortcut-key="F10"]');
        if (btn && !isDisabled(btn)) {
          e.preventDefault();
          btn.click();
        }
        return;
      }

      if (e.altKey && /^[a-z]$/i.test(e.key)) {
        const letter = e.key.toUpperCase();

        if (POS_ALT_LETTERS.includes(letter as (typeof POS_ALT_LETTERS)[number])) {
          e.preventDefault();
        }

        if (letter === "S" && scope) {
          const sendBtn = findActionInScope(scope, "send-email");
          if (sendBtn) {
            sendBtn.click();
            return;
          }
        }

        if (letter === "W" && scope) {
          const verifyBtn = findActionInScope(scope, "verify-payment");
          if (verifyBtn) {
            verifyBtn.click();
            return;
          }
        }

        if (letter === "B" && scope) {
          const searchBtn = scope.querySelector<HTMLElement>('[data-shortcut-letter="B"]');
          if (searchBtn && isVisible(searchBtn) && !isDisabled(searchBtn)) {
            searchBtn.click();
            return;
          }
        }

        if (!modal && GLOBAL_QUICK_ACTION_LETTERS.includes(letter as (typeof GLOBAL_QUICK_ACTION_LETTERS)[number])) {
          const globalBtn = findGlobalAction(letter);
          if (globalBtn) {
            globalBtn.click();
            return;
          }
        }

        if (clickShortcut(scope, letter)) {
          return;
        }

        return;
      }

      if (e.key === "Escape") {
        const cancelBtn = resolveCancelButton(scope);
        if (cancelBtn) {
          e.preventDefault();
          cancelBtn.click();
        }
        return;
      }

      if (e.key === "Enter") {
        if (isEditable(active)) return;
        const confirmBtn = resolveConfirmButton(scope);
        if (confirmBtn) {
          e.preventDefault();
          confirmBtn.click();
        }
        return;
      }

      if (/^F\d{1,2}$/i.test(e.key) && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const fnKey = e.key.toUpperCase();
        if (fnKey === "F8" && !modal && scope) {
          if (clickShortcut(scope, "F8")) {
            e.preventDefault();
            return;
          }
        }
        if (clickShortcut(scope, fnKey)) {
          e.preventDefault();
        }
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  return null;
}
