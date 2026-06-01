import React, { createContext, useState, useEffect, useContext } from "react";
import api from "../services/api";

interface User {
  id: number;
  email: string;
  name: string;
  role: string;
  branch: {
    id: number;
    name: string;
  };
}

interface AuthContextType {
  token: string | null;
  user: User | null;
  loading: boolean;
  loginAsAdmin: (email: string, password: string) => Promise<void>;
  loginAsCashier: (email: string, pinCode: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(localStorage.getItem("fmb_pos_token"));
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

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

  const loginAsAdmin = async (email: string, password: string) => {
    setLoading(true);
    try {
      const response = await api.post("/api/auth/admin-login", { email, password });
      const { token: receivedToken, user: receivedUser } = response.data;
      
      localStorage.setItem("fmb_pos_token", receivedToken);
      localStorage.setItem("fmb_pos_user", JSON.stringify(receivedUser));
      
      setToken(receivedToken);
      setUser(receivedUser);
    } catch (error: any) {
      setLoading(false);
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
      throw new Error(error.response?.data?.message || "PIN de acceso incorrecto.");
    }
  };

  const logout = () => {
    localStorage.removeItem("fmb_pos_token");
    localStorage.removeItem("fmb_pos_user");
    setToken(null);
    setUser(null);
    setLoading(false);
  };

  return (
    <AuthContext.Provider value={{ token, user, loading, loginAsAdmin, loginAsCashier, logout }}>
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
