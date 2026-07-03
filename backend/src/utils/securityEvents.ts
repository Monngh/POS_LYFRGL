import { EventEmitter } from "events";

export type SecurityEventType = "login" | "failed-pin";

export interface SecurityEventPayload {
  type: SecurityEventType;
}

const SECURITY_EVENT_CHANNEL = "security-event";

class SecurityEventEmitter extends EventEmitter {}

/** Singleton interno: emisor de eventos de seguridad (login / intento fallido de PIN). */
export const securityEvents = new SecurityEventEmitter();
// Varios admins pueden tener la vista de seguridad abierta en simultáneo (varias pestañas SSE).
securityEvents.setMaxListeners(50);

/** Notifica a los suscriptores SSE que ocurrió un evento de seguridad. Fire-and-forget. */
export const emitSecurityEvent = (type: SecurityEventType): void => {
  securityEvents.emit(SECURITY_EVENT_CHANNEL, { type } satisfies SecurityEventPayload);
};

/** Suscribirse a los eventos de seguridad (usado por el endpoint SSE). */
export const onSecurityEvent = (listener: (payload: SecurityEventPayload) => void): void => {
  securityEvents.on(SECURITY_EVENT_CHANNEL, listener);
};

/** Cancelar la suscripción (al cerrar la conexión SSE). */
export const offSecurityEvent = (listener: (payload: SecurityEventPayload) => void): void => {
  securityEvents.off(SECURITY_EVENT_CHANNEL, listener);
};
