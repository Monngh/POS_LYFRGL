import React, { useState } from "react";
import { X, AlertTriangle } from "lucide-react";
import api from "../../shared/services/api";
import { validateReference } from "../../shared/utils/formValidation";
import { ui } from "../views/shared";

interface ForceCloseCashModalProps {
    sessionId: number;
    cajero: string;
    branch: string;
    userId?: number;
    onClose: () => void;
    onSuccess: () => void;
}

export const ForceCloseCashModal: React.FC<ForceCloseCashModalProps> = ({
    sessionId,
    cajero,
    branch,
    userId,
    onClose,
    onSuccess,
}) => {
    const [step, setStep] = useState<"motivo" | "confirmar">("motivo");
    const [reason, setReason] = useState("");
    const [reasonError, setReasonError] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleClose = () => {
        setStep("motivo");
        setReason("");
        setReasonError("");
        setError(null);
        onClose();
    };

    const handleContinue = () => {
        const err = validateReference(reason, "El motivo", { required: true, max: 180 });
        if (err) {
            setReasonError(err);
            return;
        }
        setReasonError("");
        setStep("confirmar");
    };

    const handleConfirm = async () => {
        setLoading(true);
        setError(null);
        try {
            await api.put(`/api/admin/cash-sessions/${sessionId}/force-close`, {
                reason: reason.trim(),
                forcedBy: userId ?? 0,
            });
            onSuccess();
            handleClose();
        } catch (err: any) {
            setError(err.response?.data?.message || "Error al cerrar la caja forzadamente.");
        } finally {
            setLoading(false);
        }
    };

    const detailRowStyle: React.CSSProperties = {
        display: "flex",
        justifyContent: "flex-start",
        alignItems: "center",
        gap: "8px",
        fontSize: 13,
        marginBottom: 6,
    };

    const detailLabelStyle: React.CSSProperties = {
        fontWeight: 700,
        color: "var(--text-muted)",
        minWidth: "85px",
        display: "inline-block",
    };

    const detailValueStyle: React.CSSProperties = {
        fontWeight: 600,
        color: "var(--text-secondary)",
    };

    return (
        <div style={ui.overlay} onClick={handleClose}>
            <div style={{ ...ui.modal, maxWidth: 440, width: "100%" }} onClick={(e) => e.stopPropagation()}>
                {step === "motivo" ? (
                    <>
                        <div style={ui.modalHeader}>
                            <span style={ui.modalTitle}>¿Cerrar caja forzadamente?</span>
                            <button style={ui.ghostBtn} onClick={handleClose} title="Cerrar">
                                <X size={15} />
                            </button>
                        </div>
                        <div style={ui.modalBody}>
                            <p
                                style={{
                                    fontSize: 13,
                                    color: "#b91c1c",
                                    fontWeight: 600,
                                    marginBottom: 18,
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 6,
                                }}
                            >
                                <AlertTriangle size={14} /> Esta acción no se puede deshacer.
                            </p>
                            <label style={ui.fieldLabel}>Motivo de cierre *</label>
                            <textarea
                                value={reason}
                                maxLength={180}
                                onChange={(e) => {
                                    const value = e.target.value;
                                    if (value.length <= 180) {
                                        setReason(value);
                                        setReasonError(validateReference(value, "El motivo", { required: true, max: 180 }) || "");
                                    }
                                }}
                                placeholder="Ingresa el motivo del cierre forzado..."
                                rows={3}
                                style={{
                                    ...ui.input,
                                    resize: "vertical",
                                    minHeight: 80,
                                    fontFamily: "inherit",
                                    lineHeight: 1.5,
                                }}
                            />
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginTop: 4 }}>
                                <div style={{ flex: 1 }}>
                                    {reasonError && <p style={{ ...ui.fieldError, marginTop: 0 }}>{reasonError}</p>}
                                </div>
                                <span
                                    style={{
                                        fontSize: 11,
                                        color: reason.length >= 180 ? "#b91c1c" : "var(--text-faint)",
                                        marginLeft: 8,
                                    }}
                                >
                                    {reason.length} / 180
                                </span>
                            </div>
                            {error && <p style={{ color: "#b91c1c", fontSize: 13, marginTop: 8 }}>{error}</p>}
                            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
                                <button style={ui.ghostBtn} onClick={handleClose} disabled={loading}>
                                    Cancelar
                                </button>
                                <button
                                    style={{
                                        ...ui.primaryBtn,
                                        backgroundColor: !reason.trim() ? "#94a3b8" : "#b91c1c",
                                        cursor: !reason.trim() ? "not-allowed" : "pointer",
                                    }}
                                    onClick={handleContinue}
                                    disabled={!reason.trim()}
                                >
                                    Continuar →
                                </button>
                            </div>
                        </div>
                    </>
                ) : (
                    <>
                        <div style={ui.modalHeader}>
                            <span style={ui.modalTitle}>Confirmar cierre de caja</span>
                            <button
                                style={ui.ghostBtn}
                                onClick={() => {
                                    setStep("motivo");
                                    setError(null);
                                }}
                                title="Volver"
                            >
                                <X size={15} />
                            </button>
                        </div>
                        <div style={ui.modalBody}>
                            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
                                <div style={detailRowStyle}>
                                    <span style={detailLabelStyle}>Caja:</span>
                                    <span style={detailValueStyle}>Caja #{sessionId}</span>
                                </div>
                                <div style={detailRowStyle}>
                                    <span style={detailLabelStyle}>Cajero:</span>
                                    <span style={detailValueStyle}>{cajero}</span>
                                </div>
                                <div style={detailRowStyle}>
                                    <span style={detailLabelStyle}>Sucursal:</span>
                                    <span style={detailValueStyle}>{branch}</span>
                                </div>
                                <div style={{ ...detailRowStyle, alignItems: "flex-start" }}>
                                    <span style={detailLabelStyle}>Motivo:</span>
                                    <span style={{ ...detailValueStyle, wordBreak: "break-word", flex: 1 }}>{reason}</span>
                                </div>
                            </div>
                            <p
                                style={{
                                    fontSize: 13,
                                    color: "#b91c1c",
                                    fontWeight: 600,
                                    marginBottom: 20,
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 6,
                                }}
                            >
                                <AlertTriangle size={14} /> Esta acción cerrará la caja permanentemente y no se puede deshacer.
                            </p>
                            {error && <p style={{ color: "#b91c1c", fontSize: 13, marginBottom: 12 }}>{error}</p>}
                            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                                <button
                                    style={ui.ghostBtn}
                                    onClick={() => {
                                        setStep("motivo");
                                        setError(null);
                                    }}
                                    disabled={loading}
                                >
                                    ← Regresar
                                </button>
                                <button
                                    style={{
                                        ...ui.primaryBtn,
                                        backgroundColor: "#b91c1c",
                                        cursor: loading ? "not-allowed" : "pointer",
                                    }}
                                    onClick={handleConfirm}
                                    disabled={loading}
                                >
                                    {loading ? "Cerrando..." : "Confirmar cierre"}
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};