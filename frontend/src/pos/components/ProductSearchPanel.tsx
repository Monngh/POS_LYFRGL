import React from "react";
import { Search } from "lucide-react";
import { usePosSearch } from "../hooks/usePosSearch";
import { usePosCustomer } from "../hooks/usePosCustomer";
import { usePosCart } from "../hooks/usePosCart";

const validateTextInput = (value: string): string =>
  value
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, "")
    .replace(/[^\p{L}\p{N}\s\-,.]/gu, "");

interface ProductSearchPanelProps {
  searchData: ReturnType<typeof usePosSearch>;
  customerData: ReturnType<typeof usePosCustomer>;
  cartData: ReturnType<typeof usePosCart>;
  onToast: (msg: string, type?: "error" | "success" | "info") => void;
}

const styles: { [key: string]: React.CSSProperties } = {
  terminalSearchArea: { padding: "16px", position: "relative" as const },
  searchResultsDropdown: {
    position: "absolute" as const,
    top: "100%",
    left: "16px",
    right: "16px",
    backgroundColor: "#ffffff",
    border: "1px solid #cbd5e1",
    borderRadius: "6px",
    boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)",
    zIndex: 50,
    maxHeight: "200px",
    overflowY: "auto" as const,
  },
  dropdownItem: {
    padding: "12px 16px",
    display: "flex",
    justifyContent: "space-between",
    cursor: "pointer",
    borderBottom: "1px solid #f1f5f9",
    fontSize: "14px",
  },
  fieldError: { color: "#b91c1c", fontSize: "12px", fontWeight: "600", marginTop: "5px", marginBottom: 0 },
};

