import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("[FATAL] JWT_SECRET no está definido en las variables de entorno. El servidor no puede iniciar.");
}
const JWT_EXPIRE = process.env.JWT_EXPIRE || "8h";

/**
 * Cifra una contraseña en texto plano.
 */
export const hashPassword = async (password: string): Promise<string> => {
  return bcrypt.hash(password, 10);
};

/**
 * Compara una contraseña en texto plano con su versión cifrada.
 */
export const comparePassword = async (password: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(password, hash);
};

/**
 * Genera un token JWT firmado.
 */
export const generateToken = (payload: { userId?: number; customerId?: number; email?: string | null; role: string; branchId?: number }): string => {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRE as any,
  });
};

/**
 * Genera un token TEMPORAL de "2FA pendiente" (NO es una sesión válida).
 * Solo sirve para identificar al usuario entre el paso 1 (contraseña) y el
 * paso 2 (WebAuthn) del login de administrador. Caduca en 5 minutos y no
 * contiene `role`, por lo que el middleware de autorización lo rechaza.
 */
export const generatePendingToken = (userId: number, tfa: "register" | "authenticate"): string => {
  return jwt.sign({ userId, tfa }, JWT_SECRET, { expiresIn: "5m" });
};

/**
 * Verifica y decodifica un token JWT.
 */
export const verifyToken = (token: string): any => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
};
