import React, { useState, useEffect } from "react";
import axios from "axios";
import { 
  Search, 
  FileText, 
  CheckCircle2, 
  Download, 
  AlertTriangle, 
  ArrowLeft, 
  Building2, 
  User, 
  Lock, 
  LogOut, 
  LogIn, 
  Sparkles, 
  Calendar, 
  DollarSign, 
  ClipboardList, 
  Check, 
  FileCode 
} from "lucide-react";

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

interface InvoiceHistoryItem {
  id: number;
  invoiceNumber: string;
  createdAt: string;
  totalAmount: number;
  taxAmount: number;
  status: string;
  branchName: string;
  cfdiUuid: string | null;
  pdfUrl: string | null;
  xmlUrl: string | null;
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
  const [activeTab, setActiveTab] = useState<"facturar" | "facturas" | "datos">("facturar");
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [ticket, setTicket] = useState<TicketData | null>(null);

  // Formulario Fiscal Temporal (para facturar)
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

  // Autenticación de Clientes
  const [customerToken, setCustomerToken] = useState<string | null>(null);
  const [customerInfo, setCustomerInfo] = useState<{ id: number; name: string; phone: string; email: string | null; points?: number } | null>(null);
  
  // Modales
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  
  // Campos Login
  const [loginPhone, setLoginPhone] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  
  // Campos Registro (Reclamar cuenta)
  const [registerPhone, setRegisterPhone] = useState("");
  const [registerInvoiceNumber, setRegisterInvoiceNumber] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState("");

  // Historial de Facturas
  const [invoicesList, setInvoicesList] = useState<InvoiceHistoryItem[]>([]);

  // Datos Fiscales del Perfil (Edición)
  const [profileRfc, setProfileRfc] = useState("");
  const [profileLegalName, setProfileLegalName] = useState("");
  const [profileTaxSystem, setProfileTaxSystem] = useState("601");
  const [profileZip, setProfileZip] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [profileCfdiUse, setProfileCfdiUse] = useState("G03");
  const [profileAddress, setProfileAddress] = useState("");

  // Cargar sesión persistida
  useEffect(() => {
    const token = localStorage.getItem("customer_token");
    if (token) {
      setCustomerToken(token);
      fetchProfile(token);
    }
  }, []);

  // Obtener perfil del cliente
  const fetchProfile = async (token: string) => {
    try {
      const response = await axios.get("http://localhost:4000/api/customers/profile", {
        headers: { Authorization: `Bearer ${token}` }
      });
      const c = response.data.customer;
      setCustomerInfo({
        id: c.id,
        name: c.name,
        phone: c.phone || "",
        email: c.email,
        points: c.points || 0
      });

      // Rellenar campos de edición de perfil
      setProfileRfc(c.taxId || "");
      setProfileLegalName(c.name || "");
      setProfileTaxSystem(c.taxRegime || "601");
      setProfileZip(c.zipCode || "");
      setProfileEmail(c.email || "");
      setProfileCfdiUse(c.cfdiUse || "G03");
      setProfileAddress(c.address || "");

      // Auto-rellenar formulario de facturación
      setRfc(c.taxId || "");
      setLegalName(c.name || "");
      setTaxSystem(c.taxRegime || "601");
      setZip(c.zipCode || "");
      setEmail(c.email || "");
      setCfdiUse(c.cfdiUse || "G03");
    } catch (err: any) {
      handleLogout();
    }
  };

  // Cargar facturas
  const loadInvoices = async () => {
    if (!customerToken) return;
    setLoading(true);
    setError("");
    try {
      const response = await axios.get("http://localhost:4000/api/customers/invoices", {
        headers: { Authorization: `Bearer ${customerToken}` }
      });
      setInvoicesList(response.data.invoices);
    } catch (err: any) {
      setError(err.response?.data?.message || "Error al cargar el historial de facturas.");
    } finally {
      setLoading(false);
    }
  };

