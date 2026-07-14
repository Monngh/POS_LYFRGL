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
  height?: string;
}

export function DataTable<T>({
  columns,
  data,
  loading,
  error,
  emptyMessage = "No hay registros para mostrar.",
  keyExtractor,
  maxHeight = "62vh",
  height,
}: DataTableProps<T>) {
  const colSpan = columns.length;

  const tdState: React.CSSProperties = {
    textAlign: "center",
    padding: "32px 16px",
    fontSize: 13,
    fontWeight: 500,
  };

  const card = (
    <div
      className="premium-scrollbar"
      style={{
        overflowX: "auto",
        overflowY: "auto",
        maxHeight: height ? "100%" : maxHeight,
        backgroundColor: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
        width: "100%",
      }}
    >
      <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
        <thead>
          <tr style={{ backgroundColor: "var(--surface-3)", borderBottom: "1px solid var(--border)" }}>
            {columns.map((col) => (
              <th
                key={col.key}
                style={{
                  padding: "12px 16px",
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  borderBottom: "1px solid var(--border)",
                  textAlign: col.align ?? "left",
                  width: col.width,
                  whiteSpace: "nowrap",
                  position: "sticky",
                  top: 0,
                  zIndex: 10,
                  backgroundColor: "var(--surface-3)",
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
              <td colSpan={colSpan} style={{ ...tdState, color: "var(--text-muted)" }}>
                Cargando...
              </td>
            </tr>
          )}
          {!loading && error && (
            <tr>
              <td colSpan={colSpan} style={{ ...tdState, color: "var(--color-danger)" }}>
                {error}
              </td>
            </tr>
          )}
          {!loading && !error && data.length === 0 && (
            <tr>
              <td colSpan={colSpan} style={{ ...tdState, color: "var(--text-muted)" }}>
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
                      borderBottom: "1px solid var(--border)",
                      fontSize: 14,
                      color: "var(--text)",
                      textAlign: col.align ?? "left",
                      verticalAlign: "middle",
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

  // When 'height' is provided, wrap in a transparent spacer that reserves the fixed
  // height so pagination stays consistently positioned. The card inside only grows
  // as tall as its content — hiding the empty background space below it.
  if (height) {
    return (
      <div style={{ height, display: "flex", flexDirection: "column", justifyContent: "flex-start" }}>
        {card}
      </div>
    );
  }

  return card;
}
