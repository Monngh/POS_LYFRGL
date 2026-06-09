import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";

// URL base de la API REST backend
// Si corre en Vite (5173/5174) usa localhost:4000, si corre desde ngrok/producción usa rutas relativas
const isVite = window.location.port === "5173" || window.location.port === "5174";
export const API_BASE_URL = (import.meta.env.VITE_API_URL as string) || (isVite ? "http://localhost:4000" : "");

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 10000, // 10 segundos de límite de espera
});

// Interceptor de Solicitudes (Request Interceptor)
// Inyecta el token de autenticación JWT si existe en el almacenamiento local
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem("fmb_pos_token");
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
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
      const isPinVerification = config.url?.endsWith("/verify-pin") || config.url?.endsWith("/authorize-cancel");

      if (status === 401 && !isPinVerification) {
        console.warn("Sesión expirada o no autorizada. Redirigiendo a inicio de sesión...");
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
