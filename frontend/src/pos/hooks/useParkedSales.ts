import { useState, useCallback } from "react";
import api from "../../shared/services/api";

export interface ParkedSale {
  id: number;
  userId: number;
  branchId: number;
  customerId: number | null;
  cartData: string; // JSON string
  total: number;
  createdAt: string;
  customer?: { id: number; name: string };
}

export function useParkedSales(branchId: number | undefined) {
  const [parkedSales, setParkedSales] = useState<ParkedSale[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchParkedSales = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<ParkedSale[]>("/api/parked-sales");
      setParkedSales(res.data);
    } catch (err: any) {
      console.error("Error fetching parked sales:", err);
      setError(err?.response?.data?.message || "No se pudieron obtener las ventas pausadas");
    } finally {
      setLoading(false);
    }
  }, []);

  const parkSale = async (customerId: number | null, cartData: string, total: number) => {
    if (!branchId) throw new Error("branchId is missing");
    setLoading(true);
    setError(null);
    try {
      await api.post("/api/parked-sales", {
        branchId,
        customerId,
        cartData,
        total,
      }, { skipGlobalErrorToast: true });
      await fetchParkedSales(); // Refrescar lista local
    } catch (err: any) {
      console.error("Error parking sale:", err);
      throw new Error(err?.response?.data?.message || "Error al pausar la venta");
    } finally {
      setLoading(false);
    }
  };

  const deleteParkedSale = async (id: number) => {
    setLoading(true);
    setError(null);
    try {
      await api.delete(`/api/parked-sales/${id}`, { skipGlobalErrorToast: true });
      setParkedSales(prev => prev.filter(sale => sale.id !== id));
    } catch (err: any) {
      console.error("Error deleting parked sale:", err);
      throw new Error(err?.response?.data?.message || "Error al eliminar la venta pausada");
    } finally {
      setLoading(false);
    }
  };

  return {
    parkedSales,
    loading,
    error,
    fetchParkedSales,
    parkSale,
    deleteParkedSale,
  };
}
