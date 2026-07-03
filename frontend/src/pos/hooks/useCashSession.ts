import { useState, useEffect } from "react";
import api from "../../shared/services/api";
import {
  validateDecimalField,
  roundToTwoDecimals,
} from "../../shared/utils/decimalInput";

interface CashSession {
  id: number;
  branchId: number;
  userId: number;
  openedAt: string;
  closedAt: string | null;
  initialAmount: number;
  expectedAmount: number;
  declaredAmount: number | null;
  difference: number | null;
  cashIn: number;
  cashOut: number;
  status: string;
}

interface Sale {
  id: number;
  invoiceNumber: string;
  createdAt: string;
  totalAmount: number;
  paymentMethod: string;
  cardType?: string;
  status: string;
  cajero: string;
  refundStatus?: string | null;
}

interface UseCashSessionProps {
  user: any;
  onToast: (msg: string, type?: "error" | "success" | "info") => void;
  onSetView: (view: "dashboard" | "apertura" | "sales-terminal") => void;
  onSetLoading: (loading: boolean) => void;
  onSetCajaLockedByOtherDevice: (locked: boolean) => void;
  onSetActiveModal: (modal: string | null) => void;
}

export function useCashSession({
  user,
  onToast,
  onSetView,
  onSetLoading,
  onSetCajaLockedByOtherDevice,
  onSetActiveModal,
}: UseCashSessionProps) {
  const [session, setSession] = useState<CashSession | null>(null);
  const [forcedCloseData, setForcedCloseData] = useState<{ reason: string; closedAt: string } | null>(null);
  const [sessionStats, setSessionStats] = useState<any>(null);
  const [lastClosedStats, setLastClosedStats] = useState<any>(null);
  const [recentSales, setRecentSales] = useState<Sale[]>([]);
  const [recentDeposits, setRecentDeposits] = useState<any[]>([]);
  const [initialFund, setInitialFund] = useState("500.00");
  const [initialFundError, setInitialFundError] = useState("");
  const [openingLoading, setOpeningLoading] = useState(false);
  const [partialCutLoading, setPartialCutLoading] = useState(false);
  const [partialCutData, setPartialCutData] = useState<any>(null);
  const [declaredCash, setDeclaredCash] = useState("");
  const [declaredCashError, setDeclaredCashError] = useState("");
  const [closingLoading, setClosingLoading] = useState(false);
  const [blockedByOtherTab, setBlockedByOtherTab] = useState(false);
  const [blockedSession, setBlockedSession] = useState<CashSession | null>(null);
  const [currentTabId] = useState<string>(() => {
    const KEY = "fmb_pos_tab_id";
    const existingTabId = sessionStorage.getItem(KEY);
    if (existingTabId) return existingTabId;
    const generatedTabId = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `tab-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(KEY, generatedTabId);
    return generatedTabId;
  });

  const CASH_SESSION_OWNER_KEY = "fmb_pos_cash_session_owner";

  const getSessionOwner = () => {
    const raw = localStorage.getItem(CASH_SESSION_OWNER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as { sessionId: number; tabId: string; claimedAt: string };
    } catch {
      return null;
    }
  };

  const claimSessionOwnership = (session: CashSession) => {
    localStorage.setItem(
      CASH_SESSION_OWNER_KEY,
      JSON.stringify({ sessionId: session.id, tabId: currentTabId, claimedAt: new Date().toISOString() })
    );
  };

  const isSessionOwnedByOtherTab = (session: CashSession) => {
    const owner = getSessionOwner();
    return owner ? owner.sessionId === session.id && owner.tabId !== currentTabId : false;
  };

  const isSessionOwnedByThisTab = (session: CashSession) => {
    const owner = getSessionOwner();
    return owner ? owner.sessionId === session.id && owner.tabId === currentTabId : false;
  };

  const loadDashboardData = async () => {
    try {
      const [resStats, resSales, resDeposits] = await Promise.all([
        api.get("/api/cash-session/stats"),
        api.get("/api/sales/my-recent"),
        api.get("/api/sales/deposits").catch(() => ({ data: { deposits: [] } })),
      ]);
      setSessionStats(resStats.data.stats);
      setRecentSales(resSales.data.sales);
      setRecentDeposits(resDeposits.data.deposits || []);
    } catch (err) {
      console.error("Error al cargar datos del Dashboard:", err);
    }
  };

  const checkSessionStatus = async () => {
    if (!user) return;

    if (user.role === "ADMIN" || user.role === "GERENTE") {
      onSetLoading(false);
      return;
    }

    try {
      const resStatus = await api.get("/api/cash-session/status");
      if (resStatus.data.isOpen) {
        if (resStatus.data.isOwnedByThisDevice === false) {
          setSession(null);
          setBlockedByOtherTab(false);
          setBlockedSession(null);
          onSetCajaLockedByOtherDevice(true);
          return;
        }
        onSetCajaLockedByOtherDevice(false);

        const sessionFromServer = resStatus.data.session;
        if (sessionFromServer) {
          if (isSessionOwnedByOtherTab(sessionFromServer)) {
            setSession(null);
            setBlockedByOtherTab(true);
            setBlockedSession(sessionFromServer);
            onSetView("apertura");
            return;
          }

          if (!isSessionOwnedByThisTab(sessionFromServer)) {
            claimSessionOwnership(sessionFromServer);
          }

          setBlockedByOtherTab(false);
          setBlockedSession(null);
          setSession(sessionFromServer);
          onSetView("dashboard");
          await loadDashboardData();
          return;
        }

        setSession(null);
        setBlockedByOtherTab(false);
        setBlockedSession(null);
        onSetView("apertura");
      } else {
        const alreadyAcknowledged = localStorage.getItem("forcedCloseAcknowledged") === "true";
        if (resStatus.data.lastClosed?.forceCloseReason && !alreadyAcknowledged) {
          setForcedCloseData({
            reason: resStatus.data.lastClosed.forceCloseReason,
            closedAt: resStatus.data.lastClosed.closedAt,
          });
        }
        onSetCajaLockedByOtherDevice(false);
        setSession(null);
        onSetView("apertura");
      }
    } catch (err) {
      console.error("Error al validar sesión de caja:", err);
    } finally {
      onSetLoading(false);
    }
  };

  const handleOpenCash = async (pinCode?: string) => {
    if (blockedByOtherTab) {
      onToast("Ya hay una sesión de caja abierta en otra pestaña. Selecciona 'Usar aquí' o cierra esta pantalla.");
      return;
    }

    localStorage.removeItem("forcedCloseAcknowledged");
    const initialFundValidation = validateDecimalField(initialFund, "El fondo inicial", {
      invalidMessage: "El fondo inicial debe ser un monto valido con maximo 3 decimales.",
    });
    if (!initialFundValidation.ok) {
      setInitialFundError(initialFundValidation.error);
      onToast(initialFundValidation.error);
      return;
    }
    setInitialFundError("");
    const initialFundValue = initialFundValidation.value;
    setOpeningLoading(true);
    try {
      if (initialFundValue.roundedMessage) {
        onToast(initialFundValue.roundedMessage, "info");
      }
      const res = await api.post("/api/cash-session/open", {
        initialAmount: initialFundValue.value,
        pinCode: pinCode,
      });
      if (res.data.session) {
        claimSessionOwnership(res.data.session);
      }
      setSession(res.data.session);
      onToast(res.data.message || "Caja abierta exitosamente.", "success");
      onSetView("sales-terminal");
      await loadDashboardData();
    } catch (err: any) {
      const code = err.response?.data?.code;
      if (code === "PIN_INVALIDO" || code === "PIN_REQUERIDO") {
        throw err; // AperturaView maneja estos errores directamente
      }
      onToast(err.response?.data?.message || "Error al abrir la caja registradora.");
    } finally {
      setOpeningLoading(false);
    }
  };

  const handleCloseShift = async (pinCode?: string) => {
    const declaredCashValidation = validateDecimalField(declaredCash, "El efectivo contado", {
      invalidMessage: "El efectivo contado debe ser un monto valido con maximo 3 decimales.",
    });
    if (!declaredCashValidation.ok) {
      setDeclaredCashError(declaredCashValidation.error);
      onToast(declaredCashValidation.error);
      return;
    }
    setDeclaredCashError("");
    const declaredCashValue = declaredCashValidation.value;
    setClosingLoading(true);
    try {
      if (declaredCashValue.roundedMessage) {
        onToast(declaredCashValue.roundedMessage, "info");
      }
      const res = await api.post("/api/cash-session/close", {
        declaredAmount: declaredCashValue.value,
        pinCode: pinCode,
      });
      onToast("Turno cerrado con éxito. Generando reporte de arqueo...", "success");
      setLastClosedStats(res.data.stats);
      setSession(null);
      onSetActiveModal("close-receipt");
      setDeclaredCash("");
      setDeclaredCashError("");
    } catch (err: any) {
      const code = err.response?.data?.code;
      if (code === "PIN_INVALIDO" || code === "PIN_REQUERIDO") {
        throw err; // CloseCashModal maneja estos errores directamente
      }
      onToast(err.response?.data?.message || "Error al cerrar turno.");
    } finally {
      setClosingLoading(false);
    }
  };

  const handleSavePartialCut = async () => {
    setPartialCutLoading(true);
    try {
      const res = await api.post("/api/cash-session/cut");
      setPartialCutData(res.data.cut);
      onSetActiveModal("partial-cut-receipt");
      await loadDashboardData();
    } catch (err: any) {
      onToast(err.response?.data?.message || "Error al registrar el corte de caja.");
    } finally {
      setPartialCutLoading(false);
    }
  };

  const calculatedDifference = sessionStats
    ? roundToTwoDecimals(Number(declaredCash) || 0) - sessionStats.expectedAmount
    : 0;

  useEffect(() => {
    checkSessionStatus();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (!session) return;
    if (user?.role === "ADMIN" || user?.role === "GERENTE") return;

    const interval = setInterval(async () => {
      try {
        const res = await api.get("/api/cash-session/status");
        const alreadyAcknowledged = localStorage.getItem("forcedCloseAcknowledged") === "true";
        if (!res.data.isOpen && res.data.lastClosed?.forceCloseReason && !alreadyAcknowledged) {
          setForcedCloseData({
            reason: res.data.lastClosed.forceCloseReason,
            closedAt: res.data.lastClosed.closedAt,
          });
          setSession(null);
        }
      } catch {
        // silent — polling errors no deben interrumpir el POS
      }
    }, 5000);

    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, user]);

  const handleClaimSessionHere = async () => {
    if (!blockedSession) return;
    claimSessionOwnership(blockedSession);
    setSession(blockedSession);
    setBlockedByOtherTab(false);
    setBlockedSession(null);
    onSetView("dashboard");
    await loadDashboardData();
  };

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== CASH_SESSION_OWNER_KEY) return;
      const owner = getSessionOwner();
      if (!owner) return;
      if (session && owner.sessionId === session.id && owner.tabId !== currentTabId) {
        setSession(null);
        setBlockedByOtherTab(true);
        setBlockedSession(session);
        onSetView("apertura");
      }
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [currentTabId, onSetView, session]);

  const clearForcedClose = () => {
    setForcedCloseData(null);
    localStorage.setItem("forcedCloseAcknowledged", "true");
  };

  return {
    session,
    setSession,
    forcedCloseData,
    clearForcedClose,
    sessionStats,
    setSessionStats,
    lastClosedStats,
    setLastClosedStats,
    recentSales,
    recentDeposits,
    initialFund,
    setInitialFund,
    initialFundError,
    setInitialFundError,
    openingLoading,
    partialCutLoading,
    partialCutData,
    setPartialCutData,
    declaredCash,
    setDeclaredCash,
    declaredCashError,
    setDeclaredCashError,
    closingLoading,
    calculatedDifference,
    blockedByOtherTab,
    blockedSession,
    handleClaimSessionHere,
    loadDashboardData,
    handleOpenCash,
    handleCloseShift,
    handleSavePartialCut,
  };
}
