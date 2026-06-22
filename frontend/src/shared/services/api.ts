import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";

// URL base de la API REST backend
// Si corre en Vite (5173/5174) usa localhost:4000, si corre desde ngrok/producción usa rutas relativas
const isVite = window.location.port === "5173" || window.location.port === "5174";
export const API_BASE_URL = (import.meta.env.VITE_API_URL as string) || (isVite ? "http://localhost:4000" : "");

// Tiempo de espera extendido para operaciones pesadas (ej. cobro con timbrado de factura
// ante el PAC/Facturapi o canje de puntos), que pueden superar con facilidad los 10s.
// Usar por petición: api.post(url, data, { timeout: LONG_OPERATION_TIMEOUT })
export const LONG_OPERATION_TIMEOUT = 90000; // 90 segundos

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 30000, // 30 segundos de límite de espera general
});

// Identificador único y persistente de este equipo/navegador.
// Se usa para vincular el turno de caja a un solo dispositivo: si la caja se
// abrió en esta computadora, no podrá operarse desde otra.
const DEVICE_ID_KEY = "fmb_pos_device_id";

export const getDeviceId = (): string => {
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `dev-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
};

// Interceptor de Solicitudes (Request Interceptor)
// Inyecta el token de autenticación JWT y el identificador del dispositivo
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = sessionStorage.getItem("fmb_pos_token");
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    if (config.headers) {
      config.headers["X-Device-Id"] = getDeviceId();
    }
    return config;
  },
  (error: any) => {
    return Promise.reject(error);
  }
);

// Interceptor de Respuestas (Response Interceptor)
// Captura y gestiona errores globales como sesiones expiradas (401 Unauthorized)
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response) {
      const { status, config } = error.response;
      
      // Evitar desloguear si es una verificación de PIN fallida (el supervisor ingresó PIN incorrecto)
      const isPinVerification =
        config.url?.endsWith("/verify-pin") ||
        config.url?.endsWith("/authorize-cancel") ||
        config.url?.endsWith("/returns") ||
        config.url?.includes("/cancel");

      // Un 4xx en los endpoints de LOGIN es un fallo de credenciales normal, NO una
      // sesión expirada: no se debe disparar logout ni borrar el almacenamiento.
      const url = config.url || "";
      const isLoginAttempt =
        url.endsWith("/admin-login") ||
        url.endsWith("/cashier-login") ||
        url.includes("/webauthn/");

      // Estos endpoints usan 401 para "contraseña incorrecta" o "sesión de auditoría
      // expirada" (reconfirmación de contraseña), NO para sesión expirada del usuario:
      // no deben cerrar la sesión. (cashier-access sí debe cerrarla si el JWT expiró.)
      const isSecurityAudit =
        url.endsWith("/security/audit-unlock") || url.endsWith("/security/admin-access");

      // El propio logout no debe re-disparar el cierre de sesión global.
      const isLogout = url.endsWith("/auth/logout");

      if (status === 401 && !isPinVerification && !isLoginAttempt && !isSecurityAudit && !isLogout) {
        console.warn("Sesión expirada o no autorizada. Redirigiendo a inicio de sesión...");

        // Si la sesión fue desplazada por otro inicio, guardar el aviso para el Login.
        const code = (error.response.data as any)?.code;
        if (code === "SESION_DESPLAZADA") {
          const msg = (error.response.data as any)?.message ||
            "Tu sesión se cerró porque se inició sesión con este usuario en otro dispositivo.";
          sessionStorage.setItem("fmb_pos_logout_reason", msg);
        }

        sessionStorage.removeItem("fmb_pos_token");
        sessionStorage.removeItem("fmb_pos_user");
        localStorage.removeItem("fmb_pos_token");
        localStorage.removeItem("fmb_pos_user");

        // Disparar evento global o redirigir enrutador si es necesario
        // En una SPA, podemos emitir un evento personalizado para que el App.tsx reaccione
        window.dispatchEvent(new Event("auth-expired"));
      }
    }
    return Promise.reject(error);
  }
);

export default api;
