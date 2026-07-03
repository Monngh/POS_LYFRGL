// ============================================================================
// Framework de Reportes Empresariales — LYFRGL Solutions POS
// ----------------------------------------------------------------------------
// Punto de entrada único. El Reporte Ejecutivo es la PLANTILLA MAESTRA; todos
// los demás módulos (Ventas, Compras, Inventario, Finanzas, Bancos, Clientes,
// Proveedores, RR. HH., …) se construyen reutilizando estas piezas y aportando
// únicamente su panel de filtros, sus KPIs y sus páginas.
//
// Para crear un reporte nuevo:
//   1. Definir el estado de filtros + fetch de datos.
//   2. Construir `pages: ReportPageDef[]` usando <ReportPage>, <SectionTitle>,
//      <KpiCard>, <DonutCard>, <ReportTable>, el chartkit, etc.
//   3. Devolver <ReportShell configPanel={<ReportConfigPanel/>} doc={{...}} />.
// La portada, encabezados, pie, numeración, impresión y descarga de PDF son
// idénticos por construcción — no se reescriben.
// ============================================================================

import "./reportTheme.css";

export * from "./companyInfo";
export * from "./components";
export * from "./chartkit";
export * from "./ReportTable";
export * from "./ReportShell";
export * from "./exports";
