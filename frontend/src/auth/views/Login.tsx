import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { ShieldCheck, UserCheck, Delete, KeyRound, AlertCircle, RefreshCw, Lock } from "lucide-react";
import api from "../../shared/services/api";
import {
  type FieldErrors,
  normalizeEmailInput,
  normalizeSpaces,
  validateEmail,
  validateInteger,
  validateSearchText,
} from "../../shared/utils/formValidation";

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
  const { loginAsAdmin, loginAsCashier, webAuthnFailed, setWebAuthnFailed, requestOtp, verifyOtp } = useAuth();

  const isMobile = useMediaQuery("(max-width: 860px)");
  const shortScreen = useMediaQuery("(max-height: 860px)");
  const isTouch = useMediaQuery("(pointer: coarse)");

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
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminFieldErrors, setAdminFieldErrors] = useState<FieldErrors<"email" | "password">>({});

  // Fallback OTP (se activa cuando WebAuthn falla)
  const [otpRequested, setOtpRequested] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpEmail, setOtpEmail] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);

  // Sesión única (admin): aviso de "sesión abierta" (informativo) y aviso de
  // "sesión desplazada" si te cerraron por iniciar en otro dispositivo.
  const [sessionConflict, setSessionConflict] = useState<{ message: string; since?: number; ip?: string | null } | null>(null);
  const [logoutReason, setLogoutReason] = useState<string | null>(null);

  // Detección de autocompletado del navegador en el formulario de admin: si el
  // correo y/o la contraseña fueron autollenados, se exige Windows Hello (2FA).
  const [emailAutofilled, setEmailAutofilled] = useState(false);
  const [passwordAutofilled, setPasswordAutofilled] = useState(false);
  // "Tecleado" pegajoso: si el usuario escribe/pega en correo o contraseña, el
  // ingreso se considera MANUAL definitivamente (Chrome re-dispara la animación
  // de autocompletado, así que esto debe ganar sobre esa señal).
  const [credentialsTyped, setCredentialsTyped] = useState(false);
  const markTyped = (e: React.KeyboardEvent) => {
    if (e.key.length === 1 || e.key === "Backspace" || e.key === "Delete") {
      setCredentialsTyped(true);
    }
  };

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
  const pinInputRef = useRef<HTMLInputElement>(null);

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
    password: adminPassword.length > 30
      ? "La contraseña no puede exceder los 30 caracteres."
      : normalizeSpaces(adminPassword) ? undefined : "La contrasena es obligatoria.",
  });

  const validateCashierForm = () => ({
    cashier:
      validateSearchText(cashierSearch, "La busqueda", { max: 80 }) ||
      (cashierEmail ? undefined : "Seleccione un cajero valido."),
    pin: validateInteger(pinCode, "El PIN", { min: 0, max: 9999 }) || (pinCode.length === 4 ? undefined : "El PIN debe tener 4 digitos."),
  });

  const setAdminField = (field: "email" | "password", value: string) => {
    const next = field === "email" ? normalizeEmailInput(value) : value.slice(0, 30);
    if (field === "email") setAdminEmail(next);
    if (field === "password") setAdminPassword(next);
    setAdminFieldErrors((prev) => ({
      ...prev,
      [field]: field === "email"
        ? validateEmail(next, { required: true })
        : next.length > 30
          ? "La contraseña no puede exceder los 30 caracteres."
          : normalizeSpaces(next) ? undefined : "La contrasena es obligatoria.",
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

  // Mantener el campo del PIN SIEMPRE listo en desktop: al entrar a caja rápida y
  // en cuanto se elige un cajero, el foco va al capturador oculto, de modo que se
  // puede teclear el NIP sin tener que hacer clic. (En táctil se usa el teclado en pantalla.)
  useEffect(() => {
    if (!isTouch && activeTab === "cashier" && !isLocked) {
      pinInputRef.current?.focus();
    }
  }, [isTouch, activeTab, cashierEmail, isLocked]);

  // Mostrar el aviso si la sesión se cerró por iniciar en otro dispositivo.
  useEffect(() => {
    const reason = sessionStorage.getItem("fmb_pos_logout_reason");
    if (reason) {
      setLogoutReason(reason);
      sessionStorage.removeItem("fmb_pos_logout_reason");
    }
  }, []);

  // Escuchar teclado físico para el ingreso del PIN de cajero
  useEffect(() => {
    if (activeTab !== "cashier") return;
    if (isTouch) return; // dispositivos táctiles usan el PIN pad visual

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
  }, [activeTab, pinCode, cashierEmail, isLocked, isTouch]);

  const handleRequestOtp = async () => {
    setOtpLoading(true);
    setError(null);
    try {
      const data = await requestOtp();
      setOtpEmail(data.email);
      setOtpRequested(true);
    } catch (err: any) {
      setError(err.response?.data?.message || "Error al enviar el código. Intente de nuevo.");
    } finally {
      setOtpLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otpCode.length !== 6) {
      setError("Ingresa el código de 6 dígitos recibido en tu correo.");
      return;
    }
    setOtpLoading(true);
    setError(null);
    try {
      await verifyOtp(otpCode);
      // verifyOtp llama a persistSession internamente — si llega aquí, sesión iniciada
    } catch (err: any) {
      setError(err.response?.data?.message || "Código incorrecto o expirado.");
      setOtpCode("");
    } finally {
      setOtpLoading(false);
    }
  };

  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSessionConflict(null);
    setLogoutReason(null);
    setOtpRequested(false);
    setOtpCode("");

    const errors = validateAdminForm();
    setAdminFieldErrors(errors);
    if (hasErrors(errors)) return;

    setLoading(true);
    try {
      // Windows Hello (2FA) solo si el navegador autocompletó las credenciales y
      // el usuario NO tecleó nada. Cualquier tecleo/pegado las marca como manual.
      const autofilled = (emailAutofilled || passwordAutofilled) && !credentialsTyped;
      await loginAsAdmin(normalizeEmailInput(adminEmail), adminPassword, autofilled);
    } catch (err: any) {
      const info = (err && err.info) || {};
      if (info.code === "SESION_ABIERTA") {
        setSessionConflict({
          message: err.message || "Ya hay una sesión activa con este usuario.",
          since: info.session?.since,
          ip: info.session?.ip ?? null,
        });
      } else {
        setError(err.message || "Credenciales inválidas.");
      }
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
      if (!isTouch) pinInputRef.current?.focus(); // dejar el PIN listo para reintentar
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
            setWebAuthnFailed(false);
            setOtpRequested(false);
            setOtpCode("");
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

      {/* Aviso: tu sesión se cerró por iniciar en otro dispositivo */}
      {logoutReason && (
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, padding: "12px 14px", marginBottom: 14 }}>
          <ShieldCheck size={18} color="#1e3a8a" style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 13, color: "#1e3a8a", fontWeight: 600 }}>{logoutReason}</span>
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
              placeholder="correo@ejemplo.com"
              value={adminEmail}
              onChange={(e) => setAdminField("email", e.target.value)}
              onKeyDown={markTyped}
              onPaste={() => setCredentialsTyped(true)}
              onAnimationStart={(e) => { if (e.animationName === "fmbAutofill") setEmailAutofilled(true); }}
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
              onKeyDown={markTyped}
              onPaste={() => setCredentialsTyped(true)}
              onAnimationStart={(e) => { if (e.animationName === "fmbAutofill") setPasswordAutofilled(true); }}
              onBlur={() => setAdminFieldErrors((prev) => ({ ...prev, password: normalizeSpaces(adminPassword) ? undefined : "La contrasena es obligatoria." }))}
              style={adminFieldErrors.password ? styles.inputInvalid : undefined}
            />
            {adminFieldErrors.password && <p style={styles.fieldError}>{adminFieldErrors.password}</p>}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary active-tap"
            style={styles.submitBtn}
          >
            {loading ? "Verificando..." : "ACEPTAR ➜"}
          </button>

          {/* Aviso de sesión única: ya hay una sesión activa con este correo */}
          {sessionConflict && (
            <div style={{ marginTop: 16, background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "12px 14px" }}>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <AlertCircle size={18} color="#b45309" style={{ flexShrink: 0, marginTop: 1 }} />
                <div style={{ fontSize: 13, color: "#92400e", lineHeight: 1.4 }}>
                  <strong>Sesión ya abierta.</strong> {sessionConflict.message}
                  {sessionConflict.since && (
                    <div style={{ marginTop: 4, fontSize: 12, color: "#a16207" }}>
                      Activa desde {new Date(sessionConflict.since).toLocaleString("es-MX")}
                      {sessionConflict.ip ? ` · IP ${sessionConflict.ip}` : ""}
                    </div>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
                <button
                  type="button"
                  onClick={() => setSessionConflict(null)}
                  style={{ background: "#ffffff", color: "#374151", border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                >
                  Entendido
                </button>
              </div>
            </div>
          )}

          {/* ── Fallback OTP: aparece solo cuando WebAuthn falla ── */}
          {webAuthnFailed && !otpRequested && (
            <div style={{ marginTop: "16px", textAlign: "center" }}>
              <p style={{ color: "#6b7280", fontSize: "13px", marginBottom: "10px" }}>
                ¿No tienes acceso al dispositivo registrado?
              </p>
              <button
                type="button"
                onClick={handleRequestOtp}
                disabled={otpLoading}
                style={{
                  background: "none",
                  border: "1px solid #d1d5db",
                  borderRadius: "6px",
                  padding: "8px 16px",
                  cursor: otpLoading ? "not-allowed" : "pointer",
                  color: "#374151",
                  fontSize: "14px",
                  opacity: otpLoading ? 0.6 : 1,
                }}
              >
                {otpLoading ? "Enviando..." : "📧 Recibir código por correo"}
              </button>
            </div>
          )}

          {webAuthnFailed && otpRequested && (
            <div style={{ marginTop: "16px" }}>
              <p style={{ color: "#6b7280", fontSize: "13px", marginBottom: "10px", textAlign: "center" }}>
                Código enviado a <strong>{otpEmail}</strong>. Ingresa los 6 dígitos:
              </p>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                className="input-corporate"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                style={{ textAlign: "center", letterSpacing: "8px", fontSize: "22px", fontWeight: "700" }}
              />
              <button
                type="button"
                onClick={handleVerifyOtp}
                disabled={otpLoading || otpCode.length !== 6}
                className="btn-primary active-tap"
                style={{
                  ...styles.submitBtn,
                  marginTop: "8px",
                  opacity: otpCode.length === 6 && !otpLoading ? 1 : 0.5,
                  cursor: otpCode.length === 6 && !otpLoading ? "pointer" : "not-allowed",
                }}
              >
                {otpLoading ? "Verificando..." : "Verificar código"}
              </button>
              <p style={{ textAlign: "center", marginTop: "8px" }}>
                <button
                  type="button"
                  onClick={() => { setOtpRequested(false); setOtpCode(""); setError(null); }}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#6b7280",
                    fontSize: "12px",
                    cursor: "pointer",
                    textDecoration: "underline",
                  }}
                >
                  Reenviar código
                </button>
              </p>
            </div>
          )}
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

          {!isTouch && (
            <input
              ref={pinInputRef}
              type="tel"
              style={{ position: "fixed", opacity: 0, width: 0, height: 0, pointerEvents: "none" }}
              tabIndex={-1}
              readOnly
              aria-hidden="true"
            />
          )}

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

          {isTouch ? (
            <>
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
            </>
          ) : (
            <p style={{ textAlign: "center", fontSize: "13px", color: "var(--text-muted)", marginTop: "8px" }}>
              Use su teclado físico para ingresar el PIN
            </p>
          )}
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
