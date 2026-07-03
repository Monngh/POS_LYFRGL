// ============================================================================
// Exportación de reportes: CSV, Excel con estilos (ExcelJS, carga diferida)
// y PDF mediante impresión nativa (Print CSS A4 — sin html2canvas).
// ============================================================================

export type ColType = "text" | "money" | "number" | "int" | "pct";

export interface ExportColumn {
  header: string;
  key: string;
  type?: ColType;
  width?: number;
}

export interface ExportSheet {
  name: string;
  title?: string;
  columns: ExportColumn[];
  rows: Record<string, any>[];
  totals?: Record<string, number>;
}

const saveBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
};

// ----------------------------- CSV ----------------------------------------
export const exportCsv = (filename: string, columns: ExportColumn[], rows: Record<string, any>[]) => {
  const esc = (v: any) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = columns.map((c) => esc(c.header)).join(",");
  const body = rows.map((r) => columns.map((c) => esc(r[c.key])).join(",")).join("\n");
  const csv = "﻿" + head + "\n" + body; // BOM para acentos en Excel
  saveBlob(new Blob([csv], { type: "text/csv;charset=utf-8;" }), filename.endsWith(".csv") ? filename : `${filename}.csv`);
};

// ----------------------------- Excel (ExcelJS con estilos) -----------------
const NAVY = "FF0B2A5B";
const SOFT = "FFEFF4FB";

const numFmt = (t?: ColType) =>
  t === "money" ? '"$"#,##0.00' : t === "int" ? "#,##0" : t === "pct" ? '0.0"%"' : t === "number" ? "#,##0.00" : undefined;

export const exportExcel = async (filename: string, sheets: ExportSheet[], meta?: Record<string, string>) => {
  const mod: any = await import("exceljs");
  const ExcelJS: any = mod.default ?? mod;
  const wb = new ExcelJS.Workbook();
  wb.creator = "LYFRGL Solutions POS";
  wb.created = new Date();

  if (meta && Object.keys(meta).length) {
    const ws = wb.addWorksheet("Información");
    ws.columns = [{ width: 26 }, { width: 64 }];
    ws.addRow(["LYFRGL Solutions POS"]).font = { bold: true, size: 16, color: { argb: NAVY } };
    ws.addRow([]);
    for (const [k, v] of Object.entries(meta)) {
      const row = ws.addRow([k, v]);
      row.getCell(1).font = { bold: true, color: { argb: NAVY } };
    }
  }

  for (const sheet of sheets) {
    const ws = wb.addWorksheet(sheet.name.slice(0, 31));
    let r = 1;
    if (sheet.title) {
      ws.mergeCells(1, 1, 1, sheet.columns.length);
      const c = ws.getCell(1, 1);
      c.value = sheet.title;
      c.font = { bold: true, size: 13, color: { argb: NAVY } };
      r = 3;
    }
    const headerRow = ws.getRow(r);
    sheet.columns.forEach((col, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = col.header;
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
      cell.alignment = { vertical: "middle", horizontal: col.type && col.type !== "text" ? "right" : "left" };
      ws.getColumn(i + 1).width = col.width ?? Math.max(13, col.header.length + 4);
    });
    headerRow.height = 20;

    sheet.rows.forEach((row, idx) => {
      const xr = ws.getRow(r + 1 + idx);
      sheet.columns.forEach((col, i) => {
        const cell = xr.getCell(i + 1);
        cell.value = row[col.key] ?? (col.type && col.type !== "text" ? 0 : "");
        const fmt = numFmt(col.type);
        if (fmt) cell.numFmt = fmt;
        if (col.type && col.type !== "text") cell.alignment = { horizontal: "right" };
        if (idx % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SOFT } };
      });
    });

    if (sheet.totals) {
      const tr = ws.getRow(r + 1 + sheet.rows.length);
      sheet.columns.forEach((col, i) => {
        const cell = tr.getCell(i + 1);
        if (i === 0) cell.value = "TOTAL";
        else if (sheet.totals![col.key] !== undefined) {
          cell.value = sheet.totals![col.key];
          const fmt = numFmt(col.type);
          if (fmt) cell.numFmt = fmt;
        }
        cell.font = { bold: true, color: { argb: NAVY } };
        cell.border = { top: { style: "medium", color: { argb: NAVY } } };
        if (col.type && col.type !== "text") cell.alignment = { horizontal: "right" };
      });
    }
    ws.views = [{ state: "frozen", ySplit: r }];
  }

  const buf = await wb.xlsx.writeBuffer();
  saveBlob(
    new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`,
  );
};

// ----------------------------- PDF (Print CSS nativo) ----------------------
export const printReport = () => {
  // @media print de reportTheme.css aísla el documento (.erp-doc), fija @page
  // A4 y pagina por .erp-page → PDF idéntico al diseño, con texto seleccionable.
  window.print();
};
