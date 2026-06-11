import React, { useState, useEffect } from "react";
import { Download, FileText } from "lucide-react";
import api from "../../services/api";
import {
  ui,
  type ViewProps,
  Badge,
  Panel,
  TableState,
  SectionHeader,
  moneyExact,
} from "./shared";

const HistorialFacturasView: React.FC<ViewProps> = ({ refreshToken }) => {
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get("/api/admin/billing/history");
      setHistory(res.data.data || []);
    } catch (err: any) {
      setError(err.response?.data?.message || "Error al cargar el historial de facturas.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [refreshToken]);

  const formatDate = (dateString: string) => {
    const d = new Date(dateString);
    return new Intl.DateTimeFormat("es-MX", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(d);
  };

  return (
    <div>
      <SectionHeader
        title="Historial de Facturas"
        subtitle="Consulta todas las facturas individuales y globales timbradas. Descarga el PDF y XML de cada una."
      />

      <Panel>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0", backgroundColor: "#f8fafc", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <strong style={{ fontSize: 14, color: "#334155" }}>Facturas Emitidas</strong>
          <button onClick={fetchHistory} style={ui.ghostBtn}>
            Actualizar
          </button>
        </div>
        
        <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", width: "100%" }}>
          <table style={ui.table}>
            <thead>
              <tr style={ui.theadRow}>
                <th style={ui.th}>Fecha</th>
                <th style={ui.th}>Folio Fiscal (UUID)</th>
                <th style={ui.th}>Tipo</th>
                <th style={ui.th}>Cliente</th>
                <th style={ui.th}>Tickets</th>
                <th style={{ ...ui.th, textAlign: "right" }}>Total</th>
                <th style={{ ...ui.th, textAlign: "center" }}>Archivos</th>
              </tr>
            </thead>
            <tbody>
              <TableState
                colSpan={7}
                loading={loading}
                error={error}
                empty={!loading && !error && history.length === 0}
                emptyText="No hay facturas emitidas."
              />
              {!loading && !error && history.map((item) => (
                <tr key={item.uuid}>
                  <td style={ui.td}>{formatDate(item.date)}</td>
                  <td style={{ ...ui.td, fontFamily: "monospace", color: "#1e3a8a", fontWeight: 600 }}>{item.uuid}</td>
                  <td style={ui.td}>
                    <Badge tone={item.type === "Global" ? "blue" : "slate"}>
                      {item.type}
                    </Badge>
                  </td>
                  <td style={ui.td}>{item.customer}</td>
                  <td style={ui.td}>
                    {item.type === "Global" ? (
                      <span style={{ fontSize: 12, color: "#64748b", fontWeight: 500 }}>
                        {item.ticketsCount} tickets
                      </span>
                    ) : (
                      <span style={{ fontSize: 12 }}>{item.ticketsInvolved[0]}</span>
                    )}
                  </td>
                  <td style={{ ...ui.td, textAlign: "right", fontWeight: 700 }}>{moneyExact(item.totalAmount)}</td>
                  <td style={{ ...ui.td, textAlign: "center" }}>
                    <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                      <a
                        href={`${api.defaults.baseURL}/api/public/sales/invoice/${item.uuid}/pdf`}
                        target="_blank"
                        rel="noreferrer"
                        title="Descargar PDF"
                        style={{ ...actionBtn, color: "#dc2626", backgroundColor: "#fef2f2" }}
                      >
                        <FileText size={16} />
                        <span style={srOnly}>PDF</span>
                      </a>
                      <a
                        href={`${api.defaults.baseURL}/api/public/sales/invoice/${item.uuid}/xml`}
                        target="_blank"
                        rel="noreferrer"
                        title="Descargar XML"
                        style={{ ...actionBtn, color: "#0f172a", backgroundColor: "#f1f5f9" }}
                      >
                        <Download size={16} />
                        <span style={srOnly}>XML</span>
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
};

const actionBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 32,
  height: 32,
  borderRadius: 6,
  textDecoration: "none",
  transition: "all 0.2s ease"
};

const srOnly: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  borderWidth: 0
};

export default HistorialFacturasView;
