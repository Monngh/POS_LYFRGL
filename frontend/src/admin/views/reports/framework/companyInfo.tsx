import React from "react";

// Información institucional de la empresa para portadas y pies de página.
// Ajustar a los datos legales/comerciales reales cuando estén disponibles.
export const COMPANY = {
  name: "LYFRGL Solutions POS",
  legalName: "LYFRGL Solutions, S.A. de C.V.",
  tagline: "Enterprise Point of Sale",
  rfc: "LYF000000XX0",
  website: "www.lyfrglsolutions.com",
  email: "contacto@lyfrglsolutions.com",
  phone: "+52 55 0000 0000",
};

// Logotipo (marca tipográfica) en SVG — escalable y nítido en impresión/PDF.
export const ReportLogo: React.FC<{ size?: number }> = ({ size = 54 }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-label="LYFRGL">
    <rect x="2" y="2" width="60" height="60" rx="14" fill="#0b2a5b" />
    <rect x="2" y="2" width="60" height="60" rx="14" stroke="#2563eb" strokeWidth="2.5" />
    <path d="M20 16v26h18" stroke="#ffffff" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M40 16l8 13 8-13" stroke="#60a5fa" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M48 29v13" stroke="#60a5fa" strokeWidth="5.5" strokeLinecap="round" />
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
