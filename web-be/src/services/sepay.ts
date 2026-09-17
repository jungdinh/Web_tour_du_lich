import { SePayPgClient } from 'sepay-pg-node';

export type SepayCheckout = {
  action: string;
  method: 'POST';
  fields: Record<string, string>;
};

type CheckoutBooking = {
  id: number;
  bookingCode: string;
  paymentCode: string;
  amount: number;
  userId?: number | null;
};

export class SepayConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SepayConfigurationError';
  }
}

let cachedClient: { cacheKey: string; client: SePayPgClient } | null = null;

const getConfiguredPaymentMode = () => {
  const configuredMode = process.env.SEPAY_PAYMENT_MODE?.trim().toLowerCase();
  if (configuredMode === 'qr') return 'qr' as const;
  if (configuredMode === 'gateway') return 'gateway' as const;

  return process.env.SEPAY_MERCHANT_ID?.trim() && process.env.SEPAY_SECRET_KEY?.trim()
    ? 'gateway' as const
    : 'qr' as const;
};

export const isSepayGatewayEnabled = () => getConfiguredPaymentMode() === 'gateway';

const getSepayClient = () => {
  if (!isSepayGatewayEnabled()) return null;

  const merchantId = process.env.SEPAY_MERCHANT_ID?.trim();
  const secretKey = process.env.SEPAY_SECRET_KEY?.trim();
  if (!merchantId || !secretKey) {
    throw new SepayConfigurationError(
      'SEPAY_MERCHANT_ID và SEPAY_SECRET_KEY là bắt buộc khi bật SEPAY_PAYMENT_MODE=gateway.',
    );
  }

  const configuredEnvironment = process.env.SEPAY_ENV?.trim().toLowerCase() || 'sandbox';
  if (configuredEnvironment !== 'sandbox' && configuredEnvironment !== 'production') {
    throw new SepayConfigurationError('SEPAY_ENV chỉ được là sandbox hoặc production.');
  }

  const cacheKey = `${configuredEnvironment}:${merchantId}:${secretKey}`;
  if (cachedClient?.cacheKey === cacheKey) return cachedClient.client;

  try {
    const client = new SePayPgClient({
      env: configuredEnvironment,
      merchant_id: merchantId,
      secret_key: secretKey,
    });
    cachedClient = { cacheKey, client };
    return client;
  } catch (error) {
    throw new SepayConfigurationError(
      error instanceof Error ? error.message : 'Không thể khởi tạo SePay Payment Gateway.',
    );
  }
};

export const assertSepayGatewayConfigured = () => {
  getSepayClient();
};

const getFrontendBaseUrl = () => {
  const configuredUrls = process.env.FRONTEND_URLS || process.env.FRONTEND_URL || 'http://localhost:5174';
  const firstUrl = configuredUrls.split(',').map((value) => value.trim()).find(Boolean);
  if (!firstUrl) throw new SepayConfigurationError('FRONTEND_URL chưa được cấu hình.');

  try {
    const url = new URL(firstUrl);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported protocol');
    return url.origin;
  } catch {
    throw new SepayConfigurationError('FRONTEND_URL phải là một URL hợp lệ.');
  }
};

const buildReturnUrl = (
  status: 'success' | 'error' | 'cancel',
  booking: CheckoutBooking,
) => {
  const configuredUrl = process.env[`SEPAY_${status.toUpperCase()}_URL`]?.trim();
  const backendBaseUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 3000}`;
  const targetUrl = configuredUrl || `${backendBaseUrl}/api/payments/sepay/return`;

  try {
    const url = new URL(targetUrl);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported protocol');
    url.searchParams.set('booking_id', String(booking.id));
    url.searchParams.set('booking_code', booking.bookingCode);
    url.searchParams.set('status', status === 'cancel' ? 'cancelled' : status);
    return url.toString();
  } catch {
    throw new SepayConfigurationError(`SEPAY_${status.toUpperCase()}_URL phải là một URL hợp lệ.`);
  }
};

const normalizeFields = (fields: Record<string, unknown>) => Object.fromEntries(
  Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => [key, String(value)]),
) as Record<string, string>;

export const buildSepayCheckout = (booking: CheckoutBooking): SepayCheckout | null => {
  const client = getSepayClient();
  if (!client) return null;

  if (!Number.isSafeInteger(booking.amount) || booking.amount <= 0) {
    throw new SepayConfigurationError('Số tiền thanh toán SePay không hợp lệ.');
  }

  const fields = client.checkout.initOneTimePaymentFields({
    operation: 'PURCHASE',
    payment_method: 'BANK_TRANSFER',
    order_invoice_number: booking.bookingCode,
    order_amount: booking.amount,
    currency: 'VND',
    order_description: `Thanh toan tour ${booking.bookingCode}`,
    customer_id: booking.userId ? String(booking.userId) : undefined,
    success_url: buildReturnUrl('success', booking),
    error_url: buildReturnUrl('error', booking),
    cancel_url: buildReturnUrl('cancel', booking),
    custom_data: JSON.stringify({
      booking_id: booking.id,
      payment_code: booking.paymentCode,
    }),
  });

  return {
    action: client.checkout.initCheckoutUrl(),
    method: 'POST',
    fields: normalizeFields(fields),
  };
};

export const tryBuildSepayCheckout = (booking: CheckoutBooking) => {
  try {
    return buildSepayCheckout(booking);
  } catch (error) {
    if (error instanceof SepayConfigurationError) return null;
    throw error;
  }
};

export const getSepayIpnSecret = () => (
  process.env.SEPAY_IPN_SECRET_KEY?.trim()
  || process.env.SEPAY_SECRET_KEY?.trim()
  || ''
);
