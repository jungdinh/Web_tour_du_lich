import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { getClient, query } from '../db/index.js';
import type { AuthRequest } from './auth.js';
import {
  assertSepayGatewayConfigured,
  buildSepayCheckout,
  getSepayIpnSecret,
  isSepayGatewayEnabled,
  SepayConfigurationError,
  tryBuildSepayCheckout,
} from '../services/sepay.js';
import type { SepayCheckout } from '../services/sepay.js';
import { isFutureScheduleDate, normalizeScheduleDate, normalizeScheduleRows } from '../utils/schedule.js';

const createBookingSchema = z.object({
  tour_id: z.coerce.number().int().positive(),
  departure_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  guest_count: z.coerce.number().int().min(1).max(20),
  contact_name: z.string().trim().min(2).max(255),
  contact_email: z.string().trim().email().max(255),
  contact_phone: z.string().trim().min(8).max(30).regex(/^[0-9+().\s-]+$/),
  note: z.string().trim().max(1000).optional().default(''),
});

const bookingHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  status: z.enum(['all', 'pending_payment', 'paid', 'confirmed', 'cancelled', 'expired', 'refunded']).default('all'),
  paymentStatus: z.enum(['all', 'pending', 'paid', 'failed', 'refunded']).default('all'),
});

const sepayWebhookSchema = z.object({
  id: z.union([z.string(), z.number()]),
  gateway: z.string().optional(),
  transactionDate: z.string().optional(),
  accountNumber: z.string().optional(),
  code: z.string().nullable().optional(),
  content: z.string().nullable().optional(),
  transferType: z.string(),
  transferAmount: z.coerce.number().nonnegative(),
  accumulated: z.coerce.number().optional(),
  subAccount: z.string().nullable().optional(),
  referenceCode: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
}).passthrough();

const sepayGatewayIpnSchema = z.object({
  timestamp: z.coerce.number().int().positive(),
  notification_type: z.string().trim().min(1),
  order: z.object({
    order_id: z.union([z.string(), z.number()]).optional(),
    order_invoice_number: z.string().trim().min(1).max(100),
    order_amount: z.coerce.number().nonnegative(),
    order_status: z.string().trim().optional(),
    currency: z.string().trim().optional(),
    order_currency: z.string().trim().optional(),
    merchant: z.union([z.string(), z.number()]).optional(),
  }).passthrough(),
  transaction: z.object({
    id: z.union([z.string(), z.number()]).optional(),
    transaction_id: z.union([z.string(), z.number()]).optional(),
    payment_method: z.string().trim().optional(),
    transaction_status: z.string().trim().optional(),
    transaction_amount: z.coerce.number().nonnegative(),
    transaction_currency: z.string().trim().optional(),
    transaction_type: z.string().trim().optional(),
    transaction_date: z.string().trim().optional(),
    reference_code: z.union([z.string(), z.number()]).nullable().optional(),
  }).passthrough(),
  customer: z.object({
    id: z.union([z.string(), z.number()]),
    customer_id: z.union([z.string(), z.number()]).nullable().optional(),
  }).passthrough(),
}).passthrough();

const configuredExpiryMinutes = Number(process.env.PAYMENT_EXPIRES_MINUTES || 30);
const paymentExpiryMinutes = Number.isFinite(configuredExpiryMinutes)
  ? Math.max(5, configuredExpiryMinutes)
  : 30;

const createCode = (prefix: string) => {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `${prefix}${timestamp}${random}`;
};

const buildQrUrl = (amount: number, paymentCode: string) => {
  const bank = process.env.SEPAY_BANK_CODE?.trim();
  const account = process.env.SEPAY_ACCOUNT_NUMBER?.trim();
  if (!bank || !account) return null;

  const baseUrl = process.env.SEPAY_QR_BASE_URL?.trim() || 'https://qr.sepay.vn/img';
  const params = new URLSearchParams({
    acc: account,
    bank,
    amount: String(amount),
    des: paymentCode,
  });
  return `${baseUrl}?${params.toString()}`;
};

