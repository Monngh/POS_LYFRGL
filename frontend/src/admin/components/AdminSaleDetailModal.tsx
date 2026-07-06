import React, { useEffect, useState } from "react";
import { Printer, X } from "lucide-react";
import api from "../../shared/services/api";
import {
  ui,
  Badge,
  moneyExact,
  fmtDate,
  fmtTime,
  statusTone,
  payTone,
  printTicketHtml,
} from "../views/shared";
import { useToast } from "../../shared/context/ToastContext";

interface SaleDetail {
  id: number;
  invoiceNumber: string;
  createdAt: string;
  branch: string;
  cajero: string;
  customer: string;
  paymentMethod: string;
  status: string;
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
  items: { sku: string; name: string; quantity: number; unitPrice: number; importe: number }[];
}

// Reimpresión: genera el ticket de la venta y abre el diálogo de impresión (copiado de VentasView.tsx)
const reprintTicket = (d: SaleDetail, showToast: any) => {
  const safe = (value: unknown) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  const body = `
    <div>
      <div class="ticket-header">
        <span class="ticket-store">LYFRGL POS</span>
        <span class="ticket-muted">Sucursal: ${safe(d.branch)}</span>
        <span class="ticket-operation">VENTA - REIMPRESION</span>
      </div>
      <div class="ticket-section">
        <div class="ticket-row"><span>Folio:</span><span class="ticket-value">${safe(d.invoiceNumber)}</span></div>
        <div class="ticket-row"><span>Fecha:</span><span class="ticket-value">${fmtDate(d.createdAt)} ${fmtTime(d.createdAt)}</span></div>
        <div class="ticket-row"><span>Cajero:</span><span class="ticket-value">${safe(d.cajero)}</span></div>
        <div class="ticket-row"><span>Cliente:</span><span class="ticket-value">${safe(d.customer || "Publico general")}</span></div>
        <div class="ticket-row"><span>Operacion:</span><span class="ticket-value">VENTA</span></div>
      </div>
      <div class="ticket-section">
        <table>
          <thead>
            <tr style="border-bottom:1px dashed #111111;">
              <th style="width:12%;text-align:left;padding-bottom:4px;">Cant</th>
              <th style="width:43%;text-align:left;padding-bottom:4px;">Descripcion</th>
              <th style="width:20%;text-align:right;padding-bottom:4px;">P.Unit</th>
              <th style="width:25%;text-align:right;padding-bottom:4px;">Importe</th>
            </tr>
          </thead>
          <tbody>
            ${d.items.map((it) => `
              <tr>
                <td style="text-align:left;padding:3px 2px 3px 0;">${Number(it.quantity)}</td>
                <td style="padding:3px 4px 3px 0;">${safe(it.name)}</td>
                <td style="text-align:right;padding:3px 4px 3px 0;">${moneyExact(it.unitPrice)}</td>
                <td style="text-align:right;padding:3px 0;">${moneyExact(it.importe)}</td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>
      <div class="ticket-section">
        <div class="ticket-row"><span>Subtotal:</span><span class="ticket-value">${moneyExact(d.subtotal)}</span></div>
        ${d.discountAmount > 0 ? `<div class="ticket-row"><span>Descuento:</span><span class="ticket-value">- ${moneyExact(d.discountAmount)}</span></div>` : ""}
        <div class="ticket-row"><span>Impuestos:</span><span class="ticket-value">${moneyExact(d.taxAmount)}</span></div>
        <div class="ticket-row ticket-total"><span>TOTAL:</span><span>${moneyExact(d.totalAmount)}</span></div>
        <div class="ticket-row"><span>Metodo pago:</span><span class="ticket-value">${safe(d.paymentMethod)}</span></div>
        <div class="ticket-row"><span>Estado:</span><span class="ticket-value">${safe(d.status)}</span></div>
      </div>
      <div class="ticket-footer">
        <p>GRACIAS POR SU COMPRA</p>
        <p>REGRESE PRONTO</p>
      </div>
    </div>
  `;
  printTicketHtml(`Ticket ${d.invoiceNumber}`, body, showToast);
};

const Info: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div>
    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.4px" }}>
      {label}
    </div>
    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", marginTop: 3 }}>{value}</div>
  </div>
);

const Row: React.FC<{ label: string; value: string; strong?: boolean }> = ({ label, value, strong }) => (
  <div style={{ display: "flex", justifyContent: "space-between", fontSize: strong ? 16 : 13 }}>
    <span style={{ color: strong ? "var(--text)" : "#64748b", fontWeight: strong ? 800 : 500 }}>{label}</span>
    <span style={{ color: strong ? "#1e3a8a" : "var(--text-secondary)", fontWeight: strong ? 800 : 700 }}>{value}</span>
  </div>
);

interface AdminSaleDetailModalProps {
  saleId: number | null;
  onClose: () => void;
}

// Ventana de detalle de venta invocada desde EmpleadosView; estructura visual clonada de
// VentasView.tsx (modal "Detalle de Venta") — se mantiene independiente para no arriesgar
// regresiones en esa vista. z-index explícito por encima del modal de empleado (ActionModal, 1000).
const AdminSaleDetailModal: React.FC<AdminSaleDetailModalProps> = ({ saleId, onClose }) => {
  const { showToast } = useToast();
  const [detail, setDetail] = useState<SaleDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (saleId == null) {
      setDetail(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setDetail(null);
    api
      .get<{ sale: SaleDetail }>(`/api/admin/sales/${saleId}`)
      .then((res) => {
        if (!cancelled) setDetail(res.data.sale);
      })
      .catch(() => {
        if (!cancelled) setDetail(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [saleId]);

  if (saleId == null) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1100,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--surface)",
          borderRadius: "8px",
          padding: "24px",
          maxWidth: 600,
          width: "90%",
          boxShadow: "0 20px 25px rgba(0,0,0,0.15)",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "16px",
            paddingBottom: "12px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <h2 style={{ margin: 0, fontSize: "18px", color: "var(--text)" }}>
            {loading ? "Cargando venta..." : `Venta ${detail?.invoiceNumber ?? ""}`}
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              padding: 4,
              color: "var(--text-muted)",
            }}
          >
            <X size={20} />
          </button>
        </div>

        {loading && (
          <div style={{ textAlign: "center", padding: "30px", color: "var(--text-faint)" }}>Cargando venta...</div>
        )}

        {!loading && !detail && (
          <div style={{ textAlign: "center", padding: "30px", color: "var(--text-faint)" }}>No se pudo cargar la venta.</div>
        )}

        {detail && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
              <Info label="Fecha" value={`${fmtDate(detail.createdAt)} ${fmtTime(detail.createdAt)}`} />
              <Info label="Estado" value={<Badge tone={statusTone(detail.status)}>{detail.status}</Badge>} />
              <Info label="Sucursal" value={detail.branch} />
              <Info label="Cajero" value={detail.cajero} />
              <Info label="Cliente" value={detail.customer} />
              <Info label="Método" value={<Badge tone={payTone(detail.paymentMethod)}>{detail.paymentMethod}</Badge>} />
            </div>

            <div style={{ ...ui.tableWrap, boxShadow: "none", marginBottom: 14, overflowX: "hidden" }}>
              <table style={{ ...ui.table, minWidth: "unset", width: "100%" }}>
                <thead>
                  <tr style={ui.theadRow}>
                    <th style={{ ...ui.th, width: "50%" }}>Producto</th>
                    <th style={{ ...ui.th, textAlign: "center", width: "15%" }}>Cant</th>
                    <th style={{ ...ui.th, textAlign: "right", width: "17%" }}>P. unit.</th>
                    <th style={{ ...ui.th, textAlign: "right", width: "18%" }}>Importe</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.items.map((it, i) => (
                    <tr key={i}>
                      <td style={ui.td}>
                        <div style={{ fontWeight: 600 }}>{it.name}</div>
                        <div style={{ fontSize: 11, color: "var(--text-faint)" }}>{it.sku}</div>
                      </td>
                      <td style={{ ...ui.td, textAlign: "center" }}>{it.quantity}</td>
                      <td style={{ ...ui.td, textAlign: "right", color: "var(--text-muted)" }}>{moneyExact(it.unitPrice)}</td>
                      <td style={{ ...ui.td, textAlign: "right", fontWeight: 700 }}>{moneyExact(it.importe)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <Row label="Subtotal" value={moneyExact(detail.subtotal)} />
              {detail.discountAmount > 0 && <Row label="Descuento" value={`- ${moneyExact(detail.discountAmount)}`} />}
              <Row label="IVA (16%)" value={moneyExact(detail.taxAmount)} />
              <div style={{ borderTop: "1px solid var(--border)", marginTop: 4, paddingTop: 8 }}>
                <Row label="Total" value={moneyExact(detail.totalAmount)} strong />
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", marginTop: 20 }}>
              <button style={ui.primaryBtn} className="active-tap" onClick={() => reprintTicket(detail, showToast)}>
                <Printer size={15} /> Reimprimir ticket
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AdminSaleDetailModal;
