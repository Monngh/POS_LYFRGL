import React, { createContext, useContext, useEffect, useCallback, useRef } from "react";
import { useAuth } from "../../auth";
import { API_BASE_URL } from "../../shared/services/api";

export interface SecurityEventPayload {
  type: string;
  userId?: number;
}

type SecurityEventListener = (payload: SecurityEventPayload) => void;

interface SecurityEventsContextValue {
  subscribe: (listener: SecurityEventListener) => () => void;
}

const SecurityEventsContext = createContext<SecurityEventsContextValue | null>(null);

/**
 * Suscribe un callback a los eventos de seguridad recibidos por la conexión SSE
 * global (ver SecurityEventsProvider más abajo). No abre una conexión nueva: todas
 * las vistas comparten la única conexión que ya mantiene el provider en
 * AdminDashboard.tsx.
 */
export const useSecurityEvents = (listener: SecurityEventListener): void => {
  const context = useContext(SecurityEventsContext);
  // Ref para que el listener pueda cambiar en cada render sin re-suscribirse.
  const listenerRef = useRef(listener);
  listenerRef.current = listener;

  useEffect(() => {
    if (!context) return;
    return context.subscribe((payload) => listenerRef.current(payload));
  }, [context]);
};

/**
 * Provider global de eventos de seguridad en tiempo real (SSE).
 *
 * Abre UNA sola conexión a GET /api/admin/security/events mientras haya una sesión
 * de ADMIN activa (el endpoint exige rol ADMIN vía authorizeRoles — un GERENTE
 * recibiría 403, por eso se omite la conexión para ese rol). Debe montarse una
 * única vez en el layout raíz del área de admin (AdminDashboard.tsx), envolviendo
 * TODA la vista activa, para que la expulsión por "session-revoked" sea instantánea
 * sin importar en qué sección del admin esté el usuario (Dashboard, Inventario,
 * Facturación, etc.) — antes la conexión SSE solo vivía dentro de
 * AdminAccessLogView.tsx, así que solo funcionaba si el usuario expulsado estaba
 * justo parado en esa pantalla.
 */
export const SecurityEventsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token, user, logout } = useAuth();
  const listenersRef = useRef<Set<SecurityEventListener>>(new Set());

  useEffect(() => {
    if (!token || !user || user.role !== "ADMIN") return;

    const eventSource = new EventSource(
      `${API_BASE_URL}/api/admin/security/events?token=${encodeURIComponent(token)}`
    );

    eventSource.onmessage = (event) => {
      let payload: SecurityEventPayload;
      try {
        payload = JSON.parse(event.data);
      } catch (err) {
        console.error("[SecurityEventsProvider] Evento SSE inválido:", err);
        return;
      }

      if (payload.type === "session-revoked" && payload.userId != null && Number(payload.userId) === user.id) {
        // A este mismo usuario le revocaron la sesión desde otro lugar: cerrar la
        // sesión local de inmediato, sin importar la vista activa en este momento.
        // Mismo mecanismo (logout de AuthContext) que usa el 401 SESION_DESPLAZADA.
        sessionStorage.setItem("fmb_pos_logout_reason", "Tu sesión fue cerrada por un administrador.");
        logout();
        return;
      }

      listenersRef.current.forEach((fn) => fn(payload));
    };

    eventSource.onerror = (err) => {
      // EventSource reintenta la reconexión automáticamente; solo lo dejamos registrado.
      console.warn("[SecurityEventsProvider] Conexión SSE interrumpida, reintentando...", err);
    };

    return () => {
      eventSource.close();
    };
  }, [token, user, logout]);

  const subscribe = useCallback((listener: SecurityEventListener) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  // Memoizado para no generar un objeto de contexto nuevo en cada render de
  // AdminDashboard (que re-renderiza seguido por su propio estado de UI: sidebar,
  // tema, sucursal, etc.) — evita que los suscriptores se den de baja/alta sin motivo.
  const contextValue = React.useMemo(() => ({ subscribe }), [subscribe]);

  return (
    <SecurityEventsContext.Provider value={contextValue}>
      {children}
    </SecurityEventsContext.Provider>
  );
};
