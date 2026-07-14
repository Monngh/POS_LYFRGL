import React, { useState, useEffect, useRef } from "react";
import { Search } from "lucide-react";
import { PosModal } from "./shared";
import api from "../../../shared/services/api";

interface LookupProduct {
  id: number;
  name: string;
  sellPrice: number;
  stock: number;
}

interface PriceLookupModalProps {
  isOpen: boolean;
  onClose: () => void;
  lookupQuery: string;
  onQueryChange: (value: string) => void;
  lookupCategory: string;
  onCategoryChange: (value: string) => void;
  lookupResults: LookupProduct[];
  onLookupKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  lookupSelectionIndex?: number;
  setLookupSelectionIndex?: (n: number) => void;
}

export default function PriceLookupModal({
  isOpen,
  onClose,
  lookupQuery,
  onQueryChange,
  lookupCategory,
  onCategoryChange,
  lookupResults,
  onLookupKeyDown,
  lookupSelectionIndex,
  setLookupSelectionIndex,
}: PriceLookupModalProps) {
  const tbodyRef = React.useRef<HTMLTableSectionElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [categories, setCategories] = useState<{id: number, name: string}[]>([]);
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const [categorySearch, setCategorySearch] = useState("");
  const [categoryNavIdx, setCategoryNavIdx] = useState(-1);

  useEffect(() => {
    if (isOpen) {
      api.get("/api/products/categories").then(res => {
        setCategories(res.data.categories || []);
      }).catch(err => console.error("Error cargando categorias", err));
    }
  }, [isOpen]);

  useEffect(() => {
    if (lookupCategory === "") {
      setCategorySearch("");
    } else {
      const match = categories.find(c => c.id.toString() === lookupCategory);
      if (match) {
        setCategorySearch(match.name);
      }
    }
  }, [lookupCategory, categories]);

  // Reset nav index when dropdown opens or category search changes
  useEffect(() => {
    if (isCategoryDropdownOpen) setCategoryNavIdx(-1);
  }, [isCategoryDropdownOpen, categorySearch]);

  // Scroll highlighted category option into view
  useEffect(() => {
    if (!isCategoryDropdownOpen || categoryNavIdx < 0) return;
    const dropdown = dropdownRef.current;
    if (!dropdown) return;
    const items = dropdown.querySelectorAll<HTMLDivElement>("[data-cat-idx]");
    const item = items[categoryNavIdx];
    if (item) item.scrollIntoView({ block: "nearest" });
  }, [categoryNavIdx, isCategoryDropdownOpen]);

  const filteredOptions = categorySearch
    ? categories.filter(c => c.name.toLowerCase().includes(categorySearch.toLowerCase()))
    : categories;

  const selectCategory = (id: string, name: string) => {
    onCategoryChange(id);
    setCategorySearch(name || "");
    setIsCategoryDropdownOpen(false);
    // Auto-focus the product search input after selecting a category
    setTimeout(() => searchInputRef.current?.focus(), 50);
  };

  const dropdownOptions: { id: string; name: string }[] = [
    { id: "", name: "Todas las categorías" },
    ...filteredOptions.map(c => ({ id: c.id.toString(), name: c.name })),
  ];

  const handleCategoryKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isCategoryDropdownOpen) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter") {
        setIsCategoryDropdownOpen(true);
        e.preventDefault();
      }
      return;
    }

    const count = dropdownOptions.length;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCategoryNavIdx(prev => (prev + 1) % count);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCategoryNavIdx(prev => (prev - 1 + count) % count);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (categoryNavIdx >= 0 && categoryNavIdx < count) {
        const opt = dropdownOptions[categoryNavIdx];
        selectCategory(opt.id, opt.id === "" ? "" : opt.name);
      } else {
        setIsCategoryDropdownOpen(false);
        setTimeout(() => searchInputRef.current?.focus(), 50);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setIsCategoryDropdownOpen(false);
    } else if (e.key === "Tab") {
      setIsCategoryDropdownOpen(false);
    }
  };

  // Keep the highlighted result visible while navigating with arrows.
  useEffect(() => {
    if (!isOpen) return;
    if (lookupSelectionIndex == null || lookupSelectionIndex < 0) return;
    const tbody = tbodyRef.current;
    if (!tbody) return;
    const row = tbody.children[lookupSelectionIndex] as HTMLElement | undefined;
    if (row) row.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [isOpen, lookupSelectionIndex, lookupResults]);

  const footer = (
    <>
      <button
        onClick={onClose} 
        data-shortcut="cancel"
        data-shortcut-letter="X"
        title="Cancelar / Cerrar (Esc)"
        style={{ padding: "10px 24px", borderRadius: "8px", border: "1px solid var(--border)", backgroundColor: "transparent", color: "var(--text)", fontWeight: "600", cursor: "pointer" }}
      >
        Cerrar
      </button>
    </>
  );

  return (
    <PosModal
      isOpen={isOpen}
      onClose={onClose}
      title="Consultar precio"
      subtitle="Busca un producto para ver su precio y disponibilidad."
      icon={<Search size={24} />}
      iconColor="#2563eb"
      size="md"
      footer={footer}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "16px", padding: "8px 0" }}>
        <div style={{ display: "flex", gap: "12px" }}>
          {/* Category Dropdown with keyboard navigation */}
            <div style={{ position: "relative", minWidth: "220px" }}>
              <input
                type="text"
                data-shortcut-letter="C"
                title="Buscar categoría (Alt+C)"
                style={{
                  width: "100%",
                  padding: "12px 60px 12px 16px",
                  borderRadius: "8px",
                  border: "1px solid var(--border)",
                  backgroundColor: "var(--surface-2)",
                  color: "var(--text)",
                  fontSize: "14px",
                  outline: "none",
                  cursor: "pointer",
                  boxSizing: "border-box",
                }}
                placeholder="Todas las categorías"
                value={categorySearch}
                onFocus={() => setIsCategoryDropdownOpen(true)}
                onBlur={(e) => {
                  // Only close if focus moves away from the dropdown itself
                  if (!dropdownRef.current?.contains(e.relatedTarget as Node)) {
                    setIsCategoryDropdownOpen(false);
                  }
                }}
                onChange={(e) => {
                  const val = e.target.value;
                  setCategorySearch(val);
                  setIsCategoryDropdownOpen(true);
                  if (val === "") {
                    onCategoryChange("");
                  }
                }}
                onKeyDown={handleCategoryKeyDown}
              />
              <span className="pos-fkey-badge" style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", fontSize: "10px", padding: "2px 6px", pointerEvents: "none", whiteSpace: "nowrap" }}>Alt+C</span>
            </div>

            {isCategoryDropdownOpen && (
              <div
                ref={dropdownRef}
                style={{
                  position: "absolute",
                  top: "calc(100% + 4px)",
                  left: 0,
                  width: "100%",
                  maxHeight: "200px",
                  overflowY: "auto",
                  backgroundColor: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
                  zIndex: 1000,
                }}
                onMouseDown={(e) => e.preventDefault()} // prevent blur on input
              >
                {dropdownOptions.map((opt, idx) => (
                  <div
                    key={opt.id}
                    data-cat-idx={idx}
                    style={{
                      padding: "10px 16px",
                      fontSize: "14px",
                      color: "var(--text)",
                      cursor: "pointer",
                      backgroundColor:
                        idx === categoryNavIdx
                          ? "var(--surface-3)"
                          : lookupCategory === opt.id
                          ? "rgba(37,99,235,0.08)"
                          : "transparent",
                      borderLeft: lookupCategory === opt.id ? "3px solid #2563eb" : "3px solid transparent",
                      transition: "background-color 0.12s",
                    }}
                    onMouseEnter={() => setCategoryNavIdx(idx)}
                    onMouseDown={() => selectCategory(opt.id, opt.id === "" ? "" : opt.name)}
                  >
                    {opt.name}
                  </div>
                ))}
                {filteredOptions.length === 0 && categorySearch !== "" && (
                  <div style={{ padding: "10px 16px", fontSize: "12px", color: "var(--text-muted)", fontStyle: "italic" }}>
                    No se encontraron categorías
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Product search input */}
          <input
            ref={searchInputRef}
            type="text"
            style={{ flex: 1, padding: "12px 16px", borderRadius: "8px", border: "1px solid var(--border)", backgroundColor: "var(--surface-2)", color: "var(--text)", fontSize: "14px", outline: "none" }}
            placeholder="Buscar por código, nombre o código de barras..."
            value={lookupQuery}
            onKeyDown={onLookupKeyDown}
            onChange={(e) => onQueryChange(e.target.value)}
            autoFocus
          />
        </div>

        {lookupResults.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-muted)", display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
             <Search size={48} style={{ opacity: 0.2 }} />
             <p style={{ margin: 0, fontWeight: "600", color: "var(--text)" }}>Ingresa un criterio de búsqueda</p>
             <p style={{ margin: 0, fontSize: "13px" }}>Busca un producto por código, nombre o escanea el código de barras.</p>
          </div>
        ) : (
          <div style={{ maxHeight: "240px", overflowX: "auto", overflowY: "auto", border: "1px solid var(--border)", borderRadius: "8px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", backgroundColor: "var(--surface-2)" }}>
                  <th style={{ padding: "12px 16px", fontSize: "12px", fontWeight: "600", color: "var(--text-secondary)" }}>Producto</th>
                  <th style={{ padding: "12px 16px", fontSize: "12px", fontWeight: "600", color: "var(--text-secondary)" }}>Precio</th>
                  <th style={{ padding: "12px 16px", fontSize: "12px", fontWeight: "600", color: "var(--text-secondary)" }}>Existencia</th>
                </tr>
              </thead>
              <tbody ref={tbodyRef}>
                    {lookupResults.map((p, idx) => (
                      <tr key={p.id} style={{ borderBottom: "1px solid var(--border-strong)", backgroundColor: lookupSelectionIndex === idx ? "var(--surface-2)" : "transparent" }} onMouseEnter={() => setLookupSelectionIndex?.(idx)}>
                        <td style={{ padding: "12px 16px", fontSize: "14px", color: "var(--text)", fontWeight: "500" }}>{p.name}</td>
                        <td style={{ padding: "12px 16px", fontSize: "14px", color: "var(--text)", fontWeight: "600" }}>${p.sellPrice.toFixed(2)}</td>
                        <td style={{ padding: "12px 16px", fontSize: "14px", color: "var(--text)" }}>{p.stock}</td>
                      </tr>
                    ))}
                  </tbody>
            </table>
          </div>
        )}
      </div>
    </PosModal>
  );
}
