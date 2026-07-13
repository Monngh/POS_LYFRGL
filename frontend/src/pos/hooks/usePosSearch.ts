import { useState, useEffect, useRef, type KeyboardEvent } from "react";
import api from "../../shared/services/api";
import { validateSearchText } from "../../shared/utils/formValidation";

interface Product {
  id: number;
  sku: string;
  barcode: string;
  name: string;
  description: string;
  costPrice: number;
  sellPrice: number;
  stock: number;
  minStock: number;
  activePromotion?: {
    id: number;
    name: string;
    type: string;
    value: number | null;
    minQuantity: number | null;
    payQuantity: number | null;
    specialPrice: number | null;
  } | null;
}

interface UsePosSearchProps {
  view: "apertura" | "sales-terminal";
  activeModal: string | null;
  onProductFound: (product: Product) => void;
}

export function usePosSearch({ view, activeModal, onProductFound }: UsePosSearchProps) {
  const [lookupQuery, setLookupQuery] = useState("");
  const [lookupCategory, setLookupCategory] = useState<string>("");
  const [lookupResults, setLookupResults] = useState<Product[]>([]);
  const [lookupSelectionIndex, setLookupSelectionIndex] = useState<number>(-1);
  const [barcodeSearch, setBarcodeSearch] = useState("");
  const [barcodeSearchError, setBarcodeSearchError] = useState("");
  const [searchResults, setSearchResults] = useState<Product[]>([]);

  const lastLookupQueryRef = useRef("___RESET___");
  const lastLookupCategoryRef = useRef("");
  const lastSearchQueryRef = useRef("");

  const handleLookupSearch = async (forceQuery?: string, forceCategory?: string) => {
    const query = (forceQuery !== undefined ? forceQuery : lookupQuery).trim();
    const category = (forceCategory !== undefined ? forceCategory : lookupCategory);
    
    // Si la búsqueda es idéntica a la última, no hacer nada
    if (query === lastLookupQueryRef.current && category === lastLookupCategoryRef.current) return;
    
    lastLookupQueryRef.current = query;
    lastLookupCategoryRef.current = category;
    
    try {
      let url = `/api/products/search?query=${query}`;
      if (category) url += `&categoryId=${category}`;
      const res = await api.get(url);
      setLookupResults(res.data.products);
    } catch (err) {
      console.error("Error al buscar productos:", err);
    }
  };

  const handleLookupKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setLookupSelectionIndex((prev) => Math.min(prev + 1, lookupResults.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setLookupSelectionIndex((prev) => Math.max(prev - 1, 0));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      // If there's a selection, choose it
      if (lookupSelectionIndex >= 0 && lookupSelectionIndex < lookupResults.length) {
        const prod = lookupResults[lookupSelectionIndex];
        onProductFound(prod);
        setLookupResults([]);
        setLookupSelectionIndex(-1);
        setLookupQuery("");
        return;
      }
      handleLookupSearch();
    }
  };

  const resetLookup = () => {
    setLookupQuery("");
    setLookupCategory("");
    setLookupResults([]);
    lastLookupQueryRef.current = "___RESET___";
  };

  const resetSearch = () => {
    setBarcodeSearch("");
    setSearchResults([]);
    lastSearchQueryRef.current = "";
  };

  const handleProductBarcodeSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = barcodeSearch.trim();
    const searchError = validateSearchText(query, "La busqueda de producto", { max: 120 });
    setBarcodeSearchError(searchError || "");
    if (searchError) return;
    if (!query) return;
    if (query === lastSearchQueryRef.current) return;
    lastSearchQueryRef.current = query;
    try {
      const res = await api.get(`/api/products/search?query=${query}`);
      const list: Product[] = res.data.products;
      if (list.length === 1) {
        onProductFound(list[0]);
        setBarcodeSearch("");
        setSearchResults([]);
        lastSearchQueryRef.current = "";
      } else {
        setSearchResults(list);
      }
    } catch (err) {
      console.error("Error al buscar producto:", err);
    }
  };

  // Debounce del price lookup
  useEffect(() => {
    if (activeModal === "price-lookup") {
      const query = lookupQuery.trim();
      const delayDebounce = setTimeout(() => {
        handleLookupSearch(query);
      }, 300);
      return () => clearTimeout(delayDebounce);
    } else {
      lastLookupQueryRef.current = "___RESET___";
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookupQuery, activeModal]);

  // Debounce de búsqueda de productos en terminal
  useEffect(() => {
    if (view !== "sales-terminal") return;
    const query = barcodeSearch.trim();
    const searchError = validateSearchText(query, "La busqueda de producto", { max: 120 });
    setBarcodeSearchError(searchError || "");
    if (!query) {
      setSearchResults([]);
      lastSearchQueryRef.current = "";
      return;
    }
    if (searchError) {
      setSearchResults([]);
      lastSearchQueryRef.current = "";
      return;
    }

    const timer = setTimeout(async () => {
      if (query === lastSearchQueryRef.current) return;
      lastSearchQueryRef.current = query;
      try {
        const res = await api.get(`/api/products/search?query=${query}`);
        const list: Product[] = res.data.products;
        // En búsqueda predictiva NO auto-agregamos para no interrumpir la escritura del cajero.
        setSearchResults(list);
      } catch (err) {
        console.error("Error al buscar producto automáticamente:", err);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [barcodeSearch, view]);

  return {
    lookupQuery,
    setLookupQuery,
    lookupCategory,
    setLookupCategory,
    lookupResults,
    setLookupResults,
    barcodeSearch,
    setBarcodeSearch,
    barcodeSearchError,
    setBarcodeSearchError,
    searchResults,
    setSearchResults,
    lastSearchQueryRef,
    handleLookupSearch,
    handleLookupKeyDown,
    lookupSelectionIndex,
    setLookupSelectionIndex,
    handleProductBarcodeSearch,
    resetLookup,
    resetSearch,
  };
}
