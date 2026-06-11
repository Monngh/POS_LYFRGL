import {
  BarChart3,
  Receipt,
  Package,
  Boxes,
  ClipboardList,
  Truck,
  Activity,
  UserCheck,
  Wallet,
  CalendarClock,
  type LucideIcon,
} from "lucide-react";
import { money, moneyExact, statusTone, payTone, roleTone } from "../shared";

type Tone = "green" | "red" | "amber" | "blue" | "slate";
export type Align = "left" | "right" | "center";
export type CellType = "text" | "money" | "number" | "date" | "datetime" | "badge";

export interface Column {
  key: string;
  label: string;
  align?: Align;
  type?: CellType;
  value?: (row: any) => any; // valor calculado / anidado (ej. row.supplier.name)
  badgeTone?: (row: any) => Tone;
  width?: number;
}

export type FilterKind = "dateRange" | "status" | "movementType" | "search";

export interface ReportFilters {
  from: string;
  to: string;
  status: string;
  movementType: string;
  search: string;
}

export interface ReportDef {
  key: string;
  title: string;
  description: string;
  category: string;
  icon: LucideIcon;
  available: boolean;
  kind: "summary" | "table";
  endpoint?: string;
  rows?: (res: any) => any[];
  columns?: Column[];
  filters?: FilterKind[];
  statusOptions?: { value: string; label: string }[];
  movementOptions?: { value: string; label: string }[];
  kpis?: (res: any, rows: any[]) => { label: string; value: string }[];
  params?: (f: ReportFilters, branchId: string) => Record<string, any>;
  clientFilter?: (rows: any[], f: ReportFilters) => any[];
  branchScoped?: boolean;
}

const kardexTone = (t: string): Tone => {
  if (t === "COMPRA" || t === "DEVOLUCION" || t === "TRASPASO_ENTRADA") return "green";
  if (t === "VENTA" || t === "TRASPASO_SALIDA" || t === "AJUSTE_MERMA") return "red";
  if (t.startsWith("AJUSTE")) return "amber";
  return "slate";
};

const purchaseTone = (s: string): Tone => (s === "RECIBIDA" ? "green" : s === "CANCELADA" ? "red" : "amber");

const branchParam = (branchId: string) => (branchId !== "all" ? { branchId } : {});
const rangeParam = (f: ReportFilters) => ({ ...(f.from ? { from: f.from } : {}), ...(f.to ? { to: f.to } : {}) });

const sum = (rows: any[], key: string) => rows.reduce((a, r) => a + (Number(r[key]) || 0), 0);

