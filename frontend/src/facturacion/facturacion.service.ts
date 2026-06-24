import api from '../shared/services/api';
import type {
  TicketData,
  InvoiceHistoryItem,
  CustomerProfile,
  ReturnDetailData,
  ReturnRow,
  EligibleReturnSale,
  ReturnSubmitPayload,
  ReturnReceipt,
  InvoiceResult,
} from './types';

// ── Autofacturación Endpoints ─────────────────────────

/**
 * Get customer profile by token
 */
export const getCustomerProfile = (token: string) =>
  api.get<CustomerProfile>('/api/customers/profile', {
    headers: { Authorization: `Bearer ${token}` },
  });

/**
 * Get customer invoices by token
 */
export const getCustomerInvoices = (token: string) =>
  api.get<InvoiceHistoryItem[]>('/api/customers/invoices', {
    headers: { Authorization: `Bearer ${token}` },
  });

/**
 * Login customer with email and password
 */
export const loginCustomer = (loginData: {
  email: string;
  password: string;
}) =>
  api.post<{ token: string; customerId: number }>('/api/customers/login', loginData);

/**
 * Send customer OTP verification code
 */
export const sendCustomerOtp = (email: string) =>
  api.post<{ message: string; otp?: string }>('/api/customers/otp/send', { email });

/**
 * Register new customer
 */
export const registerCustomer = (registerData: {
  email: string;
  invoiceNumber: string;
  password: string;
  passwordConfirmation: string;
  otp: string;
}) =>
  api.post<{ token?: string; customerId?: number; customer?: any; autoLogin?: boolean; message?: string }>(
    '/api/customers/register',
    registerData
  );

/**
 * Send OTP to verify for password reset
 */
export const sendPasswordResetOtp = (email: string) =>
  api.post<{ message: string; otp?: string }>('/api/customers/password/reset-otp', { email });

/**
 * Reset customer password using verified OTP
 */
export const resetCustomerPassword = (resetData: {
  email: string;
  otp: string;
  newPassword: string;
}) =>
  api.post<{ message: string }>('/api/customers/password/reset', resetData);

/**
 * Update customer profile
 */
export const updateCustomerProfile = (
  token: string,
  profileData: Partial<CustomerProfile>
) =>
  api.put<{ success: boolean }>('/api/customers/profile', profileData, {
    headers: { Authorization: `Bearer ${token}` },
  });

/**
 * Get public ticket/sale by invoice number
 */
export const getPublicTicket = (invoiceNumber: string) =>
  api.get<TicketData>(`/api/public/sales/ticket/${invoiceNumber.trim().toUpperCase()}`);

/**
 * Create public invoice
 */
export const createPublicInvoice = (invoiceData: {
  invoiceId: number;
  rfc: string;
  legalName: string;
  zip: string;
  email: string;
  taxSystem: string;
  cfdiUse: string;
}) =>
  api.post<InvoiceResult>('/api/public/sales/invoice', invoiceData);

// ── Devoluciones (Returns) Admin Endpoints ────────────

/**
 * Get all returns (admin only)
 */
export const getAdminReturns = (params?: {
  branch?: string;
  status?: string;
  limit?: number;
  offset?: number;
}) =>
  api.get<ReturnRow[]>('/api/admin/returns', { params });

/**
 * Get return detail (admin only)
 */
export const getAdminReturnDetail = (returnId: number | string) =>
  api.get<ReturnDetailData>(`/api/admin/returns/${returnId}`);

/**
 * Create CFDI for return (admin only)
 */
export const createReturnCfdi = (returnId: number | string) =>
  api.post<{ success: boolean; cfdiUuid: string }>(
    `/api/admin/returns/${returnId}/create-cfdi`
  );

/**
 * Retry return refund (admin only)
 */
export const retryReturnRefund = (returnId: number | string) =>
  api.post<{ success: boolean }>(
    `/api/admin/returns/${returnId}/retry-refund`
  );

// ── Devoluciones (Returns) POS Endpoints ──────────────

/**
 * Get eligible return for sale (by folio/ticket number)
 */
export const getEligibleReturn = (folio: string) =>
  api.get<EligibleReturnSale>(`/api/returns/eligible/${encodeURIComponent(folio)}`);

/**
 * Submit return (create new return)
 */
export const submitReturn = (returnData: ReturnSubmitPayload) =>
  api.post<ReturnReceipt>('/api/returns', returnData);
