import React from "react";
import { Receipt } from "lucide-react";
import { PosModal } from "./shared";

interface TicketViewModalProps {
  isOpen: boolean;
  selectedSale: any;
  user: any;
  ticketEmailModalOpen: boolean;
  onClose: () => void;
  onPrint: () => void;
  actionButtons: React.ReactNode;
}

const calculateItemPromotion = (item: { product: any; quantity: number }) => {
  const promo = item.product.activePromotion;
  const originalPrice = item.product.sellPrice;
  const quantity = item.quantity;
  const subtotalOriginal = originalPrice * quantity;

  if (!promo) {
    return { finalPrice: originalPrice, discountAmount: 0, label: "" };
  }

  let discountAmount = 0;
  let finalPrice = originalPrice;

  const minQty = promo.minQuantity || 1;

  if (promo.type === "Percentage") {
    if (quantity >= minQty) {
      const val = promo.value || 0;
      const discountPerUnit = originalPrice * (val / 100);
      discountAmount = discountPerUnit * quantity;
      finalPrice = originalPrice - discountPerUnit;
    }
  } else if (promo.type === "FixedAmount") {
    if (quantity >= minQty) {
      const val = promo.value || 0;
      discountAmount = val * quantity;
      finalPrice = Math.max(0, originalPrice - val);
    }
  } else if (promo.type === "BuyXPayY") {
    const x = promo.minQuantity || 1;
    const y = promo.payQuantity || 1;
    if (quantity >= x) {
      const groups = Math.floor(quantity / x);
      const remainder = quantity % x;
      const paidUnits = (groups * y) + remainder;
      const lineCost = paidUnits * originalPrice;
      discountAmount = subtotalOriginal - lineCost;
      finalPrice = lineCost / quantity;
    }
  } else if (promo.type === "SpecialPrice") {
    const special = promo.specialPrice || originalPrice;
    if (quantity >= minQty) {
      finalPrice = special;
      discountAmount = (originalPrice - special) * quantity;
    }
  }

  const promoApplied = discountAmount > 0;
  return { finalPrice, discountAmount, label: promoApplied ? promo.name : "", promoApplied };
};



const ticketContainer: React.CSSProperties = {
  boxSizing: "border-box",
  width: "80mm",
  maxWidth: "80mm",
  margin: "0 auto",
  padding: "10px 12px",
  border: "1px solid #d4d4d4",
  borderRadius: "4px",
  backgroundColor: "var(--surface)",
  color: "#111111",
  fontFamily: '"Courier New", monospace',
  fontSize: "10px",
  lineHeight: "1.25",
  maxHeight: "55vh",
  overflowY: "auto",
};

