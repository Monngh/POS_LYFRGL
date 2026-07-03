import React from "react";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";

// ============================================================================
// Kit de gráficas compartido para TODOS los reportes del sistema.
// Un solo lugar define paleta, ejes, rejilla, tooltips y formas de gráfica, de
// modo que las gráficas de cualquier módulo (Ventas, Compras, Inventario, …)
// se vean exactamente iguales. Los reportes solo pasan datos y formateadores.
// ============================================================================

// Paleta categórica institucional (orden FIJO, validada para daltonismo).
// El color sigue a la entidad, nunca a su posición/rango.
export const CAT = ["#2563eb", "#c2410c", "#0d9488", "#be185d", "#7c3aed"];
export const OTHER_GRAY = "#94a3b8";

export const CHART = {
  blue: "#2563eb",
  navy: "#1e4fa3",
  grid: "#e8eef7",
  tick: { fontSize: 8, fill: "#5b6b86" } as const,
};

// Formateadores comunes
export const fmtInt = (n: number) => Math.round(n).toLocaleString("es-MX");
export const fmtPct = (n: number) => `${n.toFixed(1)}%`;
export const kMoney = (v: number) => (Math.abs(v) >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v.toFixed(0)}`);
export const shortDay = (s: string) => String(s).slice(5).replace("-", "/");

// Color de método de pago por entidad (consistente entre módulos).
const PAY_ORDER = ["EFECTIVO", "TARJETA", "QR", "MERCADOPAGO", "MIXTO", "CREDITO", "PUNTOS"];
export const payColor = (metodo: string): string => {
  const idx = PAY_ORDER.findIndex((m) => metodo.toUpperCase().includes(m));
  return idx === -1 ? OTHER_GRAY : CAT[Math.min(idx, 4) % CAT.length];
};

const gridProps = (axis: "x" | "y") =>
  axis === "y" ? { vertical: false as const } : { horizontal: false as const };

// ---------------------------------------------------------------------------
// Área de tendencia (evolución temporal con relleno degradado).
// ---------------------------------------------------------------------------
export const TrendArea: React.FC<{
  data: any[]; xKey: string; yKey: string; name?: string;
  height?: number; color?: string;
  formatX?: (v: any) => string; formatY?: (v: number) => string;
  formatValue?: (v: number) => string; formatLabel?: (l: any) => string;
}> = ({ data, xKey, yKey, name = "", height = 160, color = CHART.blue, formatX = shortDay, formatY = kMoney, formatValue = kMoney, formatLabel }) => {
  const gid = "g" + React.useId().replace(/[:]/g, "");
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.4} />
            <stop offset="100%" stopColor={color} stopOpacity={0.04} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} {...gridProps("y")} />
        <XAxis dataKey={xKey} tick={CHART.tick} tickFormatter={formatX} minTickGap={20} axisLine={false} tickLine={false} />
        <YAxis tick={CHART.tick} tickFormatter={formatY} width={40} axisLine={false} tickLine={false} />
        <Tooltip formatter={(v: any) => [formatValue(Number(v)), name]} labelFormatter={formatLabel} />
        <Area type="monotone" dataKey={yKey} stroke={color} strokeWidth={2} fill={`url(#${gid})`} dot={false} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
};

// ---------------------------------------------------------------------------
// Línea de tendencia.
// ---------------------------------------------------------------------------
export const TrendLine: React.FC<{
  data: any[]; xKey: string; yKey: string; name?: string;
  height?: number; color?: string;
  formatX?: (v: any) => string; formatY?: (v: number) => string;
  formatValue?: (v: number) => string; formatLabel?: (l: any) => string;
}> = ({ data, xKey, yKey, name = "", height = 150, color = CHART.navy, formatX = shortDay, formatY = kMoney, formatValue = kMoney, formatLabel }) => (
  <ResponsiveContainer width="100%" height={height}>
    <LineChart data={data} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
      <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} {...gridProps("y")} />
      <XAxis dataKey={xKey} tick={CHART.tick} tickFormatter={formatX} minTickGap={20} axisLine={false} tickLine={false} />
      <YAxis tick={CHART.tick} tickFormatter={formatY} width={40} axisLine={false} tickLine={false} />
      <Tooltip formatter={(v: any) => [formatValue(Number(v)), name]} labelFormatter={formatLabel} />
      <Line type="monotone" dataKey={yKey} stroke={color} strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
    </LineChart>
  </ResponsiveContainer>
);

