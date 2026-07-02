import React, { useState, useEffect } from "react";
import { AlertTriangle, Landmark } from "lucide-react";
import { PosModal } from "./shared";
import api from '../../../shared/services/api';
import {
  normalizeIntegerInput,
  validateReference,
  validateSafeText,
  validateInteger,
  validateLuhn,
} from '../../../shared/utils/formValidation';
import {
  DECIMAL_INPUT_REGEX,
  handleDecimalInputChange,
  validateDecimalField,
} from '../../../shared/utils/decimalInput';

const validateNameInput = (value: string): string =>
  value
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, "")
    .replace(/[^a-záéíóúàèìòùäëïöüâêîôûñçA-ZÁÉÍÓÚÀÈÌÒÙÄËÏÖÜÂÊÎÔÛÑÇ\s]/g, "");

const validateReasonInput = (value: string): string =>
  value
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, "")
    .replace(/[^a-záéíóúàèìòùäëïöüâêîôûñçA-ZÁÉÍÓÚÀÈÌÒÙÄËÏÖÜÂÊÎÔÛÑÇ0-9\s.,]/g, "");

const validateLongTextInput = (value: string): string =>
  value
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, "")
    .replace(/[^a-záéíóúàèìòùäëïöüâêîôûñçA-ZÁÉÍÓÚÀÈÌÒÙÄËÏÖÜÂÊÎÔÛÑÇ0-9\s.,]/g, "");

interface BankDepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: any;
  sessionStats: any;
  onOpenDepositReceipt: (deposit: any) => void;
  onToast: (msg: string, type?: "error" | "success" | "info") => void;
  onActionComplete?: () => void;
}


const inputGroup: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "6px",
  textAlign: "left",
};

const label: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: "700",
  color: "var(--text-secondary)",
  textTransform: "uppercase",
  letterSpacing: "0.5px",
};

const fieldError: React.CSSProperties = {
  color: "#b91c1c",
  fontSize: "12px",
  fontWeight: "600",
  marginTop: "5px",
  marginBottom: 0,
};

const modalBtn: React.CSSProperties = {
  flex: 1,
  padding: "10px",
  borderRadius: "6px",
  border: "none",
  fontWeight: "700",
  cursor: "pointer",
  textAlign: "center",
};

const table: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  textAlign: "left",
};

const tableHeaderRow: React.CSSProperties = {
  borderBottom: "2px solid var(--border)",
};

const th: React.CSSProperties = {
  padding: "10px 12px",
  fontSize: "11px",
  fontWeight: "700",
  color: "var(--text-secondary)",
  textTransform: "uppercase",
};

const tableRow: React.CSSProperties = {
  borderBottom: "1px solid var(--surface-3)",
};

const td: React.CSSProperties = {
  padding: "12px",
  fontSize: "13px",
  color: "var(--text-secondary)",
};

const badgeSuccess: React.CSSProperties = {
  backgroundColor: "#dcfce7",
  color: "#15803d",
  fontSize: "10px",
  fontWeight: "700",
  padding: "2px 6px",
  borderRadius: "4px",
};

const badgeDanger: React.CSSProperties = {
  backgroundColor: "#fee2e2",
  color: "#b91c1c",
  fontSize: "10px",
  fontWeight: "700",
  padding: "2px 6px",
  borderRadius: "4px",
};

const badgeWarning: React.CSSProperties = {
  backgroundColor: "#fef3c7",
  color: "#b45309",
  fontSize: "10px",
  fontWeight: "700",
  padding: "2px 6px",
  borderRadius: "4px",
};

const select: React.CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  borderRadius: "6px",
  border: "1px solid var(--border-strong)",
  backgroundColor: "var(--surface)",
  color: "var(--text)",
  fontSize: "14px",
  fontWeight: "500",
  outline: "none",
};

