import { useState, useCallback } from "react";
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

  return {
    isLocked,
    lock,
    unlock,
    unlockError,
    unlockLoading,
    setUnlockError,
  };
}
