import { Request, Response } from 'express';
import { query } from '../db/index.js';
import { authMiddleware, AuthRequest } from '../controllers/auth.js';

export const addFavorite = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { tour_id } = req.body;

    if (!tour_id || Number.isNaN(Number(tour_id))) {
      return res.status(400).json({ error: 'tour_id is required' });
    }

    const tourIdNum = Number(tour_id);

    // Verify tour exists
    const tourCheck = await query('SELECT id FROM tours WHERE id = $1', [tourIdNum]);
    if (tourCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Tour not found' });
    }

    const result = await query(
      `INSERT INTO favorites (user_id, tour_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, tour_id) DO NOTHING
       RETURNING id, tour_id, created_at`,
      [userId, tourIdNum]
    );

    if (result.rows.length === 0) {
      return res.json({ success: true, message: 'Tour already in favorites', alreadyExists: true });
    }

    // Log save action so the recommender learns from it
    await query(
      `INSERT INTO user_actions (user_id, tour_id, action_type)
       VALUES ($1, $2, 'save')`,
      [userId, tourIdNum]
    );

    // Best-effort: ask ai-service to update profile from this save action
    try {
      const axios = (await import('axios')).default;
      const aiUrl = process.env.AI_SERVICE_URL || 'http://localhost:8000';
      const aiKey = process.env.AI_SERVICE_API_KEY || 'internal-api-key-for-web-service';
      await axios.post(
        `${aiUrl}/ai/update-profile`,
        { user_id: userId, action_type: 'save', tour_id: tourIdNum },
        { headers: { 'X-API-Key': aiKey }, timeout: 5000 }
      );
    } catch {
      // swallow - recommendation will catch up next time
    }

    res.status(201).json({ success: true, favorite: result.rows[0] });
  } catch (error) {
    console.error('Add favorite error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const removeFavorite = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { tour_id } = req.params;

    const tourIdNum = Number(tour_id);
    if (Number.isNaN(tourIdNum)) {
      return res.status(400).json({ error: 'Invalid tour_id' });
    }

    const result = await query(
      'DELETE FROM favorites WHERE user_id = $1 AND tour_id = $2 RETURNING id',
      [userId, tourIdNum]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Favorite not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Remove favorite error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getFavorites = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { page = '1', limit = '20' } = req.query;
    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(50, Math.max(1, Number(limit)));
    const offset = (pageNum - 1) * limitNum;

    const countResult = await query(
      'SELECT COUNT(*) FROM favorites WHERE user_id = $1',
      [userId]
    );
    const total = Number(countResult.rows[0].count);

    const result = await query(
      `SELECT t.id, t.name, t.destination, t.price, t.duration,
              t.avg_rating, t.review_count, t.image_url, t.season,
              f.created_at as favorited_at
       FROM favorites f
       JOIN tours t ON f.tour_id = t.id
       WHERE f.user_id = $1
       ORDER BY f.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limitNum, offset]
    );

    res.json({
      data: result.rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('Get favorites error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const checkFavorite = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { tour_id } = req.params;
    const tourIdNum = Number(tour_id);
    if (Number.isNaN(tourIdNum)) {
      return res.status(400).json({ error: 'Invalid tour_id' });
    }

    const result = await query(
      'SELECT id FROM favorites WHERE user_id = $1 AND tour_id = $2',
      [userId, tourIdNum]
    );

    res.json({ isFavorite: result.rows.length > 0 });
  } catch (error) {
    console.error('Check favorite error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
