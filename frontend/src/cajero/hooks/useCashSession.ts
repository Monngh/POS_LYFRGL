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
          onSetCajaLockedByOtherDevice(true);
          return;
        }
        onSetCajaLockedByOtherDevice(false);
        setSession(resStatus.data.session);
        onSetView("dashboard");
        await loadDashboardData();
      } else {
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
      setSession(res.data.session);
      onToast(res.data.message || "Caja abierta exitosamente.", "success");
      onSetView("dashboard");
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

  return {
    session,
    setSession,
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
    loadDashboardData,
    handleOpenCash,
    handleCloseShift,
    handleSavePartialCut,
  };
}
