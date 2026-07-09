import { Request, Response } from 'express';
import { query } from '../db/index.js';
import { authMiddleware, AuthRequest } from '../controllers/auth.js';
import NodeCache from 'node-cache';

const cache = new NodeCache();

// Pagination helper
const paginate = (page: number, limit: number) => {
  const offset = (page - 1) * limit;
  return { offset, limit: Math.min(limit, 50) }; // Max 50 per page
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
      tag,
      sort = 'rating'
    } = req.query;
    
    const { offset, limit: l } = paginate(Number(page), Number(limit));
    
    let whereConditions: string[] = [];
    let params: unknown[] = [];
    let paramIndex = 1;
    
    if (destination) {
      whereConditions.push(`destination ILIKE $${paramIndex++}`);
      params.push(`%${destination}%`);
    }
    if (minPrice) {
      whereConditions.push(`price >= $${paramIndex++}`);
      params.push(Number(minPrice));
    }
    if (maxPrice) {
      whereConditions.push(`price <= $${paramIndex++}`);
      params.push(Number(maxPrice));
    }
    if (duration) {
      whereConditions.push(`duration = $${paramIndex++}`);
      params.push(Number(duration));
    }
    if (tag) {
      whereConditions.push(`EXISTS (
        SELECT 1 FROM tour_tags tt 
        WHERE tt.tour_id = tours.id AND tt.tag = $${paramIndex++}
      )`);
      params.push(tag);
    }
    
    const whereClause = whereConditions.length > 0 
      ? 'WHERE ' + whereConditions.join(' AND ')
      : '';
    
    // Sort options
    let orderClause = 'ORDER BY avg_rating DESC';
    switch (sort) {
      case 'price_asc':
        orderClause = 'ORDER BY price ASC';
        break;
      case 'price_desc':
        orderClause = 'ORDER BY price DESC';
        break;
      case 'rating':
        orderClause = 'ORDER BY avg_rating DESC';
        break;
      case 'reviews':
        orderClause = 'ORDER BY review_count DESC';
        break;
    }
    
    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) FROM tours ${whereClause}`,
      params
    );
    const total = Number(countResult.rows[0].count);
    
    // Get tours
    params.push(l, offset);
    const result = await query(
      `SELECT id, name, destination, price, duration, avg_rating, 
              review_count, image_url, season
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
    
    // Try cache first
    const cacheKey = `tour:${id}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }
    
    // Get tour
    const result = await query(
      `SELECT id, name, destination, price, duration, description,
              avg_rating, review_count, source, source_url, image_url, season
       FROM tours WHERE id = $1`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tour not found' });
    }
    
    const tour = result.rows[0];
    
    // Get tags
    const tagsResult = await query(
      'SELECT tag, weight FROM tour_tags WHERE tour_id = $1 ORDER BY weight DESC',
      [id]
    );
    tour.tags = tagsResult.rows;
    
    // Cache for 30 minutes
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
              review_count, image_url
       FROM tours
       ORDER BY avg_rating DESC, review_count DESC
       LIMIT 10`
    );
    
    cache.set(cacheKey, result.rows, 3600); // 1 hour
    
    res.json(result.rows);
  } catch (error) {
    console.error('Get popular tours error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const searchTours = async (req: Request, res: Response) => {
  try {
    const { q, ...filters } = req.query;
    
    // Use cache for search results
    const cacheKey = `search:${q}:${JSON.stringify(filters)}`;
    const cached = cache.get(cacheKey);
    
    if (cached) {
      return res.json(cached);
    }
    
    // Build query
    const { offset, limit } = paginate(1, 20);
    let whereConditions: string[] = [];
    let params: unknown[] = [];
    let paramIndex = 1;
    
    if (q) {
      whereConditions.push(`(name ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`);
      params.push(`%${q}%`);
      paramIndex++;
    }
    
    Object.entries(filters).forEach(([key, value]) => {
      if (value) {
        if (key === 'minPrice') {
          whereConditions.push(`price >= $${paramIndex++}`);
          params.push(Number(value));
        } else if (key === 'maxPrice') {
          whereConditions.push(`price <= $${paramIndex++}`);
          params.push(Number(value));
        } else {
          whereConditions.push(`${key} = $${paramIndex++}`);
          params.push(value);
        }
      }
    });
    
    const whereClause = whereConditions.length > 0 
      ? 'WHERE ' + whereConditions.join(' AND ')
      : '';
    
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
    
    const response = result.rows;
    
    // Cache for 15 minutes
    cache.set(cacheKey, response, 900);
    
    res.json(response);
  } catch (error) {
    console.error('Search tours error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
