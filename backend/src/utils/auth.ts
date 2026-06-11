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
 * Verifica y decodifica un token JWT.
 */
export const verifyToken = (token: string): any => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
};
