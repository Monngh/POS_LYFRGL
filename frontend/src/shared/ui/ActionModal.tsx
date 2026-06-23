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
}) => {
  if (!isOpen) return null;

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
          padding: "24px",
          maxWidth: widthMap[size],
          width: "90%",
          boxShadow: "0 20px 25px rgba(0,0,0,0.15)",
          maxHeight: "90vh",
          overflowY: "auto",
          ...contentStyle,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "16px",
            paddingBottom: "12px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <h2 style={{ margin: 0, fontSize: "18px", color: "var(--text)" }}>{title}</h2>
          <button
            onClick={onClose}
            style={{
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

        <div>{children}</div>

        {footer && (
          <div style={{ display: "flex", gap: "12px", marginTop: "24px" }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
