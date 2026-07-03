import { Request, Response } from "express";
import { generateToken, verifyToken } from "../utils/auth";
import {
  lockoutKey,
  getLockRemaining,
  registerFailedAttempt,
  clearFailedAttempts,
} from "../utils/authSecurity";
import { AppError } from "../utils/AppError";
import { buildLoginSecondFactor } from "./webauthn.controller";
import { recordLoginEvent, clientIp as auditClientIp } from "../utils/authAudit";
import { getActiveSession, openSession, closeSession } from "../utils/sessionRegistry";
import { getRequestDeviceId } from "../middlewares/device.middleware";
import {
  findUserForAdminLogin,
  findUserForCashierLogin,
  getUserProfile,
  getActiveBranches,
  getCashiersByBranch as getCashiersByBranchService,
  verifyManagerPin as verifyManagerPinService,
  generateOtpCode,
  validateOtpCode,
} from "../services/auth.service";

const clientIp = (req: Request): string =>
  (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
  req.ip ||
  req.socket.remoteAddress ||
  "unknown";

const lockMessage = (seconds: number): string => {
  const mins = Math.ceil(seconds / 60);
  return `Demasiados intentos fallidos. Cuenta bloqueada temporalmente. Intente de nuevo en ${mins} minuto(s).`;
};

const handleAppError = (error: unknown, res: Response, fallbackMessage: string): void => {
  if (error instanceof AppError) {
    const body: Record<string, unknown> = { message: error.message };
    if (error.code) body.code = error.code;
    res.status(error.statusCode).json(body);
    return;
  }
  console.error(error);
  res.status(500).json({ message: fallbackMessage });
};

export const adminLogin = async (req: Request, res: Response): Promise<void> => {
  const { email, password, autofilled } = req.body;
  if (!email || !password) {
    res.status(400).json({ message: "El correo y la contraseña son requeridos." });
    return;
  }
  try {
    const user = await findUserForAdminLogin(email, password, clientIp(req));

    // ── Sesión única por correo (admin/gerente) ──
    // La contraseña ya fue validada arriba. Solo se bloquea si ya hay una sesión
    // activa en OTRO dispositivo. Si la sesión activa es de ESTE mismo equipo
    // (mismo deviceId), se permite reingresar reemplazándola: así, aunque el
    // logout no haya alcanzado a liberar la sesión, la misma persona/máquina no
    // queda bloqueada.
    const currentDevice = getRequestDeviceId(req);
    const active = getActiveSession(user.id);
    if (active && active.device && currentDevice && active.device !== currentDevice) {
      res.status(409).json({
        code: "SESION_ABIERTA",
        message:
          "Ya hay una sesión activa con este usuario en otro dispositivo. Cierre esa sesión para poder ingresar.",
        session: {
          ip: active.ip || null,
          device: active.device || null,
          since: active.since,
        },
      });
      return;
    }

    // Segundo factor (Windows Hello) SOLO cuando el navegador autocompletó los
    // campos de correo y contraseña: protege contra el uso de credenciales
    // guardadas por terceros. Si se capturan a mano, el acceso es directo.
    if (autofilled) {
      const secondFactor = await buildLoginSecondFactor(user as any);
      res.status(200).json({
        message:
          secondFactor.mode === "register"
            ? "Contraseña correcta. Registre su dispositivo de seguridad (Windows Hello) para continuar."
            : "Contraseña correcta. Confirme su identidad con Windows Hello.",
        ...secondFactor,
      });
      return;
    }

    // Captura manual: acceso directo abriendo la sesión única del usuario.
    recordLoginEvent(req, user, "Contraseña");
    const jti = openSession(user.id, { ip: clientIp(req), device: getRequestDeviceId(req) || undefined });
    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      branchId: user.branchId,
      jti,
    });
    res.status(200).json({
      message: "Acceso autorizado.",
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        branch: {
          id: user.branch!.id,
          name: user.branch!.name,
          phone: user.branch!.phone,
          address: user.branch!.address,
        },
      },
    });
  } catch (error) {
    handleAppError(error, res, "Error interno del servidor.");
  }
};

