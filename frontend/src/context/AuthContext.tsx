import React, { createContext, useState, useEffect, useContext } from "react";
import { startRegistration, startAuthentication } from "@simplewebauthn/browser";
import api from "../services/api";

interface User {
  id: number;
  email: string;
  name: string;
  role: string;
  branch: {
    id: number;
    name: string;
    phone?: string;
    address?: string;
  };
}

interface AuthContextType {
  token: string | null;
  user: User | null;
  loading: boolean;
  webAuthnFailed: boolean;
  setWebAuthnFailed: (v: boolean) => void;
  pendingToken: string | null;
  loginAsAdmin: (email: string, password: string) => Promise<void>;
  loginAsCashier: (email: string, pinCode: string) => Promise<void>;
  requestOtp: () => Promise<{ email: string }>;
  verifyOtp: (otpCode: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(localStorage.getItem("fmb_pos_token"));
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [webAuthnFailed, setWebAuthnFailed] = useState(false);
  const [pendingToken, setPendingToken] = useState<string | null>(null);

  // Cargar perfil al iniciar si ya hay un token
  useEffect(() => {
    const fetchProfile = async () => {
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const response = await api.get("/api/auth/profile");
        setUser(response.data.user);
      } catch (error) {
        console.error("Error al cargar perfil inicial:", error);
        logout();
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();

    // Escuchar evento global de expiración de sesión (JWT 401)
    const handleAuthExpired = () => {
      logout();
    };

    window.addEventListener("auth-expired", handleAuthExpired);
    return () => {
      window.removeEventListener("auth-expired", handleAuthExpired);
    };
  }, [token]);

  const persistSession = (receivedToken: string, receivedUser: User) => {
    localStorage.setItem("fmb_pos_token", receivedToken);
    localStorage.setItem("fmb_pos_user", JSON.stringify(receivedUser));
    setToken(receivedToken);
    setUser(receivedUser);
  };

  /**
   * Login de administrador en 2 pasos:
   *   1) Correo + contraseña.
   *   2) Segundo factor WebAuthn (Windows Hello). Si el usuario aún no tiene
   *      dispositivo registrado, se enrola en este momento.
   * Aunque el navegador autocomplete la contraseña, sin el paso 2 no hay acceso.
   */
  const loginAsAdmin = async (email: string, password: string) => {
    setLoading(true);
    setWebAuthnFailed(false);
    try {
      const { data } = await api.post("/api/auth/admin-login", { email, password });

      // Compatibilidad: si el backend devolviera una sesión directa.
      if (data.token && data.user) {
        persistSession(data.token, data.user);
        return;
      }

      if (!data.requires2FA) {
        throw new Error(data.message || "Respuesta de autenticación no válida.");
      }

      const pt = data.pendingToken;
      setPendingToken(pt); // Guardar para el fallback OTP
      let verifyData;

      if (data.mode === "register") {
        // Primer ingreso: enrolar Windows Hello.
        let attResp;
        try {
          attResp = await startRegistration({ optionsJSON: data.options });
        } catch {
          // WebAuthn falló — activar fallback a OTP sin destruir el pendingToken
          setWebAuthnFailed(true);
          setLoading(false);
          return;
        }
        const res = await api.post("/api/auth/webauthn/register-verify", { pendingToken: pt, response: attResp });
        verifyData = res.data;
      } else {
        // Ingreso posterior: confirmar identidad con Windows Hello.
        let authResp;
        try {
          authResp = await startAuthentication({ optionsJSON: data.options });
        } catch {
          // WebAuthn falló — activar fallback a OTP sin destruir el pendingToken
          setWebAuthnFailed(true);
          setLoading(false);
          return;
        }
        const res = await api.post("/api/auth/webauthn/login-verify", { pendingToken: pt, response: authResp });
        verifyData = res.data;
      }

      persistSession(verifyData.token, verifyData.user);
    } catch (error: any) {
      setLoading(false);
      // Si ya es un Error con mensaje propio (ceremonial WebAuthn), respétalo.
      if (error instanceof Error && !(error as any).response) throw error;
      throw new Error(error.response?.data?.message || "Error al iniciar sesión.");
    }
  };

  const loginAsCashier = async (email: string, pinCode: string) => {
    setLoading(true);
    try {
      const response = await api.post("/api/auth/cashier-login", { email, pinCode });
      const { token: receivedToken, user: receivedUser } = response.data;

      localStorage.setItem("fmb_pos_token", receivedToken);
      localStorage.setItem("fmb_pos_user", JSON.stringify(receivedUser));

      setToken(receivedToken);
      setUser(receivedUser);
    } catch (error: any) {
      setLoading(false);
      // Propagar los datos estructurados del backend (código, intentos restantes,
      // segundos de bloqueo) para que el formulario muestre avisos precisos.
      const err = new Error(error.response?.data?.message || "PIN de acceso incorrecto.");
      (err as any).info = error.response?.data || {};
      throw err;
    }
  };

  const requestOtp = async (): Promise<{ email: string }> => {
    const res = await api.post("/api/auth/request-otp", { pendingToken });
    return res.data;
  };

  const verifyOtp = async (otpCode: string): Promise<void> => {
    const res = await api.post("/api/auth/verify-otp", { pendingToken, otpCode });
    setPendingToken(null);
    setWebAuthnFailed(false);
    persistSession(res.data.token, res.data.user);
  };

  const logout = () => {
    localStorage.removeItem("fmb_pos_token");
    localStorage.removeItem("fmb_pos_user");
    setToken(null);
    setUser(null);
    setPendingToken(null);
    setWebAuthnFailed(false);
    setLoading(false);
  };

  return (
    <AuthContext.Provider value={{
      token, user, loading,
      webAuthnFailed, setWebAuthnFailed,
      pendingToken,
      loginAsAdmin, loginAsCashier,
      requestOtp, verifyOtp,
      logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth debe ser utilizado dentro de un AuthProvider");
  }
  return context;
};
