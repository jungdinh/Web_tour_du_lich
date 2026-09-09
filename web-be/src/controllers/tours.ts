import { Request, Response } from 'express';
import { z } from 'zod';
import { getClient, query } from '../db/index.js';
import type { AuthRequest } from './auth.js';
import NodeCache from 'node-cache';
import { filterFutureScheduleRows } from '../utils/schedule.js';

const cache = new NodeCache();

export const invalidateTourCache = () => cache.flushAll();

const mapTourSchedule = <TourRow extends Record<string, unknown>>(tour: TourRow) => ({
  ...tour,
  schedule: filterFutureScheduleRows(tour.schedule),
});

const VIETNAMESE_ACCENTED_CHARS = '\u00e0\u00e1\u1ea1\u1ea3\u00e3\u00e2\u1ea7\u1ea5\u1ead\u1ea9\u1eab\u0103\u1eb1\u1eaf\u1eb7\u1eb3\u1eb5\u00e8\u00e9\u1eb9\u1ebb\u1ebd\u00ea\u1ec1\u1ebf\u1ec7\u1ec3\u1ec5\u00ec\u00ed\u1ecb\u1ec9\u0129\u00f2\u00f3\u1ecd\u1ecf\u00f5\u00f4\u1ed3\u1ed1\u1ed9\u1ed5\u1ed7\u01a1\u1edd\u1edb\u1ee3\u1edf\u1ee1\u00f9\u00fa\u1ee5\u1ee7\u0169\u01b0\u1eeb\u1ee9\u1ef1\u1eed\u1eef\u1ef3\u00fd\u1ef5\u1ef7\u1ef9\u0111';
const VIETNAMESE_PLAIN_CHARS = 'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd';

const normalizeSearchText = (value: unknown) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\u0111/g, 'd')
  .replace(/\u0110/g, 'd')
  .toLowerCase()
  .trim();

const normalizedSql = (column: string) =>
  `translate(lower(coalesce(${column}, '')), '${VIETNAMESE_ACCENTED_CHARS}', '${VIETNAMESE_PLAIN_CHARS}')`;

const INTERNATIONAL_DESTINATIONS = [
  'anh', 'bac au', 'bac kinh', 'bali', 'canada', 'chau au', 'cung duong vang',
  'cuu trai cau', 'dai loan', 'dong au', 'dubai', 'ha khau', 'han quoc',
  'hokkaido', 'hong kong', 'indonesia', 'lao', 'le giang', 'malaysia',
  'maldives', 'my', 'na uy', 'nga', 'nhat ban', 'phan lan', 'phap',
  'philippines', 'phuket', 'phuong hoang co tran', 'quy chau', 'seoul',
  'singapore', 'thai lan', 'thuong hai', 'thuy si', 'tokyo', 'tour du lich 2/9',
  'tour he', 'tour no shopping', 'tour tu tuc', 'trung khanh', 'trung quoc', 'uc',
];

const INTERNATIONAL_KEYWORDS = [
  'bac au', 'bac kinh', 'bali', 'bangkok', 'busan', 'canada', 'chau au',
  'cuu trai cau', 'dai loan', 'disneyland', 'dubai', 'emirates', 'han quoc',
  'hong kong', 'hongkong', 'indonesia', 'kyoto', 'las vegas', 'le giang',
  'los angeles', 'malaysia', 'maldives', 'melbourne', 'nhat ban', 'nusa penida',
  'na uy', 'osaka', 'pattaya', 'phan lan', 'phap', 'philippines', 'phuket',
  'phat quang son', 'seoul', 'singapore', 'sydney', 'tho nhi ky', 'thuy si',
  'thai lan', 'thuong hai', 'tokyo', 'toronto', 'tour du lich 2/9', 'tour he',
  'tour no shopping', 'tour tu tuc', 'trung quoc', 'vancouver',
];

const sqlStringLiteral = (value: string) => `'${value.replace(/'/g, "''")}'`;
const internationalDestinationSql = INTERNATIONAL_DESTINATIONS.map(sqlStringLiteral).join(', ');
const internationalKeywordSql = INTERNATIONAL_KEYWORDS.map(sqlStringLiteral).join(', ');

const internationalCondition = () => `(
  ${normalizedSql('destination')} IN (${internationalDestinationSql})
  OR EXISTS (
    SELECT 1
    FROM unnest(ARRAY[${internationalKeywordSql}]) AS keyword(value)
    WHERE ${normalizedSql('name')} LIKE '%' || keyword.value || '%'
       OR ${normalizedSql('destination')} LIKE '%' || keyword.value || '%'
       OR ${normalizedSql("array_to_string(places, ' ')")} LIKE '%' || keyword.value || '%'
  )
)`;

