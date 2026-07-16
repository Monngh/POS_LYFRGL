// ── Autofacturación Types ─────────────────────────────

export interface TicketItem {
  name: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  unitPriceAfterDiscount?: number;
  grossTotal?: number;
  discountAmount?: number;
  promotionLabel?: string | null;
  taxAmount?: number;
  total: number;
}

export interface TicketData {
  id: number;
  invoiceNumber: string;
  createdAt: string;
  invoiceDeadline?: string;
  totalAmount: number;
  totalBeforePoints?: number;
  subtotalAmount?: number;
  taxAmount: number;
  discountAmount?: number;
  pointsRedeemed?: number;
  pointsDiscount?: number;
  paymentMethod?: string;
  cashReceived?: number | null;
  changeGiven?: number;
  branchName: string;
  taxBreakdown?: Array<{ name: string; rate: number; amount: number }>;
  payments?: Array<{ method: string; amount: number; reference?: string | null }>;
  items: TicketItem[];
}

export interface InvoiceHistoryItem {
  id: number;
  invoiceNumber: string;
  createdAt: string;
  totalAmount: number;
  taxAmount: number;
  status: string;
  branchName: string;
  cfdiUuid: string | null;
  isGlobal?: boolean;
  pdfUrl: string | null;
  xmlUrl: string | null;
  returnCfdiUuid?: string | null;
  returnPdfUrl?: string | null;
  returnXmlUrl?: string | null;
}

export interface CustomerProfile {
  id: number;
  phone: string;
  email: string;
  legalName: string;
  rfc: string;
  zip: string;
  taxSystem: string;
  cfdiUse: string;
  createdAt: string;
  updatedAt: string;
}

// ── Devoluciones (Returns) Types ──────────────────────

export interface ReturnDetailItem {
  id: number;
  productId: number;
  productName: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  taxAmount: number;
  discountAmount: number;
  destination: string;
  serialNumber: string | null;
  batchNumber: string | null;
}

export interface ExchangeSaleInfo {
  id: number;
  saleNumber: string;
  date: string;
  total: number;
  items: { productName: string; quantity: number; unitPrice: number }[];
}

export interface ReturnRow {
  id: number;
  returnNumber: string;
  saleId: number;
  saleNumber: string;
  clientName: string;
  date: string;
  totalRefunded: number;
  paymentMethod: string;
  branchId: number;
  branchName: string;
  authorizedBy: { id: number; name: string } | null;
  status: string;
}

export interface ReturnDetailData {
  id: number;
  returnNumber: string;
  saleId: number;
  saleNumber: string;
  date: string;
  reason: string;
  type: string;
  clientId: number | null;
  clientName: string;
  clientRFC: string | null;
  totalRefunded: number;
  paymentMethod: string;
  authorizedById: number | null;
  authorizedByName: string | null;
  cashSessionId: number | null;
  cfdiUuid: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  details: ReturnDetailItem[];
  exchangeSale: ExchangeSaleInfo | null;
}

export interface EligibleReturnSale {
  id: number;
  saleNumber: string;
  date: string;
  items: Array<{
    id: number;
    productName: string;
    sku: string;
    quantity: number;
    unitPrice: number;
    taxAmount: number;
    discountAmount: number;
  }>;
  total: number;
  taxTotal: number;
  paymentMethod: string;
}

export interface ReturnSubmitPayload {
  folio: string;
  reason: string;
  pin: string;
  items: Array<{
    saleDetailId: number;
    quantity: number;
  }>;
  paymentMethod: string;
}

export interface ReturnReceipt {
  returnNumber: string;
  saleNumber: string;
  totalRefunded: number;
  date: string;
  paymentMethod: string;
}

export interface InvoiceResult {
  mode: string; // "real" | "fallback-simulated" | "simulated"
  uuid: string;
  pdfUrl: string;
  xmlUrl: string;
}
