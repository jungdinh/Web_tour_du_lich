import { Request, Response } from 'express';
import axios from 'axios';
import { query } from '../db/index.js';
import { authMiddleware, AuthRequest } from '../controllers/auth.js';

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';
const AI_SERVICE_API_KEY = process.env.AI_SERVICE_API_KEY || 'internal-api-key-for-web-service';

export const logAction = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { tour_id, action_type, search_query } = req.body;
    
    // Validate action type
    const validActions = ['click', 'view', 'save', 'search'];
    if (!validActions.includes(action_type)) {
      return res.status(400).json({ error: 'Invalid action type' });
    }
    
    // Log action to database
    await query(
      `INSERT INTO user_actions (user_id, tour_id, action_type, search_query)
       VALUES ($1, $2, $3, $4)`,
      [userId, tour_id || null, action_type, search_query || null]
    );
    
    // If it's a save action or view action, update user profile via AI Service
    if ((action_type === 'save' || action_type === 'view') && tour_id) {
      // Get tour tags
      const tagsResult = await query(
        'SELECT tag, weight FROM tour_tags WHERE tour_id = $1',
        [tour_id]
      );
      
      if (tagsResult.rows.length > 0) {
        try {
          await axios.post(
            `${AI_SERVICE_URL}/ai/update-profile`,
            {
              user_id: userId,
              action_type,
              tour_id: tour_id,
            },
            {
              headers: {
                'X-API-Key': AI_SERVICE_API_KEY,
              },
            }
          );
        } catch (aiError) {
          // Don't fail the request if AI service is down
          console.error('Failed to update profile:', aiError);
        }
      }
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
