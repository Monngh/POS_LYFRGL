import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Autofacturacion from "./pages/Autofacturacion";

// Componente para proteger Rutas Privadas
const PrivateRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token, loading } = useAuth();

  if (loading) {
    return (
      <div style={styles.loadingScreen}>
        <div style={styles.spinner} />
        <p style={styles.loadingText}>LYFRGL Solutions • Cargando sesión...</p>
      </div>
    );
  }

  return token ? <>{children}</> : <Navigate to="/login" replace />;
};

// Componente para proteger Rutas Públicas (no permitir entrar al login si ya inició sesión)
const PublicRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token, loading } = useAuth();

  // Solo esperar (sin renderizar) cuando hay un token que se está validando al
  // cargar la app. Durante un intento de login NO hay token, por lo que NO se
  // debe desmontar el Login: si lo hiciéramos, se perderían sus avisos
  // (PIN incorrecto, intentos restantes, bloqueo) al re-montarse al fallar.
  if (loading && token) return null;

  return !token ? <>{children}</> : <Navigate to="/dashboard" replace />;
};

const AppContent: React.FC = () => {
  return (
    <Routes>
      {/* Rutas Públicas */}
      <Route
        path="/login"
        element={
          <PublicRoute>
            <Login />
          </PublicRoute>
        }
      />
      <Route path="/autofacturacion" element={<Autofacturacion />} />
      <Route path="/facturar" element={<Autofacturacion />} />

      {/* Rutas Privadas Protegidas por JWT */}
      <Route
        path="/dashboard"
        element={
          <PrivateRoute>
            <Dashboard />
          </PrivateRoute>
        }
      />

      {/* Redirección por defecto */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <Router>
        <AppContent />
      </Router>
    </AuthProvider>
  );
}

// Estilos de pantalla de carga
const styles = {
  loadingScreen: {
    display: "flex",
    flexDirection: "column" as const,
    justifyContent: "center",
    alignItems: "center",
    minHeight: "100vh",
    backgroundColor: "#f8fafc",
  },
  spinner: {
    width: "40px",
    height: "40px",
    borderRadius: "50%",
    border: "3px solid #cbd5e1",
    borderTop: "3px solid #1e3a8a", // Navy color
    animation: "spin 1s linear infinite",
    marginBottom: "16px",
  },
  loadingText: {
    fontSize: "14px",
    fontWeight: "600",
    color: "#64748b",
  },
};

// Insertar animación de spinner inline en document
const styleSheet = document.createElement("style");
styleSheet.innerText = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;
document.head.appendChild(styleSheet);

export default App;
