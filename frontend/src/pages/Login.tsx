import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { ShieldCheck, UserCheck, Delete, KeyRound, AlertCircle, RefreshCw, Lock } from "lucide-react";
import api from "../services/api";
import {
  type FieldErrors,
  normalizeEmailInput,
  normalizeSpaces,
  validateEmail,
  validateInteger,
  validateSearchText,
} from "../utils/formValidation";

interface Branch {
  id: number;
  name: string;
}

interface Cashier {
  id: number;
  email: string;
  name: string;
}

// Hook de responsividad: reacciona al ancho del viewport en vivo
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches
  );
  useEffect(() => {
    const m = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    setMatches(m.matches);
    m.addEventListener("change", handler);
    return () => m.removeEventListener("change", handler);
  }, [query]);
  return matches;
}

// Baraja los dígitos 0-9 (Fisher-Yates) para que el teclado del PIN cambie de
// posición y dificulte que alguien "lea" el NIP por la posición de los toques.
const shuffleDigits = (): string[] => {
  const d = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
};

// Formatea segundos como MM:SS para la cuenta regresiva de bloqueo.
const formatMMSS = (totalSeconds: number): string => {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

const Login: React.FC = () => {
  const { loginAsAdmin, loginAsCashier } = useAuth();

  const isMobile = useMediaQuery("(max-width: 860px)");
  const shortScreen = useMediaQuery("(max-height: 860px)");

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
  const [adminFieldErrors, setAdminFieldErrors] = useState<FieldErrors<"email" | "password">>({});

  // Formulario Cajero (PIN)
  const [cashierEmail, setCashierEmail] = useState("");
  const [pinCode, setPinCode] = useState("");
  const [cashierSearch, setCashierSearch] = useState("");
  const [showCashierDropdown, setShowCashierDropdown] = useState(false);
  const [cashierFieldErrors, setCashierFieldErrors] = useState<FieldErrors<"cashier" | "pin">>({});
  const [focusedCashierIndex, setFocusedCashierIndex] = useState(-1);

  // Seguridad del PIN: teclado barajado, intentos restantes y bloqueo temporal
  const [shuffledDigits, setShuffledDigits] = useState<string[]>(() => shuffleDigits());
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);
  const [lockRemaining, setLockRemaining] = useState(0); // segundos restantes de bloqueo
  const isLocked = lockRemaining > 0;

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
      setCashierSearch("");
      setCashierFieldErrors({});
      try {
        const response = await api.get(`/api/auth/cashiers/${selectedBranchId}`);
        const cashierList = response.data.cashiers;
        setCashiers(cashierList);
        if (cashierList.length > 0) {
          setCashierEmail("");
          setCashierSearch(""); 
          setCashierFieldErrors({});
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

  // Filtrar cajeros por nombre
  const filteredCashiers = cashiers.filter((c) =>
    c.name.toLowerCase().includes(cashierSearch.toLowerCase())
  );

  const hasErrors = (errors: FieldErrors) => Object.values(errors).some(Boolean);

  const validateAdminForm = () => ({
    email: validateEmail(adminEmail, { required: true }),
    password: normalizeSpaces(adminPassword) ? undefined : "La contrasena es obligatoria.",
  });

  const validateCashierForm = () => ({
    cashier:
      validateSearchText(cashierSearch, "La busqueda", { max: 80 }) ||
      (cashierEmail ? undefined : "Seleccione un cajero valido."),
    pin: validateInteger(pinCode, "El PIN", { min: 0, max: 9999 }) || (pinCode.length === 4 ? undefined : "El PIN debe tener 4 digitos."),
  });

  const setAdminField = (field: "email" | "password", value: string) => {
    const next = field === "email" ? normalizeEmailInput(value) : value;
    if (field === "email") setAdminEmail(next);
    if (field === "password") setAdminPassword(next);
    setAdminFieldErrors((prev) => ({
      ...prev,
      [field]: field === "email" ? validateEmail(next, { required: true }) : normalizeSpaces(next) ? undefined : "La contrasena es obligatoria.",
    }));
  };

  const setCashierSearchField = (value: string) => {
    const error = validateSearchText(value, "La busqueda", { max: 80 });
    setCashierSearch(value);
    setShowCashierDropdown(true);
    setCashierEmail("");
    setFocusedCashierIndex(-1);
    setCashierFieldErrors((prev) => ({ ...prev, cashier: error }));
  };

  // Cuenta regresiva del bloqueo temporal: descuenta 1s y, al llegar a 0,
  // limpia el aviso de bloqueo automáticamente.
  useEffect(() => {
    if (lockRemaining <= 0) return;
    const t = setTimeout(() => {
      const next = lockRemaining - 1;
      setLockRemaining(next);
      if (next === 0) setError(null);
    }, 1000);
    return () => clearTimeout(t);
  }, [lockRemaining]);

  // Escuchar teclado físico para el ingreso del PIN de cajero
  useEffect(() => {
    if (activeTab !== "cashier") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isLocked) return; // bloqueado por seguridad: ignorar el teclado físico

      const activeEl = document.activeElement;
      const isInputFocused = activeEl && (
        activeEl.tagName === "INPUT" && activeEl.getAttribute("type") === "text"
      );

      if (isInputFocused) {
        return;
      }

      if (e.key >= "0" && e.key <= "9") {
        e.preventDefault();
        setError(null);
        setPinCode((prev) => (prev.length < 4 ? prev + e.key : prev));
        setCashierFieldErrors((prev) => ({ ...prev, pin: undefined }));
      } else if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        setError(null);
        setPinCode((prev) => prev.slice(0, -1));
        setCashierFieldErrors((prev) => ({ ...prev, pin: undefined }));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (pinCode.length === 4 && cashierEmail) {
          handleCashierSubmit();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeTab, pinCode, cashierEmail, isLocked]);

  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const errors = validateAdminForm();
    setAdminFieldErrors(errors);
    if (hasErrors(errors)) return;

    setLoading(true);
    try {
      await loginAsAdmin(normalizeEmailInput(adminEmail), adminPassword);
    } catch (err: any) {
      setError(err.message || "Credenciales inválidas.");
    } finally {
      setLoading(false);
    }
  };

  const handleCashierPinPress = (num: string) => {
    if (isLocked) return;
    setError(null);
    if (pinCode.length < 4) {
      setPinCode((prev) => prev + num);
      setCashierFieldErrors((prev) => ({ ...prev, pin: undefined }));
    }
  };

  const handleClearPin = () => {
    if (isLocked) return;
    setPinCode("");
    setError(null);
    setCashierFieldErrors((prev) => ({ ...prev, pin: "El PIN es obligatorio." }));
  };

  const handleCashierSubmit = async () => {
    if (isLocked) return;
    const errors = validateCashierForm();
    setCashierFieldErrors(errors);
    if (hasErrors(errors)) return;

    setError(null);
    setLoading(true);
    try {
      await loginAsCashier(cashierEmail, pinCode);
    } catch (err: any) {
      const info = err.info || {};
      // Avisos precisos según el motivo informado por el backend.
      // Cada motivo usa UN solo aviso dedicado (evita mensajes duplicados).
      if (info.code === "CUENTA_BLOQUEADA") {
        setLockRemaining(info.retryAfterSeconds || 0);
        setRemainingAttempts(null);
        setError(null); // el banner rojo de bloqueo ya comunica el motivo
      } else if (info.code === "PIN_INCORRECTO") {
        setRemainingAttempts(typeof info.remainingAttempts === "number" ? info.remainingAttempts : null);
        setError(null); // el aviso ámbar ya dice "PIN incorrecto + intentos restantes"
      } else {
        setRemainingAttempts(null);
        setError(err.message || "No se pudo iniciar sesión.");
      }
      setPinCode(""); // Limpiar PIN al fallar
      setShuffledDigits(shuffleDigits()); // Re-barajar el teclado tras cada fallo
    } finally {
      setLoading(false);
    }
  };

  // Obtener nombre de la sucursal seleccionada para el título
  const currentBranchName = branches.find(b => b.id.toString() === selectedBranchId)?.name || "Pachuca - Centro";

  // ─────────────────────────────────────────────────────────────
  // Modo compacto: cuando la pantalla es baja, el formulario se
  // ajusta (menos espaciado/tamaño) en vez de generar scroll.
  // ─────────────────────────────────────────────────────────────
  const compact = shortScreen;
  const cardStyle: React.CSSProperties = { ...styles.loginCard, ...(compact ? { padding: "22px 28px", gap: "12px" } : {}) };
  const avatarWrapStyle: React.CSSProperties = { ...styles.avatarContainer, ...(compact ? { gap: "4px" } : {}) };
  const avatarBoxStyle: React.CSSProperties = { ...styles.avatarIcon, ...(compact ? { width: "50px", height: "50px", marginBottom: "0px" } : {}) };
  const formStyle: React.CSSProperties = { ...styles.form, ...(compact ? { gap: "10px" } : {}) };
  const cashierFormStyle: React.CSSProperties = { ...styles.cashierForm, ...(compact ? { gap: "10px" } : {}) };
  const pinDisplayStyle: React.CSSProperties = { ...styles.pinDisplay, ...(compact ? { padding: "8px 14px" } : {}) };
  const pinPadStyle: React.CSSProperties = { ...styles.pinPad, ...(compact ? { gap: "6px" } : {}) };
  const pinBtnStyle: React.CSSProperties = { ...styles.pinBtn, ...(compact ? { height: "42px" } : {}) };

  // ─────────────────────────────────────────────────────────────
  // Bloque de marca (panel azul de bienvenida)
  // ─────────────────────────────────────────────────────────────
  const brand = (
    <div style={styles.brandInner}>
      <div style={styles.badgeLabel}>LYFRGL SOLUTIONS POS</div>
      <h1 style={styles.leftTitle}>LOGIN</h1>
      <p style={styles.leftSubtitle}>Bienvenido, acceda a su cuenta para continuar</p>
      <div style={styles.systemFooter}>Sistema de Punto de Venta Empresarial v1.2.0 • 2026</div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────
  // Tarjeta de autenticación (idéntica en escritorio y móvil)
  // ─────────────────────────────────────────────────────────────
  const card = (
    <div style={cardStyle}>
      {/* Avatar e Identificación de Sucursal */}
      <div style={avatarWrapStyle}>
        <div style={avatarBoxStyle}>
          <KeyRound size={compact ? 24 : 28} color="#1e3a8a" />
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
            setAdminFieldErrors({});
            setRemainingAttempts(null);
            setShuffledDigits(shuffleDigits());
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
            setCashierFieldErrors({});
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
        <form onSubmit={handleAdminSubmit} style={formStyle} noValidate>
          <div style={styles.inputGroup}>
            <label style={styles.label}>Usuario / Correo</label>
            <input
              type="email"
              required
              className="input-corporate"
              placeholder="admin@fmb.com"
              value={adminEmail}
              onChange={(e) => setAdminField("email", e.target.value)}
              onBlur={() => setAdminFieldErrors((prev) => ({ ...prev, email: validateEmail(adminEmail, { required: true }) }))}
              style={adminFieldErrors.email ? styles.inputInvalid : undefined}
            />
            {adminFieldErrors.email && <p style={styles.fieldError}>{adminFieldErrors.email}</p>}
          </div>
          <div style={styles.inputGroup}>
            <label style={styles.label}>Contraseña</label>
            <input
              type="password"
              required
              className="input-corporate"
              placeholder="••••••••"
              value={adminPassword}
              onChange={(e) => setAdminField("password", e.target.value)}
              onBlur={() => setAdminFieldErrors((prev) => ({ ...prev, password: normalizeSpaces(adminPassword) ? undefined : "La contrasena es obligatoria." }))}
              style={adminFieldErrors.password ? styles.inputInvalid : undefined}
            />
            {adminFieldErrors.password && <p style={styles.fieldError}>{adminFieldErrors.password}</p>}
          </div>
          <div style={styles.twoFactorHint}>
            <ShieldCheck size={14} color="#1e3a8a" />
            <span>Verificación en dos pasos: se le pedirá confirmar con <strong>Windows Hello</strong> (huella, rostro o PIN del equipo).</span>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="btn-primary active-tap"
            style={styles.submitBtn}
          >
            {loading ? "Verificando..." : "ACEPTAR ➜"}
          </button>
        </form>
      )}

      {/* Formulario Cajeros (PIN Pad) */}
      {activeTab === "cashier" && (
        <div style={cashierFormStyle}>
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
              <div style={{ position: "relative" }}>
                <input
                  type="text"
                  placeholder="Buscar o seleccionar cajero..."
                  className="input-corporate"
                  value={cashierSearch}
                  onChange={(e) => {
                    setCashierSearchField(e.target.value);
                  }}
                  onFocus={() => setShowCashierDropdown(true)}
                  onKeyDown={(e) => {
                    if (!showCashierDropdown || filteredCashiers.length === 0) return;
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setFocusedCashierIndex((prev) => (prev < filteredCashiers.length - 1 ? prev + 1 : prev));
                    } else if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setFocusedCashierIndex((prev) => (prev > 0 ? prev - 1 : 0));
                    } else if (e.key === "Enter") {
                      e.preventDefault();
                      if (focusedCashierIndex >= 0 && focusedCashierIndex < filteredCashiers.length) {
                        const c = filteredCashiers[focusedCashierIndex];
                        setCashierEmail(c.email);
                        setCashierSearch(c.name);
                        setCashierFieldErrors((prev) => ({ ...prev, cashier: undefined }));
                        setShowCashierDropdown(false);
                        e.currentTarget.blur();
                      }
                    }
                  }}
                  onBlur={() => {
                    setCashierFieldErrors((prev) => ({
                      ...prev,
                      cashier: validateSearchText(cashierSearch, "La busqueda", { max: 80 }) || (cashierEmail ? undefined : "Seleccione un cajero valido."),
                    }));
                    setTimeout(() => setShowCashierDropdown(false), 200);
                  }}
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    fontSize: "14px",
                    borderRadius: "6px",
                    border: cashierFieldErrors.cashier ? "1px solid #ef4444" : "1px solid #cbd5e1",
                  }}
                />
                {cashierFieldErrors.cashier && <p style={styles.fieldError}>{cashierFieldErrors.cashier}</p>}
                {showCashierDropdown && (
                  <div style={styles.autocompleteDropdown}>
                    {filteredCashiers.map((c, idx) => (
                      <div
                        key={c.id}
                        style={{
                          padding: "10px 14px",
                          cursor: "pointer",
                          fontSize: "14px",
                          backgroundColor: (cashierEmail === c.email || focusedCashierIndex === idx) ? "#eff6ff" : "#ffffff",
                          color: (cashierEmail === c.email || focusedCashierIndex === idx) ? "#1e3a8a" : "#0f172a",
                          fontWeight: cashierEmail === c.email ? "600" : "500",
                          transition: "background-color 0.15s ease",
                        }}
                        onMouseDown={() => {
                          setCashierEmail(c.email);
                          setCashierSearch(c.name);
                          setCashierFieldErrors((prev) => ({ ...prev, cashier: undefined }));
                          setShowCashierDropdown(false);
                        }}
                        className="autocomplete-item-hover"
                      >
                        {c.name}
                      </div>
                    ))}
                    {filteredCashiers.length === 0 && (
                      <div style={{ padding: "10px 14px", color: "#64748b", fontSize: "13px" }}>
                        No se encontraron resultados
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Display de PIN */}
          <div style={pinDisplayStyle}>
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

          {cashierFieldErrors.pin && <p style={styles.fieldError}>{cashierFieldErrors.pin}</p>}

          {/* Aviso de bloqueo temporal con cuenta regresiva */}
          {isLocked && (
            <div style={styles.lockBanner}>
              <Lock size={18} color="#b91c1c" />
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ fontWeight: 700 }}>Acceso bloqueado por seguridad</span>
                <span style={{ fontSize: "12px" }}>
                  Demasiados intentos fallidos. Reintente en <strong>{formatMMSS(lockRemaining)}</strong>
                </span>
              </div>
            </div>
          )}

          {/* Aviso de intentos restantes (solo si no está bloqueado) */}
          {!isLocked && remainingAttempts !== null && (
            <div style={styles.attemptsWarning}>
              <AlertCircle size={16} color="#b45309" />
              <span>
                {remainingAttempts > 0
                  ? <>PIN incorrecto. Le queda{remainingAttempts === 1 ? "" : "n"} <strong>{remainingAttempts}</strong> intento{remainingAttempts === 1 ? "" : "s"} antes del bloqueo.</>
                  : <>Último intento fallido. La cuenta será bloqueada.</>}
              </span>
            </div>
          )}

          {/* Leyenda de seguridad del teclado */}
          <div style={styles.keypadHint}>
            <ShieldCheck size={13} color="#64748b" />
            <span>Teclado seguro: los números cambian de lugar para proteger su PIN.</span>
          </div>

          {/* PIN Pad — orden aleatorio (anti-espía) */}
          <div style={{ ...pinPadStyle, ...(isLocked ? { opacity: 0.5, pointerEvents: "none" as const } : {}) }}>
            {shuffledDigits.slice(0, 9).map((num) => (
              <button
                key={num}
                type="button"
                disabled={isLocked || loading}
                style={pinBtnStyle}
                onClick={() => handleCashierPinPress(num)}
                className="active-tap"
              >
                {num}
              </button>
            ))}
            <button
              type="button"
              disabled={isLocked || loading}
              style={{ ...pinBtnStyle, ...styles.pinBtnAction }}
              onClick={handleClearPin}
              className="active-tap"
            >
              <Delete size={20} />
            </button>
            <button
              type="button"
              disabled={isLocked || loading}
              style={pinBtnStyle}
              onClick={() => handleCashierPinPress(shuffledDigits[9])}
              className="active-tap"
            >
              {shuffledDigits[9]}
            </button>
            <button
              type="button"
              disabled={loading || pinCode.length < 4 || !cashierEmail || isLocked}
              style={{
                ...pinBtnStyle,
                ...styles.pinBtnOK,
                ...(pinCode.length === 4 && cashierEmail && !isLocked ? styles.pinBtnOKReady : {}),
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
  );

  // ─────────────────────────────────────────────────────────────
  // Disposición MÓVIL: una sola columna, sin desbordes
  // ─────────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div style={styles.mobileWrapper}>
        <div style={styles.mobileBrand}>
          <div style={{ ...styles.badgeLabel, color: "#bfdbfe" }}>LYFRGL SOLUTIONS POS</div>
          <h1 style={styles.mobileTitle}>Bienvenido</h1>
        </div>
        {card}
        <div style={styles.mobileFooter}>Sistema de Punto de Venta Empresarial v1.2.0 • 2026</div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────
  // Disposición ESCRITORIO: split con animación de intercambio de lado
  //   · Administración → marca a la izquierda, formulario a la derecha
  //   · Caja Rápida    → se deslizan e intercambian de lado
  // ─────────────────────────────────────────────────────────────
  const formOnRight = activeTab === "admin";
  return (
    <div style={styles.splitWrapper}>
      {/* Panel de marca (se desliza) */}
      <div
        style={{
          ...styles.panelBase,
          ...styles.brandPanel,
          padding: compact ? "16px" : "32px",
          transform: `translateX(${formOnRight ? "0%" : "100%"})`,
        }}
      >
        {brand}
      </div>

      {/* Panel del formulario (se desliza al lado opuesto) */}
      <div
        style={{
          ...styles.panelBase,
          ...styles.formPanel,
          padding: compact ? "16px" : "32px",
          transform: `translateX(${formOnRight ? "100%" : "0%"})`,
        }}
      >
        {card}
      </div>
    </div>
  );
};

// Estilos premium que calcan la estética y colorimetría de la maqueta 9
const styles: { [key: string]: React.CSSProperties } = {
  // ── Escritorio: contenedor con paneles deslizables ──
  splitWrapper: {
    position: "relative",
    minHeight: "100vh",
    width: "100%",
    overflow: "hidden",
    backgroundColor: "#1d4ed8",
  },
  panelBase: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "50%",
    height: "100%",
    display: "flex",
    overflowY: "auto",
    boxSizing: "border-box",
    padding: "32px",
    transition: "transform 0.6s cubic-bezier(0.65, 0, 0.35, 1)",
    willChange: "transform",
  },
  brandPanel: {
    background: "linear-gradient(160deg, #1e3a8a 0%, #1d4ed8 100%)",
    color: "#ffffff",
  },
  formPanel: {
    backgroundColor: "#38bdf8",
  },
  brandInner: {
    margin: "auto",
    maxWidth: "460px",
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },

  // ── Móvil: una sola columna apilada ──
  mobileWrapper: {
    minHeight: "100vh",
    width: "100%",
    background: "linear-gradient(160deg, #1e3a8a 0%, #38bdf8 100%)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "28px 18px 32px",
    overflowX: "hidden",
    boxSizing: "border-box",
  },
  mobileBrand: {
    width: "100%",
    maxWidth: "440px",
    textAlign: "center",
    color: "#ffffff",
    marginBottom: "20px",
  },
  mobileTitle: {
    fontSize: "30px",
    fontWeight: "900",
    letterSpacing: "-1px",
    marginTop: "4px",
  },
  mobileFooter: {
    fontSize: "11px",
    color: "rgba(255,255,255,0.75)",
    marginTop: "20px",
    textAlign: "center",
  },

  // ── Marca (texto del panel azul) ──
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

  // ── Tarjeta de autenticación ──
  loginCard: {
    width: "100%",
    maxWidth: "440px",
    margin: "auto",
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
  fieldError: {
    margin: "2px 0 0",
    color: "#b91c1c",
    fontSize: "11px",
    fontWeight: "600",
    lineHeight: "1.35",
  },
  inputInvalid: {
    borderColor: "#ef4444",
    boxShadow: "0 0 0 2px rgba(239, 68, 68, 0.12)",
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
  twoFactorHint: {
    display: "flex",
    alignItems: "flex-start",
    gap: "8px",
    backgroundColor: "#eff6ff",
    border: "1px solid #bfdbfe",
    borderRadius: "8px",
    padding: "10px 12px",
    fontSize: "12px",
    color: "#1e3a8a",
    lineHeight: "1.4",
  },
  lockBanner: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    backgroundColor: "#fef2f2",
    border: "1px solid #fca5a5",
    borderRadius: "8px",
    padding: "10px 14px",
    color: "#991b1b",
    fontSize: "13px",
  },
  attemptsWarning: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    backgroundColor: "#fffbeb",
    border: "1px solid #fcd34d",
    borderRadius: "8px",
    padding: "9px 12px",
    color: "#92400e",
    fontSize: "12.5px",
    fontWeight: 600,
    lineHeight: "1.4",
  },
  keypadHint: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    color: "#64748b",
    fontSize: "11px",
    justifyContent: "center",
    marginTop: "2px",
  },
  autocompleteDropdown: {
    position: "absolute" as const,
    top: "100%",
    left: 0,
    right: 0,
    backgroundColor: "#ffffff",
    border: "1px solid #cbd5e1",
    borderRadius: "6px",
    marginTop: "4px",
    maxHeight: "200px",
    overflowY: "auto" as const,
    zIndex: 1000,
    boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
  },
};

export default Login;