export const applyTravelTypeFilter = (conditions: string[], travelType: unknown) => {
  if (travelType === 'international') {
    conditions.push(internationalCondition());
  } else {
    conditions.push(`NOT ${internationalCondition()}`);
  }
};

const paginate = (page: number, limit: number) => {
  const offset = (page - 1) * limit;
  return { offset, limit: Math.min(limit, 50) };
};

const reviewPaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

const reviewInputSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  content: z.string().trim().min(3).max(2000),
});

const adminReplyInputSchema = z.object({
  content: z.string().trim().min(3).max(2000),
});

const parsePositiveId = (value: string) => {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid id');
  return id;
};

const normalizeReviewRating = (value: unknown, source: 'user' | 'imported') => {
  const rating = Number(value);
  if (!Number.isFinite(rating) || rating <= 0) return 4;
  const normalized = source === 'user' ? rating / 2 : rating > 5 ? rating / 2 : rating;
  return Number(Math.min(5, Math.max(1, normalized)).toFixed(1));
};

const mapReview = (row: Record<string, unknown>) => {
  const source = row.user_id ? 'user' : 'imported';
  const {
    user_id: _userId,
    admin_reply_id: replyId,
    admin_reply_content: replyContent,
    admin_reply_created_at: replyCreatedAt,
    admin_reply_updated_at: replyUpdatedAt,
    admin_reply_by_name: replyAuthor,
    ...review
  } = row;

  return {
    ...review,
    rating: normalizeReviewRating(row.rating, source),
    source,
    admin_reply: replyId ? {
      id: Number(replyId),
      content: String(replyContent || ''),
      admin_name: String(replyAuthor || 'TourAI'),
      created_at: String(replyCreatedAt),
      updated_at: String(replyUpdatedAt || replyCreatedAt),
    } : null,
  };
};

const reviewSelect = `
  SELECT r.id, r.content, r.rating,
         COALESCE(NULLIF(TRIM(u.name), ''), NULLIF(TRIM(r.reviewer_name), ''), 'Khách du lịch') AS reviewer_name,
         r.user_id, r.created_at, r.updated_at,
         rr.id AS admin_reply_id,
         rr.content AS admin_reply_content,
         rr.created_at AS admin_reply_created_at,
         rr.updated_at AS admin_reply_updated_at,
         reply_user.name AS admin_reply_by_name
  FROM reviews r
  LEFT JOIN users u ON u.id = r.user_id
  LEFT JOIN review_replies rr ON rr.review_id = r.id
  LEFT JOIN users reply_user ON reply_user.id = rr.admin_id`;

const refreshTourReviewStats = async (client: Awaited<ReturnType<typeof getClient>>, tourId: number) => {
  await client.query(
    `WITH user_stats AS (
       SELECT COUNT(*)::int AS user_count,
              COALESCE(AVG(
                CASE
                  WHEN rating IS NULL OR rating <= 0 THEN 8
                  WHEN user_id IS NOT NULL THEN LEAST(rating, 10)
                  WHEN rating > 5 THEN LEAST(rating, 10)
                  ELSE rating * 2
                END
              ), 0)::float AS user_avg_rating
       FROM reviews
       WHERE tour_id = $1 AND user_id IS NOT NULL
     )
     UPDATE tours
     SET review_count = COALESCE(tours.imported_review_count, 0) + user_stats.user_count,
         avg_rating = CASE
           WHEN COALESCE(tours.imported_review_count, 0) + user_stats.user_count = 0
             THEN COALESCE(tours.imported_avg_rating, 0)
           ELSE (
             COALESCE(tours.imported_avg_rating, 0) * COALESCE(tours.imported_review_count, 0)
             + user_stats.user_avg_rating * user_stats.user_count
           ) / (COALESCE(tours.imported_review_count, 0) + user_stats.user_count)
         END,
         updated_at = CURRENT_TIMESTAMP
     FROM user_stats
     WHERE tours.id = $1`,
    [tourId],
  );
};


