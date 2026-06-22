import { useState } from "react";
import api from "../services/api";

type HttpMethod = "post" | "put" | "patch" | "delete";

interface UseApiMutationResult<T> {
  mutate: (data?: unknown) => Promise<T>;
  loading: boolean;
  error: string | null;
  reset: () => void;
}

export function useApiMutation<T>(
  endpoint: string,
  method: HttpMethod
): UseApiMutationResult<T> {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutate = async (data?: unknown): Promise<T> => {
    setLoading(true);
    setError(null);
    try {
      const res = await api[method]<T>(endpoint, data);
      return res.data;
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      const msg = axiosErr.response?.data?.message || "Error en la operación.";
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const reset = () => setError(null);

  return { mutate, loading, error, reset };
}