// ===========================================================================
// CATÁLOGO DE REPORTES
// ===========================================================================
export const REPORTS: ReportDef[] = [
  // ---- VENTAS ----
  {
    key: "resumen",
    title: "Resumen ejecutivo",
    description: "Indicadores globales: ventas netas, utilidad, impuestos, métodos de pago y top productos.",
    category: "Ventas y operación",
    icon: BarChart3,
    available: true,
    kind: "summary",
    branchScoped: true,
  },
  {
    key: "ventas",
    title: "Venta",
    description: "Listado detallado de transacciones de venta por periodo, con folio, cliente, vendedor y totales.",
    category: "Ventas y operación",
    icon: Receipt,
    available: true,
    kind: "table",
    endpoint: "/api/admin/reports/sales",
    rows: (r) => r.rows ?? [],
    branchScoped: true,
    filters: ["dateRange", "status"],
    statusOptions: [
      { value: "all", label: "Todos los estados" },
      { value: "COMPLETADA", label: "Completadas" },
      { value: "CANCELADA", label: "Canceladas" },
    ],
    params: (f, b) => ({ ...rangeParam(f), ...branchParam(b), ...(f.status !== "all" ? { status: f.status } : {}) }),
    columns: [
      { key: "invoiceNumber", label: "Folio" },
      { key: "createdAt", label: "Fecha", type: "datetime" },
      { key: "branch", label: "Sucursal" },
      { key: "cajero", label: "Vendedor" },
      { key: "customer", label: "Cliente" },
      { key: "items", label: "Artículos", type: "number", align: "center" },
      { key: "paymentMethod", label: "Método", type: "badge", align: "center", badgeTone: (r) => payTone(r.paymentMethod) },
      { key: "subtotal", label: "Subtotal", type: "money", align: "right" },
      { key: "taxAmount", label: "Impuestos", type: "money", align: "right" },
      { key: "totalAmount", label: "Total", type: "money", align: "right" },
      { key: "status", label: "Estado", type: "badge", align: "center", badgeTone: (r) => statusTone(r.status) },
    ],
    kpis: (res) => {
      const t = res.totals ?? {};
      return [
        { label: "Tickets", value: String(t.ticketCount ?? 0) },
        { label: "Total neto", value: money(t.totalNeto ?? 0) },
        { label: "Impuestos", value: money(t.impuestos ?? 0) },
        { label: "Descuentos", value: money(t.descuentos ?? 0) },
        { label: "Ticket promedio", value: money(t.ticketPromedio ?? 0) },
        { label: "Canceladas", value: String(t.canceladas ?? 0) },
      ];
    },
  },
  {
    key: "articulos",
    title: "Artículos vendidos",
    description: "Ranking de productos: unidades, transacciones, precio promedio, importe y utilidad generada.",
    category: "Ventas y operación",
    icon: Package,
    available: true,
    kind: "table",
    endpoint: "/api/admin/reports/products-sold",
    rows: (r) => r.rows ?? [],
    branchScoped: true,
    filters: ["dateRange"],
    params: (f, b) => ({ ...rangeParam(f), ...branchParam(b) }),
    columns: [
      { key: "rank", label: "#", type: "number", align: "center", width: 50 },
      { key: "name", label: "Producto" },
      { key: "sku", label: "SKU" },
      { key: "cantidad", label: "Cantidad", type: "number", align: "center" },
      { key: "transacciones", label: "Transacciones", type: "number", align: "center" },
      { key: "precioPromedio", label: "Precio prom.", type: "money", align: "right" },
      { key: "importe", label: "Importe", type: "money", align: "right" },
      { key: "utilidad", label: "Utilidad", type: "money", align: "right" },
    ],
    kpis: (res) => {
      const s = res.summary ?? {};
      return [
        { label: "Unidades totales", value: String(s.totalUnidades ?? 0) },
        { label: "Importe total", value: money(s.totalImporte ?? 0) },
        { label: "Utilidad total", value: money(s.totalUtilidad ?? 0) },
        { label: "Más vendido", value: s.masVendido ?? "—" },
        { label: "Menos vendido", value: s.menosVendido ?? "—" },
      ];
    },
  },
  // ---- INVENTARIO ----
  {
    key: "existencias",
    title: "Existencias",
    description: "Inventario actual valorizado: stock, mínimos, costo, precio y valor del inventario.",
    category: "Inventario",
    icon: Boxes,
    available: true,
    kind: "table",
    endpoint: "/api/admin/inventory",
    rows: (r) => r.products ?? [],
    branchScoped: true,
    filters: ["search"],
    params: (f, b) => ({ ...branchParam(b), ...(f.search ? { search: f.search } : {}) }),
    columns: [
      { key: "sku", label: "SKU" },
      { key: "name", label: "Producto" },
      { key: "stock", label: "Stock", type: "number", align: "center" },
      { key: "minStock", label: "Mínimo", type: "number", align: "center" },
      { key: "costPrice", label: "Costo", type: "money", align: "right" },
      { key: "sellPrice", label: "Precio", type: "money", align: "right" },
      { key: "valor", label: "Valor inventario", type: "money", align: "right", value: (r) => r.stock * r.costPrice },
      {
        key: "estado",
        label: "Estado",
        type: "badge",
        align: "center",
        value: (r) => (!r.active ? "Inactivo" : r.low ? "Stock bajo" : "Disponible"),
        badgeTone: (r) => (!r.active ? "red" : r.low ? "amber" : "green"),
      },
    ],
    kpis: (_res, rows) => [
      { label: "Productos", value: String(rows.length) },
      { label: "Unidades totales", value: String(sum(rows, "stock")) },
      { label: "Valor inventario", value: money(rows.reduce((a, r) => a + r.stock * r.costPrice, 0)) },
      { label: "Con stock bajo", value: String(rows.filter((r) => r.low).length) },
    ],
  },
  {
    key: "kardex",
    title: "Kardex",
    description: "Historial completo de movimientos de inventario (compras, ventas, ajustes, traspasos, devoluciones).",
    category: "Inventario",
    icon: ClipboardList,
    available: true,
    kind: "table",
    endpoint: "/api/admin/kardex",
    rows: (r) => r.entries ?? [],
    branchScoped: true,
    filters: ["dateRange", "movementType", "search"],
    movementOptions: [
      { value: "all", label: "Todos los movimientos" },
      { value: "COMPRA", label: "Compras" },
      { value: "VENTA", label: "Ventas" },
      { value: "DEVOLUCION", label: "Devoluciones" },
      { value: "AJUSTE_INVENTARIO", label: "Ajustes" },
      { value: "AJUSTE_MERMA", label: "Mermas" },
      { value: "TRASPASO_ENTRADA", label: "Traspaso entrada" },
      { value: "TRASPASO_SALIDA", label: "Traspaso salida" },
    ],
    params: (f, b) => ({
      ...rangeParam(f),
      ...branchParam(b),
      ...(f.movementType !== "all" ? { movementType: f.movementType } : {}),
      ...(f.search ? { search: f.search } : {}),
    }),
    columns: [
      { key: "createdAt", label: "Fecha", type: "datetime" },
      { key: "product", label: "Producto" },
      { key: "sku", label: "SKU" },
      { key: "branch", label: "Sucursal" },
      { key: "movementType", label: "Movimiento", type: "badge", align: "center", badgeTone: (r) => kardexTone(r.movementType) },
      { key: "quantityChange", label: "Cambio", type: "number", align: "center" },
      { key: "balanceAfter", label: "Saldo", type: "number", align: "center" },
      { key: "user", label: "Usuario" },
      { key: "reason", label: "Referencia / Motivo" },
    ],
  },
  // ---- COMPRAS ----
  {
    key: "compras",
    title: "Compras",
    description: "Órdenes de compra a proveedores: folio, proveedor, sucursal, importes y estado de recepción.",
    category: "Compras",
    icon: Truck,
    available: true,
    kind: "table",
    endpoint: "/api/admin/purchases",
    rows: (r) => (Array.isArray(r) ? r : r.rows ?? []),
    branchScoped: false,
    filters: ["status"],
    statusOptions: [
      { value: "all", label: "Todos los estados" },
      { value: "PENDIENTE", label: "Pendientes" },
      { value: "RECIBIDA", label: "Recibidas" },
      { value: "CANCELADA", label: "Canceladas" },
    ],
    clientFilter: (rows, f) => (f.status === "all" ? rows : rows.filter((r) => r.status === f.status)),
    columns: [
      { key: "reference", label: "Folio" },
      { key: "purchaseDate", label: "Fecha", type: "date" },
      { key: "supplier", label: "Proveedor", value: (r) => r.supplier?.name ?? "—" },
      { key: "branch", label: "Sucursal", value: (r) => r.branch?.name ?? "—" },
      { key: "subtotal", label: "Subtotal", type: "money", align: "right" },
      { key: "tax", label: "Impuestos", type: "money", align: "right" },
      { key: "total", label: "Total", type: "money", align: "right" },
      { key: "createdByUser", label: "Registró", value: (r) => r.createdByUser?.name ?? "—" },
      { key: "status", label: "Estado", type: "badge", align: "center", badgeTone: (r) => purchaseTone(r.status) },
    ],
    kpis: (_res, rows) => [
      { label: "Órdenes", value: String(rows.length) },
      { label: "Total comprado", value: money(sum(rows, "total")) },
      { label: "Recibidas", value: String(rows.filter((r) => r.status === "RECIBIDA").length) },
      { label: "Pendientes", value: String(rows.filter((r) => r.status === "PENDIENTE").length) },
    ],
  },
  // ---- CLIENTES ----
  {
    key: "cobranza",
    title: "Cobranza",
    description: "Clientes con saldo pendiente: límite de crédito, saldo, ventas a crédito y última compra.",
    category: "Clientes",
    icon: Wallet,
    available: true,
    kind: "table",
    endpoint: "/api/admin/reports/receivables",
    rows: (r) => r.rows ?? [],
    branchScoped: false,
    filters: [],
    params: () => ({}),
    columns: [
      { key: "name", label: "Cliente" },
      { key: "phone", label: "Teléfono", value: (r) => r.phone ?? "—" },
      { key: "creditLimit", label: "Límite crédito", type: "money", align: "right" },
      { key: "balance", label: "Saldo pendiente", type: "money", align: "right" },
      { key: "creditSalesCount", label: "Ventas crédito", type: "number", align: "center" },
      { key: "creditSalesTotal", label: "Monto crédito", type: "money", align: "right" },
      { key: "lastSaleDate", label: "Última compra", type: "date" },
    ],
    kpis: (res) => {
      const t = res.totals ?? {};
      return [
        { label: "Clientes con saldo", value: String(t.clientes ?? 0) },
        { label: "Saldo total", value: money(t.saldoTotal ?? 0) },
        { label: "Crédito otorgado", value: money(t.creditoOtorgado ?? 0) },
      ];
    },
  },
  {
    key: "reservas",
    title: "Facturas de reserva",
    description: "Apartados / reservas de productos con anticipos y saldos. Requiere el módulo de apartados.",
    category: "Clientes",
    icon: CalendarClock,
    available: false,
    kind: "table",
  },
  // ---- PERSONAL ----
  {
    key: "operaciones",
    title: "Operaciones del vendedor",
    description: "Actividad por vendedor: ventas, devoluciones, cancelaciones y comisión generada.",
    category: "Personal",
    icon: Activity,
    available: true,
    kind: "table",
    endpoint: "/api/admin/reports/by-seller",
    rows: (r) => r.rows ?? [],
    branchScoped: true,
    filters: ["dateRange"],
    params: (f, b) => ({ ...rangeParam(f), ...branchParam(b) }),
    columns: [
      { key: "name", label: "Vendedor" },
      { key: "role", label: "Rol", type: "badge", align: "center", badgeTone: (r) => roleTone(r.role) },
      { key: "branch", label: "Sucursal" },
      { key: "ventasCount", label: "Ventas", type: "number", align: "center" },
      { key: "devolucionesCount", label: "Devoluciones", type: "number", align: "center" },
      { key: "canceladas", label: "Cancelaciones", type: "number", align: "center" },
      { key: "totalVendido", label: "Total vendido", type: "money", align: "right" },
      { key: "comision", label: "Comisión", type: "money", align: "right" },
    ],
    kpis: (_res, rows) => [
      { label: "Vendedores", value: String(rows.length) },
      { label: "Total vendido", value: money(sum(rows, "totalVendido")) },
      { label: "Operaciones", value: String(sum(rows, "ventasCount")) },
      { label: "Comisión total", value: money(sum(rows, "comision")) },
    ],
  },
  {
    key: "ventas-usuario",
    title: "Ventas del usuario",
    description: "Resumen por usuario: importe vendido, tickets, promedio por ticket, descuentos y devoluciones.",
    category: "Personal",
    icon: UserCheck,
    available: true,
    kind: "table",
    endpoint: "/api/admin/reports/by-seller",
    rows: (r) => r.rows ?? [],
    branchScoped: true,
    filters: ["dateRange"],
    params: (f, b) => ({ ...rangeParam(f), ...branchParam(b) }),
    columns: [
      { key: "name", label: "Usuario" },
      { key: "role", label: "Rol", type: "badge", align: "center", badgeTone: (r) => roleTone(r.role) },
      { key: "branch", label: "Sucursal" },
      { key: "ventasCount", label: "Tickets", type: "number", align: "center" },
      { key: "totalVendido", label: "Importe vendido", type: "money", align: "right" },
      { key: "ticketPromedio", label: "Prom. ticket", type: "money", align: "right" },
      { key: "descuentos", label: "Descuentos", type: "money", align: "right" },
      { key: "canceladas", label: "Cancelaciones", type: "number", align: "center" },
      { key: "devolucionesCount", label: "Devoluciones", type: "number", align: "center" },
    ],
    kpis: (_res, rows) => {
      const tickets = sum(rows, "ventasCount");
      const importe = sum(rows, "totalVendido");
      return [
        { label: "Usuarios", value: String(rows.length) },
        { label: "Importe vendido", value: money(importe) },
        { label: "Tickets", value: String(tickets) },
        { label: "Promedio por ticket", value: money(tickets > 0 ? importe / tickets : 0) },
      ];
    },
  },
];

export const REPORT_CATEGORIES = ["Ventas y operación", "Inventario", "Compras", "Personal"];

// Helper de formato para impresión (texto plano según tipo)
export const formatForPrint = (col: Column, row: any): string => {
  const raw = col.value ? col.value(row) : row[col.key];
  if (raw === null || raw === undefined || raw === "") return "—";
  switch (col.type) {
    case "money":
      return moneyExact(Number(raw));
    case "number":
      return String(raw);
    default:
      return String(raw);
  }
};
