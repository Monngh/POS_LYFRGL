import { Request, Response } from "express";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import { prisma } from "../app";
import { generateToken, generatePendingToken, verifyToken } from "../utils/auth";
import { rpName, rpID, expectedOrigins } from "../config/webauthn";
import { saveChallenge, consumeChallenge } from "../utils/authSecurity";
import { recordLoginEvent } from "../utils/authAudit";
import { openSession } from "../utils/sessionRegistry";
import { getRequestDeviceId } from "../middlewares/device.middleware";

const clientIp = (req: Request): string =>
  (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
  req.ip ||
  req.socket.remoteAddress ||
  "unknown";

type UserWithBranch = {
  id: number;
  email: string;
  name: string;
  role: string;
  branchId: number;
  webauthnCredentialId: string | null;
  webauthnPublicKey: string | null;
  webauthnCounter: number | null;
  webauthnTransports: string | null;
  branch: { id: number; name: string; phone: string | null; address: string | null };
};

const toTransports = (csv: string | null): any[] | undefined =>
  csv ? (csv.split(",").filter(Boolean) as any[]) : undefined;

const buildSessionResponse = (user: UserWithBranch, req: Request) => ({
  token: generateToken({
    userId: user.id,
    email: user.email,
    role: user.role,
    branchId: user.branchId,
    // Abre (o reemplaza) la sesión única del usuario y firma el token con su jti.
    jti: openSession(user.id, { ip: clientIp(req), device: getRequestDeviceId(req) || undefined }),
  }),
  user: {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    branch: {
      id: user.branch.id,
      name: user.branch.name,
      phone: user.branch.phone,
      address: user.branch.address,
    },
  },
});

/**
 * Construye el segundo factor para un usuario que ya validó su contraseña.
 * - Si ya tiene una credencial registrada => opciones de AUTENTICACIÓN.
 * - Si no tiene credencial todavía         => opciones de REGISTRO (enrolamiento).
 * Devuelve también un token temporal "2FA pendiente" para el paso 2.
 */
export const buildLoginSecondFactor = async (user: UserWithBranch) => {
  if (user.webauthnCredentialId && user.webauthnPublicKey) {
    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: "required",
      allowCredentials: [{ id: user.webauthnCredentialId, transports: toTransports(user.webauthnTransports) }],
    });
    saveChallenge(user.id, options.challenge, "authenticate");
    return { requires2FA: true, mode: "authenticate" as const, pendingToken: generatePendingToken(user.id, "authenticate"), options };
  }

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userID: new TextEncoder().encode(String(user.id)),
    userName: user.email,
    userDisplayName: user.name,
    attestationType: "none",
    authenticatorSelection: {
      residentKey: "discouraged",
      userVerification: "required",
    },
  });
  saveChallenge(user.id, options.challenge, "register");
  return { requires2FA: true, mode: "register" as const, pendingToken: generatePendingToken(user.id, "register"), options };
};

/** Decodifica el token temporal y valida que corresponda al propósito esperado. */
const decodePending = (req: Request, expected: "register" | "authenticate"): number | null => {
  const token = req.body?.pendingToken;
  if (!token || typeof token !== "string") return null;
  const decoded = verifyToken(token);
  if (!decoded || decoded.tfa !== expected || !decoded.userId) return null;
  return Number(decoded.userId);
};

/**
 * PASO 2 (primer ingreso): verificar el enrolamiento del dispositivo biométrico y abrir sesión.
 */
export const webauthnRegisterVerify = async (req: Request, res: Response): Promise<void> => {
  const userId = decodePending(req, "register");
  if (!userId) {
    res.status(401).json({ message: "Sesión de verificación inválida o expirada. Vuelva a iniciar sesión." });
    return;
  }

  const expectedChallenge = consumeChallenge(userId, "register");
  if (!expectedChallenge) {
    res.status(400).json({ message: "El reto de registro expiró. Vuelva a iniciar sesión." });
    return;
  }

  try {
    const verification = await verifyRegistrationResponse({
      response: req.body.response,
      expectedChallenge,
      expectedOrigin: expectedOrigins,
      expectedRPID: rpID,
      requireUserVerification: true,
    });

    if (!verification.verified || !verification.registrationInfo) {
      res.status(400).json({ message: "No se pudo verificar el registro del dispositivo." });
      return;
    }

    const { credential } = verification.registrationInfo;

    await prisma.user.update({
      where: { id: userId },
      data: {
        webauthnCredentialId: credential.id,
        webauthnPublicKey: Buffer.from(credential.publicKey).toString("base64url"),
        webauthnCounter: credential.counter,
        webauthnTransports: credential.transports ? credential.transports.join(",") : null,
        webauthnRegisteredAt: new Date(),
      },
    });

    const user = (await prisma.user.findUnique({ where: { id: userId }, include: { branch: true } })) as unknown as UserWithBranch;
    recordLoginEvent(req, user, "Contraseña + Biometría (registro)");
    res.status(200).json({ message: "Dispositivo registrado. Acceso autorizado.", ...buildSessionResponse(user, req) });
  } catch (error: any) {
    console.error("[WEBAUTHN_REGISTER]", error?.message);
    res.status(400).json({ message: "Error al registrar el dispositivo de seguridad." });
  }
};

/**
 * PASO 2 (ingresos posteriores): verificar la firma del dispositivo biométrico y abrir sesión.
 */
export const webauthnLoginVerify = async (req: Request, res: Response): Promise<void> => {
  const userId = decodePending(req, "authenticate");
  if (!userId) {
    res.status(401).json({ message: "Sesión de verificación inválida o expirada. Vuelva a iniciar sesión." });
    return;
  }

  const expectedChallenge = consumeChallenge(userId, "authenticate");
  if (!expectedChallenge) {
    res.status(400).json({ message: "El reto de autenticación expiró. Vuelva a iniciar sesión." });
    return;
  }

  const user = (await prisma.user.findUnique({ where: { id: userId }, include: { branch: true } })) as unknown as UserWithBranch;
  if (!user || !user.webauthnCredentialId || !user.webauthnPublicKey) {
    res.status(400).json({ message: "El usuario no tiene un dispositivo de seguridad registrado." });
    return;
  }

  try {
    const verification = await verifyAuthenticationResponse({
      response: req.body.response,
      expectedChallenge,
      expectedOrigin: expectedOrigins,
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: {
        id: user.webauthnCredentialId,
        publicKey: new Uint8Array(Buffer.from(user.webauthnPublicKey, "base64url")),
        counter: user.webauthnCounter ?? 0,
        transports: toTransports(user.webauthnTransports),
      },
    });

    if (!verification.verified) {
      res.status(401).json({ message: "Verificación biométrica del dispositivo fallida." });
      return;
    }

    await prisma.user.update({
      where: { id: userId },
      data: { webauthnCounter: verification.authenticationInfo.newCounter },
    });

    recordLoginEvent(req, user, "Contraseña + Biometría");
    res.status(200).json({ message: "Acceso autorizado.", ...buildSessionResponse(user, req) });
  } catch (error: any) {
    console.error("[WEBAUTHN_LOGIN]", error?.message);
    res.status(401).json({ message: "Error al verificar el dispositivo de seguridad." });
  }
};
