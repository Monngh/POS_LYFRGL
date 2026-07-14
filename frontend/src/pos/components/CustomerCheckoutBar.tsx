import React, { useState, useEffect, useRef } from "react";
import { Eye, EyeOff, UserPlus } from "lucide-react";
import { usePosCustomer } from "../hooks/usePosCustomer";
import { usePosCart } from "../hooks/usePosCart";
import { PosModal } from "./modals/shared/PosModal";

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
  modalBtn: {
    flex: 1,
    border: "none",
    padding: "12px",
    borderRadius: "6px",
    fontWeight: "700",
    fontSize: "12px",
    cursor: "pointer",
    transition: "all 0.15s ease",
    textTransform: "uppercase" as const,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
  },
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
  const lastSearchedPhoneRef = useRef("");
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const verifyPhoneInputRef = useRef<HTMLInputElement | null>(null);

  const [localPhone, setLocalPhone] = useState("");
  const [localShowPhone, setLocalShowPhone] = useState(false);
  const [searchStatus, setSearchStatus] = useState<"idle" | "searching" | "found" | "not_found">("idle");
  const [localError, setLocalError] = useState("");
  const [registerModalOpen, setRegisterModalOpen] = useState(false);
  const [confirmInput, setConfirmInput] = useState("");
  const [confirmPhone, setConfirmPhone] = useState("");
  const [confirmPhoneShow, setConfirmPhoneShow] = useState(false);
  const [confirmError, setConfirmError] = useState("");
  const [registerLoading, setRegisterLoading] = useState(false);

  // Búsqueda silenciosa al completar 10 dígitos
  useEffect(() => {
    const clean = localPhone.replace(/\D/g, "");
    if (clean.length === 10) {
      // Si ya buscamos este número y no se encontró, no repetir
      if (clean === lastSearchedPhoneRef.current) return;

      if (isInvalidPhonePattern(clean)) {
        setLocalError("Número de teléfono inválido.");
        setSearchStatus("idle");
        return;
      }
      setLocalError("");

      const doSilentSearch = async () => {
        setSearchStatus("searching");
        lastSearchedPhoneRef.current = clean;
        try {
          const { found } = await handleSearchCustomerByPhone(clean);
          if (found) {
            setSearchStatus("found");
            setLocalPhone("");
            lastSearchedPhoneRef.current = "";
          } else {
            setSearchStatus("not_found");
          }
        } catch (err) {
          console.error("Error al buscar cliente silenciosamente:", err);
          setSearchStatus("idle");
          setLocalError("Error al buscar el cliente.");
          lastSearchedPhoneRef.current = "";
        }
      };

      doSilentSearch();
    } else {
      if (searchStatus !== "idle") setSearchStatus("idle");
      setLocalError("");
      lastSearchedPhoneRef.current = "";
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localPhone, handleSearchCustomerByPhone]);

  const openRegisterModal = () => {
    setConfirmInput("");
    setConfirmPhone("");
    setConfirmPhoneShow(false);
    setConfirmError("");
    setRegisterModalOpen(true);
  };

  const closeRegisterModal = () => {
    setRegisterModalOpen(false);
    setConfirmInput("");
    setConfirmPhone("");
    setConfirmPhoneShow(false);
    setConfirmError("");
  };

  const handleRegisterSubmit = async () => {
    const cPhone = localPhone.replace(/\D/g, "");
    const cName = confirmInput.trim();
    if (!cName) {
      setConfirmError("El nombre es obligatorio.");
      setTimeout(() => nameInputRef.current?.focus(), 0);
      return;
    }
    const vPhone = confirmPhone.replace(/\D/g, "");
    if (!vPhone) {
      setConfirmError("La verificación del teléfono es obligatoria.");
      setTimeout(() => verifyPhoneInputRef.current?.focus(), 0);
      return;
    }
    if (vPhone !== cPhone) {
      setConfirmError("El teléfono de verificación no coincide con el ingresado anteriormente.");
      setTimeout(() => verifyPhoneInputRef.current?.focus(), 0);
      return;
    }
    setRegisterLoading(true);
    try {
      const res = await handleRegisterMinimalCustomer(cPhone, cName);
      if (res.success && res.customer) {
        closeRegisterModal();
        setLocalPhone("");
        lastSearchedPhoneRef.current = "";
        setSearchStatus("idle");
        onToast("Cliente registrado y seleccionado.", "success");
      } else {
        setConfirmError((res as any).error || "Error al registrar.");
      }
    } catch {
      setConfirmError("Error de red.");
    } finally {
      setRegisterLoading(false);
    }
  };

  /* ─── Sin cliente seleccionado ─── */
  if (!selectedCustomer) {
    return (
      <>
        <div style={{ width: "100%" }}>
          {/* Input de teléfono */}
          <div className="pos-customer-bar-phone-wrap" style={{ position: "relative", width: "100%" }}>
            <input
              type="text"
              ref={phoneInputRef}
              className="input-corporate pos-customer-phone-input"
              placeholder="Teléfono cliente"
              data-shortcut-key="F6"
              title="Buscar cliente (F6)"
              value={localShowPhone ? localPhone : maskPhoneLast2(localPhone)}
              onChange={(e) => {
                const next = getNextRealPhone(e.target.value, localPhone);
                setLocalPhone(next);
                if (localShowPhone) setLocalShowPhone(false);
              }}
            />
            <span
              className="pos-fkey-badge"
              style={{ position: "absolute", right: "32px", top: "50%", transform: "translateY(-50%)", fontSize: "10px", padding: "2px 6px", pointerEvents: "none", whiteSpace: "nowrap" }}
            >
              F6
            </span>
            <button
              type="button"
              onClick={() => setLocalShowPhone(!localShowPhone)}
              className="pos-customer-eye-btn"
              tabIndex={-1}
              data-shortcut-letter="T"
              title="Mostrar/Ocultar teléfono (Alt+T)"
            >
              {localShowPhone ? <EyeOff size={15} color="#64748b" /> : <Eye size={15} color="#64748b" />}
            </button>
          </div>

          {/* Error de validación */}
          {localError && <p className="pos-customer-bar-error">{localError}</p>}

          {/* Buscando... */}
          {searchStatus === "searching" && (
            <p className="pos-customer-bar-searching">Buscando...</p>
          )}

          {/* Banner "No registrado" + botón Registrar — inline, siempre visible */}
          {searchStatus === "not_found" && (
            <div
              style={{
                marginTop: "6px",
                backgroundColor: "#fff7ed",
                border: "1px solid #fb923c",
                borderRadius: "8px",
                padding: "8px 12px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "8px",
              }}
            >
              <span style={{ fontSize: "12px", color: "#92400e", fontWeight: "600" }}>
                ⚠️ Teléfono no registrado
              </span>
              <button
                type="button"
                onClick={openRegisterModal}
                className="pos-customer-bar-register-btn"
                data-shortcut-letter="R"
                title="Registrar cliente (Alt+R)"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "4px 10px",
                  fontSize: "12px",
                  fontWeight: "700",
                  backgroundColor: "#ea580c",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "6px",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                <UserPlus size={13} />
                Registrar
              </button>
            </div>
          )}
        </div>

        {/* Modal de registro — usa PosModal estándar */}
        <PosModal
          isOpen={registerModalOpen}
          onClose={closeRegisterModal}
          title="Registrar Cliente"
          subtitle="No se encontró el teléfono. Ingresa los datos solicitados para registrar al cliente."
          icon={<UserPlus size={22} />}
          iconColor="#ea580c"
          size="md"
          footer={
            <>
              <button
                type="button"
                data-shortcut="cancel"
                onClick={closeRegisterModal}
                style={{ ...styles.modalBtn, backgroundColor: "var(--color-danger)", color: "white" }}
              >
                Cancelar
              </button>
              <button
                type="button"
                data-shortcut="confirm"
                onClick={handleRegisterSubmit}
                disabled={registerLoading}
                style={{ ...styles.modalBtn, backgroundColor: "var(--color-success)", color: "white", position: "relative" }}
              >
                {registerLoading ? "Guardando..." : "Guardar y Seleccionar"}
                {!registerLoading && (
                  <span
                    className="pos-fkey-badge"
                    style={{ fontSize: "9px", padding: "1px 5px", backgroundColor: "rgba(255,255,255,0.25)", color: "white", borderRadius: "3px", fontWeight: "800", lineHeight: 1, pointerEvents: "none" }}
                  >
                    Enter
                  </span>
                )}
              </button>
            </>
          }
        >
          <div style={{ paddingTop: "8px", display: "flex", flexDirection: "column", gap: "16px" }}>
            <div>
              <label style={{ display: "block", fontSize: "13px", fontWeight: "600", marginBottom: "8px", color: "var(--text)" }}>
                Nombre del cliente:
              </label>
              <div style={{ position: "relative" }}>
                <input
                  ref={nameInputRef}
                  type="text"
                  className="input-corporate"
                  placeholder="Ej. Juan Pérez"
                  value={confirmInput}
                  onChange={(e) => setConfirmInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); if (confirmInput.trim()) verifyPhoneInputRef.current?.focus(); }
                    if (e.key === "Escape") { e.preventDefault(); closeRegisterModal(); }
                  }}
                  style={{ width: "100%", boxSizing: "border-box" }}
                  autoFocus
                />
              </div>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "13px", fontWeight: "600", marginBottom: "8px", color: "var(--text)" }}>
                Verificar número de teléfono:
              </label>
              <div style={{ position: "relative" }}>
                <input
                  ref={verifyPhoneInputRef}
                  type="text"
                  className="input-corporate"
                  placeholder="Ej. 5512345678"
                  value={confirmPhoneShow ? confirmPhone : maskPhoneLast2(confirmPhone)}
                  onChange={(e) => {
                    const next = getNextRealPhone(e.target.value, confirmPhone);
                    setConfirmPhone(next);
                    if (confirmPhoneShow) setConfirmPhoneShow(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); if (confirmPhone.replace(/\D/g, "").length === 10) handleRegisterSubmit(); }
                    if (e.key === "Escape") { e.preventDefault(); closeRegisterModal(); }
                  }}
                  style={{ width: "100%", paddingRight: "60px", boxSizing: "border-box" }}
                />
                <button
                  type="button"
                  onClick={() => setConfirmPhoneShow(!confirmPhoneShow)}
                  className="pos-customer-eye-btn"
                  tabIndex={-1}
                  data-shortcut-letter="T"
                  title="Mostrar/Ocultar teléfono (Alt+T)"
                  style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)" }}
                >
                  {confirmPhoneShow ? <EyeOff size={15} color="#64748b" /> : <Eye size={15} color="#64748b" />}
                </button>
              </div>
            </div>

            {confirmError && <p style={styles.fieldError}>{confirmError}</p>}
          </div>
        </PosModal>
      </>
    );
  }

  /* ─── Con cliente seleccionado ─── */
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
          title="Quitar cliente (F6)"
          data-shortcut-key="F6"
        >
          <span className="pos-fkey-badge" style={{ fontSize: "9px", padding: "2px 4px", whiteSpace: "nowrap", position: "static" }}>F6</span>
          <span style={{ fontSize: "12px" }}>❌</span>
        </button>
      </div>
    </div>
  );
}
