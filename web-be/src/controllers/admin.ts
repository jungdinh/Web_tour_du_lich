import { Request, Response } from 'express';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { query } from '../db/index.js';
import { AuthRequest } from './auth.js';
import { applyTravelTypeFilter, invalidateTourCache } from './tours.js';

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  search: z.string().trim().max(120).optional(),
  role: z.enum(['user', 'admin', 'all']).default('all'),
  isActive: z.enum(['active', 'inactive', 'all']).default('all'),
  destination: z.string().trim().max(120).optional(),
  travelType: z.enum(['all', 'domestic', 'international']).default('all'),
  minPrice: z.coerce.number().int().min(0).optional(),
  maxPrice: z.coerce.number().int().min(0).optional(),
  duration: z.coerce.number().int().min(1).max(365).optional(),
});

const itineraryDaySchema = z.object({
  day: z.string().trim().max(50).default(''),
  content: z.array(z.string().trim().min(1).max(1000)).max(30).default([]),
  meal: z.string().trim().max(255).default(''),
  images: z.array(z.string().trim().url()).max(12).default([]),
});

const scheduleRowSchema = z.object({
  date: z.string().trim().max(100).default(''),
  price: z.coerce.number().int().min(0).default(0),
  available: z.boolean().default(true),
});

const tourSchema = z.object({
  name: z.string().trim().min(2).max(500),
  destination: z.string().trim().min(1).max(255),
  price: z.coerce.number().int().min(0),
  duration: z.coerce.number().int().min(1).max(365),
  description: z.string().trim().min(1).max(20000),
  image_url: z.string().trim().url().optional().nullable().or(z.literal('')),
  gallery: z.array(z.string().trim().url()).min(1).max(12),
  season: z.string().trim().min(1).max(50),
  duration_label: z.string().trim().max(20).optional().nullable().or(z.literal('')),
  original_price: z.coerce.number().int().min(0).optional().nullable(),
  highlights: z.array(z.string().trim().min(1).max(500)).max(30).default([]),
  places: z.array(z.string().trim().min(1).max(255)).max(50).default([]),
  topics: z.array(z.string().trim().min(1).max(100)).max(30).default([]),
  itinerary: z.array(itineraryDaySchema).max(30).default([]),
  included: z.array(z.string().trim().min(1).max(500)).max(50).default([]),
  excluded: z.array(z.string().trim().min(1).max(500)).max(50).default([]),
  schedule: z.array(scheduleRowSchema).max(100).default([]),
  transport: z.object({
    airline: z.string().trim().max(255).optional().default(''),
    vehicle: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
  }).default({ airline: '', vehicle: [] }),
});

const uploadMimeTypes = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
])

export const uploadAdminTourImage = async (req: Request, res: Response) => {
  try {
    const contentType = req.headers['content-type']?.split(';')[0] || ''
    const extension = uploadMimeTypes.get(contentType)
    const buffer = Buffer.isBuffer(req.body) ? req.body : null

    if (!extension || !buffer || buffer.length === 0) {
      return res.status(400).json({ error: 'Chỉ hỗ trợ ảnh JPG, PNG hoặc WEBP.' })
    }
    if (buffer.length > 5 * 1024 * 1024) {
      return res.status(413).json({ error: 'Ảnh không được vượt quá 5MB.' })
    }

    const uploadDir = path.resolve(process.cwd(), 'uploads', 'tours')
    await mkdir(uploadDir, { recursive: true })
    const filename = `${randomUUID()}.${extension}`
    await writeFile(path.join(uploadDir, filename), buffer)

    const baseUrl = `${req.protocol}://${req.get('host')}`
    res.status(201).json({ url: `${baseUrl}/uploads/tours/${filename}` })
  } catch (error) {
    console.error('Admin image upload error:', error)
    res.status(500).json({ error: 'Không thể tải ảnh lên.' })
  }
}
const roleSchema = z.object({
  role: z.enum(['user', 'admin']),
});