export const bookingProjection = (bookingAlias = 'b') => `
  ${bookingAlias}.*,
  payment.id AS latest_payment_id,
  payment.provider AS latest_payment_provider,
  payment.provider_transaction_id AS latest_payment_transaction_id,
  payment.reference_code AS latest_payment_reference_code,
  payment.transfer_amount AS latest_payment_transfer_amount,
  payment.status AS latest_payment_record_status,
  payment.paid_at AS latest_payment_paid_at,
  payment.created_at AS latest_payment_created_at`;

export const bookingPaymentJoin = (bookingAlias = 'b') => `
  LEFT JOIN LATERAL (
    SELECT id, provider, provider_transaction_id, reference_code,
           transfer_amount, status, paid_at, created_at
    FROM payments
    WHERE payments.booking_id = ${bookingAlias}.id
    ORDER BY paid_at DESC, id DESC
    LIMIT 1
  ) AS payment ON TRUE`;

const getCheckoutBooking = (row: Record<string, unknown>) => ({
  id: Number(row.id),
  bookingCode: String(row.booking_code || ''),
  paymentCode: String(row.payment_code || ''),
  amount: Number(row.total_amount || 0),
  userId: row.user_id === null || row.user_id === undefined ? null : Number(row.user_id),
});

export const mapPaymentSummary = (row: Record<string, unknown>) => {
  if (row.latest_payment_id === null || row.latest_payment_id === undefined) return null;

  return {
    id: Number(row.latest_payment_id),
    provider: String(row.latest_payment_provider || ''),
    provider_transaction_id: row.latest_payment_transaction_id === null || row.latest_payment_transaction_id === undefined
      ? null
      : String(row.latest_payment_transaction_id),
    reference_code: row.latest_payment_reference_code === null || row.latest_payment_reference_code === undefined
      ? null
      : String(row.latest_payment_reference_code),
    transfer_amount: Number(row.latest_payment_transfer_amount || 0),
    status: String(row.latest_payment_record_status || 'paid'),
    paid_at: row.latest_payment_paid_at ? String(row.latest_payment_paid_at) : null,
    created_at: row.latest_payment_created_at ? String(row.latest_payment_created_at) : null,
  };
};

export const mapBookingBase = (row: Record<string, unknown>) => {
  const booking = { ...row };
  [
    'latest_payment_id',
    'latest_payment_provider',
    'latest_payment_transaction_id',
    'latest_payment_reference_code',
    'latest_payment_transfer_amount',
    'latest_payment_record_status',
    'latest_payment_paid_at',
    'latest_payment_created_at',
  ].forEach((key) => delete booking[key]);

  return {
    ...booking,
    unit_price: Number(row.unit_price || 0),
    total_amount: Number(row.total_amount || 0),
    guest_count: Number(row.guest_count || 0),
    payment: mapPaymentSummary(row),
  };
};

const mapBooking = (row: Record<string, unknown>, checkout?: SepayCheckout | null) => {
  const totalAmount = Number(row.total_amount || 0);
  const isPending = row.payment_status === 'pending' && row.status === 'pending_payment';
  const resolvedCheckout = checkout === undefined && isPending
    ? tryBuildSepayCheckout(getCheckoutBooking(row))
    : checkout;
  const qrUrl = buildQrUrl(totalAmount, String(row.payment_code || ''));
  return {
    ...mapBookingBase(row),
    payment_mode: resolvedCheckout ? 'gateway' : qrUrl ? 'qr' : 'unavailable',
    checkout: isPending ? resolvedCheckout || null : null,
    qr_url: qrUrl,
    bank: {
      code: process.env.SEPAY_BANK_CODE || '',
      account_number: process.env.SEPAY_ACCOUNT_NUMBER || '',
      account_name: process.env.SEPAY_ACCOUNT_NAME || '',
    },
  };
};

const expirePendingBooking = async (bookingId: number, userId: number) => {
  await query(
    `UPDATE bookings
     SET status = 'expired', updated_at = NOW()
     WHERE id = $1 AND user_id = $2 AND payment_status = 'pending'
       AND status = 'pending_payment' AND expires_at <= NOW()`,
    [bookingId, userId],
  );
};

