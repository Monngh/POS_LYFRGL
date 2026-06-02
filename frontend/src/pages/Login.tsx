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
  const [activeTab, setActiveTab] = useState<"admin" | "cashier">("cashier"); // Por defecto cajero según maquetas
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

  // Obtener nombre de la sucursal seleccionada para el título
  const currentBranchName = branches.find(b => b.id.toString() === selectedBranchId)?.name || "Pachuca - Centro";

  return (
    <div style={styles.splitWrapper}>
      {/* PANEL IZQUIERDO: Estilo Maqueta 9 (Bienvenida Azul) */}
      <div style={styles.leftPanel}>
        <div style={styles.leftContent}>
          <div style={styles.badgeLabel}>FMB SOLUTIONS POS</div>
          <h1 style={styles.leftTitle}>LOGIN</h1>
          <p style={styles.leftSubtitle}>
            Bienvenido, acceda a su cuenta para continuar
          </p>
          <div style={styles.systemFooter}>
            Sistema de Punto de Venta Empresarial v1.2.0 • 2026
          </div>
        </div>
      </div>

      {/* PANEL DERECHO: Tarjeta de Autenticación */}
      <div style={styles.rightPanel}>
        <div style={styles.loginCard}>
          {/* Avatar e Identificación de Sucursal */}
          <div style={styles.avatarContainer}>
            <div style={styles.avatarIcon}>
              <KeyRound size={28} color="#1e3a8a" />
            </div>
            <h3 style={styles.branchTitle}>{activeTab === "cashier" ? currentBranchName : "Administración Central"}</h3>
            <p style={styles.promptText}>Identifíquese para iniciar su turno</p>
          </div>

          {/* Toggle de Roles */}
          <div style={styles.tabContainer}>
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
              <UserCheck size={16} />
              Caja Rápida
            </button>
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
              <ShieldCheck size={16} />
              Administración
            </button>
          </div>

          {/* Alerta de Error */}
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
                <label style={styles.label}>Usuario / Correo</label>
                <input
                  type="email"
                  required
                  className="input-corporate"
                  placeholder="admin@fmb.com"
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
                {loading ? "Iniciando..." : "ACEPTAR ➜"}
              </button>
            </form>
          )}

          {/* Formulario Cajeros (PIN Pad) */}
          {activeTab === "cashier" && (
            <div style={styles.cashierForm}>
              <div style={styles.inputGroup}>
                <label style={styles.label}>1. Seleccionar Sucursal</label>
                {loadingBranches ? (
                  <div style={styles.loadingBox}>
                    <RefreshCw size={14} className="spin-slow" /> Cargando...
                  </div>
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

              <div style={styles.inputGroup}>
                <label style={styles.label}>2. Seleccionar Cajero</label>
                {loadingCashiers ? (
                  <div style={styles.loadingBox}>
                    <RefreshCw size={14} className="spin-slow" /> Cargando...
                  </div>
                ) : cashiers.length === 0 ? (
                  <div style={styles.emptyBox}>No hay cajeros en esta sucursal</div>
                ) : (
                  <select
                    value={cashierEmail}
                    onChange={(e) => setCashierEmail(e.target.value)}
                    style={styles.select}
                  >
                    {cashiers.map((c) => (
                      <option key={c.id} value={c.email}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Display de PIN */}
              <div style={styles.pinDisplay}>
                <span style={styles.pinLabel}>Contraseña / PIN</span>
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

              {/* PIN Pad */}
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
    </div>
  );
};

// Estilos premium que calcan la estética y colorimetría de la maqueta 9
const styles: { [key: string]: React.CSSProperties } = {
  splitWrapper: {
    display: "flex",
    minHeight: "100vh",
    width: "100%",
    backgroundColor: "#2563eb", // Fondo azul que resalta el mockup
  },
  leftPanel: {
    flex: 1.1,
    backgroundColor: "#1d4ed8", // Azul oscuro de la maqueta
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "48px",
    color: "#ffffff",
  },
  leftContent: {
    maxWidth: "460px",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  badgeLabel: {
    fontSize: "12px",
    fontWeight: "800",
    letterSpacing: "2px",
    color: "#93c5fd",
    textTransform: "uppercase",
  },
  leftTitle: {
    fontSize: "64px",
    fontWeight: "900",
    lineHeight: "1.1",
    letterSpacing: "-2px",
  },
  leftSubtitle: {
    fontSize: "20px",
    fontWeight: "500",
    lineHeight: "1.4",
    opacity: 0.9,
  },
  systemFooter: {
    fontSize: "12px",
    opacity: 0.6,
    marginTop: "80px",
  },
  rightPanel: {
    flex: 1.3,
    backgroundColor: "#38bdf8", // Fondo celeste brillante de la maqueta
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "32px",
  },
  loginCard: {
    width: "100%",
    maxWidth: "440px",
    backgroundColor: "#ffffff",
    borderRadius: "16px",
    boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
    padding: "36px",
    display: "flex",
    flexDirection: "column",
    gap: "20px",
  },
  avatarContainer: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
    gap: "8px",
  },
  avatarIcon: {
    width: "64px",
    height: "64px",
    borderRadius: "50%",
    backgroundColor: "#f1f5f9",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    border: "2px solid #cbd5e1",
    marginBottom: "4px",
  },
  branchTitle: {
    fontSize: "18px",
    fontWeight: "700",
    color: "#0f172a",
  },
  promptText: {
    fontSize: "13px",
    color: "#64748b",
  },
  tabContainer: {
    display: "flex",
    backgroundColor: "#f1f5f9",
    borderRadius: "8px",
    padding: "4px",
  },
  tabButton: {
    flex: 1,
    padding: "8px",
    borderRadius: "6px",
    border: "none",
    backgroundColor: "transparent",
    fontSize: "13px",
    fontWeight: "600",
    color: "#64748b",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px",
    transition: "all 0.15s ease",
  },
  tabActive: {
    backgroundColor: "#ffffff",
    color: "#1e3a8a",
    boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
  },
  errorAlert: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    backgroundColor: "#fef2f2",
    border: "1px solid #fca5a5",
    borderRadius: "8px",
    padding: "10px 14px",
  },
  errorText: {
    fontSize: "13px",
    fontWeight: "500",
    color: "#991b1b",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "14px",
  },
  cashierForm: {
    display: "flex",
    flexDirection: "column",
    gap: "14px",
  },
  inputGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  label: {
    fontSize: "11px",
    fontWeight: "700",
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },
  select: {
    width: "100%",
    padding: "10px 14px",
    borderRadius: "6px",
    border: "1px solid #cbd5e1",
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
  pinDisplay: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    padding: "12px 16px",
    borderRadius: "8px",
    border: "1px solid #e2e8f0",
  },
  pinLabel: {
    fontSize: "12px",
    fontWeight: "600",
    color: "#64748b",
  },
  pinCircles: {
    display: "flex",
    gap: "12px",
  },
  pinDot: {
    width: "12px",
    height: "12px",
    borderRadius: "50%",
    backgroundColor: "#cbd5e1",
  },
  pinDotFilled: {
    backgroundColor: "#3b82f6",
  },
  pinPad: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: "8px",
  },
  pinBtn: {
    height: "48px",
    borderRadius: "6px",
    border: "1px solid #e2e8f0",
    backgroundColor: "#ffffff",
    fontSize: "16px",
    fontWeight: "700",
    color: "#334155",
    cursor: "pointer",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
  },
  pinBtnAction: {
    backgroundColor: "#f1f5f9",
    color: "#64748b",
  },
  pinBtnOK: {
    backgroundColor: "#e2e8f0",
    color: "#94a3b8",
    cursor: "not-allowed",
    border: "none",
  },
  pinBtnOKReady: {
    backgroundColor: "#2563eb", // Botón Aceptar Azul de la maqueta
    color: "#ffffff",
    cursor: "pointer",
    boxShadow: "0 4px 6px rgba(37, 99, 235, 0.2)",
  },
  submitBtn: {
    width: "100%",
    justifyContent: "center",
    padding: "12px",
    fontSize: "14px",
    fontWeight: "700",
    backgroundColor: "#2563eb",
    color: "#ffffff",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    boxShadow: "0 4px 6px rgba(37, 99, 235, 0.2)",
  },
};

export default Login;
