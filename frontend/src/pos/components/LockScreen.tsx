import { useState, useEffect, useRef } from "react";
import { Lock } from "lucide-react";

interface LockScreenProps {
  user: { email: string; name: string } | null;
  unlock: (pinCode: string) => Promise<void>;
  unlockError: string;
  setUnlockError: (err: string) => void;
  unlockLoading: boolean;
}

export function LockScreen({
  user,
  unlock,
  unlockError,
  setUnlockError,
  unlockLoading,
}: LockScreenProps) {
  const [pinCode, setPinCode] = useState("");
  const hiddenInputRef = useRef<HTMLInputElement>(null);

  const handleKeyPress = (num: string) => {
    if (pinCode.length < 4 && !unlockLoading) {
      setPinCode((prev) => prev + num);
      setUnlockError("");
    }
  };

  const handleBackspace = () => {
    if (pinCode.length > 0 && !unlockLoading) {
      setPinCode((prev) => prev.slice(0, -1));
      setUnlockError("");
    }
  };

  const handleClear = () => {
    if (!unlockLoading) {
      setPinCode("");
      setUnlockError("");
    }
  };

  const handleSubmit = async () => {
    if (pinCode.length === 4 && !unlockLoading) {
      try {
        await unlock(pinCode);
      } catch {
        setPinCode("");
        hiddenInputRef.current?.focus();
      }
    }
  };

  // Trigger unlock when pinCode reaches 4 digits automatically
  useEffect(() => {
    if (pinCode.length === 4) {
      handleSubmit();
    }
  }, [pinCode]);

  // Handle physical keyboard input
  useEffect(() => {
    const handlePhysicalKeyDown = (e: KeyboardEvent) => {
      if (unlockLoading) return;

      if (/^\d$/.test(e.key)) {
        e.preventDefault();
        handleKeyPress(e.key);
      } else if (e.key === "Backspace") {
        e.preventDefault();
        handleBackspace();
      } else if (e.key === "Delete" || e.key === "Escape") {
        e.preventDefault();
        handleClear();
      } else if (e.key === "Enter") {
        e.preventDefault();
        handleSubmit();
      }
    };

    window.addEventListener("keydown", handlePhysicalKeyDown);
    hiddenInputRef.current?.focus();

    return () => {
      window.removeEventListener("keydown", handlePhysicalKeyDown);
    };
  }, [pinCode, unlockLoading, unlock]);

  const dots = Array.from({ length: 4 });

  return (
    <div
      className="pos-lock-overlay"
      onClick={() => hiddenInputRef.current?.focus()}
    >
      {/* Input oculto — captura el teclado físico sin mostrarse */}
      <input
        ref={hiddenInputRef}
        type="password"
        inputMode="none"
        pattern="\d*"
        maxLength={4}
        value={pinCode}
        onChange={(e) => {
          const val = e.target.value.replace(/\D/g, "");
          if (val.length <= 4) {
            setPinCode(val);
            setUnlockError("");
          }
        }}
        style={{
          position: "absolute",
          opacity: 0,
          pointerEvents: "none",
          width: 0,
          height: 0,
        }}
        disabled={unlockLoading}
      />

      <div className="pos-lock-card" onClick={(e) => e.stopPropagation()}>

        {/* Icono */}
        <div className="pos-lock-icon-container">
          <Lock size={32} className="pos-lock-icon" />
        </div>

        {/* Títulos */}
        <h2 className="pos-lock-title">Pantalla bloqueada</h2>
        <p className="pos-lock-subtitle">Ingresa tu PIN para continuar</p>

        {/* Badge del usuario */}
        <div className="pos-lock-user-badge">
          <div className="pos-lock-user-avatar">
            {user?.name ? user.name.slice(0, 2).toUpperCase() : "CA"}
          </div>
          <div className="pos-lock-user-info">
            <span className="pos-lock-user-name">{user?.name}</span>
            <span className="pos-lock-user-role">Cajero</span>
          </div>
        </div>

        {/* Puntos PIN */}
        <div className="pos-lock-dots-display">
          {dots.map((_, i) => (
            <div
              key={i}
              className={`pos-lock-dot ${i < pinCode.length ? "filled" : ""}`}
            />
          ))}
        </div>

        {/* Error de desbloqueo */}
        {unlockError && (
          <div className="pos-lock-error-alert">{unlockError}</div>
        )}

        {/* Instrucción de teclado */}
        <p className="pos-lock-keyboard-tip">
          {unlockLoading
            ? "Verificando PIN..."
            : "Usa el teclado numérico físico para ingresar tu PIN"}
        </p>

      </div>
    </div>
  );
}