const maskPhone = (value: string | null | undefined): string => {
  const digits = (value || "").replace(/\D/g, "");
  if (!digits) return "";
  return `${"•".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
};

export function ProductSearchPanel({ searchData, customerData, cartData, onToast }: ProductSearchPanelProps) {
  const {
    barcodeSearch, setBarcodeSearch, handleProductBarcodeSearch, barcodeSearchError,
    searchResults, setSearchResults,
  } = searchData;

  const {
    selectedCustomer, setSelectedCustomer,
    customerSearch, setCustomerSearch, customerSearchError,
    customerSearchResults, setCustomerSearchResults,
    isCustomerDropdownOpen, setIsCustomerDropdownOpen,
    setIsNewCustomerModalOpen, setNewCustomerError, setNewCustomerFieldErrors, setNewCustomerForm,
  } = customerData;

  const { addProductToCart, setUsePoints, setPointsToRedeem, setInvoiceRequested } = cartData;

  return (
    <div className="card-premium" style={styles.terminalSearchArea}>
      <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }} className="pos-cashier-search-row">
        {/* Buscador de Productos */}
        <form onSubmit={handleProductBarcodeSearch} style={{ flex: "1 1 50%", display: "flex", gap: "10px", margin: 0 }} className="pos-cashier-search-form">
          <div style={{ flex: 1, position: "relative" }}>
            <Search size={18} color="#94a3b8" style={{ position: "absolute", left: "12px", top: "12px" }} />
            <input
              type="text"
              className="input-corporate"
              style={{ paddingLeft: "38px" }}
              placeholder="Ingrese código o nombre del producto..."
              value={barcodeSearch}
              onChange={(e) => setBarcodeSearch(validateTextInput(e.target.value))}
            />
            {barcodeSearchError && <p style={styles.fieldError}>{barcodeSearchError}</p>}
          </div>
          <button type="submit" className="btn-primary">Buscar</button>
        </form>

        {/* Buscador y Lealtad de Clientes */}
        <div style={{ flex: "1 1 40%", display: "flex", gap: "10px", position: "relative" }} className="pos-cashier-customer-search">
          {selectedCustomer ? (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              backgroundColor: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "6px",
              padding: "8px 12px", width: "100%", fontSize: "13px"
            }} className="pos-cashier-customer-selected">
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontWeight: "700", color: "#166534" }}>👤 {selectedCustomer.name}</span>
                <span style={{ color: "#475569" }}>(Tel: {maskPhone(selectedCustomer.phone)})</span>
                <span style={{ backgroundColor: "#dcfce7", color: "#15803d", padding: "2px 6px", borderRadius: "4px", fontWeight: "700" }}>
                  ⭐ {selectedCustomer.points} pts
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedCustomer(null);
                  setUsePoints(false);
                  setPointsToRedeem(0);
                  setInvoiceRequested(false);
                  onToast("Cliente removido del carrito.", "info");
                }}
                style={{ border: "none", background: "transparent", color: "#991b1b", cursor: "pointer", fontWeight: "700" }}
              >
                Quitar
              </button>
            </div>
          ) : (
            <>
              <div style={{ flex: 1, position: "relative" }}>
                <span style={{ position: "absolute", left: "12px", top: "12px", fontSize: "14px" }}>👤</span>
                <input
                  type="text"
                  className="input-corporate"
                  style={{ paddingLeft: "38px" }}
                  placeholder="Buscar cliente por teléfono o nombre..."
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(validateTextInput(e.target.value))}
                  onFocus={() => {
                    if (customerSearch.trim().length > 0) setIsCustomerDropdownOpen(true);
                  }}
                />
                {customerSearchError && <p style={styles.fieldError}>{customerSearchError}</p>}
              </div>
              <button
                type="button"
                className="btn-primary"
                style={{ backgroundColor: "#0f172a" }}
                onClick={() => {
                  setNewCustomerError(null);
                  setNewCustomerFieldErrors({});
                  setNewCustomerForm({ name: "", phone: "", email: "" });
                  setIsNewCustomerModalOpen(true);
                }}
              >
                + Nuevo
              </button>
            </>
          )}

          {/* Dropdown de búsqueda de clientes */}
          {isCustomerDropdownOpen && customerSearchResults.length > 0 && (
            <div style={{ ...styles.searchResultsDropdown, left: 0, right: 0, top: "100%", marginTop: "4px", zIndex: 110 }}>
              {customerSearchResults.map((c) => (
                <div
                  key={c.id}
                  onClick={() => {
                    setSelectedCustomer(c);
                    setCustomerSearch("");
                    setCustomerSearchResults([]);
                    setIsCustomerDropdownOpen(false);
                  }}
                  style={{ ...styles.dropdownItem, display: "flex", justifyContent: "space-between", alignItems: "center" }}
                >
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <span style={{ fontWeight: "700", color: "#1e293b" }}>{c.name}</span>
                    <span style={{ fontSize: "12px", color: "#64748b" }}>📞 {maskPhone(c.phone)}</span>
                  </div>
                  <span style={{ backgroundColor: "#f1f5f9", color: "#334155", padding: "2px 6px", borderRadius: "4px", fontWeight: "700", fontSize: "12px" }}>
                    ⭐ {c.points} pts
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Dropdown vacío (No coincidencia => Sugerir registro) */}
          {isCustomerDropdownOpen && customerSearch.trim().length > 0 && customerSearchResults.length === 0 && (
            <div style={{ ...styles.searchResultsDropdown, left: 0, right: 0, top: "100%", marginTop: "4px", padding: "12px", textAlign: "center" as const, zIndex: 110 }}>
              <span style={{ fontSize: "13px", color: "#64748b", display: "block", marginBottom: "8px" }}>
                No se encontró ningún cliente
              </span>
              <button
                type="button"
                className="btn-primary"
                style={{ fontSize: "12px", padding: "6px 12px", width: "100%", backgroundColor: "#0f172a" }}
                onClick={() => {
                  setNewCustomerError(null);
                  setNewCustomerFieldErrors({});
                  setNewCustomerForm({ name: "", phone: customerSearch.replace(/\D/g, ""), email: "" });
                  setIsNewCustomerModalOpen(true);
                  setIsCustomerDropdownOpen(false);
                }}
              >
                + Registrar "{customerSearch}" como Nuevo Cliente
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Dropdown de búsqueda multi-producto */}
      {searchResults.length > 0 && (
        <div style={styles.searchResultsDropdown}>
          {searchResults.map((p) => (
            <div
              key={p.id}
              onClick={() => {
                addProductToCart(p);
                setSearchResults([]);
                setBarcodeSearch("");
              }}
              style={styles.dropdownItem}
            >
              <span>{p.name}</span>
              <span style={{ fontWeight: "700", color: "#0d9488" }}>${p.sellPrice.toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
