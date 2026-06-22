import crypto from "crypto";

/**
 * Registro de sesiones activas EN MEMORIA (sin tablas nuevas).
 *
 * Garantiza "una sola sesión por usuario" para administradores/gerentes:
 * cada login emite un identificador único de sesión (jti) que se guarda aquí.
 * El middleware de autenticación valida que el jti del token coincida con el
 * registrado; si otro inicio de sesión lo reemplaza, el token anterior deja de
 * ser válido (desplazamiento de sesión).
 *
 * Nota: al ser en memoria, se limpia si el servidor se reinicia. En ese caso la
 * validación es permisiva (no expulsa tokens vigentes) hasta el próximo login.
 */

export interface SessionEntry {
  jti: string;
  exp: number; // epoch ms
  ip?: string;
  device?: string;
  since: number; // epoch ms en que se abrió
}

const sessions = new Map<number, SessionEntry>();

// Alineado con JWT_EXPIRE (8h por defecto). Si una sesión supera este tiempo se
// considera expirada y deja de bloquear nuevos accesos.
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

/** Devuelve la sesión activa (no expirada) del usuario, o null. */
export const getActiveSession = (userId: number): SessionEntry | null => {
  const entry = sessions.get(userId);
  if (!entry) return null;
  if (entry.exp <= Date.now()) {
    sessions.delete(userId);
    return null;
  }
  return entry;
};

/** Abre (o reemplaza) la sesión del usuario y devuelve el nuevo jti. */
export const openSession = (
  userId: number,
  info: { ip?: string; device?: string } = {}
): string => {
  const jti = crypto.randomUUID();
  sessions.set(userId, {
    jti,
    exp: Date.now() + SESSION_TTL_MS,
    ip: info.ip,
    device: info.device,
    since: Date.now(),
  });
  return jti;
};

/**
 * Indica si el jti del token corresponde a la sesión vigente del usuario.
 * Permisivo cuando no hay registro (p.ej. tras reinicio del servidor) para no
 * expulsar a usuarios con tokens aún válidos.
 */
export const isCurrentSession = (userId: number, jti?: string): boolean => {
  const entry = getActiveSession(userId);
  if (!entry) return true;
  return !!jti && entry.jti === jti;
};

/** Cierra la sesión del usuario (logout). Si se pasa jti, solo cierra si coincide. */
export const closeSession = (userId: number, jti?: string): void => {
  const entry = sessions.get(userId);
  if (!entry) return;
  if (!jti || entry.jti === jti) {
    sessions.delete(userId);
  }
};
