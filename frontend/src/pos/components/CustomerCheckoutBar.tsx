import React, { useState, useEffect, useRef } from "react";
import { Eye, EyeOff } from "lucide-react";
import { usePosCustomer } from "../hooks/usePosCustomer";
import { usePosCart } from "../hooks/usePosCart";

const maskPhoneLast2 = (phone: string): string => {
  const clean = phone.replace(/\D/g, "");
  if (clean.length === 0) return "";
  if (clean.length === 10) {
    return "•".repeat(8) + clean.slice(-2);
  }
  if (clean.length === 1) {
    return clean;
  }
  return "•".repeat(clean.length - 1) + clean.slice(-1);
};

const maskCustomerName = (name: string): string => {
  if (!name) return "";
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 1) return parts[0];
  const firstWord = parts[0];
  const restLength = name.length - firstWord.length;
  const dots = "•".repeat(Math.min(8, restLength > 0 ? restLength : 5));
  return `${firstWord} ${dots}`;
};

const getNextRealPhone = (newValue: string, prevReal: string): string => {
  if (!newValue) return "";
  if (!newValue.includes("•")) {
    return newValue.replace(/\D/g, "").slice(0, 10);
  }
  const prevMask = maskPhoneLast2(prevReal);
  const prevBulletCount = (prevMask.match(/•/g) || []).length;
  const prefix = prevReal.slice(0, prevBulletCount);
  const suffix = newValue.slice(prevBulletCount).replace(/\D/g, "");
  return (prefix + suffix).slice(0, 10);
};

const isInvalidPhonePattern = (digits: string): boolean => {
  if (digits.length !== 10) return true;
  if (/^(.)\1+$/.test(digits)) return true;
  if (digits === "1234567890") return true;
  return false;
};

const styles: { [key: string]: React.CSSProperties } = {
  fieldError: { color: "#b91c1c", fontSize: "12px", fontWeight: "600", marginTop: "5px", marginBottom: 0 },
};

interface CustomerCheckoutBarProps {
  customerData: ReturnType<typeof usePosCustomer>;
  cartData: ReturnType<typeof usePosCart>;
  onToast: (msg: string, type?: "error" | "success" | "info" | "warning") => void;
}

