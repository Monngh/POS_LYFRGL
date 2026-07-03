import React from "react";

// Identidad institucional para portadas y pies de página de los reportes.
// Ajustar a los datos legales/comerciales reales cuando estén disponibles.
export const COMPANY = {
  name: "LYFRGL Solutions POS",
  legalName: "LYFRGL Solutions, S.A. de C.V.",
  tagline: "Enterprise Point of Sale",
  website: "www.lyfrglsolutions.com",
};

export const REPORT_VERSION = "2.0";

// Logotipo (marca en SVG) — vectorial: nítido en pantalla, impresión y PDF.
export const ReportLogo: React.FC<{ size?: number }> = ({ size = 54 }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-label="LYFRGL Solutions POS">
    <rect x="2" y="2" width="60" height="60" rx="14" fill="#0b2a5b" />
    <rect x="2" y="2" width="60" height="60" rx="14" stroke="#2563eb" strokeWidth="2.5" />
    <path d="M20 16v26h18" stroke="#ffffff" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M40 16l8 13 8-13" stroke="#7fa8ef" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M48 29v13" stroke="#7fa8ef" strokeWidth="5.5" strokeLinecap="round" />
  </svg>
);

// Folio legible y único por generación de reporte.
export const buildFolio = (prefix: string): string => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${stamp}-${rand}`;
};
