/**
 * Seguridad de autenticación en memoria (sin tablas nuevas):
 *   1. Almacén de retos (challenges) WebAuthn con caducidad.
 *   2. Bloqueo por fuerza bruta para contraseña de admin y PIN de cajero.
 *
 * NOTA: el estado vive en memoria del proceso. Es suficiente para una sola
 * instancia (como el VPS actual con PM2). Si en el futuro se escala a varias
 * instancias, esto debería migrar a Redis o similar.
 */

// ---------------------------------------------------------------------------
// 1. Retos WebAuthn (uno por usuario a la vez)
// ---------------------------------------------------------------------------
type ChallengeEntry = { challenge: string; purpose: "register" | "authenticate"; expiresAt: number };
const challenges = new Map<number, ChallengeEntry>();
const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutos

export const saveChallenge = (userId: number, challenge: string, purpose: "register" | "authenticate"): void => {
  challenges.set(userId, { challenge, purpose, expiresAt: Date.now() + CHALLENGE_TTL_MS });
};

/** Devuelve y CONSUME el reto (un solo uso). Null si no existe o caducó. */
export const consumeChallenge = (userId: number, purpose: "register" | "authenticate"): string | null => {
  const entry = challenges.get(userId);
  challenges.delete(userId);
  if (!entry || entry.purpose !== purpose || entry.expiresAt < Date.now()) return null;
  return entry.challenge;
};

// ---------------------------------------------------------------------------
// 2. Bloqueo por intentos fallidos (lockout progresivo)
// ---------------------------------------------------------------------------
type LockEntry = { fails: number; lockedUntil: number; windowStart: number };
const attempts = new Map<string, LockEntry>();

const MAX_FAILS = 5;            // intentos permitidos antes de bloquear
const LOCK_MS = 15 * 60 * 1000; // duración del bloqueo: 15 minutos
const WINDOW_MS = 15 * 60 * 1000; // ventana en la que se acumulan los fallos

/** Clave estable por identidad + origen (evita castigar a toda la red por un usuario). */
export const lockoutKey = (scope: string, identifier: string, ip?: string): string =>
  `${scope}:${(identifier || "").toLowerCase()}:${ip || "unknown"}`;

/** Si está bloqueado, devuelve los segundos restantes; si no, 0. */
export const getLockRemaining = (key: string): number => {
  const entry = attempts.get(key);
  if (!entry) return 0;
  if (entry.lockedUntil > Date.now()) {
    return Math.ceil((entry.lockedUntil - Date.now()) / 1000);
  }
  return 0;
};

/** Registra un intento fallido y bloquea si se supera el máximo. Devuelve intentos restantes. */
export const registerFailedAttempt = (key: string): { locked: boolean; remainingAttempts: number; lockSeconds: number } => {
  const now = Date.now();
  const entry = attempts.get(key);

  // Empezar de cero si no hay registro o si la ventana de acumulación ya expiró
  // (la cuenta de fallos solo "vive" durante WINDOW_MS desde el primer fallo).
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    attempts.set(key, { fails: 1, lockedUntil: 0, windowStart: now });
    return { locked: false, remainingAttempts: MAX_FAILS - 1, lockSeconds: 0 };
  }

  entry.fails += 1;
  if (entry.fails >= MAX_FAILS) {
    entry.lockedUntil = now + LOCK_MS;
    attempts.set(key, entry);
    return { locked: true, remainingAttempts: 0, lockSeconds: Math.ceil(LOCK_MS / 1000) };
  }

  attempts.set(key, entry);
  return { locked: false, remainingAttempts: MAX_FAILS - entry.fails, lockSeconds: 0 };
};

/** Limpia el registro de intentos tras un login exitoso. */
export const clearFailedAttempts = (key: string): void => {
  attempts.delete(key);
};
