import React, { useState, useEffect, useRef } from "react";
import { Search, Eye, EyeOff } from "lucide-react";
import { usePosSearch } from "../hooks/usePosSearch";
import { usePosCustomer } from "../hooks/usePosCustomer";
import { usePosCart } from "../hooks/usePosCart";

const validateTextInput = (value: string): string =>
  value
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, "")
    .replace(/[^\p{L}\p{N}\s\-,.]/gu, "");

const maskPhoneLast2 = (phone: string): string => {
  const clean = phone.replace(/\D/g, "");
  if (clean.length === 0) return "";
  if (clean.length === 10) {
    return "•".repeat(8) + clean.slice(-2);
  }
  if (clean.length === 1) {
    return clean;
  }
  return "•".repeat(clean.length - 1) + clean.slice(-1);
};

const getNextRealPhone = (newValue: string, prevReal: string): string => {
  if (!newValue) return "";
  if (!newValue.includes("•")) {
    return newValue.replace(/\D/g, "").slice(0, 10);
  }
  const prevMask = maskPhoneLast2(prevReal);
  const prevBulletCount = (prevMask.match(/•/g) || []).length;
  const prefix = prevReal.slice(0, prevBulletCount);
  const suffix = newValue.slice(prevBulletCount).replace(/\D/g, "");
  return (prefix + suffix).slice(0, 10);
};

const isInvalidPhonePattern = (digits: string): boolean => {
  if (digits.length !== 10) return true;
  if (/^(.)\1+$/.test(digits)) return true;
  if (digits === "1234567890") return true;
  return false;
};

interface ProductSearchPanelProps {
  searchData: ReturnType<typeof usePosSearch>;
  customerData: ReturnType<typeof usePosCustomer>;
  cartData: ReturnType<typeof usePosCart>;
  onToast: (msg: string, type?: "error" | "success" | "info") => void;
  isAnyModalOpen?: boolean;
}

const styles: { [key: string]: React.CSSProperties } = {
  terminalSearchArea: { padding: "16px", position: "relative" as const },
  searchResultsDropdown: {
    position: "absolute" as const,
    top: "100%",
    left: "16px",
    right: "16px",
    backgroundColor: "var(--surface)",
    border: "1px solid var(--border-strong)",
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
    borderBottom: "1px solid var(--surface-3)",
    fontSize: "14px",
  },
  fieldError: { color: "#b91c1c", fontSize: "12px", fontWeight: "600", marginTop: "5px", marginBottom: 0 },
};