export const createBooking = async (req: AuthRequest, res: Response) => {
  const client = await getClient();
  try {
    const input = createBookingSchema.parse(req.body);
    const departureDate = normalizeScheduleDate(input.departure_date);
    if (!departureDate || !isFutureScheduleDate(departureDate)) {
      return res.status(400).json({ error: 'Ngày khởi hành phải là một ngày trong tương lai.' });
    }

    if (isSepayGatewayEnabled()) {
      try {
        assertSepayGatewayConfigured();
      } catch (error) {
        if (error instanceof SepayConfigurationError) {
          return res.status(503).json({ error: error.message });
        }
        throw error;
      }
    }

    await client.query('BEGIN');
    const tourResult = await client.query(
      `SELECT id, name, destination, price, schedule
       FROM tours WHERE id = $1 FOR SHARE`,
      [input.tour_id],
    );
    if (!tourResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Không tìm thấy tour.' });
    }

    const tour = tourResult.rows[0];
    const scheduleRows = normalizeScheduleRows(tour.schedule);
    const selectedSchedule = scheduleRows.find((row) => row.date === departureDate);
    if (!selectedSchedule) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Ngày khởi hành không nằm trong lịch của tour.' });
    }
    if (!selectedSchedule.available) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Ngày khởi hành này hiện đã hết chỗ.' });
    }

    const unitPrice = Number(tour.price);
    const schedulePrice = selectedSchedule.price > 0 ? selectedSchedule.price : unitPrice;
    if (!Number.isSafeInteger(schedulePrice) || schedulePrice <= 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Tour chưa có mức giá hợp lệ để đặt trực tuyến.' });
    }

    const totalAmount = schedulePrice * input.guest_count;
    if (!Number.isSafeInteger(totalAmount) || totalAmount <= 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Tổng tiền tour không hợp lệ để thanh toán trực tuyến.' });
    }
    const bookingCode = createCode('BK');
    const paymentCode = createCode('TA');
    const result = await client.query(
      `INSERT INTO bookings (
         booking_code, payment_code, user_id, tour_id, tour_name, destination,
         departure_date, guest_count, unit_price, total_amount,
         contact_name, contact_email, contact_phone, note, expires_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
         NOW() + ($15 * INTERVAL '1 minute'))
       RETURNING *`,
      [
        bookingCode,
        paymentCode,
        req.user!.id,
        tour.id,
        tour.name,
        tour.destination,
        departureDate,
        input.guest_count,
        schedulePrice,
        totalAmount,
        input.contact_name,
        input.contact_email,
        input.contact_phone,
        input.note || null,
        paymentExpiryMinutes,
      ],
    );

    const checkout = buildSepayCheckout(getCheckoutBooking(result.rows[0]));

    await client.query(
      `INSERT INTO user_actions (user_id, tour_id, action_type)
       VALUES ($1, $2, 'booking')`,
      [req.user!.id, tour.id],
    );
    await client.query('COMMIT');
    return res.status(201).json(mapBooking(result.rows[0], checkout));
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.flatten() });
    }
    if (error instanceof SepayConfigurationError) {
      return res.status(503).json({ error: error.message });
    }
    console.error('Create booking error:', error);
    return res.status(500).json({ error: 'Không thể tạo đơn đặt tour.' });
  } finally {
    client.release();
  }
};

export const getBookings = async (req: AuthRequest, res: Response) => {
  try {
    await query(
      `UPDATE bookings SET status = 'expired', updated_at = NOW()
       WHERE user_id = $1 AND payment_status = 'pending'
         AND status = 'pending_payment' AND expires_at <= NOW()`,
      [req.user!.id],
    );
    const result = await query(
      `SELECT ${bookingProjection('b')}
       FROM bookings b
       ${bookingPaymentJoin('b')}
       WHERE b.user_id = $1
       ORDER BY b.created_at DESC, b.id DESC`,
      [req.user!.id],
    );
    return res.json(result.rows.map((row) => mapBooking(row)));
  } catch (error) {
    console.error('Get bookings error:', error);
    return res.status(500).json({ error: 'Không thể tải danh sách đặt tour.' });
  }
};