// ---------------------------------------------------------------------------
// Barras verticales (distribución por categoría discreta: hora, día, …).
// ---------------------------------------------------------------------------
export const VBars: React.FC<{
  data: any[]; xKey: string; yKey: string; name?: string;
  height?: number; color?: string; allowDecimals?: boolean; xInterval?: number; xMinTickGap?: number; yWidth?: number;
  formatX?: (v: any) => string; formatY?: (v: number) => string;
  formatValue?: (v: number) => string; formatLabel?: (l: any) => string;
}> = ({ data, xKey, yKey, name = "", height = 155, color = CHART.blue, allowDecimals, xInterval, xMinTickGap, yWidth = 38, formatX, formatY = kMoney, formatValue = kMoney, formatLabel }) => (
  <ResponsiveContainer width="100%" height={height}>
    <BarChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
      <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} {...gridProps("y")} />
      <XAxis dataKey={xKey} tick={CHART.tick} tickFormatter={formatX} interval={xInterval as any} minTickGap={xMinTickGap} axisLine={false} tickLine={false} />
      <YAxis tick={CHART.tick} tickFormatter={allowDecimals === false ? undefined : formatY} allowDecimals={allowDecimals} width={yWidth} axisLine={false} tickLine={false} />
      <Tooltip formatter={(v: any) => [formatValue(Number(v)), name]} labelFormatter={formatLabel} />
      <Bar dataKey={yKey} fill={color} radius={[3, 3, 0, 0]} isAnimationActive={false} />
    </BarChart>
  </ResponsiveContainer>
);

// ---------------------------------------------------------------------------
// Barras horizontales (ranking por importe / magnitud).
// ---------------------------------------------------------------------------
export const HBars: React.FC<{
  data: any[]; categoryKey: string; valueKey: string; name?: string;
  height?: number; color?: string; barSize?: number; yWidth?: number; yFontSize?: number;
  formatValue?: (v: number) => string; formatX?: (v: number) => string;
}> = ({ data, categoryKey, valueKey, name = "", height = 158, color = CHART.navy, barSize = 12, yWidth = 86, yFontSize = 8, formatValue = kMoney, formatX = kMoney }) => (
  <ResponsiveContainer width="100%" height={height}>
    <BarChart data={data} layout="vertical" margin={{ top: 2, right: 14, left: 4, bottom: 0 }}>
      <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} {...gridProps("x")} />
      <XAxis type="number" tick={CHART.tick} tickFormatter={formatX} axisLine={false} tickLine={false} />
      <YAxis type="category" dataKey={categoryKey} tick={{ ...CHART.tick, fontSize: yFontSize }} width={yWidth} axisLine={false} tickLine={false} />
      <Tooltip formatter={(v: any) => [formatValue(Number(v)), name]} />
      <Bar dataKey={valueKey} fill={color} radius={[0, 3, 3, 0]} barSize={barSize} isAnimationActive={false} />
    </BarChart>
  </ResponsiveContainer>
);

// ---------------------------------------------------------------------------
// Mapa de calor (secuencial azul) — matriz filas × 24 horas.
// ---------------------------------------------------------------------------
export const Heatmap: React.FC<{
  matrix: number[][]; rowLabels: string[]; format: (v: number) => string;
}> = ({ matrix, rowLabels, format }) => {
  let max = 0;
  for (const row of matrix) for (const v of row) if (v > max) max = v;
  const color = (v: number) => (v <= 0 ? "#f1f5f9" : `rgba(37, 99, 235, ${(0.12 + 0.88 * (v / (max || 1))).toFixed(3)})`);
  return (
    <>
      <div className="erp-heat">
        <div />
        {Array.from({ length: 24 }, (_, h) => (
          <div className="erp-heat-axis" key={h} style={{ justifyContent: "center" }}>{h % 2 === 0 ? h : ""}</div>
        ))}
        {matrix.map((row, r) => (
          <React.Fragment key={r}>
            <div className="erp-heat-axis">{rowLabels[r]}</div>
            {row.map((v, h) => (
              <div className="erp-heat-cell" key={h} style={{ background: color(v) }} title={`${rowLabels[r]} ${h}:00 — ${format(v)}`} />
            ))}
          </React.Fragment>
        ))}
      </div>
      <div className="erp-heat-legend">
        Menor
        {[0.12, 0.34, 0.56, 0.78, 1].map((a) => (
          <span className="step" key={a} style={{ background: `rgba(37,99,235,${a})` }} />
        ))}
        Mayor
      </div>
    </>
  );
};
