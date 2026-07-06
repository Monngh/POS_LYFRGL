import React, { useState, useEffect } from "react";
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
  const [categories, setCategories] = useState<{id: number, name: string}[]>([]);
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const [categorySearch, setCategorySearch] = useState("");

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

  const filteredCategories = categories.filter(c =>
    c.name.toLowerCase().includes(categorySearch.toLowerCase())
  );

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
          <div style={{ position: "relative", minWidth: "220px" }}>
            <input
              type="text"
              style={{
                width: "100%",
                padding: "12px 16px",
                borderRadius: "8px",
                border: "1px solid var(--border)",
                backgroundColor: "var(--surface-2)",
                color: "var(--text)",
                fontSize: "14px",
                outline: "none",
                cursor: "pointer",
              }}
              placeholder="Todas las categorías"
              value={categorySearch}
              onFocus={() => setIsCategoryDropdownOpen(true)}
              onBlur={() => setIsCategoryDropdownOpen(false)}
              onChange={(e) => {
                const val = e.target.value;
                setCategorySearch(val);
                if (val === "") {
                  onCategoryChange("");
                }
              }}
            />
            {isCategoryDropdownOpen && (
              <div
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
              >
                <div
                  style={{
                    padding: "10px 16px",
                    fontSize: "14px",
                    color: "var(--text)",
                    cursor: "pointer",
                    backgroundColor: lookupCategory === "" ? "var(--surface-3)" : "transparent",
                  }}
                  onMouseDown={() => {
                    onCategoryChange("");
                    setCategorySearch("");
                    setIsCategoryDropdownOpen(false);
                  }}
                >
                  Todas las categorías
                </div>
                {filteredCategories.map(c => (
                  <div
                    key={c.id}
                    style={{
                      padding: "10px 16px",
                      fontSize: "14px",
                      color: "var(--text)",
                      cursor: "pointer",
                      backgroundColor: lookupCategory === c.id.toString() ? "var(--surface-3)" : "transparent",
                    }}
                    onMouseDown={() => {
                      onCategoryChange(c.id.toString());
                      setCategorySearch(c.name);
                      setIsCategoryDropdownOpen(false);
                    }}
                  >
                    {c.name}
                  </div>
                ))}
                {filteredCategories.length === 0 && categorySearch !== "" && (
                  <div style={{ padding: "10px 16px", fontSize: "12px", color: "var(--text-muted)", fontStyle: "italic" }}>
                    No se encontraron categorías
                  </div>
                )}
              </div>
            )}
          </div>

          <input
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
