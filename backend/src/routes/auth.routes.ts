import { Router } from "express";
import rateLimit from "express-rate-limit";
import { adminLogin, cashierLogin, getProfile, getBranches, getCashiersByBranch, verifyManagerPin, requestOtp, verifyOtp } from "../controllers/auth.controller";
import { webauthnRegisterVerify, webauthnLoginVerify } from "../controllers/webauthn.controller";
import { authenticateJWT } from "../middlewares/auth.middleware";

const router = Router();

// Limitador por IP para los endpoints de inicio de sesión (capa extra sobre el
// bloqueo por cuenta). Frena ataques distribuidos contra muchos usuarios.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Demasiados intentos de inicio de sesión desde esta red. Intente más tarde." },
});

// Obtener todas las sucursales (público para Login)
router.get("/branches", getBranches);

// Obtener cajeros asociados a una sucursal (público para Login)
router.get("/cashiers/:branchId", getCashiersByBranch);

// Inicio de sesión del Administrador / Gerente — Paso 1 (Correo + Contraseña)
router.post("/admin-login", loginLimiter, adminLogin);

// Inicio de sesión rápido de Cajero (Correo + PIN)
router.post("/cashier-login", loginLimiter, cashierLogin);

// WebAuthn (Windows Hello) — Paso 2 del login de administrador
router.post("/webauthn/register-verify", loginLimiter, webauthnRegisterVerify);
router.post("/webauthn/login-verify", loginLimiter, webauthnLoginVerify);

// Endpoint para obtener el perfil del usuario autenticado (Protegido por JWT)
router.get("/profile", authenticateJWT, getProfile);

// Endpoint para validar PIN de Administrador/Gerente
router.post("/verify-pin", authenticateJWT, verifyManagerPin);

// Email OTP — Fallback del segundo factor WebAuthn
router.post("/request-otp", loginLimiter, requestOtp);
router.post("/verify-otp", loginLimiter, verifyOtp);

export default router;
