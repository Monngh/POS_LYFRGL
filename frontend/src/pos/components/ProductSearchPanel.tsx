import React, { useState, useEffect, useRef } from "react";
import { Search } from "lucide-react";
import { usePosSearch } from "../hooks/usePosSearch";
import { usePosCart } from "../hooks/usePosCart";

const validateTextInput = (value: string): string =>
  value
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, "")
    .replace(/[^\p{L}\p{N}\s\-,.]/gu, "");

// maskPhoneLast2 removed

interface ProductSearchPanelProps {
  searchData: ReturnType<typeof usePosSearch>;
  cartData: ReturnType<typeof usePosCart>;
}

const styles: { [key: string]: React.CSSProperties } = {
  terminalSearchArea: { padding: "16px", position: "relative" as const },
  searchResultsDropdown: {
    position: "absolute" as const,
    top: "100%",
    marginTop: "8px",
    left: "0",
    right: "0",
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

export function ProductSearchPanel({ searchData, cartData }: ProductSearchPanelProps) {
  const {
    barcodeSearch, setBarcodeSearch, handleProductBarcodeSearch, barcodeSearchError,
    searchResults, setSearchResults,
  } = searchData;

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const searchResultsRef = useRef<HTMLDivElement | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);

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

  const { addProductToCart } = cartData;

  return (
    <div style={{ position: "relative", flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

      {/* ===== BUSCADOR DE PRODUCTOS ===== */}
      <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", marginBottom: 0 }} className="pos-cashier-search-row">
        <form onSubmit={handleProductBarcodeSearch} style={{ flex: "1 1 100%", display: "flex", gap: "10px", margin: 0 }} className="pos-cashier-search-form">
          <div style={{ flex: 1, position: "relative" }}>
            <Search size={15} color="#94a3b8" style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)" }} />
            <input
              ref={searchInputRef}
              type="text"
              className="input-corporate"
              style={{ paddingLeft: "30px", paddingRight: "50px", fontSize: "12px", padding: "4px 50px 4px 30px", height: "28px" }}
              placeholder="Ingrese código o nombre del producto..."
              data-shortcut-key="F2"
              data-shortcut-letter="B"
              title="Buscar producto (Alt+B)"
              value={barcodeSearch}
              onChange={(e) => setBarcodeSearch(validateTextInput(e.target.value))}
              onKeyDown={handleSearchInputKeyDown}
            />
            <span className="pos-fkey-badge" style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", fontSize: "10px", padding: "2px 6px", pointerEvents: "none" }}>Alt+B</span>
            {barcodeSearchError && <p style={styles.fieldError}>{barcodeSearchError}</p>}
          </div>
        </form>
      </div>
        {/* Dropdown de búsqueda multi-producto con chip de stock */}
      {searchResults.length > 0 && (
        <div style={styles.searchResultsDropdown} ref={searchResultsRef}>
          {searchResults.map((p, idx) => {
            const stockColor =
              p.stock === 0 ? "#b91c1c" :
              p.stock < (p.minStock || 1) ? "#d97706" :
              "#15803d";
            const stockBg =
              p.stock === 0 ? "#fee2e2" :
              p.stock < (p.minStock || 1) ? "#fef3c7" :
              "#dcfce7";
            return (
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
                  backgroundColor: idx === selectedIndex ? "#eff6ff" : "transparent",
                  outline: idx === selectedIndex ? "2px solid #3b82f6" : "none",
                  outlineOffset: "-2px",
                  borderRadius: "6px",
                  margin: "0 4px",
                  transition: "all 0.1s ease-in-out",
                }}
              >
                {/* Nombre + stock */}
                <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  <span style={{ fontWeight: "600" }}>{p.name}</span>
                  <span style={{
                    fontSize: "11px",
                    fontWeight: "700",
                    color: stockColor,
                    backgroundColor: stockBg,
                    padding: "1px 6px",
                    borderRadius: "4px",
                    display: "inline-block",
                    width: "fit-content",
                  }}>
                    {p.stock === 0 ? "❌ Sin stock" : `✅ ${p.stock} en stock`}
                  </span>
                </div>
                {/* Precio */}
                <span style={{ fontWeight: "700", color: "#0d9488", flexShrink: 0 }}>
                  ${p.sellPrice.toFixed(2)}
                </span>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}
