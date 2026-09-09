import type { Request, Response } from 'express';
import { z } from 'zod';
import { query } from '../db/index.js';
import {
  bookingPaymentJoin,
  bookingProjection,
  mapBookingBase,
} from './bookings.js';

const adminBookingQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  search: z.string().trim().max(120).optional(),
  status: z.enum(['all', 'pending_payment', 'paid', 'confirmed', 'cancelled', 'expired', 'refunded']).default('all'),
  paymentStatus: z.enum(['all', 'pending', 'paid', 'failed', 'refunded']).default('all'),
});

const parseId = (value: string) => {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid id');
  return id;
};

const adminBookingFromClause = `
  FROM bookings b
  JOIN users u ON u.id = b.user_id
  ${bookingPaymentJoin('b')}`;

const mapAdminBooking = (row: Record<string, unknown>) => ({
  ...mapBookingBase(row),
  user_id: Number(row.user_id),
  user_name: String(row.user_name || ''),
  user_email: String(row.user_email || ''),
});

const mapPayment = (row: Record<string, unknown>) => ({
  id: Number(row.id),
  provider: String(row.provider || ''),
  provider_transaction_id: row.provider_transaction_id === null || row.provider_transaction_id === undefined
    ? null
    : String(row.provider_transaction_id),
  reference_code: row.reference_code === null || row.reference_code === undefined
    ? null
    : String(row.reference_code),
  transfer_amount: Number(row.transfer_amount || 0),
  status: String(row.status || ''),
  paid_at: row.paid_at ? String(row.paid_at) : null,
  created_at: row.created_at ? String(row.created_at) : null,
});

export const getAdminBookings = async (req: Request, res: Response) => {
  try {
    const { page, limit, search, status, paymentStatus } = adminBookingQuerySchema.parse(req.query);

    await query(
      `UPDATE bookings SET status = 'expired', updated_at = NOW()
       WHERE payment_status = 'pending'
         AND status = 'pending_payment' AND expires_at <= NOW()`,
    );

    const conditions: string[] = [];
    const params: unknown[] = [];
    if (search) {
      params.push(`%${search}%`);
      const searchParam = `$${params.length}`;
      conditions.push(`(
        b.booking_code ILIKE ${searchParam}
        OR b.payment_code ILIKE ${searchParam}
        OR b.tour_name ILIKE ${searchParam}
        OR b.destination ILIKE ${searchParam}
        OR b.contact_name ILIKE ${searchParam}
        OR b.contact_email ILIKE ${searchParam}
        OR u.name ILIKE ${searchParam}
        OR u.email ILIKE ${searchParam}
      )`);
    }
    if (status !== 'all') {
      params.push(status);
      conditions.push(`b.status = $${params.length}`);
    }
    if (paymentStatus !== 'all') {
      params.push(paymentStatus);
      conditions.push(`b.payment_status = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const count = await query(
      `SELECT COUNT(*)::int AS total ${adminBookingFromClause} ${where}`,
      params,
    );
    const total = Number(count.rows[0]?.total || 0);
    const offset = (page - 1) * limit;
    const dataParams = [...params, limit, offset];
    const result = await query(
      `SELECT ${bookingProjection('b')}, u.name AS user_name, u.email AS user_email
       ${adminBookingFromClause}
       ${where}
       ORDER BY b.created_at DESC, b.id DESC
       LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
      dataParams,
    );

    return res.json({
      data: result.rows.map((row) => mapAdminBooking(row)),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.flatten() });
    console.error('Admin bookings error:', error);
    return res.status(500).json({ error: 'Không thể tải lịch sử đặt tour.' });
  }
};

export const getAdminBooking = async (req: Request, res: Response) => {
  try {
    const id = parseId(req.params.id);
    await query(
      `UPDATE bookings SET status = 'expired', updated_at = NOW()
       WHERE id = $1 AND payment_status = 'pending'
         AND status = 'pending_payment' AND expires_at <= NOW()`,
      [id],
    );

    const bookingResult = await query(
      `SELECT ${bookingProjection('b')}, u.name AS user_name, u.email AS user_email
       ${adminBookingFromClause}
       WHERE b.id = $1`,
      [id],
    );
    if (!bookingResult.rows.length) return res.status(404).json({ error: 'Không tìm thấy booking.' });

    const payments = await query(
      `SELECT id, provider, provider_transaction_id, reference_code,
              transfer_amount, status, paid_at, created_at
       FROM payments
       WHERE booking_id = $1
       ORDER BY paid_at DESC, id DESC`,
      [id],
    );

    return res.json({
      ...mapAdminBooking(bookingResult.rows[0]),
      payments: payments.rows.map((row) => mapPayment(row)),
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Invalid id') {
      return res.status(400).json({ error: 'Mã booking không hợp lệ.' });
    }
    console.error('Admin booking detail error:', error);
    return res.status(500).json({ error: 'Không thể tải chi tiết booking.' });
  }
};
