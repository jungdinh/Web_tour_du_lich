import { Request, Response } from 'express';
import { z } from 'zod';
import { query } from '../db/index.js';

const reviewListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  search: z.string().trim().max(120).optional(),
  status: z.enum(['all', 'pending', 'replied']).default('all'),
});

export const getAdminReviews = async (req: Request, res: Response) => {
  try {
    const { page, limit, search, status } = reviewListSchema.parse(req.query);
    const conditions = ['r.user_id IS NOT NULL'];
    const params: unknown[] = [];
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(u.name ILIKE $${params.length} OR u.email ILIKE $${params.length} OR t.name ILIKE $${params.length} OR r.content ILIKE $${params.length})`);
    }
    if (status === 'pending') conditions.push('rr.id IS NULL');
    if (status === 'replied') conditions.push('rr.id IS NOT NULL');
    const where = `WHERE ${conditions.join(' AND ')}`;
    const countResult = await query(
      `SELECT COUNT(*)::int AS total FROM reviews r
       INNER JOIN users u ON u.id = r.user_id
       INNER JOIN tours t ON t.id = r.tour_id
       LEFT JOIN review_replies rr ON rr.review_id = r.id ${where}`,
      params,
    );
    const total = Number(countResult.rows[0]?.total || 0);
    const offset = (page - 1) * limit;
    params.push(limit, offset);
    const result = await query(
      `SELECT r.id, r.tour_id, t.name AS tour_name, t.destination,
              u.id AS user_id, u.name AS user_name, u.email AS user_email,
              LEAST(5, GREATEST(1, r.rating / 2.0))::float AS rating,
              r.content, r.created_at, r.updated_at,
              rr.id AS reply_id, rr.content AS reply_content,
              rr.created_at AS reply_created_at, rr.updated_at AS reply_updated_at,
              reply_admin.name AS reply_admin_name
       FROM reviews r
       INNER JOIN users u ON u.id = r.user_id
       INNER JOIN tours t ON t.id = r.tour_id
       LEFT JOIN review_replies rr ON rr.review_id = r.id
       LEFT JOIN users reply_admin ON reply_admin.id = rr.admin_id
       ${where}
       ORDER BY (rr.id IS NULL) DESC, r.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return res.json({
      data: result.rows.map((row) => ({
        id: row.id, tour_id: row.tour_id, tour_name: row.tour_name, destination: row.destination,
        user_id: row.user_id, user_name: row.user_name, user_email: row.user_email,
        rating: row.rating, content: row.content, created_at: row.created_at, updated_at: row.updated_at,
        admin_reply: row.reply_id ? {
          id: Number(row.reply_id), content: row.reply_content, admin_name: row.reply_admin_name || 'Vivu',
          created_at: row.reply_created_at, updated_at: row.reply_updated_at || row.reply_created_at,
        } : null,
      })),
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.flatten() });
    console.error('Get admin reviews error:', error);
    return res.status(500).json({ error: 'Unable to load customer reviews.' });
  }
};