export default function BankDepositModal({
  isOpen,
  onClose,
  user,
  sessionStats,
  onOpenDepositReceipt,
  onToast,
  onActionComplete,
}: BankDepositModalProps) {
  // Registro
  const [depTab, setDepTab] = useState<"registrar" | "buscar">("registrar");
  const [depType, setDepType] = useState("EFECTIVO");
  const [depAccount, setDepAccount] = useState("");
  const [depName, setDepName] = useState("");
  const [depAmount, setDepAmount] = useState("");
  const [depComments, setDepComments] = useState("");
  const [depositFieldErrors, setDepositFieldErrors] = useState<Record<string, string>>({});
  const [depLoading, setDepLoading] = useState(false);
  // Búsqueda
  const [searchDepRef, setSearchDepRef] = useState("");
  const [searchDepRefError, setSearchDepRefError] = useState("");
  const [searchDepStatus, setSearchDepStatus] = useState("ALL");
  const [searchDepUser, setSearchDepUser] = useState("");
  const [searchDepDateFrom, setSearchDepDateFrom] = useState("");
  const [searchDepDateTo, setSearchDepDateTo] = useState("");
  const [depSearchResults, setDepSearchResults] = useState<any[]>([]);
  const [depSearchLoading, setDepSearchLoading] = useState(false);
  const [cashiers, setCashiers] = useState<any[]>([]);
  // Cancelación
  const [cancellingDep, setCancellingDep] = useState<any | null>(null);
  const [depCancelReason, setDepCancelReason] = useState("");
  const [depCancelPin, setDepCancelPin] = useState("");
  const [depCancelFieldErrors, setDepCancelFieldErrors] = useState<Partial<Record<"pin" | "reason", string>>>({});
  const [depCancelLoading, setDepCancelLoading] = useState(false);
  // Sync
  const [syncingDepositId, setSyncingDepositId] = useState<number | null>(null);

  const fetchCashiers = async () => {
    if (!user) return;
    try {
      const branchId = user.branch?.id;
      const res = await api.get(`/api/auth/cashiers/${branchId}`);
      setCashiers(res.data.cashiers || []);
    } catch (err) {
      console.error("Error al cargar cajeros:", err);
    }
  };

  const handleSearchDeposits = async () => {
    setDepSearchLoading(true);
    try {
      const params: any = {};
      if (searchDepRef) params.reference = searchDepRef;
      if (searchDepStatus && searchDepStatus !== "ALL") params.status = searchDepStatus;
      if (searchDepUser) params.userId = searchDepUser;
      if (searchDepDateFrom) params.dateFrom = searchDepDateFrom;
      if (searchDepDateTo) params.dateTo = searchDepDateTo;
      const res = await api.get("/api/sales/deposits/search", { params });
      setDepSearchResults(res.data.deposits || []);
    } catch (err) {
      console.error("Error al buscar depósitos:", err);
    } finally {
      setDepSearchLoading(false);
    }
  };

  const validateDepositCancelFields = () => {
    const errors: Partial<Record<"pin" | "reason", string>> = {};
    const pinError = validateInteger(depCancelPin, "El PIN", { min: 0 });
    if (pinError || depCancelPin.length !== 4) errors.pin = "El PIN debe contener 4 digitos.";
    const reasonError = validateReference(depCancelReason, "El motivo", { required: true, max: 100 });
    if (reasonError) errors.reason = reasonError;
    return errors;
  };

  const handleDepositSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const isMercadoPago = depType.startsWith("MERCADOPAGO_");
    const errors: Record<string, string> = {};

    if (!isMercadoPago) {
      if (!validateLuhn(depAccount)) {
        errors.account = "El número de tarjeta no es válido (Luhn / longitud 15-16).";
      }
      const nameError = validateSafeText(depName, "El beneficiario", { required: true, min: 2, max: 100 });
      if (nameError) {
        errors.name = nameError;
      }
    }

    const depAmountValidation = validateDecimalField(depAmount, "El monto del deposito", {
      min: 0,
      minExclusive: true,
      invalidMessage: "El monto del deposito debe ser un numero valido con maximo 3 decimales.",
      minMessage: "El monto del deposito debe ser mayor a 0.",
    });
    if (!depAmountValidation.ok) {
      errors.amount = depAmountValidation.error;
    }
    const commentsError = validateReference(depComments, "La referencia", { required: false, max: 180 });
    if (commentsError) errors.comments = commentsError;
    if (Object.keys(errors).length > 0) {
      setDepositFieldErrors(errors);
      onToast("Revisa los campos marcados antes de guardar.");
      return;
    }
    if (!depAmountValidation.ok) return;
    setDepositFieldErrors({});
    const depAmountValue = depAmountValidation.value;

    setDepLoading(true);
    try {
      if (depAmountValue.roundedMessage) {
        onToast(depAmountValue.roundedMessage, "info");
      }
      const res = await api.post("/api/sales/bank-deposit", {
        accountNumber: isMercadoPago ? "" : depAccount,
        targetName: isMercadoPago ? "" : depName,
        amount: depAmountValue.value,
        paymentType: depType,
        comments: depComments,
      });
      setDepAccount("");
      setDepName("");
      setDepAmount("");
      setDepComments("");
      setDepositFieldErrors({});
      setDepType("EFECTIVO");
      onOpenDepositReceipt(res.data.deposit);
    } catch (err: any) {
      onToast(err.response?.data?.message || "Error al procesar el depósito.");
    } finally {
      setDepLoading(false);
    }
  };

  const handleCancelDepositSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancellingDep) return;
    const errors = validateDepositCancelFields();
    setDepCancelFieldErrors(errors);
    if (Object.values(errors).some(Boolean)) return;

    setDepCancelLoading(true);
    try {
      const res = await api.post(`/api/sales/deposits/${cancellingDep.id}/cancel`, {
        pinCode: depCancelPin,
        reason: depCancelReason.trim(),
      });
      alert(res.data.message || "Depósito cancelado exitosamente.");
      setCancellingDep(null);
      setDepCancelPin("");
      setDepCancelReason("");
      setDepCancelFieldErrors({});
      await handleSearchDeposits();
      onActionComplete?.();
    } catch (err: any) {
      alert(err.response?.data?.message || "Error al cancelar el depósito.");
    } finally {
      setDepCancelLoading(false);
    }
  };

  const handleSyncDeposit = async (id: number) => {
    if (syncingDepositId === id) return;
    setSyncingDepositId(id);
    try {
      const res = await api.post(`/api/sales/deposits/${id}/sync`);
      onToast(res.data.message || "Depósito sincronizado.", "success");
      await handleSearchDeposits();
      onActionComplete?.();
    } catch (err: any) {
      onToast(err.response?.data?.message || "Error al sincronizar el depósito.");
    } finally {
      setSyncingDepositId(null);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setDepTab("registrar");
      setCancellingDep(null);
      setDepCancelPin("");
      setDepCancelReason("");
      setDepCancelFieldErrors({});
      setSearchDepRefError("");
      fetchCashiers();
      handleSearchDeposits();
    } else {
      setDepAccount("");
      setDepName("");
      setDepAmount("");
      setDepComments("");
      setDepositFieldErrors({});
      setDepType("EFECTIVO");
      setSearchDepRef("");
      setSearchDepRefError("");
      setSearchDepStatus("ALL");
      setSearchDepUser("");
      setSearchDepDateFrom("");
      setSearchDepDateTo("");
      setDepSearchResults([]);
      setSyncingDepositId(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const delayDebounce = setTimeout(() => {
      handleSearchDeposits();
    }, 300);
    return () => clearTimeout(delayDebounce);
  }, [searchDepRef, searchDepStatus, searchDepUser, searchDepDateFrom, searchDepDateTo]);

  if (!isOpen) return null;

  const renderFooter = () => {
    if (cancellingDep) {
      return (
        <div style={{ display: "flex", width: "100%", gap: "10px" }}>
          <button
            type="button"
            onClick={() => {
              setCancellingDep(null);
              setDepCancelPin("");
              setDepCancelReason("");
              setDepCancelFieldErrors({});
            }}
            style={{ ...modalBtn, backgroundColor: "var(--text-muted)", color: "white" }}
          >
            VOLVER AL HISTORIAL
          </button>
          <button
            type="button"
            onClick={(e) => handleCancelDepositSubmit(e as any)}
            disabled={depCancelLoading}
            style={{ ...modalBtn, backgroundColor: "#dc2626", color: "white" }}
          >
            {depCancelLoading ? "Cancelando..." : "CANCELAR RESGUARDO"}
          </button>
        </div>
      );
    }
    if (depTab === "registrar") {
      return (
        <div style={{ display: "flex", width: "100%", gap: "10px" }} className="pos-cashier-modal-actions">
          <button
            type="button"
            onClick={onClose}
            style={{ ...modalBtn, backgroundColor: "var(--text-muted)", color: "white" }}
          >
            CERRAR
          </button>
          <button
            type="button"
            onClick={(e) => handleDepositSubmit(e as any)}
            disabled={depLoading}
            style={{ ...modalBtn, backgroundColor: "#2563eb", color: "white" }}
          >
            {depLoading ? "Procesando..." : "REGISTRAR RESGUARDO"}
          </button>
        </div>
      );
    }
    if (depTab === "buscar") {
      return (
        <div style={{ display: "flex", width: "100%" }}>
          <button
            type="button"
            onClick={onClose}
            style={{ ...modalBtn, backgroundColor: "var(--text-muted)", color: "white", width: "100%" }}
          >
            CERRAR HISTORIAL
          </button>
        </div>
      );
    }
    return null;
  };

  return (
    <PosModal
      isOpen={isOpen}
      onClose={onClose}
      title="Resguardo de Efectivo (Cash Deposit)"
      subtitle="Registra retiros de efectivo o depósitos bancarios de la caja."
      icon={<Landmark size={24} />}
      iconColor="#0369a1"
      size="xl"
      footer={renderFooter()}
    >

        <div style={{ backgroundColor: "#e0f2fe", border: "1px solid #bae6fd", borderRadius: "8px", padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "13px", color: "#0369a1", fontWeight: "600", marginTop: "12px", marginBottom: "14px" }} className="pos-cashier-deposit-info">
          <span>Efectivo disponible en caja:</span>
          <span style={{ fontSize: "15px", fontWeight: "800" }}>${sessionStats?.expectedAmount?.toFixed(2) || "0.00"}</span>
        </div>

        {cancellingDep ? (
          <div style={{ padding: "16px", border: "1px solid #fca5a5", borderRadius: "8px", backgroundColor: "#fff5f5", display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#991b1b" }}>
              <AlertTriangle size={20} />
              <strong style={{ fontSize: "14px" }}>Confirmar Cancelación de Resguardo</strong>
            </div>
            <p style={{ fontSize: "12px", color: "#7f1d1d", margin: 0 }}>
              Se requiere la validación mediante el PIN de un Gerente o Administrador. El monto de <strong>${Number(cancellingDep.amount).toFixed(2)} MXN</strong> se restará de las salidas de efectivo del turno actual (reversión de cashOut).
            </p>
            <form onSubmit={handleCancelDepositSubmit} style={{ display: "flex", flexDirection: "column", gap: "12px" }} noValidate>
              <div style={inputGroup}>
                <label style={label}>PIN de Autorización del Gerente:</label>
                <input
                  type="password"
                  maxLength={4}
                  required
                  className="input-corporate"
                  placeholder="Ej. ****"
                  value={depCancelPin}
                  onChange={(e) => {
                    const rawValue = e.target.value;
                    const value = normalizeIntegerInput(rawValue).slice(0, 4);
                    setDepCancelPin(value);
                    setDepCancelFieldErrors((prev) => ({
                      ...prev,
                      pin:
                        rawValue !== value
                          ? "El PIN debe contener 4 digitos."
                          : value.length === 4
                            ? undefined
                            : "El PIN debe contener 4 digitos.",
                    }));
                  }}
                />
                {depCancelFieldErrors.pin && <p style={fieldError}>{depCancelFieldErrors.pin}</p>}
              </div>
              <div style={inputGroup}>
                <label style={label}>Motivo de Cancelación:</label>
                <input
                  type="text"
                  required
                  maxLength={100}
                  className="input-corporate"
                  placeholder="Motivo detallado de la cancelación"
                  value={depCancelReason}
                  onChange={(e) => {
                    const value = validateReasonInput(e.target.value).slice(0, 100);
                    setDepCancelReason(value);
                    setDepCancelFieldErrors((prev) => ({
                      ...prev,
                      reason: validateReference(value, "El motivo", { required: true, max: 100 }),
                    }));
                  }}
                />
                {depCancelFieldErrors.reason && <p style={fieldError}>{depCancelFieldErrors.reason}</p>}
              </div>
            </form>
          </div>
        ) : (
          <>
            {/* Selector de pestañas */}
            <div style={{ display: "flex", borderBottom: "2px solid var(--border)", marginBottom: "16px" }} className="pos-cashier-dep-tabs">
              <button
                type="button"
                onClick={() => setDepTab("registrar")}
                style={{
                  flex: 1,
                  padding: "10px",
                  border: "none",
                  borderBottom: depTab === "registrar" ? "3px solid #2563eb" : "none",
                  backgroundColor: "transparent",
                  fontWeight: "700",
                  color: depTab === "registrar" ? "#2563eb" : "var(--text-muted)",
                  cursor: "pointer",
                }}
              >
                REGISTRAR RESGUARDO
              </button>
              <button
                type="button"
                onClick={() => setDepTab("buscar")}
                style={{
                  flex: 1,
                  padding: "10px",
                  border: "none",
                  borderBottom: depTab === "buscar" ? "3px solid #2563eb" : "none",
                  backgroundColor: "transparent",
                  fontWeight: "700",
                  color: depTab === "buscar" ? "#2563eb" : "var(--text-muted)",
                  cursor: "pointer",
                }}
              >
                BUSCAR / HISTORIAL
              </button>
            </div>

            {depTab === "registrar" ? (
              <form onSubmit={handleDepositSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                {/* Tarjeta de Datos Calculados */}
                <div style={{ border: "1px solid var(--border)", borderRadius: "8px", padding: "12px", backgroundColor: "var(--surface-2)", marginBottom: "4px" }}>
                  <h4 style={{ fontSize: "11px", fontWeight: "700", color: "var(--text-secondary)", textTransform: "uppercase", marginBottom: "8px", borderBottom: "1px solid var(--border)", paddingBottom: "4px" }}>
                    Información Operativa
                  </h4>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", fontSize: "11px" }} className="pos-cashier-grid-2">
                    <div>
                      <span style={{ color: "var(--text-muted)" }}>Referencia Estimada:</span>
                      <strong style={{ display: "block", color: "var(--text)", marginTop: "2px" }}>DEP-{new Date().toISOString().slice(0, 10).replace(/-/g, "")}-[SIG]</strong>
                    </div>
                    <div>
                      <span style={{ color: "var(--text-muted)" }}>Estado del Registro:</span>
                      <strong style={{ display: "block", color: depType.startsWith("MERCADOPAGO_") ? "#d97706" : "#059669", marginTop: "2px" }}>
                        {depType.startsWith("MERCADOPAGO_") ? "PENDING (Espera de Pago)" : "COMPLETED (Salida Física)"}
                      </strong>
                    </div>
                    <div>
                      <span style={{ color: "var(--text-muted)" }}>Fecha de Registro:</span>
                      <strong style={{ display: "block", color: "var(--text)", marginTop: "2px" }}>{new Date().toLocaleDateString()}</strong>
                    </div>
                    <div>
                      <span style={{ color: "var(--text-muted)" }}>Método de Retiro:</span>
                      <strong style={{ display: "block", color: "var(--text)", marginTop: "2px" }}>
                        {depType === "EFECTIVO" ? "Efectivo en Caja Chica" : `Mercado Pago (${depType.replace("MERCADOPAGO_", "")})`}
                      </strong>
                    </div>
                  </div>
                </div>

                <div style={inputGroup}>
                  <label style={label}>Método de Retiro / Depósito:</label>
                  <select
                    value={depType}
                    onChange={(e) => {
                      setDepType(e.target.value);
                      if (e.target.value.startsWith("MERCADOPAGO_")) {
                        setDepAccount("");
                        setDepName("");
                      }
                    }}
                    style={select}
                  >
                    <option value="EFECTIVO">Efectivo en Caja Chica (Manual)</option>
                    <option value="MERCADOPAGO_OXXO">Mercado Pago - OXXO (Establecimiento)</option>
                    <option value="MERCADOPAGO_BBVA">Mercado Pago - BBVA Bancomer (Establecimiento)</option>
                    <option value="MERCADOPAGO_SANTANDER">Mercado Pago - Santander (Establecimiento)</option>
                    <option value="MERCADOPAGO_CITIBANAMEX">Mercado Pago - Citibanamex (Establecimiento)</option>
                    <option value="MERCADOPAGO_7ELEVEN">Mercado Pago - 7-Eleven (Establecimiento)</option>
                  </select>
                </div>

                {!depType.startsWith("MERCADOPAGO_") && (
                  <>
                    <div style={inputGroup}>
                      <label style={label}>Número de Cuenta Target (16 dígitos):</label>
                      <input
                        type="text"
                        maxLength={16}
                        required
                        className="input-corporate"
                        placeholder="Ej. 1234567890123456"
                        value={depAccount}
                        onChange={(e) => {
                          const rawValue = e.target.value;
                          const value = normalizeIntegerInput(rawValue).slice(0, 16);
                          setDepAccount(value);
                          
                          let error = "";
                          if (rawValue.trim() && rawValue !== value) {
                            error = "La cuenta solo puede contener numeros.";
                          } else if (value.length > 0 && value.length < 15) {
                            error = "La cuenta debe tener 15 o 16 digitos.";
                          } else if (value.length >= 15 && !validateLuhn(value)) {
                            error = "El numero de tarjeta no es valido (Algoritmo de Luhn).";
                          }
                          
                          setDepositFieldErrors((prev) => ({
                            ...prev,
                            account: error,
                          }));
                        }}
                      />
                      {depositFieldErrors.account && <p style={fieldError}>{depositFieldErrors.account}</p>}
                    </div>

                    <div style={inputGroup}>
                      <label style={label}>Nombre del Beneficiario:</label>
                      <input
                        type="text"
                        maxLength={100}
                        required
                        className="input-corporate"
                        placeholder="Nombre de la persona o banco"
                        value={depName}
                        onChange={(e) => {
                          const value = validateNameInput(e.target.value).slice(0, 100);
                          setDepName(value);
                          setDepositFieldErrors((prev) => ({
                            ...prev,
                            name: validateSafeText(value, "El beneficiario", { required: true, min: 2, max: 100 }) || "",
                          }));
                        }}
                      />
                      {depositFieldErrors.name && <p style={fieldError}>{depositFieldErrors.name}</p>}
                    </div>
                  </>
                )}

                <div style={inputGroup}>
                  <label style={label}>Monto a Retirar y Depositar ($):</label>
                  <input
                    type="text"
                    required
                    className="input-corporate"
                    placeholder={depType.startsWith("MERCADOPAGO_") ? "Monto a depositar en MP" : "Monto a retirar en efectivo"}
                    value={depAmount}
                    inputMode="decimal"
                    onChange={(e) => {
                      const rawValue = e.target.value.trim();
                      if (rawValue && !DECIMAL_INPUT_REGEX.test(rawValue)) {
                        setDepositFieldErrors((prev) => ({ ...prev, amount: "El monto del deposito debe ser un numero valido con maximo 3 decimales." }));
                        return;
                      }
                      handleDecimalInputChange(rawValue, (value) => {
                        setDepAmount(value);
                        setDepositFieldErrors((prev) => ({ ...prev, amount: "" }));
                      });
                    }}
                  />
                  {depositFieldErrors.amount && <p style={fieldError}>{depositFieldErrors.amount}</p>}
                </div>

                <div style={inputGroup}>
                  <label style={label}>Comentarios / Referencia:</label>
                  <input
                    type="text"
                    maxLength={100}
                    className="input-corporate"
                    placeholder="Ej. Número de sucursal, folio, etc."
                    value={depComments}
                    onChange={(e) => {
                      const value = validateLongTextInput(e.target.value).slice(0, 100);
                      setDepComments(value);
                      setDepositFieldErrors((prev) => ({ ...prev, comments: validateReference(value, "La referencia", { required: false, max: 100 }) || "" }));
                    }}
                  />
                  {depositFieldErrors.comments && <p style={fieldError}>{depositFieldErrors.comments}</p>}
                </div>

              </form>
            ) : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {/* Filtros de Búsqueda */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px", marginBottom: "10px" }} className="pos-cashier-grid-3">
                  <div style={inputGroup}>
                    <label style={label}>Referencia:</label>
                    <input
                      type="text"
                      maxLength={30}
                      className="input-corporate"
                      placeholder="DEP-..."
                      value={searchDepRef}
                      onChange={(e) => {
                        const raw = e.target.value;
                        const clean = raw.slice(0, 30);
                        setSearchDepRef(clean);
                        if (raw.length > 30) {
                          setSearchDepRefError("La referencia no puede exceder los 30 caracteres.");
                        } else {
                          setSearchDepRefError("");
                        }
                      }}
                    />
                    {searchDepRefError && <p style={fieldError}>{searchDepRefError}</p>}
                  </div>
                  <div style={inputGroup}>
                    <label style={label}>Estado:</label>
                    <select
                      value={searchDepStatus}
                      onChange={(e) => setSearchDepStatus(e.target.value)}
                      style={select}
                    >
                      <option value="ALL">Todos</option>
                      <option value="COMPLETED">Completados</option>
                      <option value="PENDING">Pendientes</option>
                      <option value="CANCELLED">Cancelados</option>
                    </select>
                  </div>
                  <div style={inputGroup}>
                    <label style={label}>Cajero:</label>
                    <select
                      value={searchDepUser}
                      onChange={(e) => setSearchDepUser(e.target.value)}
                      style={select}
                    >
                      <option value="">Todos</option>
                      {cashiers.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "14px" }} className="pos-cashier-grid-2">
                  <div style={inputGroup}>
                    <label style={label}>Desde:</label>
                    <input
                      type="date"
                      className="input-corporate"
                      value={searchDepDateFrom}
                      onChange={(e) => setSearchDepDateFrom(e.target.value)}
                    />
                  </div>
                  <div style={inputGroup}>
                    <label style={label}>Hasta:</label>
                    <input
                      type="date"
                      className="input-corporate"
                      value={searchDepDateTo}
                      onChange={(e) => setSearchDepDateTo(e.target.value)}
                    />
                  </div>
                </div>

                {/* Tabla de Resultados */}
                <div style={{ maxHeight: "220px", overflowX: "auto", overflowY: "auto", border: "1px solid var(--border)", borderRadius: "6px", marginBottom: "14px" }} className="pos-cashier-inline-table-scroll">
                  <table style={table}>
                    <thead>
                      <tr style={tableHeaderRow}>
                        <th style={{ ...th, padding: "8px" }}>Referencia / Fecha</th>
                        <th style={{ ...th, padding: "8px" }}>Destino</th>
                        <th style={{ ...th, padding: "8px" }}>Monto</th>
                        <th style={{ ...th, padding: "8px" }}>Cajero</th>
                        <th style={{ ...th, padding: "8px" }}>Estado</th>
                        <th style={{ ...th, padding: "8px" }}>Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {depSearchLoading ? (
                        <tr>
                          <td colSpan={6} style={{ textAlign: "center", padding: "16px", color: "var(--text-muted)", fontSize: "12px" }}>
                            Buscando resguardos...
                          </td>
                        </tr>
                      ) : depSearchResults.length === 0 ? (
                        <tr>
                          <td colSpan={6} style={{ textAlign: "center", padding: "16px", color: "var(--text-muted)", fontSize: "12px" }}>
                            No se encontraron resguardos.
                          </td>
                        </tr>
                      ) : (
                        depSearchResults.map((dep) => (
                          <tr key={dep.id} style={tableRow}>
                            <td style={{ ...td, padding: "8px", fontSize: "12px" }}>
                              <div style={{ fontWeight: "700" }}>{dep.reference || `#${dep.id}`}</div>
                              <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>{new Date(dep.createdAt).toLocaleDateString()}</div>
                            </td>
                            <td style={{ ...td, padding: "8px", fontSize: "12px" }}>
                              {dep.paymentType?.startsWith("MERCADOPAGO_") ? (
                                <div>Ref: ****{dep.accountNumber.slice(-4)}</div>
                              ) : (
                                <div>Cuenta: ****{dep.accountNumber.slice(-4)}</div>
                              )}
                              <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>
                                {dep.targetName ? "Destino registrado" : "Destino no registrado"}
                              </div>
                            </td>
                            <td style={{ ...td, padding: "8px", fontSize: "12px", fontWeight: "700", color: dep.status === "CANCELLED" ? "#b91c1c" : "var(--text)" }}>
                              {dep.status === "CANCELLED" ? "" : "-"}${Number(dep.amount).toFixed(2)}
                            </td>
                            <td style={{ ...td, padding: "8px", fontSize: "12px" }}>{dep.userName}</td>
                            <td style={{ ...td, padding: "8px", fontSize: "12px" }}>
                              <span style={
                                dep.status === "COMPLETED" ? badgeSuccess :
                                dep.status === "CANCELLED" ? badgeDanger :
                                badgeWarning
                              }>
                                {dep.status === "COMPLETED" ? "Exitoso" :
                                 dep.status === "CANCELLED" ? "Cancelado" : "Pendiente"}
                              </span>
                            </td>
                            <td style={{ ...td, padding: "8px", fontSize: "12px" }}>
                              <div style={{ display: "flex", gap: "4px" }}>
                                <button
                                  type="button"
                                  onClick={() => onOpenDepositReceipt(dep)}
                                  style={{
                                    padding: "4px 6px",
                                    borderRadius: "4px",
                                    backgroundColor: "#eff6ff",
                                    color: "#1d4ed8",
                                    border: "1px solid #bfdbfe",
                                    fontSize: "10px",
                                    fontWeight: "700",
                                    cursor: "pointer",
                                  }}
                                >
                                  Ver
                                </button>
                                {dep.status === "PENDING" && dep.paymentType?.startsWith("MERCADOPAGO_") && (
                                  <button
                                    type="button"
                                    onClick={() => handleSyncDeposit(dep.id)}
                                    disabled={syncingDepositId === dep.id}
                                    style={{
                                      padding: "4px 6px",
                                      borderRadius: "4px",
                                      backgroundColor: "#d1fae5",
                                      color: "#065f46",
                                      border: "1px solid #a7f3d0",
                                      fontSize: "10px",
                                      fontWeight: "700",
                                      cursor: syncingDepositId === dep.id ? "not-allowed" : "pointer",
                                      opacity: syncingDepositId === dep.id ? 0.7 : 1,
                                    }}
                                  >
                                    {syncingDepositId === dep.id ? "Sincronizando..." : "Sincronizar"}
                                  </button>
                                )}
                                {dep.status !== "CANCELLED" && (
                                  <button
                                    type="button"
                                    onClick={() => setCancellingDep(dep)}
                                    style={{
                                      padding: "4px 6px",
                                      borderRadius: "4px",
                                      backgroundColor: "#fef2f2",
                                      color: "#b91c1c",
                                      border: "1px solid #fecaca",
                                      fontSize: "10px",
                                      fontWeight: "700",
                                      cursor: "pointer",
                                    }}
                                  >
                                    Cancelar
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

              </div>
            )}
          </>
        )}
    </PosModal>
  );
}
