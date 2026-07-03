import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { getFocusableElements } from '../../../hooks/useModalInitialFocus';

export interface PosModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  iconColor?: string;
  size?: 'md' | 'lg' | 'xl' | 'fullscreen';
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function PosModal({
  isOpen,
  onClose,
  title,
  subtitle,
  icon,
  iconColor = "var(--text)",
  size = "md",
  children,
  footer
}: PosModalProps) {
  const modalRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const timer = window.setTimeout(() => {
      const modal = modalRef.current;
      if (!modal) return;

      const firstInput = modal.querySelector<HTMLElement>(
        'input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled])'
      );
      if (firstInput) {
        firstInput.focus();
        if (firstInput instanceof HTMLInputElement && firstInput.type === "text") {
          firstInput.select();
        }
        return;
      }

      modal.focus();
    }, 0);

    return () => {
      window.clearTimeout(timer);
      previousFocusRef.current?.focus();
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !modalRef.current) return;

      const focusable = getFocusableElements(modalRef.current);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (e.shiftKey) {
        if (active === first || !modalRef.current.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  if (!isOpen) return null;

  const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    backdropFilter: 'blur(2px)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
    padding: size === 'fullscreen' ? '0' : '20px',
  };

  const getWidth = () => {
    switch(size) {
      case 'md': return '600px';
      case 'lg': return '800px';
      case 'xl': return '1000px';
      case 'fullscreen': return '100vw';
      default: return '600px';
    }
  };

  const getHeight = () => {
    if (size === 'fullscreen') return '100vh';
    return 'auto';
  };

  const modalStyle: React.CSSProperties = {
    width: getWidth(),
    height: getHeight(),
    maxWidth: size === 'fullscreen' ? '100vw' : '95vw',
    maxHeight: size === 'fullscreen' ? '100vh' : '90vh',
    backgroundColor: 'var(--surface)',
    borderRadius: size === 'fullscreen' ? '0' : '16px',
    boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    outline: 'none',
  };

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: '24px 32px',
  };

  const titleArea: React.CSSProperties = {
    display: 'flex',
    gap: '16px',
    alignItems: 'center',
  };

  const iconContainer: React.CSSProperties = {
    color: iconColor,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  const closeBtn: React.CSSProperties = {
    background: 'transparent',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    padding: '6px',
    cursor: 'pointer',
    color: 'var(--text-secondary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s',
  };

  const contentStyle: React.CSSProperties = {
    flex: 1,
    overflowY: 'auto',
    padding: footer ? '0 32px' : '0 32px 32px 32px',
    display: 'flex',
    flexDirection: 'column',
  };

  const footerStyle: React.CSSProperties = {
    padding: '24px 32px',
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
  };

  return (
    <div style={overlayStyle}>
      <div ref={modalRef} data-pos-modal style={modalStyle} tabIndex={-1}>
        <div style={headerStyle}>
          <div style={titleArea}>
            {icon && <div style={iconContainer}>{icon}</div>}
            <div>
              <h2 style={{ fontSize: '20px', fontWeight: '800', color: 'var(--text)', margin: 0, lineHeight: 1.2 }}>
                {title}
              </h2>
              {subtitle && (
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          <button style={closeBtn} onClick={onClose} aria-label="Cerrar modal" data-shortcut="dismiss" title="Cerrar modal (Esc)">
            <X size={20} />
          </button>
        </div>

        <div style={contentStyle}>
          {children}
        </div>

        {footer && (
          <div style={footerStyle} data-pos-modal-footer>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
