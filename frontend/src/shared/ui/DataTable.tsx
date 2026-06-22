import React from "react";

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T, index: number) => React.ReactNode;
  width?: string;
  align?: "left" | "center" | "right";
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  error?: string | null;
  emptyMessage?: string;
  keyExtractor: (row: T, index: number) => string | number;
  maxHeight?: string;
}

export function DataTable<T>({
  columns,
  data,
  loading,
  error,
  emptyMessage = "No hay registros para mostrar.",
  keyExtractor,
  maxHeight = "62vh",
}: DataTableProps<T>) {
  const colSpan = columns.length;

  const tdState: React.CSSProperties = {
    textAlign: "center",
    padding: "32px 16px",
    fontSize: 13,
    fontWeight: 500,
  };

  return (
    <div
      style={{
        overflowX: "auto",
        overflowY: "auto",
        maxHeight,
        backgroundColor: "#ffffff",
        border: "1px solid #e2e8f0",
        borderRadius: 12,
        boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
        width: "100%",
      }}
    >
      <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
        <thead>
          <tr style={{ backgroundColor: "#f1f5f9", borderBottom: "1px solid #e2e8f0" }}>
            {columns.map((col) => (
              <th
                key={col.key}
                style={{
                  padding: "12px 16px",
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#64748b",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  borderBottom: "1px solid #e2e8f0",
                  textAlign: col.align ?? "left",
                  width: col.width,
                  whiteSpace: "nowrap",
                }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr>
              <td colSpan={colSpan} style={{ ...tdState, color: "#64748b" }}>
                Cargando...
              </td>
            </tr>
          )}
          {!loading && error && (
            <tr>
              <td colSpan={colSpan} style={{ ...tdState, color: "#dc2626" }}>
                {error}
              </td>
            </tr>
          )}
          {!loading && !error && data.length === 0 && (
            <tr>
              <td colSpan={colSpan} style={{ ...tdState, color: "#64748b" }}>
                {emptyMessage}
              </td>
            </tr>
          )}
          {!loading &&
            !error &&
            data.map((row, index) => (
              <tr key={keyExtractor(row, index)}>
                {columns.map((col) => (
                  <td
                    key={col.key}
                    style={{
                      padding: "12px 16px",
                      borderBottom: "1px solid #e2e8f0",
                      fontSize: 14,
                      color: "#0f172a",
                      textAlign: col.align ?? "left",
                    }}
                  >
                    {col.render
                      ? col.render(row, index)
                      : String((row as Record<string, unknown>)[col.key] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