export function ProductSearchPanel({ searchData, customerData, cartData, onToast, isAnyModalOpen = false }: ProductSearchPanelProps) {
  const {
    barcodeSearch, setBarcodeSearch, handleProductBarcodeSearch, barcodeSearchError,
    searchResults, setSearchResults,
  } = searchData;

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const phoneInputRef = useRef<HTMLInputElement | null>(null);
  const searchResultsRef = useRef<HTMLDivElement | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);

  useEffect(() => {
    if (confirmOpen) {
      const timer = window.setTimeout(() => {
        const input = document.querySelector('.pos-cashier-modal input[type="text"]') as HTMLInputElement | null;
        input?.focus();
      }, 0);
      return () => window.clearTimeout(timer);
    }
    return;
    const handleShortcut = (e: KeyboardEvent) => {
      if (isAnyModalOpen) return;
      const active = document.activeElement;
      // allow Alt+letter shortcuts even when focus is in an input
      if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || (active as HTMLElement).isContentEditable) && !e.altKey) return;
      if (e.key === "F2") {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.altKey && e.key.toLowerCase() === "r") {
        // Registrar cliente rápido cuando el buscador indica no encontrado (Alt+R)
        if (searchStatus === "not_found") {
          e.preventDefault();
          setConfirmInput("");
          setConfirmError("");
          setConfirmOpen(true);
        }
      } else if (e.key === "F6") {
        e.preventDefault();
        phoneInputRef.current?.focus();
      }
    };

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [isAnyModalOpen]);

  const handleSearchInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (searchResults.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, searchResults.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const idx = selectedIndex >= 0 ? selectedIndex : 0;
      const prod = searchResults[idx];
      if (prod) {
        addProductToCart(prod);
        setSearchResults([]);
        setBarcodeSearch("");
        setSelectedIndex(-1);
      }
    }
  };

  // Scroll the selected search result into view when selection changes
  useEffect(() => {
    if (selectedIndex < 0) return;
    const container = searchResultsRef.current;
    if (!container) return;
    const child = container.children[selectedIndex] as HTMLElement | undefined;
    if (child) {
      child.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedIndex]);

  const {
    selectedCustomer, setSelectedCustomer,
    handleSearchCustomerByPhone,
    handleRegisterMinimalCustomer,
  } = customerData;

  const { addProductToCart, setUsePoints, setPointsToRedeem, setInvoiceRequested } = cartData;

  // Local states for zero latencies in phone typing
  const [localPhone, setLocalPhone] = useState("");
  const [localShowPhone, setLocalShowPhone] = useState(false);
  const [searchStatus, setSearchStatus] = useState<"idle" | "searching" | "found" | "not_found">("idle");
  const [localError, setLocalError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmInput, setConfirmInput] = useState("");
  const [confirmError, setConfirmError] = useState("");
  const [confirmShowPhone, setConfirmShowPhone] = useState(false);

  // Silent search on 10 digits
  useEffect(() => {
    const clean = localPhone.replace(/\D/g, "");
    if (clean.length === 10) {
      if (isInvalidPhonePattern(clean)) {
        setLocalError("Número de teléfono inválido.");
        setSearchStatus("idle");
        return;
      }
      setLocalError("");
      
      const doSilentSearch = async () => {
        setSearchStatus("searching");
        try {
          const { found } = await handleSearchCustomerByPhone(clean);
          if (found) {
            setSearchStatus("found");
            setLocalPhone("");
          } else {
            setSearchStatus("not_found");
          }
        } catch (err) {
          console.error("Error al buscar cliente silenciosamente:", err);
          setSearchStatus("idle");
          setLocalError("Error al buscar el cliente.");
        }
      };
      
      doSilentSearch();
    } else {
      setSearchStatus("idle");
      setLocalError("");
    }
  }, [localPhone]);

  return (
    <div className="card-premium" style={styles.terminalSearchArea}>
      <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }} className="pos-cashier-search-row">
        {/* Buscador de Productos */}
        <form onSubmit={handleProductBarcodeSearch} style={{ flex: "1 1 50%", display: "flex", gap: "10px", margin: 0 }} className="pos-cashier-search-form">
          <div style={{ flex: 1, position: "relative" }}>
            <Search size={18} color="#94a3b8" style={{ position: "absolute", left: "12px", top: "12px" }} />
            <input
              ref={searchInputRef}
              type="text"
              className="input-corporate"
              style={{ paddingLeft: "38px" }}
              placeholder="Ingrese código o nombre del producto..."
              data-shortcut-key="F2"
              title="Buscar producto (F2)"
              value={barcodeSearch}
              onChange={(e) => setBarcodeSearch(validateTextInput(e.target.value))}
              onKeyDown={handleSearchInputKeyDown}
            />
            {barcodeSearchError && <p style={styles.fieldError}>{barcodeSearchError}</p>}
          </div>
          <button type="submit" className="btn-primary" data-shortcut-letter="B" title="Buscar (Alt+B)">Buscar</button>
        </form>

        <div style={{ flex: "1 1 40%", display: "flex", gap: "10px", position: "relative" }} className="pos-cashier-customer-search">
          {selectedCustomer ? (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              backgroundColor: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "6px",
              padding: "8px 12px", width: "100%", fontSize: "13px"
            }} className="pos-cashier-customer-selected">
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontWeight: "700", color: "#166534" }}>
                  👤 {selectedCustomer.isNew ? "Cliente registrado para puntos" : (selectedCustomer.name || "Cliente registrado")}
                </span>
                <span style={{ color: "var(--text-secondary)" }}>(Teléfono: {maskPhoneLast2(selectedCustomer.phone)})</span>
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
            <div style={{ display: "flex", flexDirection: "column", width: "100%", gap: "8px" }}>
              <div style={{ display: "flex", gap: "10px", width: "100%", alignItems: "center" }}>
                <div style={{ flex: 1, position: "relative" }}>
                  <input
                    type="text"
                    ref={phoneInputRef}
                    className="input-corporate"
                    style={{ paddingRight: "40px" }}
                    placeholder="Teléfono del cliente (10 dígitos)"
                    data-shortcut-key="F6"
                    value={localShowPhone ? localPhone : maskPhoneLast2(localPhone)}
                    onChange={(e) => {
                      const next = getNextRealPhone(e.target.value, localPhone);
                      setLocalPhone(next);
                      if (localShowPhone) setLocalShowPhone(false);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setLocalShowPhone(!localShowPhone)}
                    style={{ position: "absolute", right: "12px", top: "11px", border: "none", background: "none", cursor: "pointer", display: "flex", alignItems: "center" }}
                  >
                    {localShowPhone ? <EyeOff size={18} color="#64748b" /> : <Eye size={18} color="#64748b" />}
                  </button>
                </div>
              </div>

              {localError && <p style={styles.fieldError}>{localError}</p>}
              
              {searchStatus === "searching" && (
                <p style={{ fontSize: "12px", color: "#2563eb", margin: 0, fontWeight: "600" }}>
                  Buscando cliente...
                </p>
              )}

              {searchStatus === "not_found" && (
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  backgroundColor: "#fffbeb", border: "1px solid #fde68a", padding: "8px 12px",
                  borderRadius: "6px", width: "100%"
                }}>
                  <span style={{ fontSize: "12px", color: "#b45309", fontWeight: "600" }}>
                    ⚠️ El cliente no está registrado.
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmInput("");
                      setConfirmError("");
                      setConfirmOpen(true);
                    }}
                    className="btn-primary"
                    data-shortcut-letter="R"
                    title="Registrar cliente (Alt+R)"
                    style={{ fontSize: "11px", padding: "4px 8px", backgroundColor: "var(--text)", border: "none", borderRadius: "4px", color: "white", cursor: "pointer" }}
                  >
                    + Registrar (R)
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Dropdown de búsqueda multi-producto */}
      {searchResults.length > 0 && (
        <div style={styles.searchResultsDropdown} ref={searchResultsRef}>
          {searchResults.map((p, idx) => (
            <div
              key={p.id}
              onMouseEnter={() => setSelectedIndex(idx)}
              onClick={() => {
                addProductToCart(p);
                setSearchResults([]);
                setBarcodeSearch("");
                setSelectedIndex(-1);
              }}
              style={{
                ...styles.dropdownItem,
                backgroundColor: idx === selectedIndex ? "var(--surface-2)" : "transparent",
              }}
            >
              <span>{p.name}</span>
              <span style={{ fontWeight: "700", color: "#0d9488" }}>${p.sellPrice.toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}

      {confirmOpen && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: "rgba(15, 23, 42, 0.4)", display: "flex",
          justifyContent: "center", alignItems: "center", zIndex: 110
        }} className="pos-cashier-modal-overlay pos-cashier-modal-overlay--center">
          <div style={{
            width: "400px", backgroundColor: "var(--surface)", borderRadius: "12px",
            padding: "28px", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)",
            display: "flex", flexDirection: "column", gap: "16px"
          }} className="pos-cashier-modal">
            <h3 style={{ textAlign: "center", fontSize: "16px", color: "var(--text)", fontWeight: "700", margin: 0 }}>
              Confirmar teléfono del cliente
            </h3>
            
            <form onSubmit={async (e) => {
              e.preventDefault();
              const cleanConfirm = confirmInput.replace(/\D/g, "");
              const cleanOriginal = localPhone.replace(/\D/g, "");
              if (cleanConfirm !== cleanOriginal) {
                setConfirmError("Los teléfonos no coinciden");
                return;
              }
              setConfirmError("");
              const res = await handleRegisterMinimalCustomer(cleanOriginal);
              if (res.success) {
                setLocalPhone("");
                setConfirmOpen(false);
                setSearchStatus("idle");
              } else {
                setConfirmError(res.error || "Error al registrar cliente.");
              }
            }} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }} className="pos-cashier-input-group">
                <div style={{ position: "relative", width: "100%" }}>
                  <input
                    type="text"
                    required
                    className="input-corporate"
                    placeholder="Ingrese el teléfono nuevamente"
                    value={confirmShowPhone ? confirmInput : maskPhoneLast2(confirmInput)}
                    onChange={(e) => {
                      const next = getNextRealPhone(e.target.value, confirmInput);
                      setConfirmInput(next);
                      if (confirmShowPhone) setConfirmShowPhone(false);
                    }}
                    style={{ textAlign: "center", fontSize: "16px", letterSpacing: "1px", paddingRight: "40px" }}
                  />
                  <button
                    type="button"
                    onClick={() => setConfirmShowPhone(!confirmShowPhone)}
                    style={{ position: "absolute", right: "12px", top: "11px", border: "none", background: "none", cursor: "pointer", display: "flex", alignItems: "center" }}
                  >
                    {confirmShowPhone ? <EyeOff size={18} color="#64748b" /> : <Eye size={18} color="#64748b" />}
                  </button>
                </div>
                {confirmError && <p style={styles.fieldError}>{confirmError}</p>}
              </div>

              <div style={{ display: "flex", gap: "10px", marginTop: "16px" }} className="pos-cashier-modal-actions">
                <button
                  type="button"
                  onClick={() => {
                    setConfirmOpen(false);
                    setConfirmInput("");
                    setConfirmError("");
                  }}
                  style={{
                    flex: 1, padding: "10px", borderRadius: "6px", border: "none",
                    fontWeight: "700", cursor: "pointer", backgroundColor: "#dc2626", color: "white"
                  }}
                >
                  CANCELAR
                </button>
                <button
                  type="submit"
                  style={{
                    flex: 1, padding: "10px", borderRadius: "6px", border: "none",
                    fontWeight: "700", cursor: "pointer", backgroundColor: "#059669", color: "white"
                  }}
                >
                  CONTINUAR
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
