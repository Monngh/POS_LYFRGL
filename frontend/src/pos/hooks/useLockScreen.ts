import { useState, useEffect, useCallback } from "react";
import api from "../../shared/services/api";

interface UseLockScreenProps {
  user: { email: string; name: string } | null;
}

export function useLockScreen({ user }: UseLockScreenProps) {
  const [isLocked, setIsLocked] = useState(false);
  const [unlockError, setUnlockError] = useState("");
  const [unlockLoading, setUnlockLoading] = useState(false);

  const lock = useCallback(() => {
    setIsLocked(true);
    setUnlockError("");
  }, []);

  const unlock = useCallback(
    async (pinCode: string) => {
      if (!user?.email) {
        setUnlockError("Sesión de usuario no válida.");
        return;
      }

      setUnlockLoading(true);
      setUnlockError("");

      try {
        await api.post("/api/auth/cashier-login", {
          email: user.email,
          pinCode,
        });
        setIsLocked(false);
      } catch (err: any) {
        console.error("LockScreen unlock error:", err);
        const errMsg =
          err.response?.data?.message ||
          "PIN incorrecto o error al verificar.";
        setUnlockError(errMsg);
        throw new Error(errMsg);
      } finally {
        setUnlockLoading(false);
      }
    },
    [user]
  );

  // Keyboard shortcut listener for Ctrl+L
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl + L (ignore if already locked or user not logged in)
      if (e.ctrlKey && (e.key === "l" || e.key === "L")) {
        if (user && !isLocked) {
          e.preventDefault();
          lock();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [user, isLocked, lock]);

  return {
    isLocked,
    lock,
    unlock,
    unlockError,
    unlockLoading,
    setUnlockError,
  };
}
