import { useState, useEffect } from "react";
import api from "../../shared/services/api";

interface RevokedSessionData {
  reason: string | null;
  revokedAt: string | null;
}

// Distinto de "forcedCloseAcknowledged" (localStorage, usado por el cajero): el JWT
// del admin vive en sessionStorage, así que su bandera de "ya vio el aviso" también
// debe vivir ahí — se limpia sola al cerrar la pestaña/sesión del navegador.
const ADMIN_SESSION_ACK_KEY = "fmb_pos_admin_session_ack";

/**
 * Polling de 5s (mismo patrón que useCashSession.ts) contra
 * GET /api/admin/security/my-session-status, para mostrarle al admin/gerente
 * revocado un modal con el motivo de forma casi instantánea, sin esperar a su
 * siguiente clic (donde de todas formas authenticateJWT ya rechazaría el request
 * con 401 SESION_DESPLAZADA). Ambos mecanismos son independientes: si el polling
 * fallara o llegara tarde, el 401 sigue expulsando al usuario en su próxima
 * petición; si el 401 no llegara a tiempo (usuario inactivo), el polling lo
 * detecta de todas formas.
 */
export function useAdminSessionStatus(user: { role: string } | null | undefined) {
  const [revokedData, setRevokedData] = useState<RevokedSessionData | null>(null);

  useEffect(() => {
    if (!user || (user.role !== "ADMIN" && user.role !== "GERENTE")) return;

    const check = async () => {
      try {
        const res = await api.get("/api/admin/security/my-session-status");
        const alreadyAcknowledged = sessionStorage.getItem(ADMIN_SESSION_ACK_KEY) === "true";
        if (res.data.revoked && !alreadyAcknowledged) {
          setRevokedData({ reason: res.data.reason, revokedAt: res.data.revokedAt });
        }
      } catch {
        // silencioso — errores de polling no deben interrumpir el panel admin
      }
    };

    check();
    const interval = setInterval(check, 5000);
    return () => clearInterval(interval);
  }, [user]);

  const acknowledgeRevocation = () => {
    setRevokedData(null);
    sessionStorage.setItem(ADMIN_SESSION_ACK_KEY, "true");
  };

  return { revokedData, acknowledgeRevocation };
}