export const getBookingHistory = async (req: AuthRequest, res: Response) => {
  try {
    const { page, limit, status, paymentStatus } = bookingHistoryQuerySchema.parse(req.query);
    await query(
      `UPDATE bookings SET status = 'expired', updated_at = NOW()
       WHERE user_id = $1 AND payment_status = 'pending'
         AND status = 'pending_payment' AND expires_at <= NOW()`,
      [req.user!.id],
    );

    const conditions = ['b.user_id = $1'];
    const params: unknown[] = [req.user!.id];
    if (status !== 'all') {
      params.push(status);
      conditions.push(`b.status = $${params.length}`);
    }
    if (paymentStatus !== 'all') {
      params.push(paymentStatus);
      conditions.push(`b.payment_status = $${params.length}`);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const count = await query(`SELECT COUNT(*)::int AS total FROM bookings b ${where}`, params);
    const total = Number(count.rows[0]?.total || 0);
    const offset = (page - 1) * limit;
    const dataParams = [...params, limit, offset];
    const result = await query(
      `SELECT ${bookingProjection('b')}
       FROM bookings b
       ${bookingPaymentJoin('b')}
       ${where}
       ORDER BY b.created_at DESC, b.id DESC
       LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
      dataParams,
    );

    return res.json({
      data: result.rows.map((row) => mapBooking(row)),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.flatten() });
    console.error('Get booking history error:', error);
    return res.status(500).json({ error: 'Không thể tải lịch sử đặt tour.' });
  }
};

export const getBooking = async (req: AuthRequest, res: Response) => {
  try {
    const bookingId = Number(req.params.id);
    if (!Number.isInteger(bookingId) || bookingId <= 0) {
      return res.status(400).json({ error: 'Mã booking không hợp lệ.' });
    }
    await expirePendingBooking(bookingId, req.user!.id);
    const result = await query(
      `SELECT ${bookingProjection('b')}
       FROM bookings b
       ${bookingPaymentJoin('b')}
       WHERE b.id = $1 AND b.user_id = $2`,
      [bookingId, req.user!.id],
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Không tìm thấy booking.' });
    return res.json(mapBooking(result.rows[0]));
  } catch (error) {
    console.error('Get booking error:', error);
    return res.status(500).json({ error: 'Không thể tải booking.' });
  }
};

export const cancelBooking = async (req: AuthRequest, res: Response) => {
  try {
    const bookingId = Number(req.params.id);
    if (!Number.isInteger(bookingId) || bookingId <= 0) {
      return res.status(400).json({ error: 'Mã booking không hợp lệ.' });
    }
    const result = await query(
      `UPDATE bookings SET status = 'cancelled', updated_at = NOW()
       WHERE id = $1 AND user_id = $2 AND payment_status = 'pending'
         AND status = 'pending_payment'
       RETURNING *`,
      [bookingId, req.user!.id],
    );
    if (!result.rows.length) {
      return res.status(409).json({ error: 'Booking không thể hủy ở trạng thái hiện tại.' });
    }
    return res.json(mapBooking(result.rows[0]));
  } catch (error) {
    console.error('Cancel booking error:', error);
    return res.status(500).json({ error: 'Không thể hủy booking.' });
  }
};

const getWebhookApiKey = (req: Request) => {
  const authorization = req.headers.authorization?.trim() || '';
  if (/^apikey\s+/i.test(authorization)) return authorization.replace(/^apikey\s+/i, '').trim();
  if (/^bearer\s+/i.test(authorization)) return authorization.replace(/^bearer\s+/i, '').trim();
  const header = req.headers['x-api-key'];
  return Array.isArray(header) ? header[0] : header || '';
};

const safeKeyEquals = (provided: string, expected: string) => {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  return providedBuffer.length === expectedBuffer.length
    && crypto.timingSafeEqual(providedBuffer, expectedBuffer);
};

const extractPaymentCode = (payload: z.infer<typeof sepayWebhookSchema>) => {
  const text = [payload.code, payload.content, payload.description]
    .filter(Boolean)
    .join(' ')
    .toUpperCase();
  return text.match(/TA[A-Z0-9]{8,30}/)?.[0] || null;
};

export const handleSepayWebhook = async (req: Request, res: Response) => {
  const expectedKey = process.env.SEPAY_WEBHOOK_API_KEY?.trim();
  if (!expectedKey) return res.status(503).json({ success: false, message: 'SePay webhook is not configured.' });
  if (!safeKeyEquals(getWebhookApiKey(req), expectedKey)) {
    return res.status(401).json({ success: false, message: 'Unauthorized webhook.' });
  }

  const client = await getClient();
  try {
    const payload = sepayWebhookSchema.parse(req.body);
    if (payload.transferType.toLowerCase() !== 'in') {
      return res.json({ success: true, message: 'Outgoing transaction ignored.' });
    }

    const paymentCode = extractPaymentCode(payload);
    if (!paymentCode) return res.json({ success: false, message: 'Payment code not found.' });

    const providerTransactionId = String(payload.id);
    await client.query('BEGIN');
    const duplicate = await client.query(
      'SELECT id FROM payments WHERE provider_transaction_id = $1',
      [providerTransactionId],
    );
    if (duplicate.rows.length) {
      await client.query('COMMIT');
      return res.json({ success: true, message: 'Transaction already processed.' });
    }

    const bookingResult = await client.query(
      `SELECT * FROM bookings WHERE payment_code = $1 FOR UPDATE`,
      [paymentCode],
    );
    if (!bookingResult.rows.length) {
      await client.query('ROLLBACK');
      return res.json({ success: false, message: 'Booking not found.' });
    }

    const booking = bookingResult.rows[0];
    if (booking.payment_status === 'paid') {
      await client.query('COMMIT');
      return res.json({ success: true, message: 'Booking already paid.' });
    }

    const requiredAmount = Number(booking.total_amount);
    if (payload.transferAmount < requiredAmount) {
      await client.query('ROLLBACK');
      return res.json({ success: false, message: 'Transferred amount is insufficient.' });
    }

    await client.query(
      `INSERT INTO payments (
         booking_id, provider, provider_transaction_id, reference_code,
         transfer_amount, raw_payload, paid_at
       ) VALUES ($1, 'sepay', $2, $3, $4, $5::jsonb, COALESCE($6::timestamp, NOW()))`,
      [
        booking.id,
        providerTransactionId,
        payload.referenceCode || null,
        payload.transferAmount,
        JSON.stringify(payload),
        payload.transactionDate || null,
      ],
    );
    await client.query(
      `UPDATE bookings
       SET payment_status = 'paid', status = 'paid', paid_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [booking.id],
    );
    await client.query('COMMIT');
    return res.json({ success: true, message: 'Payment confirmed.' });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, message: 'Invalid webhook payload.' });
    }
    console.error('SePay webhook error:', error);
    return res.status(500).json({ success: false, message: 'Webhook processing failed.' });
  } finally {
    client.release();
  }
};

