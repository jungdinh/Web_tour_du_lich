import { Request, Response } from 'express';
import { query } from '../db/index.js';
import NodeCache from 'node-cache';

const cache = new NodeCache();

export const invalidateTourCache = () => cache.flushAll();

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
      data: result.rows,
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
      return res.json(cached);
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
    
    const tour = result.rows[0];
    
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
    const { id } = req.params;
    const { page = '1', limit = '10' } = req.query;
    const { offset, limit: l } = paginate(Number(page), Number(limit));
    
    const countResult = await query(
      'SELECT COUNT(*) FROM reviews WHERE tour_id = $1',
      [id]
    );
    const total = Number(countResult.rows[0].count);
    
    const result = await query(
      `SELECT id, content, rating, reviewer_name, created_at
       FROM reviews WHERE tour_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [id, l, offset]
    );
    
    res.json({
      data: result.rows,
      pagination: {
        page: Number(page),
        limit: l,
        total,
        totalPages: Math.ceil(total / l),
      },
    });
  } catch (error) {
    console.error('Get reviews error:', error);
    res.status(500).json({ error: 'Internal server error' });
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
