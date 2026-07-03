import React, { useState, useEffect } from "react";
import { SkeletonTable } from "./SkeletonTable";
import { LoadingSpinner } from "./LoadingSpinner";

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
  const isInitialLoad = loading && data.length === 0;
  const [showOverlay, setShowOverlay] = useState(false);

  useEffect(() => {
    let timer: number;
    if (loading && !isInitialLoad) {
      timer = window.setTimeout(() => setShowOverlay(true), 200);
    } else {
      setShowOverlay(false);
    }
    return () => clearTimeout(timer);
  }, [loading, isInitialLoad]);

  const tdState: React.CSSProperties = {
    textAlign: "center",
    padding: "32px 16px",
    fontSize: 13,
    fontWeight: 500,
  };

  if (isInitialLoad) {
    return <SkeletonTable columns={columns.length} rows={5} />;
  }

  return (
    <div
      style={{
        position: "relative",
        overflowX: "auto",
        overflowY: "auto",
        maxHeight,
        backgroundColor: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
        width: "100%",
      }}
    >
      {showOverlay && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(255, 255, 255, 0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10,
            backdropFilter: "blur(1px)",
            borderRadius: 12,
          }}
        >
          <LoadingSpinner size="lg" />
        </div>
      )}
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
                }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
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
          {!error &&
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
