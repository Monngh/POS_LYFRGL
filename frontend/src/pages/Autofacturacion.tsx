import React, { useState } from "react";
import axios from "axios";
import { Search, FileText, CheckCircle2, Download, AlertTriangle, ArrowLeft, Building2 } from "lucide-react";

interface TicketItem {
  name: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface TicketData {
  id: number;
  invoiceNumber: string;
  createdAt: string;
  totalAmount: number;
  taxAmount: number;
  branchName: string;
  items: TicketItem[];
}

const REGIMENES_FISCALES = [
  { code: "601", label: "601 - General de Ley Personas Morales" },
  { code: "603", label: "603 - Personas Morales con Fines no Lucrativos" },
  { code: "605", label: "605 - Sueldos y Salarios e Ingresos Asimilados a Salarios" },
  { code: "606", label: "606 - Arrendamiento" },
  { code: "608", label: "608 - Demás ingresos" },
  { code: "612", label: "612 - Personas Físicas con Actividades Empresariales y Profesionales" },
  { code: "621", label: "621 - Incorporación Fiscal" },
  { code: "625", label: "625 - Régimen de las Actividades Empresariales con ingresos a través de Plataformas Tecnológicas" },
  { code: "626", label: "626 - Régimen Simplificado de Confianza (RESICO)" }
];

const USOS_CFDI = [
  { code: "G01", label: "G01 - Adquisición de mercancías" },
  { code: "G03", label: "G03 - Gastos en general" },
  { code: "I01", label: "I01 - Construcciones" },
  { code: "I02", label: "I02 - Mobiliario y equipo de oficina por inversiones" },
  { code: "D01", label: "D01 - Honorarios médicos, dentales y gastos hospitalarios" },
  { code: "D02", label: "D02 - Gastos médicos por incapacidad o discapacidad" },
  { code: "S01", label: "S01 - Sin efectos fiscales" }
];

const Autofacturacion: React.FC = () => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ticket, setTicket] = useState<TicketData | null>(null);

  // Formulario Fiscal
  const [rfc, setRfc] = useState("");
  const [legalName, setLegalName] = useState("");
  const [taxSystem, setTaxSystem] = useState("601");
  const [zip, setZip] = useState("");
  const [email, setEmail] = useState("");
  const [cfdiUse, setCfdiUse] = useState("G03");
  
  // Resultado de facturación
  const [invoiceResult, setInvoiceResult] = useState<{
    uuid: string;
    pdfUrl: string;
    xmlUrl: string;
    mode: string;
  } | null>(null);

  // Buscar Ticket
  const handleSearchTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invoiceNumber.trim()) {
      setError("Por favor ingrese el folio de su ticket.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await axios.get(`http://localhost:4000/api/public/sales/ticket/${invoiceNumber.trim().toUpperCase()}`);
      setTicket(response.data);
      setStep(2);
    } catch (err: any) {
      setError(err.response?.data?.message || "No se pudo encontrar el ticket especificado.");
    } finally {
      setLoading(false);
    }
  };

  // Solicitar Facturación
  const handleIssueInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rfc || !legalName || !zip || !email) {
      setError("Por favor complete todos los datos requeridos.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await axios.post("http://localhost:4000/api/public/sales/invoice", {
        saleId: ticket?.id,
        rfc: rfc.trim().toUpperCase(),
        legalName: legalName.trim().toUpperCase(),
        taxSystem,
        zip: zip.trim(),
        email: email.trim(),
        cfdiUse
      });

      setInvoiceResult(response.data);
      setStep(3);
    } catch (err: any) {
      setError(err.response?.data?.message || "Error al procesar la facturación.");
    } finally {
      setLoading(false);
    }
  };

  // Reiniciar
  const handleReset = () => {
    setInvoiceNumber("");
    setTicket(null);
    setInvoiceResult(null);
    setError("");
    setRfc("");
    setLegalName("");
    setZip("");
    setEmail("");
    setStep(1);
  };

  return (
    <div style={styles.pageBackground}>
      {/* Navbar Premium */}
      <nav style={styles.navbar}>
        <div style={styles.navContainer}>
          <div style={styles.navBrand}>
            <Building2 size={24} color="#0d9488" />
            <span style={styles.navBrandText}>FMB Solutions</span>
          </div>
          <span style={styles.navBadge}>Portal de Autofacturación</span>
        </div>
      </nav>

      {/* Contenido Principal */}
      <div style={styles.mainContainer}>
        {/* Paso 1: Buscar Ticket */}
        {step === 1 && (
          <div style={styles.card} className="card-premium">
            <h1 style={styles.title}>Factura tu Compra</h1>
            <p style={styles.subtitle}>
              Ingresa el número de folio impreso en tu ticket de compra para comenzar el trámite.
            </p>

            <form onSubmit={handleSearchTicket} style={styles.searchForm}>
              <div style={styles.inputWrapper}>
                <Search size={18} color="#94a3b8" style={styles.inputIcon} />
                <input
                  type="text"
                  placeholder="Ej: V-123456"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  style={styles.searchInput}
                  disabled={loading}
                />
              </div>

              {error && (
                <div style={styles.errorAlert}>
                  <AlertTriangle size={18} color="#b91c1c" />
                  <span style={{ fontSize: "14px", fontWeight: "500" }}>{error}</span>
                </div>
              )}

              <button type="submit" disabled={loading} style={styles.primaryButton}>
                {loading ? "Buscando..." : "Buscar Ticket ➜"}
              </button>
            </form>
          </div>
        )}

        {/* Paso 2: Detalles del Ticket y Formulario de Facturación */}
        {step === 2 && ticket && (
          <div style={{ ...styles.card, maxWidth: "800px" }}>
            <button onClick={() => setStep(1)} style={styles.backButton}>
              <ArrowLeft size={16} /> Regresar
            </button>

            <h2 style={styles.sectionHeader}>Detalles del Ticket</h2>
            
            <div style={styles.ticketDetailsBox}>
              <div style={styles.ticketGrid}>
                <div><strong>Folio:</strong> {ticket.invoiceNumber}</div>
                <div><strong>Sucursal:</strong> {ticket.branchName}</div>
                <div><strong>Fecha:</strong> {new Date(ticket.createdAt).toLocaleString()}</div>
                <div>
                  <strong>Total Compra:</strong> 
                  <span style={{ color: "#0d9488", fontWeight: "800", marginLeft: "6px" }}>
                    ${ticket.totalAmount.toFixed(2)}
                  </span>
                </div>
              </div>

              <div style={{ overflowX: "auto", marginTop: "16px" }}>
                <table style={styles.table}>
                  <thead>
                    <tr style={styles.thRow}>
                      <th style={styles.th}>Producto</th>
                      <th style={styles.th}>Cant.</th>
                      <th style={styles.th}>P. Unitario</th>
                      <th style={styles.th}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ticket.items.map((item, idx) => (
                      <tr key={idx} style={styles.tr}>
                        <td style={styles.td}>{item.name}</td>
                        <td style={styles.td}>{item.quantity}</td>
                        <td style={styles.td}>${item.unitPrice.toFixed(2)}</td>
                        <td style={{ ...styles.td, fontWeight: "600" }}>${item.total.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <h2 style={{ ...styles.sectionHeader, marginTop: "24px" }}>Datos Fiscales de Facturación</h2>
            <p style={{ ...styles.subtitle, marginBottom: "20px" }}>
              Por favor escriba con cuidado los datos conforme a su constancia del SAT (CFDI 4.0).
            </p>

            <form onSubmit={handleIssueInvoice} style={styles.billingForm}>
              <div style={styles.formGrid}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>RFC *</label>
                  <input
                    type="text"
                    required
                    maxLength={13}
                    placeholder="RFC de 12 o 13 caracteres"
                    value={rfc}
                    onChange={(e) => setRfc(e.target.value.toUpperCase())}
                    style={styles.input}
                  />
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.label}>Nombre o Razón Social *</label>
                  <input
                    type="text"
                    required
                    placeholder="Tal como aparece en el SAT (sin régimen de capital)"
                    value={legalName}
                    onChange={(e) => setLegalName(e.target.value.toUpperCase())}
                    style={styles.input}
                  />
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.label}>Régimen Fiscal *</label>
                  <select
                    value={taxSystem}
                    onChange={(e) => setTaxSystem(e.target.value)}
                    style={styles.select}
                  >
                    {REGIMENES_FISCALES.map((r) => (
                      <option key={r.code} value={r.code}>{r.label}</option>
                    ))}
                  </select>
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.label}>Código Postal Fiscal *</label>
                  <input
                    type="text"
                    required
                    maxLength={5}
                    placeholder="CP de 5 dígitos"
                    value={zip}
                    onChange={(e) => setZip(e.target.value)}
                    style={styles.input}
                  />
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.label}>Uso de CFDI *</label>
                  <select
                    value={cfdiUse}
                    onChange={(e) => setCfdiUse(e.target.value)}
                    style={styles.select}
                  >
                    {USOS_CFDI.map((u) => (
                      <option key={u.code} value={u.code}>{u.label}</option>
                    ))}
                  </select>
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.label}>Correo Electrónico *</label>
                  <input
                    type="email"
                    required
                    placeholder="Para enviar sus archivos PDF y XML"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    style={styles.input}
                  />
                </div>
              </div>

              {error && (
                <div style={{ ...styles.errorAlert, marginTop: "16px" }}>
                  <AlertTriangle size={18} color="#b91c1c" />
                  <span>{error}</span>
                </div>
              )}

              <button type="submit" disabled={loading} style={styles.successButton}>
                {loading ? "Timbrando Factura..." : "Emitir Factura SAT"}
              </button>
            </form>
          </div>
        )}

        {/* Paso 3: Factura Emitida con Éxito */}
        {step === 3 && invoiceResult && (
          <div style={styles.card}>
            <div style={styles.successWrapper}>
              <div style={styles.successIconBox}>
                <CheckCircle2 size={56} color="#059669" />
              </div>
              <h1 style={styles.successTitle}>¡Factura Emitida con Éxito!</h1>
              <p style={styles.successSubtitle}>
                {invoiceResult.mode === "real" && 
                  "Su comprobante fiscal ha sido timbrado por el PAC y enviado correctamente por correo."}
                {invoiceResult.mode === "fallback-simulated" && 
                  "Nota: El servidor de Facturapi no respondió (error de red/offline). Se generó y guardó la simulación de correo y factura de demostración de respaldo localmente."}
                {invoiceResult.mode === "simulated" && 
                  "Se ha generado la representación impresa, XML de demostración y simulación de correo exitosamente."}
              </p>

              <div style={styles.uuidBox}>
                <span style={{ fontSize: "11px", fontWeight: "700", color: "#64748b" }}>FOLIO FISCAL (UUID)</span>
                <span style={styles.uuidText}>{invoiceResult.uuid}</span>
              </div>

              <div style={styles.downloadGrid}>
                <a
                  href={`http://localhost:4000/api/public/sales/invoice/${invoiceResult.uuid}/pdf`}
                  target="_blank"
                  rel="noreferrer"
                  style={styles.downloadButton}
                >
                  <FileText size={18} /> Ver PDF de Factura
                </a>

                <a
                  href={`http://localhost:4000/api/public/sales/invoice/${invoiceResult.uuid}/xml`}
                  download={`factura-${invoiceResult.uuid}.xml`}
                  style={{ ...styles.downloadButton, backgroundColor: "#1e293b" }}
                >
                  <Download size={18} /> Descargar XML
                </a>
              </div>

              <button onClick={handleReset} style={styles.primaryButton}>
                Facturar otro Ticket
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const styles = {
  pageBackground: {
    minHeight: "100vh",
    backgroundColor: "#f1f5f9",
    display: "flex",
    flexDirection: "column" as const
  },
  navbar: {
    backgroundColor: "#ffffff",
    borderBottom: "1px solid #e2e8f0",
    padding: "16px 24px"
  },
  navContainer: {
    maxWidth: "1200px",
    margin: "0 auto",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center"
  },
  navBrand: {
    display: "flex",
    alignItems: "center",
    gap: "8px"
  },
  navBrandText: {
    fontSize: "18px",
    fontWeight: "800",
    color: "#0f172a",
    letterSpacing: "-0.5px"
  },
  navBadge: {
    fontSize: "12px",
    fontWeight: "700",
    color: "#0d9488",
    backgroundColor: "#ccfbf1",
    padding: "4px 10px",
    borderRadius: "100px"
  },
  mainContainer: {
    flex: 1,
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    padding: "40px 20px"
  },
  card: {
    width: "100%",
    maxWidth: "500px",
    backgroundColor: "#ffffff",
    borderRadius: "16px",
    boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05)",
    border: "1px solid #e2e8f0",
    padding: "36px"
  },
  title: {
    fontSize: "24px",
    fontWeight: "800",
    color: "#0f172a",
    textAlign: "center" as const,
    marginBottom: "10px",
    letterSpacing: "-0.5px"
  },
  subtitle: {
    fontSize: "14px",
    color: "#64748b",
    textAlign: "center" as const,
    marginBottom: "24px",
    lineHeight: "1.5"
  },
  searchForm: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "16px"
  },
  inputWrapper: {
    position: "relative" as const
  },
  inputIcon: {
    position: "absolute" as const,
    left: "14px",
    top: "50%",
    transform: "translateY(-50%)"
  },
  searchInput: {
    width: "100%",
    padding: "14px 14px 14px 44px",
    borderRadius: "10px",
    border: "2px solid #e2e8f0",
    fontSize: "16px",
    fontWeight: "600",
    outline: "none",
    transition: "border-color 0.2s"
  },
  primaryButton: {
    width: "100%",
    backgroundColor: "#0d9488",
    color: "#ffffff",
    border: "none",
    padding: "14px",
    borderRadius: "10px",
    fontSize: "16px",
    fontWeight: "700",
    cursor: "pointer",
    transition: "background-color 0.2s"
  },
  successButton: {
    width: "100%",
    backgroundColor: "#059669",
    color: "#ffffff",
    border: "none",
    padding: "14px",
    borderRadius: "10px",
    fontSize: "16px",
    fontWeight: "700",
    cursor: "pointer",
    transition: "background-color 0.2s",
    marginTop: "20px"
  },
  backButton: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    background: "none",
    border: "none",
    color: "#64748b",
    fontSize: "13px",
    fontWeight: "600",
    cursor: "pointer",
    marginBottom: "16px"
  },
  sectionHeader: {
    fontSize: "18px",
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: "12px",
    borderBottom: "2px solid #f1f5f9",
    paddingBottom: "8px"
  },
  ticketDetailsBox: {
    backgroundColor: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: "10px",
    padding: "16px",
    fontSize: "13px"
  },
  ticketGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "10px",
    color: "#334155"
  },
  table: {
    width: "100%",
    borderCollapse: "collapse" as const,
    marginTop: "12px"
  },
  thRow: {
    borderBottom: "1px solid #cbd5e1"
  },
  th: {
    textAlign: "left" as const,
    padding: "6px",
    color: "#64748b",
    fontWeight: "700"
  },
  tr: {
    borderBottom: "1px solid #e2e8f0"
  },
  td: {
    padding: "8px 6px",
    color: "#334155"
  },
  billingForm: {
    display: "flex",
    flexDirection: "column" as const
  },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: "16px"
  },
  formGroup: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "6px"
  },
  label: {
    fontSize: "12px",
    fontWeight: "700",
    color: "#475569"
  },
  input: {
    width: "100%",
    boxSizing: "border-box" as const,
    padding: "10px 12px",
    borderRadius: "8px",
    border: "1px solid #cbd5e1",
    fontSize: "14px",
    outline: "none",
    fontWeight: "500"
  },
  select: {
    width: "100%",
    boxSizing: "border-box" as const,
    padding: "10px 12px",
    borderRadius: "8px",
    border: "1px solid #cbd5e1",
    fontSize: "13px",
    outline: "none",
    fontWeight: "500",
    backgroundColor: "#ffffff"
  },
  errorAlert: {
    backgroundColor: "#fef2f2",
    border: "1px solid #fca5a5",
    color: "#b91c1c",
    padding: "12px",
    borderRadius: "8px",
    display: "flex",
    alignItems: "center",
    gap: "10px"
  },
  successWrapper: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    textAlign: "center" as const
  },
  successIconBox: {
    backgroundColor: "#d1fae5",
    padding: "16px",
    borderRadius: "50%",
    marginBottom: "20px"
  },
  successTitle: {
    fontSize: "22px",
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: "8px"
  },
  successSubtitle: {
    fontSize: "14px",
    color: "#64748b",
    marginBottom: "24px",
    lineHeight: "1.5"
  },
  uuidBox: {
    backgroundColor: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: "10px",
    padding: "12px 24px",
    width: "100%",
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    marginBottom: "24px"
  },
  uuidText: {
    fontSize: "13px",
    fontWeight: "800",
    fontFamily: "monospace",
    color: "#0f172a",
    marginTop: "4px",
    wordBreak: "break-all" as const
  },
  downloadGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "12px",
    width: "100%",
    marginBottom: "24px"
  },
  downloadButton: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    backgroundColor: "#0d9488",
    color: "#ffffff",
    textDecoration: "none",
    padding: "12px",
    borderRadius: "8px",
    fontSize: "14px",
    fontWeight: "700",
    cursor: "pointer",
    transition: "opacity 0.2s"
  }
};

export default Autofacturacion;
