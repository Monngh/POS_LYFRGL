import React, { useState, useEffect } from "react";
import { RotateCcw, XCircle, KeyRound, Minus, Plus } from "lucide-react";
import api from '../../../shared/services/api';
import {
  normalizeIntegerInput,
  validateReference,
  validateInteger,
} from '../../../shared/utils/formValidation';

const validateFolioInput = (value: string): string =>
  value
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, "")
    .replace(/[^a-zA-Z0-9\-]/g, "");

const validateMotivoDevoluccion = (value: string): string =>
  value
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, "")
    .replace(/[^a-záéíóúàèìòùäëïöüâêîôûñçA-ZÁÉÍÓÚÀÈÌÒÙÄËÏÖÜÂÊÎÔÛÑÇ0-9\s.,\-']/g, "");

interface ReturnsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: any;
  onReturnCompleted: () => void;
  onToast: (msg: string, type?: "error" | "success" | "info") => void;
  onOpenEmailModal: (config: { subject: string; htmlContent?: string; defaultEmail?: string | null }) => void;
}

const modalOverlay: React.CSSProperties = {
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: "rgba(15, 23, 42, 0.4)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  zIndex: 100,
};

const inputGroup: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "6px",
  textAlign: "left",
};

const label: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: "700",
  color: "#475569",
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