  // Login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await axios.post("http://localhost:4000/api/customers/login", {
        phone: loginPhone,
        password: loginPassword
      });

      const { token, customer } = response.data;
      localStorage.setItem("customer_token", token);
      localStorage.setItem("customer", JSON.stringify(customer));
      
      setCustomerToken(token);
      setCustomerInfo(customer);
      setShowLoginModal(false);
      setLoginPhone("");
      setLoginPassword("");
      
      await fetchProfile(token);
      setSuccessMessage("¡Bienvenido de nuevo!");
      setTimeout(() => setSuccessMessage(""), 4000);
    } catch (err: any) {
      setError(err.response?.data?.message || "Teléfono o contraseña incorrectos.");
    } finally {
      setLoading(false);
    }
  };

  // Registro (Reclamo)
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (registerPassword !== registerConfirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setLoading(true);

    try {
      const response = await axios.post("http://localhost:4000/api/customers/register", {
        phone: registerPhone,
        invoiceNumber: registerInvoiceNumber.trim().toUpperCase(),
        password: registerPassword
      });

      setShowRegisterModal(false);
      setShowLoginModal(true);
      setLoginPhone(registerPhone);
      setRegisterPhone("");
      setRegisterInvoiceNumber("");
      setRegisterPassword("");
      setRegisterConfirmPassword("");
      
      alert(response.data.message);
    } catch (err: any) {
      setError(err.response?.data?.message || "Error al registrar cuenta. Verifique sus datos e intente de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  // Logout
  const handleLogout = () => {
    localStorage.removeItem("customer_token");
    localStorage.removeItem("customer");
    setCustomerToken(null);
    setCustomerInfo(null);
    setActiveTab("facturar");
    setStep(1);
    setTicket(null);
    setInvoiceResult(null);
    
    // Vaciar campos
    setRfc("");
    setLegalName("");
    setTaxSystem("601");
    setZip("");
    setEmail("");
    setCfdiUse("G03");
  };

  // Actualizar datos fiscales
  const handleUpdateFiscalData = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    setSuccessMessage("");

    try {
      await axios.put("http://localhost:4000/api/customers/profile", {
        taxId: profileRfc.trim().toUpperCase(),
        name: profileLegalName.trim().toUpperCase(),
        taxRegime: profileTaxSystem,
        zipCode: profileZip.trim(),
        email: profileEmail.trim(),
        cfdiUse: profileCfdiUse,
        address: profileAddress.trim()
      }, {
        headers: { Authorization: `Bearer ${customerToken}` }
      });

      setSuccessMessage("¡Datos fiscales actualizados con éxito!");
      if (customerToken) {
        await fetchProfile(customerToken);
      }
      setTimeout(() => setSuccessMessage(""), 4000);
    } catch (err: any) {
      setError(err.response?.data?.message || "Error al actualizar los datos fiscales.");
    } finally {
      setLoading(false);
    }
  };

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
      
      // Si el cliente está logueado, pre-rellenar con sus datos actuales del perfil
      if (customerInfo) {
        setRfc(profileRfc);
        setLegalName(profileLegalName);
        setTaxSystem(profileTaxSystem);
        setZip(profileZip);
        setEmail(profileEmail);
        setCfdiUse(profileCfdiUse);
      }
      
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
    if (!customerInfo) {
      setRfc("");
      setLegalName("");
      setZip("");
      setEmail("");
    }
    setStep(1);
  };

  return (
    <div style={styles.pageBackground}>
      {/* Navbar Premium */}
      <nav style={styles.navbar}>
        <div style={styles.navContainer}>
          <div style={styles.navBrand}>
            <Building2 size={24} color="#1e3a8a" />
            <span style={styles.navBrandText}>FMB POS</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            {customerInfo ? (
              <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                <div style={styles.clientBadge}>
                  <Sparkles size={14} color="#b45309" style={{ marginRight: "4px" }} />
                  <span>Cliente: <strong>{customerInfo.name}</strong> ({customerInfo.points ?? 0} pts)</span>
                </div>
                <button onClick={handleLogout} style={styles.logoutBtn}>
                  <LogOut size={16} /> Cerrar Sesión
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", gap: "8px" }}>
                <button onClick={() => { setError(""); setShowLoginModal(true); }} style={styles.loginBtn}>
                  <LogIn size={16} /> Iniciar Sesión
                </button>
                <button onClick={() => { setError(""); setShowRegisterModal(true); }} style={styles.registerBtn}>
                  Crear Cuenta
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Tabs Subheader si está autenticado */}
      {customerInfo && (
        <div style={styles.tabsBar}>
          <div style={styles.tabsContainer}>
            <button 
              onClick={() => { setActiveTab("facturar"); setStep(1); setError(""); }}
              style={activeTab === "facturar" ? styles.activeTab : styles.tab}
            >
              <Search size={16} style={{ marginRight: "6px" }} /> Facturar Nuevo Ticket
            </button>
            <button 
              onClick={() => { setActiveTab("facturas"); setError(""); loadInvoices(); }}
              style={activeTab === "facturas" ? styles.activeTab : styles.tab}
            >
              <ClipboardList size={16} style={{ marginRight: "6px" }} /> Mis Facturas
            </button>
            <button 
              onClick={() => { setActiveTab("datos"); setError(""); }}
              style={activeTab === "datos" ? styles.activeTab : styles.tab}
            >
              <User size={16} style={{ marginRight: "6px" }} /> Datos Fiscales
            </button>
          </div>
        </div>
      )}

      {/* Alerta de Éxito Global (Toast-like) */}
      {successMessage && (
        <div style={styles.successToast}>
          <Check size={18} />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Contenido Principal */}
      <div style={styles.mainContainer}>
        {/* TAB FACTURAR NUEVO TICKET */}
        {activeTab === "facturar" && (
          <>
            {/* Paso 1: Buscar Ticket */}
            {step === 1 && (
              <div style={styles.card} className="card-premium autofact-card">
                <h1 style={styles.title}>Factura tu Compra</h1>
                <p style={styles.subtitle}>
                  Ingresa el número de folio impreso en tu ticket de compra para comenzar el trámite. {customerInfo ? "Tus datos fiscales se cargarán automáticamente." : "Puedes hacerlo como invitado."}
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
              <div style={{ ...styles.card, maxWidth: "800px" }} className="card-premium autofact-card">
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
                      <span style={{ color: "#1e3a8a", fontWeight: "800", marginLeft: "6px" }}>
                        ${ticket.totalAmount.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  <div style={{ overflowX: "auto", marginTop: "16px" }} className="autofact-table-scroll">
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
                <p style={{ ...styles.subtitle, marginBottom: "20px", textAlign: "left" }}>
                  Por favor escriba con cuidado los datos conforme a su constancia del SAT (CFDI 4.0).
                </p>

                <form onSubmit={handleIssueInvoice} style={styles.billingForm}>
                  <div style={styles.formGrid} className="autofact-form-grid">
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
              <div style={styles.card} className="card-premium autofact-card">
                <div style={styles.successWrapper}>
                  <div style={styles.successIconBox}>
                    <CheckCircle2 size={56} color="#1e3a8a" />
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
          </>
        )}

        {/* TAB HISTORIAL DE FACTURAS */}
        {activeTab === "facturas" && customerInfo && (
          <div style={{ ...styles.card, maxWidth: "1000px" }} className="card-premium autofact-card">
            <h1 style={{ ...styles.title, textAlign: "left", marginBottom: "6px" }}>Mis Compras y Facturas</h1>
            <p style={{ ...styles.subtitle, textAlign: "left", marginBottom: "24px" }}>
              Consulta el historial de todas tus compras y descarga directamente tus facturas emitidas.
            </p>

            {loading ? (
              <div style={{ textAlign: "center", padding: "40px" }}>Cargando historial...</div>
            ) : invoicesList.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px", color: "#64748b" }}>
                <ClipboardList size={48} style={{ margin: "0 auto 12px", opacity: 0.5 }} />
                <p>No se encontraron compras asociadas a tu número telefónico.</p>
              </div>
            ) : (
              <div style={{ overflowX: "auto" }} className="autofact-table-scroll">
                <table style={styles.table}>
                  <thead>
                    <tr style={styles.thRow}>
                      <th style={styles.th}>Folio</th>
                      <th style={styles.th}>Sucursal</th>
                      <th style={styles.th}>Fecha</th>
                      <th style={styles.th}>Total</th>
                      <th style={styles.th}>Estado</th>
                      <th style={styles.th}>Factura (UUID)</th>
                      <th style={{ ...styles.th, textAlign: "center" }}>Descargas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoicesList.map((inv) => (
                      <tr key={inv.id} style={styles.tr}>
                        <td style={{ ...styles.td, fontWeight: "700" }}>{inv.invoiceNumber}</td>
                        <td style={styles.td}>{inv.branchName}</td>
                        <td style={styles.td}>{new Date(inv.createdAt).toLocaleDateString()}</td>
                        <td style={{ ...styles.td, fontWeight: "600" }}>${inv.totalAmount.toFixed(2)}</td>
                        <td style={styles.td}>
                          <span style={{
                            padding: "4px 8px",
                            borderRadius: "100px",
                            fontSize: "11px",
                            fontWeight: "700",
                            backgroundColor: inv.status === "COMPLETADA" ? "#d1fae5" : "#fee2e2",
                            color: inv.status === "COMPLETADA" ? "#065f46" : "#991b1b"
                          }}>
                            {inv.status}
                          </span>
                        </td>
                        <td style={{ ...styles.td, fontFamily: "monospace", fontSize: "12px", color: "#64748b" }}>
                          {inv.cfdiUuid ? `${inv.cfdiUuid.substring(0, 8)}...` : "No facturado"}
                        </td>
                        <td style={{ ...styles.td }}>
                          {inv.cfdiUuid ? (
                            <div style={{ display: "flex", gap: "6px", justifyContent: "center" }}>
                              <a 
                                href={`http://localhost:4000/api/public/sales/invoice/${inv.cfdiUuid}/pdf`} 
                                target="_blank" 
                                rel="noreferrer" 
                                style={styles.actionIconBtn} 
                                title="Ver PDF"
                              >
                                <FileText size={14} color="#1e3a8a" />
                              </a>
                              <a 
                                href={`http://localhost:4000/api/public/sales/invoice/${inv.cfdiUuid}/xml`} 
                                download={`factura-${inv.cfdiUuid}.xml`} 
                                style={styles.actionIconBtn} 
                                title="Descargar XML"
                              >
                                <FileCode size={14} color="#475569" />
                              </a>
                            </div>
                          ) : (
                            <button 
                              onClick={() => {
                                setInvoiceNumber(inv.invoiceNumber);
                                setTicket({
                                  id: inv.id,
                                  invoiceNumber: inv.invoiceNumber,
                                  createdAt: inv.createdAt,
                                  totalAmount: inv.totalAmount,
                                  taxAmount: inv.taxAmount,
                                  branchName: inv.branchName,
                                  items: [] // se cargará al buscar
                                });
                                // Buscar ticket completo
                                axios.get(`http://localhost:4000/api/public/sales/ticket/${inv.invoiceNumber}`).then(res => {
                                  setTicket(res.data);
                                  setRfc(profileRfc);
                                  setLegalName(profileLegalName);
                                  setTaxSystem(profileTaxSystem);
                                  setZip(profileZip);
                                  setEmail(profileEmail);
                                  setCfdiUse(profileCfdiUse);
                                  setStep(2);
                                  setActiveTab("facturar");
                                });
                              }} 
                              style={styles.billingShortcutBtn}
                            >
                              Facturar ahora
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB DATOS FISCALES */}
        {activeTab === "datos" && customerInfo && (
          <div style={{ ...styles.card, maxWidth: "700px" }} className="card-premium autofact-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", marginBottom: "6px" }}>
              <h1 style={{ ...styles.title, textAlign: "left", marginBottom: 0 }}>Mis Datos Fiscales</h1>
              <span style={{ fontSize: "14px", fontWeight: "700", color: "#0d9488", backgroundColor: "#f0fdf4", padding: "4px 10px", borderRadius: "100px", marginTop: "4px" }}>
                ⭐ {customerInfo.points ?? 0} Puntos
              </span>
            </div>
            <p style={{ ...styles.subtitle, textAlign: "left", marginBottom: "24px" }}>
              Guarda tus datos fiscales SAT 4.0 de forma segura. Se completarán automáticamente al facturar tus tickets.
            </p>

            <form onSubmit={handleUpdateFiscalData} style={styles.billingForm}>
              <div style={styles.formGrid} className="autofact-form-grid">
                <div style={styles.formGroup}>
                  <label style={styles.label}>RFC *</label>
                  <input
                    type="text"
                    required
                    maxLength={13}
                    placeholder="RFC del Contribuyente"
                    value={profileRfc}
                    onChange={(e) => setProfileRfc(e.target.value.toUpperCase())}
                    style={styles.input}
                  />
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.label}>Razón Social o Nombre Legal *</label>
                  <input
                    type="text"
                    required
                    placeholder="Nombre tal cual está registrado en el SAT"
                    value={profileLegalName}
                    onChange={(e) => setProfileLegalName(e.target.value.toUpperCase())}
                    style={styles.input}
                  />
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.label}>Régimen Fiscal *</label>
                  <select
                    value={profileTaxSystem}
                    onChange={(e) => setProfileTaxSystem(e.target.value)}
                    style={styles.select}
                  >
                    {REGIMENES_FISCALES.map((r) => (
                      <option key={r.code} value={r.code}>{r.label}</option>
                    ))}
                  </select>
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.label}>Código Postal *</label>
                  <input
                    type="text"
                    required
                    maxLength={5}
                    placeholder="Código Postal Fiscal"
                    value={profileZip}
                    onChange={(e) => setProfileZip(e.target.value)}
                    style={styles.input}
                  />
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.label}>Uso CFDI Preferido *</label>
                  <select
                    value={profileCfdiUse}
                    onChange={(e) => setProfileCfdiUse(e.target.value)}
                    style={styles.select}
                  >
                    {USOS_CFDI.map((u) => (
                      <option key={u.code} value={u.code}>{u.label}</option>
                    ))}
                  </select>
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.label}>Correo de Envío *</label>
                  <input
                    type="email"
                    required
                    placeholder="Correo de facturación"
                    value={profileEmail}
                    onChange={(e) => setProfileEmail(e.target.value)}
                    style={styles.input}
                  />
                </div>

                <div style={{ ...styles.formGroup, gridColumn: "span 2" }}>
                  <label style={styles.label}>Dirección Fiscal (Opcional)</label>
                  <input
                    type="text"
                    placeholder="Calle, Número, Colonia, Municipio"
                    value={profileAddress}
                    onChange={(e) => setProfileAddress(e.target.value)}
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
                {loading ? "Guardando datos..." : "Guardar Datos Fiscales"}
              </button>
            </form>
          </div>
        )}
      </div>

      {/* MODAL LOGIN */}
      {showLoginModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <button onClick={() => setShowLoginModal(false)} style={styles.closeModalButton}>&times;</button>
            <h2 style={styles.modalTitle}>Acceso de Clientes</h2>
            <p style={styles.modalSubtitle}>Ingresa tu teléfono y contraseña para gestionar tus facturas.</p>

            <form onSubmit={handleLogin} style={styles.modalForm}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Número de Teléfono</label>
                <div style={styles.modalInputWrapper}>
                  <User size={16} style={styles.modalInputIcon} />
                  <input
                    type="text"
                    required
                    placeholder="Ej: 5551234567"
                    value={loginPhone}
                    onChange={(e) => setLoginPhone(e.target.value)}
                    style={styles.modalInput}
                  />
                </div>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Contraseña</label>
                <div style={styles.modalInputWrapper}>
                  <Lock size={16} style={styles.modalInputIcon} />
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    style={styles.modalInput}
                  />
                </div>
              </div>

              {error && (
                <div style={styles.modalError}>
                  <AlertTriangle size={16} style={{ marginRight: "6px" }} />
                  <span>{error}</span>
                </div>
              )}

              <button type="submit" disabled={loading} style={styles.primaryButton}>
                {loading ? "Verificando..." : "Ingresar"}
              </button>
            </form>

            <div style={styles.modalFooter}>
              ¿Aún no tienes contraseña?{" "}
              <button 
                onClick={() => { setShowLoginModal(false); setShowRegisterModal(true); }}
                style={styles.footerLink}
              >
                Crea tu cuenta aquí
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL REGISTRO (RECLAMAR CUENTA) */}
      {showRegisterModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <button onClick={() => setShowRegisterModal(false)} style={styles.closeModalButton}>&times;</button>
            <h2 style={styles.modalTitle}>Crear Cuenta / Contraseña</h2>
            <p style={styles.modalSubtitle}>
              Si compraste en caja, asocia tu contraseña ingresando tu teléfono registrado y el folio de tu ticket.
            </p>

            <form onSubmit={handleRegister} style={styles.modalForm}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Número de Teléfono Registrado</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: 5551234567"
                  value={registerPhone}
                  onChange={(e) => setRegisterPhone(e.target.value)}
                  style={styles.modalInputNoIcon}
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Folio de Ticket de Compra previo</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: V-100200"
                  value={registerInvoiceNumber}
                  onChange={(e) => setRegisterInvoiceNumber(e.target.value)}
                  style={styles.modalInputNoIcon}
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Nueva Contraseña</label>
                <input
                  type="password"
                  required
                  placeholder="Mínimo 6 caracteres"
                  value={registerPassword}
                  onChange={(e) => setRegisterPassword(e.target.value)}
                  style={styles.modalInputNoIcon}
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Confirmar Contraseña</label>
                <input
                  type="password"
                  required
                  placeholder="Confirme su contraseña"
                  value={registerConfirmPassword}
                  onChange={(e) => setRegisterConfirmPassword(e.target.value)}
                  style={styles.modalInputNoIcon}
                />
              </div>

              {error && (
                <div style={styles.modalError}>
                  <AlertTriangle size={16} style={{ marginRight: "6px" }} />
                  <span>{error}</span>
                </div>
              )}

              <button type="submit" disabled={loading} style={styles.primaryButton}>
                {loading ? "Validando compra..." : "Registrar Cuenta"}
              </button>
            </form>

            <div style={styles.modalFooter}>
              ¿Ya tienes cuenta?{" "}
              <button 
                onClick={() => { setShowRegisterModal(false); setShowLoginModal(true); }}
                style={styles.footerLink}
              >
                Inicia sesión aquí
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const styles = {
  pageBackground: {
    minHeight: "100vh",
    backgroundColor: "#f8fafc",
    display: "flex",
    flexDirection: "column" as const
  },
  navbar: {
    backgroundColor: "#ffffff",
    borderBottom: "1px solid #e2e8f0",
    padding: "16px 24px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.02)"
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
    fontSize: "20px",
    fontWeight: "800",
    color: "#1e3a8a",
    letterSpacing: "-0.5px"
  },
  clientBadge: {
    display: "flex",
    alignItems: "center",
    fontSize: "13px",
    color: "#78350f",
    backgroundColor: "#fef3c7",
    padding: "6px 12px",
    borderRadius: "100px",
    border: "1px solid #fde68a"
  },
  loginBtn: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    backgroundColor: "transparent",
    color: "#1e3a8a",
    border: "1px solid #1e3a8a",
    padding: "8px 16px",
    borderRadius: "8px",
    fontSize: "14px",
    fontWeight: "700",
    cursor: "pointer",
    transition: "all 0.2s"
  },
  registerBtn: {
    backgroundColor: "#1e3a8a",
    color: "#ffffff",
    border: "none",
    padding: "8px 16px",
    borderRadius: "8px",
    fontSize: "14px",
    fontWeight: "700",
    cursor: "pointer",
    transition: "all 0.2s"
  },
  logoutBtn: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    backgroundColor: "transparent",
    color: "#64748b",
    border: "1px solid #cbd5e1",
    padding: "8px 16px",
    borderRadius: "8px",
    fontSize: "14px",
    fontWeight: "600",
    cursor: "pointer",
    transition: "all 0.2s"
  },
  tabsBar: {
    backgroundColor: "#ffffff",
    borderBottom: "1px solid #e2e8f0"
  },
  tabsContainer: {
    maxWidth: "1200px",
    margin: "0 auto",
    display: "flex",
    padding: "0 24px",
    gap: "4px"
  },
  tab: {
    display: "flex",
    alignItems: "center",
    padding: "14px 18px",
    fontSize: "14px",
    fontWeight: "600",
    color: "#64748b",
    backgroundColor: "transparent",
    border: "none",
    borderBottom: "3px solid transparent",
    cursor: "pointer",
    transition: "all 0.2s"
  },
  activeTab: {
    display: "flex",
    alignItems: "center",
    padding: "14px 18px",
    fontSize: "14px",
    fontWeight: "700",
    color: "#1e3a8a",
    backgroundColor: "transparent",
    border: "none",
    borderBottom: "3px solid #1e3a8a",
    cursor: "pointer"
  },
  mainContainer: {
    flex: 1,
    display: "flex",
    justifyContent: "center",
    alignItems: "flex-start",
    padding: "40px 20px"
  },
  card: {
    width: "100%",
    maxWidth: "520px",
    backgroundColor: "#ffffff",
    borderRadius: "16px",
    boxShadow: "0 10px 30px -10px rgba(0, 0, 0, 0.05), 0 1px 3px rgba(0, 0, 0, 0.02)",
    border: "1px solid #e2e8f0",
    padding: "36px",
    boxSizing: "border-box" as const
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
    boxSizing: "border-box" as const,
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
    backgroundColor: "#1e3a8a",
    color: "#ffffff",
    border: "none",
    padding: "14px",
    borderRadius: "10px",
    fontSize: "15px",
    fontWeight: "700",
    cursor: "pointer",
    transition: "background-color 0.2s"
  },
  successButton: {
    width: "100%",
    backgroundColor: "#1e40af",
    color: "#ffffff",
    border: "none",
    padding: "14px",
    borderRadius: "10px",
    fontSize: "15px",
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
    marginTop: "12px",
    fontSize: "13px"
  },
  thRow: {
    borderBottom: "2px solid #cbd5e1"
  },
  th: {
    textAlign: "left" as const,
    padding: "8px 6px",
    color: "#475569",
    fontWeight: "700"
  },
  tr: {
    borderBottom: "1px solid #f1f5f9"
  },
  td: {
    padding: "10px 6px",
    color: "#334155",
    verticalAlign: "middle"
  },
  billingForm: {
    display: "flex",
    flexDirection: "column" as const
  },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
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
    boxSizing: "border-box" as const,
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
    backgroundColor: "#1e3a8a",
    color: "#ffffff",
    textDecoration: "none",
    padding: "12px",
    borderRadius: "8px",
    fontSize: "13px",
    fontWeight: "700",
    cursor: "pointer",
    transition: "opacity 0.2s"
  },
  successToast: {
    position: "fixed" as const,
    bottom: "24px",
    right: "24px",
    backgroundColor: "#065f46",
    color: "#ffffff",
    padding: "12px 20px",
    borderRadius: "8px",
    boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    fontSize: "14px",
    fontWeight: "600",
    zIndex: 2000
  },
  actionIconBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "28px",
    height: "28px",
    borderRadius: "6px",
    backgroundColor: "#f1f5f9",
    border: "none",
    cursor: "pointer",
    transition: "background-color 0.2s"
  },
  billingShortcutBtn: {
    backgroundColor: "#f0fdf4",
    color: "#166534",
    border: "1px solid #bbf7d0",
    padding: "4px 10px",
    borderRadius: "6px",
    fontSize: "12px",
    fontWeight: "700",
    cursor: "pointer",
    transition: "all 0.2s"
  },
  // Modales
  modalOverlay: {
    position: "fixed" as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(15, 23, 42, 0.4)",
    backdropFilter: "blur(4px)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1500,
    padding: "20px"
  },
  modalContent: {
    backgroundColor: "#ffffff",
    borderRadius: "16px",
    width: "100%",
    maxWidth: "420px",
    boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.15)",
    padding: "32px",
    border: "1px solid #e2e8f0",
    position: "relative" as const,
    boxSizing: "border-box" as const
  },
  closeModalButton: {
    position: "absolute" as const,
    top: "16px",
    right: "18px",
    background: "none",
    border: "none",
    fontSize: "24px",
    color: "#94a3b8",
    cursor: "pointer",
    fontWeight: "bold",
    outline: "none"
  },
  modalTitle: {
    fontSize: "20px",
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: "6px",
    letterSpacing: "-0.5px"
  },
  modalSubtitle: {
    fontSize: "13px",
    color: "#64748b",
    lineHeight: "1.4",
    marginBottom: "20px"
  },
  modalForm: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "16px"
  },
  modalInputWrapper: {
    position: "relative" as const
  },
  modalInputIcon: {
    position: "absolute" as const,
    left: "12px",
    top: "50%",
    transform: "translateY(-50%)",
    color: "#94a3b8"
  },
  modalInput: {
    width: "100%",
    boxSizing: "border-box" as const,
    padding: "10px 12px 10px 38px",
    borderRadius: "8px",
    border: "1px solid #cbd5e1",
    fontSize: "14px",
    outline: "none",
    fontWeight: "500"
  },
  modalInputNoIcon: {
    width: "100%",
    boxSizing: "border-box" as const,
    padding: "10px 12px",
    borderRadius: "8px",
    border: "1px solid #cbd5e1",
    fontSize: "14px",
    outline: "none",
    fontWeight: "500"
  },
  modalError: {
    backgroundColor: "#fef2f2",
    color: "#b91c1c",
    padding: "8px 12px",
    borderRadius: "6px",
    fontSize: "12px",
    fontWeight: "600",
    display: "flex",
    alignItems: "center"
  },
  modalFooter: {
    marginTop: "20px",
    textAlign: "center" as const,
    fontSize: "13px",
    color: "#64748b"
  },
  footerLink: {
    background: "none",
    border: "none",
    color: "#1e3a8a",
    fontWeight: "700",
    cursor: "pointer",
    padding: 0,
    fontSize: "13px",
    textDecoration: "underline"
  }
};

export default Autofacturacion;