export const getDestinations = async (req: Request, res: Response) => {
  try {
    const { travelType = 'domestic' } = req.query;
    const cacheKey = `tour_destinations:${travelType}`;
    const cached = cache.get(cacheKey);

    if (cached) {
      return res.json(cached);
    }

    const conditions = ["destination IS NOT NULL", "TRIM(destination) <> ''"];
    applyTravelTypeFilter(conditions, travelType);
    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const result = await query(
      `SELECT destination, COUNT(*)::int AS tour_count
       FROM tours
       ${whereClause}
       GROUP BY destination
       ORDER BY destination ASC`
    );

    const destinations = result.rows.map((row) => ({
      name: row.destination,
      tour_count: row.tour_count,
    }));

    cache.set(cacheKey, destinations, 3600);
    res.json(destinations);
  } catch (error) {
    console.error('Get destinations error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getTours = async (req: Request, res: Response) => {
  try {
    const { 
      page = '1', 
      limit = '20',
      destination,
      minPrice,
      maxPrice,
      duration,
      q,
      tag,
      travelType = 'domestic',
      sort = 'rating'
    } = req.query;
    
    const { offset, limit: l } = paginate(Number(page), Number(limit));
    
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;
    applyTravelTypeFilter(conditions, travelType);
    
    if (q) {
      const normalizedQuery = `%${normalizeSearchText(q)}%`;
      conditions.push(`(
        ${normalizedSql('name')} LIKE $${paramIndex}
        OR ${normalizedSql('description')} LIKE $${paramIndex}
        OR ${normalizedSql('destination')} LIKE $${paramIndex}
      )`);
      params.push(normalizedQuery);
      paramIndex++;
    }
    if (destination) {
      conditions.push(`destination ILIKE $${paramIndex++}`);
      params.push(`%${destination}%`);
    }
    if (minPrice) {
      conditions.push(`price >= $${paramIndex++}`);
      params.push(Number(minPrice));
    }
    if (maxPrice) {
      conditions.push(`price <= $${paramIndex++}`);
      params.push(Number(maxPrice));
    }
    if (duration) {
      conditions.push(`duration = $${paramIndex++}`);
      params.push(Number(duration));
    }
    
    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
    
    let orderClause = 'ORDER BY avg_rating DESC';
    if (sort === 'price_asc') orderClause = 'ORDER BY price ASC';
    else if (sort === 'price_desc') orderClause = 'ORDER BY price DESC';
    else if (sort === 'reviews') orderClause = 'ORDER BY review_count DESC';
    
    const countResult = await query(
      `SELECT COUNT(*) FROM tours ${whereClause}`,
      params
    );
    const total = Number(countResult.rows[0].count);
    
    params.push(l, offset);
    const result = await query(
      `SELECT id, name, destination, price, duration, duration_label,
              original_price, description, avg_rating, review_count,
              source, source_url, image_url, season,
              highlights, places, topics, gallery,
              itinerary, included, excluded, schedule, transport
       FROM tours
       ${whereClause}
       ${orderClause}
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      params
    );

    res.json({
      data: result.rows.map((tour) => mapTourSchedule(tour)),
      pagination: {
        page: Number(page),
        limit: l,
        total,
        totalPages: Math.ceil(total / l),
      },
    });
  } catch (error) {
    console.error('Get tours error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getTourById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const cacheKey = `tour:${id}`;
    const cached = cache.get(cacheKey);
    
    if (cached) {
      return res.json(mapTourSchedule(cached as Record<string, unknown>));
    }
    
    const result = await query(
      `SELECT id, name, destination, price, duration, duration_label,
              original_price, description, avg_rating, review_count,
              source, source_url, image_url, season,
              highlights, places, topics, gallery,
              itinerary, included, excluded, schedule, transport
       FROM tours WHERE id = $1`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tour not found' });
    }
    
    const tour = mapTourSchedule(result.rows[0]);
    
    const tagsResult = await query(
      'SELECT tag, weight FROM tour_tags WHERE tour_id = $1 ORDER BY weight DESC',
      [id]
    );
    tour.tags = tagsResult.rows;
    
    cache.set(cacheKey, tour, 1800);
    
    res.json(tour);
  } catch (error) {
    console.error('Get tour error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getTourReviews = async (req: Request, res: Response) => {
  try {
    const tourId = parsePositiveId(req.params.id);
    const { page, limit } = reviewPaginationSchema.parse(req.query);
    const { offset, limit: pageSize } = paginate(page, limit);
    
    const countResult = await query(
      'SELECT COUNT(*) FROM reviews WHERE tour_id = $1',
      [tourId]
    );
    const total = Number(countResult.rows[0].count);
    
    const result = await query(
      `${reviewSelect}
       WHERE r.tour_id = $1
       ORDER BY r.created_at DESC
       LIMIT $2 OFFSET $3`,
      [tourId, pageSize, offset]
    );
    
    res.json({
      data: result.rows.map(mapReview),
      pagination: {
        page,
        limit: pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.flatten() });
    if (error instanceof Error && error.message === 'Invalid id') {
      return res.status(400).json({ error: 'Mã tour không hợp lệ.' });
    }
    console.error('Get reviews error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getMyTourReview = async (req: AuthRequest, res: Response) => {
  try {
    const tourId = parsePositiveId(req.params.id);
    const result = await query(
      `${reviewSelect}
       WHERE r.tour_id = $1 AND r.user_id = $2`,
      [tourId, req.user!.id],
    );
    return res.json({ review: result.rows[0] ? mapReview(result.rows[0]) : null });
  } catch (error) {
    if (error instanceof Error && error.message === 'Invalid id') {
      return res.status(400).json({ error: 'Mã tour không hợp lệ.' });
    }
    console.error('Get my review error:', error);
    return res.status(500).json({ error: 'Không thể tải đánh giá của bạn.' });
  }
};

export const createTourReview = async (req: AuthRequest, res: Response) => {
  const client = await getClient();
  try {
    const tourId = parsePositiveId(req.params.id);
    const input = reviewInputSchema.parse(req.body);

    await client.query('BEGIN');
    const tourResult = await client.query('SELECT id FROM tours WHERE id = $1 FOR SHARE', [tourId]);
    if (!tourResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Không tìm thấy tour.' });
    }

    const result = await client.query(
      `INSERT INTO reviews (tour_id, user_id, content, rating, reviewer_name, updated_at)
       SELECT $1, u.id, $2, $3, u.name, CURRENT_TIMESTAMP
       FROM users u
       WHERE u.id = $4 AND u.is_active = TRUE
       RETURNING id, content, rating, reviewer_name, user_id, created_at, updated_at`,
      [tourId, input.content, input.rating * 2, req.user!.id],
    );
    if (!result.rows.length) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Tài khoản không thể gửi đánh giá.' });
    }

    await refreshTourReviewStats(client, tourId);
    await client.query('COMMIT');
    invalidateTourCache();
    return res.status(201).json(mapReview(result.rows[0]));
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.flatten() });
    if (error instanceof Error && error.message === 'Invalid id') {
      return res.status(400).json({ error: 'Mã tour không hợp lệ.' });
    }
    if ((error as { code?: string }).code === '23505') {
      return res.status(409).json({ error: 'Bạn đã đánh giá tour này. Hãy chỉnh sửa đánh giá hiện có.' });
    }
    console.error('Create review error:', error);
    return res.status(500).json({ error: 'Không thể gửi đánh giá.' });
  } finally {
    client.release();
  }
};

export const updateTourReview = async (req: AuthRequest, res: Response) => {
  const client = await getClient();
  try {
    const tourId = parsePositiveId(req.params.id);
    const reviewId = parsePositiveId(req.params.reviewId);
    const input = reviewInputSchema.parse(req.body);

    await client.query('BEGIN');
    const result = await client.query(
       `UPDATE reviews
        SET content = $1,
            rating = $2,
            reviewer_name = (SELECT name FROM users WHERE id = $5),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $3 AND tour_id = $4 AND user_id = $5
        RETURNING id, content, rating, reviewer_name, user_id, created_at, updated_at`,
       [input.content, input.rating * 2, reviewId, tourId, req.user!.id],
    );
    if (!result.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Không tìm thấy đánh giá của bạn.' });
    }

    await refreshTourReviewStats(client, tourId);
    await client.query('COMMIT');
    invalidateTourCache();
    return res.json(mapReview(result.rows[0]));
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.flatten() });
    if (error instanceof Error && error.message === 'Invalid id') {
      return res.status(400).json({ error: 'Mã tour hoặc đánh giá không hợp lệ.' });
    }
    console.error('Update review error:', error);
    return res.status(500).json({ error: 'Không thể cập nhật đánh giá.' });
  } finally {
    client.release();
  }
};

export const deleteTourReview = async (req: AuthRequest, res: Response) => {
  const client = await getClient();
  try {
    const tourId = parsePositiveId(req.params.id);
    const reviewId = parsePositiveId(req.params.reviewId);

    await client.query('BEGIN');
    const result = await client.query(
      `DELETE FROM reviews
       WHERE id = $1 AND tour_id = $2 AND user_id = $3
       RETURNING id`,
      [reviewId, tourId, req.user!.id],
    );
    if (!result.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Không tìm thấy đánh giá của bạn.' });
    }

    await refreshTourReviewStats(client, tourId);
    await client.query('COMMIT');
    invalidateTourCache();
    return res.status(204).send();
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (error instanceof Error && error.message === 'Invalid id') {
      return res.status(400).json({ error: 'Mã tour hoặc đánh giá không hợp lệ.' });
    }
    console.error('Delete review error:', error);
    return res.status(500).json({ error: 'Không thể xóa đánh giá.' });
  } finally {
    client.release();
  }
};

export const upsertAdminReviewReply = async (req: AuthRequest, res: Response) => {
  try {
    const tourId = parsePositiveId(req.params.id);
    const reviewId = parsePositiveId(req.params.reviewId);
    const { content } = adminReplyInputSchema.parse(req.body);

    const replyResult = await query(
      `INSERT INTO review_replies (review_id, admin_id, content)
       SELECT r.id, $1, $2
       FROM reviews r
       WHERE r.id = $3 AND r.tour_id = $4
       ON CONFLICT (review_id) DO UPDATE
       SET admin_id = EXCLUDED.admin_id,
           content = EXCLUDED.content,
           updated_at = CURRENT_TIMESTAMP
       RETURNING id`,
      [req.user!.id, content, reviewId, tourId],
    );
    if (!replyResult.rows.length) return res.status(404).json({ error: 'Không tìm thấy review của tour.' });

    const result = await query(
      `${reviewSelect}
       WHERE r.id = $1 AND r.tour_id = $2`,
      [reviewId, tourId],
    );
    return res.json(mapReview(result.rows[0]));
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.flatten() });
    if (error instanceof Error && error.message === 'Invalid id') {
      return res.status(400).json({ error: 'Mã tour hoặc review không hợp lệ.' });
    }
    console.error('Upsert admin review reply error:', error);
    return res.status(500).json({ error: 'Không thể lưu phản hồi của quản trị viên.' });
  }
};

export const deleteAdminReviewReply = async (req: AuthRequest, res: Response) => {
  try {
    const tourId = parsePositiveId(req.params.id);
    const reviewId = parsePositiveId(req.params.reviewId);
    const result = await query(
      `DELETE FROM review_replies rr
       USING reviews r
       WHERE rr.review_id = r.id
         AND r.id = $1
         AND r.tour_id = $2
       RETURNING rr.id`,
      [reviewId, tourId],
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Không tìm thấy phản hồi của quản trị viên.' });
    return res.status(204).send();
  } catch (error) {
    if (error instanceof Error && error.message === 'Invalid id') {
      return res.status(400).json({ error: 'Mã tour hoặc review không hợp lệ.' });
    }
    console.error('Delete admin review reply error:', error);
    return res.status(500).json({ error: 'Không thể xóa phản hồi của quản trị viên.' });
  }
};

export const getPopularTours = async (_req: Request, res: Response) => {
  try {
    const cacheKey = 'popular_tours';
    const cached = cache.get(cacheKey);
    
    if (cached) {
      return res.json(cached);
    }
    
    const result = await query(
      `SELECT id, name, destination, price, duration, avg_rating, 
              review_count, image_url, places
       FROM tours
       ORDER BY avg_rating DESC, review_count DESC
       LIMIT 10`
    );
    
    cache.set(cacheKey, result.rows, 3600);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Get popular tours error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const searchTours = async (req: Request, res: Response) => {
  try {
    const { q, ...filters } = req.query;
    const cacheKey = `search:${q}:${JSON.stringify(filters)}`;
    const cached = cache.get(cacheKey);
    
    if (cached) {
      return res.json(cached);
    }
    
    const { offset, limit } = paginate(1, 20);
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;
    
    if (q) {
      const normalizedQuery = `%${normalizeSearchText(q)}%`;
      conditions.push(`(
        ${normalizedSql('name')} LIKE $${paramIndex}
        OR ${normalizedSql('description')} LIKE $${paramIndex}
        OR ${normalizedSql('destination')} LIKE $${paramIndex}
      )`);
      params.push(normalizedQuery);
      paramIndex++;
    }
    
    Object.entries(filters).forEach(([key, value]) => {
      if (value) {
        if (key === 'minPrice') {
          conditions.push(`price >= $${paramIndex++}`);
          params.push(Number(value));
        } else if (key === 'maxPrice') {
          conditions.push(`price <= $${paramIndex++}`);
          params.push(Number(value));
        } else {
          conditions.push(`${key} = $${paramIndex++}`);
          params.push(value);
        }
      }
    });
    
    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
    params.push(limit, offset);
    
    const result = await query(
      `SELECT id, name, destination, price, duration, avg_rating, 
              review_count, image_url
       FROM tours
       ${whereClause}
       ORDER BY avg_rating DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      params
    );
    
    cache.set(cacheKey, result.rows, 900);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Search tours error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