export default function TicketViewModal({
  isOpen,
  selectedSale,
  user,
  ticketEmailModalOpen,
  onClose,
  onPrint,
  actionButtons,
}: TicketViewModalProps) {
  if (!isOpen || !selectedSale) return null;

  const renderFooter = () => (
    <div style={{ display: "flex", justifyContent: "center", gap: "12px", width: "100%" }}>
      {actionButtons}
    </div>
  );

  return (
    <PosModal
        isOpen={isOpen}
        onClose={onClose}
        title="Ticket de Venta"
        subtitle="Visualización y opciones del ticket."
        icon={<Receipt size={24} />}
        iconColor="#2563eb"
        size="md"
        footer={renderFooter()}
      >
        <div style={{ display: "flex", justifyContent: "center" }}>
          <div id="print-area" style={ticketContainer} className="ticket-print pos-paper">
            {selectedSale.status === "CANCELADA" && (
              <div style={{
                textAlign: "center",
                color: "#dc2626",
                fontWeight: "900",
                fontSize: "16px",
                border: "2px solid #dc2626",
                padding: "4px",
                marginBottom: "12px",
                borderRadius: "4px",
                textTransform: "uppercase"
              }}>
                *** CANCELADO ***
              </div>
            )}
            {selectedSale.status === "PENDIENTE" && (
              <div style={{
                textAlign: "center",
                color: "#d97706",
                fontWeight: "900",
                fontSize: "16px",
                border: "2px solid #d97706",
                padding: "4px",
                marginBottom: "12px",
                borderRadius: "4px",
                textTransform: "uppercase",
                backgroundColor: "#fffbeb"
              }}>
                *** PAGO PENDIENTE ***
              </div>
            )}
            {selectedSale.totalRefunded > 0 && Number(selectedSale.totalRefunded).toFixed(2) === Number(selectedSale.total).toFixed(2) && (
              <div style={{
                textAlign: "center",
                color: "#dc2626",
                fontWeight: "900",
                fontSize: "15px",
                border: "2px solid #dc2626",
                padding: "4px",
                marginBottom: "12px",
                borderRadius: "4px",
                textTransform: "uppercase",
                backgroundColor: "#fef2f2"
              }}>
                *** DEVOLUCIÓN TOTAL ***
              </div>
            )}
            {selectedSale.totalRefunded > 0 && Number(selectedSale.totalRefunded).toFixed(2) !== Number(selectedSale.total).toFixed(2) && (
              <div style={{
                textAlign: "center",
                color: "#d97706",
                fontWeight: "900",
                fontSize: "14px",
                border: "2px solid #d97706",
                padding: "4px",
                marginBottom: "12px",
                borderRadius: "4px",
                textTransform: "uppercase",
                backgroundColor: "#fffbeb"
              }}>
                *** DEVOLUCIÓN PARCIAL ***
              </div>
            )}
            <div style={{ textAlign: "center", marginBottom: "14px" }}>
              <h4 style={{ textTransform: "uppercase", fontWeight: "800", margin: "0 0 4px 0", fontSize: "14px" }}>LYFRGL</h4>
              <p style={{ fontSize: "11px", color: "var(--text-secondary)" }}>SUCURSAL: {user?.branch.name}</p>
              {user?.branch?.phone && <p style={{ fontSize: "10px", color: "var(--text-muted)" }}>TEL: {user.branch.phone}</p>}
              {user?.branch?.address && <p style={{ fontSize: "10px", color: "var(--text-muted)" }}>{user.branch.address}</p>}
            </div>

            <div style={{ borderBottom: "1px dashed #cbd5e1", paddingBottom: "8px", marginBottom: "8px", fontSize: "11px" }}>
              <p><strong>Folio:</strong> {selectedSale.invoiceNumber}</p>
              <p><strong>Fecha:</strong> {new Date(selectedSale.createdAt).toLocaleDateString()}</p>
              <p><strong>Hora:</strong> {new Date(selectedSale.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
              <p><strong>Cajero:</strong> {user?.name}</p>
              <p><strong>Artículos:</strong> {selectedSale.items.reduce((sum: number, item: any) => sum + item.quantity, 0)}</p>
            </div>

            {selectedSale.status === "CANCELADA" && (
              <div style={{ textAlign: "center", padding: "6px", borderTop: "2px dashed #dc2626", borderBottom: "2px dashed #dc2626", marginBottom: "10px", color: "#dc2626", fontWeight: "bold" }}>
                <h4 style={{ margin: 0, fontSize: "14px" }}>*** CANCELADO ***</h4>
                {selectedSale.refundStatus && (
                  <p style={{ margin: "4px 0 0 0", fontSize: "10px" }}>
                    REEMBOLSO {selectedSale.refundStatus === "APPROVED" ? "REALIZADO" : "PENDIENTE"}
                  </p>
                )}
              </div>
            )}

            <table style={{ width: "100%", fontSize: "10px", borderCollapse: "collapse", marginBottom: "8px", tableLayout: "fixed" }}>
              <thead>
                <tr style={{ borderBottom: "1px dashed #111111" }}>
                  <th style={{ textAlign: "left", paddingBottom: "4px", width: "12%" }}>Cant</th>
                  <th style={{ textAlign: "left", paddingBottom: "4px", width: "43%" }}>Descripción</th>
                  <th style={{ textAlign: "right", paddingBottom: "4px", width: "20%" }}>P. Unit</th>
                  <th style={{ textAlign: "right", paddingBottom: "4px", width: "25%" }}>Importe</th>
                </tr>
              </thead>
              <tbody>
                {selectedSale.items.map((item: any, idx: number) => {
                  const promoDetails = selectedSale.isNewSale === false
                    ? {
                        finalPrice: Number(item.product.sellPrice) - (Number(item.discountAmount || 0) / item.quantity),
                        discountAmount: Number(item.discountAmount || 0),
                        label: item.product.activePromotion?.name || ""
                      }
                    : calculateItemPromotion(item);
                  const hasDiscount = promoDetails.discountAmount > 0;
                  return (
                    <tr key={idx}>
                      <td style={{ textAlign: "left", padding: "4px 2px 4px 0", whiteSpace: "nowrap" }}>{item.quantity}</td>
                      <td style={{ padding: "4px 4px 4px 0" }}>
                        <div>{item.product.name}</div>
                        {item.product.activePromotion && (
                          <div style={{ fontSize: "9px", color: "#1e40af", fontWeight: "600" }}>
                            ({item.product.activePromotion.name})
                          </div>
                        )}
                        {item.returnedQuantity > 0 && (
                          <div style={{ fontSize: "9px", color: "#dc2626", fontWeight: "700", marginTop: "2px" }}>
                            ↳ Devuelto: {item.returnedQuantity} ud{item.returnedQuantity > 1 ? 's' : ''}
                          </div>
                        )}
                        {(item.taxes || item.taxDetail) && (item.taxes?.length > 0 || item.taxDetail?.length > 0) && (
                          <div style={{ fontSize: "9px", color: "var(--text-muted)", fontStyle: "italic", marginTop: "2px" }}>
                            {(item.taxes || item.taxDetail).map((t: any) => `${t.name}: $${Number(t.amount).toFixed(2)}`).join(" | ")}
                          </div>
                        )}
                      </td>
                      <td style={{ textAlign: "right", padding: "4px 4px 4px 0", whiteSpace: "nowrap" }}>
                        ${Number(item.product.sellPrice).toFixed(2)}
                      </td>
                      <td style={{ textAlign: "right", padding: "4px 0", whiteSpace: "nowrap" }}>
                        {hasDiscount ? (
                          <>
                            <span style={{ textDecoration: "line-through", color: "var(--text-faint)", marginRight: "4px", fontSize: "10px" }}>
                              ${(item.product.sellPrice * item.quantity).toFixed(2)}
                            </span>
                            <span>
                              ${(promoDetails.finalPrice * item.quantity).toFixed(2)}
                            </span>
                          </>
                        ) : (
                          `$${(item.product.sellPrice * item.quantity).toFixed(2)}`
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div style={{ borderTop: "1px dashed #cbd5e1", paddingTop: "8px", display: "flex", flexDirection: "column", gap: "4px", fontSize: "11px" }}>
              {selectedSale.discountAmount > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", color: "#059669", fontWeight: "700" }}>
                  <span>Descuento Promos:</span>
                  <span>-${Number(selectedSale.discountAmount).toFixed(2)}</span>
                </div>
              )}
              {selectedSale.pointsDiscount > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", color: "#059669", fontWeight: "700" }}>
                  <span>Descuento Puntos:</span>
                  <span>-${Number(selectedSale.pointsDiscount).toFixed(2)}</span>
                </div>
              )}
              {((Number(selectedSale.discountAmount || 0) + Number(selectedSale.pointsDiscount || 0)) > 0) && (
                <div style={{ display: "flex", justifyContent: "space-between", color: "#166534", fontWeight: "800", backgroundColor: "#f0fdf4", padding: "4px 6px", borderRadius: "4px", margin: "2px 0" }}>
                  <span>¡TU AHORRO TOTAL!:</span>
                  <span>${(Number(selectedSale.discountAmount || 0) + Number(selectedSale.pointsDiscount || 0)).toFixed(2)}</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Subtotal:</span>
                <span>${selectedSale.subtotal.toFixed(2)}</span>
              </div>
              {selectedSale.taxBreakdown && selectedSale.taxBreakdown.length > 0 ? (
                selectedSale.taxBreakdown
                  .filter((tb: any) => Number(tb.amount) > 0)
                  .map((tb: any, i: number) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>{tb.name}:</span>
                      <span>${Number(tb.amount).toFixed(2)}</span>
                    </div>
                  ))
              ) : (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>IVA (16%):</span>
                  <span>${selectedSale.tax.toFixed(2)}</span>
                </div>
              )}
              {selectedSale.taxBreakdown && selectedSale.taxBreakdown.length > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontStyle: "italic", color: "var(--text-muted)" }}>
                  <span>Total Impuestos:</span>
                  <span>${selectedSale.tax.toFixed(2)}</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "800", fontSize: "12px" }}>
                <span>TOTAL:</span>
                <span>${selectedSale.total.toFixed(2)}</span>
              </div>
              {selectedSale.totalRefunded > 0 && (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", color: "#dc2626", fontWeight: "700", borderTop: "1px dashed #dc2626", paddingTop: "4px", marginTop: "4px" }}>
                    <span>Total Devuelto:</span>
                    <span>-${Number(selectedSale.totalRefunded).toFixed(2)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text)", fontWeight: "800", backgroundColor: "#fef2f2", padding: "4px 6px", borderRadius: "4px", margin: "2px 0" }}>
                    <span>Neto Final:</span>
                    <span>${(Number(selectedSale.total) - Number(selectedSale.totalRefunded)).toFixed(2)}</span>
                  </div>
                </>
              )}
            </div>

            <div style={{ borderTop: "1px solid var(--border-strong)", marginTop: "8px", paddingTop: "8px", fontSize: "11px" }}>
              <p>
                <strong>Método de pago:</strong> {selectedSale.paymentMethod}
                {selectedSale.cardType && ` (${selectedSale.cardType})`}
              </p>
              {selectedSale.paymentMethod === "EFECTIVO" && (
                <>
                  <p><strong>Pagó con:</strong> ${selectedSale.cashReceived.toFixed(2)}</p>
                  <p><strong>Cambio:</strong> ${selectedSale.changeGiven.toFixed(2)}</p>
                </>
              )}
              {selectedSale.paymentMethod === "MIXTO" && (
                <>
                  <p><strong>Efectivo:</strong> ${selectedSale.cashReceived.toFixed(2)}</p>
                  <p><strong>Tarjeta:</strong> ${(selectedSale.total - (selectedSale.cashReceived - selectedSale.changeGiven)).toFixed(2)}</p>
                  <p><strong>Cambio:</strong> ${selectedSale.changeGiven.toFixed(2)}</p>
                </>
              )}
              <div style={{ borderTop: "1px dashed #cbd5e1", marginTop: "6px", paddingTop: "6px", fontSize: "10px" }}>
                <p><strong>Cliente:</strong> {selectedSale.customerName ? "Cliente registrado" : "Público general"}</p>
                {selectedSale.customerName && (
                  <>
                    {selectedSale.pointsEarned > 0 && <p><strong>Puntos Ganados:</strong> +{selectedSale.pointsEarned}</p>}
                    {selectedSale.pointsRedeemed > 0 && <p><strong>Puntos Canjeados:</strong> -{selectedSale.pointsRedeemed} (-${Number(selectedSale.pointsDiscount).toFixed(2)} MXN)</p>}
                    <p><strong>Saldo Nuevo:</strong> {selectedSale.customerPoints} pts</p>
                  </>
                )}
              </div>
            </div>

            <div style={{ borderTop: "1px dashed #cbd5e1", marginTop: "12px", paddingTop: "8px", fontSize: "9px", textAlign: "center", color: "var(--text-muted)", lineHeight: "1.4", display: "flex", flexDirection: "column", alignItems: "center" }}>
              <p>Portal de Autofacturación:</p>
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(window.location.origin + "/autofacturacion")}`}
                alt="QR Facturación"
                style={{ width: "100px", height: "100px", marginTop: "6px", marginBottom: "6px" }}
              />
              <p style={{ fontWeight: "700", wordBreak: "break-all" }}>{window.location.origin + "/autofacturacion"}</p>
              <p>Escanea el código QR para facturar tu compra</p>
            </div>

            <div style={{ textAlign: "center", marginTop: "20px", fontSize: "10px", color: "var(--text-muted)" }}>
              <p>¡GRACIAS POR SU COMPRA!</p>
              <p>REGRESE PRONTO</p>
              <p style={{ marginTop: "12px", fontSize: "9px", fontWeight: "600", fontStyle: "italic", borderTop: "1px dashed #cbd5e1", paddingTop: "8px" }}>
                Para devoluciones y cancelaciones, es indispensable presentar este ticket original.
              </p>
            </div>
          </div>
        </div>
      </PosModal>
  );
}