const parseId = (value: string) => {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid id');
  return id;
};

export const getDashboard = async (_req: AuthRequest, res: Response) => {
  try {
    const [counts, topDestinations, recentUsers, recentActions] = await Promise.all([
      query(`
        SELECT
          (SELECT COUNT(*)::int FROM tours) AS tours,
          (SELECT COUNT(*)::int FROM users) AS users,
          (SELECT COUNT(*)::int FROM reviews) AS reviews,
          (SELECT COUNT(*)::int FROM favorites) AS favorites,
          (SELECT COUNT(*)::int FROM user_actions) AS actions,
          (SELECT COUNT(*)::int FROM chat_messages) AS messages
      `),
      query(`SELECT destination, COUNT(*)::int AS count FROM tours GROUP BY destination ORDER BY count DESC LIMIT 6`),
      query(`SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC LIMIT 6`),
      query(`
        SELECT ua.action_type, ua.search_query, ua.created_at, u.name AS user_name, t.name AS tour_name
        FROM user_actions ua
        JOIN users u ON u.id = ua.user_id
        LEFT JOIN tours t ON t.id = ua.tour_id
        ORDER BY ua.created_at DESC LIMIT 8
      `),
    ]);

    res.json({
      counts: counts.rows[0],
      top_destinations: topDestinations.rows,
      recent_users: recentUsers.rows,
      recent_actions: recentActions.rows,
    });
  } catch (error) {
    console.error('Admin dashboard error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getAdminTours = async (req: Request, res: Response) => {
  try {
    const { page, limit, search, destination, travelType, minPrice, maxPrice, duration } = paginationSchema.parse(req.query);
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (travelType !== 'all') applyTravelTypeFilter(conditions, travelType);

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(name ILIKE $${params.length} OR destination ILIKE $${params.length})`);
    }
    if (destination) {
      params.push(`%${destination}%`);
      conditions.push(`destination ILIKE $${params.length}`);
    }
    if (minPrice !== undefined) {
      params.push(minPrice);
      conditions.push(`price >= $${params.length}`);
    }
    if (maxPrice !== undefined) {
      params.push(maxPrice);
      conditions.push(`price <= $${params.length}`);
    }
    if (duration !== undefined) {
      params.push(duration);
      conditions.push(`duration = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const count = await query(`SELECT COUNT(*)::int AS total FROM tours ${where}`, params);
    const total = count.rows[0].total as number;
    const offset = (page - 1) * limit;
    params.push(limit, offset);

    const result = await query(
      `SELECT id, name, destination, price, duration, duration_label, original_price, description, avg_rating, review_count, image_url, gallery, season, highlights, places, topics, itinerary, included, excluded, schedule, transport, created_at, updated_at
       FROM tours ${where} ORDER BY created_at DESC NULLS LAST, id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    res.json({
      data: result.rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
    console.error('Admin tours error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const createAdminTour = async (req: Request, res: Response) => {
  try {
    const payload = tourSchema.parse(req.body);
    const result = await query(
      `INSERT INTO tours (
         name, destination, price, duration, duration_label, original_price, description,
         image_url, gallery, season, highlights, places, topics, itinerary, included,
         excluded, schedule, transport, source
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, 'tourai')
       RETURNING id, name, destination, price, duration, duration_label, original_price,
         description, avg_rating, review_count, image_url, gallery, season, highlights,
         places, topics, itinerary, included, excluded, schedule, transport, created_at, updated_at`,
      [
        payload.name, payload.destination, payload.price, payload.duration,
        payload.duration_label || null, payload.original_price || null, payload.description,
        payload.image_url || null, payload.gallery, payload.season, payload.highlights,
        payload.places, payload.topics, JSON.stringify(payload.itinerary), JSON.stringify(payload.included),
        JSON.stringify(payload.excluded), JSON.stringify(payload.schedule), JSON.stringify(payload.transport),
      ],
    );
    invalidateTourCache();
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
    console.error('Admin create tour error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateAdminTour = async (req: Request, res: Response) => {
  try {
    const id = parseId(req.params.id);
    const payload = tourSchema.parse(req.body);
    const result = await query(
      `UPDATE tours
       SET name = $1, destination = $2, price = $3, duration = $4, duration_label = $5,
           original_price = $6, description = $7, image_url = $8, gallery = $9, season = $10,
           highlights = $11, places = $12, topics = $13, itinerary = $14, included = $15,
           excluded = $16, schedule = $17, transport = $18, updated_at = CURRENT_TIMESTAMP
       WHERE id = $19
       RETURNING id, name, destination, price, duration, duration_label, original_price,
         description, avg_rating, review_count, image_url, gallery, season, highlights,
         places, topics, itinerary, included, excluded, schedule, transport, created_at, updated_at`,
       [
         payload.name, payload.destination, payload.price, payload.duration,
         payload.duration_label || null, payload.original_price || null, payload.description,
         payload.image_url || null, payload.gallery, payload.season, payload.highlights,
         payload.places, payload.topics, JSON.stringify(payload.itinerary), JSON.stringify(payload.included),
         JSON.stringify(payload.excluded), JSON.stringify(payload.schedule), JSON.stringify(payload.transport), id,
       ],
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Tour not found' });
    invalidateTourCache();
    res.json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
    if (error instanceof Error && error.message === 'Invalid id') return res.status(400).json({ error: error.message });
    console.error('Admin update tour error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteAdminTour = async (req: Request, res: Response) => {
  try {
    const id = parseId(req.params.id);
    const result = await query('DELETE FROM tours WHERE id = $1 RETURNING id', [id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Tour not found' });
    invalidateTourCache();
    res.status(204).send();
  } catch (error) {
    if (error instanceof Error && error.message === 'Invalid id') return res.status(400).json({ error: error.message });
    console.error('Admin delete tour error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getAdminUsers = async (req: Request, res: Response) => {
  try {
    const { page, limit, search, role, isActive } = paginationSchema.parse(req.query);
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(name ILIKE $${params.length} OR email ILIKE $${params.length})`);
    }
    if (role !== 'all') {
      params.push(role);
      conditions.push(`role = $${params.length}`);
    }
    if (isActive !== 'all') conditions.push(`is_active = ${isActive === 'active' ? 'TRUE' : 'FALSE'}`);
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const count = await query(`SELECT COUNT(*)::int AS total FROM users ${where}`, params);
    const total = count.rows[0].total as number;
    const offset = (page - 1) * limit;
    params.push(limit, offset);
    const result = await query(
      `SELECT u.id, u.name, u.email, u.role, u.is_active, u.created_at, u.updated_at,
          (SELECT COUNT(*)::int FROM favorites f WHERE f.user_id = u.id) AS favorite_count,
          (SELECT COUNT(*)::int FROM user_actions ua WHERE ua.user_id = u.id) AS action_count,
          (SELECT COUNT(*)::int FROM reviews r WHERE lower(r.reviewer_name) = lower(u.name)) AS review_count
       FROM users u ${where}
       ORDER BY u.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    res.json({ data: result.rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
    console.error('Admin users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateAdminUserRole = async (req: AuthRequest, res: Response) => {
  try {
    const id = parseId(req.params.id);
    const { role } = roleSchema.parse(req.body);
    if (id === req.user?.id && role !== 'admin') return res.status(400).json({ error: 'You cannot remove your own admin role' });
    const result = await query(
      `UPDATE users SET role = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2
       RETURNING id, name, email, role, created_at, updated_at`,
      [role, id],
    );
    if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
    if (error instanceof Error && error.message === 'Invalid id') return res.status(400).json({ error: error.message });
    console.error('Admin role update error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getAdminUserDetail = async (req: Request, res: Response) => {
  try {
    const id = parseId(req.params.id);
    const userResult = await query(
      `SELECT id, name, email, role, is_active, created_at, updated_at,
        (SELECT COUNT(*)::int FROM favorites WHERE user_id = users.id) AS favorite_count,
        (SELECT COUNT(*)::int FROM user_actions WHERE user_id = users.id) AS action_count,
        (SELECT COUNT(*)::int FROM reviews WHERE lower(reviewer_name) = lower(users.name)) AS review_count
       FROM users WHERE id = $1`,
      [id],
    );
    if (!userResult.rows.length) return res.status(404).json({ error: 'User not found' });
    const [favorites, reviews, chats] = await Promise.all([
      query(`SELECT t.id, t.name, t.destination, t.price, t.image_url, f.created_at AS favorited_at
             FROM favorites f JOIN tours t ON t.id = f.tour_id WHERE f.user_id = $1 ORDER BY f.created_at DESC LIMIT 20`, [id]),
      query(`SELECT r.id, r.tour_id, t.name AS tour_name, r.rating, r.content, r.created_at
             FROM reviews r JOIN tours t ON t.id = r.tour_id WHERE lower(r.reviewer_name) = lower($1)
             ORDER BY r.created_at DESC LIMIT 20`, [userResult.rows[0].name]),
      query(`SELECT COUNT(*)::int AS count FROM chat_sessions WHERE user_id = $1`, [id]),
    ]);
    res.json({ ...userResult.rows[0], favorites: favorites.rows, reviews: reviews.rows, chat_session_count: chats.rows[0].count });
  } catch (error) {
    if (error instanceof Error && error.message === 'Invalid id') return res.status(400).json({ error: error.message });
    console.error('Admin user detail error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateAdminUserStatus = async (req: AuthRequest, res: Response) => {
  try {
    const id = parseId(req.params.id);
    const { is_active } = z.object({ is_active: z.boolean() }).parse(req.body);
    if (id === req.user?.id && !is_active) return res.status(400).json({ error: 'You cannot deactivate your own account' });
    const result = await query(
      `UPDATE users SET is_active = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2
       RETURNING id, name, email, role, is_active, created_at, updated_at`,
      [is_active, id],
    );
    if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
    if (error instanceof Error && error.message === 'Invalid id') return res.status(400).json({ error: error.message });
    console.error('Admin user status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteAdminUser = async (req: AuthRequest, res: Response) => {
  try {
    const id = parseId(req.params.id);
    if (id === req.user?.id) return res.status(400).json({ error: 'You cannot delete your own account' });
    const result = await query('DELETE FROM users WHERE id = $1 RETURNING id', [id]);
    if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
    res.status(204).send();
  } catch (error) {
    if (error instanceof Error && error.message === 'Invalid id') return res.status(400).json({ error: error.message });
    console.error('Admin delete user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getAdminReviews = async (req: Request, res: Response) => {
  try {
    const { page, limit, search } = paginationSchema.parse(req.query);
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(r.content ILIKE $${params.length} OR t.name ILIKE $${params.length} OR r.reviewer_name ILIKE $${params.length})`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const count = await query(`SELECT COUNT(*)::int AS total FROM reviews r JOIN tours t ON t.id = r.tour_id ${where}`, params);
    const total = count.rows[0].total as number;
    const offset = (page - 1) * limit;
    params.push(limit, offset);
    const result = await query(
      `SELECT r.id, r.content, r.rating, r.reviewer_name, r.created_at, r.tour_id, t.name AS tour_name
       FROM reviews r JOIN tours t ON t.id = r.tour_id ${where}
       ORDER BY r.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    res.json({ data: result.rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
    console.error('Admin reviews error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteAdminReview = async (req: Request, res: Response) => {
  try {
    const id = parseId(req.params.id);
    const result = await query('DELETE FROM reviews WHERE id = $1 RETURNING id', [id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Review not found' });
    res.status(204).send();
  } catch (error) {
    if (error instanceof Error && error.message === 'Invalid id') return res.status(400).json({ error: error.message });
    console.error('Admin delete review error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};



