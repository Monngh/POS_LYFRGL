import { useEffect } from "react";

type BodyScrollLockState = {
  scrollX: number;
  scrollY: number;
  bodyOverflow: string;
  bodyPosition: string;
  bodyTop: string;
  bodyLeft: string;
  bodyRight: string;
  bodyWidth: string;
  bodyPaddingRight: string;
  bodyOverscrollBehavior: string;
  documentOverflow: string;
  documentOverscrollBehavior: string;
};

let bodyScrollLockCount = 0;
let bodyScrollLockState: BodyScrollLockState | null = null;

const lockBodyScroll = () => {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  bodyScrollLockCount += 1;
  if (bodyScrollLockCount > 1) return;

  const { body, documentElement } = document;
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  const scrollbarWidth = window.innerWidth - documentElement.clientWidth;

  bodyScrollLockState = {
    scrollX,
    scrollY,
    bodyOverflow: body.style.overflow,
    bodyPosition: body.style.position,
    bodyTop: body.style.top,
    bodyLeft: body.style.left,
    bodyRight: body.style.right,
    bodyWidth: body.style.width,
    bodyPaddingRight: body.style.paddingRight,
    bodyOverscrollBehavior: body.style.overscrollBehavior,
    documentOverflow: documentElement.style.overflow,
    documentOverscrollBehavior: documentElement.style.overscrollBehavior,
  };

  documentElement.style.overflow = "hidden";
  documentElement.style.overscrollBehavior = "none";
  body.style.overflow = "hidden";
  body.style.position = "fixed";
  body.style.top = `-${scrollY}px`;
  body.style.left = `-${scrollX}px`;
  body.style.right = "0";
  body.style.width = "100%";
  body.style.overscrollBehavior = "none";

  if (scrollbarWidth > 0) {
    body.style.paddingRight = `${scrollbarWidth}px`;
  }
};

const unlockBodyScroll = () => {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (bodyScrollLockCount === 0) return;

  bodyScrollLockCount -= 1;
  if (bodyScrollLockCount > 0 || !bodyScrollLockState) return;

  const { body, documentElement } = document;
  const state = bodyScrollLockState;
  bodyScrollLockState = null;

  documentElement.style.overflow = state.documentOverflow;
  documentElement.style.overscrollBehavior = state.documentOverscrollBehavior;
  body.style.overflow = state.bodyOverflow;
  body.style.position = state.bodyPosition;
  body.style.top = state.bodyTop;
  body.style.left = state.bodyLeft;
  body.style.right = state.bodyRight;
  body.style.width = state.bodyWidth;
  body.style.paddingRight = state.bodyPaddingRight;
  body.style.overscrollBehavior = state.bodyOverscrollBehavior;

  window.scrollTo(state.scrollX, state.scrollY);
};

export function useBodyScrollLock(isLocked: boolean) {
  useEffect(() => {
    if (!isLocked) return;

    lockBodyScroll();
    return unlockBodyScroll;
  }, [isLocked]);
}
