import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { ShieldCheck, UserCheck, Delete, KeyRound, AlertCircle, RefreshCw } from "lucide-react";
import api from "../services/api";

interface Branch {
  id: number;
  name: string;
}

interface Cashier {
  id: number;
  email: string;
  name: string;
}

const Login: React.FC = () => {
  const { loginAsAdmin, loginAsCashier } = useAuth();
  
  // Estados de control
  const [activeTab, setActiveTab] = useState<"admin" | "cashier">("admin");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Datos dinámicos de base de datos
  const [branches, setBranches] = useState<Branch[]>([]);
  const [cashiers, setCashiers] = useState<Cashier[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>("");
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [loadingCashiers, setLoadingCashiers] = useState(false);

  // Formulario Admin
  const [adminEmail, setAdminEmail] = useState("admin@fmb.com");
  const [adminPassword, setAdminPassword] = useState("AdminPassword#2026");

  // Formulario Cajero (PIN)
  const [cashierEmail, setCashierEmail] = useState("");
  const [pinCode, setPinCode] = useState("");

  // Cargar sucursales al montar el componente
  useEffect(() => {
    const fetchBranches = async () => {
      setLoadingBranches(true);
      try {
        const response = await api.get("/api/auth/branches");
        const branchList = response.data.branches;
        setBranches(branchList);
        if (branchList.length > 0) {
          // Preseleccionar la primera sucursal
          setSelectedBranchId(branchList[0].id.toString());
        }
      } catch (err) {
        console.error("Error al cargar sucursales:", err);
        setError("Error de conexión con el servidor de base de datos SQL Server.");
      } finally {
        setLoadingBranches(false);
      }
    };

    fetchBranches();
  }, []);

  // Cargar cajeros cuando cambie la sucursal seleccionada
  useEffect(() => {
    const fetchCashiers = async () => {
      if (!selectedBranchId) return;
      setLoadingCashiers(true);
      setCashiers([]);
      setCashierEmail("");
      try {
        const response = await api.get(`/api/auth/cashiers/${selectedBranchId}`);
        const cashierList = response.data.cashiers;
        setCashiers(cashierList);
        if (cashierList.length > 0) {
          setCashierEmail(cashierList[0].email);
        }
      } catch (err) {
        console.error("Error al cargar cajeros:", err);
        setError("No se pudieron cargar los cajeros para la sucursal seleccionada.");
      } finally {
        setLoadingCashiers(false);
      }
    };

    fetchCashiers();
  }, [selectedBranchId]);

  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await loginAsAdmin(adminEmail, adminPassword);
    } catch (err: any) {
      setError(err.message || "Credenciales inválidas.");
    } finally {
      setLoading(false);
    }
  };

  const handleCashierPinPress = (num: string) => {
    setError(null);
    if (pinCode.length < 4) {
      setPinCode((prev) => prev + num);
    }
  };

  const handleClearPin = () => {
    setPinCode("");
    setError(null);
  };

  const handleCashierSubmit = async () => {
    if (!cashierEmail) {
      setError("Por favor seleccione un cajero.");
      return;
    }
    if (pinCode.length < 4) {
      setError("El PIN debe tener 4 dígitos.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await loginAsCashier(cashierEmail, pinCode);
    } catch (err: any) {
      setError(err.message || "PIN incorrecto.");
      setPinCode(""); // Limpiar PIN al fallar
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        {/* Encabezado FMB Solutions */}
        <div style={styles.header}>
          <div style={styles.logoCircle}>FMB</div>
          <h2 style={styles.title}>Punto de Venta Empresarial</h2>
          <p style={styles.subtitle}>FMB Solutions • Sistema de Gestión de Tienda</p>
        </div>

        {/* Pestañas de Login Híbrido */}
        <div style={styles.tabContainer}>
          <button
            style={{
              ...styles.tabButton,
              ...(activeTab === "admin" ? styles.tabActive : {}),
            }}
            onClick={() => {
              setActiveTab("admin");
              setError(null);
            }}
          >
            <ShieldCheck size={18} />
            Administración
          </button>
          <button
            style={{
              ...styles.tabButton,
              ...(activeTab === "cashier" ? styles.tabActive : {}),
            }}
            onClick={() => {
              setActiveTab("cashier");
              setError(null);
            }}
          >
            <UserCheck size={18} />
            Caja Rápida
          </button>
        </div>

        {/* Mensaje de Error */}
        {error && (
          <div style={styles.errorAlert}>
            <AlertCircle size={18} color="#b91c1c" />
            <span style={styles.errorText}>{error}</span>
          </div>
        )}

        {/* Formulario Administradores */}
        {activeTab === "admin" && (
          <form onSubmit={handleAdminSubmit} style={styles.form}>
            <div style={styles.inputGroup}>
              <label style={styles.label}>Correo Electrónico</label>
              <input
                type="email"
                required
                className="input-corporate"
                placeholder="ejemplo@fmb.com"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
              />
            </div>
            <div style={styles.inputGroup}>
              <label style={styles.label}>Contraseña</label>
              <input
                type="password"
                required
                className="input-corporate"
                placeholder="••••••••"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary active-tap"
              style={styles.submitBtn}
            >
              {loading ? "Verificando..." : "Ingresar al Sistema"}
            </button>
          </form>
        )}

        {/* Formulario Cajeros (Teclado Virtual PIN) */}
        {activeTab === "cashier" && (
          <div style={styles.cashierLayout}>
            {/* 1. SELECCIONAR SUCURSAL */}
            <div style={styles.inputGroup}>
              <label style={styles.label}>1. Seleccionar Sucursal</label>
              {loadingBranches ? (
                <div style={styles.loadingBox}><RefreshCw size={14} className="spin-slow" /> Cargando sucursales...</div>
              ) : (
                <select
                  value={selectedBranchId}
                  onChange={(e) => setSelectedBranchId(e.target.value)}
                  style={styles.select}
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* 2. SELECCIONAR CAJERO DE ESA SUCURSAL */}
            <div style={styles.inputGroup}>
              <label style={styles.label}>2. Seleccionar Cajero</label>
              {loadingCashiers ? (
                <div style={styles.loadingBox}><RefreshCw size={14} className="spin-slow" /> Cargando cajeros...</div>
              ) : cashiers.length === 0 ? (
                <div style={styles.emptyBox}>No hay cajeros asignados en esta sucursal</div>
              ) : (
                <select
                  value={cashierEmail}
                  onChange={(e) => setCashierEmail(e.target.value)}
                  style={styles.select}
                >
                  {cashiers.map((c) => (
                    <option key={c.id} value={c.email}>
                      {c.name} ({c.email})
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Display de PIN */}
            <div style={styles.pinDisplayContainer}>
              <label style={styles.label}>Ingresar Código PIN</label>
              <div style={styles.pinCircles}>
                {[0, 1, 2, 3].map((index) => (
                  <div
                    key={index}
                    style={{
                      ...styles.pinDot,
                      ...(pinCode.length > index ? styles.pinDotFilled : {}),
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Teclado Numérico PIN Pad */}
            <div style={styles.pinPad}>
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((num) => (
                <button
                  key={num}
                  type="button"
                  style={styles.pinBtn}
                  onClick={() => handleCashierPinPress(num)}
                  className="active-tap"
                >
                  {num}
                </button>
              ))}
              <button
                type="button"
                style={{ ...styles.pinBtn, ...styles.pinBtnAction }}
                onClick={handleClearPin}
                className="active-tap"
              >
                <Delete size={20} />
              </button>
              <button
                type="button"
                style={styles.pinBtn}
                onClick={() => handleCashierPinPress("0")}
                className="active-tap"
              >
                0
              </button>
              <button
                type="button"
                disabled={loading || pinCode.length < 4 || !cashierEmail}
                style={{
                  ...styles.pinBtn,
                  ...styles.pinBtnOK,
                  ...(pinCode.length === 4 && cashierEmail ? styles.pinBtnOKReady : {}),
                }}
                onClick={handleCashierSubmit}
                className="active-tap"
              >
                <KeyRound size={20} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Estilos JS limpios para control total y flexibilidad
const styles: { [key: string]: React.CSSProperties } = {
  container: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    minHeight: "100vh",
    backgroundColor: "#f8fafc",
    padding: "20px",
  },
  card: {
    width: "440px",
    backgroundColor: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: "16px",
    boxShadow: "0 10px 25px -5px rgba(0,0,0,0.03), 0 8px 10px -6px rgba(0,0,0,0.03)",
    padding: "32px",
  },
  header: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    marginBottom: "24px",
    textAlign: "center",
  },
  logoCircle: {
    width: "56px",
    height: "56px",
    borderRadius: "50%",
    backgroundColor: "#1e3a8a", // Navy
    color: "#ffffff",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    fontWeight: "800",
    fontSize: "18px",
    marginBottom: "12px",
    boxShadow: "0 4px 6px rgba(30, 58, 138, 0.15)",
  },
  title: {
    fontSize: "20px",
    fontWeight: "700",
    color: "#0f172a",
    letterSpacing: "-0.5px",
    marginBottom: "4px",
  },
  subtitle: {
    fontSize: "12px",
    fontWeight: "500",
    color: "#64748b",
  },
  tabContainer: {
    display: "flex",
    borderBottom: "2px solid #e2e8f0",
    marginBottom: "20px",
  },
  tabButton: {
    flex: 1,
    padding: "12px",
    backgroundColor: "transparent",
    border: "none",
    borderBottom: "2px solid transparent",
    fontSize: "14px",
    fontWeight: "600",
    color: "#64748b",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    transition: "all 0.15s ease",
    marginBottom: "-2px",
  },
  tabActive: {
    color: "#1e3a8a", // Navy Active
    borderBottom: "2px solid #1e3a8a",
  },
  errorAlert: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    backgroundColor: "#fef2f2",
    border: "1px solid #fca5a5",
    borderRadius: "8px",
    padding: "12px",
    marginBottom: "20px",
  },
  errorText: {
    fontSize: "13px",
    fontWeight: "500",
    color: "#991b1b",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  inputGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  label: {
    fontSize: "12px",
    fontWeight: "600",
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },
  submitBtn: {
    width: "100%",
    justifyContent: "center",
    marginTop: "8px",
    padding: "12px",
    fontSize: "14px",
    fontWeight: "600",
    boxShadow: "0 2px 4px rgba(30, 58, 138, 0.1)",
  },
  cashierLayout: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  select: {
    width: "100%",
    padding: "10px 14px",
    borderRadius: "6px",
    border: "1px solid #e2e8f0",
    backgroundColor: "#ffffff",
    color: "#0f172a",
    fontSize: "14px",
    fontWeight: "500",
    outline: "none",
  },
  loadingBox: {
    fontSize: "13px",
    color: "#64748b",
    padding: "10px 14px",
    backgroundColor: "#f1f5f9",
    border: "1px solid #e2e8f0",
    borderRadius: "6px",
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  emptyBox: {
    fontSize: "13px",
    color: "#991b1b",
    padding: "10px 14px",
    backgroundColor: "#fef2f2",
    border: "1px solid #fca5a5",
    borderRadius: "6px",
  },
  pinDisplayContainer: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "8px",
    backgroundColor: "#f1f5f9",
    padding: "12px",
    borderRadius: "10px",
    border: "1px dashed #cbd5e1",
  },
  pinCircles: {
    display: "flex",
    gap: "16px",
  },
  pinDot: {
    width: "14px",
    height: "14px",
    borderRadius: "50%",
    backgroundColor: "#cbd5e1",
    transition: "background-color 0.15s ease",
  },
  pinDotFilled: {
    backgroundColor: "#0d9488", // Teal color
  },
  pinPad: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: "10px",
    marginTop: "4px",
  },
  pinBtn: {
    height: "56px",
    borderRadius: "8px",
    border: "1px solid #e2e8f0",
    backgroundColor: "#ffffff",
    fontSize: "18px",
    fontWeight: "700",
    color: "#334155",
    cursor: "pointer",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    transition: "background-color 0.1s ease",
  },
  pinBtnAction: {
    color: "#64748b",
    backgroundColor: "#f1f5f9",
  },
  pinBtnOK: {
    backgroundColor: "#cbd5e1",
    color: "#94a3b8",
    border: "none",
    cursor: "not-allowed",
  },
  pinBtnOKReady: {
    backgroundColor: "#059669", // Emerald green
    color: "#ffffff",
    cursor: "pointer",
    boxShadow: "0 4px 6px rgba(5, 150, 105, 0.2)",
  },
};

// Insertar animación de spin inline para el spinner de sucursales
const styleSheet = document.createElement("style");
styleSheet.innerText = `
  @keyframes spin-slow {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  .spin-slow {
    animation: spin-slow 2s linear infinite;
  }
`;
document.head.appendChild(styleSheet);

export default Login;