export function CustomerCheckoutBar({ customerData, cartData, onToast }: CustomerCheckoutBarProps) {
  const {
    selectedCustomer, setSelectedCustomer,
    handleSearchCustomerByPhone,
    handleRegisterMinimalCustomer,
  } = customerData;

  const { setUsePoints, setPointsToRedeem, setInvoiceRequested } = cartData;

  const phoneInputRef = useRef<HTMLInputElement | null>(null);
  const confirmInputRef = useRef<HTMLInputElement | null>(null);

  const [localPhone, setLocalPhone] = useState("");
  const [localShowPhone, setLocalShowPhone] = useState(false);
  const [searchStatus, setSearchStatus] = useState<"idle" | "searching" | "found" | "not_found">("idle");
  const [localError, setLocalError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmInput, setConfirmInput] = useState("");
  const [confirmError, setConfirmError] = useState("");
  const [confirmShowPhone, setConfirmShowPhone] = useState(false);

  useEffect(() => {
    if (!confirmOpen) return;
    const timer = window.setTimeout(() => confirmInputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [confirmOpen]);

  // Silent search on 10 digits
  useEffect(() => {
    const clean = localPhone.replace(/\D/g, "");
    if (clean.length === 10) {
      if (isInvalidPhonePattern(clean)) {
        setLocalError("Número de teléfono inválido.");
        setSearchStatus("idle");
        return;
      }
      setLocalError("");
      
      const doSilentSearch = async () => {
        setSearchStatus("searching");
        try {
          const { found } = await handleSearchCustomerByPhone(clean);
          if (found) {
            setSearchStatus("found");
            setLocalPhone("");
          } else {
            setSearchStatus("not_found");
          }
        } catch (err) {
          console.error("Error al buscar cliente silenciosamente:", err);
          setSearchStatus("idle");
          setLocalError("Error al buscar el cliente.");
        }
      };
      
      doSilentSearch();
    } else {
      setSearchStatus("idle");
      setLocalError("");
    }
  }, [localPhone, handleSearchCustomerByPhone]);

  if (!selectedCustomer) {
    return (
      <div style={{ width: "100%" }}>
        <div className="pos-customer-bar-phone-wrap" style={{ position: "relative", width: "100%" }}>
          <input
            type="text"
            ref={phoneInputRef}
            className="input-corporate pos-customer-phone-input"
            placeholder="Teléfono cliente"
            data-shortcut-letter="A"
            title="Buscar cliente (Alt+A)"
            value={localShowPhone ? localPhone : maskPhoneLast2(localPhone)}
            onChange={(e) => {
              const next = getNextRealPhone(e.target.value, localPhone);
              setLocalPhone(next);
              if (localShowPhone) setLocalShowPhone(false);
            }}
          />
          <span className="pos-fkey-badge" style={{ position: "absolute", right: "32px", top: "50%", transform: "translateY(-50%)", fontSize: "10px", padding: "2px 6px", pointerEvents: "none", whiteSpace: "nowrap" }}>Alt+A</span>
          <button
            type="button"
            onClick={() => setLocalShowPhone(!localShowPhone)}
            className="pos-customer-eye-btn"
            tabIndex={-1}
          >
            {localShowPhone ? <EyeOff size={15} color="#64748b" /> : <Eye size={15} color="#64748b" />}
          </button>
        </div>

        {/* Estados de búsqueda */}
        {localError && <p className="pos-customer-bar-error">{localError}</p>}
        {searchStatus === "searching" && (
          <p className="pos-customer-bar-searching">Buscando...</p>
        )}
        {searchStatus === "not_found" && (
          <div className="pos-customer-bar-not-found">
            <span>⚠️ No registrado</span>
            <button
              type="button"
              onClick={() => { setConfirmInput(""); setConfirmError(""); setConfirmOpen(true); }}
              className="pos-customer-bar-register-btn"
              data-shortcut-letter="R"
              title="Registrar cliente (Alt+R)"
            >
              + Registrar
            </button>
          </div>
        )}

        {confirmOpen && (
          <div className="pos-modal-overlay">
            <div className="pos-modal pos-customer-register-modal">
              <h3 style={{ marginTop: 0, marginBottom: "8px", fontSize: "16px", fontWeight: "700" }}>Registrar Cliente</h3>
              <p style={{ margin: "0 0 16px 0", fontSize: "13px", color: "var(--pos-text-2)" }}>
                No se encontró a nadie con el teléfono <b>{localPhone}</b>.
                Ingresa su nombre para registrarlo rápidamente y darle puntos en esta compra.
              </p>
              
              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "600", marginBottom: "6px" }}>
                  Nombre del cliente:
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    type="text"
                    ref={confirmInputRef}
                    className="input-corporate"
                    placeholder="Ej. Juan Pérez"
                    value={confirmInput}
                    onChange={(e) => setConfirmInput(e.target.value)}
                    style={{ width: "100%", paddingRight: "36px" }}
                  />
                  <span className="pos-fkey-badge" style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", fontSize: "10px", padding: "2px 6px", pointerEvents: "none", whiteSpace: "nowrap" }}>Enter</span>
                </div>
                {confirmError && <p style={styles.fieldError}>{confirmError}</p>}
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
                <button
                  type="button"
                  className="btn-corporate-outline"
                  onClick={() => { setConfirmOpen(false); setConfirmInput(""); setConfirmError(""); }}
                >
                  Cancelar (Esc)
                </button>
                <button
                  type="button"
                  className="btn-corporate-primary"
                  onClick={async () => {
                    const cPhone = localPhone.replace(/\D/g, "");
                    const cName = confirmInput.trim();
                    if (!cName) {
                      setConfirmError("El nombre es obligatorio");
                      return;
                    }
                    try {
                      const { found, error } = await handleRegisterMinimalCustomer(cPhone, cName);
                      if (found) {
                        setConfirmOpen(false);
                        setLocalPhone("");
                        onToast("Cliente registrado y seleccionado.", "success");
                      } else {
                        setConfirmError(error || "Error al registrar");
                      }
                    } catch (err) {
                      setConfirmError("Error de red");
                    }
                  }}
                >
                  Guardar y Seleccionar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="pos-customer-bar" style={{ marginTop: "0", marginBottom: "0", padding: "0 8px", border: "none", backgroundColor: "transparent" }}>
      <div className="pos-customer-bar-found" style={{ height: "28px", gap: "8px" }}>
        <div className="pos-customer-bar-avatar" style={{ width: "24px", height: "24px", fontSize: "10px" }}>
          {(selectedCustomer.name || "C").charAt(0).toUpperCase()}
        </div>
        <div className="pos-customer-bar-info" style={{ flex: "0 1 auto", marginRight: "8px" }}>
          <span className="pos-customer-bar-name" style={{ fontSize: "11px", lineHeight: "1.2" }}>
            {selectedCustomer.isNew
              ? "Registrado para puntos"
              : maskCustomerName(selectedCustomer.name || "Cliente")}
          </span>
          <span className="pos-customer-bar-phone" style={{ fontSize: "9px", lineHeight: "1" }}>
            Tel: {maskPhoneLast2(selectedCustomer.phone)}
          </span>
        </div>
        <span className="pos-customer-bar-points" style={{ fontSize: "10px", padding: "2px 4px", marginRight: "auto" }}>
          ⭐ {selectedCustomer.points} pts
        </span>
        <button
          type="button"
          className="pos-customer-bar-remove"
          style={{ display: "flex", alignItems: "center", gap: "6px", padding: "2px 6px" }}
          onClick={() => {
            setSelectedCustomer(null);
            setUsePoints(false);
            setPointsToRedeem(0);
            setInvoiceRequested(false);
            setLocalPhone("");
            onToast("Cliente removido del carrito. Venta Anónima.", "info");
          }}
          title="Quitar cliente (Alt+A)"
          data-shortcut-letter="A"
        >
          <span className="pos-fkey-badge" style={{ fontSize: "9px", padding: "2px 4px", whiteSpace: "nowrap", position: "static" }}>Alt+A</span>
          <span style={{ fontSize: "12px" }}>❌</span>
        </button>
      </div>
    </div>
  );
}
