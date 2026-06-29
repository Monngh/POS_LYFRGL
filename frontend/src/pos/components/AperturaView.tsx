import React from "react";
import { LogOut, Store, Users, Sun, Moon } from "lucide-react";
import { DECIMAL_INPUT_REGEX, handleDecimalInputChange } from "../../shared/utils/decimalInput";
import { useCashSession } from "../hooks/useCashSession";
import { usePosTheme, togglePosTheme } from "../../shared/hooks/usePosTheme";

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
  appContainer: { minHeight: "100vh", display: "flex", flexDirection: "column" as const, backgroundColor: "var(--surface-2)" },
  navbar: { height: "64px", backgroundColor: "var(--accent-strong)", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 24px", boxShadow: "0 2px 4px rgba(0,0,0,0.05)" },
  navBrand: { display: "flex", alignItems: "center", gap: "10px" },
  brandText: { color: "#ffffff", fontWeight: "800", fontSize: "16px", letterSpacing: "-0.3px" },
  logoutBtn: { backgroundColor: "transparent", border: "1px solid #93c5fd", color: "#ffffff", padding: "6px 12px", borderRadius: "4px", fontSize: "13px", fontWeight: "600", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px", transition: "all 0.15s ease" },
  themeBtn: { backgroundColor: "transparent", border: "1px solid #93c5fd", color: "#ffffff", width: "34px", height: "34px", borderRadius: "4px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s ease" },
  navActions: { display: "flex", alignItems: "center", gap: "10px" },
  mainLayout: { display: "flex", flex: 1 },
  sidebar: { width: "250px", backgroundColor: "var(--surface)", borderRight: "1px solid var(--border)", padding: "24px", display: "flex", flexDirection: "column" as const, alignItems: "center" },
  sidebarProfile: { display: "flex", flexDirection: "column" as const, alignItems: "center", textAlign: "center" as const, gap: "8px" },
  avatarIcon: { width: "48px", height: "48px", borderRadius: "50%", backgroundColor: "var(--surface-3)", display: "flex", justifyContent: "center", alignItems: "center", border: "1px solid var(--border-strong)" },
  profileName: { fontSize: "14px", fontWeight: "700", color: "var(--text)" },
  profileBranch: { fontSize: "12px", color: "var(--text-muted)" },
  contentArea: { flex: 1, padding: "24px", overflowY: "auto" as const },
  aperturaCard: { maxWidth: "400px", margin: "80px auto", backgroundColor: "var(--surface)", border: "1px solid #3b82f6", borderRadius: "12px", padding: "36px", boxShadow: "0 10px 15px -3px rgba(0,0,0,0.05)", textAlign: "center" as const },
  cardMainTitle: { fontSize: "20px", fontWeight: "800", color: "var(--accent-strong)", letterSpacing: "-0.5px", marginBottom: "8px" },
  inputGroup: { display: "flex", flexDirection: "column" as const, gap: "6px", textAlign: "left" as const },
  label: { fontSize: "11px", fontWeight: "700", color: "var(--text-secondary)", textTransform: "uppercase" as const, letterSpacing: "0.5px" },
  fieldError: { color: "#b91c1c", fontSize: "12px", fontWeight: "600", marginTop: "5px", marginBottom: 0 },
  submitBtn: { backgroundColor: "#2563eb", color: "#ffffff", border: "none", padding: "12px", borderRadius: "6px", fontWeight: "700", cursor: "pointer", boxShadow: "0 4px 6px rgba(37,99,235,0.15)" },
};

export function AperturaView({ sessionData, user, currentTime, onLogout }: AperturaViewProps) {
  const { initialFund, setInitialFund, initialFundError, setInitialFundError, openingLoading, handleOpenCash } = sessionData;
  const theme = usePosTheme();

  const handleOpen = async () => {
    try {
      await handleOpenCash();
    } catch (err: any) {
      const msg = err.response?.data?.message || "Error al abrir la caja.";
      setInitialFundError(msg);
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
        <div style={styles.navActions}>
          <button
            onClick={togglePosTheme}
            style={styles.themeBtn}
            className="active-tap"
            title={theme === "dark" ? "Modo claro" : "Modo oscuro"}
            aria-label={theme === "dark" ? "Activar modo claro" : "Activar modo oscuro"}
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button onClick={onLogout} style={styles.logoutBtn} className="active-tap pos-cashier-logout-btn">
            <LogOut size={16} /> Salir
          </button>
        </div>
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
                <span style={{ fontSize: "11px", fontWeight: "normal", color: "var(--text-muted)", marginLeft: "8px", display: "inline-block" }}>
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
            <p style={{ fontSize: "14px", color: "var(--text-muted)", marginBottom: "20px" }}>Establezca el fondo de caja inicial para comenzar el turno.</p>
 
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
 
            <button
              onClick={handleOpen}
              disabled={openingLoading || !initialFund.trim()}
              className="btn-primary active-tap"
              style={{ ...styles.submitBtn, width: "100%", marginTop: "24px" }}
            >
              {openingLoading ? "Abriendo Caja..." : "ABRIR TURNO ➜"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
