import React, { useEffect, useState, useCallback } from "react";
import { useAuth } from "../../context/AuthContext";
import api from "../../services/api";
import {
  ui,
  type ViewProps,
  Toolbar,
  FilterSelect,
  Badge,
  TableState,
  SectionHeader,
  money,
  fmtDate,
  fmtTime,
  fmtDateTime,
  statusTone,
  printHtml,
} from "./shared";

interface SessionRow {
  id: number;
  branch: string;
  cajero: string;
  openedAt: string;
  closedAt: string | null;
  initialAmount: number;
  cashIn: number;
  cashOut: number;
  expectedAmount: number;
  declaredAmount: number | null;
  difference: number | null;
  salesCount: number;
  status: string;
}

interface SessionDetail extends SessionRow {
  forceCloseReason: string | null;
  payBreakdown: {
    efectivo: number;
    tarjetaCredito: number;
    tarjetaDebito: number;
    mercadoPago: number;
    totalVentas: number;
  };
  movements: {
    id: number;
    date: string;
    type: string;
    description: string;
    amount: number;
    balance: number;
  }[];
}

const CajasView: React.FC<ViewProps> = ({ branchId, refreshToken }) => {
  const { user } = useAuth();

  const [rows, setRows] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [filterUserId, setFilterUserId] = useState("");
  const [employees, setEmployees] = useState<{ id: number; name: string }[]>([]);

  const [hoveredRow, setHoveredRow] = useState<number | null>(null);

  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedDetail, setSelectedDetail] = useState<SessionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [forceOpen, setForceOpen] = useState(false);
  const [forceReason, setForceReason] = useState("");
  const [forceLoading, setForceLoading] = useState(false);
  const [forceError, setForceError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {};
      if (branchId !== "all") params.branchId = branchId;
      if (status !== "all") params.status = status;
      if (from) params.from = from;
      if (to) params.to = to;
      if (filterUserId) params.userId = filterUserId;

      const res = await api.get<{ sessions: SessionRow[] }>("/api/admin/cash-sessions", { params });
      setRows(res.data.sessions);
    } catch (err: any) {
      setError(err.response?.data?.message || "No se pudieron cargar las sesiones de caja.");
    } finally {
      setLoading(false);
    }
  }, [branchId, status, from, to, filterUserId, refreshToken]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api
      .get<{ employees: { id: number; name: string }[] }>("/api/admin/employees")
      .then((res) => setEmployees(res.data.employees))
      .catch(() => setEmployees([]));
  }, []);

  const openDetail = async (id: number) => {
    setDetailOpen(true);
    setSelectedDetail(null);
    setDetailLoading(true);
    setDetailError(null);
    setForceOpen(false);
    setForceReason("");
    setForceError(null);
    try {
      const res = await api.get<{
        session: Omit<SessionDetail, "payBreakdown" | "movements">;
        payBreakdown: SessionDetail["payBreakdown"];
        movements: SessionDetail["movements"];
      }>(`/api/admin/cash-sessions/${id}`);
      setSelectedDetail({ ...res.data.session, payBreakdown: res.data.payBreakdown, movements: res.data.movements });
    } catch (err: any) {
      setDetailError(err.response?.data?.message || "No se pudieron cargar los detalles de la sesión.");
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setDetailOpen(false);
    setSelectedDetail(null);
    setForceOpen(false);
    setForceReason("");
    setForceError(null);
  };

  const handleForceClose = async () => {
    if (!selectedDetail || !forceReason.trim()) return;
    setForceLoading(true);
    setForceError(null);
    try {
      await api.put(`/api/admin/cash-sessions/${selectedDetail.id}/force-close`, {
        reason: forceReason.trim(),
        forcedBy: user?.id ?? 0,
      });
      closeDetail();
      load();
    } catch (err: any) {
      setForceError(err.response?.data?.message || "Error al cerrar la caja forzadamente.");
    } finally {
      setForceLoading(false);
    }
  };

  const printCashReport = () => {
    if (!selectedDetail) return;

    const d = selectedDetail;
    const diffColor = d.difference === null ? "#94a3b8" : d.difference >= 0 ? "#15803d" : "#b91c1c";
    const diffStr =
      d.difference !== null
        ? `${d.difference >= 0 ? "+" : ""}$${d.difference.toFixed(2)}`
        : "—";

    const body = `
      <div class="doc-header">
        <div>
          <div class="doc-brand">LYFRGL POS</div>
          <div class="doc-sub">Arqueo de Caja · Caja #${d.id}</div>
        </div>
        <div>
          <div class="doc-title">Cajero: ${d.cajero}</div>
          <div class="doc-meta">Sucursal: ${d.branch}</div>
          <div class="doc-meta">Estado: ${d.status}</div>
          <div class="doc-meta">Apertura: ${fmtDateTime(d.openedAt)}</div>
          ${d.closedAt ? `<div class="doc-meta">Cierre: ${fmtDateTime(d.closedAt)}</div>` : ""}
        </div>
      </div>

      <div class="kpis">
        <div class="kpi"><div class="l">Fondo inicial</div><div class="v">$${d.initialAmount.toFixed(2)}</div></div>
        <div class="kpi"><div class="l">Esperado</div><div class="v">$${d.expectedAmount.toFixed(2)}</div></div>
        <div class="kpi"><div class="l">Declarado</div><div class="v">${d.declaredAmount !== null ? "$" + d.declaredAmount.toFixed(2) : "—"}</div></div>
        <div class="kpi"><div class="l">Diferencia</div><div class="v" style="color:${diffColor}">${diffStr}</div></div>
      </div>

      <h3>Desglose financiero</h3>
      <table>
        <tr><td>Monto inicial (fondo)</td><td class="r">$${d.initialAmount.toFixed(2)}</td></tr>
        <tr><td>+ Ventas (efectivo neto)</td><td class="r">$${d.cashIn.toFixed(2)}</td></tr>
        <tr><td>− Depósitos (salidas)</td><td class="r">$${d.cashOut.toFixed(2)}</td></tr>
        <tr><td><strong>= Esperado (teórico)</strong></td><td class="r"><strong>$${d.expectedAmount.toFixed(2)}</strong></td></tr>
        <tr><td>Declarado (contado)</td><td class="r">${d.declaredAmount !== null ? "$" + d.declaredAmount.toFixed(2) : "—"}</td></tr>
        <tr><td><strong>Diferencia</strong></td><td class="r" style="color:${diffColor}"><strong>${diffStr}</strong></td></tr>
      </table>

      <h3>Por método de pago (ventas completadas)</h3>
      <table>
        <tr><td>Efectivo</td><td class="r">$${d.payBreakdown.efectivo.toFixed(2)}</td></tr>
        <tr><td>Tarjeta crédito</td><td class="r">$${d.payBreakdown.tarjetaCredito.toFixed(2)}</td></tr>
        <tr><td>Tarjeta débito</td><td class="r">$${d.payBreakdown.tarjetaDebito.toFixed(2)}</td></tr>
        <tr><td>MercadoPago QR</td><td class="r">$${d.payBreakdown.mercadoPago.toFixed(2)}</td></tr>
        <tr><td><strong>Total ventas</strong></td><td class="r"><strong>$${d.payBreakdown.totalVentas.toFixed(2)}</strong></td></tr>
      </table>

      <h3>Últimos movimientos (${d.movements.length})</h3>
      <table>
        <thead>
          <tr>
            <th>Fecha / Hora</th><th>Tipo</th><th>Descripción</th>
            <th class="r">Monto</th><th class="r">Saldo</th>
          </tr>
        </thead>
        <tbody>
          ${d.movements
        .map(
          (m) => `<tr>
                <td>${fmtDateTime(m.date)}</td>
                <td>${m.type}</td>
                <td>${m.description}</td>
                <td class="r" style="color:${m.amount >= 0 ? "#15803d" : "#b91c1c"}">${m.amount >= 0 ? "+" : ""}$${m.amount.toFixed(2)}</td>
                <td class="r">$${m.balance.toFixed(2)}</td>
              </tr>`
        )
        .join("")}
        </tbody>
      </table>
    `;

    printHtml(`Arqueo Caja #${d.id}`, body);
  };

  const openCount = rows.filter((r) => r.status === "ABIERTA").length;
  const diffColor = (d: number | null) =>
    d === null ? "#94a3b8" : d < 0 ? "#b91c1c" : d > 0 ? "#15803d" : "#334155";

  const movTypeColor = (type: string) =>
    type === "VENTA" ? "#15803d" : type === "CANCELACIÓN" ? "#b91c1c" : "#2563eb";

  return (
    <div>
      <SectionHeader title="Cajas" subtitle="Turnos y arqueos de caja registrados" />

      <Toolbar>
        <FilterSelect
          value={status}
          onChange={setStatus}
          options={[
            { value: "all", label: "Todos los turnos" },
            { value: "ABIERTA", label: "Abiertas" },
            { value: "CERRADA", label: "Cerradas" },
          ]}
        />
        <FilterSelect
          value={filterUserId}
          onChange={setFilterUserId}
          options={[
            { value: "", label: "Todos los cajeros" },
            ...employees.map((e) => ({ value: String(e.id), label: e.name })),
          ]}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>Desde:</span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            style={dateInput}
          />
          <span style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>Hasta:</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            style={dateInput}
          />
          {(from || to) && (
            <button
              onClick={() => { setFrom(""); setTo(""); }}
              style={clearBtn}
              title="Limpiar fechas"
            >
              ✕
            </button>
          )}
        </div>
        {openCount > 0 && (
          <span style={{ fontSize: 13, color: "#15803d", fontWeight: 700 }}>{openCount} caja(s) abierta(s)</span>
        )}
        <span style={{ marginLeft: "auto", fontSize: 13, color: "#64748b", fontWeight: 600 }}>
          {rows.length} sesión{rows.length === 1 ? "" : "es"}
        </span>
      </Toolbar>

      <div className="table-sticky-head" style={{ ...ui.tableWrap, overflowX: "auto", overflowY: "auto", maxHeight: "62vh" }}>
        <table style={ui.table}>
          <thead>
            <tr style={ui.theadRow}>
              <th style={ui.th}>#</th>
              <th style={ui.th}>Sucursal</th>
              <th style={ui.th}>Cajero</th>
              <th style={ui.th}>Apertura</th>
              <th style={ui.th}>Cierre</th>
              <th style={{ ...ui.th, textAlign: "right" }}>Fondo</th>
              <th style={{ ...ui.th, textAlign: "center" }}>Ventas</th>
              <th style={{ ...ui.th, textAlign: "right" }}>Esperado</th>
              <th style={{ ...ui.th, textAlign: "right" }}>Declarado</th>
              <th style={{ ...ui.th, textAlign: "right" }}>Diferencia</th>
              <th style={{ ...ui.th, textAlign: "center" }}>Estado</th>
            </tr>
          </thead>
          <tbody>
            <TableState colSpan={11} loading={loading} error={error} empty={!loading && rows.length === 0} />
            {!loading &&
              !error &&
              rows.map((s) => (
                <tr
                  key={s.id}
                  onClick={() => openDetail(s.id)}
                  onMouseEnter={() => setHoveredRow(s.id)}
                  onMouseLeave={() => setHoveredRow(null)}
                  style={{ cursor: "pointer", backgroundColor: hoveredRow === s.id ? "#f8fafc" : "transparent" }}
                >
                  <td style={{ ...ui.td, fontWeight: 700, color: "#1e3a8a" }}>{s.id}</td>
                  <td style={ui.td}>{s.branch}</td>
                  <td style={ui.td}>{s.cajero}</td>
                  <td style={ui.td}>
                    {fmtDate(s.openedAt)} <span style={{ color: "#94a3b8" }}>{fmtTime(s.openedAt)}</span>
                  </td>
                  <td style={ui.td}>
                    {s.closedAt ? (
                      <>
                        {fmtDate(s.closedAt)} <span style={{ color: "#94a3b8" }}>{fmtTime(s.closedAt)}</span>
                      </>
                    ) : (
                      <span style={{ color: "#94a3b8" }}>—</span>
                    )}
                  </td>
                  <td style={{ ...ui.td, textAlign: "right" }}>{money(s.initialAmount)}</td>
                  <td style={{ ...ui.td, textAlign: "center", fontWeight: 700 }}>{s.salesCount}</td>
                  <td style={{ ...ui.td, textAlign: "right", fontWeight: 700 }}>{money(s.expectedAmount)}</td>
                  <td style={{ ...ui.td, textAlign: "right" }}>
                    {s.declaredAmount !== null ? money(s.declaredAmount) : <span style={{ color: "#94a3b8" }}>—</span>}
                  </td>
                  <td style={{ ...ui.td, textAlign: "right", fontWeight: 800, color: diffColor(s.difference) }}>
                    {s.difference !== null ? money(s.difference) : "—"}
                  </td>
                  <td style={{ ...ui.td, textAlign: "center" }}>
                    <Badge tone={statusTone(s.status)}>{s.status}</Badge>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* ===================== MODAL DETALLE DE CAJA ===================== */}
      {detailOpen && (
        <div style={ui.overlay} onClick={closeDetail}>
          <div
            style={{ ...ui.modal, maxWidth: 700, width: "100%" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ ...ui.modalHeader, gap: 12, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={ui.modalTitle}>
                  Caja #{selectedDetail?.id ?? "…"}
                </span>
                {selectedDetail && (
                  <span style={{ marginLeft: 10, fontSize: 13, color: "#64748b" }}>
                    Cajero: <strong>{selectedDetail.cajero}</strong> | Sucursal: <strong>{selectedDetail.branch}</strong>
                  </span>
                )}
              </div>
              {selectedDetail && (
                <Badge tone={statusTone(selectedDetail.status)}>{selectedDetail.status}</Badge>
              )}
              <button style={ui.ghostBtn} onClick={closeDetail}>✕</button>
            </div>

            {/* Body */}
            <div style={ui.modalBody}>
              {detailLoading && (
                <p style={{ textAlign: "center", color: "#94a3b8", padding: "24px 0", fontSize: 13 }}>
                  Cargando detalles...
                </p>
              )}
              {detailError && (
                <p style={{ color: "#b91c1c", fontSize: 13, padding: "8px 0" }}>{detailError}</p>
              )}

              {!detailLoading && !detailError && selectedDetail && (
                <>
                  {/* Apertura */}
                  <p style={{ fontSize: 12, color: "#64748b", marginBottom: 16 }}>
                    Apertura: {fmtDateTime(selectedDetail.openedAt)}
                    {selectedDetail.closedAt && (
                      <> &nbsp;·&nbsp; Cierre: {fmtDateTime(selectedDetail.closedAt)}</>
                    )}
                    {selectedDetail.forceCloseReason && (
                      <span style={{ color: "#b91c1c", marginLeft: 8 }}>
                        ⚠ Cierre forzado: {selectedDetail.forceCloseReason}
                      </span>
                    )}
                  </p>

                  {/* Desglose financiero */}
                  <p style={sectionLabel}>Desglose financiero</p>
                  <div style={finBox}>
                    <FinRow label="Monto inicial (fondo):" value={money(selectedDetail.initialAmount)} />
                    <FinRow label="+ Ventas (efectivo neto):" value={money(selectedDetail.cashIn)} />
                    <FinRow label="– Depósitos (salidas):" value={money(selectedDetail.cashOut)} />
                    <div style={{ borderTop: "1px solid #e2e8f0", margin: "8px 0" }} />
                    <FinRow label="= Esperado (teórico):" value={money(selectedDetail.expectedAmount)} bold />
                    <div style={{ borderTop: "1px dashed #cbd5e1", margin: "8px 0" }} />
                    <FinRow
                      label="Declarado (contado):"
                      value={selectedDetail.declaredAmount !== null ? money(selectedDetail.declaredAmount) : "—"}
                    />
                    <FinRow
                      label="Diferencia:"
                      value={
                        selectedDetail.difference !== null
                          ? (selectedDetail.difference >= 0
                            ? `+${money(selectedDetail.difference)}`
                            : money(selectedDetail.difference))
                          : "—"
                      }
                      bold
                      color={
                        selectedDetail.difference === null
                          ? "#94a3b8"
                          : selectedDetail.difference >= 0
                            ? "#15803d"
                            : "#b91c1c"
                      }
                    />
                  </div>

                  {/* Desglose por método de pago */}
                  <p style={{ ...sectionLabel, marginTop: 18 }}>Por método de pago (ventas completadas)</p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 24px", marginBottom: 6 }}>
                    <PayRow label="Efectivo" value={money(selectedDetail.payBreakdown.efectivo)} />
                    <PayRow label="Tarjeta crédito" value={money(selectedDetail.payBreakdown.tarjetaCredito)} />
                    <PayRow label="Tarjeta débito" value={money(selectedDetail.payBreakdown.tarjetaDebito)} />
                    <PayRow label="MercadoPago QR" value={money(selectedDetail.payBreakdown.mercadoPago)} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end", fontSize: 13, fontWeight: 700, color: "#0f172a", paddingTop: 6, borderTop: "1px solid #f1f5f9" }}>
                    Total ventas: {money(selectedDetail.payBreakdown.totalVentas)}
                  </div>

                  {/* Tabla de movimientos */}
                  <p style={{ ...sectionLabel, marginTop: 18 }}>
                    Últimos movimientos ({selectedDetail.movements.length})
                  </p>
                  {selectedDetail.movements.length === 0 ? (
                    <p style={{ fontSize: 13, color: "#94a3b8", textAlign: "center", padding: "12px 0" }}>
                      Sin movimientos registrados.
                    </p>
                  ) : (
                    <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden" }}>
                      <table style={{ ...ui.table, fontSize: 12 }}>
                        <thead>
                          <tr style={ui.theadRow}>
                            <th style={{ ...ui.th, fontSize: 10 }}>Fecha / hora</th>
                            <th style={{ ...ui.th, fontSize: 10 }}>Tipo</th>
                            <th style={{ ...ui.th, fontSize: 10 }}>Descripción</th>
                            <th style={{ ...ui.th, fontSize: 10, textAlign: "right" }}>Monto</th>
                            <th style={{ ...ui.th, fontSize: 10, textAlign: "right" }}>Saldo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedDetail.movements.map((m) => (
                            <tr key={m.id}>
                              <td style={{ ...ui.td, fontSize: 12 }}>{fmtDateTime(m.date)}</td>
                              <td style={{ ...ui.td, fontSize: 12 }}>
                                <span style={{ color: movTypeColor(m.type), fontWeight: 700 }}>{m.type}</span>
                              </td>
                              <td style={{ ...ui.td, fontSize: 12, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }}>
                                {m.description}
                              </td>
                              <td style={{ ...ui.td, fontSize: 12, textAlign: "right", fontWeight: 700, color: m.amount >= 0 ? "#15803d" : "#b91c1c" }}>
                                {m.amount >= 0 ? "+" : ""}{money(m.amount)}
                              </td>
                              <td style={{ ...ui.td, fontSize: 12, textAlign: "right", color: "#475569" }}>
                                {money(m.balance)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            <div
              style={{
                padding: "14px 22px",
                borderTop: "1px solid #e2e8f0",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <div style={{ display: "flex", gap: 8 }}>
                <button style={ui.ghostBtn} onClick={closeDetail}>
                  Cerrar
                </button>
                <button
                  style={{ ...ui.primaryBtn, backgroundColor: "#2563eb" }}
                  onClick={printCashReport}
                  disabled={detailLoading || !selectedDetail}
                  title="Imprimir arqueo de esta caja"
                >
                  Imprimir
                </button>
              </div>
              {selectedDetail?.status === "ABIERTA" && (
                <button
                  style={{ ...ui.primaryBtn, backgroundColor: "#b91c1c" }}
                  onClick={() => setForceOpen(true)}
                >
                  Cerrar forzado
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===================== SUB-MODAL CIERRE FORZADO ===================== */}
      {forceOpen && (
        <div
          style={{ ...ui.overlay, zIndex: 300 }}
          onClick={() => { setForceOpen(false); setForceReason(""); setForceError(null); }}
        >
          <div
            style={{ ...ui.modal, maxWidth: 440, width: "100%" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={ui.modalHeader}>
              <span style={ui.modalTitle}>¿Cerrar caja forzadamente?</span>
              <button
                style={ui.ghostBtn}
                onClick={() => { setForceOpen(false); setForceReason(""); setForceError(null); }}
              >
                ✕
              </button>
            </div>
            <div style={ui.modalBody}>
              <p style={{ fontSize: 13, color: "#b91c1c", fontWeight: 600, marginBottom: 18 }}>
                ⚠ Esta acción no se puede deshacer.
              </p>
              <label style={ui.fieldLabel}>Motivo de cierre *</label>
              <textarea
                value={forceReason}
                onChange={(e) => setForceReason(e.target.value)}
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
              {forceError && (
                <p style={{ color: "#b91c1c", fontSize: 13, marginTop: 8 }}>{forceError}</p>
              )}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
                <button
                  style={ui.ghostBtn}
                  onClick={() => { setForceOpen(false); setForceReason(""); setForceError(null); }}
                  disabled={forceLoading}
                >
                  Cancelar
                </button>
                <button
                  style={{
                    ...ui.primaryBtn,
                    backgroundColor: forceLoading || !forceReason.trim() ? "#94a3b8" : "#b91c1c",
                    cursor: forceLoading || !forceReason.trim() ? "not-allowed" : "pointer",
                  }}
                  onClick={handleForceClose}
                  disabled={forceLoading || !forceReason.trim()}
                >
                  {forceLoading ? "Cerrando..." : "✓ Confirmar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Estilos locales
// ---------------------------------------------------------------------------

const dateInput: React.CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  height: 38,
  padding: "0 10px",
  fontSize: 13,
  fontWeight: 500,
  color: "#334155",
  backgroundColor: "#ffffff",
  outline: "none",
  fontFamily: "inherit",
  cursor: "pointer",
};

const clearBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 28,
  height: 28,
  border: "1px solid #e2e8f0",
  borderRadius: 6,
  backgroundColor: "#ffffff",
  color: "#64748b",
  cursor: "pointer",
  fontSize: 12,
};

// ---------------------------------------------------------------------------
// Helpers de presentación internos
// ---------------------------------------------------------------------------

const sectionLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: "0.5px",
  marginBottom: 10,
};

const finBox: React.CSSProperties = {
  backgroundColor: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  padding: "12px 16px",
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const FinRow: React.FC<{ label: string; value: string; bold?: boolean; color?: string }> = ({
  label,
  value,
  bold,
  color,
}) => (
  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, alignItems: "center" }}>
    <span style={{ color: "#475569" }}>{label}</span>
    <span style={{ fontWeight: bold ? 800 : 600, color: color ?? "#0f172a" }}>{value}</span>
  </div>
);

const PayRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
    <span style={{ color: "#64748b" }}>{label}</span>
    <span style={{ fontWeight: 700, color: "#334155" }}>{value}</span>
  </div>
);

export default CajasView;
