import { useState, useEffect, useMemo, useRef } from "react";
import { Lock, Delete } from "lucide-react";

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

  // Shuffle digits on mount
  const shuffledDigits = useMemo(() => {
    const arr = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }, []);

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
      } catch (err) {
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
    // Auto-focus physical input reference for focus retention on desktop
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
      {/* Hidden text input to trigger focus/keyboard easily on mobile/desktop */}
      <input
        ref={hiddenInputRef}
        type="password"
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
        <div className="pos-lock-header">
          <div className="pos-lock-icon-container">
            <Lock size={32} className="pos-lock-icon" />
          </div>
          <h2 className="pos-lock-title">PANTALLA BLOQUEADA</h2>
          <p className="pos-lock-subtitle">Ingresa tu PIN para continuar</p>
        </div>

        {/* User Card */}
        <div className="pos-lock-user-badge">
          <div className="pos-lock-user-avatar">
            {user?.name ? user.name.slice(0, 2).toUpperCase() : "CA"}
          </div>
          <div className="pos-lock-user-info">
            <span className="pos-lock-user-name">{user?.name}</span>
            <span className="pos-lock-user-role">Cajero</span>
          </div>
        </div>

        {/* PIN Dots Display */}
        <div className="pos-lock-dots-display">
          {dots.map((_, i) => (
            <div
              key={i}
              className={`pos-lock-dot ${i < pinCode.length ? "filled" : ""}`}
            />
          ))}
        </div>

        {/* Unlock Error alert */}
        {unlockError && <div className="pos-lock-error-alert">{unlockError}</div>}

        {/* Shuffled keypad */}
        <div className="pos-lock-keypad">
          {shuffledDigits.slice(0, 9).map((num) => (
            <button
              key={num}
              type="button"
              className="pos-keypad-btn"
              onClick={() => handleKeyPress(num)}
              disabled={unlockLoading}
            >
              {num}
            </button>
          ))}

          {/* Action Row */}
          <button
            type="button"
            className="pos-keypad-btn action"
            onClick={handleClear}
            disabled={unlockLoading}
          >
            C
          </button>
          <button
            type="button"
            className="pos-keypad-btn"
            onClick={() => handleKeyPress(shuffledDigits[9])}
            disabled={unlockLoading}
          >
            {shuffledDigits[9]}
          </button>
          <button
            type="button"
            className="pos-keypad-btn action"
            onClick={handleBackspace}
            disabled={unlockLoading}
            aria-label="Borrar"
          >
            <Delete size={18} />
          </button>
        </div>

        {/* Physical Keyboard Tip */}
        <p className="pos-lock-keyboard-tip">
          {unlockLoading
            ? "Desbloqueando..."
            : "Puedes utilizar tu teclado físico numérico"}
        </p>
      </div>
    </div>
  );
}
