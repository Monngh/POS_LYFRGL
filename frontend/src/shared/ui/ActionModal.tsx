import React from "react";
import { X } from "lucide-react";

interface ActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg";
  footer?: React.ReactNode;
  contentStyle?: React.CSSProperties;
  // Known issue: en scroll táctil (emulador DevTools / posiblemente dispositivos táctiles
  // reales) el header sticky puede no comportarse como se espera. Verificado que funciona
  // correctamente con scroll de mouse/rueda y con eventos touch simulados vía Playwright.
  // Causa raíz no identificada — descartado: build viejo, falta de hard-refresh, CSS de
  // padding/z-index obvio. Pendiente de investigación si se reporta de nuevo.
  stickyHeader?: boolean;
}

const widthMap = { sm: 400, md: 600, lg: 900 };

export const ActionModal: React.FC<ActionModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  size = "md",
  footer,
  contentStyle,
  stickyHeader = false,
}) => {
  if (!isOpen) return null;

  // El padding va en el div interno (no en el contenedor con overflowY:auto) para que
  // position:sticky no deje un hueco residual arriba del header — ver comentario abajo.
  // Si un consumidor pasa padding vía contentStyle, debe aplicarse ahí también, no en
  // el contenedor de scroll (si no, se duplicaría: el override + el default de 24px).
  const { padding: contentPadding, ...scrollBoxStyle } = contentStyle ?? {};

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--surface)",
          borderRadius: "8px",
          maxWidth: widthMap[size],
          width: "90%",
          boxShadow: "0 20px 25px rgba(0,0,0,0.15)",
          maxHeight: "90vh",
          overflowY: "auto",
          ...scrollBoxStyle,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* El padding vive aquí, no en el contenedor con overflowY:auto de arriba: si el
            padding-top estuviera en el propio contenedor de scroll, position:sticky lo
            deja como un hueco fijo por encima del header (no se "consume" al hacer
            scroll), y el contenido scrolleado se ve por ese hueco. Con el padding en este
            div interno (que no scrollea, solo layout normal), el header queda pegado
            exactamente en top:0 del contenedor de scroll, sin hueco residual. */}
        <div style={{ padding: contentPadding ?? "24px" }}>
          <div
            style={
              stickyHeader
                ? {
                    position: "sticky" as const,
                    top: 0,
                    zIndex: 2,
                    backgroundColor: "var(--surface)",
                    paddingBottom: "16px",
                    // Sombra permanente (no solo al hacer scroll) para que el corte entre
                    // el header fijo y el contenido que scrollea debajo siempre se vea
                    // como una transición intencional, sin importar en qué fila exacta
                    // haya quedado el scroll cuando el header empieza a taparla.
                    boxShadow: "0 6px 8px -6px rgba(0,0,0,0.15)",
                  }
                : { marginBottom: "16px" }
            }
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 12,
                paddingBottom: "12px",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <h2 style={{ margin: 0, fontSize: "18px", lineHeight: 1.3, color: "var(--text)", flex: 1, minWidth: 0 }}>{title}</h2>
              <button
                onClick={onClose}
                style={{
                  marginTop: 2,
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  padding: 4,
                  color: "var(--text-muted)",
                }}
              >
                <X size={20} />
              </button>
            </div>
          </div>

          <div>{children}</div>

          {footer && (
            <div style={{ display: "flex", gap: "12px", marginTop: "24px" }}>
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};