const getSepayIpnHeader = (req: Request) => (
  req.headers['x-secret-key']?.toString().trim() || getWebhookApiKey(req)
);

const getIpnText = (value: string | undefined) => value?.trim().toUpperCase() || '';

export const handleSepayGatewayIpn = async (req: Request, res: Response) => {
  if (!isSepayGatewayEnabled()) {
    return res.status(503).json({ success: false, message: 'SePay Payment Gateway is disabled.' });
  }

  const expectedKey = getSepayIpnSecret();
  if (!expectedKey) {
    return res.status(503).json({ success: false, message: 'SePay Payment Gateway IPN is not configured.' });
  }
  if (!safeKeyEquals(getSepayIpnHeader(req), expectedKey)) {
    return res.status(401).json({ success: false, message: 'Unauthorized SePay IPN.' });
  }

  let payload: z.infer<typeof sepayGatewayIpnSchema>;
  try {
    payload = sepayGatewayIpnSchema.parse(req.body);
  } catch {
    return res.status(400).json({ success: false, message: 'Invalid SePay IPN payload.' });
  }

  let isFailed = false;
  const notificationType = getIpnText(payload.notification_type);
  const orderStatus = getIpnText(payload.order.order_status);
  const transactionStatus = getIpnText(payload.transaction.transaction_status);

  const isSuccess = Boolean(notificationType === 'ORDER_PAID' || 
    (orderStatus && ['CAPTURED', 'PAID', 'SUCCESS'].includes(orderStatus)) ||
    (transactionStatus && ['APPROVED', 'PAID', 'SUCCESS'].includes(transactionStatus)));

  isFailed = Boolean(
    notificationType === 'ORDER_FAILED' || notificationType === 'ORDER_CANCELLED' ||
    (orderStatus && ['FAILED', 'CANCELLED'].includes(orderStatus)) ||
    (transactionStatus && ['FAILED', 'CANCELLED'].includes(transactionStatus))
  );

  if (!isSuccess && !isFailed) {
    return res.json({ success: true, message: 'Notification ignored.' });
  }

  const paymentMethod = getIpnText(payload.transaction.payment_method);
  if (paymentMethod && !['BANK_TRANSFER', 'NAPAS_BANK_TRANSFER'].includes(paymentMethod)) {
    return res.json({ success: true, message: 'Payment method is not supported.' });
  }

  const orderCurrency = getIpnText(payload.order.currency || payload.order.order_currency);
  const transactionCurrency = getIpnText(payload.transaction.transaction_currency);
  if (orderCurrency !== 'VND' || (transactionCurrency && transactionCurrency !== 'VND')) {
    return res.json({ success: false, message: 'Currency is not supported.' });
  }

  const orderAmount = Number(payload.order.order_amount);
  const transactionAmount = Number(payload.transaction.transaction_amount);
  if (
    !Number.isSafeInteger(orderAmount)
    || !Number.isSafeInteger(transactionAmount)
    || orderAmount <= 0
    || orderAmount !== transactionAmount
  ) {
    return res.json({ success: false, message: 'Payment amount is invalid.' });
  }

  const transactionIdValue = payload.transaction.id ?? payload.transaction.transaction_id;
  const transactionId = transactionIdValue === undefined || transactionIdValue === null
    ? ''
    : String(transactionIdValue).trim();
  if (!transactionId) {
    return res.status(400).json({ success: false, message: 'Transaction ID is missing.' });
  }

  const configuredMerchant = process.env.SEPAY_MERCHANT_ID?.trim();
  const payloadRecord = payload as unknown as Record<string, unknown>;
  const payloadMerchant = payload.order.merchant ?? payloadRecord.merchant;
  if (configuredMerchant && payloadMerchant !== undefined && String(payloadMerchant) !== configuredMerchant) {
    return res.status(401).json({ success: false, message: 'Merchant does not match.' });
  }

  const providerTransactionId = `sepay-pg:${transactionId}`;
  if (providerTransactionId.length > 100) {
    return res.status(400).json({ success: false, message: 'Transaction ID is too long.' });
  }

  const client = await getClient();
  let transactionStarted = false;
  try {
    await client.query('BEGIN');
    transactionStarted = true;

    const duplicate = await client.query(
      'SELECT id FROM payments WHERE provider_transaction_id = $1',
      [providerTransactionId],
    );
    if (duplicate.rows.length) {
      await client.query('COMMIT');
      transactionStarted = false;
      return res.json({ success: true, message: 'Transaction already processed.' });
    }

    const bookingResult = await client.query(
      'SELECT * FROM bookings WHERE booking_code = $1 FOR UPDATE',
      [payload.order.order_invoice_number],
    );
    if (!bookingResult.rows.length) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.json({ success: false, message: 'Booking not found.' });
    }

    const booking = bookingResult.rows[0];
    if (booking.payment_status === 'paid') {
      await client.query('COMMIT');
      transactionStarted = false;
      return res.json({ success: true, message: 'Booking already paid.' });
    }

    if (booking.payment_status !== 'pending' || booking.status !== 'pending_payment') {
      await client.query('COMMIT');
      transactionStarted = false;
      return res.json({ success: false, message: 'Booking is not awaiting payment.' });
    }

    if (isFailed) {
      await client.query(
        `UPDATE bookings SET status = 'cancelled', payment_status = 'failed', updated_at = NOW() WHERE id = $1`,
        [booking.id]
      );
      await client.query('COMMIT');
      transactionStarted = false;
      return res.json({ success: true, message: 'Booking cancelled due to failed payment.' });
    }

    const expiresAt = new Date(booking.expires_at).getTime();
    if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) {
      await client.query(
        `UPDATE bookings SET status = 'expired', updated_at = NOW()
         WHERE id = $1 AND payment_status = 'pending'`,
        [booking.id],
      );
      await client.query('COMMIT');
      transactionStarted = false;
      return res.json({ success: false, message: 'Booking has expired.' });
    }

    const bookingAmount = Number(booking.total_amount);
    if (!Number.isSafeInteger(bookingAmount) || bookingAmount !== orderAmount) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.json({ success: false, message: 'Payment amount does not match booking.' });
    }

    const referenceCodeValue = payload.transaction.reference_code;
    const referenceCode = referenceCodeValue === undefined || referenceCodeValue === null
      ? null
      : String(referenceCodeValue);
    const transactionDate = payload.transaction.transaction_date;
    const paidAt = transactionDate && !Number.isNaN(Date.parse(transactionDate))
      ? new Date(transactionDate).toISOString()
      : null;

    await client.query(
      `INSERT INTO payments (
         booking_id, provider, provider_transaction_id, reference_code,
         transfer_amount, raw_payload, paid_at
       ) VALUES ($1, 'sepay', $2, $3, $4, $5::jsonb, COALESCE($6::timestamp, NOW()))`,
      [
        booking.id,
        providerTransactionId,
        referenceCode,
        transactionAmount,
        JSON.stringify(payload),
        paidAt,
      ],
    );
    await client.query(
      `UPDATE bookings
       SET payment_status = 'paid', status = 'paid', paid_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [booking.id],
    );
    await client.query('COMMIT');
    transactionStarted = false;
    return res.json({ success: true, message: 'Payment confirmed.' });
  } catch (error) {
    if (transactionStarted) await client.query('ROLLBACK').catch(() => undefined);
    console.error('SePay Payment Gateway IPN error:', error);
    return res.status(500).json({ success: false, message: 'IPN processing failed.' });
  } finally {
    client.release();
  }
};

export const handleSepayReturn = async (req: Request, res: Response) => {
  const { booking_id, status, booking_code } = req.query;
  const bookingId = Number(booking_id);
  const resultStatus = String(status || '').toLowerCase();
  
  if (Number.isInteger(bookingId) && bookingId > 0 && ['error', 'cancel', 'cancelled', 'failed'].includes(resultStatus)) {
    const client = await getClient();
    try {
      await client.query('BEGIN');
      const bookingResult = await client.query(
        `SELECT id, payment_status, status FROM bookings WHERE id = $1 FOR UPDATE`,
        [bookingId]
      );
      if (bookingResult.rows.length) {
        const booking = bookingResult.rows[0];
        if (booking.payment_status === 'pending' && booking.status === 'pending_payment') {
          await client.query(
            `UPDATE bookings SET status = 'cancelled', payment_status = 'failed', updated_at = NOW() WHERE id = $1`,
            [bookingId]
          );
        }
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      console.error('handleSepayReturn DB error:', error);
    } finally {
      client.release();
    }
  }

  const frontendUrls = process.env.FRONTEND_URLS || process.env.FRONTEND_URL || 'http://localhost:5174';
  const firstUrl = frontendUrls.split(',').map((value) => value.trim()).find(Boolean) || 'http://localhost:5174';
  const redirectUrl = new URL(`${firstUrl}/payment-result`);
  if (booking_id) redirectUrl.searchParams.set('booking_id', String(booking_id));
  if (booking_code) redirectUrl.searchParams.set('booking_code', String(booking_code));
  if (status) redirectUrl.searchParams.set('status', resultStatus === 'cancel' ? 'cancelled' : resultStatus);
  
  return res.redirect(redirectUrl.toString());
};
