import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { getClient, query } from '../db/index.js';
import type { AuthRequest } from './auth.js';

const createBookingSchema = z.object({
  tour_id: z.coerce.number().int().positive(),
  departure_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  guest_count: z.coerce.number().int().min(1).max(20),
  contact_name: z.string().trim().min(2).max(255),
  contact_email: z.string().trim().email().max(255),
  contact_phone: z.string().trim().min(8).max(30).regex(/^[0-9+().\s-]+$/),
  note: z.string().trim().max(1000).optional().default(''),
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

const paymentExpiryMinutes = Math.max(5, Number(process.env.PAYMENT_EXPIRES_MINUTES || 30));

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

const mapBooking = (row: Record<string, unknown>) => {
  const totalAmount = Number(row.total_amount || 0);
  return {
    ...row,
    unit_price: Number(row.unit_price || 0),
    total_amount: totalAmount,
    guest_count: Number(row.guest_count || 0),
    qr_url: buildQrUrl(totalAmount, String(row.payment_code || '')),
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
    const departure = new Date(`${input.departure_date}T00:00:00+07:00`);
    if (Number.isNaN(departure.getTime()) || departure.getTime() < Date.now() - 86400000) {
      return res.status(400).json({ error: 'Ngày khởi hành không hợp lệ hoặc đã qua.' });
    }

    await client.query('BEGIN');
    const tourResult = await client.query(
      `SELECT id, name, destination, price
       FROM tours WHERE id = $1 FOR SHARE`,
      [input.tour_id],
    );
    if (!tourResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Không tìm thấy tour.' });
    }

    const tour = tourResult.rows[0];
    const unitPrice = Number(tour.price);
    if (!Number.isSafeInteger(unitPrice) || unitPrice <= 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Tour chưa có mức giá hợp lệ để đặt trực tuyến.' });
    }

    const totalAmount = unitPrice * input.guest_count;
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
        input.departure_date,
        input.guest_count,
        unitPrice,
        totalAmount,
        input.contact_name,
        input.contact_email,
        input.contact_phone,
        input.note || null,
        paymentExpiryMinutes,
      ],
    );

    await client.query(
      `INSERT INTO user_actions (user_id, tour_id, action_type)
       VALUES ($1, $2, 'booking')`,
      [req.user!.id, tour.id],
    );
    await client.query('COMMIT');
    return res.status(201).json(mapBooking(result.rows[0]));
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.flatten() });
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
      `SELECT * FROM bookings WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.user!.id],
    );
    return res.json(result.rows.map(mapBooking));
  } catch (error) {
    console.error('Get bookings error:', error);
    return res.status(500).json({ error: 'Không thể tải danh sách đặt tour.' });
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
      `SELECT * FROM bookings WHERE id = $1 AND user_id = $2`,
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