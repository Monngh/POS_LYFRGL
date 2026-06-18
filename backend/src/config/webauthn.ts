/**
 * Configuración de WebAuthn — multiplataforma (Windows Hello / Touch ID / Face ID /
 * huella de Android / llave de seguridad FIDO2)
 * usada como segundo factor de autenticación para ADMIN y GERENTE.
 *
 * El "Relying Party" (RP) debe coincidir con el dominio que el usuario ve en el
 * navegador (el frontend), NO con el del backend. Por eso se configura por entorno:
 *
 *   WEBAUTHN_RP_ID   -> dominio del frontend (sin protocolo). Ej: pos-lyfrgl.vercel.app
 *   WEBAUTHN_ORIGIN  -> origen(es) permitido(s), separados por coma, CON protocolo.
 *                       Ej: https://pos-lyfrgl.vercel.app,https://pos-fmb.vercel.app
 *   WEBAUTHN_RP_NAME -> nombre visible del sistema.
 *
 * En desarrollo los valores por defecto (localhost) funcionan sin configurar nada.
 */

export const rpName = process.env.WEBAUTHN_RP_NAME || "LYFRGL POS";

export const rpID = process.env.WEBAUTHN_RP_ID || "localhost";

export const expectedOrigins: string[] = (process.env.WEBAUTHN_ORIGIN || "http://localhost:5173,http://localhost:5174")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
