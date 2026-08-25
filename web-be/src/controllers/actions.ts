import { Request, Response } from 'express';
import axios from 'axios';
import { query } from '../db/index.js';
import { authMiddleware, AuthRequest } from '../controllers/auth.js';

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';
const AI_SERVICE_API_KEY = process.env.AI_SERVICE_API_KEY || 'internal-api-key-for-web-service';

const VIETNAMESE_ACCENTED_CHARS = '\u00e0\u00e1\u1ea1\u1ea3\u00e3\u00e2\u1ea7\u1ea5\u1ead\u1ea9\u1eab\u0103\u1eb1\u1eaf\u1eb7\u1eb3\u1eb5\u00e8\u00e9\u1eb9\u1ebb\u1ebd\u00ea\u1ec1\u1ebf\u1ec7\u1ec3\u1ec5\u00ec\u00ed\u1ecb\u1ec9\u0129\u00f2\u00f3\u1ecd\u1ecf\u00f5\u00f4\u1ed3\u1ed1\u1ed9\u1ed5\u1ed7\u01a1\u1edd\u1edb\u1ee3\u1edf\u1ee1\u00f9\u00fa\u1ee5\u1ee7\u0169\u01b0\u1eeb\u1ee9\u1ef1\u1eed\u1eef\u1ef3\u00fd\u1ef5\u1ef7\u1ef9\u0111';
const VIETNAMESE_PLAIN_CHARS = 'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd';

const normalizeSearchText = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\u0111/g, 'd')
  .replace(/\u0110/g, 'd')
  .toLowerCase()
  .trim();

const normalizedSql = (column: string) =>
  `translate(lower(coalesce(${column}, '')), '${VIETNAMESE_ACCENTED_CHARS}', '${VIETNAMESE_PLAIN_CHARS}')`;
const updateProfile = async (userId: number, actionType: string, tourId: number) => {
  await axios.post(
    `${AI_SERVICE_URL}/ai/update-profile`,
    {
      user_id: userId,
      action_type: actionType,
      tour_id: tourId,
    },
    {
      headers: {
        'X-API-Key': AI_SERVICE_API_KEY,
      },
      timeout: 5000,
    }
  );
};

const learnFromSearch = async (userId: number, searchQuery: string) => {
  const normalized = normalizeSearchText(searchQuery);
  if (!normalized) return;

  const matches = await query(
    `SELECT id
     FROM tours
     WHERE ${normalizedSql('destination')} LIKE $1 OR ${normalizedSql('name')} LIKE $1
     ORDER BY avg_rating DESC, review_count DESC
     LIMIT 3`,
    [`%${normalized}%`]
  );

  await Promise.all(
    matches.rows.map((row) => updateProfile(userId, 'search', Number(row.id)))
  );
};

export const logAction = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { tour_id, action_type, search_query } = req.body;
    
    const validActions = ['click', 'view', 'save', 'search'];
    if (!validActions.includes(action_type)) {
      return res.status(400).json({ error: 'Invalid action type' });
    }
    
    await query(
      `INSERT INTO user_actions (user_id, tour_id, action_type, search_query)
       VALUES ($1, $2, $3, $4)`,
      [userId, tour_id || null, action_type, search_query || null]
    );
    
    try {
      if ((action_type === 'save' || action_type === 'click') && tour_id) {
        await updateProfile(userId, action_type, Number(tour_id));
      } else if (action_type === 'search' && search_query) {
        await learnFromSearch(userId, search_query);
      }
    } catch (aiError) {
      console.error('Failed to update profile:', aiError);
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Log action error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getActionHistory = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { page = '1', limit = '20' } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    
    const result = await query(
      `SELECT ua.id, ua.action_type, ua.created_at,
              t.id as tour_id, t.name as tour_name, t.destination
       FROM user_actions ua
       LEFT JOIN tours t ON ua.tour_id = t.id
       WHERE ua.user_id = $1
       ORDER BY ua.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, Number(limit), offset]
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('Get action history error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