const submitBtn: React.CSSProperties = {
  backgroundColor: "#2563eb",
  color: "#ffffff",
  border: "none",
  padding: "12px",
  borderRadius: "6px",
  fontWeight: "700",
  cursor: "pointer",
  boxShadow: "0 4px 6px rgba(37,99,235,0.15)",
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

export default function ReturnsModal({
  isOpen,
  onClose,
  user,
  onReturnCompleted,
  onToast,
  onOpenEmailModal,
}: ReturnsModalProps) {
  const [returnStep, setReturnStep] = useState<"search" | "select" | "confirm" | "receipt">("search");
  const [returnFolio, setReturnFolio] = useState("");
  const [returnLoading, setReturnLoading] = useState(false);
  const [returnSaleData, setReturnSaleData] = useState<any>(null);
  const [returnItems, setReturnItems] = useState<any[]>([]);
  const [returnReason, setReturnReason] = useState("");
  const [returnPin, setReturnPin] = useState("");
  const [returnFieldErrors, setReturnFieldErrors] = useState<Partial<Record<"folio" | "reason" | "pin", string>>>({});
  const [returnPinAttempts, setReturnPinAttempts] = useState<number>(0);
  const [returnPaymentMethod, setReturnPaymentMethod] = useState("EFECTIVO");
  const [returnProcessing, setReturnProcessing] = useState(false);
  const [returnReceipt, setReturnReceipt] = useState<any>(null);

  const handleReturnReset = () => {
    setReturnStep("search");
    setReturnFolio("");
    setReturnSaleData(null);
    setReturnItems([]);
    setReturnReason("");
    setReturnPin("");
    setReturnFieldErrors({});
    setReturnPinAttempts(0);
    setReturnPaymentMethod("EFECTIVO");
    setReturnProcessing(false);
    setReturnReceipt(null);
  };

  useEffect(() => {
    if (!isOpen) {
      handleReturnReset();
    }
  }, [isOpen]);

  const handleReturnSearch = async () => {
    const folio = returnFolio.trim();
    const folioError = validateReference(folio, "El folio de venta", { required: true, max: 40 });
    if (folioError) {
      setReturnFieldErrors((prev) => ({ ...prev, folio: folioError }));
      return;
    }
    setReturnFieldErrors((prev) => {
      const next = { ...prev };
      delete next.folio;
      return next;
    });
    setReturnLoading(true);
    try {
      const res = await api.get(`/api/returns/eligible/${encodeURIComponent(folio)}`);
      setReturnSaleData(res.data.sale);
      setReturnItems(
        res.data.items.map((item: any) => ({
          ...item,
          selected: false,
          qtyToReturn: 0,
          destination: "INVENTARIO_VENDIBLE",
          serialNumberInput: "",
          batchNumberInput: "",
        }))
      );
      setReturnStep("select");
    } catch (err: any) {
      onToast(err.response?.data?.message || "Error al buscar la venta.", "error");
    } finally {
      setReturnLoading(false);
    }
  };

  const handleReturnToggleItem = (idx: number) => {
    setReturnItems((prev) =>
      prev.map((item, i) =>
        i === idx
          ? {
              ...item,
              selected: !item.selected,
              qtyToReturn: !item.selected ? Math.min(1, item.maxReturnableQty) : 0,
            }
          : item
      )
    );
  };

  const handleReturnQtyChange = (idx: number, qty: number) => {
    setReturnItems((prev) =>
      prev.map((item, i) =>
        i === idx ? { ...item, qtyToReturn: Math.max(0, Math.min(qty, item.maxReturnableQty)) } : item
      )
    );
  };

  const handleReturnDestinationChange = (idx: number, dest: string) => {
    setReturnItems((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, destination: dest } : item))
    );
  };

  const handleReturnSelectAll = () => {
    const allSelected = returnItems.filter((it) => it.isEligible).every((it) => it.selected);
    setReturnItems((prev) =>
      prev.map((item) =>
        item.isEligible
          ? { ...item, selected: !allSelected, qtyToReturn: !allSelected ? item.maxReturnableQty : 0 }
          : item
      )
    );
  };

  const getReturnRefundTotal = () => {
    return returnItems
      .filter((it) => it.selected && it.qtyToReturn > 0)
      .reduce((acc, it) => {
        const net = it.netUnitPrice * it.qtyToReturn;
        const tax = net * 0.16;
        return acc + net + tax;
      }, 0);
  };

  const handleReturnProceed = () => {
    const selected = returnItems.filter((it) => it.selected && it.qtyToReturn > 0);
    if (selected.length === 0) {
      onToast("Seleccione al menos un producto para devolver.", "error");
      return;
    }
    const reasonError = validateReference(returnReason, "El motivo", { required: true, max: 180 });
    if (reasonError) {
      setReturnFieldErrors((prev) => ({ ...prev, reason: reasonError }));
      return;
    }
    setReturnFieldErrors((prev) => {
      const next = { ...prev };
      delete next.reason;
      return next;
    });
    if (!returnReason.trim()) {
      onToast("Indique el motivo de la devolución.", "error");
      return;
    }
    setReturnStep("confirm");
  };

  const handleReturnProcess = async () => {
    if (returnProcessing) return;
    if (returnPinAttempts >= 3) {
      onToast("Se ha superado el máximo de 3 intentos de PIN. El módulo se cerrará.", "error");
      setTimeout(() => {
        handleReturnReset();
        onClose();
      }, 2000);
      return;
    }
    const pinError = validateInteger(returnPin, "El PIN", { min: 0 });
    if (pinError || returnPin.length !== 4) {
      setReturnFieldErrors((prev) => ({ ...prev, pin: "El PIN debe contener 4 digitos." }));
      return;
    }
    setReturnFieldErrors((prev) => {
      const next = { ...prev };
      delete next.pin;
      return next;
    });
    if (!returnPin.trim()) {
      onToast("Ingrese el PIN de autorización del supervisor.", "error");
      return;
    }
    setReturnProcessing(true);
    try {
      const selected = returnItems.filter((it) => it.selected && it.qtyToReturn > 0);
      const payload = {
        saleId: returnSaleData.id,
        reason: returnReason.trim(),
        pinCode: returnPin,
        paymentMethod: returnPaymentMethod,
        items: selected.map((it) => ({
          saleDetailId: it.saleDetailId,
          quantity: it.qtyToReturn,
          destination: it.destination,
          serialNumber: it.serialNumberInput || undefined,
          batchNumber: it.batchNumberInput || undefined,
        })),
      };
      const res = await api.post("/api/returns", payload);
      setReturnPinAttempts(0);
      setReturnReceipt(res.data);
      setReturnStep("receipt");
      onToast("Devolución procesada exitosamente.", "success");
      onReturnCompleted();
    } catch (err: any) {
      if (err.response?.status === 401) {
        const nextAttempts = returnPinAttempts + 1;
        setReturnPinAttempts(nextAttempts);
        if (nextAttempts >= 3) {
          onToast("El NIP es incorrecto. Se ha superado el máximo de 3 intentos. Saliendo...", "error");
          setTimeout(() => {
            handleReturnReset();
            onClose();
          }, 2000);
        } else {
          onToast(`El NIP es incorrecto. Intento ${nextAttempts}/3.`, "error");
        }
      } else {
        onToast(err.response?.data?.message || "Error al procesar la devolución.", "error");
      }
    } finally {
      setReturnProcessing(false);
    }
  };

  const buildReturnReceiptHtml = () => {
    if (!returnReceipt) return "";
    const safe = (value: unknown) =>
      String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    const selectedItems = returnItems.filter((it) => it.selected && it.qtyToReturn > 0);
    const rows = [
      `<div class="ticket-row"><span>Folio devolucion:</span><span class="ticket-value">${safe(returnReceipt.returnNumber)}</span></div>`,
      `<div class="ticket-row"><span>Venta origen:</span><span class="ticket-value">${safe(returnSaleData?.invoiceNumber || "N/A")}</span></div>`,
      `<div class="ticket-row"><span>Fecha:</span><span class="ticket-value">${safe(new Date().toLocaleString())}</span></div>`,
      `<div class="ticket-row"><span>Sucursal:</span><span class="ticket-value">${safe(user?.branch?.name || "N/A")}</span></div>`,
      `<div class="ticket-row"><span>Cajero:</span><span class="ticket-value">${safe(user?.name || "N/A")}</span></div>`,
      `<div class="ticket-row"><span>Cliente:</span><span class="ticket-value">${safe(returnSaleData?.customerName ? "Cliente registrado" : "Publico general")}</span></div>`,
      `<div class="ticket-row"><span>Metodo reembolso:</span><span class="ticket-value">${safe(returnPaymentMethod)}</span></div>`,
      `<div class="ticket-row"><span>Motivo:</span><span class="ticket-value">${safe(returnReason || "N/A")}</span></div>`,
    ];
    if (returnReceipt.storeCreditCode) {
      rows.push(`<div class="ticket-row"><span>Codigo de vale:</span><span class="ticket-value">${safe(returnReceipt.storeCreditCode)}</span></div>`);
    }
    if (returnReceipt.cfdiUuid) {
      rows.push(`<div class="ticket-row"><span>Nota credito SAT:</span><span class="ticket-value">${safe(returnReceipt.cfdiUuid)}</span></div>`);
    }
    if (returnReceipt.exchangeSaleInvoice) {
      rows.push(`<div class="ticket-row"><span>Cambio producto:</span><span class="ticket-value">${safe(returnReceipt.exchangeSaleInvoice)}</span></div>`);
    }
    const itemRows = selectedItems
      .map(
        (item) => `
          <tr>
            <td style="width:12%;text-align:left;padding:3px 2px 3px 0;">${Number(item.qtyToReturn)}</td>
            <td style="width:48%;padding:3px 4px 3px 0;">${safe(item.name)}</td>
            <td style="width:18%;text-align:right;padding:3px 4px 3px 0;">$${Number(item.netUnitPrice).toFixed(2)}</td>
            <td style="width:22%;text-align:right;padding:3px 0;">$${Number(item.netUnitPrice * item.qtyToReturn * 1.16).toFixed(2)}</td>
          </tr>`
      )
      .join("");

    return `
      <div>
        <div class="ticket-header">
          <span class="ticket-store">LYFRGL POS</span>
          <span class="ticket-muted">Sucursal: ${safe(user?.branch?.name || "N/A")}</span>
          <span class="ticket-operation">DEVOLUCION</span>
        </div>
        <div class="ticket-section">
          ${rows.join("")}
        </div>
        ${
          itemRows
            ? `<div class="ticket-section">
                <table>
                  <thead>
                    <tr style="border-bottom:1px dashed #111111;">
                      <th style="width:12%;text-align:left;padding-bottom:4px;">Cant</th>
                      <th style="width:48%;text-align:left;padding-bottom:4px;">Descripcion</th>
                      <th style="width:18%;text-align:right;padding-bottom:4px;">Unit</th>
                      <th style="width:22%;text-align:right;padding-bottom:4px;">Importe</th>
                    </tr>
                  </thead>
                  <tbody>${itemRows}</tbody>
                </table>
              </div>`
            : ""
        }
        <div class="ticket-section">
          <div class="ticket-row ticket-total">
            <span>Total reembolsado:</span>
            <span>$${Number(returnReceipt.totalRefunded).toFixed(2)}</span>
          </div>
        </div>
        <div class="ticket-footer">
          <p>DEVOLUCION PROCESADA CORRECTAMENTE</p>
          <p>Conserve este comprobante.</p>
        </div>
      </div>
    `;
  };

  if (!isOpen) return null;

  return (
    <div style={modalOverlay} className="pos-cashier-modal-overlay pos-cashier-modal-overlay--center">
      <div
        style={{
          width: returnStep === "receipt" ? "460px" : "640px",
          backgroundColor: "#ffffff",
          borderRadius: "12px",
          padding: "28px",
          boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)",
          maxWidth: "95vw",
          maxHeight: "90vh",
          overflowY: "auto",
        } as React.CSSProperties}
        className="pos-cashier-modal"
      >
        {/* HEADER */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
          <h3 style={{ fontSize: "16px", fontWeight: "800", color: "#0f172a", borderBottom: "1px solid #e2e8f0", paddingBottom: "8px", margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
            <RotateCcw size={20} color="#dc2626" />
            Devoluciones
          </h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: "4px" }}>
            <XCircle size={20} color="#94a3b8" />
          </button>
        </div>

        {/* Indicador de pasos */}
        <div style={{ display: "flex", gap: "4px", marginBottom: "18px" }}>
          {["search", "select", "confirm", "receipt"].map((step, i) => (
            <div
              key={step}
              style={{
                flex: 1,
                height: "4px",
                borderRadius: "2px",
                backgroundColor:
                  ["search", "select", "confirm", "receipt"].indexOf(returnStep) >= i
                    ? "#1e3a8a"
                    : "#e2e8f0",
                transition: "background-color 0.3s",
              }}
            />
          ))}
        </div>

        {/* =========== PASO 1: BÚSQUEDA DE TICKET =========== */}
        {returnStep === "search" && (
          <div>
            <p style={{ fontSize: "13px", color: "#475569", marginBottom: "14px" }}>
              Ingrese el folio de la venta original para iniciar el proceso de devolución.
            </p>
            <div style={inputGroup}>
              <label style={label}>Folio de Venta:</label>
              <input
                type="text"
                className="input-corporate"
                placeholder="V-XXXXXX"
                value={returnFolio}
                onChange={(e) => {
                  const value = validateFolioInput(e.target.value).toUpperCase();
                  setReturnFolio(value);
                  setReturnFieldErrors((prev) => {
                    const next = { ...prev };
                    const error = validateReference(value, "El folio de venta", { required: true, max: 40 });
                    if (error) next.folio = error;
                    else delete next.folio;
                    return next;
                  });
                }}
                onKeyDown={(e) => { if (e.key === "Enter") handleReturnSearch(); }}
                autoFocus
              />
              {returnFieldErrors.folio && <p style={fieldError}>{returnFieldErrors.folio}</p>}
            </div>
            <button
              onClick={handleReturnSearch}
              disabled={returnLoading}
              className="btn-primary"
              style={{ ...submitBtn, marginTop: "14px", width: "100%", opacity: returnLoading ? 0.7 : 1 }}
            >
              {returnLoading ? "Buscando..." : "Buscar Venta"}
            </button>
          </div>
        )}

        {/* =========== PASO 2: SELECCIÓN DE PRODUCTOS =========== */}
        {returnStep === "select" && returnSaleData && (
          <div>
            {/* Info de la venta */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "8px",
              backgroundColor: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: "8px",
              padding: "12px",
              marginBottom: "14px",
              fontSize: "12px",
            }} className="pos-cashier-grid-2">
              <div><strong>Folio:</strong> {returnSaleData.invoiceNumber}</div>
              <div><strong>Fecha:</strong> {new Date(returnSaleData.createdAt).toLocaleDateString()}</div>
              <div><strong>Cliente:</strong> {returnSaleData.customerName ? "Cliente registrado" : "Público general"}</div>
              <div><strong>Total:</strong> ${Number(returnSaleData.totalAmount).toFixed(2)}</div>
            </div>

            {/* Seleccionar todos */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <span style={{ fontSize: "12px", fontWeight: "700", color: "#334155" }}>Productos del ticket:</span>
              <button
                onClick={handleReturnSelectAll}
                style={{ fontSize: "11px", color: "#1e3a8a", background: "none", border: "none", cursor: "pointer", fontWeight: "600", textDecoration: "underline" }}
              >
                {returnItems.filter((it) => it.isEligible).every((it) => it.selected) ? "Deseleccionar todos" : "Seleccionar todos (Dev. Total)"}
              </button>
            </div>

            {/* Lista de productos */}
            <div style={{ maxHeight: "260px", overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: "8px" }}>
              {returnItems.map((item, idx) => (
                <div
                  key={item.saleDetailId}
                  style={{
                    padding: "10px 12px",
                    borderBottom: idx < returnItems.length - 1 ? "1px solid #f1f5f9" : "none",
                    backgroundColor: item.selected ? "#eff6ff" : "transparent",
                    opacity: item.isEligible ? 1 : 0.5,
                    transition: "background-color 0.2s",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }} className="pos-cashier-return-item">
                    <input
                      type="checkbox"
                      checked={item.selected}
                      disabled={!item.isEligible}
                      onChange={() => handleReturnToggleItem(idx)}
                      style={{ accentColor: "#1e3a8a", width: "16px", height: "16px" }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: "600", fontSize: "13px", color: "#0f172a" }}>{item.name}</div>
                      <div style={{ fontSize: "10px", color: "#64748b" }}>
                        SKU: {item.sku} | Comprado: {item.originalQuantity} | Devuelto prev.: {item.alreadyReturnedQty} | Disponible: {item.maxReturnableQty}
                      </div>
                      {!item.isEligible && (
                        <div style={{ fontSize: "10px", color: "#dc2626", fontWeight: "600", marginTop: "2px" }}>
                          {!item.isReturnable ? "Producto no admite devolución" : !item.inWindow ? `Fuera de ventana (${item.returnWindowDays} días)` : "Sin cantidad disponible"}
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign: "right", fontSize: "12px", fontWeight: "700", color: "#0f172a" }}>
                      ${item.netUnitPrice.toFixed(2)}
                      <div style={{ fontSize: "9px", color: "#94a3b8", fontWeight: "400" }}>c/u neto</div>
                    </div>
                  </div>

                  {/* Controles de cantidad y destino */}
                  {item.selected && (
                    <div style={{ marginTop: "8px", paddingLeft: "26px", display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <label style={{ fontSize: "11px", color: "#475569", fontWeight: "600" }}>Cant:</label>
                        <button
                          onClick={() => handleReturnQtyChange(idx, item.qtyToReturn - 1)}
                          style={{ width: "24px", height: "24px", border: "1px solid #cbd5e1", borderRadius: "4px", backgroundColor: "#f8fafc", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                        ><Minus size={12} /></button>
                        <input
                          type="number"
                          min={0}
                          max={item.maxReturnableQty}
                          value={item.qtyToReturn}
                          onChange={(e) => {
                            const raw = (e.target.value || "").toString().replace(/[^0-9]/g, "");
                            const parsed = Math.max(0, parseInt(raw || "0", 10));
                            const val = Math.min(item.maxReturnableQty, parsed);
                            handleReturnQtyChange(idx, val);
                          }}
                          style={{ fontSize: "13px", fontWeight: "700", width: "50px", textAlign: "center", border: "1px solid #cbd5e1", borderRadius: "4px", padding: "4px" }}
                        />
                        <button
                          onClick={() => handleReturnQtyChange(idx, item.qtyToReturn + 1)}
                          style={{ width: "24px", height: "24px", border: "1px solid #cbd5e1", borderRadius: "4px", backgroundColor: "#f8fafc", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                        ><Plus size={12} /></button>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <label style={{ fontSize: "11px", color: "#475569", fontWeight: "600" }}>Destino:</label>
                        <select
                          value={item.destination}
                          onChange={(e) => handleReturnDestinationChange(idx, e.target.value)}
                          style={{ fontSize: "11px", padding: "3px 6px", borderRadius: "4px", border: "1px solid #cbd5e1", backgroundColor: "#ffffff" }}
                        >
                          <option value="INVENTARIO_VENDIBLE">Inventario Vendible</option>
                          <option value="MERMA">Merma</option>
                          <option value="GARANTIA">Garantía</option>
                          <option value="REPARACION">Reparación</option>
                          <option value="PROVEEDOR">Proveedor</option>
                        </select>
                      </div>
                      {item.trackingType === "SERIAL" && (
                        <input
                          type="text"
                          placeholder="No. Serie"
                          value={item.serialNumberInput}
                          onChange={(e) => {
                            const val = e.target.value;
                            setReturnItems((prev) => prev.map((it, i) => i === idx ? { ...it, serialNumberInput: val } : it));
                          }}
                          style={{ fontSize: "11px", padding: "3px 6px", borderRadius: "4px", border: "1px solid #cbd5e1", width: "110px" }}
                        />
                      )}
                      {item.trackingType === "LOT" && (
                        <input
                          type="text"
                          placeholder="No. Lote"
                          value={item.batchNumberInput}
                          onChange={(e) => {
                            const val = e.target.value;
                            setReturnItems((prev) => prev.map((it, i) => i === idx ? { ...it, batchNumberInput: val } : it));
                          }}
                          style={{ fontSize: "11px", padding: "3px 6px", borderRadius: "4px", border: "1px solid #cbd5e1", width: "110px" }}
                        />
                      )}
                      <span style={{ fontSize: "11px", color: "#1e3a8a", fontWeight: "700", marginLeft: "auto" }}>
                        Reembolso: ${(item.netUnitPrice * item.qtyToReturn * 1.16).toFixed(2)}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Motivo y método de pago */}
            <div style={{ marginTop: "14px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }} className="pos-cashier-grid-2">
              <div style={inputGroup}>
                <label style={label}>Motivo de devolución:</label>
                <input
                  type="text"
                  className="input-corporate"
                  placeholder="Ej: Producto defectuoso, talla incorrecta..."
                  value={returnReason}
                  onChange={(e) => {
                    const value = validateMotivoDevoluccion(e.target.value);
                    setReturnReason(value);
                    setReturnFieldErrors((prev) => {
                      const next = { ...prev };
                      const error = validateReference(value, "El motivo", { required: true, max: 180 });
                      if (error) next.reason = error;
                      else delete next.reason;
                      return next;
                    });
                  }}
                />
                {returnFieldErrors.reason && <p style={fieldError}>{returnFieldErrors.reason}</p>}
              </div>
              <div style={inputGroup}>
                <label style={label}>Método de reembolso:</label>
                <select
                  className="input-corporate"
                  value={returnPaymentMethod}
                  onChange={(e) => setReturnPaymentMethod(e.target.value)}
                >
                  <option value="EFECTIVO">Efectivo</option>
                  <option value="TARJETA">Tarjeta</option>
                  <option value="QR_MERCADOPAGO">Mercado Pago</option>
                  <option value="VALE_DEVOLUCION">Vale de Devolución</option>
                </select>
              </div>
            </div>

            {/* Resumen y acción */}
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: "14px",
              padding: "10px 14px",
              backgroundColor: "#f0fdf4",
              border: "1px solid #bbf7d0",
              borderRadius: "8px",
            }}>
              <div>
                <div style={{ fontSize: "11px", color: "#166534", fontWeight: "600" }}>TOTAL A REEMBOLSAR (IVA incluido)</div>
                <div style={{ fontSize: "20px", fontWeight: "800", color: "#166534" }}>${getReturnRefundTotal().toFixed(2)}</div>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button onClick={() => { setReturnStep("search"); setReturnSaleData(null); setReturnItems([]); }} style={{ ...modalBtn, backgroundColor: "#64748b", color: "white" }}>
                  ← Atrás
                </button>
                <button onClick={handleReturnProceed} className="btn-primary" style={{ ...modalBtn, backgroundColor: "#1e3a8a", color: "white" }}>
                  Continuar →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* =========== PASO 3: CONFIRMACIÓN Y PIN =========== */}
        {returnStep === "confirm" && (
          <div>
            <p style={{ fontSize: "13px", color: "#475569", marginBottom: "14px" }}>
              Revise el resumen de la devolución e ingrese el PIN de autorización del supervisor.
            </p>

            {/* Resumen de artículos seleccionados */}
            <div style={{ border: "1px solid #e2e8f0", borderRadius: "8px", overflow: "hidden", marginBottom: "14px" }}>
              <div style={{ backgroundColor: "#f8fafc", padding: "8px 12px", fontSize: "11px", fontWeight: "700", color: "#334155", borderBottom: "1px solid #e2e8f0" }}>
                ARTÍCULOS A DEVOLVER
              </div>
              {returnItems.filter((it) => it.selected && it.qtyToReturn > 0).map((item) => (
                <div key={item.saleDetailId} style={{ padding: "8px 12px", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
                  <div>
                    <span style={{ fontWeight: "600" }}>{item.name}</span>
                    <span style={{ color: "#64748b" }}> × {item.qtyToReturn}</span>
                    <span style={{ color: "#94a3b8", marginLeft: "8px", fontSize: "10px" }}>→ {item.destination.replace("_", " ")}</span>
                  </div>
                  <span style={{ fontWeight: "700" }}>${(item.netUnitPrice * item.qtyToReturn * 1.16).toFixed(2)}</span>
                </div>
              ))}
              <div style={{ padding: "10px 12px", backgroundColor: "#f0fdf4", display: "flex", justifyContent: "space-between", fontWeight: "800", fontSize: "14px", color: "#166534" }}>
                <span>TOTAL REEMBOLSO</span>
                <span>${getReturnRefundTotal().toFixed(2)}</span>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "14px" }} className="pos-cashier-grid-2">
              <div style={inputGroup}>
                <label style={label}>Motivo:</label>
                <div style={{ fontSize: "12px", fontWeight: "600", color: "#0f172a", padding: "6px 0" }}>{returnReason}</div>
              </div>
              <div style={inputGroup}>
                <label style={label}>Reembolso vía:</label>
                <div style={{ fontSize: "12px", fontWeight: "600", color: "#0f172a", padding: "6px 0" }}>{returnPaymentMethod.replace("_", " ")}</div>
              </div>
            </div>

            {/* PIN de autorización */}
            <div style={{ backgroundColor: "#fffbeb", border: "1px solid #fef3c7", borderRadius: "8px", padding: "12px 14px", marginBottom: "14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <KeyRound size={16} color="#d97706" />
                  <span style={{ fontSize: "12px", fontWeight: "700", color: "#92400e" }}>Autorización de Supervisor</span>
                </div>
                {returnPinAttempts > 0 && (
                  <span style={{ fontSize: "11px", fontWeight: "600", color: "#dc2626" }}>
                    Intento {returnPinAttempts}/3
                  </span>
                )}
              </div>
              <input
                type="password"
                className="input-corporate"
                placeholder="Ingrese PIN de Gerente/Admin"
                value={returnPin}
                onChange={(e) => {
                  const value = normalizeIntegerInput(e.target.value).slice(0, 4);
                  setReturnPin(value);
                  setReturnFieldErrors((prev) => {
                    const next = { ...prev };
                    const error = validateInteger(value, "El PIN", { min: 0 });
                    if (error || value.length !== 4) next.pin = "El PIN debe contener 4 digitos.";
                    else delete next.pin;
                    return next;
                  });
                }}
                onKeyDown={(e) => { if (e.key === "Enter") handleReturnProcess(); }}
                style={{ textAlign: "center", letterSpacing: "8px", fontSize: "18px", fontWeight: "700" }}
              />
              {returnFieldErrors.pin && <p style={fieldError}>{returnFieldErrors.pin}</p>}
            </div>

            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={() => setReturnStep("select")} style={{ ...submitBtn, backgroundColor: "#64748b", flex: 1 }}>
                ← Atrás
              </button>
              <button
                onClick={handleReturnProcess}
                disabled={returnProcessing}
                className="btn-primary"
                style={{ ...submitBtn, backgroundColor: "#dc2626", flex: 2, opacity: returnProcessing ? 0.7 : 1 }}
              >
                {returnProcessing ? "Procesando Devolución..." : "PROCESAR DEVOLUCIÓN"}
              </button>
            </div>
          </div>
        )}

        {/* =========== PASO 4: RECIBO DE DEVOLUCIÓN =========== */}
        {returnStep === "receipt" && returnReceipt && (
          <div>
            <div style={{ textAlign: "center", padding: "20px", backgroundColor: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "10px", marginBottom: "16px" }}>
              <div style={{ fontSize: "36px", marginBottom: "4px" }}>✅</div>
              <h4 style={{ fontSize: "16px", fontWeight: "800", color: "#166534", margin: "0 0 4px 0" }}>Devolución Exitosa</h4>
              <p style={{ fontSize: "12px", color: "#166534", margin: 0 }}>La devolución fue procesada correctamente.</p>
            </div>

            <div style={{ border: "1px solid #e2e8f0", borderRadius: "8px", overflow: "hidden", marginBottom: "14px" }}>
              <div style={{ padding: "10px 14px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
                <span style={{ color: "#64748b" }}>Folio Devolución:</span>
                <span style={{ fontWeight: "700", color: "#0f172a" }}>{returnReceipt.returnNumber}</span>
              </div>
              <div style={{ padding: "10px 14px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
                <span style={{ color: "#64748b" }}>Total Reembolsado:</span>
                <span style={{ fontWeight: "700", color: "#166534", fontSize: "16px" }}>${Number(returnReceipt.totalRefunded).toFixed(2)}</span>
              </div>
              {returnReceipt.storeCreditCode && (
                <div style={{ padding: "10px 14px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
                  <span style={{ color: "#64748b" }}>Código de Vale:</span>
                  <span style={{ fontWeight: "700", color: "#7c3aed", fontSize: "14px", letterSpacing: "1px" }}>{returnReceipt.storeCreditCode}</span>
                </div>
              )}
              {returnReceipt.cfdiUuid && (
                <div style={{ padding: "10px 14px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
                  <span style={{ color: "#64748b" }}>Nota de Crédito SAT:</span>
                  <span style={{ fontWeight: "600", color: "#0d9488", fontSize: "10px" }}>{returnReceipt.cfdiUuid}</span>
                </div>
              )}
              {returnReceipt.exchangeSaleInvoice && (
                <div style={{ padding: "10px 14px", display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
                  <span style={{ color: "#64748b" }}>Cambio de Producto (nueva venta):</span>
                  <span style={{ fontWeight: "700", color: "#1e3a8a" }}>{returnReceipt.exchangeSaleInvoice}</span>
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: "10px" }} className="pos-cashier-modal-actions">
              <button
                onClick={() => onOpenEmailModal({
                  subject: `Comprobante de devolución ${returnReceipt.returnNumber}`,
                  htmlContent: buildReturnReceiptHtml(),
                  defaultEmail: returnSaleData?.customerEmail || null,
                })}
                style={{ ...submitBtn, flex: 1, backgroundColor: "#0369a1" }}
              >
                Enviar por Email
              </button>
              <button
                onClick={() => { handleReturnReset(); onClose(); }}
                className="btn-primary"
                style={{ ...submitBtn, flex: 1, backgroundColor: "#1e3a8a" }}
              >
                Cerrar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
