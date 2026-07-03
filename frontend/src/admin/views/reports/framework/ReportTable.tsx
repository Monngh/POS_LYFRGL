import React from "react";

// ============================================================================
// Tabla ejecutiva declarativa — estilo idéntico en todos los reportes
// (encabezado navy, filas alternas, totales). Los módulos solo declaran
// columnas y filas; el estilo vive en reportTheme.css (.erp-table).
// ============================================================================

export type Align = "left" | "right" | "center";

export interface ReportColumn<Row = any> {
  key: string;
  header: string;
  align?: Align;
  /** Render personalizado de la celda (badges, colores, semáforos, …). */
  render?: (row: Row) => React.ReactNode;
  /** Formateo simple si no se usa `render`. */
  format?: (value: any, row: Row) => React.ReactNode;
}

const alignClass = (a?: Align) => (a === "right" ? "r" : a === "center" ? "c" : undefined);

export function ReportTable<Row = any>({
  columns,
  rows,
  total,
  totalLabel = "TOTAL",
  totalSpan = 1,
  keyOf,
}: {
  columns: ReportColumn<Row>[];
  rows: Row[];
  /** Valores de la fila de totales por `key` de columna (opcional). */
  total?: Record<string, React.ReactNode>;
  totalLabel?: string;
  totalSpan?: number;
  keyOf?: (row: Row, i: number) => React.Key;
}) {
  return (
    <table className="erp-table">
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c.key} className={alignClass(c.align)}>{c.header}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={keyOf ? keyOf(row, i) : i}>
            {columns.map((c) => (
              <td key={c.key} className={alignClass(c.align)}>
                {c.render ? c.render(row) : c.format ? c.format((row as any)[c.key], row) : (row as any)[c.key]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
      {total && (
        <tfoot>
          <tr>
            <td colSpan={totalSpan}>{totalLabel}</td>
            {columns.slice(totalSpan).map((c) => (
              <td key={c.key} className={alignClass(c.align)}>{total[c.key] ?? ""}</td>
            ))}
          </tr>
        </tfoot>
      )}
    </table>
  );
}
