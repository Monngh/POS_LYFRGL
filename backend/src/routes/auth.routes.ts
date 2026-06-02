import { Router } from "express";
import { adminLogin, cashierLogin, getProfile, getBranches, getCashiersByBranch, verifyManagerPin } from "../controllers/auth.controller";
import { authenticateJWT } from "../middlewares/auth.middleware";

const router = Router();

// Obtener todas las sucursales (público para Login)
router.get("/branches", getBranches);

// Obtener cajeros asociados a una sucursal (público para Login)
router.get("/cashiers/:branchId", getCashiersByBranch);

// Endpoint para el inicio de sesión del Administrador / Gerente (Correo + Contraseña)
router.post("/admin-login", adminLogin);

// Endpoint para el inicio de sesión rápido de Cajero (Correo + PIN)
router.post("/cashier-login", cashierLogin);

// Endpoint para obtener el perfil del usuario autenticado (Protegido por JWT)
router.get("/profile", authenticateJWT, getProfile);

// Endpoint para validar PIN de Administrador/Gerente
router.post("/verify-pin", authenticateJWT, verifyManagerPin);

export default router;
