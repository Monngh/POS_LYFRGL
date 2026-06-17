import { useState, useCallback, useEffect, type Dispatch, type SetStateAction } from "react";
import api from "../services/api";

interface UseAdminDataOptions {
  params?: Record<string, unknown>;
  enabled?: boolean;
}

interface UseAdminDataResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
  setData: Dispatch<SetStateAction<T | null>>;
}

export function useAdminData<T>(
  endpoint: string,
  options: UseAdminDataOptions = {}
): UseAdminDataResult<T> {
  const { params, enabled = true } = options;
  const serializedParams = JSON.stringify(params);

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<T>(endpoint, { params });
      setData(res.data);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setError(axiosErr.response?.data?.message || "Error al cargar los datos.");
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint, enabled, serializedParams]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData, setData };
}
