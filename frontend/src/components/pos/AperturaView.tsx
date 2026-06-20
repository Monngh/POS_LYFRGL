import React, { useState } from "react";
import { LogOut, Store, Users } from "lucide-react";
import { DECIMAL_INPUT_REGEX, handleDecimalInputChange } from "../../utils/decimalInput";
import { useCashSession } from "../../hooks/pos/useCashSession";

interface AperturaUser {
  name: string;
  branch: { name: string };
}

interface AperturaViewProps {
  sessionData: ReturnType<typeof useCashSession>;
  user: AperturaUser | null;
  currentTime: Date;
  onLogout: () => void;
}

const styles: { [key: string]: React.CSSProperties } = {
  appContainer: { minHeight: "100vh", display: "flex", flexDirection: "column" as const, backgroundColor: "#f8fafc" },
  navbar: { height: "64px", backgroundColor: "#1e3a8a", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 24px", boxShadow: "0 2px 4px rgba(0,0,0,0.05)" },
  navBrand: { display: "flex", alignItems: "center", gap: "10px" },
  brandText: { color: "#ffffff", fontWeight: "800", fontSize: "16px", letterSpacing: "-0.3px" },
  logoutBtn: { backgroundColor: "transparent", border: "1px solid #93c5fd", color: "#ffffff", padding: "6px 12px", borderRadius: "4px", fontSize: "13px", fontWeight: "600", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px", transition: "all 0.15s ease" },
  mainLayout: { display: "flex", flex: 1 },
  sidebar: { width: "250px", backgroundColor: "#ffffff", borderRight: "1px solid #e2e8f0", padding: "24px", display: "flex", flexDirection: "column" as const, alignItems: "center" },
  sidebarProfile: { display: "flex", flexDirection: "column" as const, alignItems: "center", textAlign: "center" as const, gap: "8px" },
  avatarIcon: { width: "48px", height: "48px", borderRadius: "50%", backgroundColor: "#f1f5f9", display: "flex", justifyContent: "center", alignItems: "center", border: "1px solid #cbd5e1" },
  profileName: { fontSize: "14px", fontWeight: "700", color: "#0f172a" },
  profileBranch: { fontSize: "12px", color: "#64748b" },
  contentArea: { flex: 1, padding: "24px", overflowY: "auto" as const },
  aperturaCard: { maxWidth: "400px", margin: "80px auto", backgroundColor: "#ffffff", border: "1px solid #3b82f6", borderRadius: "12px", padding: "36px", boxShadow: "0 10px 15px -3px rgba(0,0,0,0.05)", textAlign: "center" as const },
  cardMainTitle: { fontSize: "20px", fontWeight: "800", color: "#1e3a8a", letterSpacing: "-0.5px", marginBottom: "8px" },
  inputGroup: { display: "flex", flexDirection: "column" as const, gap: "6px", textAlign: "left" as const },
  label: { fontSize: "11px", fontWeight: "700", color: "#475569", textTransform: "uppercase" as const, letterSpacing: "0.5px" },
  fieldError: { color: "#b91c1c", fontSize: "12px", fontWeight: "600", marginTop: "5px", marginBottom: 0 },
  submitBtn: { backgroundColor: "#2563eb", color: "#ffffff", border: "none", padding: "12px", borderRadius: "6px", fontWeight: "700", cursor: "pointer", boxShadow: "0 4px 6px rgba(37,99,235,0.15)" },
};

export function AperturaView({ sessionData, user, currentTime, onLogout }: AperturaViewProps) {
  const { initialFund, setInitialFund, initialFundError, setInitialFundError, openingLoading, handleOpenCash } = sessionData;

  const [openPin, setOpenPin] = useState("");
  const [openPinError, setOpenPinError] = useState("");

  // Wrapper que pasa el PIN al hook y captura errores de autorización PIN
  const handleOpen = async () => {
    try {
      await handleOpenCash(openPin.trim());
      setOpenPin("");
      setOpenPinError("");
    } catch (err: any) {
      const code = err.response?.data?.code;
      const msg = err.response?.data?.message || "PIN incorrecto.";
      if (code === "PIN_INVALIDO" || code === "PIN_REQUERIDO") {
        setOpenPinError(msg);
        setOpenPin("");
      }
    }
  };

  return (
    <div style={styles.appContainer} className="pos-cashier-app">
      {/* Navbar */}
      <header style={styles.navbar} className="pos-cashier-navbar">
        <div style={styles.navBrand}>
          <Store size={22} color="#ffffff" />
          <span style={styles.brandText} className="pos-cashier-brand-text">LYFRGL POS</span>
        </div>
        <button onClick={onLogout} style={styles.logoutBtn} className="active-tap pos-cashier-logout-btn">
          <LogOut size={16} /> Salir
        </button>
      </header>

      <div style={styles.mainLayout} className="pos-cashier-main-layout">
        {/* Sidebar */}
        <aside style={styles.sidebar} className="pos-cashier-sidebar">
          <div style={styles.sidebarProfile} className="pos-cashier-sidebar-profile">
            <div style={styles.avatarIcon}>
              <Users size={24} color="#475569" />
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <h4 style={styles.profileName}>
                {user?.name}
                <span style={{ fontSize: "11px", fontWeight: "normal", color: "#64748b", marginLeft: "8px", display: "inline-block" }}>
                  {currentTime.toLocaleDateString()} {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </h4>
              <p style={styles.profileBranch}>{user?.branch.name}</p>
            </div>
          </div>
        </aside>

        {/* Formulario Apertura Caja */}
        <div style={styles.contentArea} className="pos-cashier-content">
          <div style={styles.aperturaCard} className="pos-cashier-apertura-card">
            <h3 style={styles.cardMainTitle}>APERTURA DE CAJA</h3>
            <p style={{ fontSize: "14px", color: "#64748b", marginBottom: "20px" }}>Establezca el fondo de caja inicial para comenzar el turno.</p>

            <div style={styles.inputGroup}>
              <label style={styles.label}>FONDO INICIAL ($)</label>
              <input
                type="text"
                className="input-corporate"
                style={{ fontSize: "20px", fontWeight: "700", textAlign: "center", padding: "12px" }}
                value={initialFund}
                inputMode="decimal"
                onChange={(e) => {
                  const rawValue = e.target.value.trim();
                  if (rawValue && !DECIMAL_INPUT_REGEX.test(rawValue)) {
                    setInitialFundError("El fondo inicial debe ser un monto valido con maximo 3 decimales.");
                    return;
                  }
                  handleDecimalInputChange(rawValue, (value) => {
                  setInitialFund(value);
                  setInitialFundError("");
                  });
                }}
              />
              {initialFundError && <p style={styles.fieldError}>{initialFundError}</p>}
            </div>

            <div style={{ marginBottom: "12px", marginTop: "16px" }}>
              <label style={{ display: "block", marginBottom: "4px", fontSize: "13px", color: "var(--text-secondary)" }}>
                PIN de autorización (Gerente/Admin):
              </label>
              <input
                type="password"
                maxLength={4}
                placeholder="••••"
                value={openPin}
                onChange={e => {
                  setOpenPin(e.target.value.replace(/\D/g, ""));
                  setOpenPinError("");
                }}
                className="input-corporate"
                style={{ width: "100%" }}
              />
              {openPinError && (
                <p style={{ color: "#ef4444", fontSize: "12px", marginTop: "4px" }}>
                  {openPinError}
                </p>
              )}
            </div>

            <button
              onClick={handleOpen}
              disabled={openingLoading}
              className="btn-primary active-tap"
              style={{ ...styles.submitBtn, width: "100%", marginTop: "8px" }}
            >
              {openingLoading ? "Abriendo Caja..." : "ABRIR TURNO ➜"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