export const cashierLogin = async (req: Request, res: Response): Promise<void> => {
  const { email, pinCode } = req.body;
  if (!email || !pinCode) {
    res.status(400).json({ message: "El correo y el código PIN son requeridos." });
    return;
  }

  // Lockout check stays here to preserve the retryAfterSeconds field in the response.
  const key = lockoutKey("cashier", email, clientIp(req));
  const locked = getLockRemaining(key);
  if (locked > 0) {
    res.status(429).json({
      code: "CUENTA_BLOQUEADA",
      message: lockMessage(locked),
      retryAfterSeconds: locked,
    });
    return;
  }

  try {
    const user = await findUserForCashierLogin(email, pinCode);
    clearFailedAttempts(key);
    recordLoginEvent(req, user, "PIN");
    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      branchId: user.branchId,
    });
    res.status(200).json({
      message: "Acceso autorizado.",
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        branch: {
          id: user.branch!.id,
          name: user.branch!.name,
          phone: user.branch!.phone,
          address: user.branch!.address,
        },
      },
    });
  } catch (error: any) {
    if (error instanceof AppError && error.code === "USUARIO_INVALIDO") {
      registerFailedAttempt(key);
      res.status(401).json({ code: "USUARIO_INVALIDO", message: error.message });
      return;
    }
    if (error instanceof AppError && error.code === "PIN_INCORRECTO") {
      const result = registerFailedAttempt(key);
      if (result.locked) {
        res.status(429).json({
          code: "CUENTA_BLOQUEADA",
          message: lockMessage(result.lockSeconds),
          retryAfterSeconds: result.lockSeconds,
        });
        return;
      }
      res.status(401).json({
        code: "PIN_INCORRECTO",
        message: "Código PIN incorrecto.",
        remainingAttempts: result.remainingAttempts,
      });
      return;
    }
    handleAppError(error, res, "Error interno del servidor.");
  }
};

/**
 * Cierra la sesión activa del usuario en el registro en memoria, liberando el
 * correo para un nuevo inicio de sesión. El middleware garantiza que solo el
 * titular de la sesión vigente llega aquí.
 */
export const logout = async (req: Request, res: Response): Promise<void> => {
  if (req.user?.userId) {
    closeSession(req.user.userId);
  }
  res.status(200).json({ message: "Sesión cerrada." });
};

export const getProfile = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: "No autenticado." });
    return;
  }
  try {
    const user = await getUserProfile(req.user.userId);
    res.status(200).json({ user });
  } catch (error) {
    handleAppError(error, res, "Error interno del servidor.");
  }
};

export const getBranches = async (_req: Request, res: Response): Promise<void> => {
  try {
    const branches = await getActiveBranches();
    res.status(200).json({ branches });
  } catch (error) {
    handleAppError(error, res, "Error al obtener sucursales.");
  }
};

export const getCashiersByBranch = async (req: Request, res: Response): Promise<void> => {
  const { branchId } = req.params;
  if (!branchId) {
    res.status(400).json({ message: "El ID de la sucursal es requerido." });
    return;
  }
  try {
    const cashiers = await getCashiersByBranchService(parseInt(branchId));
    res.status(200).json({ cashiers });
  } catch (error) {
    handleAppError(error, res, "Error al obtener cajeros de la sucursal.");
  }
};

export const verifyManagerPin = async (req: Request, res: Response): Promise<void> => {
  const { pinCode } = req.body;
  if (!pinCode) {
    res.status(400).json({ message: "El código PIN es requerido." });
    return;
  }
  const action = typeof req.body.action === "string" && req.body.action.trim() ? req.body.action.trim() : "CART_ACTION";
  try {
    const result = await verifyManagerPinService(pinCode, req.user!.branchId, {
      userId: req.user!.userId,
      ipAddress: auditClientIp(req),
      deviceId: getRequestDeviceId(req),
      action,
    });
    res.status(200).json(result);
  } catch (error) {
    handleAppError(error, res, "Error al validar el PIN.");
  }
};

export const requestOtp = async (req: Request, res: Response) => {
  try {
    const { pendingToken } = req.body;
    if (!pendingToken) {
      return res.status(400).json({ message: "Token requerido" });
    }
    const decoded = verifyToken(pendingToken);
    if (!decoded) {
      return res.status(401).json({ message: "Token inválido o expirado" });
    }
    const { email } = await generateOtpCode(decoded.userId);
    return res.json({
      message: "Código enviado a tu correo",
      email: email.replace(/(.{2}).*(@.*)/, "$1***$2"),
    });
  } catch (err) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ message: err.message });
    }
    console.error("[requestOtp]", err);
    return res.status(500).json({ message: "Error al enviar el código" });
  }
};

export const verifyOtp = async (req: Request, res: Response) => {
  try {
    const { pendingToken, otpCode } = req.body;
    if (!pendingToken || !otpCode) {
      return res.status(400).json({ message: "Token y código son requeridos" });
    }
    const decoded = verifyToken(pendingToken);
    if (!decoded) {
      return res.status(401).json({ message: "Token inválido o expirado" });
    }
    const user = await validateOtpCode(decoded.userId, otpCode);
    recordLoginEvent(req, user, "Contraseña + OTP correo");
    // Abre (o reemplaza) la sesión única del usuario y firma el token con su jti.
    const jti = openSession(user.id, { ip: clientIp(req), device: getRequestDeviceId(req) || undefined });
    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      branchId: user.branchId,
      jti,
    });
    return res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        branch: {
          id: user.branch!.id,
          name: user.branch!.name,
          phone: user.branch!.phone,
          address: user.branch!.address,
        },
      },
    });
  } catch (err) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ message: err.message });
    }
    console.error("[verifyOtp]", err);
    return res.status(500).json({ message: "Error al verificar el código" });
  }
};
