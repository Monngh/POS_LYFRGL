import { EventEmitter } from "events";

// IMPORTANTE — requiere un solo proceso Node: este EventEmitter vive en memoria de
// UN proceso. En modo cluster de PM2 (más de una instancia) cada worker tiene su
// propio emisor y los eventos no llegan a los clientes SSE conectados a otro worker.
// Por eso backend/ecosystem.config.js debe usar exec_mode: 'fork' e instances: 1.

export type SecurityEventType = "login" | "failed-pin" | "session-revoked";

export interface SecurityEventPayload {
  type: SecurityEventType;
  /** Para "session-revoked": el userId de la sesión que fue cerrada. */
  userId?: number;
}

const SECURITY_EVENT_CHANNEL = "security-event";

class SecurityEventEmitter extends EventEmitter {}

/** Singleton interno: emisor de eventos de seguridad (login / intento fallido de PIN / revocación). */
export const securityEvents = new SecurityEventEmitter();
// Varios admins pueden tener la vista de seguridad abierta en simultáneo (varias pestañas SSE).
securityEvents.setMaxListeners(50);

/** Notifica a los suscriptores SSE que ocurrió un evento de seguridad. Fire-and-forget. */
export const emitSecurityEvent = (type: SecurityEventType, extra?: { userId?: number }): void => {
  securityEvents.emit(SECURITY_EVENT_CHANNEL, { type, ...extra } satisfies SecurityEventPayload);
};

/** Suscribirse a los eventos de seguridad (usado por el endpoint SSE). */
export const onSecurityEvent = (listener: (payload: SecurityEventPayload) => void): void => {
  securityEvents.on(SECURITY_EVENT_CHANNEL, listener);
};

/** Cancelar la suscripción (al cerrar la conexión SSE). */
export const offSecurityEvent = (listener: (payload: SecurityEventPayload) => void): void => {
  securityEvents.off(SECURITY_EVENT_CHANNEL, listener);
};
