import React, { createContext, useCallback, useContext, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";

export type ToastType = "success" | "error" | "info" | "warning";

interface Toast {
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast debe usarse dentro de un ToastProvider");
  }
  return ctx;
};

const TOAST_STYLES: Record<ToastType, { bg: string; border: string; color: string; Icon: React.ComponentType<{ size?: number; color?: string }> }> = {
  success: { bg: "#f0fdf4", border: "#bbf7d0", color: "#166534", Icon: CheckCircle2 },
  error: { bg: "#fef2f2", border: "#fca5a5", color: "#991b1b", Icon: XCircle },
  info: { bg: "#f0f9ff", border: "#bae6fd", color: "#075985", Icon: Info },
  warning: { bg: "#fffbeb", border: "#fde68a", color: "#92400e", Icon: AlertTriangle },
};

const AUTO_DISMISS_MS = 3500;

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toast, setToast] = useState<Toast | null>(null);

  const showToast = useCallback((message: string, type: ToastType = "info") => {
    setToast({ message, type });
    window.setTimeout(() => {
      setToast(null);
    }, AUTO_DISMISS_MS);
  }, []);

  const { bg, border, color, Icon } = TOAST_STYLES[toast?.type || "info"];

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast && (
        <div
          className="toast-premium"
          style={{
            position: "fixed",
            bottom: "24px",
            right: "24px",
            backgroundColor: bg,
            border: `1px solid ${border}`,
            borderRadius: "10px",
            padding: "16px 20px",
            boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)",
            color: color,
            display: "flex",
            alignItems: "center",
            gap: "10px",
            zIndex: 99999,
            maxWidth: "360px",
            fontWeight: "600",
            fontSize: "14px",
          }}
        >
          <Icon size={18} color={color} />
          <span>{toast.message}</span>
        </div>
      )}
    </ToastContext.Provider>
  );
};
